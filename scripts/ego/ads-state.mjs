// ads-state — 애플 광고 콘솔 «판독 연속 실패» 상태 (2026-10-05 18시 회차 신설)
// 왜: 10/5 16:04 부터 app-ads.apple.com 이 Apple 로그인 화면으로 넘어가(세션 만료 — 비밀번호는 홍보 사이클이 못 넣는다 = 대표 몫) 두 회차에 걸쳐 4번 같은 이유로 실패했다.
//   slot ⏱ 줄은 «광고 마지막 21:22(10/4) → 지금 가능»만 보여 매 회차가 같은 로그인 화면을 보러 ego 를 한 번씩 더 돌렸다(회당 약 1.5분·호출 1·결과는 늘 같음).
//   상태를 저장소 밖(~/signum-ego-io/ads-session-state.json)에 남겨 slot 이 «N회 연속 실패 · 대표 재로그인 필요 · 다음 시도 HH:MM» 을 맨 위에 보여 준다(MISTAKES #100).
// 쓰는 곳: scripts/ego/ads-periods.mjs 끝에서 recordAdsRead(성공 여부, 실패 종류) · 읽는 곳: scripts/mkt-plan.js adsSessionState()
//   (mkt-plan 은 CommonJS 라 이 모듈을 못 불러 JSON 을 직접 읽는다 — 형식을 바꾸면 둘 다 고친다)
// 파일 형식: {streak, kind, firstFailAt, lastFailAt, lastOkAt}(ms). streak 0 = 정상. 시험은 ADS_STATE_FILE 로 다른 경로를 쓴다(진짜 상태를 건드리지 않게).
// 대표가 재로그인한 뒤 곧바로 다시 읽고 싶으면: 이 파일을 지우거나(rm ~/signum-ego-io/ads-session-state.json) ads-periods.mjs 를 직접 한 번 돌린다(성공하면 streak 0).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FILE = process.env.ADS_STATE_FILE || path.join(os.homedir(), 'signum-ego-io', 'ads-session-state.json');

export function readAdsState() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}

export function recordAdsRead(ok, kind = '', now = Date.now()) {
  const prev = readAdsState() || {};
  const wasFailing = (prev.streak || 0) > 0;
  const st = ok
    ? { streak: 0, kind: '', firstFailAt: 0, lastFailAt: prev.lastFailAt || 0, lastOkAt: now }
    : { streak: (prev.streak || 0) + 1, kind: kind || 'unknown', firstFailAt: wasFailing ? (prev.firstFailAt || now) : now, lastFailAt: now, lastOkAt: prev.lastOkAt || 0 };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(st, null, 1));
  return st;
}
