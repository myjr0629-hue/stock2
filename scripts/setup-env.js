
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const content = "GEMINI_API_KEY=AIzaSyBxV2cXGtEymBombomRqv3jNPxyo1rvYOA\n";

try {
    fs.writeFileSync(envPath, content, { encoding: 'utf8' });
    console.log("✅ Successfully wrote .env.local with UTF-8 encoding.");
} catch (e) {
    console.error("❌ Failed to write .env.local:", e);
}
