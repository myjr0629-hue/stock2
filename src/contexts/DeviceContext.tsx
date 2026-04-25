'use client';

import React, { createContext, useContext } from 'react';

/**
 * DeviceContext — Server-side UA detection value passed to client components.
 * Eliminates SSR→Client flash by providing the correct initial value
 * so that useMobile() doesn't need to flip from false→true after hydration.
 */
const DeviceContext = createContext<boolean>(false);

export function DeviceProvider({ isMobile, children }: { isMobile: boolean; children: React.ReactNode }) {
    return <DeviceContext.Provider value={isMobile}>{children}</DeviceContext.Provider>;
}

export function useServerMobile(): boolean {
    return useContext(DeviceContext);
}
