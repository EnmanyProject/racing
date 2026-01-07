import { EventEmitter } from 'node:events';
import LobbyManager from './lobby';
import BotController from './bots';
import { buildLizardSeeds, clamp, calculatePrizePool } from './utils';
import type {
  BoostResult,
  GameConfig,
  GameStateMessage,
  LizardState,
  Phase,
  PhaseDefinition,
  PhaseTiming,
  RaceResult,
  PlayerRaceResult,
  PrizePool
} from './types';

const TIMELINE_DEFAULT: PhaseDefinition[] = [
  { name: 'LOBBY', durationMs: 120_000 },
  { name: 'CLICK_WINDOW', durationMs: 5_000 },
  { name: 'RACING', durationMs: 10_000 },
  { name: 'RESULTS', durationMs: 5_000 }
];

export const DEFAULT_CONFIG: GameConfig = {
  phaseTimeline: TIMELINE_DEFAULT,
  tickIntervalMs: 200,
  baseSpeedRange: { min: 0.006, max: 0.016 },
  variance: 0.006,
  boostValue: 0.045,
  boostCooldownMs: 650,
  slowMoDurationMs: 2_000,
  prizeDistribution: [75, 15, 10, 5, 0],
  platformFeePercent: 10,
  burnPercent: 5,
  ownerClubPercent: 5,
  dailyFreeTickets: 5,
  referralBonus: 10,
  ticketCost: 10
};

const TRACK_LENGTH = 100;
const BASE_NORMALIZED_SPEED = 0.2;
const CLICK_WINDOW_LIMIT_PER_SECOND = 50;

export class GameLoop extends EventEmitter {
  private lobby = new LobbyManager();

  private botController: BotController;

  private lizards: LizardState[] = buildLizardSeeds().map((seed) => ({
    ...seed,
    progress: 0,
    wins: 0,
    totalTaps: 0
  }));

  private lastRaceResults: RaceResult[] = [];

  private currentPrizePool: PrizePool = {
    totalTaps: 0,
    totalPrize: 0,
    platformFee: 0,
    burnAmount: 0,
    ownerClubAmount: 0,
    playerPrize: 0,
    distribution: []
  };

  private timeline: PhaseDefinition[];

  private phaseIndex = 0;

  private timing: PhaseTiming;

  private round = 0;

  private phaseTimeout: NodeJS.Timeout | null = null;

  private raceInterval: NodeJS.Timeout | null = null;

  private clickTotals = new Map<string, number>();

  private clickRate = new Map<string, { windowStart: number; count: number }>();

  private raceSpeeds = new Map<string, { speed: number; totalClicks: number }>();

  private positions = new Map<string, number>();

  private lastTick = 0;

  private isSlowMo = false;

  constructor(private config: GameConfig = DEFAULT_CONFIG) {
    super();
    this.timeline = config.phaseTimeline;
    this.botController = new BotController(this.lobby, (id, lizardId) => {
      this.applyBoost(id, lizardId);
    }, config);

    const now = Date.now();
    this.timing = {
      phase: this.timeline[0].name,
      startedAt: now,
      endsAt: now + this.timeline[0].durationMs
    };
  }

  start(): void {
    this.schedulePhase(this.timeline[0]);
  }

  getState(): GameStateMessage {
    // Calculate current prize pool based on click totals
    const totalTaps = Array.from(this.clickTotals.values()).reduce((sum, v) => sum + v, 0);
    this.currentPrizePool = calculatePrizePool(totalTaps, this.config);

    // Update lizard totalTaps
    this.lizards.forEach((lz) => {
      lz.totalTaps = this.clickTotals.get(lz.id) ?? 0;
    });

    return {
      snapshot: {
        lizards: this.lizards.map((lz) => ({ ...lz })),
        round: this.round,
        phase: this.timing.phase,
        phaseStartedAt: this.timing.startedAt,
        phaseEndsAt: this.timing.endsAt,
        racingElapsed: this.timing.phase === 'RACING' ? Date.now() - this.timing.startedAt : undefined,
        clickWindowCountdown:
          this.timing.phase === 'CLICK_WINDOW' ? Math.max(0, this.timing.endsAt - Date.now()) : undefined,
        isSlowMo: this.isSlowMo,
        clickTotals: Object.fromEntries(this.clickTotals.entries()),
        prizePool: this.currentPrizePool,
        raceResults: this.timing.phase === 'RESULTS' ? this.lastRaceResults : undefined
      },
      lobby: this.lobby.getState()
    };
  }

