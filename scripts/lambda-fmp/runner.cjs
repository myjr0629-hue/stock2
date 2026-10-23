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
  const finish = reason => ({ complete: state.complete, cursor: state.cursor, total: universe.length, reason, durationMs: now()-start });
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
      `grades-consensus?symbol=${ticker}`, `price-target-consensus?symbol=${ticker}`, `analyst-estimates?symbol=${ticker}&period=annual`,
    ];
    const path = inCalendar
      ? `earnings-calendar?from=${addDays(date, state.calendarOffset)}&to=${addDays(date, Math.min(179, state.calendarOffset+13))}`
      : paths[state.partial.length];
    let response, data;
    try {
      response = await request(path);
      await guard.observe(response, 'lambda');
      if (!response.ok) { await checkpoint(state); return finish('http_unavailable'); }
      data = await response.json();
      if (!Array.isArray(data)) { await checkpoint(state); return finish('invalid_payload'); }
    } catch { await checkpoint(state); return finish('request_unavailable'); }
    if (inCalendar) {
      // Never advance a truncated calendar; keep the previous published data.
      if (data.length >= 4000) { await checkpoint(state); return finish('calendar_truncated'); }
      for (const row of data) {
        if (!tickerSet.has(row.symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
        if (!state.calendar[row.symbol] || row.date < state.calendar[row.symbol].date) {
          state.calendar[row.symbol] = { date: row.date, epsEstimated: row.epsEstimated ?? null };
        }
      }
      state.calendarOffset += 14;
    } else {
      state.partial.push(data);
      if (state.partial.length === 3) {
        await save(ticker, state.partial, state.calendar[ticker] || null);
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
