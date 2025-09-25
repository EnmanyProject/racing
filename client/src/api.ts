import { io, Socket } from 'socket.io-client';
import type { Store } from './store';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? inferSocketUrl();
const LOCAL_STORAGE_KEY = 'gecko-sprint-player-id';

let audioCtx: AudioContext | null = null;

function inferSocketUrl(): string {
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000`;
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

function playClick() {
  const ctx = ensureContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(540, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}

function playFanfare() {
  const ctx = ensureContext();
  if (!ctx) return;
  const now = ctx.currentTime + 0.05;
  const pitches = [392, 523.25, 659.25];
  pitches.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = index === 0 ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25 / (index + 1), now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.2);
  });
}

export interface ApiActions {
  selectLizard(id: string): void;
  sendBoost(id: string): void;
  updateNickname(name: string): void;
}

export function createApi(store: Store): ApiActions {
  const storedId = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_STORAGE_KEY) ?? undefined : undefined;
  let lastPhase: string | null = null;

  const socket: Socket = io(SOCKET_URL, {
    autoConnect: true,
    transports: ['websocket'],
    auth: storedId ? { playerId: storedId } : undefined
  });

  socket.on('connect', () => {
    store.setConnection('connected');
  });

  socket.on('disconnect', () => {
    store.setConnection('disconnected');
  });

  socket.on('connect_error', () => {
    store.setConnection('disconnected');
  });

  socket.on('welcome', (payload: { id: string; nickname: string; selectionId?: string }) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, payload.id);
    }
    store.setSelf(payload);
  });

  socket.on('state', (payload) => {
    const nextPhase = payload.snapshot?.phase;
    if (nextPhase && lastPhase && lastPhase !== 'RESULTS' && nextPhase === 'RESULTS') {
      playFanfare();
    }
    if (nextPhase) {
      lastPhase = nextPhase;
    }
    store.updateFromServer(payload.snapshot, payload.lobby);
  });

  socket.on('raceProgress', (payload: { progress: number[]; isSlowMo: boolean }) => {
    store.updateProgress(payload.progress, payload.isSlowMo);
  });

  socket.on('boost:result', (result: { applied: boolean; reason?: string }) => {
    if (!result.applied && result.reason) {
      let tone: 'info' | 'warning' | 'error' = 'info';
      let message = 'Boost not accepted.';
      if (result.reason === 'rate_limited') {
        tone = 'warning';
        message = 'Cooling down. Try again in a moment.';
      } else if (result.reason === 'invalid_phase') {
        tone = 'info';
        message = 'This phase cannot accept boosts.';
      } else if (result.reason === 'invalid_lizard') {
        tone = 'error';
        message = 'Selected gecko was not found.';
      }
      store.showToast({ message, tone });
      window.setTimeout(() => store.clearToast(), 2300);
    } else if (result.applied) {
      playClick();
      store.showToast({ message: 'Boost sent!', tone: 'success' });
      window.setTimeout(() => store.clearToast(), 1600);
    }
  });

  return {
    selectLizard(id: string) {
      store.setSelection(id);
      socket.emit('player:select', { lizardId: id });
    },
    sendBoost(id: string) {
      socket.emit('boost', { lizardId: id });
    },
    updateNickname(name: string) {
      socket.emit('player:update', { nickname: name });
    }
  };
}

