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
import { demandFor, tickerRe } from './_demand.mjs';

// ⛔ 언어별 수요표. 일본어 제목은 영어 표에 없어서 항상 «수요 0» 이 나왔다 (2026-08-21).
//   it.lang 이 없으면 en 으로 본다 — 기존 영어 편 동작은 그대로다.
//   (KEYS 는 언어마다 다르므로 checkTopic 안에서 만든다)

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
  const LANG = String(it.lang || 'en').toLowerCase();
  const DEMAND = demandFor(LANG).terms;
  // ⛔ 긴 문구부터 본다 — 짧은 말이 먼저 걸리면 더 정확한 긴 문구를 놓친다
  const KEYS = Object.keys(DEMAND).sort((a, b) => b.length - a.length);
  const R = [];
  const ok = (name, pass, got, want) => R.push({ name, pass, got, want });
  const T = (it.title || '').toLowerCase();

  // ① 제목이 «검색되는 말»을 실제로 담고 있는가 — 가장 중요한 항목
  // ⛔ 키도 «같이» 소문자로 본다 — 제목만 낮추면 S&P500·FRB 같은 대문자 어휘가
  //   영원히 걸리지 않는다 (2026-08-22 에 이 버그로 S&P500 20,926 이 0 으로 나왔다)
  // ⛔ 공백을 지운 형태도 본다 (2026-08-24). 수요표의 키는 «검색 질의» 라서
  //   「米国 金利」처럼 토큰이 띄어져 있는데, 일본어 문장에는 띄어쓰기가 없다.
  //   그래서 일본 수요 1위(83,743)가 «영원히» 안 걸렸다. title-check 와 같은 버그였다 —
  //   한 곳만 고치고 여기를 놓쳐서, 롱폼 제목이 「수요 0」으로 반려됐다.
  const forms = (k) => (k.includes(' ') ? [k.toLowerCase(), k.toLowerCase().replace(/\s+/g, '')] : [k.toLowerCase()]);
  const hits = KEYS.filter((k) => forms(k).some((f) => T.includes(f)));
  const best = hits.length ? Math.max(...hits.map((k) => DEMAND[k])) : 0;
  const bestKey = hits.find((k) => DEMAND[k] === best) || null;
  ok('제목에 수요 어휘', hits.length > 0,
    bestKey ? `"${bestKey}" (수요 ${best.toLocaleString()})` : '없음 — 아무도 검색하지 않는 문장',
    `${LANG === 'ja' ? '.agent/DEMAND_JA.json' : '.agent/DEMAND.json'} 의 어휘가 제목에 «그대로» 들어가야 한다`);

  // ② 수요의 크기
  ok('소재 수요', best >= MIN_DEMAND, best.toLocaleString(),
    `>= ${MIN_DEMAND.toLocaleString()} (우리 과거 최저 2,822 · 매크로 최하위 13,082)`);

  // ③ 우리 데이터로 실증되는가 — 지어내지 않는다는 원칙의 게이트화
  const ev = Array.isArray(it.evidence) ? it.evidence.filter(Boolean) : [];
  ok('실증 근거', ev.length > 0, ev.length ? `${ev.length}건: ${ev[0]}` : '없음',
    '숫자·화면은 실데이터 출처가 있어야 한다 (지어내지 않는다)');

  // ⑤ ★ 스토리 — 「세상에서 무슨 일이 있었고 → 왜 시장에 닿고 → 우리 숫자엔 어떻게 → 오늘 밤 뭘 본다」
  //   ⛔ 대표 지적 2026-08-21: "기준선은 소재 선정 단계에서 정했어야지"
  //     지금까지 소재를 「문 x 이상값」으로만 골랐다. 그래서 통계적 이상값은 나왔지만
  //     «오늘 밤 확인할 숫자»가 없었고 결론이 「통화 베팅이다」처럼 추상으로 끝났다.
  //     사람들이 더 궁금해하는 건 수치가 아니라 «무슨 일이 벌어졌고 그게 이렇게 나타난다»는 이야기다.
  //   ⇒ 네 칸이 다 차야 소재다. 재료는 scripts/news-radar.mjs 가 캔다.
  const st = it.story || {};
  ok('① 사건', !!st.event, st.event ? String(st.event).slice(0, 60) : '없음',
    '세상에서 무슨 일이 벌어졌나 (가디언 뉴스·캘린더·연준). 개념편이면 「왜 지금 이 개념인가」');
  ok('② 영향 경로', !!st.mechanism && String(st.mechanism).length >= 20,
    st.mechanism ? String(st.mechanism).slice(0, 60) : '없음',
    '그게 «왜» 시장에 닿는지 한 줄. 이 줄이 스토리다 — 없으면 수치 나열이 된다');
  ok('④ 기준선 하나', !!st.anchor, st.anchor || '없음',
    '오늘 밤 확인할 숫자 «하나». 여러 개면 기억에 안 남는다 (레퍼런스 3소스 합의)');
  if (st.anchor) {
    // ⛔ 기준선은 «숫자»여야 한다. 「지켜보자」 같은 말은 기준선이 아니다.
    ok('기준선에 숫자', /[0-9]/.test(String(st.anchor)), String(st.anchor).slice(0, 50),
      '숫자가 들어가야 «확인»할 수 있다');
  }

  // ④ 동음이의 오염 — 검색 유입이 우리 주제로 오는가
  if (it.homonymPct !== undefined && it.homonymPct !== null)
    ok('동음이의 오염', it.homonymPct <= HOMONYM_MAX, `${it.homonymPct}%`,
      `<= ${HOMONYM_MAX}% (예: "ai bubble" 은 게임 밈 21% 섞임)`);

  // ⑤ 종목 해석 — 매크로 소재에도 «종목»이 붙어야 한다 (대표 지시 2026-08-21)
  //   "종목관련한 그런 것이 조금더 높은것같다 내용에 종목에 관한것이 분명 있어서
  //    해석을 넣는것이 좋을것같다"
  //   우리 채널 실측 (7/1~8/21): 제목에 종목명 있는 6편 조회중앙 86 · 평균시청률 88%
  //                            없는 15편 조회중앙 40 · 47%
  //   ⚠ 순위합 z=1.09(조회) / 1.48(시청률) — n=6 vs 15 라 «유의 아님». 방향만 일관되다.
  //   ⇒ 막지는 않고 «없으면 표시»한다. 표본이 쌓이면 그때 강제로 바꾼다.
  const TICKERS = tickerRe(LANG);
  const inTitle = TICKERS.test(it.title || '');
  const inBody = TICKERS.test([].concat(it.evidence || []).join(' ') + ' ' + (it.insight?.claim || ''));
  // ⛔ 이 규칙은 «막지 않는다» — 위 주석의 의도가 그랬는데 구현이 막고 있었다 (2026-08-21 발견).
  //   근거 자체가 n=6 vs 15, z=1.09/1.48 로 «유의하지 않다»고 적혀 있다.
  //   유의하지 않은 규칙으로 매크로 편(FRED 계열만 쓰는 편)을 막으면 안 된다. 표시만 한다.
  R.push({ name: '종목 해석', pass: true,
    got: inTitle ? '제목에 종목명' : (inBody ? '근거에만 (제목엔 없음)' : '없음 — 매크로 편이면 정상'),
    want: '종목명이 제목에 있으면 좋다 (있는 편 조회중앙 86·시청률 88% vs 없는 편 40·47%, n=21 관찰)' });

  // ⑥ 신선도 — 뉴스성 소재만
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
