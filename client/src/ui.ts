import type { ApiActions } from './api';
import type { Animator } from './animation';
import type { ClientState, LizardView, Store } from './store';
import logoPath from './assets/logo.svg?url';

interface LizardElements {
  card: HTMLLIElement;
  name: HTMLElement;
  wins: HTMLElement;
  progressFill: HTMLElement;
  runnerToken: HTMLElement;
  progressText: HTMLElement;
  supportersText: HTMLElement;
}

export function mountUI(store: Store, actions: ApiActions, animator: Animator, container: HTMLElement): void {
  const root = document.createElement('div');
  root.id = 'app';

  const hero = createHero();
  const lineup = createLineup();
  const control = createControl();
  const toast = createToast();
  const countdown = createCountdown();

  root.append(hero.section, lineup.section, control.section);
  container.innerHTML = '';
  container.append(root);
  document.body.append(toast.element, countdown.overlay);

  const lizardMap = new Map<string, LizardElements>();

  store.subscribe((state) => {
    updateHero(hero, state);
    updateLineup(lineup, state, actions, animator, lizardMap);
    updateControl(control, state, actions);
    updateToast(toast, state);
    updateCountdown(countdown, state);
  });
}

function createHero() {
  const section = document.createElement('section');
  section.className = 'glass hero';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'hero-title';

  const logo = document.createElement('img');
  logo.src = logoPath;
  logo.alt = 'Gecko Sprint';
  logo.width = 96;
  logo.height = 96;

  const textWrap = document.createElement('div');
  const title = document.createElement('h1');
  title.textContent = 'Gecko Sprint';
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Ten neon geckos sprint for glory. Tap your favourite and give it the burst it needs to break the tape first.';

  textWrap.append(title, subtitle);
  titleWrap.append(logo, textWrap);

  const meta = document.createElement('div');
  meta.style.display = 'flex';
  meta.style.flexDirection = 'column';
  meta.style.alignItems = 'flex-end';
  meta.style.gap = '10px';

  const connection = document.createElement('div');
  connection.className = 'connection-pill';
  connection.dataset.state = 'connecting';
  connection.innerHTML = '<span class="status-dot"></span><span>CONNECTING</span>';

  const phaseLabel = document.createElement('span');
  phaseLabel.style.fontWeight = '600';
  phaseLabel.style.letterSpacing = '0.05em';
  phaseLabel.textContent = 'LOBBY';

  meta.append(connection, phaseLabel);
  section.append(titleWrap, meta);

  return { section, connection, phaseLabel };
}

function updateHero(hero: ReturnType<typeof createHero>, state: ClientState) {
  hero.connection.dataset.state = state.connection;
  const label = hero.connection.querySelector('span:last-child');
  if (label) {
    label.textContent = state.connection.toUpperCase();
  }
  if (state.snapshot) {
    const { phase, round, isSlowMo, phaseEndsAt } = state.snapshot;
    if (phase === 'LOBBY') {
      const remaining = Math.max(0, phaseEndsAt - Date.now());
      hero.phaseLabel.textContent = `LOBBY - Next race in ${formatCountdown(remaining)}`;
    } else {
      const slowMoTag = isSlowMo ? ' (SLOW-MO)' : '';
      hero.phaseLabel.textContent = `${phase} - Round ${round}${slowMoTag}`;
    }
  }
}

function createLineup() {
  const section = document.createElement('section');
  section.className = 'glass lineup';
  const heading = document.createElement('h2');
  heading.textContent = 'Race Lineup';
  section.append(heading);

  const list = document.createElement('ul');
  list.style.margin = '0';
  list.style.padding = '0';
  list.style.display = 'grid';
  list.style.gap = '14px';
  list.style.listStyle = 'none';
  section.append(list);

  return { section, list };
}

