// ============================================================================
// redis-codec — 큰 캐시 값(옵션 체인)의 gzip 저장 (2026-11-14)
//
// 왜: ElastiCache signum-redis(t3.small, maxmemory ~1.03GB)의 53%·31% 를
//   intrinio:chain:{sym}:{exp}(6,337키 376MB, 평균 61KB) 과
//   polygon:snapshot:probe:{T}(4,050키 221MB) 의 JSON 원문이 차지했다(11/14 82% 경보).
//   JSON 옵션 체인은 gzip 으로 수 배 줄어든다 → 같은 키·같은 TTL·같은 내용을 작게 저장한다.
//
// 형식: "gz1:" + base64(gzip(JSON.stringify(value))) — 문자열 하나.
//   EC2 프록시·Upstash 가 값을 JSON 문자열로만 다루므로 바이너리 대신 base64.
//   JSON 원문은 «gz1:» 로 시작할 수 없다(문자열 값이면 따옴표로 시작) → 표식으로 판별.
//
// 하위 호환: 읽기는 표식이 있으면 풀고, 없으면 예전 값 그대로 돌려준다(혼재 기간).
//   손상된 압축 값은 null(=캐시 미스) — 예외를 던지지 않는다.
//
// ⚠️ 같은 파일이 세 곳에 있다 — 내용을 바꾸면 셋 다 같이:
//   scripts/lambda-flow-harvest/redis-codec.js · scripts/lambda-xs/redis-codec.js (바이트 동일, 시험이 확인)
//   src/services/redisClient.ts 의 «값 압축(gz1)» 절 (같은 규칙의 TS 판, 시험이 교차 왕복 확인)
// ============================================================================
'use strict';
const zlib = require('zlib');

const GZ_MARK = 'gz1:';
// 압축 대상 키 — 이름은 바꾸지 않는다. 판본표(probe:meta)·최신 EOD 표식(chain:latest-eod)은 작아서 그대로.
const COMPRESS_KEYS = [
  /^polygon:snapshot:probe:(?!meta:)[^:]+$/,
  /^intrinio:chain:[^:]+:\d{4}-\d{2}-\d{2}$/,
];
// 압축 해제 상한 — 정상 최대 값(약 1.5MB)의 수십 배. 망가진 값이 메모리를 태우지 않게.
const MAX_DECODED_BYTES = 64 * 1024 * 1024;

function shouldCompressKey(key) {
  return typeof key === 'string' && COMPRESS_KEYS.some((re) => re.test(key));
}

/** 저장 직전: 대상 키의 객체 값이면 "gz1:..." 문자열로, 아니면 그대로. 압축 실패도 그대로(예전처럼 원문 저장). */
function encodeForKey(key, value) {
  if (!shouldCompressKey(key) || value === null || typeof value !== 'object') return value;
  try {
    const json = JSON.stringify(value);
    if (typeof json !== 'string') return value;
    return GZ_MARK + zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 6 }).toString('base64');
  } catch {
    return value;
  }
}

function isEncoded(v) {
  return typeof v === 'string' && v.startsWith(GZ_MARK);
}

/** 읽은 직후: 표식이 있으면 풀어서 객체로, 없으면 그대로. 손상 → null(캐시 미스). */
function decodeStoredValue(v) {
  if (!isEncoded(v)) return v;
  try {
    const buf = zlib.gunzipSync(Buffer.from(v.slice(GZ_MARK.length), 'base64'), { maxOutputLength: MAX_DECODED_BYTES });
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = { GZ_MARK, shouldCompressKey, encodeForKey, decodeStoredValue, isEncoded };
