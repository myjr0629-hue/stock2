/** 운영 전·후 표본 비교 — 운영 응답 본문에서 글 칸을 꺼내 같은 정의(metrics.ts)로 센다. 근거 입력이 없어 «입력에 없는 숫자»는 세지 않는다(하네스 표가 맡는다). */
import fs from 'node:fs';
import path from 'node:path';
import { slotsOfRun, measureOutput } from './metrics';
const RAW = '/Users/eunhoon/Documents/signum-work/research/DIFF-2026-10-12/raw';
const rd = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')); } catch { return null; } };
const T = 'NVDA TSLA AAPL MSFT AMZN META GOOGL AMD PLTR SPY'.split(' ');
type Rec = { surface: string; ticker: string; locale: string; status: number; wallMs: number; body: any; gen?: string };
const out: Record<string, { before: Rec[]; after: Rec[] }> = { UC: { before: [], after: [] }, Flow: { before: [], after: [] }, Deep: { before: [], after: [] }, Intel: { before: [], after: [] } };
// UC / Intel / (이전 Flow·Deep 운영 표본)
for (const r of rd('impl5-prod-before-uc.json') || []) out.UC.before.push(r);
for (const r of rd('impl5-prod-after-uc.json') || []) out.UC.after.push(r);
for (const r of rd('impl5-prod-before.json') || []) { if (out[r.surface]) out[r.surface].before.push(r); }
for (const r of rd('impl5-prod-after-intel.json') || []) out.Intel.after.push(r);
// Flow·Deep: 화면 캡처 (전: impl5-inputs-before, 후: impl5-inputs 중 13:33Z 이후 생성분)
const DEPLOY = Date.parse('2026-10-12T13:33:00Z');
for (const kind of ['flow', 'deep']) for (const t of T) {
    const S = kind === 'flow' ? 'Flow' : 'Deep';
    const b = (() => { try { return JSON.parse(fs.readFileSync(path.join(RAW, 'impl5-inputs-before', `${kind}-${t}.json`), 'utf8')); } catch { return null; } })();
    if (b?.response?.body) out[S].before.push({ surface: S, ticker: t, locale: 'multi', status: b.response.status, wallMs: b.response.ms, body: b.response.body, gen: b.response.body.generatedAt });
    const a = (() => { try { return JSON.parse(fs.readFileSync(path.join(RAW, 'impl5-inputs', `${kind}-${t}.json`), 'utf8')); } catch { return null; } })();
    if (a?.response) { const g = a.response.body?.generatedAt; if (a.response.status !== 200 || (g && Date.parse(g) >= DEPLOY)) out[S].after.push({ surface: S, ticker: t, locale: 'multi', status: a.response.status, wallMs: a.response.ms, body: a.response.body, gen: g }); }
}
for (const f of ['impl5-prod-after-flow-extra.json', 'impl5-prod-after-deep-extra.json']) for (const r of rd(f) || []) { const S = r.surface; if (!out[S].after.find((x) => x.ticker === r.ticker && x.gen === r.body?.generatedAt)) out[S].after.push({ ...r, gen: r.body?.generatedAt }); }
const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rows: any = {};
for (const [S, v] of Object.entries(out)) {
    rows[S] = {};
    for (const arm of ['before', 'after'] as const) {
        const recs = v[arm]; const ok = recs.filter((r) => r.status === 200 && r.body && !r.body.error);
        let n = 0, anyAsOf = 0, num = 0, fact = 0, dated = 0, filler = 0, chars = 0, newDom = 0, doms = 0, ungr = 0;
        for (const r of ok) {
            const locs = S === 'UC' ? [(r.locale === 'ja' || r.locale === 'en' ? r.locale : 'ko') as any] : ['ko', 'en', 'ja'] as any[];
            const slots = slotsOfRun(S, r.locale, r.body);
            for (const loc of locs) { const m = measureOutput(slots, loc, ''); if (!m) continue; n++; anyAsOf += m.anyAsOf ? 1 : 0; num += m.numbers; fact += m.factSentences; dated += m.datedFacts; filler += m.filler; chars += m.chars; newDom += m.newDomains.length; doms += m.domains.length; }
        }
        // 한 번에 끝나는 성공 기준: 상태 200 이고 오류 없음
        rows[S][arm] = {
            requests: recs.length, ok: ok.length, texts: n,
            wallP50s: +(pct(recs.map((r) => r.wallMs), 0.5) / 1000).toFixed(1), wallP95s: +(pct(recs.map((r) => r.wallMs), 0.95) / 1000).toFixed(1),
            anyAsOfPct: n ? Math.round((100 * anyAsOf) / n) : 0, numbersPerText: n ? +(num / n).toFixed(1) : 0,
            datedFactPct: fact ? Math.round((100 * dated) / fact) : 0, factSentences: fact, fillerPerText: n ? +(filler / n).toFixed(2) : 0, charsPerText: n ? Math.round(chars / n) : 0,
            domainsPerText: n ? +(doms / n).toFixed(1) : 0, newDomainsPerText: n ? +(newDom / n).toFixed(1) : 0,
            models: Array.from(new Set(recs.map((r) => String(r.body?.model ?? r.body?.meta?.model ?? '-')))).join(','),
        };
    }
}
console.log(JSON.stringify(rows, null, 1));
fs.writeFileSync(path.join(RAW, 'impl5-prod-compare.json'), JSON.stringify(rows, null, 1));
