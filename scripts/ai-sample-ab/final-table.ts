/**
 * 결과표(마크다운) 만들기 — 저장된 비교 결과(ab-*.json)에서 용도별 «현행 vs Haiku 5.5» 한 줄 + 한·일·영 원문 표본.
 *   final-table.ts <JSON…>  (각 인자: 파일경로|변형이름|현행키|음차무시(1/0))
 * 음차무시=1: 한·일 칸의 금융 공통어 음차(«콜월»)는 운영 출구(restoreCommonTermNames)가 되돌리므로 양쪽 모두 사유에서 뺀다.
 */
import fs from 'node:fs';
import { summarize, type Row, type Side } from './ab-lib';
import { collectLocaleStrings } from '@/lib/ai/ladderGates';

function ignoreTranslit(rs: Row[]): Row[] {
    const fix = (s?: Side): Side | undefined => {
        if (!s || !s.ok || !s.eval) return s;
        const reasons = s.eval.reasons.filter((r) => !/transliterated/.test(r));
        const generic = reasons.filter((r) => !/^(ko|en|ja):/.test(r) && !r.startsWith('prod:'));
        const bad = (l: string) => reasons.some((r) => r.startsWith(l + ':'));
        const prodOk = !s.prodGate || s.prodGate.ok;
        const evOk = reasons.filter((r) => !r.startsWith('prod:')).length === 0;
        return { ...s, eval: { ok: evOk, reasons }, perLang: { ko: !generic.length && !bad('ko'), en: !generic.length && !bad('en'), ja: !generic.length && !bad('ja') }, pass: evOk && prodOk };
    };
    return rs.map((r) => ({ ...r, legacy: fix(r.legacy), legacyV: r.legacyV ? Object.fromEntries(Object.entries(r.legacyV).map(([k, v]) => [k, fix(v)!])) : undefined, variants: Object.fromEntries(Object.entries(r.variants).map(([k, v]) => [k, fix(v)!])) }));
}
const f1 = (x: number | null) => (x == null ? '-' : (x / 1000).toFixed(1) + 's');
const usd = (x: number | null) => (x == null ? '-' : '$' + x.toFixed(4));
const lines: string[] = [];
for (const spec of process.argv.slice(2)) {
    const [file, variant, legacyKey, ign] = spec.split('|');
    let rows: Row[] = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (ign === '1') rows = ignoreTranslit(rows);
    const s = summarize(rows, variant, legacyKey || 'legacy');
    const pl = (l: string) => s.perLang[l].replace('현행 ', '').replace(' · 5.5 ', ' → ');
    lines.push(`| ${s.purpose} | ${rows.length}회(${[...new Set(rows.map((r) => r.idx))].length}입력) | ${s.legacyPass} | ${s.h55Pass} | ko ${pl('ko')} · en ${pl('en')} · ja ${pl('ja')} | ${f1(s.legacyP50)}/${f1(s.legacyP95)} → ${f1(s.h55P50)}/${f1(s.h55P95)} | ${usd(s.legacyCost)} → ${usd(s.h55Cost)} | ${Object.keys(s.legacyFail).length ? JSON.stringify(s.legacyFail) : '-'} → ${Object.keys(s.h55Fail).length ? JSON.stringify(s.h55Fail) : '-'} |`);
}
console.log('| 용도 | 표본 | 현행 가드 통과 | 5.5 가드 통과 | 언어별(현행→5.5) | 응답 p50/p95 현행→5.5 | 호출당 비용 현행→5.5 | 실패 사유 현행→5.5 |\n|---|---|---|---|---|---|---|---|');
console.log(lines.join('\n'));
