/**
 * 앱 Intel 화면(src/app/[locale]/app-view/intel/page.tsx)의 «고정 가짜 값»·«고정 투자 권유 문구» 재발 방지 (2026-10-07)
 *
 * 출발점(10/7 운영 코드·실화면): ① 섹터 카드 «감마 펄스 +88»은 SECTOR_CONFIGS 에 박힌 상수 ② «퀀트 코맨더 일지»는 섹터마다 고정된 문장
 *   (영어 원본 «Engine recommends 15% cash reservation»·«Maintain overweight stance. Momentum score hits 92»·«Tactical buy triggered»…)
 *   ③ 커버리지 KPI 가 시세 도착 전엔 설정 목록 길이의 합 «56», 도착 후 «70».
 *   → 계산은 lib/app/intelSectorFacts(tests/intelSectorFacts.test.ts), 이 시험은 «화면 소스»가 다시 상수·권유 문구로 돌아가지 않게 고정한다.
 *
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/appIntelNoFakeValues.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const PAGE = 'src/app/[locale]/app-view/intel/page.tsx';
const page = read(PAGE);

/** 주석 제거(블록 + 줄 주석). 문자열 안의 «//» 는 건드리지 않는다(앞에 따옴표가 홀수면 문자열 안). */
function stripComments(code: string): string {
  const noBlock = code.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock.split('\n').map((line) => {
    if (line.trim().startsWith('//')) return '';
    const m = line.match(/^(.*?)(\s\/\/\s.*)$/);
    if (!m) return line;
    const before = m[1];
    const quotes = (before.match(/(?<!\\)'/g) || []).length + (before.match(/(?<!\\)"/g) || []).length + (before.match(/(?<!\\)`/g) || []).length;
    return quotes % 2 === 0 ? before : line;
  }).join('\n');
}

/** «화면 문구가 아닌 것»을 소스에서 걷어낸다 — 아래 두 곳뿐이고, 이유를 명시한다. */
function screenSource(code: string): string {
  let out = stripComments(code);
  // ① 면책 문구(APP_COMPLIANCE_COPY) — «매수·매도 권유가 아니며»처럼 권유를 «부정»하는 필수 고지다. 지우면 안 된다.
  const c0 = out.indexOf('const APP_COMPLIANCE_COPY');
  assert.ok(c0 >= 0, 'APP_COMPLIANCE_COPY 가 있어야 한다(면책 고지는 유지)');
  const c1 = out.indexOf('};', c0);
  out = out.slice(0, c0) + out.slice(c1 + 2);
  // ② formatVerdictText 의 «강조할 단어» 목록 — AI 글 속 단어를 굵게 칠하는 용도일 뿐 화면에 나가는 문구가 아니다.
  const k0 = out.indexOf('const keywords = [');
  assert.ok(k0 >= 0, 'keywords 목록 위치');
  const k1 = out.indexOf('];', k0);
  out = out.slice(0, k0) + out.slice(k1 + 2);
  return out;
}

// 운영 세션 지정 목록 + 일본어·한글 변형
const BANNED = /매수|매도|비중|권장|추천|권유|trigger|\bbuy|\bsell|overweight|underweight|allocation|recommend|accumulat|\bhold\b|買い|売り|推奨|オーバーウェイト|アンダーウェイト/i;

t('면책 고지(APP_COMPLIANCE_COPY)는 세 언어 모두 그대로 있다 — 지우지 않았다', () => {
  assert.ok(/aiNote: 'AI 해석은 교육·리서치용 시장 데이터입니다\. 매수·매도 권유가 아니며/.test(page));
  assert.ok(/aiNote: 'AI interpretation is educational market-data research only\. It is not investment advice or a buy\/sell recommendation/.test(page));
  assert.ok(/aiNote: 'AI解釈は教育・リサーチ用の市場データです。投資助言や売買推奨ではなく/.test(page));
});

t('Intel 화면 소스에 권유·매매·비중 조절 표현이 0개다(면책 고지·강조 단어 목록 제외)', () => {
  const lines = screenSource(page).split('\n');
  const hits = lines.map((l, i) => ({ l: l.trim(), i: i + 1 })).filter(({ l }) => BANNED.test(l));
  assert.deepEqual(hits.map((h) => `${h.i}: ${h.l.slice(0, 120)}`), []);
});

t('박아 둔 «감마 펄스»·«코맨더 일지» 데이터가 사라졌다(필드·사전·함수·고정 문장 전부)', () => {
  const code = stripComments(page);
  assert.equal(/\bcommanderLog\s*:/.test(code), false, 'commanderLog 필드');
  assert.equal(/\bgammaPulse\s*:\s*\{\s*pct\s*:/.test(code), false, 'gammaPulse: { pct: … } 상수');
  assert.equal(/COMMANDER_LOG_COPY|getCommanderLogCopy/.test(code), false, '코맨더 일지 사전·함수');
  assert.equal(/\.stance\b|'STABLE'|'RISK'/.test(code), false, '박힌 stance(STABLE/NEUTRAL/RISK) 판정');
  for (const k of ['Engine recommends', 'Momentum score hits 92', 'Tactical buy triggered', 'Speculative 2% allocation', 'Reduce tactical exposure', 'Awaiting signal']) {
    assert.equal(page.includes(k), false, k);
  }
  // 옛 한국어·일본어 번역본(데이터와 무관하게 «지금 상태»를 주장하던 고정 문장)
  for (const k of ['감마 플립 부근의 누적 수급과 대형 기술주', '단기 모멘텀 약화와 주요 지지 구간', 'ガンマフリップ周辺の需給と大型テック', 'ヘッジ比率と抵抗帯の反応から']) {
    assert.equal(page.includes(k), false, k);
  }
});

t('SECTOR_CONFIGS 는 이름·종목·색만 갖는다(값 필드 없음)', () => {
  const m = page.match(/interface SectorConfig \{([\s\S]*?)\}/);
  assert.ok(m, 'SectorConfig');
  const fields = [...m![1].matchAll(/^\s*(\w+)\s*:/gm)].map((x) => x[1]).sort();
  assert.deepEqual(fields, ['color', 'id', 'stocks']);
});

t('카드·상세는 계산 함수를 쓴다 — sectorGammaPulse / buildSectorObservation / formatGammaPulse (lib/app/intelSectorFacts)', () => {
  assert.ok(page.includes("from '@/lib/app/intelSectorFacts'"));
  assert.ok(/const gammaPulse = sectorGammaPulse\(quotes\);/.test(page));
  assert.ok(/buildSectorObservation\(\{/.test(page));
  assert.ok(/\{formatGammaPulse\(pulse\)\}/.test(page));
  // 상세의 QUANT COMMANDER 칸 = 같은 한 줄(없으면 «—»)
  assert.ok(/sectorSummaries\.find\(item => item\.id === selectedSector\)\?\.observation \|\| '—'/.test(page));
});

t('AI 해석 칸 우선순위 = AI 판정 → 실측 관찰 한 줄 → (대기 중이면 스켈레톤 · 아니면 «—») — 설정 문구(thesis)로 채우지 않는다', () => {
  assert.ok(/const aiLine = cached\?\.verdict \|\| observation;/.test(page));
  assert.ok(/const aiLine = \(sec\.aiLine \|\| ''\)\.replace/.test(page));
  assert.ok(/sec\.pending \? \(/.test(page));
  assert.equal(/sec\.aiLine \|\| sectorCopy\.thesis/.test(stripComments(page)), false);
});

t('커버리지: 시세가 오기 전엔 숫자를 만들지 않는다 — 설정 길이로 채우던 `quotes.length || sec.stocks.length` 제거 · KPI «—»', () => {
  assert.equal(/quotes\.length \|\| sec\.stocks\.length/.test(stripComments(page)), false);   // 주석은 «예전엔 …» 설명에 옛 코드를 인용할 수 있다
  assert.ok(/quoteCount: quotes\.length,/.test(page));
  assert.ok(/const totalCoverage: number \| null = sectorSummaries\.some\(item => item\.quoteCount > 0\)/.test(page));
  assert.ok(/value: totalCoverage == null \? '—' : `\$\{totalCoverage\}`/.test(page));
  // 카드 칩: 값이 없으면 «—»
  assert.ok(/const coverage: number \| null = sec\.quoteCount > 0 \? sec\.quoteCount : null;/.test(page));
  assert.ok(/\{labels\.coverage\} \{coverage \?\? '—'\}/.test(page));
});

t('감마 펄스 칸: ⓘ(정의)는 span 트리거 — 카드 전체가 <button> 이라 button 안의 button 을 만들지 않는다 · 닫는 탭이 카드 열기로 새지 않는다', () => {
  const a = page.indexOf('/* SECTOR CARD LIST */');
  const b = page.indexOf('SECTOR DETAILED REPORT VIEW');
  assert.ok(a > 0 && b > a, '섹터 카드 목록 구간');
  const region = page.slice(a, b);
  const infos = region.match(/<MetricInfo[^>]*>/g) || [];
  assert.ok(infos.length >= 1, '카드 안에 ⓘ');
  for (const tag of infos) assert.ok(/\basSpan\b/.test(tag), `button 카드 안의 MetricInfo 는 asSpan: ${tag}`);
  assert.ok(/<MetricInfo term="gammaPulse"/.test(region));
  assert.ok(/<span onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(region), '팝업 탭이 카드로 번지지 않게 막는 래퍼');
});

t('MetricInfo: 기본 모양은 그대로 <button type="button"> (asSpan 은 추가 옵션)', () => {
  const src = read('src/components/app/MetricInfo.tsx');
  assert.ok(/asSpan = false,/.test(src));
  assert.ok(/<button\s+type="button"\s+aria-label=\{title\}/.test(src));
  assert.ok(/<span\s+role="button"/.test(src));
});

t('용어집 gammaPulse: ko·en·ja 모두 채움 · 정의(ΣGEX÷Σ|GEX|)와 «—» 조건을 말함 · 권유 표현 없음', () => {
  const src = read('src/components/app/metricGlossary.ts');
  const m = src.match(/gammaPulse: \{([\s\S]*?)\n  \},\n\};/);
  assert.ok(m, 'gammaPulse 항목');
  const body = m![1];
  for (const lang of ['ko', 'en', 'ja']) assert.ok(new RegExp(`\\b${lang}: ['"]`).test(body), `${lang} 문구`);
  assert.ok(/MetricTerm =[\s\S]*\| 'gammaPulse'/.test(src), 'MetricTerm 유니온');
  assert.ok(/GEX 합계를 GEX 절대값의 합으로 나눈/.test(body));
  assert.ok(/sum of absolute GEX/i.test(body));
  assert.ok(/GEX絶対値の合計/.test(body));
  assert.equal(BANNED.test(body), false, `금지어: ${body.match(BANNED)?.[0]}`);
});

t('종목 등급·점수 기본값 «B»·50·55 를 채우지 않는다 — 못 쟀으면 null (KeyStockPremiumData 의 «산출 불가면 null» 규칙을 남은 세 경로에도)', () => {
  const code = stripComments(page);
  assert.equal(/grade:\s*tick\.grade\s*\|\|\s*'B'/.test(code), false, '스냅샷 경로 grade || B');
  assert.equal(/tick\.alpha_score \|\| tick\.score \|\| 55/.test(code), false, '스냅샷 경로 score || 55');
  assert.equal(/score:\s*alphaScore \?\? 50/.test(code), false, '글로벌 리포트 경로 score ?? 50');
  assert.equal(/score:\s*q\.alphaScore \|\| 50/.test(code), false, '시세 경로 score || 50');
  assert.equal(/grade:\s*'B',\s*score:\s*50/.test(code), false, '종목 이름만 있는 자리의 B·50');
  assert.ok(/grade: tick\.grade \|\| null,/.test(code));
  assert.ok(/score: num\(tick\.alpha_score \?\? tick\.score\),/.test(code));
  assert.ok(/score: \(q\.alphaScore \|\| 0\) > 0 \? q\.alphaScore : null,/.test(code));
  // 등급이 없으면 배지는 «—» + 중립 회색(예전엔 빈 칸 + B 의 노랑)
  assert.ok(/\{stock\.grade \|\| '—'\}/.test(code));
  assert.equal(/\|\| gradeColors\['B'\]/.test(code), false);
});

console.log(`\n✅ appIntelNoFakeValues: ${n}건 통과`);
