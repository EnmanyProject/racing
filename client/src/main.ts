import './styles.css';
import { createApi } from './api';
import { createAnimator } from './animation';
import { createStore } from './store';
import { mountUI } from './ui';

const store = createStore();
const animator = createAnimator(store);
const api = createApi(store);

const container = document.getElementById('app');
if (!container) {
  throw new Error('Missing #app container');
}

mountUI(store, api, animator, container);

// Check for referral code in URL
const urlParams = new URLSearchParams(window.location.search);
const refCode = urlParams.get('ref');
if (refCode) {
  // Wait for self info to be available, then apply referral
  const unsubscribe = store.subscribe((state) => {
    if (state.self && !state.self.referralCode?.includes(refCode)) {
      api.applyReferral(refCode);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      unsubscribe();
    }
  });
}

// optional nickname prompt
window.addEventListener('keydown', (event) => {
  if (event.key === 'n' && (event.metaKey || event.ctrlKey)) {
    const name = window.prompt('레이서 이름을 입력하세요');
    if (name && name.trim().length > 1) {
      api.updateNickname(name.trim());
    }
  }
});
