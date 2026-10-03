/**
 * 종목 딥 분석(/api/command/deep-analysis) — «글 속 가격 = 그 종목 재료의 가격». 순수 함수만.
 *
 * ★2026-10-04 예방 수리: 운영 실측은 불일치 0/33 이었지만 구조가 표면 1(종목별 AI 분석, 15/24 오염)과 같다 —
 *   «티커 하나» 키(최대 12시간) · 재료(snapshot)는 화면이 계산해 보냄 · 서버는 그 재료가 그 티커 것인지 보지 않음 · 출구 숫자 대조 없음.
 *   그래서 표면 1 의 검사(lib/ai/flowNumbers — 가격 수준 ±1.5%·«$수준, X% 거리» 짝)를 그대로 이식한다:
 *   ① 입구 — 재료 가격이 서버가 아는 그 종목 가격(정규장·시간외·전일 종가)과 3% 넘게 다르면 생성하지 않는다(라우트)
 *   ② 출구 — 3개 국어 글 속 «가격 수준» $숫자는 재료의 수준 중 하나와 맞아야 한다. 하나라도 틀리면 저장·제공하지 않는다
 *   ③ 기준 — 저장값에 basis 를 같이 둬 캐시에서 나갈 때도 같은 검사(옛 저장본은 지금 요청 재료로 대조)
 */
import { checkFlowText, FLOW_LOCALES, type FlowBasis, type FlowCheck, type FlowLocale } from '@/lib/ai/flowNumbers';

const pos = (v: unknown): number | null => {
    const n = typeof v === 'string' ? Number(v.replace(/[$,%\s]/g, '')) : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * 화면이 보낸 snapshot → 기준. 핵심 수준(현재가·콜월·풋플로어·맥스페인·감마플립) + 재료 속 «현재가의 0.3~3배» 숫자 전부
 * (SMA·볼린저·애널리스트 목표가·52주 고저 등 — 프롬프트에 들어가 글에 나올 수 있는 $수준). 다른 종목 값은 대개 이 범위에서도 어긋난다.
 */
export function basisFromDeepSnapshot(ticker: string, s: any): FlowBasis {
    const price = pos(s?.price) ?? 0;
    const st = s?.structure || {};
    const extras = new Set<number>();
    const walk = (o: any, depth: number) => {
        if (!o || typeof o !== 'object' || depth > 4) return;
        for (const v of Array.isArray(o) ? o : Object.values(o)) {
            if (typeof v === 'number' && Number.isFinite(v) && price > 0 && v >= 0.3 * price && v <= 3 * price) extras.add(Math.round(v * 10000) / 10000);
            else if (v && typeof v === 'object') walk(v, depth + 1);
        }
    };
    walk(s, 0);
    return {
        ticker: String(ticker || '').toUpperCase(),
        price,
        callWall: pos(st.callWall),
        putFloor: pos(st.putFloor),
        maxPain: pos(st.maxPain),
        gammaFlip: pos(st.gammaFlipLevel),
        extras: [...extras].slice(0, 300),
    };
}

// 저장값 중 AI 글이 아닌 칸(뉴스 제목은 원문, 나머지는 메타)
const NOT_AI = new Set(['newsSummary', 'basis', 'ticker', 'session', 'triggerReason', 'generatedAt', 'elapsedMs', 'newsCount', 'model', 'usedFallback', 'fromCache']);

/** 분석 한 벌(3개 국어)에서 그 언어의 AI 글만 모은다 — {ko,en,ja} 모양의 칸을 어디에 있든 찾는다. */
export function deepTextsFor(a: any, loc: FlowLocale): string {
    const out: string[] = [];
    const walk = (o: any, depth: number) => {
        if (!o || typeof o !== 'object' || depth > 6) return;
        if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
        if (typeof o[loc] === 'string' && ['ko', 'en', 'ja'].some((l) => typeof o[l] === 'string')) { out.push(o[loc]); return; }
        for (const [k, v] of Object.entries(o)) {
            if (depth === 0 && NOT_AI.has(k)) continue;
            walk(v, depth + 1);
        }
    };
    walk(a, 0);
    return out.join('\n');
}

/** 3개 국어 전부 검사 — 한 언어라도 틀리면 ok=false(이 라우트는 3개 국어를 한 덩어리로 저장·제공한다). */
export function checkDeepAnalysis(a: any, b: FlowBasis): FlowCheck {
    const badLocales: FlowLocale[] = [];
    const reasons: string[] = [];
    for (const loc of FLOW_LOCALES) {
        const r = checkFlowText(deepTextsFor(a, loc), b);
        if (r.length) { badLocales.push(loc); reasons.push(`${loc}: ${r.slice(0, 3).join('; ')}`); }
    }
    return { ok: badLocales.length === 0, badLocales, reasons };
}
