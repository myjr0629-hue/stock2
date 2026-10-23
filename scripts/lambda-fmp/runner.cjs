const { createHash } = require('node:crypto');
function marketDate(ms) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms);
  const v = Object.fromEntries(p.map(x => [x.type, x.value]));
  const minute = Number(v.hour)*60+Number(v.minute);
  return { date: `${v.year}-${v.month}-${v.day}`, eligible: !['Sat', 'Sun'].includes(v.weekday) && minute >= 615 && minute < 1200 };
}
const addDays = (date, n) => new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
async function runSlice({ state, universe, date, now, remainingMs, sleep, guard, request, checkpoint, save }) {
  const start = now();
  const hash = createHash('sha256').update(JSON.stringify(universe)).digest('hex');
  if (state.universeHash && state.universeHash !== hash) throw new Error('FMP_UNIVERSE_CHANGED');
  state.universeHash = hash;
  const timeLeft = () => now()-start < 780000 && remainingMs() > 60000;
  const finish = reason => ({ complete: state.complete, cursor: state.cursor, total: universe.length, reason, durationMs: now()-start,
    failedTickers: Object.keys(state.failures || {}).length, failedCalendarWindows: (state.calendarFailures || []).length });
  const tickerSet = new Set(universe);
  while (!state.complete && timeLeft()) {
    const permit = await guard.reserve('lambda');
    if (!permit.allowed) {
      // Account cooldown/store outages yield immediately; short budget contention can wait in this slice.
      if (permit.retryMs > 1000) { await checkpoint(state); return finish('account_unavailable'); }
      await sleep(1000); continue;
    }
    const inCalendar = state.calendarOffset < 180;
    const ticker = universe[state.cursor];
    if (!inCalendar && !ticker) { state.complete = true; break; }
    const paths = [
      `grades-consensus?symbol=${ticker}`, `price-target-consensus?symbol=${ticker}`,
    ];
    // Incomplete calendar runs retain EARNINGS, so do not spend a request on
    // forward estimates that cannot be published in this run.
    if (!state.calendarFailures?.length) paths.push(`analyst-estimates?symbol=${ticker}&period=annual`);
    if (inCalendar && !state.calendarWindows?.length) {
      state.calendarWindows = [{ from: state.calendarOffset, to: Math.min(179, state.calendarOffset+13) }];
    }
    const window = inCalendar ? state.calendarWindows[0] : null;
    const path = inCalendar
      ? `earnings-calendar?from=${addDays(date, window.from)}&to=${addDays(date, window.to)}`
      : paths[state.partial.length];
    // A symbol-local failure must not pin the daily cursor. Keep published data,
    // discard partial work and persist only fixed classifications (never response bodies).
    const skipTicker = async (reason, status) => {
      state.failures ||= {};
      state.failures[ticker] = { endpoint: path.split('?')[0], reason, ...(status == null ? {} : { status }) };
      state.cursor++;
      state.partial = [];
      state.complete = state.cursor === universe.length;
      await checkpoint(state);
    };
    let response, data;
    let failure;
    try {
      response = await request(path);
      await guard.observe(response, 'lambda');
      if (!response.ok) failure = 'http_unavailable';
      else {
        data = await response.json();
        if (!Array.isArray(data)) failure = 'invalid_payload';
      }
    } catch { failure = 'request_unavailable'; }
    if (failure) {
      // Account-wide restrictions retain the current endpoint for a later slice.
      if (inCalendar || response?.status === 402 || response?.status === 429) {
        await checkpoint(state); return finish(failure);
      }
      await skipTicker(failure, response?.status);
      continue;
    }
    if (inCalendar) {
      if (data.length >= 4000 && window.from < window.to) {
        const mid = Math.floor((window.from+window.to)/2);
        state.calendarWindows.splice(0, 1, { from: window.from, to: mid }, { from: mid+1, to: window.to });
        await checkpoint(state);
        continue;
      }
      // A single saturated day cannot be split further. Record and advance,
      // but do not publish earnings from an incomplete calendar later in this run.
      if (data.length >= 4000) {
        state.calendarFailures ||= [];
        state.calendarFailures.push({ from: window.from, to: window.to, reason: 'calendar_truncated' });
      } else for (const row of data) {
        if (!tickerSet.has(row.symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
        if (!state.calendar[row.symbol] || row.date < state.calendar[row.symbol].date) {
          state.calendar[row.symbol] = { date: row.date, epsEstimated: row.epsEstimated ?? null };
        }
      }
      state.calendarWindows.shift();
      state.calendarOffset = window.to+1;
    } else {
      state.partial.push(data);
      if (state.partial.length === paths.length) {
        await save(ticker, state.partial, state.calendar[ticker] || null, !state.calendarFailures?.length);
        state.cursor++;
        state.partial = [];
        state.complete = state.cursor === universe.length;
      }
    }
    // Checkpoint each endpoint, so cooldown/deadline never loses partial ticker work.
    await checkpoint(state);
  }
  await checkpoint(state);
  return finish(state.complete ? 'complete' : 'deadline');
}
module.exports = { marketDate, runSlice };
