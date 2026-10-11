/**
 * Haiku 5.5 요청·응답 다듬기 (순수 함수 — tests/llmLadder.test.ts 가 고정한다).
 *
 * 공식 근거(platform.claude.com, 2026-10-10):
 *  · temperature(1 외)·top_p(0.99 외)·top_k 를 보내면 400 → «아예 보내지 않는다».
 *  · 어시스턴트 프리필(messages 가 assistant 로 끝남)은 사고를 꺼도 400 → 마지막 turn 은 항상 user.
 *  · 사고는 기본 켜짐(적응형)이고 max_tokens 를 먹는다 → effort 를 낮게 두고 max_tokens 를 넉넉히(+30% 토큰화·사고분).
 *  · 응답 첫 블록이 thinking 일 수 있다 → type==='text' 블록만 이어 붙인다.
 *  · stop_reason:'refusal'(HTTP 200) — 서버측 폴백 없음. 같은 요청은 다시 거절되므로 클라이언트가 다음 단으로 넘긴다.
 */

export type Effort = 'low' | 'medium' | 'high';

export interface ShapeOptions {
    system: string;
    userPrompt: string;
    maxTokens: number;
    /** 호출자가 JSON 응답을 기대한다(예전 프리필 '{' 사용처) */
    jsonPrefill?: boolean;
    /** 응답이 객체가 아니라 «배열»(예: 뉴스 다이제스트 [ … ]) */
    jsonArray?: boolean;
    effort?: Effort;
    /**
     * 'disabled' 이면 사고를 끈다(low/medium/high 에서만 허용). 기본은 생략(적응형).
     *  · Haiku 5.5 : thinking:{type:'disabled'}
     *  · Sonnet 5.5: {type:'disabled'} 는 400 — 끄려면 {type:'between_tools'}(effort high 이하에서만, 다른 필드 금지) — 공식 문서 2026-10-11
     */
    thinking?: 'disabled' | 'adaptive';
}

/** 프리필 대신 지시로 형식을 요구한다 — system 뒤에 붙는다. */
export const JSON_ONLY_INSTRUCTION = `

<output_format>
Reply with exactly one valid JSON object and nothing else: the first character of your reply must be "{" and the last must be "}". No preamble, no explanation, no markdown fences.
</output_format>`;

export const JSON_ARRAY_INSTRUCTION = `

<output_format>
Reply with exactly one valid JSON array and nothing else: the first character of your reply must be "[" and the last must be "]". No preamble, no explanation, no markdown fences.
</output_format>`;

/** max_tokens: 토큰화 +30% 와 사고 토큰을 흡수할 여유. 쓴 만큼만 과금되므로 넉넉해도 비용은 같다. */
export function h55MaxTokens(requested: number): number {
    const base = Number.isFinite(requested) && requested > 0 ? requested : 4096;
    return Math.min(32_000, Math.ceil(base * 1.3) + 1024);
}

/** Messages API 요청 본문 — Anthropic 직접 API 와 Bedrock(Mantle) 공통. model 은 호출자가 넣는다. */
export function shapeH55Body(model: string, o: ShapeOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model,
        max_tokens: h55MaxTokens(o.maxTokens),
        system: o.jsonArray ? o.system + JSON_ARRAY_INSTRUCTION : o.jsonPrefill ? o.system + JSON_ONLY_INSTRUCTION : o.system,
        // 마지막 turn 은 반드시 user — 프리필 금지
        messages: [{ role: 'user', content: o.userPrompt }],
        output_config: { effort: o.effort ?? 'low' },
    };
    if (o.thinking === 'disabled') body.thinking = /^claude-sonnet/.test(model) ? { type: 'between_tools' } : { type: 'disabled' };
    // temperature·top_p·top_k 는 «키 자체를 만들지 않는다»(400 방지)
    return body;
}

