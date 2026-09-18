import test from "node:test";
import assert from "node:assert/strict";
import { appendFeedbackSegment, targetPitchBounds } from "../site/js/game.js";

test("pitch bounds include every visible note in long previews", () => {
  const bounds = targetPitchBounds([
    { type: ":", pitch: -4 },
    { type: ":", pitch: 8 },
    { type: "*", pitch: 27 },
  ]);
  assert.ok(bounds.min < -4);
  assert.ok(bounds.max > 27);
});

test("feedback segments merge only when note and result match", () => {
  const note = { startMs: 0, endMs: 1000 };
  const segments = [];
  appendFeedbackSegment(segments, note, 100, 180, true);
  appendFeedbackSegment(segments, note, 180, 260, true);
  appendFeedbackSegment(segments, note, 260, 340, false);
  assert.deepEqual(segments.map(({ startMs, endMs, hit }) => ({ startMs, endMs, hit })), [
    { startMs: 100, endMs: 260, hit: true },
    { startMs: 260, endMs: 340, hit: false },
  ]);
});
