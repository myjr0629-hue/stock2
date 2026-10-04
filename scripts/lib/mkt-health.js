'use strict';
// 계정 건강 — «자동 한 단계 하향» (대표 2026-10-04 09시: 플랫폼 상한을 최대치로 올리되, 경고·제한·도달 급감 신호가 보이면 자동으로 내린다)
// 저장: .agent/marketing/channels.json 최상위 health 필드 — { <계정묶음|채널 id>: { since, until, reason, by, history[] } }
// 동작: until 이 미래면 «하향 중». mkt-plan.js 가 그 키의 캡을 절반(내림 — 1편짜리는 0 = 7일 정지)으로 계산한다.
//       신호가 또 오면 until 이 «지금+7일» 로 밀린다. 7일 뒤 코드 손질 없이 자동 복귀한다.
//       마지막 신호 뒤 14일 안에는 2주차 상한(cap2)으로 올리지 않는다(경고가 있었던 곳은 한 주 더 1주차 값).
// 근거·상한 표: ~/Documents/signum-work/growth/FREQUENCY-CAPS-2026-10-04.md
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = process.env.MKT_CHANNELS_PATH || path.join(ROOT, '.agent/marketing/channels.json'); // 시험용 덮어쓰기(MKT_CHANNELS_PATH)
const HALVE_DAYS = 7; const RAMP_BLOCK_DAYS = 14; const DAY = 86400000;
// 부정문(«스팸 없음»·«경고 0»)은 신호가 아니다 — 먼저 지운다
const NEG = /(스팸|경고|제한|한도|정지|차단|삭제|필터)\s*(없음|없다|0건|0회|아님|통과|무관)|no\s+(spam|warning|restriction|limit)/gi;
// 신호어: 정책·한도·제한·정지·경고·도달 급감. 로그인 만료·편집기 실패·타임아웃 같은 «일반 오류»는 걸리지 않는다(캡을 깎을 이유가 아니다).
const SIGNAL = /스팸|spam|한도|rate.?limit|too many|제한됨|제한을|제한 걸|restrict|suspend|정지|shadow|필터 의심|공개 미확인|삭제됨|removed by|blocked|차단|경고|warning|\b429\b|try again later|action blocked|unusual activity|temporarily limited|도달 급감/i;
// pub 노트용 «엄격» 신호어 — «캡 한도 내»·«경고 확인» 같은 흔한 낱말로 오탐하지 않게, 플랫폼이 실제로 막았다는 표현만. fail(사람이 플랫폼 문구를 옮겨 적는 경로)은 넓은 SIGNAL 을 쓴다.
const SIGNAL_STRICT = /스팸필터|스팸 판정|스팸으로|스팸 삭제|공개 미확인|삭제됨|필터 의심|removed by|restricted|suspended|shadow ?ban|제한됨|계정 제한|정지됨|계정 정지|rate.?limit|too many (requests|posts)|try again later|action blocked|\b429\b|unusual activity|temporarily limited|도달 급감/i;
const classify = (text, strict = false) => { const t = String(text || '').replace(NEG, ' '); const m = t.match(strict ? SIGNAL_STRICT : SIGNAL); return { signal: !!m, matched: m ? m[0] : null }; };
function readRaw() { const raw = fs.readFileSync(FILE, 'utf8'); return { raw, j: JSON.parse(raw) }; }
function writeJson(j, raw) { const out = JSON.stringify(j, null, 2) + (raw.endsWith('\n') ? '\n' : ''); const tmp = FILE + '.tmp' + process.pid; fs.writeFileSync(tmp, out); fs.renameSync(tmp, FILE); }
function all() { try { return readRaw().j.health || {}; } catch { return {}; } }
const active = (h, key, now = Date.now()) => { const r = h && h[key]; return !!(r && r.until && Date.parse(r.until) > now); };
function lastIncidentMs(h, key) { const r = h && h[key]; if (!r) return 0; const ts = (r.history || []).map((x) => Date.parse(x.at)).filter(Number.isFinite); if (r.since) ts.push(Date.parse(r.since)); return ts.length ? Math.max(...ts) : 0; }
const halve = (n) => Math.floor(Number(n || 0) / 2);
function mark(key, reason, by = 'manual') {
  const { raw, j } = readRaw(); j.health = j.health || {};
  const now = new Date(); const prev = j.health[key] || {}; const was = prev.until && Date.parse(prev.until) > now.getTime();
  const why = String(reason || '').replace(/\s+/g, ' ');
  j.health[key] = { since: was ? prev.since : now.toISOString(), until: new Date(now.getTime() + HALVE_DAYS * DAY).toISOString(), reason: why.slice(0, 220), by,
    history: [{ at: now.toISOString(), by, reason: why.slice(0, 120) }, ...(prev.history || [])].slice(0, 8) };
  writeJson(j, raw); return j.health[key];
}
// 조기 복구. forget=true 면 기록까지 지워 2주차 상향 잠금도 푼다(오탐일 때).
function clear(key, forget = false) {
  const { raw, j } = readRaw(); if (!j.health || !j.health[key]) return false;
  if (forget) delete j.health[key]; else { j.health[key].until = new Date().toISOString(); j.health[key].clearedAt = new Date().toISOString(); }
  writeJson(j, raw); return true;
}
module.exports = { FILE, HALVE_DAYS, RAMP_BLOCK_DAYS, classify, all, active, lastIncidentMs, halve, mark, clear };
