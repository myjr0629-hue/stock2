#!/usr/bin/env node
// ============================================================================
// insight-check — 「이 영상이 무엇을 남기는가」를 검사한다
// ----------------------------------------------------------------------------
// 대표 지시 2026-08-21:
//   "강력한 인사이트를 줘야 무엇인가 얻어가지 상황설명만 하는것이 아니라
//    **모든 쇼츠에 그점을 강력하게 박아라** 우리자원을 활용해도 되고
//    니가 자체 분석을 해도되고 그것이 너의 능력이지"
//
// ⛔ 그래서 인사이트는 «선택»이 아니라 «게이트»다. 없으면 올리지 않는다.
//
// ⛔ 「인사이트」의 정의 — 아래 넷을 다 갖춰야 인사이트다. 하나라도 없으면 상황설명이다.
//   ① 우리가 «계산»한 수치        (남이 발표한 숫자를 옮긴 것은 인사이트가 아니다)
//   ② 비교 기준                   (수준값만으로는 «드물다»를 말할 수 없다)
//   ③ 표본 크기 n                 (소표본 결론 금지)
//   ④ 드물다는 증거               p < 0.05  또는  백분위 <=10 / >=90
//
// ⛔ 그리고 그 인사이트가 «영상 안에서 실제로 말해져야» 한다.
//   대본 자막에 등장하지 않으면 시청자는 아무것도 얻어가지 못한다.
//
// 사용: plan.json 의 각 항목에 insight 블록을 넣는다
//   "insight": {
//     "claim":     "Gold now moves with bitcoin",
//     "metric":    "GLD-IBIT 42일 롤링 상관",
//     "value":     0.62,
//     "baseline":  0.26,          // 무엇과 비교했는가 (중앙값·이전창·평시)
//     "n":         42,
//     "percentile": 94,           // 또는 "pValue": 0.005
//     "computedBy":"scripts/... 또는 세션 내 직접 계산 — 출처를 적는다",
//     "saidAs":    "Gold now moves with bitcoin."   // 대본 자막에 있는 문구
//   }
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { scriptSource } from './_script-source.mjs';

