
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config({ path: ".env.local" }); // Try loading .env.local

async function testGemini() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("❌ GEMINI_API_KEY is missing in process.env");
        return;
    }
    console.log("✅ GEMINI_API_KEY found (length: " + key.length + ")");

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello?");
        console.log("✅ API Response:", result.response.text());
    } catch (e) {
        console.error("❌ API Call Failed:", e.message);
    }
}

testGemini();
