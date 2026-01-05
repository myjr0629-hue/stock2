import React from 'react';

interface TypewriterTextProps {
    text: string;
    speed?: number; // ms per character
    className?: string;
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

    return <span className={className}>{displayedText}<span className="animate-pulse">▌</span></span>;
}
