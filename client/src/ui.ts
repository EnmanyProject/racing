import type { ApiActions } from './api';
import type { Animator } from './animation';
import type { ClientState, LizardView, Store, Phase, PersonalTapPhase } from './store';

// 개인 탭 타이밍 상수
const PERSONAL_COUNTDOWN_MS = 3000;  // 3초 카운트다운
const PERSONAL_TAP_DURATION_MS = 5000;  // 5초 탭 시간

// Asset paths
const COIN_ICON = '/assets/Coin_New_ui.png';
const TICKET_ICON = '/assets/Tiket.png';
const TAP_BUTTON_IMG = '/assets/Tap_Button_Up.png';

interface UIElements {
  header: {
    connectionStatus: HTMLElement;
    coinsDisplay: HTMLElement;
    ticketsDisplay: HTMLElement;
    inviteBtn: HTMLElement;
  };
  phaseBar: HTMLElement;
  mainContent: HTMLElement;
  toast: HTMLElement;
  countdownOverlay: {
    container: HTMLElement;
    digit: HTMLElement;
  };
  inviteModal: {
    overlay: HTMLElement;
    codeDisplay: HTMLElement;
    friendList: HTMLElement;
  };
}

interface GeckoCardElements {
  card: HTMLElement;
  image: HTMLElement;
  name: HTMLElement;
  supporters: HTMLElement;
  wins: HTMLElement;
}

export function mountUI(store: Store, actions: ApiActions, animator: Animator, container: HTMLElement): void {
  container.innerHTML = '';

  const elements = createBaseLayout(container);
  const geckoCards = new Map<string, GeckoCardElements>();
  const raceRunners = new Map<string, HTMLElement>();

  let currentPhase: Phase | null = null;
  let currentSelectedId: string | null = null;
  let currentPersonalTapPhase: PersonalTapPhase | null = null;

  // 로컬 타이머 - 100ms마다 업데이트
  setInterval(() => {
    const state = store.getState();
    updatePhaseBar(elements, state);
    updateLocalCountdowns(elements, state);
    updateRaceCountdownOverlay(elements, state);

    // 개인 탭 페이즈 자동 전환
    if (state.personalTapPhase !== 'idle' && state.personalTapStartTime) {
      const elapsed = Date.now() - state.personalTapStartTime;

      if (state.personalTapPhase === 'countdown' && elapsed >= PERSONAL_COUNTDOWN_MS) {
        store.setPersonalTapPhase('tapping');
      } else if (state.personalTapPhase === 'tapping' && elapsed >= PERSONAL_COUNTDOWN_MS + PERSONAL_TAP_DURATION_MS) {
        store.setPersonalTapPhase('waiting');
      }
    }
  }, 100);

  store.subscribe((state) => {
    updateHeader(elements, state);
    updatePhaseBar(elements, state);
    updateToast(elements, state);
    updateRaceCountdownOverlay(elements, state);
    updateInviteModal(elements, state, store);

    const newPhase = state.snapshot?.phase ?? null;
    const newSelectedId = state.selectedLizardId;
    const newPersonalTapPhase = state.personalTapPhase;

    // Re-render main content when phase changes, selection changes, or personal tap phase changes
    const phaseChanged = newPhase !== currentPhase;
    const selectionChanged = newPhase === 'LOBBY' && newSelectedId !== currentSelectedId;
    const personalTapPhaseChanged = newPersonalTapPhase !== currentPersonalTapPhase;

    if (phaseChanged || selectionChanged || personalTapPhaseChanged) {
      currentPhase = newPhase;
      currentSelectedId = newSelectedId;
      currentPersonalTapPhase = newPersonalTapPhase;
      geckoCards.clear();
      raceRunners.clear();
      renderMainContent(elements, state, actions, animator, geckoCards, raceRunners, store);
    } else {
      // Update existing views
      updateMainContent(elements, state, actions, animator, geckoCards, raceRunners);
    }
  });
}

