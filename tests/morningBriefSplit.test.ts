/**
 * AI 모닝브리핑 문장 나누기 — 소수점·약어의 점을 문장 끝으로 자르지 않는다 (2026-10-07, 앱 강화 0단계 T1)
 *
 * 옛 결함: `MorningBrief.tsx` 의 `text.match(/[^.。!?！？]+[.。!?！？]+/g)` + `join(' ')` 이 «+0.48%» 의 «.» 를 문장 끝으로 보고 잘라
 *   「+0. 48%」「금리 5. 31%」「$11. 9B」로 깨뜨렸고, 「핵심 전망」 상자가 숫자 중간(«17% 하락하는 등…»)에서 시작했다. API 응답은 정상이었다.
 *   고정 문장 = 10/6 운영 API(/api/guardian/briefing?locale=ko|en|ja, 생성 12:05Z)의 실제 본문 3개 국어.
 *
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/morningBriefSplit.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { splitOutlook, sentenceEnds } from '../src/lib/app/morningBriefSplit';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const norm = (s: string) => s.replace(/\s+/g, '');
/** 소수점 뒤에 공백이 끼었는가(옛 결함의 지문) */
const BROKEN_DECIMAL = /\d\.\s+\d/;

// ── 운영 실제 본문(10/6 12:05Z) ──
const BRIEF = {
  ko: "화요일 개장 전 거래에서 S&P 500 선물이 7,864(+0.48%), NASDAQ 100 선물이 31,513(+0.62%)으로 소폭 상승 출발함. AI Power Grid 섹터가 +2.3% 상승을 주도하며 기술주 중심의 매수세가 나타나고 있으며, 장기 금리가 5.31%로 상승한 가운데 금값은 $4,201(+1.06%)으로 반등함. Goldman Sachs 헤지펀드 리서치가 연말 전 S&P 500의 사상 최고가를 전망하고 있으며, 계절적 요인과 상대적 저평가 논리가 긍정적 심리를 지지하는 것으로 관찰됨. 한편 테슬라가 최근 분기 실적을 발표했으며, NVIDIA가 Hugging Face 인수(약 $11.9B)를 완료하는 등 대형 기술주들의 구조적 변화가 진행 중임. RLSI 39.5 수준에서 시장 건전성은 중립적이며, VIX 15.32와 음의 감마(GEX -24) 환경에서 변동성 압축 상태가 나타남. 매매폭이 66.2%로 양호하나 좁은 수익률 구조 속에서 오일이 -2.17% 하락하는 등 에너지 섹터의 약세가 주목되며, 오늘 추가 경제 지표 없이 기술주 실적 소화와 금리 방향성이 주요 관찰 포인트임.",
  en: "Tuesday pre-market trading shows S&P 500 futures at 7,864 (+0.48%) and NASDAQ 100 futures at 31,513 (+0.62%), with AI Power Grid leading sector gains at +2.3% and Cybersecurity climbing +1.2%. Gold bounced to $4,201 (+1.06%) as long-term yields eased, though the 10-year remains elevated at 5.31%, creating a mixed backdrop where rate expectations and safe-haven demand offset each other. Goldman Sachs hedge fund research forecasts a record S&P 500 high before year-end, citing seasonal tailwinds and historical valuation support, while Tesla released quarterly results and NVIDIA completed its $11.9 billion acquisition of Hugging Face, signaling continued M&A momentum in the technology sector. The RLSI at 39.5 and neutral breadth of 66.2% suggest a balanced market regime, though negative gamma (GEX -24) and VIX at 15.32 indicate volatility compression with limited upside cushion. Oil weakness at -2.17% and the 50% squeeze risk signal that energy headwinds and narrow positioning merit close monitoring as the session unfolds.",
  ja: "火曜日のプレマーケットでS&P 500先物が7,864(+0.48%)、NASDAQ 100先物が31,513(+0.62%)と小幅上昇で始まり、AI Power Grid セクターが+2.3%でリードしている。10年債利回りが5.31%に上昇する中、金は$4,201(+1.06%)に反発し、長期金利の上昇と安全資産需要が相反する環境が観察されている。Goldman Sachsのヘッジファンド調査が年末前のS&P 500史上最高値を予想しており、季節的要因と相対的な割安感が支援材料となっているほか、テスラが四半期決算を発表、NVIDIAがHugging Face買収(約$11.9B)を完了するなど大型テック企業の構造的変化が進行中である。RLSI 39.5と中立的なブレッドス(66.2%)は均衡した市場環境を示唆しており、ネガティブガンマ(GEX -24)とVIX 15.32は変動性圧縮状態を示唆している。石油が-2.17%下落し50%のスクイーズリスクが存在する中、エネルギー部門の弱さとポジショニングの狭さが本日の主要な注視点となる。",
} as const;

