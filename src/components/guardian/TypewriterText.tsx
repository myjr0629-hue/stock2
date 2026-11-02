import React from 'react';

interface TypewriterTextProps {
    text: string;
    speed?: number; // ms per character
    className?: string;
}

const TAG_COLORS: Record<string, string> = {
    // Korean
    '[현황]': 'text-cyan-400 font-bold',
    '**현황**': 'text-cyan-400 font-bold',
    '[해석]': 'text-amber-400 font-bold',
    '**해석**': 'text-amber-400 font-bold',
    '[액션]': 'text-emerald-400 font-bold',
    '**액션**': 'text-emerald-400 font-bold',
    '[전망]': 'text-emerald-400 font-bold',
    '**전망**': 'text-emerald-400 font-bold',
    '[진단]': 'text-cyan-400 font-bold',
    '**진단**': 'text-cyan-400 font-bold',
    '[결론]': 'text-emerald-400 font-bold',
    '**결론**': 'text-emerald-400 font-bold',
    '[변동성 진단]': 'text-cyan-400 font-bold',
    '**변동성 진단**': 'text-cyan-400 font-bold',
    '[지지와 저항]': 'text-amber-400 font-bold',
    '**지지와 저항**': 'text-amber-400 font-bold',

    // English
    '[Status]': 'text-cyan-400 font-bold',
    '**Status**': 'text-cyan-400 font-bold',
    '[Interpretation]': 'text-amber-400 font-bold',
    '**Interpretation**': 'text-amber-400 font-bold',
    '[Action]': 'text-emerald-400 font-bold',
    '**Action**': 'text-emerald-400 font-bold',
    '[Outlook]': 'text-emerald-400 font-bold',
    '**Outlook**': 'text-emerald-400 font-bold',
    '[Diagnosis]': 'text-cyan-400 font-bold',
    '**Diagnosis**': 'text-cyan-400 font-bold',
    '[Conclusion]': 'text-emerald-400 font-bold',
    '**Conclusion**': 'text-emerald-400 font-bold',
    '[Volatility Diagnosis]': 'text-cyan-400 font-bold',
    '**Volatility Diagnosis**': 'text-cyan-400 font-bold',
    '[Support & Resistance]': 'text-amber-400 font-bold',
    '**Support & Resistance**': 'text-amber-400 font-bold',

    // Japanese
    '[現況]': 'text-cyan-400 font-bold',
    '**現況**': 'text-cyan-400 font-bold',
    '[解釈]': 'text-amber-400 font-bold',
    '**解釈**': 'text-amber-400 font-bold',
    '[アクション]': 'text-emerald-400 font-bold',
    '**アクション**': 'text-emerald-400 font-bold',
    '[見通し]': 'text-emerald-400 font-bold',
    '**見通し**': 'text-emerald-400 font-bold',
    '[診断]': 'text-cyan-400 font-bold',
    '**診断**': 'text-cyan-400 font-bold',
    '[結論]': 'text-emerald-400 font-bold',
    '**結論**': 'text-emerald-400 font-bold',
    '[ボラティリティ診断]': 'text-cyan-400 font-bold',
    '**ボラティリティ診断**': 'text-cyan-400 font-bold',
    '[支持と抵抗]': 'text-amber-400 font-bold',
    '**支持と抵抗**': 'text-amber-400 font-bold',
};

const TAG_PATTERN = /(\[현황\]|\*\*현황\*\*|\[해석\]|\*\*해석\*\*|\[액션\]|\*\*액션\*\*|\[전망\]|\*\*전망\*\*|\[진단\]|\*\*진단\*\*|\[결론\]|\*\*결론\*\*|\[변동성 진단\]|\*\*변동성 진단\*\*|\[지지와 저항\]|\*\*지지와 저항\*\*|\[Status\]|\*\*Status\*\*|\[Interpretation\]|\*\*Interpretation\*\*|\[Action\]|\*\*Action\*\*|\[Outlook\]|\*\*Outlook\*\*|\[Diagnosis\]|\*\*Diagnosis\*\*|\[Conclusion\]|\*\*Conclusion\*\*|\[Volatility Diagnosis\]|\*\*Volatility Diagnosis\*\*|\[Support & Resistance\]|\*\*Support & Resistance\*\*|\[現況\]|\*\*現況\*\*|\[解釈\]|\*\*解釈\*\*|\[アクション\]|\*\*アクション\*\*|\[見通し\]|\*\*見通し\*\*|\[診断\]|\*\*診断\*\*|\[結論\]|\*\*結論\*\*|\[ボラティリティ診断\]|\*\*ボラティリティ診断\*\*|\[支持と抵抗\]|\*\*支持と抵抗\*\*)/g;

