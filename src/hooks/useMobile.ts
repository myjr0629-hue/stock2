import { useState, useEffect } from 'react';
import { useServerMobile } from '@/contexts/DeviceContext';

// SSR-safe mobile detection hook
// Uses server-detected value from DeviceContext as initial state to prevent hydration flash.
// Falls back to client-side check via resize listener.
export function useMobile(breakpoint = 768) {
    const serverMobile = useServerMobile();
    const [isMobile, setIsMobile] = useState<boolean>(serverMobile);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const checkMobile = () => {
            setIsMobile(window.innerWidth < breakpoint);
        };

        checkMobile();

        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, [breakpoint]);

    return isMobile;
}