/** 옛 규칙 그대로(회귀 증명용) */
function oldSplit(text: string) {
  const sentences = text.match(/[^.。!?！？]+[.。!?！？]+/g);
  if (sentences && sentences.length >= 3) {
    return { outlook: sentences[sentences.length - 1].trim(), body: sentences.slice(0, -1).join(' ').trim() };
  }
  return { body: text.trim(), outlook: null as string | null };
}

t('옛 규칙은 세 언어 모두 소수점을 깨뜨렸다(시험이 결함을 잡는다는 증명)', () => {
  for (const l of ['ko', 'en', 'ja'] as const) {
    const o = oldSplit(BRIEF[l]);
    assert.ok(BROKEN_DECIMAL.test(`${o.body} ${o.outlook ?? ''}`), `${l}: 옛 규칙 출력에 «숫자. 숫자» 가 있어야 한다`);
  }
});

t('새 규칙: 세 언어 본문·상자 어디에도 «숫자. 숫자» 가 없다', () => {
  for (const l of ['ko', 'en', 'ja'] as const) {
    const r = splitOutlook(BRIEF[l]);
    assert.ok(r.outlook, `${l}: 문장 3개 이상이라 상자가 있어야 한다`);
    assert.equal(BROKEN_DECIMAL.test(r.body), false, `${l} body`);
    assert.equal(BROKEN_DECIMAL.test(r.outlook!), false, `${l} outlook`);
  }
});

t('새 규칙: 글자 손실·삽입 0 — body + outlook 은 공백만 빼면 원문과 같다', () => {
  for (const l of ['ko', 'en', 'ja'] as const) {
    const r = splitOutlook(BRIEF[l]);
    assert.equal(norm(r.body + r.outlook!), norm(BRIEF[l]), l);
  }
});

t('새 규칙: 소수·금액이 원문 그대로 보존된다(+0.48% · 5.31% · $11.9 · 39.5 · 66.2% · -2.17%)', () => {
  const must = ['+0.48%', '+0.62%', '5.31%', '+1.06%', '39.5', '15.32', '66.2%', '-2.17%'];
  for (const l of ['ko', 'en', 'ja'] as const) {
    const r = splitOutlook(BRIEF[l]);
    const all = `${r.body} ${r.outlook}`;
    for (const m of must) assert.ok(all.includes(m), `${l}: ${m}`);
  }
  assert.ok(splitOutlook(BRIEF.ko).body.includes('$11.9B'), 'ko $11.9B');
  assert.ok(splitOutlook(BRIEF.ja).body.includes('$11.9B'), 'ja $11.9B');
  assert.ok(splitOutlook(BRIEF.en).body.includes('$11.9 billion'), 'en $11.9 billion');
});

t('상자(핵심 전망)는 «마지막 한 문장» 이고 숫자 중간에서 시작하지 않는다', () => {
  const ko = splitOutlook(BRIEF.ko);
  assert.equal(ko.outlook, '매매폭이 66.2%로 양호하나 좁은 수익률 구조 속에서 오일이 -2.17% 하락하는 등 에너지 섹터의 약세가 주목되며, 오늘 추가 경제 지표 없이 기술주 실적 소화와 금리 방향성이 주요 관찰 포인트임.');
  const en = splitOutlook(BRIEF.en);
  assert.equal(en.outlook, 'Oil weakness at -2.17% and the 50% squeeze risk signal that energy headwinds and narrow positioning merit close monitoring as the session unfolds.');
  const ja = splitOutlook(BRIEF.ja);
  assert.equal(ja.outlook, '石油が-2.17%下落し50%のスクイーズリスクが存在する中、エネルギー部門の弱さとポジショニングの狭さが本日の主要な注視点となる。');
  for (const r of [ko, en, ja]) assert.equal(/^\d/.test(r.outlook!), false, '숫자로 시작하지 않는다');
});

t('문장 경계: 마침표 뒤 공백·전각 。만 끝이다 — 숫자 안의 점은 끝이 아니다', () => {
  const s = '금리 5.31% 상승. 금값 $4,201(+1.06%) 반등. RLSI 39.5. 끝';
  const e = sentenceEnds(s).map((i) => s.slice(0, i).slice(-6));
  assert.equal(e.length, 3, JSON.stringify(e));
  assert.deepEqual(splitOutlook(s), { body: '금리 5.31% 상승. 금값 $4,201(+1.06%) 반등. RLSI 39.5.', outlook: '끝' });
  // 소수점만 있는 문장 둘 → 3문장 미만(상자 없음) — 점을 끝으로 세면 3문장이 돼 상자가 생기는 옛 오류
  assert.equal(splitOutlook('S&P 500 선물 7,864(+0.48%) 상승 출발. 금리 5.31%로 상승.').outlook, null);
  // 앞자리 없는 소수 «.48%»
  assert.equal(sentenceEnds('변동 .48% 확대. 이어서 .5% 축소.').length, 2);
});