// 로컬 카운트다운 업데이트 (탭 대기 화면)
function updateLocalCountdowns(elements: UIElements, state: ClientState): void {
  // 탭 대기 화면 카운트다운
  const tapReadyCountdown = elements.mainContent.querySelector('#tap-ready-countdown');
  if (tapReadyCountdown && state.snapshot) {
    const remaining = Math.max(0, state.snapshot.phaseEndsAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    tapReadyCountdown.textContent = String(seconds);
  }

  // 탭 페이즈 카운트다운
  const tapPhaseCountdown = elements.mainContent.querySelector('#tap-phase-countdown');
  if (tapPhaseCountdown && state.snapshot) {
    const remaining = Math.max(0, state.snapshot.phaseEndsAt - Date.now());
    tapPhaseCountdown.textContent = `${Math.ceil(remaining / 1000)}s remaining`;
  }

  // waiting 화면 카운트다운 (레이스 시작까지)
  const waitingTime = elements.mainContent.querySelector('#waiting-time');
  if (waitingTime && state.snapshot) {
    const remaining = Math.max(0, state.snapshot.phaseEndsAt - Date.now());
    waitingTime.textContent = formatCountdown(remaining);
  }

  // 개인 탭 카운트다운 (3, 2, 1) 업데이트
  if (state.personalTapPhase === 'countdown' && state.personalTapStartTime) {
    const countdownNum = elements.mainContent.querySelector('#personal-countdown-number');
    if (countdownNum) {
      const elapsed = Date.now() - state.personalTapStartTime;
      const remaining = Math.max(0, PERSONAL_COUNTDOWN_MS - elapsed);
      const seconds = Math.ceil(remaining / 1000);
      countdownNum.textContent = String(seconds || 1);
    }
  }

  // 개인 탭 카운트업 (1, 2, 3, 4, 5) 업데이트
  if (state.personalTapPhase === 'tapping' && state.personalTapStartTime) {
    const countupNum = elements.mainContent.querySelector('#personal-countup-number');
    if (countupNum) {
      const elapsed = Date.now() - state.personalTapStartTime;
      const tapElapsed = elapsed - PERSONAL_COUNTDOWN_MS;
      const countupValue = Math.min(5, Math.floor(tapElapsed / 1000) + 1);
      countupNum.textContent = String(countupValue);
    }
  }
}

// 레이싱 시작 카운트다운 오버레이 업데이트 (3, 2, 1, GO!)
function updateRaceCountdownOverlay(elements: UIElements, state: ClientState): void {
  if (!state.snapshot) {
    elements.countdownOverlay.container.dataset.visible = 'false';
    return;
  }

  const { phase, racingElapsed } = state.snapshot;

  // RACING 페이즈 시작: 3, 2, 1, GO! 카운트다운 오버레이 표시
  if (phase === 'RACING' && racingElapsed !== undefined) {
    const countdownDuration = 3000; // 3초 카운트다운

    if (racingElapsed < countdownDuration + 500) { // +500ms for "GO!" display
      elements.countdownOverlay.container.dataset.visible = 'true';

      if (racingElapsed < 1000) {
        elements.countdownOverlay.digit.textContent = '3';
      } else if (racingElapsed < 2000) {
        elements.countdownOverlay.digit.textContent = '2';
      } else if (racingElapsed < 3000) {
        elements.countdownOverlay.digit.textContent = '1';
      } else {
        elements.countdownOverlay.digit.textContent = 'GO!';
      }
      return;
    }
  }

  elements.countdownOverlay.container.dataset.visible = 'false';
}

function createBaseLayout(container: HTMLElement): UIElements {
  // Header
  const header = document.createElement('header');
  header.className = 'header';

  const walletBar = document.createElement('div');
  walletBar.className = 'wallet-bar';

  const coinsItem = document.createElement('div');
  coinsItem.className = 'wallet-item';
  coinsItem.innerHTML = `<img src="${COIN_ICON}" alt="Coins"><span class="coins-value">0</span>`;

  const ticketsItem = document.createElement('div');
  ticketsItem.className = 'wallet-item';
  ticketsItem.innerHTML = `<img src="${TICKET_ICON}" alt="Tickets"><span class="tickets-value">0</span>`;

  const inviteBtn = document.createElement('button');
  inviteBtn.className = 'invite-btn';
  inviteBtn.innerHTML = '<span class="invite-btn-icon">👥</span><span>초대</span>';

  walletBar.append(coinsItem, ticketsItem, inviteBtn);

  const connectionStatus = document.createElement('div');
  connectionStatus.className = 'connection-status';
  connectionStatus.dataset.state = 'connecting';

  header.append(walletBar, connectionStatus);

  // Phase Bar
  const phaseBar = document.createElement('div');
  phaseBar.className = 'phase-bar';
  phaseBar.innerHTML = '<span class="phase-text">LOADING...</span>';

  // Main Content
  const mainContent = document.createElement('main');
  mainContent.className = 'main-content';

  // Toast
  const toast = document.createElement('div');
  toast.className = 'toast';

  // Countdown Overlay
  const countdownOverlay = document.createElement('div');
  countdownOverlay.className = 'countdown-overlay';
  const countdownDigit = document.createElement('div');
  countdownDigit.className = 'countdown-digit';
  countdownOverlay.append(countdownDigit);

  // Invite Modal
  const inviteModalOverlay = document.createElement('div');
  inviteModalOverlay.className = 'invite-modal-overlay';
  inviteModalOverlay.innerHTML = `
    <div class="invite-modal">
      <button class="invite-close-btn">X</button>
      <p class="invite-description">
        친구를 초대하면 친구가 처음 게임에 참여할 때<br>
        <strong>10 코인</strong>을 받을 수 있습니다!
      </p>
      <img src="/assets/geckos/gecko_1.png" alt="Gecko" class="invite-gecko-img">
      <button class="invite-action">
        <span class="invite-action-icon">👥</span>
        <span class="invite-action-text">Invite</span>
        <span class="invite-bonus">
          <img src="${COIN_ICON}" class="invite-bonus-icon" alt="coin">
          +10
        </span>
      </button>
      <div class="invite-code-section">
        <div class="invite-code-label">내 추천 코드</div>
        <div class="invite-code" id="invite-code-display">------</div>
      </div>
      <div class="invite-friend-list" id="invite-friend-list">
        <div class="invite-friend-item">Empty</div>
        <div class="invite-friend-item">Empty</div>
        <div class="invite-friend-item">Empty</div>
        <div class="invite-friend-item">Empty</div>
        <div class="invite-friend-item">Empty</div>
      </div>
    </div>
  `;

  container.append(header, phaseBar, mainContent);
  document.body.append(toast, countdownOverlay, inviteModalOverlay);

  return {
    header: {
      connectionStatus,
      coinsDisplay: coinsItem.querySelector('.coins-value')!,
      ticketsDisplay: ticketsItem.querySelector('.tickets-value')!,
      inviteBtn
    },
    phaseBar,
    mainContent,
    toast,
    countdownOverlay: {
      container: countdownOverlay,
      digit: countdownDigit
    },
    inviteModal: {
      overlay: inviteModalOverlay,
      codeDisplay: inviteModalOverlay.querySelector('#invite-code-display')!,
      friendList: inviteModalOverlay.querySelector('#invite-friend-list')!
    }
  };
}

function updateHeader(elements: UIElements, state: ClientState): void {
  elements.header.connectionStatus.dataset.state = state.connection;

  if (state.self?.wallet) {
    elements.header.coinsDisplay.textContent = formatNumber(state.self.wallet.coins);
    elements.header.ticketsDisplay.textContent = String(state.self.wallet.tickets);
  }
}

function updateInviteModal(elements: UIElements, state: ClientState, store: Store): void {
  const { overlay, codeDisplay } = elements.inviteModal;
  const { inviteBtn } = elements.header;

  // Update modal visibility
  if (state.showInviteModal) {
    overlay.classList.add('show');
  } else {
    overlay.classList.remove('show');
  }

  // Update referral code display
  if (state.self?.referralCode) {
    codeDisplay.textContent = state.self.referralCode;
  }

  // Set up event listeners (only once)
  if (!inviteBtn.dataset.initialized) {
    inviteBtn.dataset.initialized = 'true';
    inviteBtn.addEventListener('click', () => {
      store.setShowInviteModal(true);
    });
  }

  const closeBtn = overlay.querySelector('.invite-close-btn');
  if (closeBtn && !closeBtn.getAttribute('data-initialized')) {
    closeBtn.setAttribute('data-initialized', 'true');
    closeBtn.addEventListener('click', () => {
      store.setShowInviteModal(false);
    });
  }

  // Click outside to close
  if (!overlay.dataset.initialized) {
    overlay.dataset.initialized = 'true';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        store.setShowInviteModal(false);
      }
    });
  }

  // Invite action button - copy invite link
  const inviteAction = overlay.querySelector('.invite-action');
  if (inviteAction && !inviteAction.getAttribute('data-initialized')) {
    inviteAction.setAttribute('data-initialized', 'true');
    inviteAction.addEventListener('click', async () => {
      const referralCode = state.self?.referralCode;
      if (referralCode) {
        const inviteUrl = `${window.location.origin}?ref=${referralCode}`;
        try {
          await navigator.clipboard.writeText(inviteUrl);
          store.showToast({ message: '초대 링크가 복사되었습니다!', tone: 'success' });
          window.setTimeout(() => store.clearToast(), 2000);
        } catch {
          // Fallback for browsers without clipboard API
          store.showToast({ message: `추천 코드: ${referralCode}`, tone: 'info' });
          window.setTimeout(() => store.clearToast(), 3000);
        }
      }
    });
  }
}

