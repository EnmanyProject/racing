import { describe, expect, it } from 'vitest';
import { createStore } from './store';

describe('store', () => {
  it('updates selection when setSelection is called', () => {
    const store = createStore();
    store.setSelection('lizard-1');
    expect(store.getState().selectedLizardId).toBe('lizard-1');
  });

  it('tracks connection status', () => {
    const store = createStore();
    store.setConnection('connected');
    expect(store.getState().connection).toBe('connected');
  });

  it('applies incremental progress updates', () => {
    const store = createStore();
    store.updateFromServer(
      {
        lizards: [
          { id: 'lizard-1', name: 'A', color: '#fff', image: '', progress: 0, wins: 0, totalTaps: 0 },
          { id: 'lizard-2', name: 'B', color: '#fff', image: '', progress: 0, wins: 0, totalTaps: 0 }
        ],
        round: 1,
        phase: 'RACING',
        phaseStartedAt: Date.now(),
        phaseEndsAt: Date.now() + 10000,
        isSlowMo: false,
        clickTotals: {},
        racingElapsed: 0,
        prizePool: { totalTaps: 0, totalPrize: 0, platformFee: 0, burnAmount: 0, ownerClubAmount: 0, playerPrize: 0, distribution: [] }
      },
      { players: [], selections: {} }
    );

    store.updateProgress([0.5, 0.1], true);
    const snapshot = store.getState().snapshot;
    expect(snapshot?.isSlowMo).toBe(true);
    expect(snapshot?.lizards[0].progress).toBeCloseTo(0.5);
    expect(snapshot?.lizards[1].progress).toBeCloseTo(0.1);
  });
});
