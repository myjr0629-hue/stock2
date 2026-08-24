#!/usr/bin/env node
// ============================================================================
// pending-watch — 예약분이 «게시되는 시각에 맞춰» 댓글을 단다
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-24 대표 지시) — 「댓글도 시간에 맞게 달도록하고」
//   예약(비공개) 영상에는 댓글 API 가 403 을 낸다. 그래서 대기열에 넣어뒀는데,
//   그 대기열을 «사람이 기억해서» 돌려야 했다. 실제로 공개된 지 두 시간 지나서야
//   달린 적이 있다. 고정 댓글은 초반 노출이 값인데 그때는 이미 늦다.
//
// 하는 일
//   대기열(.agent/PENDING_COMMENTS.jsonl)에서 «게시 시각이 지난» 건을 골라
//   두 채널 다 훑어 공개된 것에 댓글을 단다. 아직 비공개면 그대로 둔다.
//   ⛔ 이미 우리 댓글이 있으면 두 번 달지 않는다 (yt-admin 이 확인한다).
//
// 사용:
//   node scripts/pending-watch.mjs            한 번 훑는다
//   node scripts/pending-watch.mjs --loop=20  20분 간격으로 계속 (게시 직후를 잡는다)
// ============================================================================
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const LOOP = +((process.argv.find((a) => a.startsWith('--loop=')) || '').split('=')[1] || 0);
const F = '.agent/PENDING_COMMENTS.jsonl';

function once() {
  if (!existsSync(F)) { console.log('  대기열 없음'); return 0; }
  const rows = readFileSync(F, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (!rows.length) { console.log('  대기열 비었다'); return 0; }

  // 게시 시각이 지난 건만 — 아직 안 된 건 API 를 부르지도 않는다
  const now = Date.now();
  const due = rows.filter((r) => {
    if (!r.publishAtKST) return true;
    const m = String(r.publishAtKST).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return true;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5]) <= now;
  });
  const chans = [...new Set(due.map((r) => r.ch))];
  console.log(`  대기 ${rows.length}건 · 게시시각 지난 것 ${due.length}건 · 채널 ${chans.join(',') || '-'}`);
  if (!due.length) {
    const next = rows.map((r) => r.publishAtKST).filter(Boolean).sort()[0];
    if (next) console.log(`  다음 게시 예정 ${next} KST`);
    return rows.length;
  }
  for (const ch of chans) {
    console.log(`  ── ${ch}`);
    spawnSync(process.execPath, ['scripts/yt-admin.mjs', 'pending'],
      { stdio: 'inherit', env: { ...process.env, SIGNUM_YT: ch } });
  }
  return existsSync(F) ? readFileSync(F, 'utf8').split('\n').filter((l) => l.trim()).length : 0;
}

if (!LOOP) { once(); process.exit(0); }
console.log(`  ${LOOP}분 간격으로 감시한다. 대기열이 비면 멈춘다.`);
const tick = () => {
  console.log(`\n  [${new Date().toISOString().slice(11, 16)} UTC]`);
  if (once() === 0) { console.log('  대기열이 비었다 — 종료'); process.exit(0); }
};
tick();
setInterval(tick, LOOP * 60000);
