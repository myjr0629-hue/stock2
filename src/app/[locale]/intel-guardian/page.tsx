
"use client";

// ============================================================================
// Guardian Page — Slim Wrapper
// GuardianProvider is already in root layout.tsx (global)
// This page just renders GuardianClient which handles mobile/desktop bifurcation
// ============================================================================

import GuardianClient from './GuardianClient';

export default function GuardianPage() {
    return <GuardianClient />;
}
