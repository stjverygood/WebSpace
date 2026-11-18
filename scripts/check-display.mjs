import assert from "node:assert/strict";
import { enterLandscape, needsLandscape } from "../src/display.ts";
assert.equal(
  needsLandscape(360, 640, true),
  true,
  "phone portrait requires rotation",
);
assert.equal(
  needsLandscape(640, 360, true),
  false,
  "16:9 landscape is playable",
);
assert.equal(
  needsLandscape(844, 390, true),
  false,
  "wider phones are playable",
);
assert.equal(
  needsLandscape(600, 900, false),
  false,
  "desktop is not forced to rotate",
);
assert.deepEqual(
  await enterLandscape({ isFullscreen: () => false }),
  { fullscreen: false, locked: false },
  "unsupported fullscreen falls back gracefully",
);
let calls = [],
  full = false;
assert.deepEqual(
  await enterLandscape({
    isFullscreen: () => full,
    requestFullscreen: async () => {
      calls.push("fullscreen");
      full = true;
    },
    lockLandscape: async () => {
      calls.push("landscape");
    },
  }),
  { fullscreen: true, locked: true },
);
assert.deepEqual(
  calls,
  ["fullscreen", "landscape"],
  "fullscreen precedes orientation lock",
);
assert.deepEqual(
  await enterLandscape({
    isFullscreen: () => false,
    requestFullscreen: async () => {
      throw Error("denied");
    },
    lockLandscape: async () => {
      throw Error("must not be called");
    },
  }),
  { fullscreen: false, locked: false },
);
assert.deepEqual(
  await enterLandscape({
    isFullscreen: () => true,
    lockLandscape: async () => {
      throw Error("unsupported orientation");
    },
  }),
  { fullscreen: true, locked: false },
  "lock denial preserves fullscreen and manual play",
);
assert.deepEqual(
  await enterLandscape({ isFullscreen: () => true }),
  { fullscreen: true, locked: false },
  "fullscreen without orientation API remains usable",
);
assert.deepEqual(
  await enterLandscape({
    isFullscreen: () => true,
    requestFullscreen: () => {
      assert.fail("already fullscreen");
    },
    lockLandscape: async () => {},
  }),
  { fullscreen: true, locked: true },
);
console.log(
  "PASS: phone rotation gate, 16:9 and wide landscape, unsupported/denied fullscreen, manual orientation fallback and already-fullscreen entry.",
);
