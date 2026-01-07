export type Phase = 'LOBBY' | 'CLICK_WINDOW' | 'RACING' | 'RESULTS';

export interface LizardSeed {
  id: string;
  name: string;
  color: string;
  image: string;
}

export interface LizardState extends LizardSeed {
  progress: number;
  wins: number;
  finishTime?: number;
  totalTaps: number;
  rank?: number;
}

export interface PlayerWallet {
  coins: number;
  tickets: number;
  totalEarned: number;
  totalSpent: number;
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
  wallet: PlayerWallet;
  dailyTicketClaimed: boolean;
  lastDailyClaimDate?: string;
  referralCode?: string;
  referredBy?: string;
  referralCount: number;
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

export interface PrizePool {
  totalTaps: number;
  totalPrize: number;
  platformFee: number;
  burnAmount: number;
  ownerClubAmount: number;
  playerPrize: number;
  distribution: {
    rank: number;
    percentage: number;
    amount: number;
  }[];
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
  prizePool: PrizePool;
  raceResults?: RaceResult[];
}

export interface BoostResult {
  applied: boolean;
  reason?: 'invalid_phase' | 'invalid_lizard' | 'rate_limited' | 'lockout' | 'no_ticket' | 'no_selection';
  newTapCount?: number;
}

export interface GameConfig {
  phaseTimeline: PhaseDefinition[];
  tickIntervalMs: number;
  baseSpeedRange: { min: number; max: number };
  variance: number;
  boostValue: number;
  boostCooldownMs: number;
  slowMoDurationMs: number;
  prizeDistribution: number[];
  platformFeePercent: number;
  burnPercent: number;
  ownerClubPercent: number;
  dailyFreeTickets: number;
  referralBonus: number;
  ticketCost: number;
}

export interface LobbyState {
  players: PlayerInfo[];
  selections: Record<string, number>;
}

export interface GameStateMessage {
  snapshot: RaceSnapshot;
  lobby: LobbyState;
}

// 5 Geckos based on design document
export const GECKO_SEEDS: LizardSeed[] = [
  { id: 'gecko-1', name: 'Kira', color: '#7CFC00', image: '/assets/geckos/gecko_1.png' },
  { id: 'gecko-2', name: 'Opal', color: '#00CED1', image: '/assets/geckos/gecko_2.png' },
  { id: 'gecko-3', name: 'Miko', color: '#FFD700', image: '/assets/geckos/gecko_3.png' },
  { id: 'gecko-4', name: 'Chip', color: '#FF6B6B', image: '/assets/geckos/gecko_4.png' },
  { id: 'gecko-5', name: 'Flash', color: '#9370DB', image: '/assets/geckos/gecko_5.png' },
];
