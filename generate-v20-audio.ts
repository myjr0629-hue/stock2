// V20 Audio Generator — Institutional Footprint Cut
// Voice: Adam (pNInz6obpgDQGcFmaJgB) - calm, institutional
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam
const API_KEY = process.env.ELEVENLABS_API_KEY || 'b3451158cdb18eadbb505d7e0cc9a45996970a5fcde79f0c52c47a1422c1f9b8';

// Strict script. Using formatting to force a calm, measured pace.
const script = `SPY is one point three percent... from a hidden wall.

Dark pool flow is clustering nearby.

Most charts do not show this.

Pressure may build near that level.

Not a prediction. A pressure map.

See the structure behind price.`;

async function generateVoice() {
  console.log('[V20 Audio] Generating voice with ElevenLabs...');
  console.log('[V20 Audio] Script:', script);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: 0.75, // slightly more stable/institutional
        similarity_boost: 0.85,
        style: 0.05, // low hype
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[V20 Audio] API Error:', response.status, errText);
    process.exit(1);
  }

  const outDir = path.join('public', 'shorts', 'audio');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'v20_voice.mp3');
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);

  console.log('[V20 Audio] ✅ Written:', outPath, `(${(buffer.length / 1024).toFixed(1)} KB)`);
}

generateVoice().catch(err => {
  console.error('[V20 Audio] Failed:', err);
  process.exit(1);
});
