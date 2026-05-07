import React from 'react';

interface TypewriterTextProps {
    text: string;
    speed?: number; // ms per character
    className?: string;
}

// Tag color mapping for section headers (ko / en / ja)
const TAG_COLORS: Record<string, string> = {
    // Korean
    '[현황]': 'text-cyan-400 font-bold',
    '[해석]': 'text-amber-400 font-bold',
    '[액션]': 'text-emerald-400 font-bold',
    '[전망]': 'text-emerald-400 font-bold',
    '[진단]': 'text-cyan-400 font-bold',
    '[결론]': 'text-emerald-400 font-bold',
    // English
    '[Status]': 'text-cyan-400 font-bold',
    '[Interpretation]': 'text-amber-400 font-bold',
    '[Action]': 'text-emerald-400 font-bold',
    '[Outlook]': 'text-emerald-400 font-bold',
    '[Diagnosis]': 'text-cyan-400 font-bold',
    '[Conclusion]': 'text-emerald-400 font-bold',
    // Japanese
    '[現況]': 'text-cyan-400 font-bold',
    '[解釈]': 'text-amber-400 font-bold',
    '[アクション]': 'text-emerald-400 font-bold',
    '[見通し]': 'text-emerald-400 font-bold',
    '[診断]': 'text-cyan-400 font-bold',
    '[結論]': 'text-emerald-400 font-bold',
};

const TAG_PATTERN = /(\[현황\]|\[해석\]|\[액션\]|\[전망\]|\[진단\]|\[결론\]|\[Status\]|\[Interpretation\]|\[Action\]|\[Outlook\]|\[Diagnosis\]|\[Conclusion\]|\[現況\]|\[解釈\]|\[アクション\]|\[見通し\]|\[診断\]|\[結論\])/g;

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
    const DATA_PATTERN = /([+-]?\d+\.?\d*%)|(\b(?:S&P\s*500|NASDAQ|DOW|VIX|DXY|GEX|RLSI|Fear\s*&\s*Greed|US10Y|BTC|Gold|Oil|WTI)\b)/gi;

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
            const val = parseFloat(matched);
            if (val > 0) {
                result.push(
                    <span key={key} className="text-emerald-400/90 font-semibold">{matched}</span>
                );
            } else if (val < 0) {
                result.push(
                    <span key={key} className="text-rose-400/90 font-semibold">{matched}</span>
                );
            } else {
                result.push(
                    <span key={key} className="text-white/90 font-semibold">{matched}</span>
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
