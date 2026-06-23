#!/usr/bin/env node
// Pre-bake the read-aloud narration clips with Amazon Polly.
//
// For every level STORY (the `intro:"..."` strings in index.html) this:
//   1. normalizes the text the same way the client does (toSpeech: arrows->"to", ▶->"Play", chord numerals->words, strip emoji),
//   2. keys it by voiceHash (MUST match index.html so the client finds the file),
//   3. synthesizes voice/<key>.mp3 via the AWS CLI — skipping any clip that already exists,
//   4. prunes orphaned clips (voice/*.mp3 whose story no longer exists).
//
// Usage:
//   node tools/gen-voice.mjs --dry          # list what WOULD change (no AWS calls, no cost)
//   node tools/gen-voice.mjs                # generate missing clips + prune orphans
//   node tools/gen-voice.mjs --force        # re-generate every clip (e.g. after changing the voice)
//   node tools/gen-voice.mjs --samples      # synthesize ONE line across candidate voices into voice/samples/ (to compare)
//   POLLY_VOICE=Ruth POLLY_ENGINE=generative node tools/gen-voice.mjs --force   # change the voice
//
// Needs the AWS CLI configured (same creds used for `sam deploy`) with polly:SynthesizeSpeech.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// ---- config ----
const REGION   = "us-east-1";
const ENGINE   = process.env.POLLY_ENGINE || "generative";    // generative = warm + expressive (chosen voice). neural = cheaper/flatter.
const VOICE_ID = process.env.POLLY_VOICE  || "Joanna";        // warm, natural. Swap + re-run --force to change.
const OUT_DIR  = "voice";
const HTML     = "index.html";

const argv = new Set(process.argv.slice(2));
const DRY = argv.has("--dry"), FORCE = argv.has("--force"), SAMPLES = argv.has("--samples");

// ---- keep these IDENTICAL to index.html (toSpeech + voiceHash) ----
const SPEAK_CHORD = {I:"the one chord",II:"the two chord",III:"the three chord",IV:"the four chord",V:"the five chord",VI:"the six chord",VII:"the seven chord"};
const toSpeech = s => (s||"")
  .replace(/\s*(?:->|→|➜|➡|⟶)\s*/g," to ")
  .replace(/▶️?/g," Play ")
  .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu," ")
  .replace(/\b(VII|IV|VI|V|III|II|I)\b/g, m=>SPEAK_CHORD[m])
  .replace(/\b(vii|iv|vi|v|iii|ii)\b/g, m=>SPEAK_CHORD[m.toUpperCase()])
  .replace(/\s+([.,!?;:])/g,"$1").replace(/\s+/g," ").trim();
const voiceHash = s => { let h=5381; for(let i=0;i<s.length;i++) h=((h*33)^s.charCodeAt(i))>>>0; return h.toString(16); };

const synth = (text, out, voice=VOICE_ID, engine=ENGINE) => execFileSync("aws",
  ["polly","synthesize-speech","--region",REGION,"--engine",engine,"--voice-id",voice,
   "--output-format","mp3","--text",text,out], { stdio:["ignore","ignore","pipe"] });

fs.mkdirSync(OUT_DIR, { recursive: true });

// ---- --samples: one line, several candidate voices, to pick from ----
if (SAMPLES) {
  const dir = path.join(OUT_DIR, "samples");
  fs.mkdirSync(dir, { recursive: true });
  const line = toSpeech("The garden found its voice — now wake the band! Press ▶ to start a groove, and tap seeds to play along — every note fits.");
  const cands = [
    ["joanna-neural","Joanna","neural"], ["joanna-generative","Joanna","generative"],
    ["ruth-generative","Ruth","generative"], ["danielle-generative","Danielle","generative"],
    ["matthew-generative","Matthew","generative"], ["ivy-neural","Ivy","neural"],
  ];
  console.log("Sample line:", line);
  for (const [label,voice,engine] of cands) {
    try { synth(line, path.join(dir,label+".mp3"), voice, engine); console.log("  ✓ "+label); }
    catch (e) { console.error("  ✗ "+label+": "+String(e.stderr||e.message).slice(0,120)); }
  }
  console.log("Samples in ./voice/samples/.");
  process.exit(0);
}

// ---- collect the unique narration strings ----
const html = fs.readFileSync(HTML, "utf8");
const intros = [...html.matchAll(/\bintro:"([^"]*)"/g)].map(m => m[1]);
const byKey = new Map();
for (const raw of intros) { const spoken = toSpeech(raw); if (!spoken) continue;
  const key = voiceHash(spoken); if (!byKey.has(key)) byKey.set(key, spoken); }

console.log(`Found ${intros.length} stories → ${byKey.size} unique clips. Voice: ${VOICE_ID}/${ENGINE}.`);
let made = 0, skipped = 0, failed = 0;
for (const [key, spoken] of byKey) {
  const out = path.join(OUT_DIR, key + ".mp3");
  if (!FORCE && fs.existsSync(out)) { skipped++; continue; }
  if (DRY) { console.log(`  would gen ${key}.mp3  ←  ${spoken}`); made++; continue; }
  try { synth(spoken, out); made++; process.stdout.write("."); }
  catch (e) { failed++; console.error(`\n  FAILED ${key}: ${String(e.stderr||e.message||e).slice(0,200)}`); }
}

// ---- prune orphaned clips (a story changed/was removed) ----
let pruned = 0;
for (const f of fs.readdirSync(OUT_DIR)) {
  if (!f.endsWith(".mp3")) continue;
  if (!byKey.has(f.slice(0,-4))) { if (!DRY) fs.unlinkSync(path.join(OUT_DIR,f)); pruned++;
    console.log(`  ${DRY?"would prune":"pruned"} ${f}`); }
}
console.log(`\n${DRY?"[dry] ":""}done — ${made} ${DRY?"to generate":"generated"}, ${skipped} present, ${pruned} pruned${failed?`, ${failed} failed`:""}.`);
