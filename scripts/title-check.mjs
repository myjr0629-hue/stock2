#!/usr/bin/env node
// ============================================================================
// title-check — 제목을 «실측 규칙»으로 검사한다 (shorts-gate 가 호출)
// ----------------------------------------------------------------------------
// 왜 (2026-08-20): 게이트가 길이·기호만 봤더니, 우리 채널 «최하위 형식»(두 문장 대비형)
//   그대로 나가는 걸 못 잡았다. 형식과 수요를 같이 본다.
//
// 근거
//   우리 채널 n=22  두문장 대비형 15편 조회 중앙 40  ·  그 외 7편 104  ·  Why/How 3편 177
//   교차채널 n=1,964 제목 «형식»은 무의미(|r|<=0.06) → 형식 규칙은 «우리 채널» 근거다
//   검색 수요 .agent/DEMAND.json — 수요 문구를 앞에 둔다
//
// ⛔ 2026-08-21 «완화». 대표 지적: "게이트가 어떻게 잡혀있는지 모르지만
//    제목을 과감하게 소제를 과감하게 작성한다".
//    근거를 다시 보니 내가 «없는 근거»로 제목을 얌전하게 묶고 있었다.
//
//    | 규칙            | 근거                     | 조치 |
//    |----------------|-------------------------|------|
//    | 수요 어휘 포함    | 22편 중 1편, 조회 중앙 42  | 유지 (진짜 관문) |
//    | 동음이의 회피     | "ai bubble" 게임밈 21%    | 유지 |
//    | 1문장           | 대비형 40 vs 그 외 104     | 유지 |
//    | Why/How 시작     | **n=3**                  | **해제** — 표시만 |
//    | 물음표 금지       | **"효과 없음"**           | **해제** — 효과 없음은 금지 사유가 아니다 |
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { demandFor } from './_demand.mjs';

// ⛔ 언어별 수요표 (2026-08-21) — checkTitle(title, lang) 로 받는다

export function checkTitle(title, lang = 'en') {
  const D = demandFor(lang);
  const t = String(title || '');
  const low = t.toLowerCase();
  const out = [];
  const add = (name, pass, got, want) => out.push({ name, pass, got, want });

  // ① 문장 수 — 두/세 문장 대비형은 우리 채널 최하위 형식
  //   ※ 물음표로 끝나는 한 문장은 «한 문장»이다. 콜론·대괄호도 문장을 나누지 않는다.
  const sentences = t.split(/[.!?]\s+/).filter((x) => x.trim().length > 2).length;
  add('제목 문장 수', sentences <= 1, `${sentences}문장`, '1문장 (대비형 n=15 중앙 40 vs 그 외 104)');

  // ② 여는 말 — 강제하지 않는다 (n=3 근거)
  const wh = /^(why|how)\b/i.test(t);
  add('여는 말', true, wh ? 'Why/How (우리 1·3위 프레임)' : `"${t.split(' ')[0]}" — 자유`,
    '강제 아님. Why/How 는 n=3 근거라 참고만 한다');

  // ③ 수요 문구 — 실제로 검색되는 말이 들어 있는가, 얼마나 앞쪽인가
  //   ⛔ 여기가 «진짜 관문»이다. 발행 22편 중 21편이 이걸 어겨서 조회 중앙 42 였다.
  let best = null;
  for (const [term, vol] of Object.entries(D.terms || {})) {
    // ⛔ 키도 소문자로 — 제목만 낮추면 S&P500·FRB 가 영원히 안 걸린다 (2026-08-22)
    const i = low.indexOf(term.toLowerCase());
    if (i >= 0 && (!best || vol > best.vol)) best = { term, vol, pos: i };
  }
  // 검색 겨냥(개념편)과 피드 겨냥(당일 뉴스)은 규칙이 다르다.
  // 당일 뉴스는 검색 수요가 «휘발»이라 수요 앵커를 강제하면 제목이 어색해진다.
  // ⛔ 2026-08-23 교체. 「Why/How 시작」만 피드 프레임으로 인정하던 규칙은 «실측으로 무효»다.
  //   Why : 우리 25편 z=2.74 → 나이 교란이었고, 라이벌 2,068편 z=-0.47, 신규채널 20,691편 z=0.91
  //   How : 신규채널 20,691편 z=-1.60
  //   대신 같은 표본에서 «유의하게» 나온 장치들을 피드 프레임으로 인정한다:
  //     랭킹 1.38배 z=5.14 · 시간경과 1.38배 z=3.52 · 유명인 1.25배 z=9.52
  //     대결(vs) 1.06배 z=2.76 · 유명 브랜드 1.09배 z=2.56 · 금액 1.08배 z=2.39
  //   ⛔ 검색 수요 어휘는 그대로 둔다 — 이건 검색 유입용이고 위는 피드 유입용이다.
  const MEASURED_FRAME =
    /(top\s*\d+|ranked|ranking|#\s?[1-9]|best\s+\d+|worst\s+\d+)/i.test(t) ||
    /(\d+\s*years?\s*(ago|later)|over\s*\d+\s*years?|in\s*\d+\s*years?|decade)/i.test(t) ||
    /vs\.?|versus|then\s*(vs|and)\s*now/i.test(t) ||
    /(elon|musk|bezos|jobs|buffett|gates|cuban|zuckerberg|jensen|huang|altman)/i.test(t) ||
    /(nvidia|nvda|intel|intc|apple|aapl|tesla|tsla|amd|micron|microsoft|msft|amazon|google|meta|broadcom|palantir)/i.test(t) ||
    /(\$[\d,]+|\d+\s*(million|billion|trillion))/i.test(t);
  const feedFrame = wh || MEASURED_FRAME;
  add('수요 앵커 또는 피드 프레임', (!!best && best.vol >= 800) || feedFrame,
    best && best.vol >= 800 ? `"${best.term}" 수요 ${best.vol.toLocaleString()}`
      : wh ? '피드 프레임(Why/How)' : MEASURED_FRAME ? '피드 프레임(실측 장치: 랭킹/시간경과/vs/유명명/금액)' : '없음',
    '수요 800+ 문구 또는 Why/How 시작');
  if (best && best.vol >= 800) add('수요 문구 위치', best.pos <= 34, `${best.pos}번째 글자`, '앞쪽 34자 이내');

  // ④ 동음이의어 충돌 — 검색 유입이 우리 주제로 오는가
  const clash = Object.keys(D.homonyms || {}).filter((k) => low.includes(k) && low.indexOf(k) <= 12);
  add('동음이의어 충돌', clash.length === 0, clash.length ? clash.join(', ') : '없음',
    '충돌어를 앞 12자에 두지 않는다');

  return out;
}

// 직접 실행일 때만 (import 되면 조용히 있는다)
const DIRECT = String(process.argv[1] || '').endsWith('title-check.mjs');
if (DIRECT && process.argv[2]) {
  for (const r of checkTitle(process.argv[2], process.argv[3] || 'en'))
    console.log(`  ${r.pass ? '✔' : '✗'} ${r.name.padEnd(16)} ${String(r.got).padEnd(38)} ${r.pass ? '' : '기준 ' + r.want}`);
}