/** Render text with colored section tags + auto-highlighted data points */
export function renderColoredText(text: string): React.ReactNode[] {
    // Strip boilerplate prefixes AI sometimes adds
    let cleaned = text
        .replace(/^\*?\*?Market Assessment:?\*?\*?\s*/i, '')
        .replace(/^\*?\*?시장 평가:?\*?\*?\s*/i, '')
        .replace(/^\*?\*?市場評価:?\*?\*?\s*/i, '');

    // Phase 1: Split by section tags
    const parts = cleaned.split(TAG_PATTERN);
    const nodes: React.ReactNode[] = [];
    let isFirst = true;
    parts.forEach((part, i) => {
        const colorClass = TAG_COLORS[part];
        if (colorClass) {
            if (!isFirst) {
                nodes.push(<br key={`br-${i}`} />);
            }
            nodes.push(<span key={i} className={colorClass}>{part}</span>);
            isFirst = false;
        } else if (part) {
            // Phase 2: Highlight data within text segments
            nodes.push(<React.Fragment key={i}>{highlightData(part, i)}</React.Fragment>);
            isFirst = false;
        }
    });
    return nodes;
}

/**
 * Auto-highlight key data points in analysis text.
 * - +X.XX% → emerald (subtle)
 * - -X.XX% → rose (subtle)
 * - Key index names → white bold
 * Intentionally restrained — only numbers and tickers get color.
 */
function highlightData(text: string, parentKey: number): React.ReactNode[] {
    // Pattern matches: +0.12%, -4.28%, +1.11%, 0.04%, percentages, and key numbers with %
    const DATA_PATTERN = /([+\-−]?\d+\.?\d*%)|(\b(?:S&P\s*500|NASDAQ|DOW|VIX|DXY|GEX|RLSI|Fear\s*&\s*Greed|US10Y|BTC|Gold|Oil|WTI)\b)/gi;

    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // Reset regex state
    DATA_PATTERN.lastIndex = 0;

    while ((match = DATA_PATTERN.exec(text)) !== null) {
        // Text before match
        if (match.index > lastIndex) {
            result.push(text.slice(lastIndex, match.index));
        }

        const matched = match[0];
        const key = `${parentKey}-${match.index}`;

        if (match[1]) {
            // Percentage number
            // Only direction words in the same clause can describe this value.
            // Decimal points are not boundaries; signs always take precedence.
            const boundaries = /[。！？!?、，,;；\n]|\.(?!\d)|\b(?:and|but|or|while|however|yet)\b|그리고|그러나|하지만|또는|및|(?<=내렸|올랐|하락했|상승했)(?:고|지만)|そして|しかし|または|及び/gi;
            let start = 0;
            let end = text.length;
            let boundary: RegExpExecArray | null;
            while ((boundary = boundaries.exec(text)) !== null) {
                if (boundary.index + boundary[0].length <= match.index) start = boundary.index + boundary[0].length;
                else if (boundary.index >= match.index + matched.length) { end = boundary.index; break; }
            }
            const clause = text.slice(start, end);
            const words = /내렸|하락|올랐|상승|\b(?:fell|fall|down|rose|rise|up)\b|下落|下げ|上昇/gi;
            let up = false;
            let down = false;
            let negated = false;
            let word: RegExpExecArray | null;
            while ((word = words.exec(clause)) !== null) {
                const before = clause.slice(0, word.index);
                const after = clause.slice(word.index + word[0].length);
                if (/(?:^|\s)(?:안|못)\s*$|\b(?:not|never|no|didn't|doesn't|don't|isn't|wasn't|cannot|can't)\s*$/i.test(before) ||
                    /^\s*(?:하지\s*않|하지\s*못|하지\s*말|않|못|ない|せず|しない|しなかった|せぬ)/i.test(after)) {
                    negated = true;
                } else if (/^(?:내렸|하락|fell|fall|down|下落|下げ)$/i.test(word[0])) {
                    down = true;
                } else {
                    up = true;
                }
            }
            const direction = matched[0] === '+' ? 1 : /[-−]/.test(matched[0]) ? -1 : negated || down === up ? 0 : down ? -1 : 1;
            if (direction > 0) {
                result.push(
                    <span key={key} className="text-emerald-400/90 font-semibold">{matched}</span>
                );
            } else if (direction < 0) {
                result.push(
                    <span key={key} className="text-rose-400/90 font-semibold">{matched}</span>
                );
            } else {
                result.push(
                    <span key={key} className="font-semibold">{matched}</span>
                );
            }
        } else if (match[2]) {
            // Key index/indicator name
            result.push(
                <span key={key} className="text-white font-semibold">{matched}</span>
            );
        }

        lastIndex = match.index + matched.length;
    }

    // Remaining text
    if (lastIndex < text.length) {
        result.push(text.slice(lastIndex));
    }

    return result;
}

export function TypewriterText({ text, speed = 30, className = "" }: TypewriterTextProps) {
    const [displayedText, setDisplayedText] = React.useState("");
    const [currentIndex, setCurrentIndex] = React.useState(0);

    React.useEffect(() => {
        setDisplayedText("");
        setCurrentIndex(0);
    }, [text]);

    React.useEffect(() => {
        if (currentIndex < text.length) {
            const timeout = setTimeout(() => {
                setDisplayedText(prev => prev + text[currentIndex]);
                setCurrentIndex(prev => prev + 1);
            }, speed);

            return () => clearTimeout(timeout);
        }
    }, [currentIndex, text, speed]);

    return (
        <span className={className}>
            {renderColoredText(displayedText)}
            <span className="animate-pulse">▌</span>
        </span>
    );
}
