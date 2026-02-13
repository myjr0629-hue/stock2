import React from 'react';

interface TypewriterTextProps {
    text: string;
    speed?: number; // ms per character
    className?: string;
}

// Tag color mapping for section headers
const TAG_COLORS: Record<string, string> = {
    '[현황]': 'text-cyan-400 font-bold',
    '[해석]': 'text-amber-400 font-bold',
    '[액션]': 'text-emerald-400 font-bold',
};

const TAG_PATTERN = /(\[현황\]|\[해석\]|\[액션\])/g;

/** Render text with colored section tags */
export function renderColoredText(text: string): React.ReactNode[] {
    const parts = text.split(TAG_PATTERN);
    return parts.map((part, i) => {
        const colorClass = TAG_COLORS[part];
        if (colorClass) {
            return <span key={i} className={colorClass}>{part}</span>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
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
