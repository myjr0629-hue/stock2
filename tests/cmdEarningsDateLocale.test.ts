/** AUDIT 10/31 #8 — 일본어 커맨드 실적 카드 날짜가 영어(«November 17, 2026»)로 나왔다. 운영 본문의 날짜 식을 그대로 실행한다(무네트워크). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/cmd/page.tsx'), 'utf8');
const m = src.match(/const dateStr = raw\.nextEarningsDate\s*\?\s*(new Date\(raw\.nextEarningsDate \+ 'T00:00:00'\)\.toLocaleDateString\([\s\S]*?\))\s*:\s*'TBD';/);
assert.ok(m, '실적 카드 날짜 식(EarningsCardPremium)');
const fmt = new Function('raw', 'locale', `return ${m[1]};`) as (raw: { nextEarningsDate: string }, locale: string) => string;
const raw = { nextEarningsDate: '2026-11-17' };
assert.equal(fmt(raw, 'ja'), '2026年11月17日');
assert.equal(fmt(raw, 'ko'), '2026년 11월 17일');
assert.equal(fmt(raw, 'en'), 'November 17, 2026');
console.log('cmd 실적 날짜 3언어 통과');