export function checkInsight(it, scriptSrc) {
  const R = [];
  const ok = (name, pass, got, want) => R.push({ name, pass, got, want });
  const I = it.insight;

  if (!I) {
    ok('인사이트 존재', false, '없음',
      '모든 쇼츠는 «얻어가는 것»이 있어야 한다 — 상황설명만으로는 올리지 않는다');
    return R;
  }

  // ⛔ race 계급(두 대상 + 시간 누적)은 «희소성 주장» 을 하지 않는다 (2026-08-23).
  //   아래 p값·백분위·표본 검사는 「이 수치가 통계적으로 드물다」는 주장을 검증하는 장치다.
  //   race 는 확정된 과거 사실을 나란히 놓을 뿐이라 그런 주장이 없다.
  //   ⛔ 통과시키려고 p값을 지어 넣는 것은 이 검사가 막으려는 «바로 그 행위» 다.
  //   그래서 검사를 무르게 하지 않고, 이 계급에 맞는 것을 «대신» 요구한다:
  //     두 수치가 실제로 있고 · 어디서 계산했고 · 원 출처가 무엇인가.
  // ⛔ 나레이션이 없고 «확정된 사실» 만 놓는 계급들.
  //   race 하나에 박아둔것을 stat 이 생기자마자 깨졌다 (2026-08-23).
  // ⛔ 광고(ad)는 «발견» 이 없다 — 앱이 무엇을 주는지 보여주는 판이다 (2026-08-24).
  //   여기에 p값·표본·백분위를 요구하면 통과시키려고 «없는 통계» 를 지어 넣게 된다.
  //   그건 이 검사가 막으려던 바로 그 행위다. 대신 광고가 «책임져야 할 것» 을 요구한다:
  //     ① 화면이 실캡처인가 (AI 가 그린 UI 금지 — endcards.ts §8)
  //     ② 무엇을 준다고 말하는지 한 줄로 적혀 있는가
  //     ③ 검증 불가능한 수치를 말하지 않는가 (캡처는 시세가 늙는다)
  if (it.class === 'ad') {
    ok('광고 주장', !!I.claim && I.claim.length >= 8, I.claim || '없음', '무엇을 주는 앱인지 한 줄');
    ok('화면 출처', /capture|캡처|appshots/i.test(I.source || ''), I.source || '없음',
      '실캡처 경로를 밝힌다 — AI 가 그린 UI 는 금지');
    // ⛔ 본문만 본다. 아래 「많이 본 영상」 목록은 «우리 영상 제목» 이라 $10,000 같은 것이 들어간다 —
    //   그건 늙는 시세가 아니라 고정된 제목이다. 첫 실행에서 이걸 위반으로 잡았다.
    const body = String(it.description || '').split('___')[0];
    const nums = body.match(/\$?\d+(\.\d+)?%?/g) || [];
    const live = nums.filter((x) => /\./.test(x) || /^\$/.test(x));
    ok('시세 수치 없음', live.length === 0, live.join(' ') || '없음',
      '광고에는 «늙는 수치» 를 넣지 않는다 (캡처를 다시 뜨면 어긋난다)');
    return R;
  }

  const FACTUAL = ['race', 'stat'];
  if (FACTUAL.includes(it.class)) {
    ok('인사이트 주장', !!I.claim && I.claim.length >= 8, I.claim || '없음', '한 문장으로 무엇을 알아가는가');
    ok('자체 계산 출처', !!I.computedBy, I.computedBy || '없음', '어디서 계산했는가');
    ok('수치', typeof I.value === 'number', I.value ?? '없음', '숫자여야 한다');
    ok('비교 대상', typeof I.baseline === 'number', I.baseline ?? '없음', '나란히 놓은 반대편 숫자');
    ok('원 출처', !!I.source, I.source || '없음',
      '가격 출처를 명시한다 (예: FMP 분할조정 종가). 화면에 나가는 숫자다');
    return R;
  }

  ok('인사이트 주장', !!I.claim && I.claim.length >= 8, I.claim || '없음', '한 문장으로 무엇을 알아가는가');

  // ① 우리가 계산한 수치인가
  ok('자체 계산 출처', !!I.computedBy, I.computedBy || '없음',
    '남이 발표한 숫자를 옮긴 것은 인사이트가 아니다');
  ok('수치', typeof I.value === 'number', I.value ?? '없음', '숫자여야 한다');

  // ② 비교 기준 — 수준값만으로는 «드물다»를 말할 수 없다
  ok('비교 기준', typeof I.baseline === 'number', I.baseline ?? '없음',
    '중앙값·이전창·평시 등 무엇과 비교했는지 (수준값만으로는 의미가 없다)');

  // ③ 표본 크기
  const n = I.n;
  ok('표본 크기', typeof n === 'number' && n >= 20, n ?? '없음',
    '>= 20 (소표본으로 결론내지 않는다)');

  // ④ 드문가 — p 또는 백분위
  const p = I.pValue, pc = I.percentile;
  const rare = (typeof p === 'number' && p < 0.05) ||
               (typeof pc === 'number' && (pc <= 10 || pc >= 90));
  ok('드물다는 증거', rare,
    typeof p === 'number' ? `p=${p}` : (typeof pc === 'number' ? `백분위 ${pc}` : '없음'),
    'p < 0.05 또는 백분위 <=10 / >=90 (평범한 값은 인사이트가 아니다)');

  // ⑤ 실제로 영상에서 말해지는가
  if (scriptSrc && it.scriptTag) {
    const i = scriptSrc.indexOf(`export const SCRIPT_${it.scriptTag}`);
    const end = i < 0 ? -1 : scriptSrc.indexOf('\nexport const SCRIPT_', i + 10);
    const blk = i < 0 ? '' : scriptSrc.slice(i, end < 0 ? scriptSrc.length : end);
    const said = (I.saidAs || I.claim || '').trim();
    ok('대본에서 말해지는가', !!said && blk.includes(said), said || '없음',
      '인사이트가 자막에 «그대로» 나와야 한다 (안 나오면 시청자는 못 얻는다)');
  }

  return R;
}

const direct = String(process.argv[1] || '').endsWith('insight-check.mjs');
if (direct) {
  const p = process.argv[2];
  if (!p || !existsSync(p)) { console.error('사용: insight-check <plan.json>'); process.exit(1); }
  const items = [].concat(JSON.parse(readFileSync(p, 'utf8')));
  const src = scriptSource();
  let bad = 0;
  for (const it of items) {
    console.log(`\n  ${it.title}`);
    const R = checkInsight(it, src);
    for (const r of R)
      console.log(`   ${r.pass ? '✔' : '✗'} ${r.name.padEnd(14)} ${String(r.got).padEnd(42)} ${r.pass ? '' : '기준 ' + r.want}`);
    const f = R.filter((r) => !r.pass).length; bad += f;
    console.log(f ? `   ✗ 위반 ${f}건` : '   ✔ 인사이트 통과');
  }
  process.exit(bad ? 1 : 0);
}
