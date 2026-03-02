'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * useMediaQuery — SSR-safe responsive breakpoint hook
 * Returns true when the media query matches.
 * During SSR and initial hydration, returns `false` (desktop-first approach).
 *
 * Usage:
 *   const isMobile = useMediaQuery('(max-width: 768px)');
 *   const isTablet = useMediaQuery('(max-width: 1024px)');
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);

    const handleChange = useCallback((e: MediaQueryListEvent | MediaQueryList) => {
        setMatches(e.matches);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const mql = window.matchMedia(query);
        // Set initial value
        setMatches(mql.matches);

        // Modern browsers
        if (mql.addEventListener) {
            mql.addEventListener('change', handleChange);
            return () => mql.removeEventListener('change', handleChange);
        }
        // Legacy Safari (< 14)
        mql.addListener(handleChange as any);
        return () => mql.removeListener(handleChange as any);
    }, [query, handleChange]);

    return matches;
}

/**
 * Convenience hooks for common breakpoints (Tailwind defaults)
 */
export function useIsMobile(): boolean {
    return useMediaQuery('(max-width: 768px)');
}

export function useIsTablet(): boolean {
    return useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
}

export function useIsDesktop(): boolean {
    return useMediaQuery('(min-width: 1025px)');
}
