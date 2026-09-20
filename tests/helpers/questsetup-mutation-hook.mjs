// Used only by ../questsetup-mutations.mjs. Mutate the script string in the harness's memory;
// never write index.html, monkey-patch fs, or alter the ordinary test invocation.
import { registerHooks } from "node:module";

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith("/tests/harness.mjs")) return result;
    const source = String(result.source);
    const needle = "const src = match[1];";
    if (!source.includes(needle)) throw new Error("Harness source extraction changed; update the audit hook");
    const replacement = `let src = match[1];
      for (const [from, to] of JSON.parse(process.env.QUEST_SETUP_MUTATIONS || "[]")) {
        if (src.split(from).length !== 2) throw new Error("Mutation anchor must occur once: " + from);
        src = src.replace(from, to);
      }`;
    return { ...result, source: source.replace(needle, replacement) };
  },
});
