export type ConnectionState = 'connecting' | 'connected' | 'disconnected';
export type Phase = 'LOBBY' | 'CLICK_WINDOW' | 'RACING' | 'RESULTS';

export interface PlayerWallet {
  coins: number;
  tickets: number;
  totalEarned: number;
  totalSpent: number;
}

export interface LizardView {
  id: string;
  name: string;
  color: string;
  image: string;
  progress: number;
  wins: number;
  finishTime?: number;
  totalTaps: number;
  rank?: number;
}

export interface LobbyPlayerView {
  id: string;
  nickname: string;
  joinedAt: number;
  selectionId?: string;
  totalBoosts: number;
  isBot?: boolean;
  connected: boolean;
  wallet: PlayerWallet;
}

export interface LobbyView {
  players: LobbyPlayerView[];
  selections: Record<string, number>;
}

export interface PrizeDistribution {
  rank: number;
  percentage: number;
  amount: number;
}

export interface PrizePool {
  totalTaps: number;
  totalPrize: number;
  platformFee: number;
  burnAmount: number;
  ownerClubAmount: number;
  playerPrize: number;
  distribution: PrizeDistribution[];
}

export interface RaceResult {
  rank: number;
  lizardId: string;
  lizardName: string;
  totalTaps: number;
  participants: number;
  prizeAmount: number;
  prizePercentage: number;
}

export interface PlayerRaceResult {
  rank: number;
  lizardId: string;
  lizardName: string;
  myTaps: number;
  totalTaps: number;
  participants: number;
  prizeEarned: number;
}

export interface SnapshotView {
  lizards: LizardView[];
  round: number;
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  racingElapsed?: number;
  clickWindowCountdown?: number;
  isSlowMo: boolean;
  clickTotals: Record<string, number>;
  prizePool: PrizePool;
  raceResults?: RaceResult[];
}

export interface ToastMessage {
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export interface SelfInfo {
  id: string;
  nickname: string;
  selectionId?: string;
  wallet: PlayerWallet;
  referralCode?: string;
  referralCount?: number;
  dailyTicketClaimed: boolean;
}

export interface ClientState {
  connection: ConnectionState;
  snapshot: SnapshotView | null;
  lobby: LobbyView;
  self: SelfInfo | null;
  selectedLizardId: string | null;
  toast: ToastMessage | null;
  myTapCount: number;
  playerResult: PlayerRaceResult | null;
  showInviteModal: boolean;
}

export type Listener = (state: ClientState) => void;

export interface Store {
  getState(): ClientState;
  subscribe(listener: Listener): () => void;
  setConnection(state: ConnectionState): void;
  updateFromServer(snapshot: SnapshotView, lobby: LobbyView): void;
  updateProgress(progress: number[], isSlowMo: boolean): void;
  setSelf(payload: SelfInfo): void;
  setSelection(lizardId: string | null): void;
  showToast(toast: ToastMessage): void;
  clearToast(): void;
  incrementMyTaps(): void;
  resetMyTaps(): void;
  updateWallet(wallet: PlayerWallet): void;
  setShowInviteModal(show: boolean): void;
  setPlayerResult(result: PlayerRaceResult | null): void;
}

export function createStore(): Store {
  const state: ClientState = {
    connection: 'connecting',
    snapshot: null,
    lobby: { players: [], selections: {} },
    self: null,
    selectedLizardId: null,
    toast: null,
    myTapCount: 0,
    playerResult: null,
    showInviteModal: false
  };

  const listeners = new Set<Listener>();

  function cloneState(): ClientState {
    return {
      ...state,
      snapshot: state.snapshot
        ? {
            ...state.snapshot,
            lizards: state.snapshot.lizards.map((lz) => ({ ...lz })),
            clickTotals: { ...state.snapshot.clickTotals },
            prizePool: state.snapshot.prizePool ? { ...state.snapshot.prizePool } : {
              totalTaps: 0,
              totalPrize: 0,
              platformFee: 0,
              burnAmount: 0,
              ownerClubAmount: 0,
              playerPrize: 0,
              distribution: []
            },
            raceResults: state.snapshot.raceResults ? [...state.snapshot.raceResults] : undefined
          }
        : null,
      lobby: {
        players: state.lobby.players.map((player) => ({ ...player })),
        selections: { ...state.lobby.selections }
      },
      self: state.self ? { ...state.self, wallet: { ...state.self.wallet } } : null,
      toast: state.toast ? { ...state.toast } : null,
      playerResult: state.playerResult ? { ...state.playerResult } : null,
      showInviteModal: state.showInviteModal
    };
  }

  function emit() {
    const snapshot = cloneState();
    listeners.forEach((listener) => listener(snapshot));
  }

  return {
    getState: cloneState,
    subscribe(listener) {
      listeners.add(listener);
      listener(cloneState());
      return () => listeners.delete(listener);
    },
    setConnection(connection) {
      state.connection = connection;
      emit();
    },
    updateFromServer(snapshot, lobby) {
      const previousPhase = state.snapshot?.phase;
      state.snapshot = snapshot;
      state.lobby = lobby;

      // Reset tap count when entering LOBBY phase
      if (previousPhase !== 'LOBBY' && snapshot.phase === 'LOBBY') {
        state.myTapCount = 0;
        state.playerResult = null;
      }

      if (state.self) {
        const selfPlayer = lobby.players.find((p) => p.id === state.self?.id);
        if (selfPlayer) {
          state.self.selectionId = selfPlayer.selectionId;
          state.self.wallet = selfPlayer.wallet;
        }
      }
      // 자동 선택 제거 - 사용자가 직접 선택하도록 함
      emit();
    },
    updateProgress(progress, isSlowMo) {
      if (!state.snapshot) return;
      state.snapshot.isSlowMo = isSlowMo;
      state.snapshot.lizards.forEach((lizard, index) => {
        if (progress[index] !== undefined) {
          lizard.progress = progress[index];
        }
      });
      emit();
    },
    setSelf(payload) {
      state.self = { ...payload };
      if (payload.selectionId) {
        state.selectedLizardId = payload.selectionId;
      }
      emit();
    },
    setSelection(lizardId) {
      state.selectedLizardId = lizardId;
      emit();
    },
    showToast(toast) {
      state.toast = toast;
      emit();
    },
    clearToast() {
      state.toast = null;
      emit();
    },
    incrementMyTaps() {
      state.myTapCount += 1;
      emit();
    },
    resetMyTaps() {
      state.myTapCount = 0;
      emit();
    },
    updateWallet(wallet) {
      if (state.self) {
        state.self.wallet = wallet;
        emit();
      }
    },
    setShowInviteModal(show) {
      state.showInviteModal = show;
      emit();
    },
    setPlayerResult(result) {
      state.playerResult = result;
      emit();
    }
  };
}
