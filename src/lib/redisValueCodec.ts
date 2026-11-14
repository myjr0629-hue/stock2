// ============================================================================
// redisValueCodec — 큰 캐시 값(옵션 체인)의 gzip 저장 (2026-11-14)
//
// 규칙은 scripts/lambda-flow-harvest/redis-codec.js 와 같다(시험이 교차 왕복 확인):
//   형식 "gz1:" + base64(gzip(JSON)) · 대상 키 polygon:snapshot:probe:{T}(meta 제외) · intrinio:chain:{sym}:{YYYY-MM-DD}
//   읽기는 표식 있으면 해제, 없으면 예전 값 그대로(혼재 기간 하위 호환). 손상 → null(캐시 미스), 예외 없음.
// 왜: ElastiCache 사용 68%(11/14 정점 82%)의 84% 가 이 두 접두어의 JSON 원문이었다.
// ============================================================================
import { gzipSync, gunzipSync } from 'zlib';

export const GZ_MARK = 'gz1:';
const COMPRESS_KEYS = [
    /^polygon:snapshot:probe:(?!meta:)[^:]+$/,
    /^intrinio:chain:[^:]+:\d{4}-\d{2}-\d{2}$/,
];
const MAX_DECODED_BYTES = 64 * 1024 * 1024;

export function shouldCompressKey(key: string): boolean {
    return typeof key === 'string' && COMPRESS_KEYS.some((re) => re.test(key));
}

/** 저장 직전: 대상 키의 객체 값이면 "gz1:..." 문자열로, 아니면 그대로. 압축 실패도 그대로. */
export function encodeForKey<T>(key: string, value: T): T | string {
    if (!shouldCompressKey(key) || value === null || typeof value !== 'object') return value;
    try {
        const json = JSON.stringify(value);
        if (typeof json !== 'string') return value;
        return GZ_MARK + gzipSync(Buffer.from(json, 'utf8'), { level: 6 }).toString('base64');
    } catch {
        return value;
    }
}

export function isEncoded(v: unknown): v is string {
    return typeof v === 'string' && v.startsWith(GZ_MARK);
}

/** 읽은 직후: 표식이 있으면 풀어서 객체로, 없으면 그대로. 손상 → null(캐시 미스). */
export function decodeStoredValue<T>(v: unknown): T | null {
    if (!isEncoded(v)) return (v ?? null) as T | null;
    try {
        const buf = gunzipSync(Buffer.from(v.slice(GZ_MARK.length), 'base64'), { maxOutputLength: MAX_DECODED_BYTES });
        return JSON.parse(buf.toString('utf8')) as T;
    } catch {
        return null;
    }
}

export function decodeStoredValues<T>(vs: readonly unknown[]): (T | null)[] {
    return vs.map((v) => decodeStoredValue<T>(v));
}
