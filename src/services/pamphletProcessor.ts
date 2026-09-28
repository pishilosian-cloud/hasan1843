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
        const overlapSlice = currentBuffer.slice(-overlap);
        currentBuffer = overlapSlice + '\n' + trimmedPara;
      } else {
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

// Job Checkpoint Persistence
function getJobFilePath(fileId: string): string {
  return path.join(JOBS_DIR, `${fileId}.json`);
}

export function saveJobCheckpoint(job: ProcessingJob): void {
  ensureDirectories();
  job.updatedAt = new Date().toISOString();
  try {
    fs.writeFileSync(getJobFilePath(job.fileId), JSON.stringify(job, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to save job checkpoint:', err);
  }
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
  try {
    fs.writeFileSync(p, JSON.stringify(chunks, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to save chunks:', err);
  }
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
          const filtered = fileChunks.filter((c) => c.roomId === roomId);
          chunks.push(...filtered);
        } catch {}
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
    try { fs.unlinkSync(p); } catch {}
  }
  const jobPath = getJobFilePath(fileId);
  if (fs.existsSync(jobPath)) {
    try { fs.unlinkSync(jobPath); } catch {}
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
        const result = await this.processPdf(job, allChunks, onProgress);
        totalPages = result.totalPages;
        allChunks = result.chunks;
      } else if (ext === '.docx' || ext === '.doc') {
        const result = await this.processDocx(job, onProgress);
        totalPages = result.totalPages;
        allChunks = result.chunks;
      } else {
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
   * High-Speed PDF processor: extracts Persian, Arabic & English digital text
   * Uses CMaps and standard font mappings for 100% accurate Persian character glyphs.
   */
  private async processPdf(
    job: ProcessingJob,
    existingChunks: PamphletChunk[],
    onProgress?: ProgressCallback
  ): Promise<{ totalPages: number; chunks: PamphletChunk[] }> {
    const fileBytes = fs.readFileSync(job.filePath);
    const uint8Array = new Uint8Array(fileBytes);

    const cMapUrl = path.join(process.cwd(), 'node_modules/pdfjs-dist/cmaps/');
    const standardFontDataUrl = path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/');

    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      cMapUrl: cMapUrl.endsWith('/') ? cMapUrl : cMapUrl + '/',
      cMapPacked: true,
      standardFontDataUrl: standardFontDataUrl.endsWith('/') ? standardFontDataUrl : standardFontDataUrl + '/',
      useSystemFonts: true,
      disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    const totalPages = doc.numPages || 1;
    job.totalPages = totalPages;

    const processedPageSet = new Set(existingChunks.map((c) => c.pageNumber));
    let currentProcessedCount = processedPageSet.size;
    const chunks = [...existingChunks];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (processedPageSet.has(pageNum)) {
        continue;
      }

      try {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();

        let pageText = '';
        let lastY: number | null = null;

        for (const item of textContent.items as any[]) {
          if ('str' in item && typeof item.str === 'string') {
            const str = item.str.trim();
            if (str.length > 0) {
              if (lastY !== null && Math.abs(item.transform[5] - lastY) > 6) {
                pageText += '\n' + item.str;
              } else {
                pageText += (pageText.endsWith(' ') || pageText.endsWith('\n') || !pageText ? '' : ' ') + item.str;
              }
              lastY = item.transform[5];
            }
          }
        }

        pageText = pageText.trim();

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
        currentProcessedCount++;
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

    const pageSize = 1800;
    const pages: string[] = [];
    let start = 0;
    while (start < fullText.length) {
      pages.push(fullText.slice(start, start + pageSize));
      start += pageSize;
    }

    const totalPages = pages.length || 1;
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

    const totalPages = pages.length || 1;
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
   * Semantic BM25-like search across room's pamphlet chunks
   */
  public searchRelevantChunks(
    roomId: string,
    query: string,
    topK = 8
  ): { chunk: PamphletChunk; score: number }[] {
    const allChunks = loadAllChunksForRoom(roomId);
    if (allChunks.length === 0) return [];

    const explicitPage = extractPageNumberFromQuery(query);
    const queryTokens = tokenize(query);

    if (queryTokens.length === 0 && !explicitPage) {
      return allChunks.slice(0, topK).map((chunk) => ({ chunk, score: 1 }));
    }

    const scored = allChunks.map((chunk) => {
      let score = 0;
      const chunkNorm = normalizeText(chunk.text).toLowerCase();

      if (explicitPage && chunk.pageNumber === explicitPage) {
        score += 25.0;
      }

      for (const token of queryTokens) {
        const reg = new RegExp(`\\b${token}\\b`, 'g');
        const match = chunkNorm.match(reg);
        if (match) {
          score += match.length * 3.0;
        } else if (chunkNorm.includes(token)) {
          score += 1.2;
        }
      }

      return { chunk, score };
    });

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Resume pending or interrupted jobs across all rooms
   */
  public resumePendingJobs(onProgress?: ProgressCallback): void {
    if (!fs.existsSync(JOBS_DIR)) return;
    try {
      const files = fs.readdirSync(JOBS_DIR);
      for (const f of files) {
        if (f.endsWith('.json')) {
          const jobPath = path.join(JOBS_DIR, f);
          try {
            const job: ProcessingJob = JSON.parse(fs.readFileSync(jobPath, 'utf-8'));
            if (job.status === 'processing' && fs.existsSync(job.filePath)) {
              console.log(`[Auto-Resume] Resuming processing job ${job.fileId} (${job.fileName})`);
              this.processDocument(job, onProgress).catch((e) => {
                console.warn(`[Auto-Resume] Job ${job.fileId} error:`, e);
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      console.warn('Failed to resume jobs:', err);
    }
  }
}

export const pamphletProcessor = new PamphletProcessor();
