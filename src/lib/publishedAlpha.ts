/** A score/grade/time is one published observation, including a measured score of zero. */
export function applyPublishedAlpha(quote: any, alpha: any) {
    const score = typeof alpha?.score === 'number' && Number.isFinite(alpha.score) ? alpha.score : null;
    quote.alphaScore = score;
    quote.grade = score === null ? null : alpha?.grade ?? null;
    quote.alphaCapturedAt = score === null ? null : alpha?.capturedAt ?? alpha?.calculatedAt ?? null;
    quote.alphaScoreAsOf = score === null ? null : alpha?.scoreAsOf ?? quote.alphaCapturedAt;
    const missing = new Set<string>(quote.missingFields ?? []);
    if (score === null) missing.add('alphaScore'); else missing.delete('alphaScore');
    quote.missingFields = [...missing];
    return quote;
}
