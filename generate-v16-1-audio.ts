// ============================================================================
// V16.1 Audio Generator — ElevenLabs API Truth Pass
// Uses correct Voice ID: pNInz6obpgDQGcFmaJgB (Adam)
// Model: eleven_flash_v2_5 (best latency) or eleven_v3 (best quality)
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam — confirmed correct ID

if (!API_KEY) {
  console.error('❌ ELEVENLABS_API_KEY environment variable is NOT set.');
  console.error('Set it with: $env:ELEVENLABS_API_KEY="your-key-here"');
  
  // Write failure report
  const failureReport = `# ElevenLabs API Failure Report

## Status: API KEY NOT CONFIGURED

1. **Endpoint attempted**: POST https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB
2. **Status code**: N/A (not attempted — no API key)
3. **Error message**: ELEVENLABS_API_KEY environment variable is not set
4. **API key present**: NO
5. **Voice ID present**: YES (pNInz6obpgDQGcFmaJgB — Adam)
6. **Fix recommendation**: Set ELEVENLABS_API_KEY environment variable before running this script

Previous V15 failure cause: Wrong Voice ID was used (pNInz6obbfIdGrmLzTly instead of pNInz6obpgDQGcFmaJgB).
`;
  
  fs.mkdirSync(path.join(__dirname, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, 'docs', 'SIGNUMHQ_SHORTS_ENGINE_MISSION_20_ELEVENLABS_FAILURE.md'),
    failureReport
  );
  console.log('📄 Failure report written to docs/SIGNUMHQ_SHORTS_ENGINE_MISSION_20_ELEVENLABS_FAILURE.md');
  process.exit(1);
}

console.log('✅ API key found (length:', API_KEY.length, ')');
console.log('✅ Voice ID:', VOICE_ID, '(Adam — confirmed)');

const text = "SPY is one point three percent below a hidden call wall. Most charts miss this layer. Pressure can build here. Not a prediction. A pressure map. SignumHQ shows the structure behind price.";

const outputDir = path.join(__dirname, 'public', 'shorts', 'audio');
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'v16_1_voice.mp3');

const body = JSON.stringify({
  text,
  model_id: 'eleven_flash_v2_5',
  voice_settings: {
    stability: 0.65,
    similarity_boost: 0.75,
    style: 0.15,
    use_speaker_boost: true
  }
});

console.log('🎙️  Calling ElevenLabs API...');
console.log('   Endpoint: POST /v1/text-to-speech/' + VOICE_ID);
console.log('   Model: eleven_flash_v2_5');
console.log('   Script:', text.substring(0, 60) + '...');

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
  console.log('   Response status:', res.statusCode);
  
  if (res.statusCode !== 200) {
    let errorBody = '';
    res.on('data', (chunk) => { errorBody += chunk.toString(); });
    res.on('end', () => {
      console.error('❌ ElevenLabs API failed with status', res.statusCode);
      console.error('   Response:', errorBody.substring(0, 500));
      
      const failureReport = `# ElevenLabs API Failure Report

## Status: API CALL FAILED

1. **Endpoint attempted**: POST https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}
2. **Status code**: ${res.statusCode}
3. **Error message**: ${errorBody.substring(0, 300)}
4. **API key present**: YES (length: ${API_KEY.length})
5. **Voice ID present**: YES (${VOICE_ID} — Adam)
6. **Fix recommendation**: ${
  res.statusCode === 401 ? 'API key is invalid or expired. Generate a new one at elevenlabs.io/app/settings' :
  res.statusCode === 404 ? 'Voice ID not found. Try listing voices at GET /v1/voices to find correct ID' :
  res.statusCode === 429 ? 'Rate limited. Wait and retry, or upgrade ElevenLabs plan' :
  'Check ElevenLabs status page and API documentation'
}
`;
      fs.mkdirSync(path.join(__dirname, 'docs'), { recursive: true });
      fs.writeFileSync(
        path.join(__dirname, 'docs', 'SIGNUMHQ_SHORTS_ENGINE_MISSION_20_ELEVENLABS_FAILURE.md'),
        failureReport
      );
      console.log('📄 Failure report written.');
      process.exit(1);
    });
    return;
  }
  
  // Success — write audio file
  const fileStream = fs.createWriteStream(outputPath);
  let totalBytes = 0;
  
  res.on('data', (chunk) => {
    totalBytes += chunk.length;
  });
  
  res.pipe(fileStream);
  
  fileStream.on('finish', () => {
    console.log('✅ Audio generated successfully!');
    console.log('   Output:', outputPath);
    console.log('   Size:', (totalBytes / 1024).toFixed(1), 'KB');
    
    // Write voice timing estimate
    const timingJson = {
      generated: new Date().toISOString(),
      voiceId: VOICE_ID,
      voiceName: 'Adam',
      model: 'eleven_flash_v2_5',
      script: text,
      filePath: 'public/shorts/audio/v16_1_voice.mp3',
      fileSizeBytes: totalBytes,
      phrases: [
        { phrase: "SPY is one point three percent below a hidden call wall.", startSec: 0.0, endSec: 3.8, targetBeat: "Hard Data Hook (0.0-2.2s)", timing: "estimated" },
        { phrase: "Most charts miss this layer.", startSec: 4.0, endSec: 5.8, targetBeat: "Missing Layer FOMO (2.2-4.2s)", timing: "estimated" },
        { phrase: "Pressure can build here.", startSec: 6.0, endSec: 7.6, targetBeat: "Pressure Build (4.2-7.0s)", timing: "estimated" },
        { phrase: "Not a prediction.", startSec: 7.8, endSec: 9.0, targetBeat: "Pressure Map (7.0-10.2s)", timing: "estimated" },
        { phrase: "A pressure map.", startSec: 9.2, endSec: 10.5, targetBeat: "Pressure Map (7.0-10.2s)", timing: "estimated" },
        { phrase: "SignumHQ shows the structure behind price.", startSec: 10.8, endSec: 13.5, targetBeat: "Product Promise (15.0-18.0s)", timing: "estimated" },
      ],
      note: "Timing values are estimates based on typical speech cadence. Actual timing depends on ElevenLabs output. Manual verification recommended."
    };
    
    const reviewDir = path.join(__dirname, 'out', 'review');
    fs.mkdirSync(reviewDir, { recursive: true });
    fs.writeFileSync(
      path.join(reviewDir, 'v16_1_voice_timing.json'),
      JSON.stringify(timingJson, null, 2)
    );
    console.log('📄 Voice timing JSON written to out/review/v16_1_voice_timing.json');
  });
});

req.on('error', (e) => {
  console.error('❌ Network error:', e.message);
  
  const failureReport = `# ElevenLabs API Failure Report

## Status: NETWORK ERROR

1. **Endpoint attempted**: POST https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}
2. **Status code**: N/A (network error)
3. **Error message**: ${e.message}
4. **API key present**: YES (length: ${API_KEY.length})
5. **Voice ID present**: YES (${VOICE_ID} — Adam)
6. **Fix recommendation**: Check network connectivity and DNS resolution for api.elevenlabs.io
`;
  fs.mkdirSync(path.join(__dirname, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, 'docs', 'SIGNUMHQ_SHORTS_ENGINE_MISSION_20_ELEVENLABS_FAILURE.md'),
    failureReport
  );
  process.exit(1);
});

req.write(body);
req.end();
