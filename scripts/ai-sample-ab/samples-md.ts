/** 비교 결과에서 한·일·영 원문 표본을 마크다운으로 — samples-md.ts <file> <row> <legacyKey> <variant> [perLang] [maxChars] */
import fs from 'node:fs';
import { collectLocaleStrings } from '@/lib/ai/ladderGates';
import type { Row, Side } from './ab-lib';
const [file, rowArg, legacyKey, variant, perLangArg, maxArg] = process.argv.slice(2);
const rows: Row[] = JSON.parse(fs.readFileSync(file, 'utf8'));
const row = rows[Number(rowArg)];
const per = Number(perLangArg) || 1, max = Number(maxArg) || 220;
const pick = (s?: Side) => {
    if (!s?.ok) return { ko: ['(응답 없음)'], ja: [], en: [] } as Record<string, string[]>;
    const out: Record<string, string[]> = { ko: [], ja: [], en: [] };
    let obj: any = null; try { obj = JSON.parse(s.text); } catch { /* plain */ }
    const items = obj ? collectLocaleStrings(obj, null) : (['ko', 'ja', 'en'].includes(String(row.locale)) ? [{ loc: row.locale as 'ko' | 'ja' | 'en', text: s.text, path: '' }] : []);
    for (const it of items) if (out[it.loc].length < per) out[it.loc].push(it.text.replace(/\s+/g, ' ').slice(0, max));
    return out;
};
const L = legacyKey === 'legacy' ? row.legacy : row.legacyV?.[legacyKey];
const H = row.variants[variant];
for (const loc of ['ko', 'ja', 'en'] as const) {
    console.log(`- **${loc}** · 현행: ${pick(L)[loc].join(' / ') || '-'}`);
    console.log(`  - 5.5: ${pick(H)[loc].join(' / ') || '-'}`);
}
