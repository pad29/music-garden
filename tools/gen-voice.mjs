#!/usr/bin/env node
// Pre-bake the read-aloud narration clips with Amazon Polly (neural).
//
// For every level STORY (the `intro:"..."` strings in index.html) this:
//   1. normalizes the text the same way the client does (toSpeech: arrows->"to", chord numerals->words, strip emoji),
//   2. keys it by voiceHash (MUST match index.html so the client finds the file),
//   3. synthesizes voice/<key>.mp3 via the AWS CLI — skipping any clip that already exists.
//
// Usage:
//   node tools/gen-voice.mjs --dry     # list what WOULD be generated (no AWS calls, no cost)
//   node tools/gen-voice.mjs           # generate the missing clips (calls Amazon Polly)
//   node tools/gen-voice.mjs --force   # re-generate everything (overwrite)
//
// Needs the AWS CLI configured (same creds used for `sam deploy`) with polly:SynthesizeSpeech.
// Cost is tiny: ~170 short strings ≈ 25K chars ≈ $0.0004 on neural Polly.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// ---- config ----
const REGION  = "us-east-1";
const ENGINE  = "neural";
const VOICE_ID = process.env.POLLY_VOICE || "Joanna";   // warm, natural. Swap (e.g. Ruth, Danielle, Matthew) + re-run to change the voice.
const OUT_DIR = "voice";
const HTML    = "index.html";

const argv = new Set(process.argv.slice(2));
const DRY = argv.has("--dry");
const FORCE = argv.has("--force");

// ---- keep these IDENTICAL to index.html (toSpeech + voiceHash) ----
const SPEAK_CHORD = {I:"the one chord",II:"the two chord",III:"the three chord",IV:"the four chord",V:"the five chord",VI:"the six chord",VII:"the seven chord"};
const toSpeech = s => (s||"")
  .replace(/\s*(?:->|→|➜|➡|⟶)\s*/g," to ")
  .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu," ")
  .replace(/\b(VII|IV|VI|V|III|II|I)\b/g, m=>SPEAK_CHORD[m])
  .replace(/\b(vii|iv|vi|v|iii|ii)\b/g, m=>SPEAK_CHORD[m.toUpperCase()])
  .replace(/\s+([.,!?;:])/g,"$1").replace(/\s+/g," ").trim();
const voiceHash = s => { let h=5381; for(let i=0;i<s.length;i++) h=((h*33)^s.charCodeAt(i))>>>0; return h.toString(16); };

// ---- collect the unique narration strings ----
const html = fs.readFileSync(HTML, "utf8");
const intros = [...html.matchAll(/\bintro:"([^"]*)"/g)].map(m => m[1]);
const byKey = new Map();   // key -> spoken text (dedup; identical stories share one clip)
for (const raw of intros) {
  const spoken = toSpeech(raw);
  if (!spoken) continue;
  const key = voiceHash(spoken);
  if (!byKey.has(key)) byKey.set(key, spoken);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log(`Found ${intros.length} stories → ${byKey.size} unique clips. Voice: ${VOICE_ID}/${ENGINE}.`);

let made = 0, skipped = 0, failed = 0;
for (const [key, spoken] of byKey) {
  const out = path.join(OUT_DIR, key + ".mp3");
  if (!FORCE && fs.existsSync(out)) { skipped++; continue; }
  if (DRY) { console.log(`  would gen ${key}.mp3  ←  ${spoken}`); made++; continue; }
  try {
    execFileSync("aws", ["polly","synthesize-speech",
      "--region", REGION, "--engine", ENGINE, "--voice-id", VOICE_ID,
      "--output-format", "mp3", "--text", spoken, out],
      { stdio: ["ignore","ignore","pipe"] });
    made++; process.stdout.write(".");
  } catch (e) {
    failed++; console.error(`\n  FAILED ${key}: ${String(e.stderr||e.message||e).slice(0,200)}`);
  }
}
console.log(`\n${DRY?"[dry] ":""}done — ${made} ${DRY?"to generate":"generated"}, ${skipped} already present${failed?`, ${failed} failed`:""}.`);
if (!DRY && made && !failed) console.log(`Clips in ./${OUT_DIR}/. Commit them; netlify.toml publishes them to /voice/.`);
