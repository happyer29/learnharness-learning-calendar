const calendarIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18M7 14h2m3 0h2m-7 3h2"/></svg>';
const refreshIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.1 8a7.7 7.7 0 0 1 13.6-2l1.3 2M4 16l1.3 2A7.7 7.7 0 0 0 19 16"/></svg>';
const months = new Intl.DateTimeFormat('en', {month: 'short', timeZone: 'UTC'});
const fullDate = new Intl.DateTimeFormat('en', {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'});
const shortDate = new Intl.DateTimeFormat('en', {month: 'short', day: 'numeric', timeZone: 'UTC'});
const dayLength = 86400000;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Calendar arithmetic uses UTC midnight as a civil date. The user's local
// calendar is consulted only to identify today and to request native records.
function dateValue(key) { return new Date(key + 'T00:00:00.000Z'); }
function dateKey(value) { return value.toISOString().slice(0, 10); }
function move(key, days) { return dateKey(new Date(dateValue(key).getTime() + days * dayLength)); }
function localToday() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}
function weekday(key) { return (dateValue(key).getUTCDay() + 6) % 7; }
function plural(value, singular, multiple = singular + 's') {
  return value.toLocaleString('en') + ' ' + (value === 1 ? singular : multiple);
}
function intensity(count) { return count >= 40 ? 'four' : count >= 15 ? 'three' : count >= 5 ? 'two' : 'one'; }
function currentStreak(records, today) {
  let cursor = records.has(today) ? today : move(today, -1);
  let run = 0;
  while (records.has(cursor)) { run += 1; cursor = move(cursor, -1); }
  return run;
}
function legendItem(label, style, title) {
  const item = el('li', 'lc-legend-item');
  const tile = el('span', 'lc-tile');
  tile.dataset.state = style;
  if (style === 'today') tile.classList.add('lc-today');
  tile.setAttribute('aria-hidden', 'true');
  item.append(tile, document.createTextNode(label));
  if (title) item.title = title;
  return item;
}
function stat(label, value, note) {
  const item = el('div', 'lc-stat');
  item.append(el('dt', 'lc-stat-label', label), el('dd', 'lc-stat-value', value), el('dd', 'lc-stat-note', note));
  return item;
}

function mountCalendar(ctx, container, signal) {
  const root = el('div', 'lh-learning-calendar');
  const content = el('div', 'lc-content');
  const header = el('div', 'lc-header');
  const heading = el('h1', 'lc-heading', 'Activity overview');
  const controls = el('div', 'lc-controls');
  const select = el('select', 'lc-year');
  select.setAttribute('aria-label', 'Calendar year');
  select.disabled = true;
  const refreshSlot = el('span', 'lc-refresh');
  controls.append(select, refreshSlot);
  header.append(heading, controls);
  const status = el('p', 'lc-status', 'Reading your learning history…');
  status.setAttribute('role', 'status');
  const stats = el('dl', 'lc-stats');
  const panel = el('section', 'lc-panel');
  const panelHeading = el('div', 'lc-panel-heading');
  panelHeading.append(el('h2', 'lc-section-title', 'Daily activity'), el('p', 'lc-muted', 'Select a day to see what you worked on.'));
  const chartWrap = el('div', 'lc-chart-wrap');
  const dayLabels = el('div', 'lc-weekdays');
  dayLabels.setAttribute('aria-hidden', 'true');
  for (const name of ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']) dayLabels.append(el('span', '', name));
  const scroller = el('div', 'lc-scroll');
  const grid = el('div', 'lc-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Daily learning activity. Use the arrow keys to select a date.');
  scroller.append(grid);
  chartWrap.append(dayLabels, scroller);
  const legends = el('div', 'lc-legends');
  const stateKey = el('ul', 'lc-legend');
  stateKey.setAttribute('aria-label', 'Day states');
  stateKey.append(legendItem('No activity', 'empty'), legendItem('Before history', 'before'), legendItem('Future', 'future'), legendItem('Today', 'today'));
  const scale = el('ul', 'lc-legend lc-scale');
  scale.setAttribute('aria-label', 'Number of learning actions per day');
  const keyTitle = el('li', 'lc-scale-title', 'Actions');
  scale.append(keyTitle, legendItem('1–4', 'one'), legendItem('5–14', 'two'), legendItem('15–39', 'three'), legendItem('40+', 'four'));
  legends.append(scale, stateKey);
  panel.append(panelHeading, chartWrap, legends);
  const detail = el('section', 'lc-detail');
  detail.setAttribute('aria-label', 'Selected day');
  const detailHeading = el('h2', 'lc-section-title');
  detailHeading.setAttribute('aria-live', 'polite');
  const detailBody = el('div', 'lc-detail-body');
  detail.append(detailHeading, detailBody);
  const footer = el('p', 'lc-source', 'Each action is a learner message, side-chat message, or quiz or practice submission recorded by LearnHarness.');
  content.append(header, status, stats, panel, detail, footer);
  root.append(content);
  container.append(root);

  let today = localToday();
  let year = Number(today.slice(0, 4));
  let selected = today;
  let first = '';
  let records = new Map();
  let loaded = false;
  let pending = false;
  let repeat = false;
  let midnightTimer;
  let tiles = new Map();
  let disposed = false;
  const refresh = ctx.ui.mountButton(refreshSlot, {
    label: 'Refresh', icon: refreshIcon, variant: 'outline', size: 'sm', onClick: requestData,
  }, {signal});
  [stats, panel, detail, footer].forEach(node => { node.hidden = true; });

  function stateOf(date) {
    if (date > today) return 'future';
    const entry = records.get(date);
    if (entry) return intensity(entry.count);
    if (date < today && (!first || date < first)) return 'before';
    return 'empty';
  }
  function description(date) {
    const entry = records.get(date);
    const value = entry ? plural(entry.count, 'action') :
      date > today ? 'Future day' : stateOf(date) === 'before' ? 'Before recorded history' : 'No recorded activity';
    return fullDate.format(dateValue(date)) + ' · ' + value + (date === today ? ' · Today' : '');
  }
  function datesInYear() {
    const prefix = year + '-';
    return [...records.keys()].filter(key => key.startsWith(prefix)).sort();
  }
  function defaultDay() {
    const dates = datesInYear();
    return dates.at(-1) || (year === Number(today.slice(0, 4)) ? today : year + '-12-31');
  }
  function populateYears() {
    const current = Number(today.slice(0, 4));
    const earliest = first ? Number(first.slice(0, 4)) : current;
    year = Math.max(earliest, Math.min(current, year));
    const options = document.createDocumentFragment();
    for (let value = current; value >= earliest; value--) {
      const opt = el('option', '', value);
      opt.value = String(value);
      opt.selected = value === year;
      options.append(opt);
    }
    select.replaceChildren(options);
    select.disabled = false;
  }
  function renderStats() {
    const dates = datesInYear();
    const total = dates.reduce((sum, key) => sum + records.get(key).count, 0);
    const streak = currentStreak(records, today);
    const jan = year + '-01-01';
    const dec = year + '-12-31';
    const start = first > jan ? first : jan;
    const yesterday = move(today, -1);
    const end = yesterday < dec ? yesterday : dec;
    const completed = first && start <= end ? Math.round((dateValue(end) - dateValue(start)) / dayLength) + 1 : 0;
    const inactive = completed - dates.filter(key => key >= start && key <= end).length;
    const historyRange = completed ? shortDate.format(dateValue(start)) + ' – ' + shortDate.format(dateValue(end)) : 'no completed days';
    stats.replaceChildren(
      stat('Active days', dates.length.toLocaleString('en'), 'in ' + year),
      stat('Days without activity', inactive.toLocaleString('en'), historyRange),
      stat('Learning actions', total.toLocaleString('en'), 'in ' + year),
      stat('Current streak', plural(streak, 'day'), 'as of ' + shortDate.format(dateValue(today))),
    );
  }
  function renderDetail() {
    detailHeading.textContent = fullDate.format(dateValue(selected));
    const data = records.get(selected);
    if (!data) {
      const message = selected === today ? 'No learning activity recorded today yet.' :
        stateOf(selected) === 'before' ? 'This date is before your first recorded learning activity.' : 'No learning activity recorded on this day.';
      detailBody.replaceChildren(el('p', 'lc-empty', !first && selected < today ? 'Your learning history is empty.' : message));
      return;
    }
    const summary = el('p', 'lc-detail-summary', plural(data.count, 'learning action') + ' across ' + plural(data.sessions.length, 'session'));
    const list = el('ul', 'lc-sessions');
    for (const session of data.sessions) {
      const row = el('li', 'lc-session');
      const kind = session.kind === 'practice' ? 'Practice' : 'Teaching';
      const category = el('span', 'lc-kind', kind);
      const title = el('button', 'lc-session-title', session.title || 'Untitled session');
      title.type = 'button';
      title.setAttribute('aria-label', 'Open ' + kind.toLowerCase() + ' session: ' + title.textContent);
      title.addEventListener('click', () => ctx.app.openSession(session.id));
      const text = el('div', 'lc-session-text');
      text.append(category, title);
      const counts = [];
      if (session.messages) counts.push(plural(session.messages, 'message'));
      if (session.answers) counts.push(plural(session.answers, 'submission'));
      if (session.sideMessages) counts.push(plural(session.sideMessages, 'side-chat message'));
      row.append(text, el('span', 'lc-counts', counts.join(' · ')));
      list.append(row);
    }
    detailBody.replaceChildren(summary, list);
  }
  function revealSelected() {
    const target = tiles.get(selected);
    if (!target || !scroller.clientWidth) return;
    const start = target.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
    if (start < 2 || start + target.offsetWidth > scroller.clientWidth - 2) {
      scroller.scrollLeft += start - (scroller.clientWidth - target.offsetWidth) / 2;
    }
  }
  function selectDay(date, focus = false) {
    const next = tiles.get(date);
    if (!next || next.disabled) return;
    const previous = tiles.get(selected);
    if (previous) { previous.tabIndex = -1; previous.setAttribute('aria-pressed', 'false'); }
    selected = date;
    next.tabIndex = 0;
    next.setAttribute('aria-pressed', 'true');
    renderDetail();
    if (focus) { next.focus({preventScroll: true}); revealSelected(); }
  }
  function renderGrid() {
    const keepFocus = grid.contains(document.activeElement);
    const firstOfYear = year + '-01-01';
    const start = move(firstOfYear, -weekday(firstOfYear));
    const end = year + '-12-31';
    const weeks = Math.floor((dateValue(end) - dateValue(start)) / dayLength / 7) + 1;
    grid.style.setProperty('--lc-weeks', String(weeks));
    const startTime = dateValue(start).getTime();
    const fragment = document.createDocumentFragment();
    tiles = new Map();
    for (let date = firstOfYear; date <= end; date = move(date, 1)) {
      const value = dateValue(date);
      const column = Math.floor((value.getTime() - startTime) / dayLength / 7) + 1;
      if (value.getUTCDate() === 1) {
        const label = el('span', 'lc-month', months.format(value));
        label.style.gridColumn = String(column);
        label.style.gridRow = '1';
        label.setAttribute('aria-hidden', 'true');
        fragment.append(label);
      }
      const tile = el('button', 'lc-tile');
      tile.type = 'button';
      tile.dataset.date = date;
      tile.dataset.state = stateOf(date);
      tile.style.gridColumn = String(column);
      tile.style.gridRow = String(weekday(date) + 2);
      tile.disabled = date > today;
      tile.tabIndex = date === selected ? 0 : -1;
      tile.setAttribute('aria-pressed', String(date === selected));
      tile.title = description(date);
      tile.setAttribute('aria-label', tile.title);
      if (date === today) { tile.classList.add('lc-today'); tile.setAttribute('aria-current', 'date'); }
      tiles.set(date, tile);
      fragment.append(tile);
    }
    grid.replaceChildren(fragment);
    if (keepFocus) tiles.get(selected)?.focus({preventScroll: true});
    revealSelected();
  }
  grid.addEventListener('click', event => {
    const tile = event.target.closest('button[data-date]');
    if (tile) selectDay(tile.dataset.date);
  });
  grid.addEventListener('keydown', event => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const origin = event.target.closest('button[data-date]')?.dataset.date;
    if (!origin) return;
    const offsets = {ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7};
    let date;
    if (Object.hasOwn(offsets, event.key)) date = move(origin, offsets[event.key]);
    else if (event.key === 'Home') date = year + '-01-01';
    else if (event.key === 'End') date = year === Number(today.slice(0, 4)) ? today : year + '-12-31';
    else return;
    event.preventDefault();
    selectDay(date, true);
  });
  select.addEventListener('change', () => {
    year = Number(select.value); selected = defaultDay();
    renderStats(); renderGrid(); renderDetail();
  });

  async function requestData() {
    if (disposed || signal.aborted || document.hidden) return;
    if (pending) { repeat = true; return; }
    pending = true;
    refresh.update({disabled: true});
    try {
      do {
        repeat = false;
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const result = await ctx.call('activity', {timeZone: zone});
        if (disposed || signal.aborted) return;
        if (!Array.isArray(result?.days)) throw new Error('Unexpected response from the activity reader.');
        const previousToday = today;
        today = localToday();
        if (year === Number(previousToday.slice(0, 4)) && previousToday !== today && selected === previousToday) {
          year = Number(today.slice(0, 4)); selected = today;
        }
        records = new Map(result.days.filter(day => day.count > 0 && day.date <= today).map(day => [day.date, day]));
        first = [...records.keys()].sort()[0] || '';
        populateYears();
        if (!loaded || Number(selected.slice(0, 4)) !== year) selected = defaultDay();
        loaded = true;
        [stats, panel, detail, footer].forEach(node => { node.hidden = false; });
        renderStats(); renderGrid(); renderDetail();
        status.textContent = result.skippedSessions ? plural(result.skippedSessions, 'session') + ' could not be read. The calendar and totals are based on the remaining sessions.' : '';
      } while (repeat && !document.hidden && !disposed);
    } catch (error) {
      if (!disposed && !signal.aborted) status.textContent = (loaded ? 'Showing the last loaded calendar. ' : '') + 'Could not read learning history. Use Refresh to try again. ' + (error?.message || '');
    } finally {
      pending = false;
      if (!disposed && !signal.aborted) refresh.update({disabled: false});
    }
  }
  function nextMidnight() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    midnightTimer = setTimeout(() => { void requestData(); nextMidnight(); }, tomorrow.getTime() - now.getTime() + 100);
  }
  const onVisible = () => { if (!document.hidden) void requestData(); };
  document.addEventListener('visibilitychange', onVisible);
  const unsubscribe = ctx.onResync(onVisible);
  nextMidnight();
  void requestData();
  function cleanup() {
    if (disposed) return;
    disposed = true;
    clearTimeout(midnightTimer);
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
    signal.removeEventListener('abort', cleanup);
    refresh.dispose();
    root.remove();
  }
  signal.addEventListener('abort', cleanup, {once: true});
  return cleanup;
}

export function activate(ctx) {
  const registrations = [
    ctx.registerView({id: 'calendar', name: 'Learning calendar', mount: (container, signal) => mountCalendar(ctx, container, signal)}),
    ctx.registerAction({id: 'open', name: 'Learning calendar', icon: calendarIcon, run: () => ctx.app.openView('calendar')}),
    ctx.placeAction({id: 'sidebar-open', actionId: 'open', location: 'sidebar'}),
  ];
  return () => registrations.reverse().forEach(dispose => dispose());
}
