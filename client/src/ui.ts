import type { ApiActions } from './api';
import type { Animator } from './animation';
import type { ClientState, LizardView, Store, Phase } from './store';

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

  store.subscribe((state) => {
    updateHeader(elements, state);
    updatePhaseBar(elements, state);
    updateToast(elements, state);
    updateCountdown(elements, state);
    updateInviteModal(elements, state, store);

    const newPhase = state.snapshot?.phase ?? null;

    // Re-render main content when phase changes
    if (newPhase !== currentPhase) {
      currentPhase = newPhase;
      geckoCards.clear();
      raceRunners.clear();
      renderMainContent(elements, state, actions, animator, geckoCards, raceRunners, store);
    } else {
      // Update existing views
      updateMainContent(elements, state, actions, animator, geckoCards, raceRunners);
    }
  });
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

function updateCountdown(elements: UIElements, state: ClientState): void {
  if (!state.snapshot || state.snapshot.phase !== 'CLICK_WINDOW') {
    elements.countdownOverlay.container.dataset.visible = 'false';
    return;
  }

  const seconds = Math.max(0, Math.ceil((state.snapshot.phaseEndsAt - Date.now()) / 1000));
  elements.countdownOverlay.container.dataset.visible = 'true';
  elements.countdownOverlay.digit.textContent = seconds > 0 ? String(seconds) : 'GO!';
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
      // 도마뱀 선택 시 탭 대기 화면으로 전환
      if (state.selectedLizardId) {
        renderTapReadyView(elements.mainContent, state, actions, store);
      } else {
        renderLobbyView(elements.mainContent, state, actions, geckoCards);
      }
      break;
    case 'CLICK_WINDOW':
      renderTapView(elements.mainContent, state, actions);
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
  actions: ApiActions,
  _animator: Animator,
  geckoCards: Map<string, GeckoCardElements>,
  raceRunners: Map<string, HTMLElement>
): void {
  if (!state.snapshot) return;

  switch (state.snapshot.phase) {
    case 'LOBBY':
      if (state.selectedLizardId) {
        updateTapReadyView(elements.mainContent, state);
      } else {
        updateLobbyView(state, geckoCards);
      }
      break;
    case 'CLICK_WINDOW':
      updateTapView(elements.mainContent, state, actions);
      break;
    case 'RACING':
      updateRaceView(state, raceRunners);
      break;
    case 'RESULTS':
      // Results view is mostly static, re-render on update
      break;
  }
}

// ========================
// LOBBY VIEW
// ========================
function renderLobbyView(
  container: HTMLElement,
  state: ClientState,
  actions: ApiActions,
  geckoCards: Map<string, GeckoCardElements>
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
  help.textContent = '도마뱀 선택 → 카운트다운 종료 → 탭해서 응원 → 레이스!';

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
    const cardElements = createGeckoCard(lizard, state, () => actions.selectLizard(lizard.id));
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
// TAP READY VIEW (Waiting for race after selecting gecko)
// ========================
function renderTapReadyView(
  container: HTMLElement,
  state: ClientState,
  _actions: ApiActions,
  store: Store
): void {
  const view = document.createElement('div');
  view.className = 'tap-view';

  const selectedGecko = state.snapshot?.lizards.find((lz) => lz.id === state.selectedLizardId);
  const remaining = Math.max(0, (state.snapshot?.phaseEndsAt ?? 0) - Date.now());
  const seconds = Math.ceil(remaining / 1000);

  // Instruction text
  const instruction = document.createElement('div');
  instruction.className = 'tap-instruction';
  instruction.textContent = 'Tap the button in';

  // Big countdown
  const countdownBig = document.createElement('div');
  countdownBig.className = 'tap-countdown-big';
  countdownBig.id = 'tap-ready-countdown';
  countdownBig.textContent = String(seconds);

  const countdownLabel = document.createElement('div');
  countdownLabel.className = 'tap-countdown-label';
  countdownLabel.textContent = 'Seconds!';

  // Selected Gecko Display
  const geckoDisplay = document.createElement('div');
  geckoDisplay.className = 'tap-gecko-display';
  if (selectedGecko) {
    geckoDisplay.innerHTML = `<img src="${selectedGecko.image}" alt="${selectedGecko.name}">`;
  }

  // Tap Button (disabled during waiting)
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'tap-button-container';

  const tapButton = document.createElement('button');
  tapButton.className = 'tap-button';
  tapButton.disabled = true;
  tapButton.style.opacity = '0.7';

  const buttonImg = document.createElement('img');
  buttonImg.src = TAP_BUTTON_IMG;
  buttonImg.alt = 'TAP!';
  tapButton.append(buttonImg);

  buttonContainer.append(tapButton);

  // Change gecko button
  const changeBtn = document.createElement('button');
  changeBtn.className = 'change-gecko-btn';
  changeBtn.textContent = '← 다른 도마뱀 선택';
  changeBtn.addEventListener('click', () => {
    store.setSelection(null);
  });

  view.append(instruction, countdownBig, countdownLabel, geckoDisplay, buttonContainer, changeBtn);
  container.append(view);
}

function updateTapReadyView(container: HTMLElement, state: ClientState): void {
  const countdown = container.querySelector('#tap-ready-countdown');
  if (countdown && state.snapshot) {
    const remaining = Math.max(0, state.snapshot.phaseEndsAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    countdown.textContent = String(seconds);
  }
}

// ========================
// TAP VIEW
// ========================
function renderTapView(container: HTMLElement, state: ClientState, actions: ApiActions): void {
  const view = document.createElement('div');
  view.className = 'tap-view';

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

  // Tap Counter
  const counterLabel = document.createElement('div');
  counterLabel.className = 'tap-counter-label';
  counterLabel.textContent = 'Your Taps';

  const counter = document.createElement('div');
  counter.className = 'tap-counter';
  counter.id = 'tap-counter';
  counter.textContent = String(state.myTapCount);

  // Tap Button
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'tap-button-container';

  const tapButton = document.createElement('button');
  tapButton.className = 'tap-button';
  tapButton.id = 'tap-button';
  tapButton.disabled = !selectedGecko;

  const buttonImg = document.createElement('img');
  buttonImg.src = TAP_BUTTON_IMG;
  buttonImg.alt = 'TAP!';
  tapButton.append(buttonImg);

  tapButton.addEventListener('click', () => {
    if (selectedGecko) {
      actions.sendBoost(selectedGecko.id);
    }
  });

  // Support touch events for faster response
  tapButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (selectedGecko) {
      actions.sendBoost(selectedGecko.id);
    }
  }, { passive: false });

  buttonContainer.append(tapButton);

  // Countdown
  const countdownText = document.createElement('div');
  countdownText.className = 'tap-countdown';
  countdownText.id = 'tap-phase-countdown';
  const remaining = Math.max(0, (state.snapshot?.phaseEndsAt ?? 0) - Date.now());
  countdownText.textContent = `${Math.ceil(remaining / 1000)}s remaining`;

  view.append(counterLabel, counter, buttonContainer, countdownText);
  container.append(view);
}

