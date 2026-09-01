// ============================================================================
// 랭킹 엔진 — 공용 뼈대.
//
// 왜 엔진으로 묶는가 (2026-09-01 대표 지시):
//   랭킹이 하나둘 늘 때마다 통계·게이트를 각자 다시 짜면, 어느 날 한쪽에만
//   버그가 남고 그때 어느 쪽이 맞는지 알 수 없게 된다. 그래서 «비교하는 법»은
//   여기 한 곳에만 둔다.
//
// 이 파일에 모인 것들은 전부 실측으로 데인 자리다:
//   ① 대표 스냅샷 — 같은 날 OI 가 20배 널뛴다(실행마다 다른 만기를 본다)
//   ② 만기 롤오버 — 같은 규모의 체인끼리만 비교해야 한다
//   ③ 분모 붕괴 — MAD 가 0 에 붙으면 42σ 같은 불가능한 값이 나온다
//   ④ 시장 교란 — 시장 전체가 조용한 날엔 모든 종목이 «이탈»로 보인다
// ============================================================================

export type Phase = 'intraday' | 'postclose';

export type Row = { timestamp: number;[k: string]: any };

/** 로버스트 통계 — 평균·표준편차는 이상치 하나에 끌려간다. */
export const median = (a: number[]): number | null => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mad = (a: number[], med: number) => median(a.map((v) => Math.abs(v - med)));

/** ET 기준 날짜. 세션 경계를 UTC 로 자르면 새벽 값이 전날로 붙는다. */
export const etDay = (ms: number) => new Date(ms - 4 * 3600e3).toISOString().slice(0, 10);

/** 지금이 미국 정규장 안인가 — 랭킹의 «단계»를 정한다. */
export function sessionPhase(now = Date.now()): { phase: Phase; etTime: string; regularOpen: boolean } {
    const et = new Date(now - 4 * 3600e3);
    const hm = et.getUTCHours() * 60 + et.getUTCMinutes();
    const dow = et.getUTCDay();
    const weekday = dow >= 1 && dow <= 5;
    const regularOpen = weekday && hm >= 9 * 60 + 30 && hm < 16 * 60;
    return {
        phase: regularOpen ? 'intraday' : 'postclose',
        etTime: `${String(et.getUTCHours()).padStart(2, '0')}:${String(et.getUTCMinutes()).padStart(2, '0')}`,
        regularOpen,
    };
}

/**
 * 하루의 «대표 스냅샷».
 *
 * ⚠️ 실측: 같은 날 NVDA 콜 미결제약정이 107,121 ~ 1,985,592 로 찍힌다.
 *    미결제약정은 하루 한 번 갱신되므로 이건 장중 변화가 아니라 harvest 가
 *    실행마다 «맨 앞 만기»를 다시 고르기 때문이다.
 *    「그날 마지막 값」을 쓰면 어느 만기가 걸렸느냐가 곧 결과가 된다.
 *    → 그날 총 OI 가 가장 큰 스냅샷 하나를 골라 «모든 지표를 거기서» 읽는다.
 *       날짜 간 비교가 성립하고, 한 카드 안 숫자들이 같은 체인에서 나온다.
 */
export function dailySnapshots(items: Row[]) {
    const byDay = new Map<string, Row & { _oi: number; _d: string }>();
    for (const it of items) {
        const ts = Number(it.timestamp);
        if (!Number.isFinite(ts)) continue;
        const d = etDay(ts);
        const oi = Number(it.totalCallOI || 0) + Number(it.totalPutOI || 0);
        if (!(oi > 0)) continue;              // OI 없는 행은 비교 기준을 못 준다
        const prev = byDay.get(d);
        if (!prev || oi > prev._oi) byDay.set(d, { ...it, _oi: oi, _d: d });
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, r]) => r);
}

export type DeviationGates = {
    minSessions?: number;      // 기준선을 믿으려면 필요한 최소 세션 수
    regimeLo?: number;         // 「같은 규모의 체인」 하한 (오늘 OI 대비)
    regimeHi?: number;
    minRegimeDays?: number;
    minRelDispersion?: number; // 산포/중앙값 하한 — 분모 붕괴 방지
    minZ?: number;
    minRatio?: number;
};
export const DEFAULT_GATES: Required<DeviationGates> = {
    minSessions: 8, regimeLo: 0.5, regimeHi: 2.0, minRegimeDays: 6,
    minRelDispersion: 0.03, minZ: 3, minRatio: 1.35,
};

export type DevResult = {
    today: number; baseline: number; ratio: number; z: number; sessions: number; date: string;
} | null;

/**
 * 한 지표의 «평소 대비 이탈». 통과 못 하면 null 과 사유를 준다 —
 * 사유를 안 남기면 「왜 아무것도 안 나오지」를 영원히 못 푼다.
 */
export function deviationOf(
    snaps: Array<Row & { _oi: number; _d: string }>,
    key: string,
    gates: DeviationGates = {},
): { ok: DevResult; reason?: string } {
    const g = { ...DEFAULT_GATES, ...gates };
    const series = snaps
        .map((r) => ({ d: r._d, v: Number(r[key]), oi: r._oi }))
        .filter((x) => Number.isFinite(x.v));
    if (series.length < g.minSessions + 1) return { ok: null, reason: '이력부족' };

    const today = series[series.length - 1];
    // 만기 롤오버 방어 — 오늘과 «같은 규모의 체인»만 비교 대상으로 삼는다.
    const cmp = series.slice(0, -1).filter(
        (x) => today.oi > 0 && x.oi > 0 && x.oi >= today.oi * g.regimeLo && x.oi <= today.oi * g.regimeHi,
    );
    if (cmp.length < g.minRegimeDays) return { ok: null, reason: '비교일부족(만기롤오버)' };

    const past = cmp.map((x) => x.v);
    const med = median(past);
    if (med === null || !(med > 0)) return { ok: null, reason: '기준선없음' };
    const sp = mad(past, med) ?? 0;
    const scale = 1.4826 * sp;
    if (!(scale > 0)) return { ok: null, reason: '산포0' };
    if (sp / Math.abs(med) < g.minRelDispersion) return { ok: null, reason: '너무안변함' };

    const z = (today.v - med) / scale;
    if (!Number.isFinite(z) || Math.abs(z) < g.minZ) return { ok: null, reason: '유의하지않음' };
    const ratio = today.v / med;
    if (!(ratio >= g.minRatio || ratio <= 1 / g.minRatio)) return { ok: null, reason: '배수작음' };

    return { ok: { today: today.v, baseline: med, ratio, z, sessions: cmp.length, date: today.d } };
}

/** 배수의 «거리» — 2배와 0.5배를 같은 크기로 본다. */
export const ratioDistance = (r: number) => Math.abs(Math.log(r));