function updateLineup(
  lineup: ReturnType<typeof createLineup>,
  state: ClientState,
  actions: ApiActions,
  animator: Animator,
  lizardMap: Map<string, LizardElements>
) {
  const snapshot = state.snapshot;
  if (!snapshot) {
    lineup.list.innerHTML = '';
    lizardMap.clear();
    return;
  }

  const seen = new Set<string>();
  snapshot.lizards.forEach((lizard) => {
    let entry = lizardMap.get(lizard.id);
    if (!entry) {
      entry = buildLizardCard(lizard, () => actions.selectLizard(lizard.id));
      lizardMap.set(lizard.id, entry);
      lineup.list.append(entry.card);
      animator.register(lizard.id, entry.runnerToken, entry.progressFill);
    }
    const supporters = snapshot.clickTotals[lizard.id] ?? 0;
    updateLizardCard(entry, lizard, state.selectedLizardId, supporters);
    seen.add(lizard.id);
  });

  Array.from(lizardMap.keys()).forEach((id) => {
    if (!seen.has(id)) {
      const existing = lizardMap.get(id);
      if (existing) {
        existing.card.remove();
        animator.unregister(id);
      }
      lizardMap.delete(id);
    }
  });
}

function buildLizardCard(lizard: LizardView, onSelect: () => void): LizardElements {
  const card = document.createElement('li');
  card.className = 'lizard-card';
  card.addEventListener('click', onSelect);

  const header = document.createElement('div');
  header.className = 'lizard-header';

  const name = document.createElement('div');
  name.className = 'lizard-name';
  name.textContent = lizard.name;

  const wins = document.createElement('div');
  wins.className = 'lizard-meta';
  wins.textContent = `Wins ${lizard.wins}`;

  header.append(name, wins);

  const progressTrack = document.createElement('div');
  progressTrack.className = 'progress-track';
  progressTrack.style.setProperty('--accent', lizard.color);

  const progressFill = document.createElement('div');
  progressFill.className = 'progress-fill';
  progressTrack.append(progressFill);

  const runnerToken = document.createElement('div');
  runnerToken.className = 'runner-token';
  progressTrack.append(runnerToken);

  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const progressText = document.createElement('span');
  progressText.textContent = '0%';
  const supportersText = document.createElement('span');
  supportersText.textContent = 'Supporters 0';
  footer.append(progressText, supportersText);

  card.append(header, progressTrack, footer);

  return {
    card,
    name,
    wins,
    progressFill,
    runnerToken,
    progressText,
    supportersText
  };
}

function updateLizardCard(
  elements: LizardElements,
  lizard: LizardView,
  selectedId: string | null,
  supporters: number
) {
  elements.card.dataset.selected = String(selectedId === lizard.id);
  elements.card.style.setProperty('--accent', lizard.color);
  elements.name.textContent = lizard.name;
  elements.wins.textContent = `Wins ${lizard.wins}`;

  const percent = Math.round(lizard.progress * 100);
  elements.progressText.textContent = lizard.finishTime ? formatMillis(lizard.finishTime) : `${percent}%`;
  elements.supportersText.textContent = `Supporters ${supporters}`;
}

function createControl() {
  const section = document.createElement('section');
  section.className = 'glass control-panel';

  const heading = document.createElement('h2');
  heading.textContent = 'Command Center';

  const selectionBanner = document.createElement('div');
  selectionBanner.className = 'selection-banner';
  const bannerLabel = document.createElement('span');
  bannerLabel.textContent = 'Selected Gecko';
  const bannerValue = document.createElement('strong');
  bannerValue.textContent = '---';
  selectionBanner.append(bannerLabel, bannerValue);

  const joinNotice = document.createElement('div');
  joinNotice.className = 'join-warning';
  joinNotice.style.display = 'none';
  joinNotice.textContent = 'Preparing next race. Please join the upcoming lobby.';

  const boostButton = document.createElement('button');
  boostButton.type = 'button';
  boostButton.className = 'boost-button';
  boostButton.textContent = 'Waiting for click window';

  const resultBlock = document.createElement('div');
  const resultHeading = document.createElement('h3');
  resultHeading.textContent = 'Finish Order';
  const resultList = document.createElement('ol');
  resultList.className = 'results-list';
  resultBlock.append(resultHeading, resultList);

  section.append(heading, selectionBanner, joinNotice, boostButton, resultBlock);

  return { section, bannerValue, boostButton, resultList, joinNotice };
}

