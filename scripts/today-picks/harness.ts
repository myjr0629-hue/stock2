/**
 * «✦ AI 오늘 볼 것» 해설 한 줄 프롬프트 하네스 (2026-10-13) — 합성 시나리오 12개(고래 3 · 다크풀 2 · 감마 5 · 실적 2)를 운영 /api/admin/ai-ab(adhoc, Haiku 5.5 크레딧)로 돌려
 * 출구 가드(checkPickWhy)를 통과하는 비율·지연·비용을 잰다. 시험 호출도 월 원장에 센다(tag today-picks-harness) — 36호출 ≈ $0.01.
 * 실행: CRON_SECRET=… ROUNDS=3 node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' scripts/today-picks/harness.ts
 */
import { TP_SYSTEM, buildPickUserPrompt, checkPickWhy } from '@/lib/ai/todayPicksLine';
import type { PickFacts } from '@/lib/todayPicks/types';
const SECRET = process.env.CRON_SECRET;
if (!SECRET) { console.error('CRON_SECRET 환경변수가 필요하다(운영 Vercel 환경변수 → 임시 파일로 읽고 끝나면 삭제 — 값은 출력·기록하지 않는다).'); process.exit(2); }
const ROUNDS = Number(process.env.ROUNDS || 2);
const TODAY = '2026-10-13';
const S: Array<[string, PickFacts]> = [
  ['INTC', { kind: 'whale', openedOn: '2026-10-09', notional: 1.37e9, callPct: 100, best: { type: 'call', strike: 115, expiry: '2026-10-23', added: 35418, oi: 39675, notional: 4.07e8 }, jump: 9.3 }],
  ['AAPL', { kind: 'whale', openedOn: '2026-10-09', notional: 1.12e9, callPct: 17, best: { type: 'put', strike: 230, expiry: '2026-10-16', added: 18594, oi: 23125, notional: 4.28e8 }, jump: 5.1 }],
  ['XYZ', { kind: 'whale', openedOn: '2026-10-09', notional: 2.2e8, callPct: 55, best: { type: 'call', strike: 80, expiry: '2026-12-18', added: 6200, oi: 6200, notional: 4.9e7 }, jump: null }],
  ['BMY', { kind: 'darkpool', date: '2026-10-12', pct: 35.6, ratio: 2.3, volume: 8041637, marketAvg: 51.1 }],
  ['CMG', { kind: 'darkpool', date: '2026-10-12', pct: 62.4, ratio: 3.1, volume: 12777199, marketAvg: 51.1 }],
  ['AAPL', { kind: 'gamma', level: 'gammaFlip', chainDate: '2026-10-12', expiry: '2026-10-16', spot: 340.7, levelPrice: 340, distPct: 0.21, side: 'a' }],
  ['TSLA', { kind: 'gamma', level: 'gammaFlip', chainDate: '2026-10-12', expiry: '2026-10-16', spot: 377.77, levelPrice: 390, distPct: 3.2, side: 'b' }],
  ['PYPL', { kind: 'gamma', level: 'gammaFlip', chainDate: '2026-10-12', expiry: '2026-10-16', spot: 56, levelPrice: 56, distPct: 0, side: 'at' }],
  ['MU', { kind: 'gamma', level: 'maxPain', chainDate: '2026-10-12', expiry: '2026-10-16', spot: 980, levelPrice: 980, distPct: 0, side: 'at' }],
  ['JPM', { kind: 'gamma', level: 'maxPain', chainDate: '2026-10-12', expiry: '2026-10-16', spot: 334.66, levelPrice: 335, distPct: 0.1, side: 'b' }],
  ['UNH', { kind: 'earnings', date: '2026-10-13', hour: 'bmo', etTime: null, impliedPct: 6.7, impliedExpiry: '2026-10-16', session: '2026-10-12' }],
  ['NFLX', { kind: 'earnings', date: '2026-10-20', hour: 'amc', etTime: null, impliedPct: 8.3, impliedExpiry: '2026-10-23', session: '2026-10-12' }],
];
(async () => {
  let ok = 0, n = 0, cost = 0; const lat: number[] = []; const fails: Record<string, number> = {};
  for (const [tk, f] of S) {
    for (let k = 0; k < ROUNDS; k++) {
      const body = { adhoc: { system: TP_SYSTEM, userPrompt: buildPickUserPrompt(tk, f, TODAY), maxTokens: 400, expectJson: true, timeoutMs: 30000 }, effort: 'low', thinking: 'disabled', tag: 'today-picks-harness' };
      const res = await fetch('https://www.signumhq.com/api/admin/ai-ab', { method: 'POST', headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j: any = await res.json(); const h = j.h55; n++;
      if (!h?.ok) { console.log(tk, 'ERR', JSON.stringify(h).slice(0, 200)); continue; }
      cost += h.costUsd || 0; lat.push(h.ms);
      const chk = checkPickWhy(h.text, tk, f, 2026, TODAY); if (chk.ok) ok++; else chk.reasons.forEach((r) => { const key = r.replace(/:[^:]*$/, ''); fails[key] = (fails[key] || 0) + 1; });
      let t: any = {}; try { t = JSON.parse(h.text.slice(h.text.indexOf('{'), h.text.lastIndexOf('}') + 1)); } catch { /* */ }
      console.log(`${f.kind}:${tk}${(f as any).level ? ':' + (f as any).level : ''}${(f as any).side ? ':' + (f as any).side : ''} ${chk.ok ? 'PASS' : 'FAIL ' + chk.reasons.slice(0, 3).join('|')}\n   ko: ${t.ko}\n   ja: ${t.ja}\n   en: ${t.en}`);
    }
  }
  lat.sort((a, b) => a - b);
  console.log(`\nTOTAL pass ${ok}/${n} cost $${cost.toFixed(5)} p50 ${lat[Math.floor(lat.length / 2)]}ms p95 ${lat[Math.floor(lat.length * 0.95)]}ms fails ${JSON.stringify(fails)}`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
