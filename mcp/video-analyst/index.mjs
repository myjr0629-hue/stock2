#!/usr/bin/env node
// ============================================================================
// video-analyst — MCP server that lets the agent WATCH a reference short.
//
// Claude cannot see video. Gemini can, and it takes a YouTube URL directly (no
// download, no frame extraction): the API accepts a `file_data.file_uri` and
// answers questions about the picture, the on-screen text and the audio, with
// MM:SS timestamps. This server is the thin bridge.
//
// Written in-house rather than pulling one of the community YouTube-vision MCP
// servers: the surface is ~200 lines, and this repo holds live app credentials —
// not worth a third-party dependency in the loop for that.
//
// Two tools, deliberately:
//   · analyze_video     — ask anything about a reference (free-form)
//   · extract_motion_spec — the money tool: returns STRICT JSON shaped like a
//                           Remotion composition, so a reference can be walked
//                           straight into scenes/ without a human retyping
//                           timings by hand. Retyping is exactly where the
//                           numbers that matter (0.15s delays, easing curves)
//                           get lost.
//
// Key: GEMINI_API_KEY, read from `.env` beside this file (gitignored) or the
// environment. Never passed through chat or committed.
// ============================================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Read GEMINI_API_KEY from the environment, falling back to a local .env. */
function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  try {
    const line = readFileSync(join(HERE, '.env'), 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('GEMINI_API_KEY='));
    return (line?.split('=').slice(1).join('=') || '').trim();
  } catch {
    return '';
  }
}

// 2.5 Flash: fast, cheap, and the first tier that accepts up to 10 videos per
// request. Overridable per call when a reference needs the stronger model.
const DEFAULT_MODEL = 'gemini-2.5-flash';

async function askGemini({ url, prompt, model = DEFAULT_MODEL, json = false }) {
  const key = apiKey();
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY is not set. Paste the key into mcp/video-analyst/.env ' +
        '(copy .env.example) — get one at https://aistudio.google.com/apikey',
    );
  }

  const body = {
    contents: [
      {
        parts: [
          { file_data: { file_uri: url } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: json
      ? { responseMimeType: 'application/json', temperature: 0.2 }
      : { temperature: 0.3 },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    },
  );

  const raw = await res.text();
  if (!res.ok) {
    // Surface Google's own message — its 400s say exactly what is wrong
    // (private video, quota, unsupported model) and guessing wastes a turn.
    throw new Error(`Gemini ${res.status}: ${raw.slice(0, 600)}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 300)}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    throw new Error(`Gemini returned no text${reason ? ` (${reason})` : ''}.`);
  }
  return text;
}

// The spec prompt is the actual product here. It asks for the numbers a
// Remotion composition needs — not a description a human would write.
const MOTION_SPEC_PROMPT = `You are reverse-engineering this short-form video so it can be REBUILT in Remotion (React, 30fps, 1080x1920).

Return ONLY JSON matching this shape:

{
  "summary": "one sentence: what this video is and who it is for",
  "durationSec": number,
  "fps": number,
  "aspect": "9:16" | "1:1" | "16:9",
  "production": {
    "method": "code-rendered | video-editor | ai-generated | live-footage | mixed",
    "evidence": "what in the picture tells you this — pixel-snapping, easing feel, template repetition, camera noise, etc.",
    "liveFootage": boolean,
    "voiceover": "none | human | tts",
    "musicBed": boolean
  },
  "palette": { "background": "#hex", "primaryText": "#hex", "accent": "#hex", "positive": "#hex", "negative": "#hex" },
  "typography": { "family": "closest common font", "headlineWeight": number, "headlineSizePx": number, "bodySizePx": number, "letterSpacing": "e.g. -0.02em", "case": "upper | sentence | mixed" },
  "hook": {
    "firstFrameDescription": "exactly what is on screen at 00:00",
    "textOnScreenSec": number,
    "hookLine": "the literal text/words used to stop the scroll",
    "whyItWorks": "the mechanism, not praise"
  },
  "scenes": [
    {
      "index": number,
      "startSec": number,
      "endSec": number,
      "role": "hook | context | data | insight | proof | cta",
      "onScreenText": "verbatim, including numbers",
      "visual": "what is shown",
      "motion": "how it enters/leaves: slide-up, fade, scale, counter, wipe, cut",
      "easing": "linear | ease-out | spring | snap",
      "notes": "anything a rebuilder must match"
    }
  ],
  "dataViz": { "present": boolean, "kinds": ["counter","bar","line","candle","gauge"], "howAnimated": "description" },
  "captions": { "present": boolean, "style": "karaoke-word | line-by-line | static-block", "positionPct": number, "burnedIn": boolean },
  "cta": { "present": boolean, "text": "verbatim", "atSec": number, "type": "follow | link | app-install | comment | none" },
  "rebuildNotes": ["concrete, ordered steps to reproduce this in Remotion"],
  "riskFlags": ["anything that would break financial-content compliance if copied: predictive claims, guaranteed returns, unlicensed advice"]
}

Rules:
- Use MM:SS reasoning internally but output SECONDS as numbers.
- Every scene must have real start/end times that tile the whole duration.
- Quote on-screen text VERBATIM in its original language.
- If something is not determinable, use null. Never invent a number.`;

const server = new Server(
  { name: 'video-analyst', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'extract_motion_spec',
      description:
        'Watch a reference short-form video (YouTube URL) and return a STRICT JSON motion spec ' +
        'sized for rebuilding it in Remotion: per-scene start/end seconds, verbatim on-screen text, ' +
        'motion and easing per element, palette, typography, hook mechanism, CTA, and compliance risk ' +
        'flags. Use this when the goal is to reproduce or adapt the reference.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Public YouTube URL (Shorts or normal). Private/unlisted will fail.' },
          model: { type: 'string', description: `Gemini model. Default ${DEFAULT_MODEL}; use gemini-2.5-pro for dense references.` },
        },
        required: ['url'],
      },
    },
    {
      name: 'analyze_video',
      description:
        'Ask a free-form question about a public YouTube video — picture, on-screen text, audio, pacing. ' +
        'Supports MM:SS timestamps in the question ("what is on screen at 00:03?"). Use for follow-ups ' +
        'after extract_motion_spec, or when the question is not about rebuilding.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Public YouTube URL.' },
          question: { type: 'string', description: 'What to ask about the video.' },
          model: { type: 'string', description: `Gemini model. Default ${DEFAULT_MODEL}.` },
        },
        required: ['url', 'question'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    if (name === 'extract_motion_spec') {
      const text = await askGemini({
        url: args.url,
        prompt: MOTION_SPEC_PROMPT,
        model: args.model,
        json: true,
      });
      return { content: [{ type: 'text', text }] };
    }
    if (name === 'analyze_video') {
      const text = await askGemini({
        url: args.url,
        prompt: args.question,
        model: args.model,
      });
      return { content: [{ type: 'text', text }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return { content: [{ type: 'text', text: `ERROR: ${err.message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
