#!/usr/bin/env node
// Convert an instrument-sample WAV (16/24-bit PCM, mono or stereo) to a mono 96kbps mp3
// for samples/<instr>/ — VCSL ships quiet 24-bit stereo WAVs, so this downmixes and
// peak-normalizes to 0.9 (the game re-normalizes loudness at decode; this just preserves
// bits through the 16-bit encoding step).
// Requires the lamejs fork (the original 1.2.1 npm package is broken):
//   npm install @breezystack/lamejs        (in any folder; run this script from there)
// Usage: node wav2mp3.mjs <in.wav> <out.mp3>
import fs from "node:fs";
import lamejs from "@breezystack/lamejs";

const [inFile, outFile] = process.argv.slice(2);
const buf = fs.readFileSync(inFile);

// --- parse WAV chunks ---
if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE")
  throw new Error("not a WAV");
let pos = 12, fmt = null, data = null;
while (pos + 8 <= buf.length) {
  const id = buf.toString("ascii", pos, pos + 4);
  const size = buf.readUInt32LE(pos + 4);
  if (id === "fmt ") fmt = { pos: pos + 8, size };
  if (id === "data") data = { pos: pos + 8, size };
  pos += 8 + size + (size % 2);
}
if (!fmt || !data) throw new Error("missing fmt/data chunk");
const format = buf.readUInt16LE(fmt.pos);
const channels = buf.readUInt16LE(fmt.pos + 2);
const rate = buf.readUInt32LE(fmt.pos + 4);
const bits = buf.readUInt16LE(fmt.pos + 14);
if (format !== 1 || (bits !== 16 && bits !== 24)) throw new Error(`unsupported: fmt ${format}, ${bits}-bit`);

// --- decode to mono float ---
const bytesPer = bits / 8, frameBytes = bytesPer * channels;
const frames = Math.floor(data.size / frameBytes);
const mono = new Float64Array(frames);
for (let i = 0; i < frames; i++) {
  let sum = 0;
  for (let ch = 0; ch < channels; ch++) {
    const off = data.pos + i * frameBytes + ch * bytesPer;
    let v;
    if (bits === 16) v = buf.readInt16LE(off) / 32768;
    else v = (buf.readUInt8(off) | (buf.readUInt8(off + 1) << 8) | (buf.readInt8(off + 2) << 16)) / 8388608;
    sum += v;
  }
  mono[i] = sum / channels;
}

// --- peak-normalize to 0.9 ---
let peak = 0;
for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(mono[i]));
const scale = peak > 0 ? 0.9 / peak : 1;
const pcm = new Int16Array(frames);
for (let i = 0; i < frames; i++)
  pcm[i] = Math.max(-32768, Math.min(32767, Math.round(mono[i] * scale * 32767)));

// --- encode ---
const enc = new lamejs.Mp3Encoder(1, rate, 96);
const chunks = [];
for (let i = 0; i < pcm.length; i += 1152) {
  const out = enc.encodeBuffer(pcm.subarray(i, i + 1152));
  if (out.length) chunks.push(Buffer.from(out));
}
const tail = enc.flush();
if (tail.length) chunks.push(Buffer.from(tail));
fs.writeFileSync(outFile, Buffer.concat(chunks));
console.log(`${outFile}: ${frames} frames @${rate}Hz ${bits}-bit ch${channels} -> ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB (src peak ${peak.toFixed(3)})`);
