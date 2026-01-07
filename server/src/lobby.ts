import { randomUUID } from 'node:crypto';
import type { LobbyState, PlayerInfo, PlayerWallet } from './types';
import { generateReferralCode, getTodayDateString } from './utils';

const INITIAL_COINS = 100;
const INITIAL_TICKETS = 5;
const DAILY_FREE_TICKETS = 5;
const REFERRAL_BONUS = 10;

export class LobbyManager {
  private players = new Map<string, PlayerInfo>();
  private lockSelections = false;
  private referralMap = new Map<string, string>(); // referralCode -> playerId

  private createDefaultWallet(): PlayerWallet {
    return {
      coins: INITIAL_COINS,
      tickets: INITIAL_TICKETS,
      totalEarned: INITIAL_COINS,
      totalSpent: 0,
    };
  }

  addPlayer(id: string, nickname?: string): PlayerInfo {
    const existing = this.players.get(id);
    if (existing) {
      existing.connected = true;
      if (nickname) {
        existing.nickname = nickname;
      }
      // Check daily ticket claim
      this.checkDailyTicket(existing);
      return existing;
    }

    const referralCode = generateReferralCode();
    const player: PlayerInfo = {
      id,
      nickname: nickname || this.makeNickname(),
      joinedAt: Date.now(),
      totalBoosts: 0,
      lastBoostAt: 0,
      connected: true,
      wallet: this.createDefaultWallet(),
      dailyTicketClaimed: false,
      referralCode,
      referralCount: 0,
    };

    this.players.set(id, player);
    this.referralMap.set(referralCode, id);

    // Auto-claim daily ticket for new players
    this.claimDailyTicket(player);

    return player;
  }

  private checkDailyTicket(player: PlayerInfo): void {
    const today = getTodayDateString();
    if (player.lastDailyClaimDate !== today) {
      player.dailyTicketClaimed = false;
    }
  }

  claimDailyTicket(player: PlayerInfo): boolean {
    const today = getTodayDateString();
    if (player.lastDailyClaimDate === today && player.dailyTicketClaimed) {
      return false;
    }

    player.wallet.tickets += DAILY_FREE_TICKETS;
    player.dailyTicketClaimed = true;
    player.lastDailyClaimDate = today;
    return true;
  }

  applyReferral(playerId: string, referralCode: string): boolean {
    const player = this.players.get(playerId);
    if (!player || player.referredBy) {
      return false; // Already has referrer
    }

    const referrerId = this.referralMap.get(referralCode);
    if (!referrerId || referrerId === playerId) {
      return false; // Invalid code or self-referral
    }

    const referrer = this.players.get(referrerId);
    if (!referrer) {
      return false;
    }

    // Apply referral
    player.referredBy = referralCode;
    referrer.referralCount += 1;
    referrer.wallet.coins += REFERRAL_BONUS;
    referrer.wallet.totalEarned += REFERRAL_BONUS;

    // Bonus for new player too
    player.wallet.coins += REFERRAL_BONUS;
    player.wallet.totalEarned += REFERRAL_BONUS;

    return true;
  }

  useTicket(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player || player.wallet.tickets <= 0) {
      return false;
    }
    player.wallet.tickets -= 1;
    player.wallet.totalSpent += 1;
    return true;
  }

  addCoins(playerId: string, amount: number): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.wallet.coins += amount;
    player.wallet.totalEarned += amount;
  }

  buyTickets(playerId: string, count: number, costPerTicket: number): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    const totalCost = count * costPerTicket;
    if (player.wallet.coins < totalCost) {
      return false;
    }

    player.wallet.coins -= totalCost;
    player.wallet.tickets += count;
    player.wallet.totalSpent += totalCost;
    return true;
  }

  markDisconnected(id: string): void {
    const player = this.players.get(id);
    if (player) {
      player.connected = false;
    }
  }

  removePlayer(id: string): void {
    const player = this.players.get(id);
    if (player?.referralCode) {
      this.referralMap.delete(player.referralCode);
    }
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

  getPlayer(id: string): PlayerInfo | undefined {
    return this.players.get(id);
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

  getPlayersWithSelection(lizardId: string): PlayerInfo[] {
    return this.getPlayers().filter((p) => p.selectionId === lizardId && !p.isBot);
  }

  makeNickname(): string {
    return `Racer-${randomUUID().slice(0, 4).toUpperCase()}`;
  }
}

export default LobbyManager;
