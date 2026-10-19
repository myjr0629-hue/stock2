/** 순수 검사. 손상 문자를 지워서 정상 문장으로 위장하지 않는다. */
export function textIntegrityReasons(text: string): string[] {
    const out: string[] = [];
    if (/\uFFFD/.test(text)) out.push('text:replacement-character');
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(text)) out.push('text:control-character');
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) out.push('text:unpaired-surrogate');
    return out;
}
