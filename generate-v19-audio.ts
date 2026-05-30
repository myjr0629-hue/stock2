// V19 Audio Generator — True Upload Candidate Voice
// Voice: Adam (pNInz6obpgDQGcFmaJgB)
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam
const API_KEY = process.env.ELEVENLABS_API_KEY || 'b3451158cdb18eadbb505d7e0cc9a45996970a5fcde79f0c52c47a1422c1f9b8';

// Using punctuation to control ElevenLabs pacing exactly.
// Total expected duration is around 16-17s. We will pad the rest with sonic bed in Remotion.
const script = `SPY is one point three percent... from a wall most charts miss.

A wall you can't see.

Pressure can build here.

Not a prediction. A pressure map.

Normal chart: price only.
SignumHQ: structure layer.

Wall.
Floor.
Flip.

See the structure behind price.`;

async function generateVoice() {
  console.log('[V19 Audio] Generating voice with ElevenLabs...');
  console.log('[V19 Audio] Script:', script);

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
        stability: 0.70,
        similarity_boost: 0.85,
        style: 0.15,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[V19 Audio] API Error:', response.status, errText);
    process.exit(1);
  }

  const outDir = path.join('public', 'shorts', 'audio');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'v19_voice.mp3');
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);

  console.log('[V19 Audio] ✅ Written:', outPath, `(${(buffer.length / 1024).toFixed(1)} KB)`);
}

generateVoice().catch(err => {
  console.error('[V19 Audio] Failed:', err);
  process.exit(1);
});