function updateControl(control: ReturnType<typeof createControl>, state: ClientState, actions: ApiActions) {
  const selected = state.snapshot?.lizards.find((lz) => lz.id === state.selectedLizardId);
  control.bannerValue.textContent = selected ? selected.name : 'Choose one';

  const canBoost = Boolean(
    selected &&
      state.connection === 'connected' &&
      state.snapshot &&
      state.snapshot.phase === 'CLICK_WINDOW'
  );
  control.boostButton.disabled = !canBoost;
  control.boostButton.textContent = canBoost ? 'Fire Boost!' : 'Waiting for click window';
  control.boostButton.onclick = () => {
    if (selected) {
      actions.sendBoost(selected.id);
    }
  };

  const snapshot = state.snapshot;
  let showJoinNotice = false;
  if (snapshot) {
    const remainingMs = snapshot.phaseEndsAt - Date.now();
    if (snapshot.phase === 'LOBBY' && remainingMs <= 15_000) {
      control.joinNotice.textContent = 'Less than 15 seconds remain - join the next race!';
      showJoinNotice = true;
    } else if (snapshot.phase !== 'LOBBY') {
      control.joinNotice.textContent =
        snapshot.phase === 'CLICK_WINDOW'
          ? 'Click window in progress. New boosts join next round.'
          : 'Race underway. Hang tight for the next lobby.';
      showJoinNotice = true;
    }
  }
  control.joinNotice.style.display = showJoinNotice ? 'block' : 'none';

  const list = control.resultList;
  list.innerHTML = '';
  const lizards = state.snapshot?.lizards ?? [];
  const ordered = [...lizards]
    .filter((entry) => entry.finishTime != null)
    .sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity));
  ordered.slice(0, 5).forEach((entry, index) => {
    const item = document.createElement('li');
    const rank = document.createElement('span');
    rank.textContent = String(index + 1);
    const name = document.createElement('span');
    name.textContent = entry.name;
    const time = document.createElement('span');
    time.textContent = formatMillis(entry.finishTime);
    item.append(rank, name, time);
    list.append(item);
  });
}

function createToast() {
  const element = document.createElement('div');
  element.className = 'toast';
  element.style.display = 'none';
  return { element };
}

function updateToast(toast: ReturnType<typeof createToast>, state: ClientState) {
  if (!state.toast) {
    toast.element.style.display = 'none';
    return;
  }
  toast.element.style.display = 'block';
  toast.element.dataset.tone = state.toast.tone;
  toast.element.textContent = state.toast.message;
}

function createCountdown() {
  const overlay = document.createElement('div');
  overlay.className = 'countdown-overlay';
  const digit = document.createElement('div');
  digit.className = 'countdown-digit';
  overlay.append(digit);
  return { overlay, digit };
}

function updateCountdown(countdown: ReturnType<typeof createCountdown>, state: ClientState) {
  if (!state.snapshot) {
    countdown.overlay.dataset.visible = 'false';
    return;
  }
  const phase = state.snapshot.phase;
  if (phase === 'CLICK_WINDOW') {
    const seconds = Math.max(0, Math.ceil((state.snapshot.phaseEndsAt - Date.now()) / 1000));
    countdown.overlay.dataset.visible = 'true';
    countdown.digit.textContent = seconds > 0 ? String(seconds) : 'GO!';
  } else {
    countdown.overlay.dataset.visible = 'false';
  }
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + String(seconds).padStart(2, '0');
}

function formatMillis(ms?: number): string {
  if (ms == null) return '--';
  return `${(ms / 1000).toFixed(2)}s`;
}