export interface ParsedMessage {
    text: string;
    stopReason: string | null;
    refusalCategory: string | null;
    usage: { input: number; output: number; cacheWrite: number; cacheRead: number };
    hadThinking: boolean;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Messages API 응답 → 텍스트(마크다운 펜스 제거)·중지 사유·사용량 */
export function parseMessageResponse(json: any): ParsedMessage {
    const blocks: any[] = Array.isArray(json?.content) ? json.content : [];
    const text = blocks.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
    const u = json?.usage || {};
    return {
        text: text.replace(/```json/g, '').replace(/```/g, '').trim(),
        stopReason: typeof json?.stop_reason === 'string' ? json.stop_reason : null,
        refusalCategory: typeof json?.stop_details?.category === 'string' ? json.stop_details.category : null,
        usage: {
            input: num(u.input_tokens),
            output: num(u.output_tokens),
            cacheWrite: num(u.cache_creation_input_tokens),
            cacheRead: num(u.cache_read_input_tokens),
        },
        hadThinking: blocks.some((b) => b && b.type === 'thinking'),
    };
}

/**
 * JSON 기대 호출의 텍스트 정리 — 첫 '{' 앞의 군말은 걷어 낸다(예전 프리필이 보장하던 «첫 글자 {»).
 * 걷어 낸 뒤에도 JSON 으로 읽히지 않으면 ok:false (다음 단으로).
 * 호출 코드는 그대로 `JSON.parse(text)` 를 한다 — 우리는 읽히는 문자열만 돌려준다.
 */
/**
 * 모델이 가끔 «구조 괄호 한 개»를 빠뜨린다 — 객체 배열의 항목을 `…"},{"title":…` 처럼 `}` 하나만 닫고 다음 항목을 연다
 * (Haiku 5.5 크로스섹터 25회 중 2회, Sonnet 5.5 딥 분석 리허설 10회 중 3회). 같은 자리의 «다음 `{` 앞 쉼표»에서만 빠진 `}` 를 채워 넣는다:
 *   ① 객체 안에서 «키가 와야 할 자리»에 `{` 가 나오면 직전 쉼표 앞에 `}` 를 넣어 그 객체를 닫고, ② `]`/`}` 가 열린 괄호와 종류가 다르면 그 앞에 열린 쪽의 닫는 괄호를 넣는다(최대 6곳).
 * 글 내용은 건드리지 않고 구조 문자만 더한다. 고친 뒤에도 JSON.parse 와 호출 지점의 출구 가드를 모두 통과해야 쓴다.
 */
export function repairDroppedClosers(text: string, maxRepairs = 6): { text: string; repairs: number } {
    let s = String(text || '');
    let repairs = 0;
    for (let round = 0; round < maxRepairs; round++) {
        type Frame = { t: '{' | '['; expectKey: boolean; lastComma: number };
        const stack: Frame[] = [];
        let inStr = false, esc = false, fixedAt = -1, fixCh = '}';
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
            if (c === '"') { inStr = true; const top = stack[stack.length - 1]; if (top && top.t === '{' && top.expectKey) top.expectKey = false; continue; }
            if (/\s/.test(c)) continue;
            const top = stack[stack.length - 1];
            if (c === '{') {
                if (top && top.t === '{' && top.expectKey && top.lastComma >= 0) { fixedAt = top.lastComma; fixCh = '}'; break; }   // 키 자리에 { → 앞 객체의 닫는 괄호가 빠졌다
                stack.push({ t: '{', expectKey: true, lastComma: -1 });
            } else if (c === '[') {
                if (top && top.t === '{' && top.expectKey && top.lastComma >= 0) { fixedAt = top.lastComma; fixCh = '}'; break; }
                stack.push({ t: '[', expectKey: false, lastComma: -1 });
            } else if (c === '}' || c === ']') {
                // 닫는 괄호가 맞지 않다: `"}]` 에서 앞 객체의 `}` 가 빠졌으면 `]` 앞에 `}` 를 넣는다
                if (top && top.t !== (c === '}' ? '{' : '[')) { fixedAt = i; fixCh = top.t === '{' ? '}' : ']'; break; }
                stack.pop();
            }
            else if (c === ',') { if (top) { top.lastComma = i; if (top.t === '{') top.expectKey = true; } }
            else if (c === ':' && top && top.t === '{') top.expectKey = false;
        }
        if (fixedAt < 0) break;
        s = s.slice(0, fixedAt) + fixCh + s.slice(fixedAt);
        repairs++;
    }
    return { text: s, repairs };
}