  addPlayer(id: string, nickname?: string) {
    const player = this.lobby.addPlayer(id, nickname);
    if (!player.isBot && this.timing.phase === 'LOBBY') {
      this.rebalanceBots();
    }
    this.emitState();
    return player;
  }

  markDisconnected(id: string): void {
    this.lobby.markDisconnected(id);
    this.emitState();
  }

  updateNickname(id: string, nickname: string) {
    this.lobby.updateNickname(id, nickname);
    this.emitState();
  }

  chooseLizard(playerId: string, lizardId: string): boolean {
    const success = this.lobby.chooseLizard(playerId, lizardId);
    if (success) {
      this.emitState();
    }
    return success;
  }

  getPlayer(playerId: string) {
    return this.lobby.getPlayer(playerId);
  }

  claimDailyTicket(player: ReturnType<typeof this.lobby.getPlayer>) {
    if (!player) return false;
    return this.lobby.claimDailyTicket(player);
  }

  buyTickets(playerId: string, count: number): boolean {
    return this.lobby.buyTickets(playerId, count, this.config.ticketCost);
  }

  applyReferral(playerId: string, code: string): boolean {
    return this.lobby.applyReferral(playerId, code);
  }

  applyBoost(playerId: string, lizardId: string): BoostResult {
    if (this.timing.phase !== 'CLICK_WINDOW') {
      return { applied: false, reason: 'invalid_phase' };
    }

    const lizard = this.lizards.find((lz) => lz.id === lizardId);
    if (!lizard) {
      return { applied: false, reason: 'invalid_lizard' };
    }

    const limiter = this.clickRate.get(playerId) ?? { windowStart: Date.now(), count: 0 };
    const now = Date.now();
    if (now - limiter.windowStart >= 1_000) {
      limiter.windowStart = now;
      limiter.count = 0;
    }
    if (limiter.count >= CLICK_WINDOW_LIMIT_PER_SECOND) {
      this.clickRate.set(playerId, limiter);
      return { applied: false, reason: 'rate_limited' };
    }
    limiter.count += 1;
    this.clickRate.set(playerId, limiter);

    this.lobby.recordBoost(playerId);
    const currentClicks = this.clickTotals.get(lizardId) ?? 0;
    this.clickTotals.set(lizardId, currentClicks + 1);

    this.emitState();
    return { applied: true };
  }

  private schedulePhase(def: PhaseDefinition): void {
    const now = Date.now();
    this.timing = {
      phase: def.name,
      startedAt: now,
      endsAt: now + def.durationMs
    };

    if (this.phaseTimeout) {
      clearTimeout(this.phaseTimeout);
    }

    this.handlePhaseStart(def.name);
    this.phaseTimeout = setTimeout(() => this.advancePhase(), def.durationMs);
    this.emitState();
  }

  private advancePhase(): void {
    this.phaseIndex = (this.phaseIndex + 1) % this.timeline.length;
    const next = this.timeline[this.phaseIndex];
    this.schedulePhase(next);
  }