function updatePhaseBar(elements: UIElements, state: ClientState): void {
  if (!state.snapshot) {
    elements.phaseBar.innerHTML = '<span class="phase-text">CONNECTING...</span>';
    return;
  }

  const { phase, round, phaseEndsAt } = state.snapshot;
  const remaining = Math.max(0, phaseEndsAt - Date.now());
  const countdown = formatCountdown(remaining);

  let phaseText = '';
  switch (phase) {
    case 'LOBBY':
      phaseText = `LOBBY - Round ${round + 1} starts in`;
      break;
    case 'CLICK_WINDOW':
      phaseText = 'TAP NOW!';
      break;
    case 'RACING':
      phaseText = `RACING - Round ${round}`;
      break;
    case 'RESULTS':
      phaseText = `RESULTS - Round ${round}`;
      break;
  }

  elements.phaseBar.innerHTML = `
    <span class="phase-text">${phaseText}</span>
    ${phase === 'LOBBY' ? `<span class="countdown">${countdown}</span>` : ''}
  `;
}

function updateToast(elements: UIElements, state: ClientState): void {
  if (!state.toast) {
    elements.toast.classList.remove('show');
    return;
  }
  elements.toast.classList.add('show');
  elements.toast.dataset.tone = state.toast.tone;
  elements.toast.textContent = state.toast.message;
}

function renderMainContent(
  elements: UIElements,
  state: ClientState,
  actions: ApiActions,
  animator: Animator,
  geckoCards: Map<string, GeckoCardElements>,
  raceRunners: Map<string, HTMLElement>,
  store: Store
): void {
  elements.mainContent.innerHTML = '';

  if (!state.snapshot) {
    elements.mainContent.innerHTML = `
      <div class="loading-view">
        <div class="loading-spinner"></div>
        <p>Connecting to server...</p>
      </div>
    `;
    return;
  }

  switch (state.snapshot.phase) {
    case 'LOBBY':
      // 개인 탭 시스템 흐름
      if (!state.selectedLizardId) {
        // 1. 게코 미선택 → 선택 화면
        renderLobbyView(elements.mainContent, state, actions, geckoCards, store);
      } else if (state.personalTapPhase === 'countdown') {
        // 2. 3, 2, 1 카운트다운
        renderPersonalCountdownView(elements.mainContent, state, store);
      } else if (state.personalTapPhase === 'tapping') {
        // 3. 탭 시간 (1, 2, 3, 4, 5 카운트업)
        renderPersonalTapView(elements.mainContent, state, actions, store);
      } else if (state.personalTapPhase === 'waiting') {
        // 4. 레이스 대기 화면
        renderWaitingView(elements.mainContent, state, store);
      } else {
        // idle 상태인데 선택된 경우 (fallback)
        renderLobbyView(elements.mainContent, state, actions, geckoCards, store);
      }
      break;
    case 'CLICK_WINDOW':
      // 서버의 CLICK_WINDOW 페이즈 - 개인 탭 완료 후 대기 화면
      renderWaitingView(elements.mainContent, state, store);
      break;
    case 'RACING':
      renderRaceView(elements.mainContent, state, animator, raceRunners);
      break;
    case 'RESULTS':
      renderResultsView(elements.mainContent, state, store);
      break;
  }
}

