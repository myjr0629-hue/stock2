const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = require('ffmpeg-static');
const videoPath = 'out/market_pressure_brief_v33_frame0_event_shock.mp4';
const outputPath = 'out/review/v33_contact_sheet.jpg';

// Ensure output directory exists
const outDir = 'out/review';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating real 5x3 tiled contact sheet image via FFmpeg-static for V33...');

try {
  // Use select filter to grab 15 exact frames at 30fps:
  // 0.0s=0, 0.1s=3, 0.3s=9, 0.5s=15, 0.8s=24, 1.2s=36, 1.8s=54, 2.5s=75, 3.5s=105, 5.0s=150, 7.5s=225, 10.0s=300, 13.5s=405, 16.5s=495, final=554
  const selectExpr = "select='eq(n,0)+eq(n,3)+eq(n,9)+eq(n,15)+eq(n,24)+eq(n,36)+eq(n,54)+eq(n,75)+eq(n,105)+eq(n,150)+eq(n,225)+eq(n,300)+eq(n,405)+eq(n,495)+eq(n,554)',scale=270:480,tile=5x3";
  
  cp.execSync(`"${ffmpeg}" -y -i "${videoPath}" -vf "${selectExpr}" -frames:v 1 "${outputPath}"`, { stdio: 'inherit' });
  console.log('Successfully created real tiled contact sheet at:', outputPath);
} catch (e) {
  console.error('Failed to create tiled contact sheet:', e);
  process.exit(1);
}

// Generate companion HTML sheet
const frames = [
  { time: '0.0s (f0)', frameIdx: 0, label: 'v33_frame_000.jpg', name: 'Frame 0 Event Shock (Aggressive $420M, SPY 592.31, Call Wall, Bracket, Vol, Flow Particles)' },
  { time: '0.1s (f3)', frameIdx: 3, label: 'v33_frame_003.jpg', name: 'Premium Flow - Bloomberg-style alert active, no loading state' },
  { time: '0.3s (f9)', frameIdx: 9, label: 'v33_frame_009.jpg', name: 'Permanent Payload - Near SPY\'s $600 Wall hero lower box active' },
  { time: '0.5s (f15)', frameIdx: 15, label: 'v33_frame_015.jpg', name: 'Event Validation - Flow exposed state persistent' },
  { time: '0.8s (f24)', frameIdx: 24, label: 'v33_frame_024.jpg', name: 'Early Wall Highlight Transition' },
  { time: '1.2s (f36)', frameIdx: 36, label: 'v33_frame_036.jpg', name: 'Price Path Progression - Directional flowing packets' },
  { time: '1.8s (f54)', frameIdx: 54, label: 'v33_frame_054.jpg', name: 'Normal Charts Show Price - Scanner sweep active' },
  { time: '2.5s (f75)', frameIdx: 75, label: 'v33_frame_075.jpg', name: 'NOT THE WALL Contrast - Shock Reveal of gap' },
  { time: '3.5s (f105)', frameIdx: 105, label: 'v33_frame_105.jpg', name: 'Tension Sequence - Gap 1.3% Bracket Lock (Decelerating flow particles in gap)' },
  { time: '5.0s (f150)', frameIdx: 150, label: 'v33_frame_150.jpg', name: 'THIS IS WHERE PRESSURE CAN BUILD - Compression Tension' },
  { time: '7.5s (f225)', frameIdx: 225, label: 'v33_frame_225.jpg', name: 'Product Unlock - Scanner Sweep fully unmasks structures' },
  { time: '10.0s (f300)', frameIdx: 300, label: 'v33_frame_300.jpg', name: 'Structure Behind Price - Full unmasked layers active' },
  { time: '13.5s (f405)', frameIdx: 405, label: 'v33_frame_405.jpg', name: 'Physical Tension Layout persistent prior to CTA' },
  { time: '16.5s (f495)', frameIdx: 495, label: 'v33_frame_495.jpg', name: 'Final CTA - See The Structure Behind Price conversion, no ghosts' },
  { time: 'final (f554)', frameIdx: 554, label: 'v33_frame_final.jpg', name: 'Silver Outro Loop Cue - Faint Wall + Faint Scan Line, No $420M Ghost' }
];

let html = `<html>
<head>
  <title>V33 Frame-0 Event Shock Fix - Contact Sheet</title>
  <style>
    body { background: #020409; color: #e2e8f0; font-family: 'Outfit', sans-serif; text-align: center; padding: 40px; margin: 0; }
    h1 { font-size: 32px; color: #22d3ee; margin-bottom: 8px; font-weight: 900; letter-spacing: 0.05em; }
    p { color: #94a3b8; font-size: 16px; margin-bottom: 40px; }
    .grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; max-width: 1600px; margin: 0 auto; }
    .card { background: rgba(34, 211, 238, 0.03); border: 1px solid rgba(34, 211, 238, 0.12); padding: 16px; border-radius: 12px; transition: all 0.3s ease; width: 270px; }
    .card:hover { border-color: #22d3ee; box-shadow: 0 0 20px rgba(34,211,238,0.2); }
    img { border-radius: 6px; border: 1px solid #1e293b; display: block; margin-bottom: 12px; }
    .time { font-family: monospace; font-size: 14px; color: #fbbf24; font-weight: bold; }
    .label { font-size: 13px; color: #94a3b8; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>MARKET PRESSURE BRIEF V33</h1>
  <p>Frame-0 Event Shock Fix - Visual Storyboard Review</p>
  <div class="grid">
`;

// Extract individual stills to display on the HTML page and output files
frames.forEach((f) => {
  const stillPath = path.join(outDir, f.label);
  try {
    cp.execSync(`"${ffmpeg}" -y -i "${videoPath}" -vf "select=eq(n\\,${f.frameIdx}),scale=270:480" -frames:v 1 "${stillPath}"`, { stdio: 'ignore' });
  } catch (e) {
    console.error(`Failed to export still for ${f.label}:`, e);
  }

  html += `
    <div class="card">
      <img src="${f.label}" width="270" height="480" />
      <div class="time">${f.time}</div>
      <div class="label">${f.name}</div>
    </div>
  `;
});

html += `
  </div>
  <div style="margin-top: 50px; font-size: 14px; color: #64748b;">
    Generated programmatically via SignumHQ Shorts Engine - Mission 40 V33
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, 'v33_contact_sheet.html'), html);
console.log('Successfully created out/review/v33_contact_sheet.html and extracted all storyboard stills!');
