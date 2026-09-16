#!/usr/bin/env node
/**
 * 공급원 «신선도» 검사기.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 만드는가]  2026-09-14 실사고.
 *   EC2 의 벌크 EOD 적재기가 3시간마다 OOM 으로 죽고 있었다.
 *   Redis `intrinio:eod:snapshot` 이 비었고, 그 하나가 다음을 전부 죽였다:
 *     · 가디언 Market Breadth → 50% / A/D 1.00 / 거래량 50.0% 고정
 *     · RLSI 코어의 breadth 성분 → 플레이스홀더 50
 *     · movers · grouped daily · 다중 스냅샷
 *
 *   이 실패는 **에러가 아니라 중립값으로 나타난다.** 200 OK 로 응답하고
 *   화면도 «그럴듯한 숫자»를 보여주므로 헬스체크·try/catch·타입체크를 전부 통과한다.
 *   대표가 화면을 보고 말해 주기 전까지 아무도 모른다. 그래서 기계가 봐야 한다.
 *
 * [무엇을 보는가]  「값이 있는가」가 아니라 「말이 되는가 · 최신인가」.
 *   존재 여부만 보면 3일 전 데이터도 통과한다.
 *
 * 사용:  node scripts/audit-data-freshness.js
 *        REDIS_PROXY_URL / REDIS_PROXY_KEY 로 프록시 지정 가능
 */
const PROXY = process.env.REDIS_PROXY_URL || "http://52.23.98.13:8081";
const PROXY_KEY = process.env.REDIS_PROXY_KEY || "";

/** 미국 동부 기준 «마지막으로 완료된 거래일»(주말만 처리 — 휴장은 여유일수로 흡수) */
function lastTradingDate(now = new Date()) {
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const d = new Date(et);
    // 장 마감(16:00 ET) 전이면 오늘은 아직 «완료»가 아니다
    if (et.getHours() < 16) d.setDate(d.getDate() - 1);
    for (let i = 0; i < 7; i++) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) break;
        d.setDate(d.getDate() - 1);
    }
    return d.toISOString().slice(0, 10);
}

/** 두 ISO 날짜 사이의 «달력일» 차 */
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const CHECKS = [
    {
        key: "intrinio:eod:snapshot",
        what: "벌크 EOD 전종목 스냅샷",
        kills: "Market Breadth · RLSI breadth 성분 · movers · grouped daily",
        maxLagDays: 4,          // 금요일 마감 → 월요일 장중까지는 금요일 자료가 정상
        minRows: 3000,
        dateOf: (v) => v.date,
        rowsOf: (v) => (Array.isArray(v.rows) ? v.rows.length : 0),
    },
    {
        key: "intrinio:eod:history",
        what: "EOD 20일 이력",
        kills: "20일 이동평균 · 자기이력 백분위",
        maxLagDays: 4,
        minRows: 3000,
        // ★ 검사기 1차본이 여기서 틀렸다. 이력 페이로드는 {dates:[...오름차순], closes:{ticker:[...]}} 이다.
        //   dates[0] 은 «가장 오래된» 날이라 28일 뒤처진 것처럼 보였다.
        //   실제 장애가 아니라 내가 구조를 안 보고 짐작한 것이다 — 위반이 뜨면 검사기부터 의심한다.
        dateOf: (v) => (Array.isArray(v.dates) && v.dates.length ? v.dates[v.dates.length - 1] : (v.date || "")),
        rowsOf: (v) => (v.closes ? Object.keys(v.closes).length : (v.rows ? Object.keys(v.rows).length : 0)),
    },
    {
        key: "intrinio:eod:sessionclose",
        what: "정규장 종가",
        kills: "시간외 등락률 기준선",
        maxLagDays: 4,
        minRows: 3000,
        dateOf: (v) => v.date,
        rowsOf: (v) => (v.rows ? Object.keys(v.rows).length : 0),
    },
    {
        key: "finra:offexchange",
        what: "FINRA 장외 거래량",
        kills: "다크풀 비중 · 파생지표(volRatio·stealth·regime)",
        maxLagDays: 5,          // T+1 게시 + 주말
        minRows: 1000,
        dateOf: (v) => v.date,
        rowsOf: (v) => (v.tickers ? Object.keys(v.tickers).length : 0),
    },
];

async function readKey(key) {
    const res = await fetch(`${PROXY}/get?key=${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${PROXY_KEY}` },
        signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`프록시 HTTP ${res.status}`);
    const j = await res.json();
    if (j.result == null) return null;
    return typeof j.result === "string" ? JSON.parse(j.result) : j.result;
}

(async () => {
    const want = lastTradingDate();
    console.log(`\n공급원 신선도 검사 — 마지막 완료 거래일 기준 ${want}\n`);
    let bad = 0;

    for (const c of CHECKS) {
        let line = `  ${c.key.padEnd(30)} `;
        try {
            const v = await readKey(c.key);
            if (!v) {
                console.log(`${line}⛔ 비어 있다 (null)`);
                console.log(`      → ${c.what} 없음. 이게 죽이는 것: ${c.kills}`);
                bad++;
                continue;
            }
            const date = String(c.dateOf(v) || "");
            const rows = c.rowsOf(v);
            const lag = date ? daysBetween(date, want) : 999;

            const stale = lag > c.maxLagDays;
            const thin = rows < c.minRows;
            if (stale || thin) {
                console.log(`${line}⛔ ${date || "날짜없음"} · ${rows.toLocaleString()}행`);
                if (stale) console.log(`      → ${lag}일 뒤처짐 (허용 ${c.maxLagDays}일). 적재기가 멈췄을 수 있다.`);
                if (thin) console.log(`      → 행이 너무 적다 (${rows} < ${c.minRows}). 부분 적재 의심.`);
                console.log(`      → 이게 죽이는 것: ${c.kills}`);
                bad++;
            } else {
                console.log(`${line}✅ ${date} · ${rows.toLocaleString()}행 (${lag}일 전)`);
            }
        } catch (e) {
            console.log(`${line}⛔ 읽기 실패: ${e.message}`);
            bad++;
        }
    }

    if (bad) {
        console.log(`\n✗ ${bad}건 이상 — 화면은 «에러 없이» 중립값을 보여준다. 그게 이 실패의 전부다.`);
        console.log(`  적재기가 죽었는지 먼저 볼 것:`);
        console.log(`    node scripts/ec2-ssm.js "tail -20 /var/log/intrinio-eod.log"`);
        console.log(`    node scripts/ec2-ssm.js "journalctl -k --since '1 day ago' | grep -i 'out of memory'"`);
        console.log(`  ※ 로그가 «조용히 끊기고 에러가 없다» 면 OOM 을 먼저 의심한다(EC2 는 1.9GB 다).\n`);
        process.exit(1);
    }
    console.log(`\n✅ 공급원 ${CHECKS.length}종 전부 신선하다.\n`);
})();
