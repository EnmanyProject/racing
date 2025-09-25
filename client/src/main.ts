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

// optional nickname prompt
window.addEventListener('keydown', (event) => {
  if (event.key === 'n' && (event.metaKey || event.ctrlKey)) {
    const name = window.prompt('레이서 이름을 입력하세요');
    if (name && name.trim().length > 1) {
      api.updateNickname(name.trim());
    }
  }
});