function updateTapView(container: HTMLElement, state: ClientState, _actions: ApiActions): void {
  const counter = container.querySelector('#tap-counter');
  if (counter) {
    counter.textContent = String(state.myTapCount);
  }

  const countdown = container.querySelector('#tap-phase-countdown');
  if (countdown && state.snapshot) {
    const remaining = Math.max(0, state.snapshot.phaseEndsAt - Date.now());
    countdown.textContent = `${Math.ceil(remaining / 1000)}s remaining`;
  }
}

// ========================
// RACE VIEW
// ========================
function renderRaceView(
  container: HTMLElement,
  state: ClientState,
  animator: Animator,
  raceRunners: Map<string, HTMLElement>
): void {
  const view = document.createElement('div');
  view.className = 'race-view';

  const track = document.createElement('div');
  track.className = 'race-track';

  // Finish Line
  const finishLine = document.createElement('div');
  finishLine.className = 'finish-line';
  view.append(finishLine);

  // Create lanes for each gecko
  state.snapshot?.lizards.forEach((lizard) => {
    const lane = document.createElement('div');
    lane.className = 'race-lane';

    const runner = document.createElement('div');
    runner.className = 'race-runner';
    runner.style.bottom = `${lizard.progress * 100}%`;

    const runnerImg = document.createElement('img');
    runnerImg.src = lizard.image;
    runnerImg.alt = lizard.name;

    const tapCount = document.createElement('div');
    tapCount.className = 'tap-count';
    tapCount.textContent = `${state.snapshot?.clickTotals[lizard.id] ?? 0}`;

    runner.append(runnerImg, tapCount);
    lane.append(runner);

    // Start marker
    const marker = document.createElement('div');
    marker.className = 'lane-marker';
    lane.append(marker);

    track.append(lane);
    raceRunners.set(lizard.id, runner);

    // Register with animator
    animator.register(lizard.id, runner, runner);
  });

  // Slow-mo indicator
  const slowMoIndicator = document.createElement('div');
  slowMoIndicator.className = 'slow-mo-indicator';
  slowMoIndicator.id = 'slow-mo-indicator';
  slowMoIndicator.textContent = 'PHOTO FINISH!';
  slowMoIndicator.style.display = state.snapshot?.isSlowMo ? 'block' : 'none';

  view.append(track, slowMoIndicator);
  container.append(view);
}

function updateRaceView(state: ClientState, raceRunners: Map<string, HTMLElement>): void {
  state.snapshot?.lizards.forEach((lizard) => {
    const runner = raceRunners.get(lizard.id);
    if (runner) {
      // Calculate position from bottom (0% = start, 100% = finish)
      const progress = Math.min(lizard.progress * 100, 95);
      runner.style.bottom = `${progress}%`;

      const tapCount = runner.querySelector('.tap-count');
      if (tapCount) {
        tapCount.textContent = `${state.snapshot?.clickTotals[lizard.id] ?? 0}`;
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