t('약어의 점은 끝이 아니다 — U.S. · a.m. · Inc. · Oct. · J. P. Morgan', () => {
  const text = 'U.S. Treasury yields rose at 9:30 a.m. ET as Apple Inc. reported on Oct. 7. J. P. Morgan raised its target. Markets closed higher.';
  const r = splitOutlook(text);
  assert.equal(r.outlook, 'Markets closed higher.');
  assert.ok(r.body.includes('U.S. Treasury'), 'U.S. 가 보존된다');
  assert.ok(r.body.includes('a.m. ET'), 'a.m. 이 보존된다');
  assert.ok(r.body.includes('Apple Inc. reported'), 'Inc. 가 보존된다');
  assert.ok(r.body.includes('Oct. 7'), 'Oct. 7 이 보존된다');
  assert.equal(norm(r.body + r.outlook!), norm(text));
});

t('숫자 뒤 한 글자(5G. · 10x.)와 S&P. 로 끝나는 문장은 끝으로 센다', () => {
  assert.equal(sentenceEnds('AI power demand is up 10x. The stock lags the S&P. Chips rallied on 5G. Done.').length, 4);
});

t('끝맺음 부호 없이 끝난 꼬리 글도 버리지 않는다(옛 규칙은 꼬리를 통째로 잃었다)', () => {
  const r = splitOutlook('첫째 문장입니다. 둘째 문장입니다. 셋째 문장입니다. 꼬리 문장 부호 없음');
  assert.equal(r.outlook, '꼬리 문장 부호 없음');
  assert.ok(r.body.endsWith('셋째 문장입니다.'));
  assert.deepEqual(oldSplit('첫째 문장입니다. 둘째 문장입니다. 셋째 문장입니다. 꼬리 문장 부호 없음').outlook, '셋째 문장입니다.', '옛 규칙은 꼬리를 버렸다');
});

t('문장이 3개 미만이면 상자 없이 통째로 본문', () => {
  assert.deepEqual(splitOutlook('한 문장뿐입니다.'), { body: '한 문장뿐입니다.', outlook: null });
  assert.deepEqual(splitOutlook('하나. 둘.'), { body: '하나. 둘.', outlook: null });
  assert.deepEqual(splitOutlook(''), { body: '', outlook: null });
});

t('일본어 전각 。 와 한글 «…함.다음» 붙여쓰기, 닫는 따옴표·괄호가 딸려 간다', () => {
  const ja = '一つ目です。二つ目です。三つ目(+0.5%)です。';
  const r = splitOutlook(ja);
  assert.equal(r.outlook, '三つ目(+0.5%)です。');
  const ko = '상승함.하락함.보합임';
  assert.equal(sentenceEnds(ko).length, 2);
  const q = '그는 "좋다." 라고 했다. 다음 문장. 마지막 문장.';
  assert.equal(splitOutlook(q).outlook, '마지막 문장.');
});

t('말줄임·느낌표·물음표', () => {
  assert.equal(splitOutlook('기다려 보자... 그다음은? 정말로! 끝.').outlook, '끝.');
  assert.equal(sentenceEnds('v1.2 업데이트 example.com 접속. 끝.').length, 2);
});

t('lookbehind 정규식 금지 — iOS 15 WKWebView(16.3 이하)는 구문 오류로 번들 전체가 죽는다', () => {
  for (const f of ['src/lib/app/morningBriefSplit.ts', 'src/components/app/MorningBrief.tsx']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.equal(/\(\?<[=!]/.test(src), false, `${f}: (?<= (?<! 사용`);
  }
});

t('MorningBrief 는 로컬 규칙 대신 이 모듈을 쓰고, 상자 이름(핵심 전망 · Key Outlook · 重要見通し)은 그대로다(대표 확인 사항)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/app/MorningBrief.tsx'), 'utf8');
  assert.ok(src.includes("from '@/lib/app/morningBriefSplit'"));
  assert.equal(src.includes('text.match(/[^.。!?！？]+'), false, '옛 정규식이 남아 있다');
  for (const label of ["outlook: '핵심 전망'", "outlook: 'Key Outlook'", "outlook: '重要見通し'"]) assert.ok(src.includes(label), label);
});

console.log(`\n✅ morningBriefSplit: ${n}건 통과`);
