/**
 * 장마감 리포트(크로스섹터 브리프) 크론 — 정시 생성·재시도·누락 경보의 판정(순수 함수).
 *
 * 왜(2026-11-06): 11/5 대폭락 날(S&P −4.36%·NASDAQ −5.52%·VIX +69.7%) 21:50Z 생성은 돌았지만 크레딧 원장 월 상한($199)에
 *   닿아 현행(Haiku 4.5)으로 만들어졌고 서빙 가드(provider:legacy)에 걸렸다. Lambda v3 도 가드 탈락 → 화면은 전날(11/4 «상승 마감») 서사.
 *   재시도도 경보도 없어 아무도 몰랐다. 그래서:
 *     21:50Z  mode 없음  — 예전 그대로 생성
 *     22:20Z  mode=retry — 그 거래일 서빙 가능한 리포트(v4 가드 통과·v3·v2)가 없을 때만 다시 생성
 *     22:35Z  mode=check — 그래도 없으면 운영 경보(SNS signum-lambda-alerts → contact@)
 *   휴장·주말에는 재시도·경보를 하지 않는다(정시 생성도 그날 스냅샷이 없어 404 로 끝난다 — 예전 그대로).
 */
import { isNonTradingDay } from '@/lib/marketCalendar';

export type CrossBriefCronMode = 'run' | 'retry' | 'check';

/** 쿼리 mode → 모드. 모르는 값은 null(400). */
export function crossBriefCronMode(raw: string | null): CrossBriefCronMode | null {
    if (raw === null || raw === '') return 'run';
    return raw === 'retry' || raw === 'check' ? raw : null;
}

export type CrossBriefCronAction =
    | { action: 'generate' }
    | { action: 'skip'; why: 'served' | 'closed-day' }
    | { action: 'alert' };

/**
 * @param sessionDate 크론 시각의 ET 날짜(21:50~22:35Z 는 늘 그 거래일 16:50~17:35 ET)
 * @param served 그 날짜로 서빙 가능한 리포트가 있는가(selectServedBrief 결과가 있는가)
 */
export function decideCrossBriefCron(mode: CrossBriefCronMode, sessionDate: string, served: boolean): CrossBriefCronAction {
    if (mode === 'run') return { action: 'generate' };
    if (isNonTradingDay(sessionDate)) return { action: 'skip', why: 'closed-day' };
    if (served) return { action: 'skip', why: 'served' };
    return mode === 'retry' ? { action: 'generate' } : { action: 'alert' };
}

/** 경보 본문 — 저장본(v4)의 생성 판정(제공자·탈락 사유)을 붙여 원인을 바로 보게 한다. 비밀값·본문은 넣지 않는다. */
export function crossBriefMissingAlert(sessionDate: string, stored: { generatedAt?: string; guard?: { provider?: string; model?: string; reasons?: string[] } } | null): { subject: string; message: string } {
    const g = stored?.guard;
    const lines = [
        `장마감 리포트(${sessionDate}) 서빙 가능한 판본이 22:35Z 까지 없습니다 — 앱·웹은 이전 거래일 서사를 보입니다.`,
        stored
            ? `저장된 v4: 생성 ${stored.generatedAt || '?'} · 제공자 ${g?.provider || '?'}/${g?.model || '?'} · 서빙 가드 탈락 사유 ${(g?.reasons || []).join(', ') || '(없음)'}`
            : '저장된 v4: 없음(생성 실패 — Vercel 로그 [Cron:CrossSectorBrief]·[CrossSectorBrief V3] 확인)',
        '점검: provider:legacy 면 크레딧 원장(llm:cost:{주기})·사다리 차단기(llm:cb:*) · 재생성: 크론 경로를 CRON_SECRET 으로 호출(/api/cron/cross-sector-brief).',
    ];
    return { subject: `[SIGNUM] 장마감 리포트 누락 ${sessionDate}`, message: lines.join('\n') };
}
