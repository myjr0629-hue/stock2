import { headers } from 'next/headers';
import { TerminalGateWrapper } from '@/components/gate/TerminalGateWrapper';
import { QuantRadarClient } from './QuantRadarClient';
import { MobileQuantRadar } from './MobileQuantRadar';

export const dynamic = 'force-dynamic';

export default async function QuantRadarPage() {
    // 1. Server-side mobile detection
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || '';
    const isMobileDevice = /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent);

    // 2. Bifurcated rendering - Mobile gets native tab layout, Desktop gets full screen radar workspace
    if (isMobileDevice) {
        return (
            <TerminalGateWrapper pageName="RADAR">
                <MobileQuantRadar />
            </TerminalGateWrapper>
        );
    }

    return (
        <TerminalGateWrapper pageName="RADAR">
            <QuantRadarClient />
        </TerminalGateWrapper>
    );
}