export function normalizeJsonText(text: string, kind: 'object' | 'array' = 'object'): { ok: boolean; text: string; repaired?: boolean } {
    const open = kind === 'array' ? '[' : '{';
    const close = kind === 'array' ? ']' : '}';
    let s = String(text || '').trim();
    const start = s.indexOf(open);
    if (start < 0) return { ok: false, text: s };
    if (start > 0) s = s.slice(start);
    try { JSON.parse(s); return { ok: true, text: s }; } catch { /* 뒤에 군말이 붙었을 수 있다 */ }
    const end = s.lastIndexOf(close);
    if (end > 0) {
        const cut = s.slice(0, end + 1);
        try { JSON.parse(cut); return { ok: true, text: cut }; } catch { /* fallthrough */ }
    }
    // 빠진 구조 괄호 채우기(repairDroppedClosers) — 객체 JSON 만
    if (kind === 'object') {
        const r = repairDroppedClosers(end > 0 ? s.slice(0, end + 1) : s);
        if (r.repairs > 0) { try { JSON.parse(r.text); return { ok: true, text: r.text, repaired: true }; } catch { /* fallthrough */ } }
    }
    return { ok: false, text: s };
}

export type FailKind =
    | 'no-key' | 'cap' | 'breaker' | 'timeout' | 'network'
    | 'auth' | 'credit' | 'rate' | 'server' | 'bad-request' | 'access'
    | 'refusal' | 'truncated' | 'empty' | 'json' | 'guard';

export interface HttpFail { kind: FailKind; /** 이 제공자 문을 얼마나 닫을지(초). 0 이면 닫지 않는다 */ closeSec: number; detail: string }

/** 월 주기 끝까지 닫는 «소진» 신호 문구 */
const CREDIT_RE = /credit balance is too low|enforced_spend_limit_reached|reached your specified|usage limits|plans & billing|insufficient.*credit/i;

/**
 * HTTP 오류 → 어느 종류인가 + 문을 얼마나 닫을까.
 *  401/403          : 키 폐기·조직 정지·IAM/모델 접근 없음 → 30분(경보 로그)
 *  429 + 소진 문구  : 갱신일까지는 아니고 1시간(콘솔에서 크레딧 보충 가능) — 갱신 경계는 호출자가 min() 한다
 *  400 + 소진 문구  : 같음(크레딧 부족은 400 으로 온다)
 *  429 일반         : retry-after(초) 또는 60초
 *  5xx·529          : 120초
 *  그 외 400        : 문을 닫지 않는다(요청 하나가 잘못된 것일 수 있다) — 호출자가 크게 로그
 */
export function classifyHttpFailure(status: number, bodyText: string, retryAfter?: string | null): HttpFail {
    const body = String(bodyText || '').slice(0, 400);
    if (status === 401) return { kind: 'auth', closeSec: 1800, detail: `401 ${body}` };
    if (status === 403) return { kind: 'access', closeSec: 1800, detail: `403 ${body}` };
    if ((status === 400 || status === 429 || status === 402) && CREDIT_RE.test(body)) return { kind: 'credit', closeSec: 3600, detail: `${status} ${body}` };
    if (status === 429) {
        const ra = Number(retryAfter);
        return { kind: 'rate', closeSec: Number.isFinite(ra) && ra > 0 ? Math.min(Math.ceil(ra), 600) : 60, detail: `429 ${body}` };
    }
    if (status >= 500) return { kind: 'server', closeSec: 120, detail: `${status} ${body}` };
    if (status === 404) return { kind: 'access', closeSec: 1800, detail: `404 ${body}` };
    return { kind: 'bad-request', closeSec: 0, detail: `${status} ${body}` };
}
