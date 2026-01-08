import { io, Socket } from 'socket.io-client';
import type { Store, PlayerWallet, PlayerRaceResult, SelfInfo } from './store';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? inferSocketUrl();
const LOCAL_STORAGE_KEY = 'gecko-sprint-player-id';

let audioCtx: AudioContext | null = null;
let audioInitialized = false;

function inferSocketUrl(): string {
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000`;
}

// 사용자 제스처 후 AudioContext 초기화
function initAudioOnGesture(): void {
  if (audioInitialized) return;

  const initAudio = () => {
    if (audioInitialized) return;
    audioInitialized = true;

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    // 이벤트 리스너 제거
    document.removeEventListener('click', initAudio);
    document.removeEventListener('touchstart', initAudio);
    document.removeEventListener('keydown', initAudio);
  };

  // 사용자 제스처 이벤트에 리스너 등록
  document.addEventListener('click', initAudio, { once: true });
  document.addEventListener('touchstart', initAudio, { once: true });
  document.addEventListener('keydown', initAudio, { once: true });
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }
  // AudioContext가 아직 초기화되지 않은 경우 null 반환
  // 사용자 제스처 후 자동으로 초기화됨
  return null;
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

function playCoinSound() {
  const ctx = ensureContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.35);
}

export interface ApiActions {
  selectLizard(id: string): void;
  sendBoost(id: string): void;
  updateNickname(name: string): void;
  claimDailyTicket(): void;
  buyTickets(count: number): void;
  applyReferral(code: string): void;
  getPlayerResult(): void;
}

export function createApi(store: Store): ApiActions {
  // 사용자 제스처 후 AudioContext 초기화 설정
  if (typeof window !== 'undefined') {
    initAudioOnGesture();
  }

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

  socket.on('welcome', (payload: SelfInfo) => {
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
        message = '쿨다운 중입니다. 잠시 후 다시 시도하세요.';
      } else if (result.reason === 'invalid_phase') {
        tone = 'info';
        message = '탭 구간이 아닙니다.';
      } else if (result.reason === 'invalid_lizard') {
        tone = 'error';
        message = '선택한 게코를 찾을 수 없습니다.';
      } else if (result.reason === 'no_ticket') {
        tone = 'error';
        message = '티켓이 부족합니다!';
      } else if (result.reason === 'no_selection') {
        tone = 'warning';
        message = '먼저 게코를 선택하세요.';
      } else if (result.reason === 'countdown') {
        tone = 'info';
        message = '카운트다운 중입니다. 잠시 기다려주세요!';
      }
      store.showToast({ message, tone });
      window.setTimeout(() => store.clearToast(), 2300);
    } else if (result.applied) {
      playClick();
      store.incrementMyTaps();
    }
  });

  socket.on('player:result', (result: PlayerRaceResult) => {
    store.setPlayerResult(result);
    if (result.prizeEarned > 0) {
      playCoinSound();
      store.showToast({
        message: `+${result.prizeEarned} Geckoin 획득!`,
        tone: 'success'
      });
      window.setTimeout(() => store.clearToast(), 3000);
    }
  });

  socket.on('wallet:claim:result', (result: { success: boolean; wallet?: PlayerWallet }) => {
    if (result.success && result.wallet) {
      store.updateWallet(result.wallet);
      playCoinSound();
      store.showToast({ message: '일일 티켓 수령 완료!', tone: 'success' });
      window.setTimeout(() => store.clearToast(), 2000);
    } else {
      store.showToast({ message: '이미 오늘 티켓을 수령했습니다.', tone: 'warning' });
      window.setTimeout(() => store.clearToast(), 2000);
    }
  });

  socket.on('wallet:buyTickets:result', (result: { success: boolean; wallet?: PlayerWallet }) => {
    if (result.success && result.wallet) {
      store.updateWallet(result.wallet);
      playCoinSound();
      store.showToast({ message: '티켓 구매 완료!', tone: 'success' });
      window.setTimeout(() => store.clearToast(), 2000);
    } else {
      store.showToast({ message: '코인이 부족합니다.', tone: 'error' });
      window.setTimeout(() => store.clearToast(), 2000);
    }
  });

  socket.on('referral:apply:result', (result: { success: boolean; wallet?: PlayerWallet }) => {
    if (result.success && result.wallet) {
      store.updateWallet(result.wallet);
      playCoinSound();
      store.showToast({ message: '추천 보너스 +10 코인!', tone: 'success' });
      window.setTimeout(() => store.clearToast(), 2000);
    } else {
      store.showToast({ message: '유효하지 않은 추천 코드입니다.', tone: 'error' });
      window.setTimeout(() => store.clearToast(), 2000);
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
    },
    claimDailyTicket() {
      socket.emit('wallet:claim');
    },
    buyTickets(count: number) {
      socket.emit('wallet:buyTickets', { count });
    },
    applyReferral(code: string) {
      socket.emit('referral:apply', { code });
    },
    getPlayerResult() {
      socket.emit('player:getResult');
    }
  };
}
