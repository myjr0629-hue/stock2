/**
 * T56b (2026-11-05) — 실적 채점 기록을 Upstash 사본에서 EC2 로 되살린다(사고 대응 전용).
 *   EC2 에 «값이 없는» 키만 쓴다 · EC2 에 값이 있으면 건드리지 않는다 · 기본은 미리보기(쓰기 0), --write 로 실제 쓰기.
 *   크론이 나중에 지울 수 있는 actual(Intrinio 단독·정착 전)은 비우고 되살린다(restorableValue) · 크론 쓰기 잠금 안에서만 쓴다.
 * 실행(운영 환경 변수: EC2_REDIS_PROXY_KEY 또는 REDIS_PROXY_KEY, UPSTASH_REDIS_REST_URL/TOKEN):
 *   node -r dotenv/config -r ./scripts/offline-test-typescript.cjs scripts/restore-actuals-from-mirror.ts [--write]
 * 언제: ElastiCache 축출·노드 교체로 /api/earnings/scorecard 주간 행이 줄었을 때(점검: 주별 n 이 전날 기록보다 작다).
 */
import { restoreActualsFromMirror } from '../src/services/earningsActualsService';

(async () => {
  const write = process.argv.includes('--write');
  const r = await restoreActualsFromMirror({ dryRun: !write });
  if (r.locked) { console.log("LOCKED — 크론이 쓰는 중(쓰기 잠금 90초). 잠시 뒤 다시 실행"); process.exit(2); }
  console.log(`${write ? "WRITE" : "DRY"} mirror=${r.mirror} present=${r.present} restored=${r.restored.length} skipped=${r.skipped.length} readFailed=${r.readFailed.length} writeFailed=${r.writeFailed.length}`);
  for (const k of r.restored) console.log(`  ${write ? 'restored' : 'would restore'} ${k}`);
  for (const k of r.skipped) console.log(`  skipped(모양 오류) ${k}`);
  for (const k of r.readFailed) console.log(`  read_failed ${k}`);
  for (const k of r.writeFailed) console.log(`  write_failed ${k}`);
  process.exit(r.readFailed.length || r.writeFailed.length ? 1 : 0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