  private handlePhaseStart(phase: Phase): void {
    switch (phase) {
      case 'LOBBY':
        this.lobby.setSelectionLock(false);
        this.clickTotals.clear();
        this.clickRate.clear();
        this.raceSpeeds.clear();
        this.positions.clear();
        this.isSlowMo = false;
        this.rebalanceBots();
        break;
      case 'CLICK_WINDOW':
        this.lobby.setSelectionLock(true);
        this.botController.handlePhaseChange(phase);
        break;
      case 'RACING':
        this.startRace();
        this.botController.handlePhaseChange(phase);
        break;
      case 'RESULTS':
        this.botController.handlePhaseChange(phase);
        this.finishRace();
        break;
      default:
        break;
    }
  }

  private rebalanceBots(): void {
    const players = this.lobby.getPlayers();
    const humanCount = players.filter((player) => !player.isBot && player.connected).length;
    const perHuman = 6 + Math.floor(Math.random() * 7);
    const target = humanCount > 0 ? humanCount * perHuman : 6 + Math.floor(Math.random() * 7);
    this.botController.rebalance(target, this.lizards.map((lz) => lz.id));
  }

  private startRace(): void {
    this.round += 1;
    this.prepareLizards();
    this.isSlowMo = false;

    const clicksArray = this.lizards.map((lizard) => this.clickTotals.get(lizard.id) ?? 0);
    const maxClicks = clicksArray.length ? Math.max(...clicksArray, 0) : 0;

    this.raceSpeeds.clear();
    this.positions.clear();

    this.lizards.forEach((lizard) => {
      const totalClicks = this.clickTotals.get(lizard.id) ?? 0;
      const ratio = maxClicks > 0 ? totalClicks / maxClicks : 0;
      const speedNormalized = BASE_NORMALIZED_SPEED + 0.8 * ratio;
      const speed = speedNormalized * TRACK_LENGTH;
      this.raceSpeeds.set(lizard.id, { speed, totalClicks });
      this.positions.set(lizard.id, 0);
    });

    this.lastTick = Date.now();
    this.timing.startedAt = this.lastTick;
    this.timing.endsAt = this.timing.startedAt + (this.timeline.find((p) => p.name === 'RACING')?.durationMs ?? 12_000);

    if (this.raceInterval) {
      clearInterval(this.raceInterval);
    }
    this.raceInterval = setInterval(() => this.tickRace(), this.config.tickIntervalMs);
  }

  private prepareLizards(): void {
    this.lizards.forEach((lizard) => {
      lizard.progress = 0;
      delete lizard.finishTime;
    });
  }

  private tickRace(): void {
    const now = Date.now();
    if (!this.lastTick) {
      this.lastTick = now;
    }
    const dtSeconds = Math.max((now - this.lastTick) / 1000, this.config.tickIntervalMs / 1000);
    this.lastTick = now;

    let completed = 0;
    let minTimeToFinish = Number.POSITIVE_INFINITY;

    this.lizards.forEach((lizard) => {
      const plan = this.raceSpeeds.get(lizard.id);
      const speed = plan?.speed ?? TRACK_LENGTH * BASE_NORMALIZED_SPEED;
      const current = this.positions.get(lizard.id) ?? 0;
      const next = Math.min(TRACK_LENGTH, current + speed * dtSeconds);
      this.positions.set(lizard.id, next);

      const progress = clamp(next / TRACK_LENGTH, 0, 1);
      lizard.progress = progress;
      if (progress >= 1) {
        if (!lizard.finishTime) {
          lizard.finishTime = now - this.timing.startedAt;
        }
        completed += 1;
      } else {
        const remaining = TRACK_LENGTH - next;
        const timeToFinish = remaining / speed;
        if (timeToFinish < minTimeToFinish) {
          minTimeToFinish = timeToFinish;
        }
      }
    });

    if (!Number.isFinite(minTimeToFinish)) {
      minTimeToFinish = 0;
    }
    this.isSlowMo = minTimeToFinish * 1000 <= this.config.slowMoDurationMs;

    this.emitState();

    if (completed === this.lizards.length) {
      this.concludeRace();
    }
  }

