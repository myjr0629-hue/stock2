#!/usr/bin/env node
/**
 * 광고를 켠 앱의 방침·약관이 실제로 「광고 있음」으로 바뀌는지 검사한다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 필요한가]
 *   AppLegalDocument.applyAdsOn() 은 **완전일치 치환**이다. 문구가 한 글자만
 *   달라지면 아무 일도 안 일어나고, 광고는 나가는데 문서는 「광고 없음」인 채로
 *   남는다. 방침·스토어 선언·실동작이 서로 모순 = 심사 리스크다.
 *
 *   실제로 당했다(2026-08-25): applyAdsOn 이 privacy 에만 걸려 있어서
 *   8/19부터 광고가 나가던 UC 의 **이용약관이 3개 국어 전부**
 *   「광고도 게재하지 않습니다」 였다. 런타임 경고는 dev 에서만 뜬다.
 *
 * [판정]
 *   ADS_ON[locale][app] 의 `noAdsTitle` 과 `freeFrom` 이 그 앱의 섹션 정의
 *   안에 «그대로» 존재해야 한다. 없으면 치환이 조용히 실패한다.
 *
 * 사용:  node scripts/check-legal-ads-switch.js
 */
const fs = require("fs"), path = require("path");
const F = path.join(__dirname, "..", "src", "components", "app", "AppLegalDocument.tsx");
const src = fs.readFileSync(F, "utf8");

// 실유닛이 붙은 앱만 검사 대상이다 (null 이면 「광고 없음」이 사실이므로 정상)
const admob = fs.readFileSync(path.join(__dirname, "..", "src", "config", "admob.ts"), "utf8");
const liveApps = ["uc", "wim"].filter((a) =>
    new RegExp(`^\\s*${a}:\\s*UNITS_`, "m").test(admob));

if (!liveApps.length) {
    console.log("  광고 켜진 앱 없음 — 검사 대상 없음");
    process.exit(0);
}

// ADS_ON 블록에서 locale/app 별 토큰을 뽑는다
const adsOnIdx = src.indexOf("const ADS_ON");
if (adsOnIdx < 0) { console.log("  ADS_ON 을 못 찾음 — 구조가 바뀌었다"); process.exit(1); }
const adsOnBlock = src.slice(adsOnIdx, src.indexOf("\n};", adsOnIdx));
const body = src.slice(0, adsOnIdx);   // 섹션 정의는 ADS_ON «앞»에 있다

const LOCALES = ["ko", "en", "ja"];
let bad = 0, checked = 0;
console.log(`  광고 켜진 앱: ${liveApps.join(", ")} · 로케일 ${LOCALES.join("/")}`);
console.log("=".repeat(72));

for (const app of liveApps) {
    // ADS_ON 안에서 해당 앱 블록을 찾아 토큰 2개를 뽑는다 (로케일마다 한 벌)
    const appBlocks = [...adsOnBlock.matchAll(
        new RegExp(`${app}:\\s*\\{([\\s\\S]*?)\\n    \\},`, "g"))].map((m) => m[1]);
    if (appBlocks.length !== LOCALES.length) {
        console.log(`  \x1b[31m${app}: ADS_ON 블록이 ${appBlocks.length}개 — 로케일 ${LOCALES.length}개와 안 맞는다\x1b[0m`);
        bad++; continue;
    }
    appBlocks.forEach((blk, i) => {
        const loc = LOCALES[i];
        for (const key of ["noAdsTitle", "freeFrom"]) {
            const m = new RegExp(`${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(blk);
            if (!m) { console.log(`  \x1b[31m${app}/${loc}: ${key} 없음\x1b[0m`); bad++; continue; }
            const token = m[1];
            checked++;
            if (!body.includes(token)) {
                console.log(`  \x1b[31m✗ ${app}/${loc} ${key}\x1b[0m 가 섹션 정의에 없다 — 치환이 조용히 실패한다`);
                console.log(`      "${token.slice(0, 70)}…"`);
                bad++;
            }
        }
    });
}

console.log();
if (bad) { console.log(`  \x1b[31m${bad}건 어긋남 — 광고를 켜면 문서가 「광고 없음」으로 남는다\x1b[0m\n`); process.exit(1); }
console.log(`  \x1b[32m토큰 ${checked}개 전부 일치 — 방침·약관이 「광고 있음」으로 전환된다\x1b[0m\n`);
