import { useState, useEffect } from 'react';

// SSR-safe mobile detection hook
// Matches Tailwind's 'md' breakpoint (768px). By default, assumes desktop during SSR to prevent hydration mismatch.
export function useMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState<boolean>(false);

    useEffect(() => {
        // Run only on client
        if (typeof window === 'undefined') return;

        const checkMobile = () => {
            setIsMobile(window.innerWidth < breakpoint);
        };

        // Initial check
        checkMobile();

        // Listen for resize events
        window.addEventListener('resize', checkMobile);

        // Cleanup
        return () => window.removeEventListener('resize', checkMobile);
    }, [breakpoint]);

    return isMobile;
}