  private concludeRace(): void {
    if (this.raceInterval) {
      clearInterval(this.raceInterval);
      this.raceInterval = null;
    }
    this.isSlowMo = false;

    const ordered = [...this.lizards].sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity));

    // Assign ranks
    ordered.forEach((lizard, index) => {
      lizard.rank = index + 1;
      const actual = this.lizards.find((lz) => lz.id === lizard.id);
      if (actual) {
        actual.rank = index + 1;
      }
    });

    const winner = ordered[0];
    if (winner) {
      const actual = this.lizards.find((lz) => lz.id === winner.id);
      if (actual) {
        actual.wins += 1;
      }
    }

    // Calculate prize pool and distribute prizes
    const totalTaps = Array.from(this.clickTotals.values()).reduce((sum, v) => sum + v, 0);
    this.currentPrizePool = calculatePrizePool(totalTaps, this.config);

    // Generate race results
    this.lastRaceResults = ordered.map((lizard, index) => {
      const rank = index + 1;
      const participants = this.lobby.getPlayersWithSelection(lizard.id).length;
      const prizeInfo = this.currentPrizePool.distribution.find(d => d.rank === rank);

      return {
        rank,
        lizardId: lizard.id,
        lizardName: lizard.name,
        totalTaps: this.clickTotals.get(lizard.id) ?? 0,
        participants,
        prizeAmount: prizeInfo?.amount ?? 0,
        prizePercentage: prizeInfo?.percentage ?? 0
      };
    });

    // Distribute prizes to players
    this.distributeRacePrizes(ordered);

    this.emitState();
  }

  private distributeRacePrizes(rankedLizards: LizardState[]): void {
    rankedLizards.forEach((lizard, index) => {
      const rank = index + 1;
      const prizeInfo = this.currentPrizePool.distribution.find(d => d.rank === rank);
      if (!prizeInfo || prizeInfo.amount <= 0) return;

      const players = this.lobby.getPlayersWithSelection(lizard.id);
      if (players.length === 0) return;

      // Calculate individual player prizes based on their tap contribution
      const lizardTotalTaps = this.clickTotals.get(lizard.id) ?? 0;

      players.forEach((player) => {
        // For simplicity, distribute equally among participants
        // In future, could weight by individual tap contribution
        const individualPrize = Math.floor(prizeInfo.amount / players.length);
        if (individualPrize > 0) {
          this.lobby.addCoins(player.id, individualPrize);

          // Emit individual result to player
          this.emit('playerResult', {
            playerId: player.id,
            result: {
              rank,
              lizardId: lizard.id,
              lizardName: lizard.name,
              myTaps: player.totalBoosts,
              totalTaps: lizardTotalTaps,
              participants: players.length,
              prizeEarned: individualPrize
            } as PlayerRaceResult
          });
        }
      });
    });
  }

  getPlayerResult(playerId: string): PlayerRaceResult | null {
    const player = this.lobby.getPlayer(playerId);
    if (!player || !player.selectionId) return null;

    const lizard = this.lizards.find(lz => lz.id === player.selectionId);
    if (!lizard || lizard.rank === undefined) return null;

    const players = this.lobby.getPlayersWithSelection(lizard.id);
    const prizeInfo = this.currentPrizePool.distribution.find(d => d.rank === lizard.rank);
    const individualPrize = prizeInfo && players.length > 0
      ? Math.floor(prizeInfo.amount / players.length)
      : 0;

    return {
      rank: lizard.rank,
      lizardId: lizard.id,
      lizardName: lizard.name,
      myTaps: player.totalBoosts,
      totalTaps: this.clickTotals.get(lizard.id) ?? 0,
      participants: players.length,
      prizeEarned: individualPrize
    };
  }

  private finishRace(): void {
    this.emitState();
  }

  private emitProgress(): void {
    this.emit('progress', {
      progress: this.lizards.map((lz) => lz.progress),
      isSlowMo: this.isSlowMo
    });
  }

  private emitState(): void {
    this.emit('state', this.getState());
    this.emitProgress();
  }
}

export default GameLoop;