function updateMainContent(
  elements: UIElements,
  state: ClientState,
  _actions: ApiActions,
  _animator: Animator,
  geckoCards: Map<string, GeckoCardElements>,
  raceRunners: Map<string, HTMLElement>
): void {
  if (!state.snapshot) return;

  switch (state.snapshot.phase) {
    case 'LOBBY':
      if (!state.selectedLizardId) {
        updateLobbyView(state, geckoCards);
      } else if (state.personalTapPhase === 'countdown') {
        updatePersonalCountdownView(elements.mainContent, state);
      } else if (state.personalTapPhase === 'tapping') {
        updatePersonalTapView(elements.mainContent, state);
      } else if (state.personalTapPhase === 'waiting') {
        updateWaitingView(elements.mainContent, state);
      }
      break;
    case 'CLICK_WINDOW':
      updateWaitingView(elements.mainContent, state);
      break;
    case 'RACING':
      updateRaceView(state, raceRunners);
      break;
    case 'RESULTS':
      // Results view is mostly static, re-render on update
      break;
  }
}

// Update functions for new views
function updatePersonalCountdownView(container: HTMLElement, state: ClientState): void {
  const countdownNum = container.querySelector('#personal-countdown-number');
  if (countdownNum && state.personalTapStartTime) {
    const elapsed = Date.now() - state.personalTapStartTime;
    const remaining = Math.max(0, PERSONAL_COUNTDOWN_MS - elapsed);
    const seconds = Math.ceil(remaining / 1000);
    countdownNum.textContent = String(seconds || 1);
  }
}

function updatePersonalTapView(container: HTMLElement, state: ClientState): void {
  const countupNum = container.querySelector('#personal-countup-number');
  if (countupNum && state.personalTapStartTime) {
    const elapsed = Date.now() - state.personalTapStartTime;
    const tapElapsed = elapsed - PERSONAL_COUNTDOWN_MS;
    const countupValue = Math.min(5, Math.floor(tapElapsed / 1000) + 1);
    countupNum.textContent = String(countupValue);
  }

  const counter = container.querySelector('#tap-counter');
  if (counter) {
    const currentDisplayed = parseInt(counter.textContent || '0', 10);
    if (state.myTapCount > currentDisplayed) {
      counter.textContent = String(state.myTapCount);
    }
  }
}

function updateWaitingView(container: HTMLElement, state: ClientState): void {
  const waitingTime = container.querySelector('#waiting-time');
  if (waitingTime && state.snapshot) {
    const remaining = Math.max(0, state.snapshot.phaseEndsAt - Date.now());
    waitingTime.textContent = formatCountdown(remaining);
  }

  const tapCount = container.querySelector('#waiting-tap-count');
  if (tapCount) {
    tapCount.textContent = String(state.myTapCount);
  }
}

// ========================
// LOBBY VIEW
// ========================
function renderLobbyView(
  container: HTMLElement,
  state: ClientState,
  actions: ApiActions,
  geckoCards: Map<string, GeckoCardElements>,
  store: Store
): void {
  const view = document.createElement('div');
  view.className = 'lobby-view';

  // Title
  const title = document.createElement('h2');
  title.className = 'lobby-title';
  title.textContent = '🦎 도마뱀을 선택하세요!';

  // Help text
  const help = document.createElement('p');
  help.className = 'lobby-help';
  help.textContent = '도마뱀 선택 → 3초 카운트다운 → 5초 탭 → 레이스 대기!';

  // Prize Pool Display
  const prizePool = document.createElement('div');
  prizePool.className = 'prize-pool-display';
  const poolAmount = state.snapshot?.prizePool?.playerPrize ?? 0;
  prizePool.innerHTML = `
    <div class="prize-pool-title">Prize Pool</div>
    <div class="prize-pool-amount">${formatNumber(poolAmount)}</div>
    <div class="prize-distribution">
      <div class="prize-rank"><span class="prize-rank-badge rank-1">1</span><span>75%</span></div>
      <div class="prize-rank"><span class="prize-rank-badge rank-2">2</span><span>15%</span></div>
      <div class="prize-rank"><span class="prize-rank-badge rank-3">3</span><span>10%</span></div>
      <div class="prize-rank"><span class="prize-rank-badge rank-4">4</span><span>5%</span></div>
      <div class="prize-rank"><span class="prize-rank-badge rank-5">5</span><span>0%</span></div>
    </div>
  `;

  // Gecko Grid
  const grid = document.createElement('div');
  grid.className = 'gecko-grid';

  state.snapshot?.lizards.forEach((lizard) => {
    const cardElements = createGeckoCard(lizard, state, () => {
      // 게코 선택과 개인 탭 시스템을 하나의 액션으로 (emit 1회)
      actions.selectLizard(lizard.id);  // 서버에 알림
      store.selectAndStartTap(lizard.id);  // 클라이언트 상태 업데이트 (1회 emit)
    });
    geckoCards.set(lizard.id, cardElements);
    grid.append(cardElements.card);
  });

  view.append(title, help, prizePool, grid);
  container.append(view);
}

function createGeckoCard(
  lizard: LizardView,
  state: ClientState,
  onSelect: () => void
): GeckoCardElements {
  const card = document.createElement('div');
  card.className = 'gecko-card';
  card.dataset.selected = String(state.selectedLizardId === lizard.id);
  card.addEventListener('click', onSelect);

  const supporters = state.snapshot?.clickTotals[lizard.id] ?? 0;

  card.innerHTML = `
    <div class="gecko-supporters">${supporters} taps</div>
    <img class="gecko-image" src="${lizard.image}" alt="${lizard.name}">
    <div class="gecko-name">${lizard.name}</div>
    <div class="gecko-stats">
      <span>Wins: ${lizard.wins}</span>
    </div>
  `;

  return {
    card,
    image: card.querySelector('.gecko-image')!,
    name: card.querySelector('.gecko-name')!,
    supporters: card.querySelector('.gecko-supporters')!,
    wins: card.querySelector('.gecko-stats span')!
  };
}

function updateLobbyView(state: ClientState, geckoCards: Map<string, GeckoCardElements>): void {
  state.snapshot?.lizards.forEach((lizard) => {
    const elements = geckoCards.get(lizard.id);
    if (elements) {
      elements.card.dataset.selected = String(state.selectedLizardId === lizard.id);
      const supporters = state.snapshot?.clickTotals[lizard.id] ?? 0;
      elements.supporters.textContent = `${supporters} taps`;
      elements.wins.textContent = `Wins: ${lizard.wins}`;
    }
  });
}

