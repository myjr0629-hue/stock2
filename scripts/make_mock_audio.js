const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'public', 'shorts', 'audio');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const mockMP3 = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // Fake empty mp3

const files = ['v6_voice.mp3', 'bed.mp3', 'scan.mp3', 'lock.mp3', 'hum.mp3', 'tick.mp3', 'layer.mp3', 'lowpass.mp3', 'click.mp3', 'reveal.mp3', 'brand.mp3', 'pulse.mp3', 'impact.mp3'];

files.forEach(f => {
  fs.writeFileSync(path.join(dir, f), mockMP3);
});
console.log('Mock audio files created');
