import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import type { PamphletChunk, PamphletFile } from '../types';
import { GoogleGenAI } from '@google/genai';

export interface ProcessingJob {
  fileId: string;
  roomId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  totalPages: number;
  processedPages: number;
  status: 'processing' | 'ready' | 'error';
  error?: string;
  totalChunks?: number;
  createdAt: string;
  updatedAt: string;
}

export type ProgressCallback = (progress: {
  fileId: string;
  roomId: string;
  fileName: string;
  status: 'processing' | 'ready' | 'error';
  current: number;
  total: number;
  percent: number;
  error?: string;
}) => void;

const DATA_DIR = path.resolve(process.cwd(), '.data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const CHUNKS_DIR = path.join(DATA_DIR, 'chunks');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');

// Ensure directories exist
function ensureDirectories() {
  for (const dir of [DATA_DIR, UPLOADS_DIR, CHUNKS_DIR, JOBS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
ensureDirectories();

// Persian & English normalizer
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width spaces
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[۰]/g, '0')
    .replace(/[۱]/g, '1')
    .replace(/[۲]/g, '2')
    .replace(/[۳]/g, '3')
    .replace(/[۴]/g, '4')
    .replace(/[۵]/g, '5')
    .replace(/[۶]/g, '6')
    .replace(/[۷]/g, '7')
    .replace(/[۸]/g, '8')
    .replace(/[۹]/g, '9')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ');
}

// Convert numbers in string to english
export function extractPageNumberFromQuery(query: string): number | null {
  const normalized = normalizeText(query);
  const match = normalized.match(/(?:صفحه|ص|page|p\.?)\s*(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

// Persian stopwords
const STOP_WORDS = new Set([
  'و', 'در', 'به', 'از', 'که', 'این', 'را', 'با', 'است', 'برای', 'آن', 'یک', 'شود', 'خود',
  'تا', 'کرد', 'بر', 'هم', 'نیز', 'گفت', 'می', 'شد', 'ایشان', 'او', 'ما', 'شما', 'آنها',
  'چیست', 'کیست', 'کدام', 'چگونه', 'چرا', 'چه', 'توضیح', 'بده', 'کن', 'درباره', 'مورد',
  'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of', 'with', 'about'
]);

// Tokenizer for Persian and English
export function tokenize(text: string): string[] {
  const norm = normalizeText(text).toLowerCase();
  const words = norm
    .split(/[\s,،؛.:;!؟?()\[\]{}"'«»\/\\+\-=*&^%$#@~`_]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return words;
}

// Split page text into overlapping chunks
export function chunkPageText(
  pageText: string,
  metadata: {
    roomId: string;
    fileId: string;
    fileName: string;
    pageNumber: number;
  },
  chunkSize = 650,
  overlap = 120
): PamphletChunk[] {
  const clean = pageText.trim();
  if (!clean) return [];

  const chunks: PamphletChunk[] = [];
  let chunkIndex = 0;

  // If page text is within reasonable size, keep as single chunk
  if (clean.length <= chunkSize + 150) {
    chunks.push({
      id: `${metadata.fileId}-p${metadata.pageNumber}-c0`,
      roomId: metadata.roomId,
      fileId: metadata.fileId,
      fileName: metadata.fileName,
      pageNumber: metadata.pageNumber,
      chunkIndex: 0,
      text: clean,
      tokenCount: Math.ceil(clean.length / 4),
    });
    return chunks;
  }

  // Split by paragraphs first
  const paragraphs = clean.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  let currentBuffer = '';

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (currentBuffer.length + trimmedPara.length + 1 <= chunkSize) {
      currentBuffer += (currentBuffer ? '\n\n' : '') + trimmedPara;
    } else {
      if (currentBuffer) {
        chunks.push({
          id: `${metadata.fileId}-p${metadata.pageNumber}-c${chunkIndex++}`,
          roomId: metadata.roomId,
          fileId: metadata.fileId,
          fileName: metadata.fileName,
          pageNumber: metadata.pageNumber,
          chunkIndex: chunkIndex - 1,
          text: currentBuffer.trim(),
          tokenCount: Math.ceil(currentBuffer.length / 4),
        });
        // Keep overlap from end of current buffer
        const overlapSlice = currentBuffer.slice(-overlap);
        currentBuffer = overlapSlice + '\n' + trimmedPara;
      } else {
        // Single paragraph larger than chunkSize -> split by sentences
        let start = 0;
        while (start < trimmedPara.length) {
          const end = Math.min(start + chunkSize, trimmedPara.length);
          const slice = trimmedPara.slice(start, end).trim();
          if (slice) {
            chunks.push({
              id: `${metadata.fileId}-p${metadata.pageNumber}-c${chunkIndex++}`,
              roomId: metadata.roomId,
              fileId: metadata.fileId,
              fileName: metadata.fileName,
              pageNumber: metadata.pageNumber,
              chunkIndex: chunkIndex - 1,
              text: slice,
              tokenCount: Math.ceil(slice.length / 4),
            });
          }
          start += chunkSize - overlap;
        }
        currentBuffer = '';
      }
    }
  }

  if (currentBuffer.trim()) {
    chunks.push({
      id: `${metadata.fileId}-p${metadata.pageNumber}-c${chunkIndex++}`,
      roomId: metadata.roomId,
      fileId: metadata.fileId,
      fileName: metadata.fileName,
      pageNumber: metadata.pageNumber,
      chunkIndex: chunkIndex - 1,
      text: currentBuffer.trim(),
      tokenCount: Math.ceil(currentBuffer.length / 4),
    });
  }

  return chunks;
}

// OCR Fallback helper using Backend Gemini Vision if available
async function performOCROnPageFallback(
  pdfBuffer: Buffer,
  pageNum: number,
  aiClient: GoogleGenAI | null
): Promise<string> {
  if (!aiClient) return '';

  try {
    // When a page has no text (scanned PDF), call Gemini 3.8 / Flash
    // with PDF bytes or page reference to transcribe Persian/English text.
    const base64Data = pdfBuffer.toString('base64');
    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Data,
          },
        },
        {
          text: `لطفاً صفحه ${pageNum} این فایل را به دقت بازخوانی و استخراج کن (OCR). تمامی متن‌های فارسی، انگلیسی و فرمول‌های موجود در صفحه ${pageNum} را بدون کم و کاست استخراج کن. اگر متن خاصی در صفحه نیست فقط بنویس «صفحه بدون متن».`,
        },
      ],
    });

    const ocrText = response.text?.trim() || '';
    if (ocrText && !ocrText.includes('صفحه بدون متن')) {
      return `[متن بازخوانی شده با OCR - صفحه ${pageNum}]\n${ocrText}`;
    }
  } catch (err) {
    console.warn(`[OCR Fallback] Page ${pageNum} OCR attempt note:`, err instanceof Error ? err.message : err);
  }
  return '';
}

