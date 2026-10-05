#!/usr/bin/env node
/**
 * 장 전환 구간 «시간외 칸» 매일 실측 경보 — 2026-10-05 대표 지적 재발 방지
 *
 *   사고: 10/5 09:32 ET 앱 Command(NVDA·MU) 큰 가격 옆 PRE 칸이 사라졌다(10:0x ET 엔 다시 보였다).
 *     9/30~10/5 매 거래일 09:30~09:47 ET 동안 /api/live/quotes·/api/live/ticker 가 PRE CLOSE 를 비웠다(확정 전 null).
 *     수리 뒤엔 그 구간에도 잠정값(kind 'live' + 체결 시각)이 실려야 한다.
 *
 *   하는 일: 운영 공개 API 를 1~2회 GET 해서 정규장 PRE CLOSE 칸에 쓰는 필드가 비었는지 본다(서버 비용 ≈ 0).
 *     ① /api/live/quotes?symbols=NVDA,AAPL,MU   (앱 Command·Flow 가 15초마다 부르는 것과 같은 요청)
 *     ② /api/live/ticker?t=NVDA&chain=0&skip_alpha=1 (--ticker 일 때만 — 응답 캐시 60초라 대개 캐시 적중)
 *   판정: 정규장인데 extendedPrice ≤ 0 · 라벨 ≠ PRE · 날짜 ≠ 오늘(ET) 이면 «⚠ 전환 구간 시간외 칸 누락» (종료 코드 2)
 *         정규장이 아니면 «건너뜀» (종료 코드 0) — 평일 09:31~09:45 ET(22:31~22:45 KST · 서머타임 해제 뒤 23:31~23:45)에 부른다
 *
 *   실행: node scripts/check-ext-transition.mjs [--ticker] [--base=https://www.signumhq.com] [--symbols=NVDA,AAPL,MU]
 */
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));
const BASE = (args.base || 'https://www.signumhq.com').replace(/\/$/, '');
const SYMBOLS = String(args.symbols || 'NVDA,AAPL,MU').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 signum-ext-check';

const etParts = (ms) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ms));
    const g = (k) => p.find((x) => x.type === k)?.value ?? '';
    return { date: `${g('year')}-${g('month')}-${g('day')}`, hm: `${g('hour')}:${g('minute')}`, hms: `${g('hour')}:${g('minute')}:${g('second')}`, min: Number(g('hour')) * 60 + Number(g('minute')), wd: g('weekday') };
};
const kstHm = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

async function getJson(path) {
    const t0 = Date.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30_000);
    try {
        const r = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cache: 'no-store', signal: ctl.signal });
        const body = await r.json().catch(() => null);
        return { ok: r.ok, status: r.status, ms: Date.now() - t0, body, cache: r.headers.get('x-vercel-cache'), id: r.headers.get('x-vercel-id') };
    } catch (e) {
        return { ok: false, status: 0, ms: Date.now() - t0, body: null, err: String(e?.message || e) };
    } finally {
        clearTimeout(timer);
    }
}

const now = Date.now();
const et = etParts(now);
const head = `[ext-check] ${et.date} ${et.hms} ET (${kstHm(now)} KST)`;
const inWindow = et.min >= 9 * 60 + 30 && et.min < 9 * 60 + 47;   // 프리 종가 확정(09:47 ET) 전 = 잠정값 구간

const q = await getJson(`/api/live/quotes?symbols=${SYMBOLS.join(',')}`);
if (!q.ok || !q.body?.data) {
    console.log(`${head} ⚠ 시세 응답 실패 — HTTP ${q.status} ${q.err || ''} (${q.ms}ms) · 다음 회차에 다시 본다`);
    process.exit(3);
}
const session = String(q.body.session || '');
if (session !== 'regular') {
    console.log(`${head} 건너뜀 — 지금 세션 «${session || '?'}» (정규장일 때만 본다 · 평일 09:31~09:45 ET 에 부를 것)`);
    process.exit(0);
}

const rows = [];
const missing = [];
for (const s of SYMBOLS) {
    const d = q.body.data[s] || {};
    const ok = Number(d.extendedPrice) > 0 && d.extendedLabel === 'PRE' && d.extendedDate === et.date;
    const kind = d.extendedKind || '?';
    const asOf = d.extendedTime ? etParts(Date.parse(d.extendedTime)).hms : '-';
    rows.push(`${s} ${ok ? '✓' : '✗'} PRE ${Number(d.extendedPrice) > 0 ? d.extendedPrice : '—'} (${kind}${kind === 'live' ? ` · ${asOf} ET 기준` : ''}${d.extendedDate && d.extendedDate !== et.date ? ` · 날짜 ${d.extendedDate}` : ''})`);
    if (!ok) missing.push(s);
}

let tickerLine = '';
if (args.ticker) {
    const s = SYMBOLS[0];
    const tr = await getJson(`/api/live/ticker?t=${s}&chain=0&skip_alpha=1`);
    const ex = tr.body?.extended || {};
    const ok = tr.ok && Number(ex.prePrice) > 0 && ex.preDate === et.date;
    tickerLine = ` · ticker ${s} ${ok ? '✓' : '✗'} prePrice ${ex.prePrice ?? '—'} (${ex.preKind ?? '?'}) ${tr.ms}ms`;
    if (!ok) missing.push(`${s}(ticker)`);
}

const where = inWindow ? '전환 구간(09:30~09:47 ET, 잠정값 구간)' : '정규장';
if (missing.length) {
    console.log(`${head} ⚠ 전환 구간 시간외 칸 누락 — ${where} · 비어 있음: ${missing.join(', ')} · ${rows.join(' | ')}${tickerLine} · quotes ${q.ms}ms`);
    process.exit(2);
}
console.log(`${head} ✓ 시간외 칸 정상 — ${where} · ${rows.join(' | ')}${tickerLine} · quotes ${q.ms}ms`);
process.exit(0);
