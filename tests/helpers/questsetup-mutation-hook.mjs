// Used only by the mutation audits (../questsetup-mutations.mjs, ../famous-meter-mutations.mjs).
// Mutate the game's scripts in the harness's memory; never write index.html or a script file,
// monkey-patch fs, or alter the ordinary test invocation. Each anchor must occur exactly once across
// ALL of the game's scripts, and is patched in the file that holds it (applyPatches).
import { registerHooks } from "node:module";

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith("/tests/harness.mjs")) return result;
    const source = String(result.source);
    const needle = "const scripts = loaded;";
    if (source.split(needle).length !== 2) throw new Error("Harness source extraction changed; update the audit hook");
    const replacement =
      'const scripts = applyPatches(loaded, JSON.parse(process.env.QUEST_SETUP_MUTATIONS || "[]"));';
    return { ...result, source: source.replace(needle, replacement) };
  },
});

// Load once outside any test. A mutation that prevents initialization must fail the audit as
// an invalid experiment, never be credited as the selected test detecting a behavioral fault.
const { loadGame } = await import("../harness.mjs");
loadGame({ fresh: true });
