import { adviceHit } from '@/lib/ai/adviceGuard';
import { checkAmounts } from '@/lib/ai/amountGuard';
import * as contract from '../../../scripts/lambda-cross-sector/closingReport';

export type BriefLocale = 'ko' | 'en' | 'ja';
export type ReportText = Record<BriefLocale, string>;
export interface ClosingNarrative {
    version: 1;
    verdict: ReportText;
    whatHappened: ReportText;
    why: ReportText;
    indicators: ReportText;
    watchNext: ReportText;
    causeRefs: { newsId: string; kind: 'reported_context' | 'retrospective' | 'after_close' }[];
}

/** New reports only. Old stored reports keep the existing serving policy. */
export function closingReportProblems(brief: any): string[] {
    if (!brief?.reportEvidence && !brief?.structured?.closingNarrative) return [];
    const errors: string[] = contract.evidenceProblems(brief.structured, brief.reportEvidence);
    const n = brief.structured?.closingNarrative;
    for (const field of contract.FIELDS as (keyof Omit<ClosingNarrative, 'version' | 'causeRefs'>)[]) {
        for (const loc of ['ko', 'en', 'ja'] as const) {
            const text = n?.[field]?.[loc];
            if (typeof text !== 'string') continue;
            if (adviceHit(text)) errors.push(`narrative:${field}:${loc}:advice`);
            if (loc !== 'en' && !checkAmounts(n?.[field]?.en || '', text, loc).ok) errors.push(`narrative:${field}:${loc}:amount`);
        }
    }
    return [...new Set(errors)];
}

export function narrativeLengthCeiling(path: string, locale: BriefLocale): number | null {
    const field = /^closingNarrative\.(verdict|whatHappened|why|indicators|watchNext)\./.exec(path)?.[1];
    return field ? (contract.LIMITS as Record<string, Record<BriefLocale, number>>)[field][locale] : null;
}