// ========================
// PERSONAL COUNTDOWN VIEW (3, 2, 1 카운트다운)
// ========================
function renderPersonalCountdownView(
  container: HTMLElement,
  state: ClientState,
  _store: Store
): void {
  const view = document.createElement('div');
  view.className = 'personal-countdown-view';

  const selectedGecko = state.snapshot?.lizards.find((lz) => lz.id === state.selectedLizardId);

  // Selected Gecko Info
  if (selectedGecko) {
    const geckoInfo = document.createElement('div');
    geckoInfo.className = 'selected-gecko-info';
    geckoInfo.innerHTML = `
      <img src="${selectedGecko.image}" alt="${selectedGecko.name}">
      <span class="name">${selectedGecko.name}</span>
    `;
    view.append(geckoInfo);
  }

  // 준비 텍스트
  const readyText = document.createElement('div');
  readyText.className = 'ready-text';
  readyText.textContent = '준비하세요!';
  view.append(readyText);

  // 카운트다운 숫자 (3, 2, 1)
  const countdownNum = document.createElement('div');
  countdownNum.className = 'countdown-number';
  countdownNum.id = 'personal-countdown-number';

  // 현재 카운트다운 값 계산
  const elapsed = Date.now() - (state.personalTapStartTime ?? Date.now());
  const remaining = Math.max(0, PERSONAL_COUNTDOWN_MS - elapsed);
  const seconds = Math.ceil(remaining / 1000);
  countdownNum.textContent = String(seconds || 1);

  view.append(countdownNum);
  container.append(view);
}

// ========================
// PERSONAL TAP VIEW (1, 2, 3, 4, 5 카운트업 + 탭)
// ========================
function renderPersonalTapView(
  container: HTMLElement,
  state: ClientState,
  actions: ApiActions,
  store: Store
): void {
  const view = document.createElement('div');
  view.className = 'tap-view personal-tap-view';

  const selectedGecko = state.snapshot?.lizards.find((lz) => lz.id === state.selectedLizardId);

  // Selected Gecko Info
  if (selectedGecko) {
    const geckoInfo = document.createElement('div');
    geckoInfo.className = 'selected-gecko-info';
    geckoInfo.innerHTML = `
      <img src="${selectedGecko.image}" alt="${selectedGecko.name}">
      <span class="name">${selectedGecko.name}</span>
    `;
    view.append(geckoInfo);
  }

  // 카운트업 숫자 (1, 2, 3, 4, 5)
  const countupNum = document.createElement('div');
  countupNum.className = 'countup-number';
  countupNum.id = 'personal-countup-number';

  // 현재 카운트업 값 계산
  const elapsed = Date.now() - (state.personalTapStartTime ?? Date.now());
  const tapElapsed = elapsed - PERSONAL_COUNTDOWN_MS;
  const countupValue = Math.min(5, Math.floor(tapElapsed / 1000) + 1);
  countupNum.textContent = String(countupValue);

  view.append(countupNum);

  // TAP NOW! 텍스트
  const tapNowText = document.createElement('div');
  tapNowText.className = 'tap-now-text';
  tapNowText.textContent = 'TAP NOW!';
  view.append(tapNowText);

  // Tap Button
  const buttonWrapper = document.createElement('div');
  buttonWrapper.className = 'tap-button-wrapper';

  const tapButton = document.createElement('button');
  tapButton.className = 'tap-button';
  tapButton.id = 'tap-button';
  tapButton.disabled = !selectedGecko;

  const buttonImg = document.createElement('img');
  buttonImg.src = TAP_BUTTON_IMG;
  buttonImg.alt = 'TAP!';
  tapButton.append(buttonImg);
  buttonWrapper.append(tapButton);

  // 버튼 아래 탭 카운터
  const counterContainer = document.createElement('div');
  counterContainer.className = 'tap-counter-container';
  counterContainer.id = 'tap-counter-container';

  const counterLabel = document.createElement('div');
  counterLabel.className = 'tap-counter-label';
  counterLabel.textContent = 'Your Taps';

  const counter = document.createElement('div');
  counter.className = 'tap-counter';
  counter.id = 'tap-counter';
  counter.textContent = String(state.myTapCount);

  counterContainer.append(counterLabel, counter);

  // 로컬 탭 카운트 (즉시 피드백용)
  let localTapCount = state.myTapCount;

  // 탭 애니메이션 효과
  const triggerTapEffect = () => {
    // 최신 상태에서 선택된 게코 가져오기 (closure 문제 해결)
    const currentState = store.getState();
    const currentGecko = currentState.snapshot?.lizards.find(
      (lz) => lz.id === currentState.selectedLizardId
    );

    if (!currentGecko) return;

    // tapping 페이즈일 때만 탭 허용
    if (currentState.personalTapPhase !== 'tapping') return;

    actions.sendBoost(currentGecko.id);

    // 즉시 카운터 업데이트 (서버 응답 전)
    localTapCount++;
    counter.textContent = String(localTapCount);

    // 카운터 펄스 애니메이션
    counter.classList.remove('pulse');
    void counter.offsetWidth;
    counter.classList.add('pulse');

    // +1 플로팅 텍스트
    const floatText = document.createElement('div');
    floatText.className = 'tap-float';
    floatText.textContent = '+1';
    floatText.style.left = `${Math.random() * 40 + 30}%`;
    counterContainer.append(floatText);
    setTimeout(() => floatText.remove(), 600);
  };

  tapButton.addEventListener('click', triggerTapEffect);
  tapButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    triggerTapEffect();
  }, { passive: false });

  view.append(buttonWrapper, counterContainer);
  container.append(view);
}

