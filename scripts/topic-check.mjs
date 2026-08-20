#!/usr/bin/env node
// ============================================================================
// topic-check — 「소재」를 렌더 전에 검사한다
// ----------------------------------------------------------------------------
// 왜 만드는가 (대표 지시 2026-08-21)
//   "게이트라는것이 영상만을 말하는것이 아니다"
//   "소제선정 - 원하는것을 떠먹여줘야한다"
//   "소재의 범위를 주식으로만 잡지말고 (…) 시장에 영향을 줄수있는 소재까지"
//
// ⛔ 이 게이트가 생긴 실측 근거 (2026-08-21)
//   발행 22편의 제목을 측정 수요 어휘 91개와 대조 → **매칭 1편(4.5%)**.
//   즉 우리 제목 21편은 «아무도 검색하지 않는 문장»이었다. 조회 중앙 42의 구조적 원인.
//   유일한 매칭조차 "amd stock"(수요 286)으로 사실상 0에 가깝다.
//
// ⛔ 수요는 «추측»하지 않는다. .agent/DEMAND.json 이 정본이고, 그 값은
//   yt-dlp 검색 상위 조회 중앙값의 실측이다. 없는 어휘는 재측정해서 등록한다.
//
// 사용: node scripts/topic-check.mjs <topic.json>
//   { "title": "...", "topic": "gold", "evidence": ["GLD 일봉 Polygon 2026-01~08"],
//     "freshnessDays": 2, "homonymPct": 11 }
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';

const DEMAND = JSON.parse(readFileSync('.agent/DEMAND.json', 'utf8')).terms;
const KEYS = Object.keys(DEMAND).sort((a, b) => b.length - a.length);

// ── 임계값의 근거 ───────────────────────────────────────────────────────────
// MIN_DEMAND 5000: 우리가 만든 것 중 최고 수요는 RSI 33,947, 최저는 max pain 2,822.
//   매크로 분류의 «최하위»(고용 13,082)조차 우리 최저의 4.6배다. 5,000 은
//   「우리 과거 최저(2,822)보다 확실히 위, 매크로 최하위(13,082)보다는 아래」로 잡은 하한이다.
// HOMONYM_MAX 40: "ai bubble" 검색 상위 19편 중 게임 밈(Triple T) 4편 = 21%.
//   오염이 40% 를 넘으면 검색 유입이 우리 주제로 오지 않는다.
const MIN_DEMAND = 5000;
const HOMONYM_MAX = 40;
const MAX_FRESHNESS_DAYS = 7;   // 뉴스성 소재만 적용

export function checkTopic(it) {
  const R = [];
  const ok = (name, pass, got, want) => R.push({ name, pass, got, want });
  const T = (it.title || '').toLowerCase();

  // ① 제목이 «검색되는 말»을 실제로 담고 있는가 — 가장 중요한 항목
  const hits = KEYS.filter((k) => T.includes(k));
  const best = hits.length ? Math.max(...hits.map((k) => DEMAND[k])) : 0;
  const bestKey = hits.find((k) => DEMAND[k] === best) || null;
  ok('제목에 수요 어휘', hits.length > 0,
    bestKey ? `"${bestKey}" (수요 ${best.toLocaleString()})` : '없음 — 아무도 검색하지 않는 문장',
    '.agent/DEMAND.json 의 어휘가 제목에 «그대로» 들어가야 한다');

  // ② 수요의 크기
  ok('소재 수요', best >= MIN_DEMAND, best.toLocaleString(),
    `>= ${MIN_DEMAND.toLocaleString()} (우리 과거 최저 2,822 · 매크로 최하위 13,082)`);

  // ③ 우리 데이터로 실증되는가 — 지어내지 않는다는 원칙의 게이트화
  const ev = Array.isArray(it.evidence) ? it.evidence.filter(Boolean) : [];
  ok('실증 근거', ev.length > 0, ev.length ? `${ev.length}건: ${ev[0]}` : '없음',
    '숫자·화면은 실데이터 출처가 있어야 한다 (지어내지 않는다)');

  // ④ 동음이의 오염 — 검색 유입이 우리 주제로 오는가
  if (it.homonymPct !== undefined && it.homonymPct !== null)
    ok('동음이의 오염', it.homonymPct <= HOMONYM_MAX, `${it.homonymPct}%`,
      `<= ${HOMONYM_MAX}% (예: "ai bubble" 은 게임 밈 21% 섞임)`);

  // ⑤ 신선도 — 뉴스성 소재만
  if (it.freshnessDays !== undefined && it.freshnessDays !== null)
    ok('근거 신선도', it.freshnessDays <= MAX_FRESHNESS_DAYS, `${it.freshnessDays}일 전`,
      `<= ${MAX_FRESHNESS_DAYS}일 (뉴스성 소재)`);

  return R;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const direct = String(process.argv[1] || '').endsWith('topic-check.mjs');
if (direct) {
  const p = process.argv[2];
  if (!p || !existsSync(p)) { console.error('사용: topic-check <topic.json>'); process.exit(1); }
  const items = [].concat(JSON.parse(readFileSync(p, 'utf8')));
  let bad = 0;
  for (const it of items) {
    console.log(`\n  ┌ ${it.title}`);
    const R = checkTopic(it);
    for (const r of R)
      console.log(`  │ ${r.pass ? '✔' : '✗'} ${r.name.padEnd(16)} ${String(r.got).padEnd(34)} ${r.pass ? '' : '기준 ' + r.want}`);
    const f = R.filter((r) => !r.pass).length; bad += f;
    console.log(`  └ ${f ? `✗ 위반 ${f}건` : '✅ 소재 통과'}`);
  }
  process.exit(bad ? 1 : 0);
}
