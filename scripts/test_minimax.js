const Replicate = require("replicate");
const fs = require("fs");
const { pipeline } = require("stream/promises");

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

async function run() {
  console.log("Fetching previous prediction or generating new one...");
  try {
    // Instead of re-running the 2 minute task, let's just list the most recent prediction
    const predictions = await replicate.predictions.list();
    const latest = predictions.results[0];
    
    console.log("Latest prediction status:", latest.status);
    console.log("Output:", latest.output);
    
    // If output is an array of URLs or a URL string:
    if (latest.output) {
      console.log("Video URL:", latest.output);
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