// ========================
// WAITING VIEW (레이스 대기)
// ========================
function renderWaitingView(
  container: HTMLElement,
  state: ClientState,
  _store: Store
): void {
  const view = document.createElement('div');
  view.className = 'waiting-view';

  const selectedGecko = state.snapshot?.lizards.find((lz) => lz.id === state.selectedLizardId);

  // Selected Gecko Info with arrow
  if (selectedGecko) {
    const geckoInfo = document.createElement('div');
    geckoInfo.className = 'selected-gecko-info waiting';
    geckoInfo.innerHTML = `
      <div class="my-gecko-arrow">▼</div>
      <img src="${selectedGecko.image}" alt="${selectedGecko.name}">
      <span class="name">${selectedGecko.name}</span>
    `;
    view.append(geckoInfo);
  }

  // 탭 완료 표시
  const completedText = document.createElement('div');
  completedText.className = 'tap-completed-text';
  completedText.textContent = '탭 완료!';
  view.append(completedText);

  // 내 탭 수 표시
  const myTapsDisplay = document.createElement('div');
  myTapsDisplay.className = 'my-taps-display';
  myTapsDisplay.innerHTML = `
    <span class="label">내 탭 수:</span>
    <span class="value" id="waiting-tap-count">${state.myTapCount}</span>
  `;
  view.append(myTapsDisplay);

  // 레이스 시작까지 남은 시간
  const remaining = Math.max(0, (state.snapshot?.phaseEndsAt ?? 0) - Date.now());
  const countdown = formatCountdown(remaining);

  const waitingInfo = document.createElement('div');
  waitingInfo.className = 'waiting-countdown';
  waitingInfo.innerHTML = `
    <span class="label">레이스 시작까지</span>
    <span class="time" id="waiting-time">${countdown}</span>
  `;
  view.append(waitingInfo);

  // 다른 플레이어 대기 중 메시지
  const waitingMessage = document.createElement('div');
  waitingMessage.className = 'waiting-message';
  waitingMessage.textContent = '다른 플레이어들을 기다리는 중...';
  view.append(waitingMessage);

  container.append(view);
}

// ========================
// RACE VIEW
// ========================

// 도마뱀 색상 매핑
const GECKO_COLORS = ['#7CFC00', '#00CED1', '#FFD700', '#FF6B6B', '#9370DB'];

function renderRaceView(
  container: HTMLElement,
  state: ClientState,
  animator: Animator,
  raceRunners: Map<string, HTMLElement>
): void {
  const view = document.createElement('div');
  view.className = 'race-view';
  view.id = 'race-view';

  // 슬로우모션 클래스 적용
  if (state.snapshot?.isSlowMo) {
    view.classList.add('slow-mo');
  }

  // 카메라 뷰포트 생성
  const cameraViewport = document.createElement('div');
  cameraViewport.className = 'race-camera-viewport';
  cameraViewport.id = 'race-camera-viewport';

  const track = document.createElement('div');
  track.className = 'race-track';
  track.id = 'race-track';

  // Finish Line (뷰포트에 고정)
  const finishLine = document.createElement('div');
  finishLine.className = 'finish-line';
  view.append(finishLine);

  // 미니맵 생성
  const minimap = document.createElement('div');
  minimap.className = 'race-minimap';
  minimap.id = 'race-minimap';

  // 도착 순서를 계산
  const finishedLizards = state.snapshot?.lizards
    .filter((lz) => lz.finishTime !== undefined)
    .sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity)) ?? [];

  // 1등 도마뱀 찾기 (아직 도착하지 않은 도마뱀 중에서)
  const activeLizards = state.snapshot?.lizards.filter((lz) => lz.finishTime === undefined) ?? [];
  const leadingLizard = activeLizards.length > 0
    ? activeLizards.reduce((leader, lz) => lz.progress > leader.progress ? lz : leader)
    : null;

  // 각축전 감지 (1등과 5% 이내 차이)
  const closeRaceThreshold = 0.05;
  const closeRaceLizards = leadingLizard
    ? activeLizards.filter((lz) => leadingLizard.progress - lz.progress <= closeRaceThreshold)
    : [];

  // 선두 progress
  const leaderProgress = leadingLizard?.progress ?? 0;

  // Create lanes for each gecko
  state.snapshot?.lizards.forEach((lizard, index) => {
    const lane = document.createElement('div');
    lane.className = 'race-lane';

    const runner = document.createElement('div');
    runner.className = 'race-runner';
    runner.dataset.lizardId = lizard.id;
    const isFinished = lizard.finishTime !== undefined;
    const screenPos = calculateRunnerPosition(lizard.progress, leaderProgress, isFinished);
    runner.style.bottom = `${screenPos}%`;

    // 내가 선택한 도마뱀 표시 (화살표)
    if (state.selectedLizardId === lizard.id) {
      runner.classList.add('my-gecko');
      const myArrow = document.createElement('div');
      myArrow.className = 'my-gecko-arrow';
      myArrow.innerHTML = '▼';
      runner.append(myArrow);
    }

    // 1등 도마뱀 하이라이트
    if (leadingLizard && lizard.id === leadingLizard.id && !lizard.finishTime) {
      runner.classList.add('leading');
    }

    // 각축전 중인 도마뱀 (2마리 이상이 접전 중일 때)
    if (closeRaceLizards.length >= 2 && closeRaceLizards.some((lz) => lz.id === lizard.id)) {
      runner.classList.add('close-race');
    }

    // 도착한 도마뱀에 finished 클래스 추가
    const finishRank = finishedLizards.findIndex((lz) => lz.id === lizard.id) + 1;
    if (finishRank > 0) {
      runner.classList.add('finished');
      runner.classList.remove('leading', 'close-race');

      // 순위 뱃지 추가
      const rankBadge = document.createElement('div');
      rankBadge.className = `rank-badge rank-${finishRank}`;
      rankBadge.textContent = String(finishRank);
      runner.append(rankBadge);
    }

    const runnerImg = document.createElement('img');
    runnerImg.src = lizard.image;
    runnerImg.alt = lizard.name;

    // 스피드 라인 추가
    const speedLines = document.createElement('div');
    speedLines.className = 'speed-lines';

    const tapCount = document.createElement('div');
    tapCount.className = 'tap-count';
    tapCount.textContent = `${state.snapshot?.clickTotals[lizard.id] ?? 0}`;

    runner.append(runnerImg, speedLines, tapCount);
    lane.append(runner);

    // Start marker
    const marker = document.createElement('div');
    marker.className = 'lane-marker';
    lane.append(marker);

    track.append(lane);
    raceRunners.set(lizard.id, runner);

    // Register with animator
    animator.register(lizard.id, runner, runner);

    // 미니맵에 도마뱀 마커 추가
    const minimapGecko = document.createElement('div');
    minimapGecko.className = 'minimap-gecko';
    minimapGecko.dataset.lizardId = lizard.id;
    minimapGecko.style.backgroundColor = GECKO_COLORS[index % GECKO_COLORS.length];
    minimapGecko.style.bottom = `${lizard.progress * 100}%`;
    if (leadingLizard && lizard.id === leadingLizard.id) {
      minimapGecko.classList.add('is-leader');
    }
    minimap.append(minimapGecko);
  });

  cameraViewport.append(track);

  // Slow-mo indicator
  const slowMoIndicator = document.createElement('div');
  slowMoIndicator.className = 'slow-mo-indicator';
  slowMoIndicator.id = 'slow-mo-indicator';
  slowMoIndicator.textContent = 'PHOTO FINISH!';
  slowMoIndicator.style.display = state.snapshot?.isSlowMo ? 'block' : 'none';

  view.append(cameraViewport, minimap, slowMoIndicator);
  container.append(view);
}

