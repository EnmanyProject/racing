import { GECKO_SEEDS, type LizardSeed, type PrizePool, type GameConfig } from './types';

export function buildLizardSeeds(): LizardSeed[] {
  return GECKO_SEEDS.map((seed) => ({ ...seed }));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function now(): number {
  return Date.now();
}

export function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function calculatePrizePool(
  totalTaps: number,
  config: GameConfig
): PrizePool {
  const totalPrize = totalTaps;
  const platformFee = Math.floor(totalPrize * (config.platformFeePercent / 100));
  const burnAmount = Math.floor(platformFee * (config.burnPercent / (config.burnPercent + config.ownerClubPercent)));
  const ownerClubAmount = platformFee - burnAmount;
  const playerPrize = totalPrize - platformFee;

  const distribution = config.prizeDistribution.map((percentage, index) => ({
    rank: index + 1,
    percentage,
    amount: Math.floor(playerPrize * (percentage / 100)),
  }));

  return {
    totalTaps,
    totalPrize,
    platformFee,
    burnAmount,
    ownerClubAmount,
    playerPrize,
    distribution,
  };
}

export function formatCoins(amount: number): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return amount.toString();
}
