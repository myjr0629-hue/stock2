"use client";

/**
 * TerminalGateWrapper — SSR 페이지에서 GuestWall을 안전하게 적용하는 래퍼
 * 
 * 기존 터미널 코드를 전혀 수정하지 않고,
 * SSR page.tsx에서 children으로 감싸기만 하면 됩니다.
 * 
 * 사용법 (SSR page.tsx):
 * import { TerminalGateWrapper } from '@/components/gate/TerminalGateWrapper';
 * 
 * return (
 *   <TerminalGateWrapper pageName="COMMAND">
 *     <DashboardClient ... />
 *   </TerminalGateWrapper>
 * );
 */

import React from 'react';
import { GuestWall } from '@/components/gate/GuestWall';

interface TerminalGateWrapperProps {
    children: React.ReactNode;
    /** 터미널 이름 (FOMO 메시지 용) */
    pageName?: string;
}

export function TerminalGateWrapper({ children, pageName }: TerminalGateWrapperProps) {
    return (
        <GuestWall pageName={pageName}>
            {children}
        </GuestWall>
    );
}
