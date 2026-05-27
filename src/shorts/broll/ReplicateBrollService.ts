// ============================================================================
// Replicate B-roll Service — Mock-mode ready
// Generates cinematic abstract backgrounds via Replicate FLUX.
// If REPLICATE_API_TOKEN is missing, returns local fallback.
// Never generates fake charts, fake text, or fake dashboards.
// ============================================================================

import type { BrollAsset } from '../types';

/** Cinematic prompt patterns — abstract only, no readable content */
const PROMPT_PATTERNS: Record<string, string> = {
  hidden_wall:
    'A cinematic abstract visualization of an invisible market wall beneath a financial price line, dark navy institutional finance atmosphere, transparent glass barrier with cyan edge glow, subtle violet volumetric light, slow dolly push, premium fintech intelligence briefing, no readable text, no numbers, no logos, no fake charts, 9:16 vertical',
  pressure_field:
    'Abstract cinematic force field, dark navy atmosphere, purple and cyan energy waves pressing against dark surface, volumetric lighting, institutional premium feel, no text no numbers no logos, 9:16 vertical',
  dark_flow:
    'Abstract dark liquid flowing through invisible channels, deep navy and violet, bioluminescent cyan particles, underwater pressure atmosphere, institutional premium, no text no numbers, 9:16 vertical',
  regime_clock:
    'Abstract dark clock mechanism, gears turning slowly in dark navy void, faint amber and cyan light traces, tension atmosphere, premium institutional, no text no numbers, 9:16 vertical',
  ticker_xray:
    'Abstract x-ray scan effect, dark navy void revealing hidden internal structure layers, cyan scanning light beam, institutional atmosphere, no text no numbers, 9:16 vertical',
  dashboard_reveal:
    'Abstract dark command center atmosphere, faint holographic data streams, premium institutional war room, dark navy lighting, no text no logos, 9:16 vertical',
};

function getApiToken(): string | undefined {
  return process.env.REPLICATE_API_TOKEN || undefined;
}

/** Check if live Replicate API is available */
export function isReplicateAvailable(): boolean {
  const token = getApiToken();
  return !!token && token.length > 10 && !token.includes('\0');
}

/** Generate cinematic B-roll for a given template type */
export async function generateBroll(
  templateType: string,
  customPrompt?: string,
): Promise<BrollAsset> {
  const prompt = customPrompt || PROMPT_PATTERNS[templateType] || PROMPT_PATTERNS['hidden_wall'];

  if (!isReplicateAvailable()) {
    console.log('[Replicate] API token not configured — using procedural background fallback');
    return createMockBrollAsset(prompt);
  }

  // ── Live Replicate API call ──
  // Will use FLUX 2.0 via replicate.run() in MISSION 04
  // Model: black-forest-labs/flux-1.1-pro or flux-dev
  console.log('[Replicate] Live API available but not yet wired for rendering');
  return createMockBrollAsset(prompt);
}

/** Create a mock B-roll asset (uses CinematicBackground procedural component instead) */
function createMockBrollAsset(prompt: string): BrollAsset {
  return {
    url: '', // empty = use CinematicBackground procedural component
    type: 'image',
    provider: 'mock',
    prompt,
    isMock: true,
  };
}

/** Get the default prompt for a template type */
export function getPromptForTemplate(templateType: string): string {
  return PROMPT_PATTERNS[templateType] || PROMPT_PATTERNS['hidden_wall'];
}