// Job Checkpoint Persistence
function getJobFilePath(fileId: string): string {
  return path.join(JOBS_DIR, `${fileId}.json`);
}

export function saveJobCheckpoint(job: ProcessingJob): void {
  ensureDirectories();
  job.updatedAt = new Date().toISOString();
  fs.writeFileSync(getJobFilePath(job.fileId), JSON.stringify(job, null, 2), 'utf-8');
}

export function getJob(fileId: string): ProcessingJob | null {
  const p = getJobFilePath(fileId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

// Chunks Persistence per Room and File
function getChunksFilePath(roomId: string, fileId: string): string {
  const roomDir = path.join(CHUNKS_DIR, roomId);
  if (!fs.existsSync(roomDir)) {
    fs.mkdirSync(roomDir, { recursive: true });
  }
  return path.join(roomDir, `${fileId}.json`);
}

export function saveChunks(roomId: string, fileId: string, chunks: PamphletChunk[]): void {
  const p = getChunksFilePath(roomId, fileId);
  fs.writeFileSync(p, JSON.stringify(chunks, null, 2), 'utf-8');
}

export function loadChunksForFile(roomId: string, fileId: string): PamphletChunk[] {
  const p = getChunksFilePath(roomId, fileId);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return [];
  }
}

export function loadAllChunksForRoom(roomId: string): PamphletChunk[] {
  const roomDir = path.join(CHUNKS_DIR, roomId);
  if (!fs.existsSync(roomDir)) return [];

  const chunks: PamphletChunk[] = [];
  try {
    const files = fs.readdirSync(roomDir);
    for (const f of files) {
      if (f.endsWith('.json')) {
        const fullPath = path.join(roomDir, f);
        try {
          const fileChunks: PamphletChunk[] = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          // Strict room isolation check
          const filtered = fileChunks.filter((c) => c.roomId === roomId);
          chunks.push(...filtered);
        } catch {
          // ignore corrupted chunk file
        }
      }
    }
  } catch (err) {
    console.error(`Failed to load chunks for room ${roomId}:`, err);
  }
  return chunks;
}

export function deleteChunksForFile(roomId: string, fileId: string): void {
  const p = getChunksFilePath(roomId, fileId);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
  const jobPath = getJobFilePath(fileId);
  if (fs.existsSync(jobPath)) {
    try {
      fs.unlinkSync(jobPath);
    } catch {}
  }
}

/**
 * Main Processor Class for Multi-page Documents (PDF, DOCX, TXT)
 */
export class PamphletProcessor {
  private activeJobs = new Map<string, boolean>();

  public getUploadPath(roomId: string, fileId: string, originalName: string): string {
    const roomUploads = path.join(UPLOADS_DIR, roomId);
    if (!fs.existsSync(roomUploads)) {
      fs.mkdirSync(roomUploads, { recursive: true });
    }
    const safeExt = path.extname(originalName) || '';
    return path.join(roomUploads, `${fileId}${safeExt}`);
  }

  /**
   * Start or resume document processing in background with progress callbacks
   */
  public async processDocument(
    job: ProcessingJob,
    onProgress?: ProgressCallback,
    aiClient?: GoogleGenAI | null
  ): Promise<{ totalPages: number; totalChunks: number }> {
    if (this.activeJobs.get(job.fileId)) {
      return { totalPages: job.totalPages, totalChunks: job.totalChunks || 0 };
    }

    this.activeJobs.set(job.fileId, true);
    job.status = 'processing';
    saveJobCheckpoint(job);

    try {
      const ext = path.extname(job.fileName).toLowerCase();
      let totalPages = job.totalPages || 0;
      let allChunks = loadChunksForFile(job.roomId, job.fileId);

      if (ext === '.pdf') {
        const result = await this.processPdf(job, allChunks, onProgress, aiClient);
        totalPages = result.totalPages;
        allChunks = result.chunks;
      } else if (ext === '.docx' || ext === '.doc') {
        const result = await this.processDocx(job, onProgress);
        totalPages = result.totalPages;
        allChunks = result.chunks;
      } else {
        // Plain text
        const result = await this.processTxt(job, onProgress);
        totalPages = result.totalPages;
        allChunks = result.chunks;
      }

      job.status = 'ready';
      job.totalPages = totalPages;
      job.processedPages = totalPages;
      job.totalChunks = allChunks.length;
      saveJobCheckpoint(job);

      if (onProgress) {
        onProgress({
          fileId: job.fileId,
          roomId: job.roomId,
          fileName: job.fileName,
          status: 'ready',
          current: totalPages,
          total: totalPages,
          percent: 100,
        });
      }

      this.activeJobs.delete(job.fileId);
      return { totalPages, totalChunks: allChunks.length };
    } catch (err: unknown) {
      this.activeJobs.delete(job.fileId);
      const errMsg = err instanceof Error ? err.message : String(err);
      job.status = 'error';
      job.error = errMsg;
      saveJobCheckpoint(job);

      if (onProgress) {
        onProgress({
          fileId: job.fileId,
          roomId: job.roomId,
          fileName: job.fileName,
          status: 'error',
          current: job.processedPages,
          total: job.totalPages || 1,
          percent: 0,
          error: errMsg,
        });
      }
      throw err;
    }
  }

  /**
   * PDF processor: page-by-page extraction with resumability and OCR fallback
   */
  private async processPdf(
    job: ProcessingJob,
    existingChunks: PamphletChunk[],
    onProgress?: ProgressCallback,
    aiClient?: GoogleGenAI | null
  ): Promise<{ totalPages: number; chunks: PamphletChunk[] }> {
    const fileBytes = fs.readFileSync(job.filePath);
    const uint8Array = new Uint8Array(fileBytes);

    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    const totalPages = doc.numPages;
    job.totalPages = totalPages;

    // Resumability: determine start page from checkpoint
    const processedPageSet = new Set(existingChunks.map((c) => c.pageNumber));
    let currentProcessedCount = processedPageSet.size;

    const chunks = [...existingChunks];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // If page was already processed in previous run, skip!
      if (processedPageSet.has(pageNum)) {
        continue;
      }

      try {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();

        let pageText = textContent.items
          .map((item: any) => ('str' in item ? item.str : ''))
          .join(' ')
          .trim();

        // Check if page has no digital text -> OCR Fallback for scanned PDF
        if (pageText.length < 25) {
          const ocrText = await performOCROnPageFallback(fileBytes, pageNum, aiClient || null);
          if (ocrText) {
            pageText = ocrText;
          }
        }

        if (pageText) {
          const pageChunks = chunkPageText(pageText, {
            roomId: job.roomId,
            fileId: job.fileId,
            fileName: job.fileName,
            pageNumber: pageNum,
          });
          chunks.push(...pageChunks);
        }

        currentProcessedCount++;
        job.processedPages = currentProcessedCount;

        // Checkpoint every 5 pages or on completion to guarantee resumability
        if (pageNum % 5 === 0 || pageNum === totalPages) {
          saveChunks(job.roomId, job.fileId, chunks);
          saveJobCheckpoint(job);
        }

        if (onProgress) {
          const percent = Math.min(99, Math.round((currentProcessedCount / totalPages) * 100));
          onProgress({
            fileId: job.fileId,
            roomId: job.roomId,
            fileName: job.fileName,
            status: 'processing',
            current: currentProcessedCount,
            total: totalPages,
            percent,
          });
        }
      } catch (pageErr) {
        console.warn(`Error on PDF page ${pageNum} for ${job.fileName}:`, pageErr);
      }
    }

    saveChunks(job.roomId, job.fileId, chunks);
    return { totalPages, chunks };
  }

  /**
   * DOCX processor: extracts structured text preserving headings and paragraphs
   */
  private async processDocx(
    job: ProcessingJob,
    onProgress?: ProgressCallback
  ): Promise<{ totalPages: number; chunks: PamphletChunk[] }> {
    const rawResult = await mammoth.extractRawText({ path: job.filePath });
    const fullText = rawResult.value.trim();

    if (!fullText) {
      throw new Error('متنی در این فایل ورد پیدا نشد.');
    }

    // Pseudo-paginate into ~1800 character sections to keep page numbers
    const pageSize = 1800;
    const pages: string[] = [];
    let start = 0;
    while (start < fullText.length) {
      pages.push(fullText.slice(start, start + pageSize));
      start += pageSize;
    }

    const totalPages = pages.length;
    job.totalPages = totalPages;
    const chunks: PamphletChunk[] = [];

    for (let i = 0; i < pages.length; i++) {
      const pageNum = i + 1;
      const pageChunks = chunkPageText(pages[i], {
        roomId: job.roomId,
        fileId: job.fileId,
        fileName: job.fileName,
        pageNumber: pageNum,
      });
      chunks.push(...pageChunks);

      job.processedPages = pageNum;
      if (onProgress) {
        const percent = Math.round((pageNum / totalPages) * 100);
        onProgress({
          fileId: job.fileId,
          roomId: job.roomId,
          fileName: job.fileName,
          status: 'processing',
          current: pageNum,
          total: totalPages,
          percent,
        });
      }
    }

    saveChunks(job.roomId, job.fileId, chunks);
    return { totalPages, chunks };
  }

  /**
   * TXT processor: splits by line/character counts into distinct pages
   */
  private async processTxt(
    job: ProcessingJob,
    onProgress?: ProgressCallback
  ): Promise<{ totalPages: number; chunks: PamphletChunk[] }> {
    const fullText = fs.readFileSync(job.filePath, 'utf-8').trim();
    if (!fullText) {
      throw new Error('فایل متنی خالی است.');
    }

    const pageSize = 1500;
    const pages: string[] = [];
    let start = 0;
    while (start < fullText.length) {
      pages.push(fullText.slice(start, start + pageSize));
      start += pageSize;
    }

    const totalPages = pages.length;
    job.totalPages = totalPages;
    const chunks: PamphletChunk[] = [];

    for (let i = 0; i < pages.length; i++) {
      const pageNum = i + 1;
      const pageChunks = chunkPageText(pages[i], {
        roomId: job.roomId,
        fileId: job.fileId,
        fileName: job.fileName,
        pageNumber: pageNum,
      });
      chunks.push(...pageChunks);

      job.processedPages = pageNum;
      if (onProgress) {
        const percent = Math.round((pageNum / totalPages) * 100);
        onProgress({
          fileId: job.fileId,
          roomId: job.roomId,
          fileName: job.fileName,
          status: 'processing',
          current: pageNum,
          total: totalPages,
          percent,
        });
      }
    }

    saveChunks(job.roomId, job.fileId, chunks);
    return { totalPages, chunks };
  }

  /**
   * Resume any interrupted jobs from previous server restarts
   */
  public resumePendingJobs(onProgress?: ProgressCallback, aiClient?: GoogleGenAI | null): void {
    if (!fs.existsSync(JOBS_DIR)) return;
    try {
      const files = fs.readdirSync(JOBS_DIR);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const jobPath = path.join(JOBS_DIR, f);
        try {
          const job: ProcessingJob = JSON.parse(fs.readFileSync(jobPath, 'utf-8'));
          if (job.status === 'processing' && fs.existsSync(job.filePath)) {
            console.log(`[PamphletProcessor] Resuming interrupted job ${job.fileId} for room ${job.roomId} (processed ${job.processedPages}/${job.totalPages || '?'})`);
            this.processDocument(job, onProgress, aiClient).catch((err) => {
              console.error(`Failed to resume job ${job.fileId}:`, err);
            });
          }
        } catch {}
      }
    } catch (err) {
      console.error('Failed to check pending jobs:', err);
    }
  }

  /**
   * Search relevant chunks for a question with strict room isolation
   */
  public searchRelevantChunks(
    roomId: string,
    query: string,
    maxChunks = 6
  ): { chunk: PamphletChunk; score: number }[] {
    const allChunks = loadAllChunksForRoom(roomId);
    if (allChunks.length === 0) return [];

    const queryTokens = tokenize(query);
    const targetPage = extractPageNumberFromQuery(query);

    const scored = allChunks.map((chunk) => {
      let score = 0;
      const chunkNorm = normalizeText(chunk.text).toLowerCase();

      // Explicit Page boost
      if (targetPage !== null && chunk.pageNumber === targetPage) {
        score += 150;
      }

      // Exact substring match
      const queryNorm = normalizeText(query).toLowerCase();
      if (queryNorm.length > 4 && chunkNorm.includes(queryNorm)) {
        score += 80;
      }

      // Keyword token matches
      for (const token of queryTokens) {
        if (chunkNorm.includes(token)) {
          score += 10;
          // Count occurrences
          const occurrences = (chunkNorm.match(new RegExp(token, 'g')) || []).length;
          score += Math.min(occurrences * 3, 15);
        }
      }

      // File name match
      const fileNorm = normalizeText(chunk.fileName).toLowerCase();
      for (const token of queryTokens) {
        if (fileNorm.includes(token)) {
          score += 5;
        }
      }

      return { chunk, score };
    });

    // Filter chunks with positive relevance and sort descending
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks);
  }
}

export const pamphletProcessor = new PamphletProcessor();
