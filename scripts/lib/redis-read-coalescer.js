// ============================================================================
// Read coalescer for the EC2 Redis HTTP proxy (scripts/ec2-redis-proxy.js).
// Deployed next to the proxy as /opt/signum-ws/redis-read-coalescer.js (Node 16, no deps).
//
// ★ 2026-11-06 (T56c) — 왜 있나:
//   11/3·11/4·11/5 05:2x~05:4xZ 에 ElastiCache(signum-redis, maxmemory 1.03GB, volatile-lru)가
//   1분 안에 TTL 키 2~4만 개를 축출했다. 같은 분 Vercel 로그(11/5 05:47:08~11Z): 분산 스크레이퍼가
//   /en/flow/{티커} 2,143종을 4초에 긁었고, 페이지마다 /api/undercurrent/ticker·/api/live/ticker 를
//   부르며 콜드 인스턴스 수백 개가 같은 큰 키(intrinio:eod:snapshot 654KB·intrinio:eod:history 1.68MB·
//   finra:offexchange 1.03MB …)를 «같은 초에» 수백 번 GET 했다. 프록시는 ElastiCache 연결 1개라
//   응답이 다 읽히기 전까지 Redis 쪽 클라이언트 출력 버퍼에 쌓이고(used_memory_peak 1.10G > maxmemory)
//   → volatile-lru 가 TTL 키를 통째로 지웠다.
//
//   그래서 프록시가 «같은 키를 동시에 읽는 요청»을 Redis 명령 1개로 합치고(single-flight),
//   큰 값(기본 256KB 이상)은 2초 동안 만든 응답 본문을 재사용한다. 값의 의미는 바뀌지 않는다:
//     · 프록시를 거친 쓰기(/set·/mset·/del·CAS)는 쓰기 전·후로 그 키의 진행 중 읽기와 메모를 무효화한다
//       → 쓰기가 끝난 뒤 시작한 읽기는 반드시 새 값을 본다.
//     · EC2 워커가 ElastiCache 에 직접 쓴 큰 키는 최대 memoMs(2초) 늦게 보일 수 있다 — 큰 키는 전부
//       분~시간 단위 일괄 스냅샷이라 의미 없는 차이다. 작은 키(실시간 가격 등)는 메모하지 않는다.
// ============================================================================
"use strict";

function createReadCoalescer(opts) {
    const o = opts || {};
    const memoMinBytes = o.memoMinBytes != null ? o.memoMinBytes : 256 * 1024;
    const memoMs = o.memoMs != null ? o.memoMs : 2000;
    const memoMaxBytes = o.memoMaxBytes != null ? o.memoMaxBytes : 64 * 1024 * 1024;
    const now = o.now || Date.now;

    /** id ('g:'+key | 'm:'+keys) → { promise, stale, keys } */
    const inflight = new Map();
    /** key → { body, at, bytes } (insertion order = age) */
    const memo = new Map();
    let memoBytes = 0;
    const stats = { reads: 0, joined: 0, memoHits: 0, memoStored: 0, invalidations: 0 };

    function dropMemo(key) {
        const m = memo.get(key);
        if (!m) return;
        memo.delete(key);
        memoBytes -= m.bytes;
    }
    function sweep() {
        const t = now();
        for (const [k, m] of memo) {
            if (t - m.at >= memoMs) dropMemo(k);
        }
    }
    function store(key, body) {
        const bytes = body.length;
        if (bytes > memoMaxBytes) return;
        sweep();
        dropMemo(key);
        for (const k of memo.keys()) {
            if (memoBytes + bytes <= memoMaxBytes) break;
            dropMemo(k);
        }
        memo.set(key, { body, at: now(), bytes });
        memoBytes += bytes;
        stats.memoStored++;
    }

    function run(id, keys, fetchBody, memoKey) {
        const f = inflight.get(id);
        if (f) { stats.joined++; return f.promise; }
        stats.reads++;
        const entry = { stale: false, keys, promise: null };
        entry.promise = Promise.resolve()
            .then(fetchBody)
            .then((body) => {
                if (memoKey != null && !entry.stale && typeof body === "string" && body.length >= memoMinBytes && memoMs > 0) {
                    store(memoKey, body);
                }
                return body;
            })
            .finally(() => { if (inflight.get(id) === entry) inflight.delete(id); });
        inflight.set(id, entry);
        return entry.promise;
    }

    /** GET 한 키 — fetchBody() 는 HTTP 응답 본문 문자열을 돌려준다. */
    function get(key, fetchBody) {
        const m = memo.get(key);
        if (m) {
            if (now() - m.at < memoMs) { stats.memoHits++; return Promise.resolve(m.body); }
            dropMemo(key);
        }
        return run("g:" + key, [key], fetchBody, key);
    }

    /** MGET — 같은 키 목록의 동시 요청만 합친다(메모 없음). */
    function mget(keys, fetchBody) {
        return run("m:" + keys.join("\u0000"), keys.slice(), fetchBody, null);
    }

    /** 쓰기 전·후에 부른다 — 그 키의 진행 중 읽기는 더 이상 새 요청과 합치지 않고, 메모도 버린다. */
    function invalidate(keys) {
        const list = (Array.isArray(keys) ? keys : [keys]).filter((k) => typeof k === "string" && k);
        if (!list.length) return;
        stats.invalidations++;
        const set = new Set(list);
        for (const k of list) dropMemo(k);
        for (const [id, f] of inflight) {
            if (f.keys.some((k) => set.has(k))) { f.stale = true; inflight.delete(id); }
        }
    }

    function snapshot() {
        return Object.assign({}, stats, { inflight: inflight.size, memoKeys: memo.size, memoBytes });
    }

    return { get, mget, invalidate, sweep, snapshot };
}

module.exports = { createReadCoalescer };
