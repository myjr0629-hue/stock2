/**
 * 저장된 비교 결과(ab-*.json)를 다시 읽어 요약·원문 표본을 낸다. 모델 호출 없음.
 *   report.ts <rows.json> summary [variant] [--post]        용도·설정별 요약(--post: 음차 복원 적용 시 = «transliterated» 사유 무시)
 *   report.ts <rows.json> show <rowIndex> <variant|legacy> [maxChars]   ko/en/ja 문장 원문
 *   report.ts <rows.json> fails <variant|legacy>             실패 사유별 예시
 */
import fs from 'node:fs';
import { summarize, printSummary, type Row, type Side } from './ab-lib';
import { collectLocaleStrings } from '@/lib/ai/ladderGates';

const [file, cmd, a, b, c] = process.argv.slice(2);
const rows: Row[] = JSON.parse(fs.readFileSync(file, 'utf8'));
const post = process.argv.includes('--post');
const IGN = /:transliterated:/;

function applyPost(rs: Row[]): Row[] {
    const fix = (s?: Side): Side | undefined => {
        if (!s || !s.ok || !s.eval) return s;
        const reasons = s.eval.reasons.filter((r) => !IGN.test(r) && !/transliterated/.test(r));
        const generic = reasons.filter((r) => !/^(ko|en|ja):/.test(r));
        const bad = (l: string) => reasons.some((r) => r.startsWith(l + ':'));
        const prodOk = !s.prodGate || s.prodGate.ok;
        return { ...s, eval: { ok: reasons.filter((r) => !r.startsWith('prod:')).length === 0, reasons }, perLang: { ko: !generic.length && !bad('ko'), en: !generic.length && !bad('en'), ja: !generic.length && !bad('ja') }, pass: reasons.filter((r) => !r.startsWith('prod:')).length === 0 && prodOk };
    };
    return rs.map((r) => ({ ...r, legacy: fix(r.legacy), legacyV: r.legacyV ? Object.fromEntries(Object.entries(r.legacyV).map(([k, v]) => [k, fix(v)!])) : undefined, variants: Object.fromEntries(Object.entries(r.variants).map(([k, v]) => [k, fix(v)!])) }));
}

const R = post ? applyPost(rows) : rows;
if (cmd === 'summary') {
    const names = a && !a.startsWith('--') ? [a] : Object.keys(R[0]?.variants || {}).filter((n) => !n.endsWith('+post'));
    for (const n of names) console.log(printSummary(summarize(R, n)));
    for (const lk of Object.keys(R[0]?.legacyV || {}).filter((k) => !k.endsWith('+post'))) for (const n of names) console.log(printSummary(summarize(R, n, lk)));
} else if (cmd === 'show') {
    const row = R[Number(a)];
    const side: Side | undefined = b === 'legacy' ? row.legacy : b?.startsWith('legacy') ? row.legacyV?.[b] : row.variants[b];
    if (!side?.ok) { console.log('no output', side?.error); process.exit(0); }
    let obj: any = null; try { obj = JSON.parse(side.text); } catch { /* plain text */ }
    const max = Number(c) || 260;
    if (obj) { for (const it of collectLocaleStrings(obj, null)) console.log(`[${it.loc}] ${it.path}: ${it.text.slice(0, max)}`); }
    else console.log(side.text.slice(0, max * 4));
    console.log('gate:', JSON.stringify({ pass: side.pass, reasons: side.eval?.reasons, ms: side.ms, usage: side.usage }));
} else if (cmd === 'fails') {
    for (const r of R) {
        const s: Side | undefined = a === 'legacy' ? r.legacy : a?.startsWith('legacy') ? r.legacyV?.[a] : r.variants[a];
        if (s && (!s.ok || !s.pass)) console.log(`#${r.idx}.${r.round}`, s.ok ? (s.eval?.reasons || []).join(' | ').slice(0, 300) : s.error);
    }
}
