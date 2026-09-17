#!/usr/bin/env node
// 마케팅 자동화 = «이 루프» 다. Vercel/GitHub 크론은 마케팅에 쓰지 않는다(8월 자동발행 체제 = 설치 0).
// 이 스크립트가 루프의 «시계» 역할을 한다: 지금 시각에 무엇이 열려 있고 무엇이 마감됐는지 결정론적으로 알려준다.
//   node scripts/mkt-plan.js              → 지금 할 일
//   node scripts/mkt-plan.js pub <채널> <URL> [메모]  → 발행 원장에 기록(캡 계산의 근거)
//   node scripts/mkt-plan.js today        → 오늘 발행 현황
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(ROOT, '.agent/marketing/PUBLISH-LEDGER.json');
const QUEUE = path.join(ROOT, '.agent/marketing/QUEUE.json');
const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000);
const kstDate = (d = new Date()) => kst(d).toISOString().slice(0, 10);
const utcDate = (d = new Date()) => d.toISOString().slice(0, 10);
const hhmm = (d = new Date()) => kst(d).toISOString().slice(11, 16);
const load = () => { try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch { return { entries: [] }; } };
const save = (o) => fs.writeFileSync(LEDGER, JSON.stringify(o, null, 1));

// 채널 규칙: cap 은 «하루 몇 편», day 는 캡을 재는 달력(kst | utc), window 는 KST 시간대(열림~닫힘)
const CH = {
  reddit:      { cap: 3, day: 'utc', window: [0, 24], note: '무링크·무앱명·같은 스레드 중복 금지·8분 간격·r/Daytrading 제외' },
  quora_en:    { cap: 1, day: 'utc', window: [0, 24], note: '§11-6 순수 가치·앱명 0~1회·데이터 화면 1장' },
  quora_jp:    { cap: 1, day: 'utc', window: [0, 24], note: '피드가 마르면 억지 발행 금지' },
  x_post:      { cap: 1, day: 'kst', window: [0, 24], note: '링크는 앞 280자 안' },
  x_reply:     { cap: 3, day: 'kst', window: [21, 24], note: '청중 차용. 280자 하드 제한·링크 금지·with_replies 로 검증' },
  threads:     { cap: 1, day: 'kst', window: [0, 24], note: '패널 좌표로 스코프·프로필 time 으로 검증' },
  threads_reply: { cap: 2, day: 'kst', window: [0, 24], note: '오독 정정은 반드시 원문 확인 후' },
  instagram:   { cap: 1, day: 'kst', window: [0, 24], note: '자르기 «원본»·링크는 바이오' },
  pinterest:   { cap: 1, day: 'kst', window: [0, 24], note: '링크 입력 후 값 재읽기→저장→공개 href 3단 검증' },
  linkedin:    { cap: 1, day: 'kst', window: [0, 24], note: '카드 위 클릭 금지·전체 재입력' },
  note_jp:     { cap: 1, day: 'kst', window: [0, 24], note: 'execCommand 단락·아이캐치·リンク 적용까지' },
  medium:      { cap: 1, day: 'kst', window: [0, 24], note: '제목 복구 ⌘⌥1 → 1문단 → 이미지 순서' },
  indiehackers:{ cap: 1, day: 'kst', window: [0, 24], note: '제품 타임라인 포스트' },
  github:      { cap: 1, day: 'kst', window: [5, 24], note: '미국 마감 후 스냅샷 → edit/new 경로로 커밋' },
  x_jp:        { cap: 1, day: 'kst', window: [0, 24], note: 'JP 원글. 계정 전환 후 프로필 링크가 /signumhq_jp 인지 확인하고 쓴다(오발행 전례)' },
  bluesky:     { cap: 1, day: 'kst', window: [0, 24], note: '웹 컴포저. 이미지 첨부는 ego 불가 → 앱 스마트링크의 OG 카드가 자동 임베드되는지 확인하고, 카드가 붙을 때만 발행' },
  quora_space: { cap: 1, day: 'kst', window: [0, 24], note: '브랜드명·앱링크가 허용되는 유일한 Quora 표면 — 답변 재활용 금지, Space 전용 글' },
  hackernews:  { cap: 1, day: 'week', window: [21, 24], note: '카르마 1. 링크 없는 가치 댓글로만. Show HN 은 카르마·타이밍(화·수 08–09 ET) 갖춘 뒤 1회' },
  directories: { cap: 1, day: 'kst', window: [0, 24], note: 'DIRECTORY-LIST.md 에서 미시도 1곳씩. 계정 생성 필요하면 즉시 #T8 티켓' },
  aso:         { cap: 1, day: 'week', window: [0, 24], note: '주간: 앱스토어·플레이 키워드 순위와 평점 수 점검 → ASO-KEYWORD-MAP 갱신' },
  seo:         { cap: 1, day: 'week', window: [0, 24], note: '주간: GSC 상위질의·색인 수 점검. 게시 채널이 아니라 사이트 작업' },
  tiktok:      { cap: 1, day: 'week', window: [0, 24], note: '신생계정 도달 0 실측 — 주 1회 유지 게시만(비용 0), 성과 기대 금지' },
};
// 관리 제외(사유 고정): youtube=대표 윈도우 운영 · stocktwits=무기한 제재 · buffer=대표 지시 영구 정지
const EXCLUDED = { youtube: '대표가 윈도우에서 직접 운영 — 접근 금지', stocktwits: '무기한 제재 — 게시 금지', buffer: '2026-09-01 대표 지시로 영구 정지' };
// 고정 점검(KST)
const CHECKS = [
  { at: '05:00', what: 'GitHub 데이터셋 스냅샷', cmd: 'node scripts/marketing/github-structure-snapshot.js' },
  { at: '06:50', what: 'cross-sector 람다 검증', cmd: 'node /tmp/ego/verify-lambdas.js cross' },
  { at: '07:25', what: 'XS-3.0 / XS-2.0 실행 검증', cmd: 'node /tmp/ego/verify-lambdas.js xs3' },
  { at: '09:00', what: 'UTC 전환 — Reddit·Quora 창 열림', cmd: '' },
  { at: '22:30', what: '미국 정규장 개장 — X 답글·레딧 가치 댓글', cmd: '' },
];

