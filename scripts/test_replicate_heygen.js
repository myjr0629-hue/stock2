const Replicate = require("replicate");
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

async function run() {
  console.log("Starting Replicate test...");
  try {
    const output = await replicate.run(
      "heygen/video-agent:latest", // Will likely fail if version is needed or model name is slightly different
      {
        input: {
          prompt: "Hello, this is a test from Signum HQ. We are testing the cinematic video generation capabilities.",
          // Need to provide the right inputs. If we don't know the schema, we'll get an error, which tells us the schema.
        }
      }
    );
    console.log("Success:", output);
  } catch (err) {
    console.error("Error calling Replicate:", err.message);
  }
}

run();
