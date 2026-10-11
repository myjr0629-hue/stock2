/**
 * «해석의 깊이» 지시문 (2026-10-11, 대표: «Haiku 5.5 의 능력치를 더 넣는 것이 좋을 것으로 보인다»).
 *
 * 숫자를 다시 읽어 주는 글이 아니라 «왜·무엇을 봐야 하나»를 쓰게 하는 system 덧붙임 한 단락.
 * 사다리 ①(Anthropic 크레딧)·②(Bedrock 5.5)에서만 붙인다 — ③ 현행(Bedrock Haiku 4.5)은 예전 프롬프트 그대로다(llmLadder.tryRung).
 * 근거: HAIKU55-AB-2026-10-10.md «14절» (용도별 현행 대 깊이 변형 — 가드·숫자 정확성·Sonnet 판정·칸 길이).
 *
 * 설계 원칙
 *  · 칸 구조를 바꾸지 않는다 — 각 용도의 출력 형식·문장 수·언어 칸은 그대로. 깊이는 «더 길게»가 아니라 «더 알맞은 사실 고르기».
 *  · 숫자는 입력에 있는 것만(자리표를 쓰는 경로는 자리표 그대로). 새로 계산·환산·반올림 금지.
 *  · 말투는 관찰 — 권유·행동 지시·미래형·가격 예측 금지(기존 시스템 규칙과 같은 말).
 *  · 이 문단이 현행 규칙과 부딪치면 현행 규칙이 이긴다(맨 끝 문장).
 */

/** 모든 용도 공통 — 교차 근거 · 이유 · 조건 · 반대 신호/한계 · 숫자 · 말투 */
export const DEPTH_CORE = `<depth_standard>
INTERPRETATION DEPTH. The reader already sees the numbers on screen; your value is the reading, not the restatement.
1. CROSS-CHECK: tie together at least two DIFFERENT kinds of evidence from the data (for example options positioning vs price action, dealer gamma vs flow, news vs money, sector rotation vs macro) and say whether they AGREE or CONFLICT. A conflict or an oddity is the most useful thing to report; state it plainly instead of smoothing it over.
2. WHY: for the main reading, give the mechanism in one clause: who is doing what, and why that matters for price or risk.
3. CONDITION: include one statement of the form "above/below/at LEVEL, X changes" that uses a level, threshold or event that appears in the data (never an invented or textbook one). Write it as a present-tense structural fact.
4. COUNTER-SIGNAL / LIMIT: name the strongest signal that points the other way, or the missing / stale / thin piece of data, in one short clause. Write limits as facts about the data ("X is not provided", "X는 제공되지 않았다", "Xはデータにない"); never with "cannot", "할 수 없습니다", "できません" or an apology.
5. NUMBERS: use only numbers that appear in the data, exactly as given (when the format uses placeholders such as {PRICE}, copy the placeholder); never compute, convert, average, merge or round a new number (cite one value from the data exactly, not an in-between value), and do not invent thresholds.
6. TONE: observation only. No recommendation, no instruction to the reader, no future tense, no price prediction, no "would confirm / would signal" wording. Banned in every language: should, worth noting, expected to, will, 봐야 한다, 주목할 만하다, 확인이 필요합니다, ~할 것이다, ~굳어진다, 注目, 注視, 〜べき, 〜でしょう. Never close with a to-do for the reader.
7. JSON SAFETY: never put a double-quote character inside a text value (use single quotes if you must quote a word or headline).
Depth must fit the existing fields: do not add fields or sentences beyond what the output format allows and do not make fields longer; choose the most informative facts and compress them. Do not copy example phrases from the instructions unless the data supports them.
If anything above conflicts with the output format or the compliance rules elsewhere in this prompt, those rules win.
</depth_standard>`;

/** 용도별 칸 안내 — 핵심 규칙을 «어느 칸에» 넣는지 */
const SLOT_NOTES: Record<string, string> = {
    Guardian: `<depth_slots>
Each labeled line stays ONE sentence of normal length (never join clauses into a long run-on). Put the AGREE/CONFLICT verdict and the one counter-signal or data limit in the interpretation line (the second line / the line about what is unusual); put the level-based condition in the last line (outlook / break-point), using a level that exists in the data. All three languages carry the same cross-check and the same condition.
</depth_slots>`,
    UC: `<depth_slots>
Plain words only (no jargon). whyItMatters = ONE sentence giving the everyday mechanism (why this headline touches an ordinary person's money). moneyRead = ONE sentence saying whether the money signals AGREE with the headline or point the other way, and what that means; when the signals are mixed or thin, say that honestly. Keep both sentences short.
</depth_slots>`,
    FlowAI: `<depth_slots>
structuralThesis: connect 3+ factors and say which AGREE and which CONFLICT. factorHighlights: choose the pair of factors that disagree (or the strongest agreeing pair) and explain the mechanism. repricingCondition: the concrete "if the price crosses {PUT_FLOOR} / {CALL_WALL} / {GAMMA_FLIP} (placeholders as given in the data), then …" structural condition. Name one limit of the evidence (stale/thin/event-driven data, earnings proximity) in the thesis or the condition. riskAssessment and confidence must be consistent with the conflicts you name.
</depth_slots>`,
    DeepAnalysis: `<depth_slots>
currentState: a one-line verdict that names the main agreement or conflict. Each section: mechanism + interaction + so-what, one cross-check per section. The options-positioning section ends with the "if … crosses LEVEL" condition (placeholders as given). The news section states whether the news SUPPORTS or CONTRADICTS the structural read. keyInsight: the single sharpest cross-signal conflict or alignment in one line. Name the main counter-signal or data limit once.
</depth_slots>`,
    CrossSector: `<depth_slots>
summary and rotationInsight: link at least two asset classes or sectors and say whether they AGREE or CONFLICT. keyDrivers: facts with numbers from the data, one cross-asset link each. catalysts / risks / opportunities: every IF names a level, reading or event that appears in the data (keyLevels, VIX structure, calendar), written as a present-tense condition; at least one risk is a counter-signal to the prevailing tone. edgeAlerts only for a genuine cross-asset anomaly. Keep every field within its stated length.
</depth_slots>`,
    MorningBriefing: `<depth_slots>
Keep the 3-part structure but write 6 or 7 sentences (never 8 or more) of ordinary length, no longer than a normal briefing: make room for the cross-check by dropping restated minor numbers (keep the index futures and the few most informative readings), not by writing longer. In PART 3 say whether RLSI, VIX/term structure, GEX and breadth AGREE or CONFLICT with the futures move, name the main counter-signal, and end with the key variable stated as an IF-condition that uses a level or event from the data (present tense, not a forecast). In PART 2 say whether the headlines explain or fail to explain the move.
</depth_slots>`,
};

/** 용도별 지시문 전체(공통 + 칸 안내). 지시문이 없는 용도는 빈 문자열 — 예전 그대로 */
export function depthDirectiveFor(purpose: string): string {
    const slot = SLOT_NOTES[purpose];
    return slot ? `\n\n${DEPTH_CORE}\n${slot}` : '';
}

/** 깊이 지시문을 붙일 수 있는 용도 */
export const DEPTH_PURPOSES: readonly string[] = Object.keys(SLOT_NOTES);
