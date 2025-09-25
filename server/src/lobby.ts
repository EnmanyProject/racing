import { randomUUID } from 'node:crypto';
import type { LobbyState, PlayerInfo } from './types';

export class LobbyManager {
  private players = new Map<string, PlayerInfo>();

  private lockSelections = false;

  addPlayer(id: string, nickname?: string): PlayerInfo {
    const existing = this.players.get(id);
    if (existing) {
      existing.connected = true;
      if (nickname) {
        existing.nickname = nickname;
      }
      return existing;
    }

    const player: PlayerInfo = {
      id,
      nickname: nickname || this.makeNickname(),
      joinedAt: Date.now(),
      totalBoosts: 0,
      lastBoostAt: 0,
      connected: true
    };
    this.players.set(id, player);
    return player;
  }

  markDisconnected(id: string): void {
    const player = this.players.get(id);
    if (player) {
      player.connected = false;
    }
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  setSelectionLock(value: boolean): void {
    this.lockSelections = value;
  }

  updateNickname(id: string, nickname: string): void {
    const player = this.players.get(id);
    if (!player) return;
    player.nickname = nickname;
  }

  chooseLizard(id: string, lizardId: string): boolean {
    const player = this.players.get(id);
    if (!player || this.lockSelections) {
      return false;
    }
    player.selectionId = lizardId;
    return true;
  }

  recordBoost(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    player.totalBoosts += 1;
    player.lastBoostAt = Date.now();
  }

  getState(): LobbyState {
    const selections: Record<string, number> = {};
    for (const player of this.players.values()) {
      if (player.selectionId) {
        selections[player.selectionId] = (selections[player.selectionId] ?? 0) + 1;
      }
    }
    return {
      players: Array.from(this.players.values()).map((player) => ({ ...player })),
      selections
    };
  }

  getPlayers(): PlayerInfo[] {
    return Array.from(this.players.values()).map((player) => ({ ...player }));
  }

  makeNickname(): string {
    return `Racer-${randomUUID().slice(0, 4).toUpperCase()}`;
  }
}

export default LobbyManager;
