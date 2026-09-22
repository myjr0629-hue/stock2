#!/usr/bin/env node
/* ============================================================================
 * gh-dataset-index — 데이터셋 랜딩 `index.html` 의 JSON-LD 를 «저장소 실제 파일»로 다시 쓴다.
 *
 * ★2026-09-22 만든 이유:
 *   `options-market-structure-daily` 는 구글 «데이터셋 검색»에 잡히는 문이다
 *   (schema.org Dataset JSON-LD + canonical). 계정도 승인도 필요 없는 몇 안 되는 문이다.
 *   그런데 실측해 보니 **9/19 이후 새 파일이 안 올라갔고, index.html 은 9/18 을 가리키고 있었다.**
 *   「Daily」라고 이름 붙인 데이터셋이 며칠 비면 색인에서 가치를 잃는다.
 *
 *   원인은 단순하다 — 스냅샷 «생성»은 스크립트인데 «게시»가 손이었다(웹 업로드).
 *   그래서 사람이 한 번 건너뛰면 그대로 멈춘다. 게시 뒤 index 갱신도 손이라 또 밀린다.
 *   이 스크립트가 그 두 번째 손을 없앤다: 저장소에 실제로 있는 파일을 읽어 JSON-LD 를 다시 만든다.
 *
 * 사용: node scripts/marketing/gh-dataset-index.js [outDir=/tmp/ego/gh]
 *       → <outDir>/index.html 을 만든다. 그 파일을 저장소에 업로드(덮어쓰기)하면 끝.
 *
 * 주의: 저장소 파일 목록은 «공개 API» 로 읽는다(토큰 불필요). 실패하면 아무것도 쓰지 않는다 —
 *       빈 목록으로 index 를 덮어쓰면 데이터셋이 «비어 있는 것»이 되기 때문이다.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const OWNER = 'myjr0629-hue';
const REPO = 'options-market-structure-daily';
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main`;
const PAGE = `https://${OWNER}.github.io/${REPO}/`;
const outDir = process.argv[2] || '/tmp/ego/gh';

(async () => {
    // ① 저장소에 «실제로» 있는 날짜 파일을 읽는다
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/`, {
        headers: { 'user-agent': 'signum-dataset-index' }, signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`저장소 목록 실패 HTTP ${r.status} — index 를 건드리지 않는다`);
    const files = await r.json();
    const days = files.map((f) => f.name).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
        .map((n) => n.slice(0, 10)).sort();
    if (!days.length) throw new Error('날짜 파일이 0개 — index 를 건드리지 않는다');

    // ② 현재 index.html 을 받아 JSON-LD 블록만 갈아 끼운다(디자인·본문은 손대지 않는다)
    const cur = await fetch(`${RAW}/index.html`, { signal: AbortSignal.timeout(30000) }).then((x) => x.text());
    const m = cur.match(/(<script[^>]*application\/ld\+json[^>]*>)([\s\S]*?)(<\/script>)/);
    if (!m) throw new Error('index.html 에서 JSON-LD 블록을 못 찾았다');
    const ld = JSON.parse(m[2]);

    const newest = days[days.length - 1];
    ld.distribution = days.slice().reverse().map((d) => ({
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        name: `${d} snapshot`,
        contentUrl: `${RAW}/${d}.json`,
    }));
    ld.temporalCoverage = `${days[0]}/${newest}`;
    ld.dateModified = newest;
    ld.url = PAGE;

    const out = cur.slice(0, m.index) + m[1] + '\n' + JSON.stringify(ld, null, 2) + '\n' + m[3]
        + cur.slice(m.index + m[0].length);

    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, 'index.html');
    fs.writeFileSync(file, out);
    console.log(`index.html 갱신 → ${file}`);
    console.log(`  날짜 파일 ${days.length}개 · 범위 ${ld.temporalCoverage} · 최신 ${newest}`);
    const gaps = [];
    for (let i = 1; i < days.length; i++) {
        const a = new Date(days[i - 1] + 'T00:00:00Z'), b = new Date(days[i] + 'T00:00:00Z');
        const dd = (b - a) / 864e5;
        if (dd > 3) gaps.push(`${days[i - 1]}→${days[i]} (${dd}일)`);  // 주말 2일은 정상
    }
    if (gaps.length) console.log('  ⚠ 빈 구간(주말 제외):', gaps.join(' , '));
    console.log('  다음: 이 파일을 저장소에 업로드해 덮어쓴다(GitHub → Add file → Upload files).');
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
