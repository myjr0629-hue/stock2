/**
 * 남은 용도의 크레딧 사다리 전환(2026-10-10 토, 금요일 장 데이터 표본) — 새로 들어간 순수 함수와 호출 지점 배선을 고정한다.
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/aiLadderRest.test.ts
 *
 * 고정하는 것:
 *  · lib/ai/sectorLabels — SECTOR_MAP 의 모든 이름에 영어 이름이 있다 · 영어 라벨을 한국어/일본어 이름으로 되돌리되 회사명(Constellation Energy)은 건드리지 않는다
 *  · lib/ai/ladderGates.scriptPurityReasons / multiLangJsonGate — 구조화 JSON 의 문자 체계 혼입(가나가 섞인 한국어 칸 등)을 거르고, 음차는 걸지 않는다(출구 복원 몫)
 *  · lib/ai/commonTerms.restoreCommonTermsDeep — 3개 언어 JSON 의 한·일 칸 음차만 영어 이름으로
 *  · 호출 지점 배선 — 가디언 입력 줄의 영어 섹터명 · 딥 분석 파서의 음차 복원 · 모닝 브리핑/크로스섹터/스냅샷/플로우 출구 복원
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SECTOR_MAP } from '@/services/universePolicy';
import { SECTOR_NAME_EN, SECTOR_NAME_JA, sectorLabelForAi, restoreKoSectorNames, restoreJaSectorNames } from '@/lib/ai/sectorLabels';
import { scriptPurityReasons, multiLangJsonGate, evaluateOutput } from '@/lib/ai/ladderGates';
import { restoreCommonTermsDeep } from '@/lib/ai/commonTerms';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

// ── 섹터 이름 ─────────────────────────────────────────────────────────────────
t('섹터 이름: SECTOR_MAP 의 모든 한국어 이름에 영어 이름이 있고, 영어 이름마다 일본어 이름이 있다 (새 섹터가 생기면 여기서 걸린다)', () => {
    for (const [id, v] of Object.entries(SECTOR_MAP)) {
        assert.ok(SECTOR_NAME_EN[v.name], `${id} ${v.name} 의 영어 이름`);
        assert.notEqual(sectorLabelForAi(v.name), v.name);
        assert.ok(SECTOR_NAME_JA[SECTOR_NAME_EN[v.name]], `${v.name} 의 일본어 이름`);
    }
    assert.equal(sectorLabelForAi('없는섹터'), '없는섹터');
});

t('섹터 이름: 한국어 글에 남은 영어 라벨 → 원래 이름. 긴 이름 먼저(Clean Energy ≠ Energy), 회사명은 그대로', () => {
    assert.equal(restoreKoSectorNames('Cybersecurity(+2.8%), Consumer Staples(+2.3%), Real Estate(+1.6%)').text, '사이버보안(+2.8%), 필수소비재(+2.3%), 부동산(+1.6%)');
    assert.equal(restoreKoSectorNames('Clean Energy 와 Energy, Consumer Discretionary 와 Consumer Staples').text, '클린에너지 와 에너지, 임의소비재 와 필수소비재');
    assert.equal(restoreKoSectorNames('Constellation Energy 와 Energy Transfer 는 회사 이름').text, 'Constellation Energy 와 Energy Transfer 는 회사 이름');
    assert.equal(restoreKoSectorNames('Semiconductors->Cybersecurity, Technology->Real Estate').text, '반도체->사이버보안, 기술주->부동산');
    assert.equal(restoreKoSectorNames('이미 한국어인 반도체 글').replaced, 0);
});

t('섹터 이름: 일본어 글에 남은 영어 라벨 → 표준 일본어 이름', () => {
    assert.equal(restoreJaSectorNames('Cybersecurityと Consumer Staples が上昇').text, 'サイバーセキュリティと 生活必需品 が上昇');
    assert.equal(restoreJaSectorNames('Clean Energyは弱い').text, 'クリーンエネルギーは弱い');
});

// ── 문자 체계 순도 · 구조화 가드 ──────────────────────────────────────────────
t('문자 체계 순도: 한국어 칸에 가나 → 혼입 / 한글 없는 영어 문장 → 혼입 / 티커·수치뿐인 칸은 통과', () => {
    assert.deepEqual(scriptPurityReasons('티ム 로톨로, 원자력 섹터 역풍과 AI 수요 점검', 'ko'), ['script:kana-in-ko']);
    assert.deepEqual(scriptPurityReasons('ジスカラー、매출 전망 재확인', 'ko'), ['script:kana-in-ko']);
    assert.deepEqual(scriptPurityReasons('Gold rises as the dollar softens and yields ease', 'ko'), ['script:english-in-ko']);
    assert.deepEqual(scriptPurityReasons('WTI 91.85(+0.39%), USD/KRW 1,340.90(-0.12%)', 'ko'), []);
    assert.deepEqual(scriptPurityReasons('PLTR +5.16% 리더, 4/7 상승, Goldman 상향 뉴스 반영', 'ko'), []);
    assert.deepEqual(scriptPurityReasons('금값이 급등했다', 'ja'), ['script:hangul-in-ja']);
    assert.deepEqual(scriptPurityReasons('Goldman Sachs、PalantirをBuyに格上げ、18%の上昇余地', 'ja'), []);
    assert.deepEqual(scriptPurityReasons('Gold surged as the dollar softened', 'en'), []);
    assert.deepEqual(scriptPurityReasons('Gold 급등 as dollar softened', 'en'), ['script:cjk-in-en']);
});

const SRC = 'Gold 4,216.30 (+1.43%) | S&P 500 7,859.75 | Cyber Shield 7/7';
const goodBrief = {
    marketOverview: { summary: { ko: 'S&P 500 7,859.75 선물이 소폭 상승하며 금이 4,216.30 으로 올랐다', en: 'S&P 500 futures edged higher while gold rose to 4,216.30', ja: 'S&P 500先物は小幅高で、金は4,216.30まで上昇した' } },
    sectorRotation: { winners: [{ reason: { ko: 'PLTR +5.16% 리더, 4/7 상승', en: 'PLTR leads at +5.16%', ja: 'PLTRが+5.16%で主導' } }] },
    outlook: { risks: { ko: ['IF GEX 음수 확대 → THEN 변동성 증폭 가능성'], en: ['IF negative GEX widens THEN volatility may amplify'], ja: ['IF GEXのマイナスが拡大 → THEN ボラ増幅の可能性'] } },
};
t('multiLangJsonGate: 정상 3개 언어 JSON 통과 · 필수 키 누락 실패 · 가나 섞인 한국어 칸 실패 · 음차(콜월)는 걸지 않는다', () => {
    const gate = multiLangJsonGate('CrossSector', SRC, { keys: ['marketOverview', 'sectorRotation', 'outlook'], structured: true });
    assert.equal(gate(JSON.stringify(goodBrief)), true);
    const miss = gate(JSON.stringify({ marketOverview: goodBrief.marketOverview })) as any;
    assert.ok(miss === 'missing:sectorRotation,outlook' || (miss && /missing/.test(String(miss.reasons || miss))), String(miss));
    const kana = JSON.parse(JSON.stringify(goodBrief)); kana.marketOverview.summary.ko = 'S&P 500 선물이 소폭 상승하며 ジスカラー 가 올랐다 4,216.30';
    const g1 = gate(JSON.stringify(kana)) as any; assert.equal(g1.ok, false); assert.ok(g1.reasons.some((r: string) => /ko:script/.test(r)), JSON.stringify(g1));
    const translit = JSON.parse(JSON.stringify(goodBrief)); translit.outlook.risks.ko = ['IF 콜월 위로 마감 → THEN 변동성 증폭 가능성 4,216.30'];
    assert.equal(gate(JSON.stringify(translit)), true);
    assert.notEqual(gate('not json'), true);
});

t('evaluateOutput(structured): 글자 비율 검사 대신 문자 체계 — «PLTR +5.16% 리더» 같은 정상 칸이 한글 59%라고 떨어지지 않는다', () => {
    const o = JSON.stringify({ a: { ko: 'PLTR +5.16% 리더, 4/7 상승, Goldman 상향 뉴스 반영', en: 'PLTR leads', ja: 'PLTRが主導' } });
    assert.equal(evaluateOutput({ purpose: 'CrossSector', locale: 'multi', text: o, source: 'x', expectJson: true, structured: false }).ok, false);
    assert.equal(evaluateOutput({ purpose: 'CrossSector', locale: 'multi', text: o, source: 'x', expectJson: true, structured: true }).ok, true);
});

// ── 음차 출구 복원(JSON 전체) ────────────────────────────────────────────────
t('restoreCommonTermsDeep: 한·일 칸의 음차만 영어 이름으로 · 숫자·불리언·키·영어 칸은 그대로', () => {
    const src = { ko: '콜월 $785 와 맥스 페인 $768 사이', en: 'Between Call Wall $785 and Max Pain $768', ja: 'コールウォール$785とマックスペイン$768の間', n: 3, ok: true, list: ['풋플로어 $625', '감마 플립'], nested: { ja: 'ガンマフリップ付近' } };
    const out = restoreCommonTermsDeep(src);
    assert.equal(out.ko, 'Call Wall $785 와 Max Pain $768 사이');
    assert.equal(out.en, src.en);
    assert.equal(out.ja, 'Call Wall$785とMax Pain$768の間');
    assert.deepEqual(out.list, ['Put Floor $625', 'Gamma Flip']);
    assert.equal(out.nested.ja, 'Gamma Flip付近');
    assert.equal(out.n, 3); assert.equal(out.ok, true);
    assert.equal(restoreCommonTermsDeep(null as any), null);
    assert.equal(restoreCommonTermsDeep('콜 월요일 장세' as any), '콜 월요일 장세');   // «월요일» 은 건드리지 않는다
});

// ── 호출 지점 배선(소스 고정) ────────────────────────────────────────────────
t('가디언: 입력 줄 3곳(자금 흐름·5일 유입/유출·STEALTH/EXIT)은 sectorLabelForAi, 출력 두 곳(3개 언어 JSON·단일 언어)은 영어 라벨 복원', () => {
    const node = read('src/services/guardian/intelligenceNode.ts');
    const uds = read('src/services/guardian/unifiedDataStream.ts');
    assert.match(node, /etfToName = \(id: string\): string => sectorLabelForAi\(/);
    assert.equal((uds.match(/sectorLabelForAi\(/g) || []).length, 3, 'formatTopFlows 1 + stealth 1 + exit 1');
    assert.match(node, /return restoreSectorLabels\(parseTriJson\(result\.text \|\| ''\)\)/);
    assert.match(node, /restoreSectorLabelsIn\(locale, result\.text\?\.trim\(\) \?\? ''\)/);
});

t('딥 분석: 프롬프트에 금융 공통어 원문 유지 규칙 · 파서 출구에서 음차 복원(게이트·저장·응답이 모두 이 파서를 지난다)', () => {
    const deep = read('src/app/api/command/deep-analysis/route.ts');
    assert.match(deep, /FINANCE TERM NAMES \(hard rule\)/);
    assert.match(deep, /콜월, 풋플로어, 맥스페인, 감마플립, コールウォール/);
    assert.match(deep, /return restoreCommonTermsDeep\(analysis\);/);
});

t('출구 복원 배선: 모닝 브리핑 · 크로스섹터 · 인텔 스냅샷 · 플로우 AI', () => {
    assert.match(read('src/app/api/guardian/briefing/generate/route.ts'), /briefing\[k\] = restoreCommonTermNames\(briefing\[k\]\)\.text/);
    assert.match(read('src/app/api/intel/cross-sector-brief/route.ts'), /restoreCommonTermsDeep\(JSON\.parse\(bedrockResult\.text\)\)/);
    assert.match(read('src/app/api/intel/snapshot/route.ts'), /restoreCommonTermsDeep\(JSON\.parse\(bedrockResult\.text\)\)/);
    const flow = read('src/app/api/flow/ai-analysis/route.ts');
    assert.match(flow, /return restoreCommonTermsDeep\(parseModelJsonRaw\(raw\)\)/);
    assert.match(flow, /analysis = restoreCommonTermsDeep\(analysis\)/);
});

t('가드 배선: 크로스섹터·스냅샷은 구조(필수 키) + 언어 혼입 가드(structured) · 스냅샷 프롬프트에 «회사명은 라틴 철자» 규칙', () => {
    const cross = read('src/app/api/intel/cross-sector-brief/route.ts');
    assert.match(cross, /multiLangJsonGate\('CrossSector', prompt, \{ keys: \['marketOverview', 'sectorRotation', 'outlook'\], structured: true \}\)/);
    const snap = read('src/app/api/intel/snapshot/route.ts');
    assert.match(snap, /multiLangJsonGate\('IntelSnapshot', userPrompt, \{ keys: \['items'\], structured: true \}\)/);
    assert.match(snap, /LANGUAGE RULES: write Korean fields in Hangul only and never insert Japanese kana/);
    assert.match(snap, /never transliterate them by sound into Hangul or katakana/);
});

console.log(`\n${n} passed`);
