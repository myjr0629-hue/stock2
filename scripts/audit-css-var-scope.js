#!/usr/bin/env node
/**
 * CSS 커스텀 프로퍼티 «스코프» 검사기.
 *
 * 왜 만드는가 (2026-09-14 실사고):
 *   --app-lbl-signal 이 `.app-main { }` 안에만 정의돼 있었다.
 *   섹터 장마감 리포트 시트는 createPortal(document.body) 로 뜨기 때문에
 *   .app-main «밖»에 렌더된다 → 변수가 해석되지 않는다 →
 *   `color: var(--app-lbl-signal)` 이 computed-value time 에 무효가 되어
 *   color 가 body 상속색으로 떨어진다. body 는 globals.css 의
 *   `@apply text-foreground` 이고 .dark 클래스를 다는 코드가 없어서
 *   --foreground = hsl(222 47% 11%) ≈ #0f172a, 거의 검정이다.
 *   → 어두운 시트 위 검은 글씨 = 본문이 통째로 안 보였다. 티커 칩도 같은 이유로 흐렸다.
 *
 * 불변식: 앱뷰 TSX 가 var(--X) 로 쓰는 커스텀 프로퍼티는
 *         (a) :root 에 정의돼 있거나  (b) var(--X, 폴백) 으로 폴백을 달아야 한다.
 *   그래야 포털이든 아니든 «어디에 렌더되어도» 색이 살아 있다.
 *
 * 이 검사는 에러가 아니라 «침묵»을 잡는다 — 화면은 200 OK 로 멀쩡히 뜨고 글씨만 사라진다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS_DIRS = ['src/styles', 'src/app'];
const TSX_DIRS = ['src/app/[locale]/app-view', 'src/components/app', 'src/components/guardian'];

function walk(dir, exts, out = []) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return out;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(rel, exts, out); }
        else if (exts.some((x) => e.name.endsWith(x))) out.push(rel);
    }
    return out;
}

// ── 1) :root 에 정의된 커스텀 프로퍼티를 모은다 ──────────────────────────────
const rootVars = new Set();
const scopedVars = new Map(); // name -> Set(selector)

for (const file of walk('src', ['.css'])) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    // 아주 단순한 블록 스캐너: `선택자 { ... }` 를 순서대로 읽는다(중첩 CSS 는 쓰지 않는다)
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
        // ★ 앞 블록의 꼬리(@import …; 등)가 셀렉터에 딸려 온다 → 마지막 ; 뒤만 셀렉터다.
        //   이걸 안 걷어내면 app-tokens.css 의 :root 를 «:root 가 아니다»로 오판한다.
        const raw = m[1];
        const selector = raw.slice(raw.lastIndexOf(';') + 1).trim().replace(/\s+/g, ' ');
        const body = m[2];
        const dre = /(--[A-Za-z0-9_-]+)\s*:/g;
        let d;
        while ((d = dre.exec(body))) {
            const name = d[1];
            const parts = selector.split(',').map((x) => x.trim());
            const isRoot = parts.some((x) => x === ':root' || x === 'html' || x === ':root,html');
            if (isRoot) rootVars.add(name);
            else {
                if (!scopedVars.has(name)) scopedVars.set(name, new Set());
                scopedVars.get(name).add(`${selector}  (${file})`);
            }
        }
    }
}

// ── 2) 앱뷰 TSX 의 var() 사용을 검사한다 ────────────────────────────────────
const violations = [];
for (const file of TSX_DIRS.flatMap((d) => walk(d, ['.tsx', '.ts']))) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const usesPortal = src.includes('createPortal');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
        // var(--name)  — 폴백이 있으면 통과
        const re = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,)?/g;
        let m;
        while ((m = re.exec(line))) {
            const name = m[1];
            const hasFallback = Boolean(m[2]);
            if (hasFallback) continue;
            if (rootVars.has(name)) continue;
            // ★ 정의가 «아예 없는» 경우를 건너뛰면 안 된다 — 그게 가장 위험한 경우다.
            //   (검사기 1차본이 여기서 continue 해서 원래 사고를 못 잡았다.)
            violations.push({
                file, line: i + 1, name,
                scopes: scopedVars.has(name) ? [...scopedVars.get(name)] : [],
                portal: usesPortal,
            });
        }
    });
}

if (violations.length === 0) {
    console.log(`✅ 앱뷰 var(--*) 스코프 정상 — :root 정의 ${rootVars.size}종 확인.`);
    process.exit(0);
}

console.log(`\n✗ 스코프를 벗어나면 «조용히» 사라지는 변수 사용 ${violations.length}건\n`);
for (const v of violations) {
    console.log(`  ${v.file}:${v.line}`);
    if (v.scopes.length === 0) {
        console.log(`    ${v.name} 은(는) 어디에도 정의돼 있지 않다 — color 가 상속색으로 떨어진다.`);
    } else {
        console.log(`    ${v.name} 은(는) :root 가 아니라 다음 스코프에만 정의돼 있다:`);
        v.scopes.forEach((s) => console.log(`      · ${s}`));
    }
    if (v.portal) console.log(`    ⚠︎ 이 파일은 createPortal 을 쓴다 — 포털로 나가면 이 색은 죽는다.`);
    console.log('');
}
console.log('  해결: 해당 변수를 app-tokens.css 의 :root 로 올리거나, var(--X, 폴백) 으로 폴백을 달 것.\n');
process.exit(1);
