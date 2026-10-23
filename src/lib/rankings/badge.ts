import { sessionPhase, type Phase } from './engine';

export type RankingSession = { phase: Phase; regularOpen: boolean; etTime: string };

/** 분류·탭·색상은 그대로 두고, 배지만 현재 정규장 여부에 맞춘다. */
export function rankingBadgePhase(phase: string | undefined, session: RankingSession | null | undefined): Phase {
    if (phase === 'intraday') {
        // 조회 실패로 세션이 없어도 정규장 시계는 로컬 달력으로 알 수 있다. 자료 결측은 그대로 둔다.
        const current = session ?? sessionPhase();
        return current.phase === 'intraday' && current.regularOpen === true ? 'intraday' : 'postclose';
    }
    return phase === 'postclose' ? 'postclose' : 'anytime';
}
