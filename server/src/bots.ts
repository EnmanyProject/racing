import { randomUUID } from 'node:crypto';
import type { LobbyManager } from './lobby';
import type { GameConfig, Phase } from './types';

interface BotHandle {
  id: string;
  lizardId: string;
  nextActionAt: number;
  bias: number;
}

export class BotController {
  private bots: BotHandle[] = [];

  private timer: NodeJS.Timeout | null = null;

  constructor(private lobby: LobbyManager, private applyBoost: (id: string, lizardId: string) => void, private config: GameConfig) {}

  rebalance(target: number, lizardIds: string[]): void {
    while (this.bots.length > target) {
      const bot = this.bots.pop();
      if (bot) {
        this.lobby.removePlayer(bot.id);
      }
    }

    while (this.bots.length < target) {
      const id = `bot-${randomUUID()}`;
      const nickname = `Bot ${Math.floor(Math.random() * 900) + 100}`;
      const player = this.lobby.addPlayer(id, nickname);
      player.isBot = true;
      const lizardId = this.pickLizard(lizardIds);
      this.lobby.chooseLizard(id, lizardId);
      const bias = 1 + (Math.random() * 0.3 - 0.15);
      this.bots.push({ id, lizardId, bias, nextActionAt: Date.now() + this.randomDelay() * bias });
    }
  }

  handlePhaseChange(phase: Phase): void {
    if (phase === 'CLICK_WINDOW') {
      const now = Date.now();
      this.bots.forEach((bot) => {
        bot.nextActionAt = now + this.randomDelay(200, 600) * bot.bias;
      });
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }

  clear(): void {
    this.stopTimer();
    this.bots.length = 0;
  }

  private pickLizard(lizardIds: string[]): string {
    if (!lizardIds.length) {
      return 'gecko-1';
    }
    const index = Math.floor(Math.random() * lizardIds.length);
    return lizardIds[index];
  }

  private randomDelay(min = 350, max = 1600): number {
    return Math.random() * (max - min) + min;
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 80);
  }

  private stopTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const now = Date.now();
    for (const bot of this.bots) {
      if (bot.nextActionAt <= now) {
        this.applyBoost(bot.id, bot.lizardId);
        bot.nextActionAt = now + this.randomDelay(200, 650) * bot.bias;
      }
    }
  }
}

export default BotController;
