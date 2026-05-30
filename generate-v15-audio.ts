import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const API_KEY = process.env.ELEVENLABS_API_KEY || 'b3451158cdb18eadbb505d7e0cc9a45996970a5fcde79f0c52c47a1422c1f9b8';
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obbfIdGrmLzTly'; // Adam

if (!API_KEY) {
  console.error("ELEVENLABS_API_KEY is not set.");
  process.exit(1);
}

const text = "SPY looks normal. But the wall is only one point three percent away. Most charts miss this layer. Pressure can build here. Not a prediction. A pressure map. SignumHQ shows the structure behind price.";

const req = https.request({
  hostname: 'api.elevenlabs.io',
  path: `/v1/text-to-speech/${VOICE_ID}`,
  method: 'POST',
  headers: {
    'Accept': 'audio/mpeg',
    'xi-api-key': API_KEY,
    'Content-Type': 'application/json'
  }
}, (res) => {
  if (res.statusCode !== 200) {
    console.error(`Failed with status ${res.statusCode}`);
    process.exit(1);
  }
  
  const dest = path.join(__dirname, 'public', 'audio', 'v15_voiceover.mp3');
  const fileStream = fs.createWriteStream(dest);
  res.pipe(fileStream);
  
  fileStream.on('finish', () => {
    console.log("Audio generated successfully at", dest);
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.write(JSON.stringify({
  text,
  model_id: "eleven_monolingual_v1",
  voice_settings: {
    stability: 0.6,
    similarity_boost: 0.8
  }
}));

req.end();
