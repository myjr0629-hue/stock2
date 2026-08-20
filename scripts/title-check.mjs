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
//   검색 수요 .agent/DEMAND.json — 최대 43배 차이. 수요 문구를 앞에 둔다
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';

const D = existsSync('.agent/DEMAND.json')
  ? JSON.parse(readFileSync('.agent/DEMAND.json', 'utf8')) : { terms: {}, homonyms: {} };

export function checkTitle(title) {
  const t = String(title || '');
  const low = t.toLowerCase();
  const out = [];
  const add = (name, pass, got, want) => out.push({ name, pass, got, want });

  // ① 문장 수 — 두/세 문장 대비형은 우리 채널 최하위 형식
  const sentences = t.split(/[.!?]\s+/).filter((x) => x.trim().length > 2).length;
  add('제목 문장 수', sentences <= 1, `${sentences}문장`, '1문장 (대비형 n=15 중앙 40 vs 그 외 104)');

  // ② 여는 말 — Why/How 로 여는 3편이 중앙 177
  add('Why/How 로 시작', /^(why|how)\b/i.test(t), /^(why|how)\b/i.test(t) ? 'Why/How' : t.split(' ')[0],
    'Why 또는 How (우리 1·3위 제목의 프레임)');

  // ③ 수요 문구 — 실제로 검색되는 말이 들어 있는가, 얼마나 앞쪽인가
  let best = null;
  for (const [term, vol] of Object.entries(D.terms || {})) {
    const i = low.indexOf(term);
    if (i >= 0 && (!best || vol > best.vol)) best = { term, vol, pos: i };
  }
  // ⛔ 검색 겨냥(개념편)과 피드 겨냥(당일 뉴스)은 규칙이 다르다.
  //    당일 뉴스는 검색 수요가 «휘발»이라 수요 앵커를 강제하면 오히려 제목이 어색해진다.
  //    → 둘 중 하나면 통과: (a) 수요 800+ 문구 포함  또는  (b) Why/How 프레임(우리 1·3위)
  const feedFrame = /^(why|how)\b/i.test(t);
  add('수요 앵커 또는 피드 프레임', (!!best && best.vol >= 800) || feedFrame,
    best && best.vol >= 800 ? `"${best.term}" 수요 ${best.vol.toLocaleString()}`
      : feedFrame ? '피드 프레임(Why/How)' : '없음',
    '수요 800+ 문구 또는 Why/How 시작');
  if (best && best.vol >= 800) add('수요 문구 위치', best.pos <= 34, `${best.pos}번째 글자`, '앞쪽 34자 이내');

  // ④ 동음이의어 충돌
  const clash = Object.keys(D.homonyms || {}).filter((k) => low.includes(k) && low.indexOf(k) <= 12);
  add('동음이의어 충돌', clash.length === 0, clash.length ? clash.join(', ') : '없음',
    '충돌어를 앞 12자에 두지 않는다');

  return out;
}

// 직접 실행일 때만 (import 되면 조용히 있는다)
const DIRECT = String(process.argv[1] || '').endsWith('title-check.mjs');
if (DIRECT && process.argv[2]) {
  for (const r of checkTitle(process.argv.slice(2).join(' ')))
    console.log(`  ${r.pass ? '✔' : '✗'} ${r.name.padEnd(16)} ${String(r.got).padEnd(38)} ${r.pass ? '' : '기준 ' + r.want}`);
}
