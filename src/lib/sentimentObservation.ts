/** 관측값과 원천 시각은 한 쌍이다. 결측이 새 공포/중립 판정을 만들지 않게 한다. */
export interface SentimentObservation {
    sentimentScore?: number | null;
    sentimentSource?: string;
    sentimentAsOf?: string | null;
    sentimentCarried?: boolean;
}
const known = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const dated = (v: SentimentObservation | null | undefined) =>
    known(v?.sentimentScore) && typeof v?.sentimentAsOf === 'string' && Number.isFinite(Date.parse(v.sentimentAsOf));

export function retainSentiment(current: SentimentObservation | null | undefined, previous?: SentimentObservation | null): SentimentObservation & { sentimentScore: number | null } {
    if (known(current?.sentimentScore) && !current?.sentimentCarried) return { ...current, sentimentScore: current!.sentimentScore as number, sentimentCarried: false };
    // 이미 이월된 응답도 원천 시각을 바꾸지 않는다. 더 오래된 응답이 직전 관측을 덮지 않는다.
    const last = dated(current) && (!dated(previous) || Date.parse(current!.sentimentAsOf!) >= Date.parse(previous!.sentimentAsOf!)) ? current : previous;
    return dated(last)
        ? { sentimentScore: last!.sentimentScore as number, sentimentSource: last!.sentimentSource, sentimentAsOf: last!.sentimentAsOf, sentimentCarried: true }
        : { sentimentScore: null, sentimentSource: '', sentimentAsOf: null, sentimentCarried: false };
}
/** 기존 점수 옆에 붙이는 원천 날짜. 이월값을 현재 관측으로 표시하지 않는다. */
export function sentimentDate(value: SentimentObservation | null | undefined): string {
    return value?.sentimentCarried && dated(value) ? new Date(value!.sentimentAsOf!).toISOString().slice(0, 10) : '';
}
