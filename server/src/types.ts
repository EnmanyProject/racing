export type Phase = 'LOBBY' | 'CLICK_WINDOW' | 'RACING' | 'RESULTS';

export interface LizardSeed {
  id: string;
  name: string;
  color: string;
}

export interface LizardState extends LizardSeed {
  progress: number;
  wins: number;
  finishTime?: number;
}

export interface PlayerInfo {
  id: string;
  nickname: string;
  joinedAt: number;
  selectionId?: string;
  totalBoosts: number;
  lastBoostAt: number;
  isBot?: boolean;
  connected: boolean;
}

export interface PhaseDefinition {
  name: Phase;
  durationMs: number;
}

export interface PhaseTiming {
  phase: Phase;
  startedAt: number;
  endsAt: number;
}

export interface RaceSnapshot {
  lizards: LizardState[];
  round: number;
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  clickWindowCountdown?: number;
  racingElapsed?: number;
  isSlowMo: boolean;
  clickTotals: Record<string, number>;
}

export interface BoostResult {
  applied: boolean;
  reason?: 'invalid_phase' | 'invalid_lizard' | 'rate_limited' | 'lockout';
}

export interface GameConfig {
  phaseTimeline: PhaseDefinition[];
  tickIntervalMs: number;
  baseSpeedRange: { min: number; max: number };
  variance: number;
  boostValue: number;
  boostCooldownMs: number;
  slowMoDurationMs: number;
}

export interface LobbyState {
  players: PlayerInfo[];
  selections: Record<string, number>;
}

export interface GameStateMessage {
  snapshot: RaceSnapshot;
  lobby: LobbyState;
}
