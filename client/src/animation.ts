import type { Store } from './store';

interface AnimHandle {
  token: HTMLElement;
  fill: HTMLElement;
  current: number;
  target: number;
}

export interface Animator {
  register(id: string, token: HTMLElement, fill: HTMLElement): void;
  unregister(id: string): void;
}

export function createAnimator(store: Store): Animator {
  const registry = new Map<string, AnimHandle>();
  let raf: number | null = null;
  let slowFactor = 1;

  function step() {
    registry.forEach((handle) => {
      if (handle.target < handle.current) {
        handle.current = handle.target;
      } else {
        handle.current += (handle.target - handle.current) * 0.16 * slowFactor;
        if (Math.abs(handle.target - handle.current) < 0.2) {
          handle.current = handle.target;
        }
      }
      const percent = Math.max(0, Math.min(handle.current, 100));
      handle.token.style.setProperty('--progress', ${percent}%);
      handle.fill.style.height = ${percent}%;
    });
    raf = window.requestAnimationFrame(step);
  }

  function ensureRunning() {
    if (raf === null) {
      raf = window.requestAnimationFrame(step);
    }
  }

  store.subscribe((state) => {
    const snapshot = state.snapshot;
    slowFactor = snapshot?.isSlowMo ? 0.4 : 1;
    if (!snapshot) return;
    snapshot.lizards.forEach((lizard) => {
      const handle = registry.get(lizard.id);
      if (handle) {
        handle.target = lizard.progress * 100;
      }
    });
  });

  return {
    register(id, token, fill) {
      registry.set(id, { token, fill, current: 0, target: 0 });
      ensureRunning();
    },
    unregister(id) {
      registry.delete(id);
      if (registry.size === 0 && raf !== null) {
        window.cancelAnimationFrame(raf);
        raf = null;
      }
    }
  };
}

