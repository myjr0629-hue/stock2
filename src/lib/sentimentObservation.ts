import { selectObservation } from '@/lib/metrics/observation';

/** 관측값과 원천 시각은 한 쌍이다. 결측이 새 공포/중립 판정을 만들지 않게 한다. */
export interface SentimentObservation {
    sentimentScore?: number | null;
    sentimentSource?: string;
    sentimentAsOf?: string | null;
    sentimentCarried?: boolean;
}
const known = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const validTime = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
const dated = (v: SentimentObservation | null | undefined) => known(v?.sentimentScore) && validTime(v?.sentimentAsOf) !== null;

type Obs = { sourceAsOf: string | null; carried?: boolean; value: number | null; source: string };
const toObs = (v: SentimentObservation | null | undefined): Obs | null => v ? {
    sourceAsOf: validTime(v.sentimentAsOf), carried: !!v.sentimentCarried,
    value: known(v.sentimentScore) ? v.sentimentScore : null, source: v.sentimentSource ?? '',
} : null;

/**
 * The shared selection rule (lib/metrics/observation): the newer source time wins; a missing score keeps
 * the previous real score with its own source time (never invented); an already-carried response keeps
 * its original time and an older response never replaces a newer observation. One stricter detail:
 * the previous score must be dated (legacy caches hold undated synthetic 50s).
 */
export function retainSentiment(current: SentimentObservation | null | undefined, previous?: SentimentObservation | null): SentimentObservation & { sentimentScore: number | null } {
    const incoming = toObs(current);
    const prior = toObs(previous);
    // Only a DATED previous score may carry: undated sentiment in stored RLSI caches can be the old
    // engine's synthetic neutral 50 (pre-10/19), which is not an observation.
    const picked = selectObservation(prior && prior.value !== null && prior.sourceAsOf ? prior : null, incoming, o => o.value !== null);
    if (!picked || picked.value === null) return { sentimentScore: null, sentimentSource: '', sentimentAsOf: null, sentimentCarried: false };
    if (picked === incoming && !incoming.carried) return { ...current, sentimentScore: picked.value, sentimentCarried: false };
    return { sentimentScore: picked.value, sentimentSource: picked.source, sentimentAsOf: picked.sourceAsOf, sentimentCarried: true };
}
/** 기존 점수 옆에 붙이는 원천 날짜. 이월값을 현재 관측으로 표시하지 않는다(날짜를 모르면 붙이지 않는다). */
export function sentimentDate(value: SentimentObservation | null | undefined): string {
    return value?.sentimentCarried && dated(value) ? new Date(value!.sentimentAsOf!).toISOString().slice(0, 10) : '';
}
