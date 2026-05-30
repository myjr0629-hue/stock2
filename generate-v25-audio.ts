import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam (Premium deep voice)
const API_KEY = process.env.ELEVENLABS_API_KEY || 'b3451158cdb18eadbb505d7e0cc9a45996970a5fcde79f0c52c47a1422c1f9b8';

// Perfect 28-second narrative. Commas/hyphens designed to keep voice continuous.
// High suspense, dramatic US quant trader jargon.
const script = `Market makers want you to ignore this, but look at this wall, four hundred twenty million off-exchange, near the SPY wall, normal charts show price, SignumHQ shows structure, the gap is shrinking, only one point three percent left, when it hits, the options gamma will implode, is the wall breaking right now, we track this live, go to SignumHQ dot com, see the next move before they lock it, look at this wall.`;

async function generateVoice() {
  console.log('[V25 Audio] Generating premium US 28-second voice with ElevenLabs...');
  console.log('[V25 Audio] Script:', script);

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
        stability: 0.62,
        similarity_boost: 0.85,
        style: 0.45,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[V25 Audio] API Error:', response.status, errText);
    process.exit(1);
  }

  const outDir = path.join('public', 'shorts', 'audio');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'v25_voice.mp3');
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);

  console.log('[V25 Audio] Successfully saved ElevenLabs mp3:', outPath, `(${(buffer.length / 1024).toFixed(1)} KB)`);
}

generateVoice().catch(err => {
  console.error('[V25 Audio] Failed:', err);
  process.exit(1);
});
