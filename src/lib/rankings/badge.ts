import type { Phase } from './engine';

export type RankingSession = { phase: Phase; regularOpen: boolean; etTime: string };

/** 분류·탭·색상은 그대로 두고, 배지만 현재 정규장 여부에 맞춘다. */
export function rankingBadgePhase(phase: string | undefined, session: RankingSession | null | undefined): Phase {
    if (phase === 'intraday') {
        return session?.phase === 'intraday' && session.regularOpen === true ? 'intraday' : 'postclose';
    }
    return phase === 'postclose' ? 'postclose' : 'anytime';
}