function counts() {
  const led = load(); const k = kstDate(); const u = utcDate();
  const out = {};
  for (const [ch, r] of Object.entries(CH)) {
    const d = r.day === 'utc' ? u : k;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const used = r.day === 'week'
      ? led.entries.filter((e) => e.ch === ch && e.kst >= weekAgo).length
      : led.entries.filter((e) => e.ch === ch && (r.day === 'utc' ? e.utc === d : e.kst === d)).length;
    out[ch] = { used, cap: r.cap, left: Math.max(0, r.cap - used), day: r.day, window: r.window, note: r.note };
  }
  return out;
}
const cmd = process.argv[2];
if (cmd === 'pub') {
  const [, , , ch, url, ...rest] = process.argv;
  if (!CH[ch]) { console.error('알 수 없는 채널. 가능: ' + Object.keys(CH).join(', ')); process.exit(1); }
  const led = load(); led.entries.unshift({ ch, url: url || '', note: rest.join(' '), at: new Date().toISOString(), kst: kstDate(), utc: utcDate() });
  led.entries = led.entries.slice(0, 500); save(led);
  const c = counts()[ch]; console.log(`기록: ${ch} ${url || ''} → 오늘 ${c.used}/${c.cap} (${c.day} 기준)`);
  process.exit(0);
}
const c = counts(); const now = hhmm(); const hour = Number(now.slice(0, 2));
let REG = [];
try { const raw = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/channels.json'), 'utf8')); REG = (Array.isArray(raw) ? raw : (raw.channels || [])).map((x) => ({ id: x.id || x.key || x.name, tier: x.tier || x.type || '?', note: x.note || '' })); } catch {}
const ALIAS = { x_us: 'x_post', quora: 'quora_en', note: 'note_jp' };

if (cmd === 'today') { const led = load(); const k = kstDate(); for (const e of led.entries.filter((x) => x.kst === k)) console.log(`${e.at.slice(11, 16)}Z ${e.ch.padEnd(14)} ${e.url}`); process.exit(0); }
console.log(`■ 지금 ${now} KST (UTC ${utcDate()} / KST ${kstDate()})`);
const open = [], closed = [];
for (const [ch, v] of Object.entries(c)) {
  const inWindow = hour >= v.window[0] && hour < v.window[1];
  const line = `${ch.padEnd(14)} ${v.used}/${v.cap}${v.day === 'utc' ? ' (UTC일)' : ''}${inWindow ? '' : ` [창 ${v.window[0]}~${v.window[1]}시]`}  ${v.note}`;
  (v.left > 0 && inWindow ? open : closed).push(line);
}
console.log('\n● 지금 열린 채널(' + open.length + ')'); open.forEach((l) => console.log('  ' + l));
console.log('\n○ 마감/대기(' + closed.length + ')'); closed.forEach((l) => console.log('  ' + l));
console.log('\n■ 등록 채널 전수 점검(' + REG.length + ')');
for (const r of REG) { const key = ALIAS[r.id] || r.id; const v = c[key]; const state = v ? `${v.used}/${v.cap}${v.left > 0 ? ' 가능' : ' 소진'}` : '규칙표 없음 → 성격에 맞는 행동 정의 필요'; console.log(`  [${r.tier}] ${String(r.id).padEnd(14)} ${state}${r.note ? '  · ' + String(r.note).slice(0, 48) : ''}`); }
const NOT_IN_RULES = REG.filter((r) => !c[ALIAS[r.id] || r.id] && !EXCLUDED[r.id]).map((r) => r.id);
for (const [k, why] of Object.entries(EXCLUDED)) console.log(`  [-] ${k.padEnd(14)} 관리 제외 · ${why}`);
if (NOT_IN_RULES.length) console.log('  ⚠ 규칙 미정의: ' + NOT_IN_RULES.join(', ') + ' → 이번 사이클에 행동을 정할 것');
else console.log('  ✔ 모든 등록 채널에 규칙이 정의돼 있음');
console.log('\n★ 이번 사이클 확장 의무: 신규 표면 1~2개 발굴 → 실행 또는 계정 티켓 → channels.json 에 등록');
const next = CHECKS.find((x) => x.at > now) || CHECKS[0];
console.log(`\n▲ 다음 고정 점검: ${next.at} ${next.what}${next.cmd ? '  →  ' + next.cmd : ''}`);
try { const q = JSON.parse(fs.readFileSync(QUEUE, 'utf8')); const it = q.items || q; const todo = it.filter((x) => x.state === 'todo').sort((a, b) => (a.prio || 9) - (b.prio || 9)).slice(0, 3); console.log('\n▶ 큐 상위 3건'); todo.forEach((x) => console.log(`  ${x.id} p${x.prio} ${x.type}/${x.region} ${String(x.title).slice(0, 70)}`)); } catch {}
