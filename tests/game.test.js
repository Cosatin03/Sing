import test from "node:test";
import assert from "node:assert/strict";
import { targetPitchBounds } from "../site/js/game.js";

test("pitch bounds include every visible note in long previews", () => {
  const bounds = targetPitchBounds([
    { type: ":", pitch: -4 },
    { type: ":", pitch: 8 },
    { type: "*", pitch: 27 },
  ]);
  assert.ok(bounds.min < -4);
  assert.ok(bounds.max > 27);
});
