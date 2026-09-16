
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const key = (process.env.GEMINI_API_KEY || '').trim();
if (!key) { console.error('GEMINI_API_KEY must be provided via the environment — it is never hardcoded (rotated 2026-09-16)'); process.exit(1); }
const content = "GEMINI_API_KEY=" + key + "\n";

try {
    fs.writeFileSync(envPath, content, { encoding: 'utf8' });
    console.log("✅ Successfully wrote .env.local with UTF-8 encoding.");
} catch (e) {
    console.error("❌ Failed to write .env.local:", e);
}
