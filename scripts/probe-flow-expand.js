#!/usr/bin/env node
/**
 * /flow/[ticker] 확장 후보 «실측» 검증 (2026-08-31판)
 *
 * 왜 다시 만드나: 2026-08-22 에 167→595 로 늘릴 때 쓴 판정은 «값 3개 이상».
 *   그 뒤 다크풀(FINRA)이 전 종목에 붙어서 **모든 페이지가 지표 3개를 더 갖게**
 *   됐다. 즉 그때 탈락했던 것도 지금은 통과할 수 있다.
 *
 * ⚠️ 소프트404 금지 원칙은 그대로다. 데이터 없는 페이지를 사이트맵에 넣으면
 *    도메인 전체 평가가 깎인다. 그래서 «전부 실제로 렌더해» 보고 통과만 넣는다.
 *
 * 판정: 렌더된 지표값 ≥ 5 AND 다크풀 표시 AND 맥스페인 표시
 *       (기준을 3 → 5 로 올렸다 — 다크풀이 3개를 더 주므로 옛 기준은 너무 헐겁다)
 *
 * 부수효과: 1,400여 페이지의 ISR 캐시가 데워진다. 구글이 오기 전에 미리.
 *
 * 사용: node scripts/probe-flow-expand.js <후보JSON> [출력JSON]
 */
const fs = require("fs"), https = require("https");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const IN = process.argv[2] || "/tmp/new-cand.json";
const OUT = process.argv[3] || "scripts/_flow-expand-probe.json";
const CONC = 5;

const get = (u) => new Promise((r) => {
    const t = setTimeout(() => r(""), 45000);
    https.get(u, { headers: { "User-Agent": UA } }, (x) => {
        let b = ""; x.on("data", (c) => (b += c));
        x.on("end", () => { clearTimeout(t); r(b); });
    }).on("error", () => { clearTimeout(t); r(""); });
});

function judge(html) {
    const txt = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
    const vals = (txt.match(/\$[\d,]+(\.\d+)?|\d+\.\d%|\d+%/g) || []).length;
    const dark = /Dark pool share/i.test(txt);
    const maxPain = /Max pain/i.test(txt);
    return { vals, dark, maxPain, pass: vals >= 5 && dark && maxPain };
}

(async () => {
    const cands = JSON.parse(fs.readFileSync(IN, "utf8"));
    console.log(`후보 ${cands.length}종 · 동시 ${CONC}`);
    const pass = [], fail = [];
    let done = 0;
    const queue = [...cands];

    async function worker() {
        while (queue.length) {
            const t = queue.shift();
            const html = await get(`https://www.signumhq.com/en/flow/${t}`);
            const j = judge(html);
            (j.pass ? pass : fail).push({ t, ...j });
            done++;
            if (done % 50 === 0) console.log(`  ${done}/${cands.length} · 통과 ${pass.length} · 탈락 ${fail.length}`);
        }
    }
    await Promise.all(Array.from({ length: CONC }, worker));

    pass.sort((a, b) => cands.indexOf(a.t) - cands.indexOf(b.t));
    fs.writeFileSync(OUT, JSON.stringify({ pass: pass.map(x => x.t), fail: fail.map(x => x.t), _ts: Date.now() }, null, 1));
    console.log(`\n통과 ${pass.length} / 탈락 ${fail.length}`);
    console.log(`탈락 예: ${fail.slice(0, 12).map(x => `${x.t}(${x.vals})`).join(" ")}`);
    console.log(`→ ${OUT}`);
})();
