// Static contract only: these checks cannot prove AO starts/stops a process,
// navigates its browser, serves this worktree, or isolates concurrent workers.
// The mutations below exercise the same assertions against in-memory copies;
// neither the launch configuration nor any other production file is rewritten.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const launch = JSON.parse(readFileSync(new URL("../.ao/launch.json", import.meta.url), "utf8"));

function singleConfiguration(value) {
  assert.strictEqual(value.version, 1);
  assert.ok(Array.isArray(value.configurations));
  assert.strictEqual(value.configurations.length, 1, "bare preview start needs exactly one configuration");
  const config = value.configurations[0];
  assert.ok(typeof config.name === "string" && config.name.trim().length > 0);
  assert.strictEqual(config.targetKind, "app");
  return config;
}

function serverContract(config) {
  assert.strictEqual(config.cwd, ".", "resolve the server from the session worktree");
  assert.strictEqual(config.autoPort, true);
  assert.strictEqual(config.runtimeExecutable, "npx");
  const args = config.runtimeArgs;
  assert.ok(Array.isArray(args) && args.every(arg => typeof arg === "string"));
  assert.ok(args.includes("--yes"), "an unattended install must not prompt");
  assert.ok(args.some(arg => /^http-server(?:@\d+\.\d+\.\d+)?$/.test(arg)));
  // This checks the documented split-argument form, not every possible CLI spelling.
  for (const [flag, expected] of [["-p", "${PORT}"], ["-a", "127.0.0.1"]]) {
    assert.strictEqual(args.filter(arg => arg === flag).length, 1, `one ${flag} argument`);
    assert.strictEqual(args[args.indexOf(flag) + 1], expected, flag);
  }
  assert.ok(args.includes("-c-1"), "browser checks need uncached source files");
  assert.strictEqual(args.at(-1), ".", "serve the worktree root");
}

function urlContract(config) {
  assert.ok(typeof config.url === "string");
  assert.strictEqual(config.url.split("${PORT}").length, 2, "URL must use the allocated port once");
  const url = new URL(config.url.replace("${PORT}", "54321"));
  assert.strictEqual(url.protocol, "http:");
  assert.strictEqual(url.hostname, "127.0.0.1");
  assert.strictEqual(url.port, "54321");
  assert.strictEqual(url.username, "");
  assert.strictEqual(url.password, "");
}

function timeoutContract(config) {
  if (Object.hasOwn(config, "readyTimeoutMs")) {
    assert.ok(Number.isInteger(config.readyTimeoutMs));
    assert.ok(config.readyTimeoutMs >= 0 && config.readyTimeoutMs <= 55000);
  }
}

// Faults: add a second configuration; bind publicly; hardcode a URL port;
// exceed AO's timeout range (which invalidates the entire configuration file).
test("AO launch has one app configuration for a bare preview start", () => singleConfiguration(launch));
test("AO server binds loopback using the allocated port and the worktree root", () => serverContract(launch.configurations[0]));
test("AO browser URL uses the server's allocated loopback HTTP origin", () => urlContract(launch.configurations[0]));
test("AO readiness timeout is omitted or within the accepted range", () => timeoutContract(launch.configurations[0]));

test("AO launch contract rejects representative configuration regressions", () => {
  const cases = [
    [singleConfiguration, value => { value.version = 2; }],
    [singleConfiguration, value => { value.configurations = []; }],
    [singleConfiguration, value => { value.configurations.push(structuredClone(value.configurations[0])); }],
    [serverContract, config => { config.cwd = ".."; }],
    [serverContract, config => { config.autoPort = false; }],
    [serverContract, config => { config.runtimeArgs[config.runtimeArgs.indexOf("-p") + 1] = "8377"; }],
    [serverContract, config => { config.runtimeArgs[config.runtimeArgs.indexOf("-a") + 1] = "0.0.0.0"; }],
    [serverContract, config => { config.runtimeArgs.pop(); }],
    [urlContract, config => { config.url = config.url.replace("${PORT}", "8377"); }],
    [urlContract, config => { config.url = config.url.replace("127.0.0.1", "example.com"); }],
    [urlContract, config => { config.url = config.url.replace("http:", "https:"); }],
    ...[-1, 55001, "30000", 1.5, null].map(value => [timeoutContract, config => { config.readyTimeoutMs = value; }]),
  ];
  for (const [check, mutate] of cases) {
    const copy = structuredClone(check === singleConfiguration ? launch : launch.configurations[0]);
    mutate(copy);
    assert.throws(() => check(copy), { name: "AssertionError" }, String(mutate));
  }
  // Both documented endpoints are valid; absence of the field uses AO's default.
  for (const readyTimeoutMs of [0, 30000, 55000]) timeoutContract({ readyTimeoutMs });
});
