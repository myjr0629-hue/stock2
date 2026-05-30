import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load Next.js .env.local
dotenv.config({ path: '.env.local' });

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam (Premium deep voice)
const API_KEY = process.env.ELEVENLABS_API_KEY || 'b3451158cdb18eadbb505d7e0cc9a45996970a5fcde79f0c52c47a1422c1f9b8';

// Phrase-perfect 18.5s script. Slashes/commas represent subtle pacing cues.
const script = `Four hundred twenty million off-exchange flow just printed near SPY's six hundred wall. Most charts show price. They do not show this layer. When price moves near a wall, pressure can build fast. This is not a prediction. It is a pressure map. SignumHQ shows the structure behind price. See the hidden layer at SignumHQ.`;

async function generateVoice() {
  console.log('[V26 Audio] Generating premium institutional voice with ElevenLabs...');
  console.log('[V26 Audio] Script:', script);

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
    console.error('[V26 Audio] API Error:', response.status, errText);
    process.exit(1);
  }

  const outDir = path.join('public', 'shorts', 'audio');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'v26_voice.mp3');
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);

  console.log('[V26 Audio] Successfully saved ElevenLabs mp3:', outPath, `(${(buffer.length / 1024).toFixed(1)} KB)`);
}

generateVoice().catch(err => {
  console.error('[V26 Audio] Failed:', err);
  process.exit(1);
});
