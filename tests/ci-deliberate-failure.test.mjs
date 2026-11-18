// TUN-90: a deliberately failing test, to show once that a failing test fails the PR's check. Removed
// in the next commit.
import { test } from "node:test";
import assert from "node:assert";
test("TUN-90 deliberate failure: the check must go red", () => assert.strictEqual(1, 2));
