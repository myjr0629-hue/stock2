
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config({ path: ".env.local" });

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("❌ GEMINI_API_KEY missing");
        return;
    }
    const genAI = new GoogleGenerativeAI(key);
    try {
        // Unfortunately the SDK might not expose listModels easily without looking at docs, 
        // but let's try a standard 'gemini-pro' call to see if that works.
        // Actually, let's try to just run a simple prompt with 'gemini-pro'.
        console.log("Testing gemini-pro...");
        const modelPro = genAI.getGenerativeModel({ model: "gemini-pro" });
        const resPro = await modelPro.generateContent("Hello");
        console.log("✅ gemini-pro works:", resPro.response.text());

        console.log("Testing gemini-1.5-flash...");
        const modelFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const resFlash = await modelFlash.generateContent("Hello");
        console.log("✅ gemini-1.5-flash works:", resFlash.response.text());

    } catch (e) {
        console.error("❌ Model Test Failed:", e.message);
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Status Text:", e.response.statusText);
        }
    }
}

listModels();
