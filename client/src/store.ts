export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface LizardView {
  id: string;
  name: string;
  color: string;
  progress: number;
  wins: number;
  finishTime?: number;
}

export interface LobbyPlayerView {
  id: string;
  nickname: string;
  joinedAt: number;
  selectionId?: string;
  totalBoosts: number;
  isBot?: boolean;
  connected: boolean;
}

export interface LobbyView {
  players: LobbyPlayerView[];
  selections: Record<string, number>;
}

export interface SnapshotView {
  lizards: LizardView[];
  round: number;
  phase: string;
  phaseStartedAt: number;
  phaseEndsAt: number;
  racingElapsed?: number;
  clickWindowCountdown?: number;
  isSlowMo: boolean;
  clickTotals: Record<string, number>;
}

export interface ToastMessage {
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export interface ClientState {
  connection: ConnectionState;
  snapshot: SnapshotView | null;
  lobby: LobbyView;
  self: { id: string; nickname: string; selectionId?: string } | null;
  selectedLizardId: string | null;
  toast: ToastMessage | null;
}

export type Listener = (state: ClientState) => void;

export interface Store {
  getState(): ClientState;
  subscribe(listener: Listener): () => void;
  setConnection(state: ConnectionState): void;
  updateFromServer(snapshot: SnapshotView, lobby: LobbyView): void;
  updateProgress(progress: number[], isSlowMo: boolean): void;
  setSelf(payload: { id: string; nickname: string; selectionId?: string }): void;
  setSelection(lizardId: string | null): void;
  showToast(toast: ToastMessage): void;
  clearToast(): void;
}

export function createStore(): Store {
  const state: ClientState = {
    connection: 'connecting',
    snapshot: null,
    lobby: { players: [], selections: {} },
    self: null,
    selectedLizardId: null,
    toast: null
  };

  const listeners = new Set<Listener>();

  function cloneState(): ClientState {
    return {
      ...state,
      snapshot: state.snapshot
        ? {
            ...state.snapshot,
            lizards: state.snapshot.lizards.map((lz) => ({ ...lz })),
            clickTotals: { ...state.snapshot.clickTotals }
          }
        : null,
      lobby: {
        players: state.lobby.players.map((player) => ({ ...player })),
        selections: { ...state.lobby.selections }
      },
      self: state.self ? { ...state.self } : null,
      toast: state.toast ? { ...state.toast } : null
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
      state.snapshot = snapshot;
      state.lobby = lobby;
      if (state.self) {
        const selfPlayer = lobby.players.find((p) => p.id === state.self?.id);
        if (selfPlayer) {
          state.self.selectionId = selfPlayer.selectionId;
        }
      }
      if (!state.selectedLizardId && snapshot.lizards.length > 0) {
        state.selectedLizardId = snapshot.lizards[0].id;
      }
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
    }
  };
}
