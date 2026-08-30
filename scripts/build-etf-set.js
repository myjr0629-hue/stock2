#!/usr/bin/env node
// ============================================================================
// build-etf-set — 나스닥 공식 심볼 디렉터리에서 ETF 목록을 뽑아 정적 모듈로 굽는다.
//
// 왜 필요한가 (2026-08-31 실측):
//   다크풀 순위표의 「공매도 비중 이탈」 상·하단이 **ETF 로 도배**됐다.
//   VGIT −46.4%p · SCHO +25.1%p · AIA −55.3%p …
//   ETF 는 지정참가회사(AP)가 설정/환매 과정에서 ETF 를 공매도로 팔았다가
//   되사는 구조라, 장외 공매도 비중이 **기계적으로** 크게 흔들린다.
//   이걸 「이상 신호」로 내보내면 독자를 정확히 반대로 오도한다.
//
// 왜 정적 파일인가: 런타임에 외부 도메인에 의존하면 그 도메인이 죽는 날
//   순위표가 조용히 ETF 로 뒤덮인다. ETF 편입/해지는 느리므로 굽는 게 맞다.
//
// 실행: node scripts/build-etf-set.js   (분기에 한 번 정도)
// ============================================================================
const fs = require('fs');
const path = require('path');

const SRC = 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt';
const OUT = path.join(__dirname, '..', 'src', 'lib', 'seo', 'etfSet.ts');
/** 이 아래로 떨어지면 파일이 깨진 것이다 — 덮어쓰지 않는다. */
const MIN_ETFS = 3000;

(async () => {
    const res = await fetch(SRC);
    if (!res.ok) { console.error('디렉터리 내려받기 실패', res.status); process.exit(1); }
    const text = await res.text();
    const lines = text.split('\n');
    const head = lines[0].split('|');
    const iSym = head.indexOf('Symbol');
    const iEtf = head.indexOf('ETF');
    if (iSym < 0 || iEtf < 0) { console.error('열 배치가 바뀌었다:', head.join(',')); process.exit(1); }

    const etfs = [];
    for (const line of lines.slice(1)) {
        const f = line.split('|');
        if (f.length <= Math.max(iSym, iEtf)) continue;          // 꼬리 요약행
        if (f[iEtf] !== 'Y') continue;
        const sym = (f[iSym] || '').trim().toUpperCase();
        if (!/^[A-Z.]{1,8}$/.test(sym)) continue;
        etfs.push(sym);
    }
    etfs.sort();

    if (etfs.length < MIN_ETFS) {
        console.error(`ETF ${etfs.length}개뿐 — 하한 ${MIN_ETFS} 미만이라 저장하지 않는다.`);
        process.exit(2);
    }

    const stamp = text.match(/File Creation Time:\s*([^|\n]+)/)?.[1]?.trim() || 'unknown';
    fs.writeFileSync(OUT, `// 자동 생성 — scripts/build-etf-set.js. 손으로 고치지 말 것.
// 출처: Nasdaq Trader 심볼 디렉터리(무료·일일 갱신) · 파일 생성시각 ${stamp}
// 목적: 다크풀 순위표에서 ETF 를 뺀다. AP 의 설정/환매가 장외 공매도 비중을
//       기계적으로 흔들어서, 넣어 두면 모든 이탈 순위를 ETF 가 차지한다.
const RAW = '${etfs.join(' ')}';
const SET: Set<string> = new Set(RAW.split(' '));
export const ETF_COUNT = ${etfs.length};
export function isEtf(ticker: string): boolean {
    return SET.has((ticker || '').toUpperCase());
}
`);
    console.log(`ETF ${etfs.length}개 → ${OUT} (디렉터리 생성시각 ${stamp})`);
})();