// 도마뱀 위치 계산 함수 (카메라 추적 적용)
// 카메라는 항상 1위 도마뱀을 화면 중앙-상단에 고정하고 따라감
function calculateRunnerPosition(
  lizardProgress: number,
  leaderProgress: number,
  isFinished: boolean
): number {
  // 도착한 게코는 결승선(화면 상단)에 고정
  if (isFinished) {
    return 92; // 결승선 위치 (상단에 고정)
  }

  // 카메라 설정
  const leaderScreenPosition = 65;  // 선두가 위치할 화면 % (하단 기준, 화면 상단 35% 지점)
  const minScreenPosition = 5;      // 최소 화면 위치 (하단)
  const maxScreenPosition = 90;     // 최대 화면 위치 (결승선 근처)
  const cameraStartThreshold = 0.15; // 이 progress 이후부터 카메라 추적 시작

  // 선두가 아직 시작점 근처일 때는 고정 카메라
  if (leaderProgress < cameraStartThreshold) {
    return Math.min(lizardProgress * 100 * 3, maxScreenPosition); // 스케일 조정
  }

  // 선두와의 거리 계산
  const distanceFromLeader = leaderProgress - lizardProgress;

  // 선두 기준 상대 위치 계산
  // 선두는 65% 위치, 뒤처진 도마뱀은 그보다 아래
  // 화면 높이 대비 거리 스케일링 (더 넓은 시야)
  const distanceScale = 200; // 거리 대비 화면 이동 비율
  let screenPosition = leaderScreenPosition - (distanceFromLeader * distanceScale);

  // 선두가 결승에 가까워지면 화면 위치 조정 (선두를 결승선으로 이동)
  if (leaderProgress > 0.85) {
    const finishAdjust = (leaderProgress - 0.85) / 0.15;  // 0~1
    const adjustedLeaderPos = leaderScreenPosition + (maxScreenPosition - leaderScreenPosition) * finishAdjust;
    screenPosition = adjustedLeaderPos - (distanceFromLeader * distanceScale);
  }

  // 화면 범위 내로 제한
  return Math.max(minScreenPosition, Math.min(screenPosition, maxScreenPosition));
}

