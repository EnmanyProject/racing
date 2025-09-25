import type { LizardSeed } from './types';

export const LIZARD_NAMES = [
  'Aero Dash',
  'Neon Ripple',
  'Shadow Glide',
  'Solar Flicker',
  'Tide Spinner',
  'Spire Runner',
  'Quill Sprint',
  'Pulse Dancer',
  'Glint Vortex',
  'Nova Skitter'
] as const;

export const LIZARD_COLORS = [
  '#15d08a',
  '#ffd166',
  '#38b2ff',
  '#f97316',
  '#6366f1',
  '#f43f5e',
  '#22d3ee',
  '#a855f7',
  '#2dd4bf',
  '#fde047'
] as const;

export function buildLizardSeeds(): LizardSeed[] {
  return LIZARD_NAMES.map((name, index) => ({
    id: `lizard-${index + 1}`,
    name,
    color: LIZARD_COLORS[index % LIZARD_COLORS.length]
  }));
}

export function now(): number {
  return Date.now();
}

export function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
