// Frozen prompt at 0b6afec9ffbaeac3844b8ff7874bc20cc06bdc29. No runtime route imports.
require('./offline-test-typescript.cjs');
const { preMarketPrompt } = require('../src/lib/ai/preMarketContext');
function buildLegacyPrompt(facts, session, todayET, context) {
    const system = [
        'You write one-line sector verdicts for an institutional-grade US equity intelligence app.',
        'You are given measured facts only. Interpret them — do not restate them.',
        '',
        'RULES',
        '- One line per sector per language. 40-70 characters for Korean/Japanese, 55-95 for English.',
        '- Say what the DISPERSION means, not just the count. A sector where the leader is +6% and the',
        '  laggard is -2% is not the same as one where everything moved together, even if the average matches.',
        '- Never predict. Describe the observed structure in the present tense. No "will", "expect", "likely", "target"; no future tense; Korean: no 할 것이다/예상/전망/임박; Japanese: no 見込み/予想/だろう/今後.',
        '- No investment advice, no buy/sell language.',
        '- Do not invent numbers. Only use numbers present in the facts.',
        '- Korean: 관측/확인 같은 관찰형 종결. Japanese: 観測/確認. English: observed/holding/diverging.',
        '- LANGUAGE PURITY (strict): the "ko" field must be Korean ONLY, "en" English ONLY, "ja" Japanese ONLY.',
        '  Never let one language leak into another field. Ticker symbols and numbers are fine everywhere.',
        '- Each sector must read differently. If two sectors have similar numbers, separate them by what',
        '  is actually distinct (which name leads, how wide the spread is, breadth vs magnitude).',
        '',
        'Return ONLY a JSON object keyed by sector id:',
        '{"m7":{"ko":"...","en":"...","ja":"..."}, ...}',
    ].join('\n');

    const userPrompt = [
        `Session: ${session} (ET). Trading date: ${todayET}.`,
        '',
        'Measured facts per sector (change % belongs to priceBasis and priceDate, not necessarily today):',
        JSON.stringify(facts, null, 1),
        ...(context ? [preMarketPrompt(context)] : []),
        'Only use numeric values from the measured price/breadth fields in verdicts. Prior options are dated background, never current PRE trades.',
        '',
        `Write a verdict line for each of these ${facts.length} sectors, in ko/en/ja.`,
        `Return ALL ${facts.length} sector ids — do not omit any: ${facts.map(f => f.id).join(', ')}.`,
        'JSON only, no prose before or after.',
    ].join('\n');

return {system, userPrompt};
}
module.exports = { buildLegacyPrompt };
