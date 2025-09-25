import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GameLoop, { DEFAULT_CONFIG } from '../src/gameLoop';
import type { GameConfig } from '../src/types';

const TEST_TIMELINE = [
  { name: 'LOBBY', durationMs: 70 },
  { name: 'CLICK_WINDOW', durationMs: 40 },
  { name: 'RACING', durationMs: 60 },
  { name: 'RESULTS', durationMs: 30 }
] as const;

function createTestConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    ...DEFAULT_CONFIG,
    phaseTimeline: overrides.phaseTimeline ?? TEST_TIMELINE.map((p) => ({ ...p })),
    tickIntervalMs: overrides.tickIntervalMs ?? 5,
    baseSpeedRange: overrides.baseSpeedRange ?? { min: 0.01, max: 0.01 },
    variance: overrides.variance ?? 0,
    boostValue: overrides.boostValue ?? 0.05,
    boostCooldownMs: overrides.boostCooldownMs ?? 100,
    slowMoDurationMs: overrides.slowMoDurationMs ?? 10
  };
}

describe('GameLoop state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('walks phases in the expected order', () => {
    const loop = new GameLoop(createTestConfig());
    const phases: string[] = [];
    loop.on('state', (state) => {
      if (phases[phases.length - 1] !== state.snapshot.phase) {
        phases.push(state.snapshot.phase);
      }
    });

    loop.start();
    vi.advanceTimersByTime(250);

    expect(phases).toEqual(['LOBBY', 'CLICK_WINDOW', 'RACING', 'RESULTS', 'LOBBY']);
  });

  it('reward clicks with faster progress', () => {
    const loop = new GameLoop(createTestConfig());
    const player = loop.addPlayer('player-1');
    loop.chooseLizard(player.id, 'lizard-1');
    loop.start();

    vi.advanceTimersByTime(80); // reach CLICK_WINDOW

    for (let i = 0; i < 20; i += 1) {
      expect(loop.applyBoost(player.id, 'lizard-1').applied).toBe(true);
    }

    vi.advanceTimersByTime(50); // enter racing and advance a little

    const state = loop.getState();
    const first = state.snapshot.lizards.find((lz) => lz.id === 'lizard-1');
    const second = state.snapshot.lizards.find((lz) => lz.id === 'lizard-2');

    expect(first?.progress ?? 0).toBeGreaterThan(second?.progress ?? 0);
  });

  it('enforces 50 clicks per second rate limit', () => {
    const loop = new GameLoop(createTestConfig());
    const player = loop.addPlayer('player-1');
    loop.chooseLizard(player.id, 'lizard-1');
    loop.start();

    vi.advanceTimersByTime(80); // CLICK_WINDOW

    let last: boolean | undefined;
    for (let i = 0; i < 51; i += 1) {
      last = loop.applyBoost(player.id, 'lizard-1').applied;
    }

    expect(last).toBe(false);
  });
});