function updateRaceView(state: ClientState, raceRunners: Map<string, HTMLElement>): void {
  // 슬로우모션 클래스 업데이트
  const raceView = document.getElementById('race-view');
  if (raceView) {
    if (state.snapshot?.isSlowMo) {
      raceView.classList.add('slow-mo');
    } else {
      raceView.classList.remove('slow-mo');
    }
  }

  // 도착 순서를 계산
  const finishedLizards = state.snapshot?.lizards
    .filter((lz) => lz.finishTime !== undefined)
    .sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity)) ?? [];

  // 1등 도마뱀 찾기 (아직 도착하지 않은 도마뱀 중에서)
  const activeLizards = state.snapshot?.lizards.filter((lz) => lz.finishTime === undefined) ?? [];
  const leadingLizard = activeLizards.length > 0
    ? activeLizards.reduce((leader, lz) => lz.progress > leader.progress ? lz : leader)
    : null;

  // 각축전 감지 (1등과 5% 이내 차이)
  const closeRaceThreshold = 0.05;
  const closeRaceLizards = leadingLizard
    ? activeLizards.filter((lz) => leadingLizard.progress - lz.progress <= closeRaceThreshold)
    : [];

  // 선두 progress 계산
  const leaderProgress = leadingLizard?.progress ?? 0;

  // 미니맵 업데이트
  const minimap = document.getElementById('race-minimap');

  state.snapshot?.lizards.forEach((lizard) => {
    const runner = raceRunners.get(lizard.id);
    if (runner) {
      // 카메라 추적 적용 위치 계산
      const isFinished = lizard.finishTime !== undefined;
      const screenPos = calculateRunnerPosition(lizard.progress, leaderProgress, isFinished);
      runner.style.bottom = `${screenPos}%`;

      // 1등 하이라이트 업데이트 (카메라 워킹 효과)
      if (leadingLizard && lizard.id === leadingLizard.id && !lizard.finishTime) {
        if (!runner.classList.contains('leading')) {
          runner.classList.add('leading');
        }
      } else {
        runner.classList.remove('leading');
      }

      // 각축전 효과 업데이트
      if (closeRaceLizards.length >= 2 && closeRaceLizards.some((lz) => lz.id === lizard.id) && !lizard.finishTime) {
        if (!runner.classList.contains('close-race')) {
          runner.classList.add('close-race');
        }
      } else {
        runner.classList.remove('close-race');
      }

      // 도착한 도마뱀에 finished 클래스 추가
      const finishRank = finishedLizards.findIndex((lz) => lz.id === lizard.id) + 1;
      if (finishRank > 0 && !runner.classList.contains('finished')) {
        runner.classList.add('finished');
        runner.classList.remove('leading', 'close-race');

        // 순위 뱃지 추가 (아직 없으면)
        if (!runner.querySelector('.rank-badge')) {
          const rankBadge = document.createElement('div');
          rankBadge.className = `rank-badge rank-${finishRank}`;
          rankBadge.textContent = String(finishRank);
          runner.append(rankBadge);
        }
      }

      const tapCount = runner.querySelector('.tap-count');
      if (tapCount) {
        tapCount.textContent = `${state.snapshot?.clickTotals[lizard.id] ?? 0}`;
      }

      // 미니맵 도마뱀 위치 업데이트
      if (minimap) {
        const minimapGecko = minimap.querySelector(`[data-lizard-id="${lizard.id}"]`) as HTMLElement;
        if (minimapGecko) {
          minimapGecko.style.bottom = `${lizard.progress * 100}%`;
          if (leadingLizard && lizard.id === leadingLizard.id) {
            minimapGecko.classList.add('is-leader');
          } else {
            minimapGecko.classList.remove('is-leader');
          }
        }
      }
    }
  });

  const slowMoIndicator = document.getElementById('slow-mo-indicator');
  if (slowMoIndicator) {
    slowMoIndicator.style.display = state.snapshot?.isSlowMo ? 'block' : 'none';
  }
}

// ========================
// RESULTS VIEW
// ========================
function renderResultsView(container: HTMLElement, state: ClientState, store: Store): void {
  const view = document.createElement('div');
  view.className = 'results-view';

  const title = document.createElement('h2');
  title.className = 'results-title';
  title.textContent = 'Race Results';

  // My Result Card
  if (state.playerResult) {
    const myResultCard = document.createElement('div');
    myResultCard.className = 'my-result-card';
    myResultCard.innerHTML = `
      <div class="my-result-title">Your Result</div>
      <div class="my-result-rank">#${state.playerResult.rank}</div>
      <div class="my-result-prize">+${state.playerResult.prizeEarned} Geckoin</div>
    `;
    view.append(myResultCard);

    // Share Button
    const shareBtn = document.createElement('button');
    shareBtn.className = 'share-result-btn';
    shareBtn.innerHTML = '📤 결과 공유하기';
    shareBtn.addEventListener('click', async () => {
      const result = state.playerResult;
      if (!result) return;

      const shareText = `🦎 Gecko Sprint 결과!\n\n` +
        `🏆 ${result.rank}위 달성!\n` +
        `👆 ${result.myTaps} taps\n` +
        `💰 +${result.prizeEarned} Geckoin 획득!\n\n` +
        `지금 바로 도전하세요! ${window.location.origin}?ref=${state.self?.referralCode || ''}`;

      try {
        if (navigator.share) {
          await navigator.share({
            title: 'Gecko Sprint',
            text: shareText,
            url: window.location.origin
          });
        } else {
          await navigator.clipboard.writeText(shareText);
          store.showToast({ message: '결과가 복사되었습니다!', tone: 'success' });
          window.setTimeout(() => store.clearToast(), 2000);
        }
      } catch {
        // User cancelled or error
        await navigator.clipboard.writeText(shareText);
        store.showToast({ message: '결과가 복사되었습니다!', tone: 'success' });
        window.setTimeout(() => store.clearToast(), 2000);
      }
    });
    view.append(shareBtn);
  }

  view.append(title);

  // Results List
  const resultsList = document.createElement('div');
  resultsList.className = 'results-list';

  const results = state.snapshot?.raceResults ?? [];
  const sortedLizards = [...(state.snapshot?.lizards ?? [])]
    .sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity));

  sortedLizards.forEach((lizard, index) => {
    const rank = index + 1;
    const raceResult = results.find((r) => r.lizardId === lizard.id);

    const item = document.createElement('div');
    item.className = `result-item${rank <= 3 ? ` rank-${rank}` : ''}`;

    item.innerHTML = `
      <div class="result-rank">${rank}</div>
      <img class="result-gecko-img" src="${lizard.image}" alt="${lizard.name}">
      <div class="result-info">
        <div class="result-name">${lizard.name}</div>
        <div class="result-taps">${lizard.totalTaps} taps</div>
      </div>
      <div class="result-prize">${raceResult?.prizeAmount ?? 0}</div>
    `;

    resultsList.append(item);
  });

  view.append(resultsList);

  // 다음 라운드 버튼
  const nextRoundBtn = document.createElement('button');
  nextRoundBtn.className = 'next-round-btn';
  nextRoundBtn.textContent = '🦎 다음 라운드 참가';
  nextRoundBtn.addEventListener('click', () => {
    store.setSelection(null);
  });
  view.append(nextRoundBtn);

  container.append(view);
}

// ========================
// UTILITY FUNCTIONS
// ========================
function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return String(num);
}
