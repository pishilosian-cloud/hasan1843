import { chatService } from './chatService';

export interface VoiceSignalPayload {
  type: 'offer' | 'answer' | 'candidate';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

type AudioLevelListener = (level: number) => void;
type SpeakingListener = (isSpeaking: boolean) => void;
type RemoteStreamListener = (userId: string, stream: MediaStream) => void;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

class WebRTCVoiceService {
  private localStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  // Peer connections map: userId -> RTCPeerConnection
  private peers: Map<string, RTCPeerConnection> = new Map();
  // Remote audio elements map: userId -> HTMLAudioElement
  private audioElements: Map<string, HTMLAudioElement> = new Map();

  private isMuted: boolean = false;
  private isSpeaking: boolean = false;
  private roomId: string | null = null;
  private currentUserId: string | null = null;
  private currentUserName: string | null = null;

  private audioLevelListeners = new Set<AudioLevelListener>();
  private speakingListeners = new Set<SpeakingListener>();
  private remoteStreamListeners = new Set<RemoteStreamListener>();

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      Boolean(navigator?.mediaDevices?.getUserMedia) &&
      Boolean(window.RTCPeerConnection)
    );
  }

  public async startVoice(
    roomId: string,
    userId: string,
    userName: string,
    avatarBg?: string
  ): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error('مرورگر شما از قابلیت وب‌کم یا ویس‌چت پشتیبانی نمی‌کند.');
    }

    this.roomId = roomId;
    this.currentUserId = userId;
    this.currentUserName = userName;

    try {
      // 1. Get User Media Microphone Audio Stream
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // 2. Setup Audio Visualizer / Level Detector
      this.setupAudioAnalyser(this.localStream);

      // 3. Notify chat service / server that user joined voice room
      chatService.joinVoiceRoom({
        id: userId,
        name: userName,
        avatarBg,
        isMuted: this.isMuted,
      });

      return true;
    } catch (err: any) {
      console.error('[WebRTC] Failed to get user audio:', err);
      this.cleanup();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('دسترسی به میکروفون توسط کاربر یا مرورگر مجاز نشد.');
      }
      throw new Error('خطا در دسترسی به میکروفون.');
    }
  }

  public stopVoice(): void {
    if (this.roomId && this.currentUserId) {
      chatService.leaveVoiceRoom(this.currentUserId);
    }
    this.cleanup();
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted;
      });
    }

    if (this.roomId && this.currentUserId) {
      chatService.sendVoiceMute(this.currentUserId, this.isMuted);
    }

    if (this.isMuted && this.isSpeaking) {
      this.isSpeaking = false;
      this.speakingListeners.forEach((fn) => fn(false));
      if (this.roomId && this.currentUserId) {
        chatService.sendVoiceSpeaking(this.currentUserId, false);
      }
    }

    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Initiate outgoing WebRTC call to a newly joined peer
   */
  public async callPeer(remoteUserId: string): Promise<void> {
    if (!this.localStream || !this.roomId || !this.currentUserId) return;
    if (remoteUserId === this.currentUserId) return;

    try {
      const pc = this.createPeerConnection(remoteUserId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      chatService.sendVoiceSignal(remoteUserId, this.currentUserId, this.currentUserName || 'کاربر', {
        type: 'offer',
        sdp: offer,
      });
    } catch (err) {
      console.error(`[WebRTC] Failed to call peer ${remoteUserId}:`, err);
    }
  }

  /**
   * Handle incoming WebRTC signaling message
   */
  public async handleSignal(
    senderId: string,
    senderName: string,
    signal: VoiceSignalPayload
  ): Promise<void> {
    if (!this.localStream || !this.roomId || !this.currentUserId) return;
    if (senderId === this.currentUserId) return;

    try {
      let pc = this.peers.get(senderId);

      if (signal.type === 'offer' && signal.sdp) {
        if (!pc) {
          pc = this.createPeerConnection(senderId);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        chatService.sendVoiceSignal(senderId, this.currentUserId, this.currentUserName || 'کاربر', {
          type: 'answer',
          sdp: answer,
        });
      } else if (signal.type === 'answer' && signal.sdp) {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('[WebRTC] Error adding ICE candidate:', e);
          }
        }
      }
    } catch (err) {
      console.error(`[WebRTC] Error handling signal from ${senderId}:`, err);
    }
  }

  public removePeer(remoteUserId: string): void {
    const pc = this.peers.get(remoteUserId);
    if (pc) {
      pc.close();
      this.peers.delete(remoteUserId);
    }

    const audioEl = this.audioElements.get(remoteUserId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
      this.audioElements.delete(remoteUserId);
    }
  }

  private createPeerConnection(remoteUserId: string): RTCPeerConnection {
    // Close existing connection if any
    this.removePeer(remoteUserId);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peers.set(remoteUserId, pc);

    // Add local audio tracks to peer
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Send ICE candidates to remote peer via WebSocket signaling
    pc.onicecandidate = (event) => {
      if (event.candidate && this.roomId && this.currentUserId) {
        chatService.sendVoiceSignal(remoteUserId, this.currentUserId, this.currentUserName || 'کاربر', {
          type: 'candidate',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // On remote audio stream received -> play it via HTMLAudioElement
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.playRemoteAudio(remoteUserId, remoteStream);
        this.remoteStreamListeners.forEach((fn) => fn(remoteUserId, remoteStream));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(remoteUserId);
      }
    };

    return pc;
  }

  private playRemoteAudio(userId: string, stream: MediaStream): void {
    let audioEl = this.audioElements.get(userId);
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.autoplay = true;
      (audioEl as any).playsInline = true;
      audioEl.id = `remote-audio-${userId}`;
      document.body.appendChild(audioEl);
      this.audioElements.set(userId, audioEl);
    }
    audioEl.srcObject = stream;
    audioEl.play().catch((err) => {
      console.warn('[WebRTC] Autoplay audio error:', err);
    });
  }

  private setupAudioAnalyser(stream: MediaStream): void {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioContext = new AudioContextClass();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;

      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let speakingCounter = 0;

      const checkVolume = () => {
        if (!this.analyser) return;

        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalizedLevel = Math.min(100, Math.round((average / 128) * 100));

        this.audioLevelListeners.forEach((fn) => fn(normalizedLevel));

        // Speech detection threshold (ignore when muted)
        const isSpeakingNow = !this.isMuted && normalizedLevel > 18;

        if (isSpeakingNow) {
          speakingCounter = 6; // hold speaking state for a few frames
        } else if (speakingCounter > 0) {
          speakingCounter--;
        }

        const effectiveSpeaking = speakingCounter > 0;
        if (effectiveSpeaking !== this.isSpeaking) {
          this.isSpeaking = effectiveSpeaking;
          this.speakingListeners.forEach((fn) => fn(effectiveSpeaking));

          if (this.roomId && this.currentUserId) {
            chatService.sendVoiceSpeaking(this.currentUserId, effectiveSpeaking);
          }
        }

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      this.animFrameId = requestAnimationFrame(checkVolume);
    } catch (e) {
      console.warn('[WebRTC] Audio analyser not available:', e);
    }
  }

  private cleanup(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;

    // Close and remove all peer connections
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();

    // Remove all remote audio elements
    this.audioElements.forEach((audioEl) => {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
    });
    this.audioElements.clear();

    this.isSpeaking = false;
    this.speakingListeners.forEach((fn) => fn(false));
    this.audioLevelListeners.forEach((fn) => fn(0));

    this.roomId = null;
    this.currentUserId = null;
  }

  public onAudioLevel(fn: AudioLevelListener) {
    this.audioLevelListeners.add(fn);
    return () => this.audioLevelListeners.delete(fn);
  }

  public onSpeakingChange(fn: SpeakingListener) {
    this.speakingListeners.add(fn);
    return () => this.speakingListeners.delete(fn);
  }

  public onRemoteStream(fn: RemoteStreamListener) {
    this.remoteStreamListeners.add(fn);
    return () => this.remoteStreamListeners.delete(fn);
  }
}

export const webrtcVoiceService = new WebRTCVoiceService();
