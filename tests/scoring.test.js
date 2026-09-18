import test from "node:test";
import assert from "node:assert/strict";
import { assignPhrases, displayScore, pitchDistance, scoreFrame } from "../site/js/scoring.js";

test("pitch comparison accepts octave equivalents", () => {
  assert.ok(pitchDistance(69, 81.05) < 10);
  assert.ok(scoreFrame({ type: ":", pitch: 69 }, 440, "hard").hit);
  assert.equal(scoreFrame({ type: "F", pitch: 69 }, 440).eligible, false);
  assert.equal(scoreFrame({ type: "R", pitch: 0 }, null, "normal", 0.05).hit, true);
});

test("normalized score is capped by accumulated quality", () => {
  assert.equal(displayScore(4, 5), 8000);
  assert.equal(displayScore(0, 0), 0);
});

test("solo phrases are distributed across every player", () => {
  const song = { voices: [{ phrases: Array.from({ length: 8 }, (_, id) => ({ id, startMs: id })) }] };
  const assigned = assignPhrases(song, 4);
  assert.deepEqual(assigned.map((track) => track.length), [2, 2, 2, 2]);
});

test("extra duet players share each role's lines", () => {
  const song = { voices: [
    { phrases: Array.from({ length: 4 }, (_, id) => ({ id: `a${id}`, startMs: id })) },
    { phrases: Array.from({ length: 4 }, (_, id) => ({ id: `b${id}`, startMs: id })) },
  ] };
  const assigned = assignPhrases(song, 4);
  assert.deepEqual(assigned.map((track) => track.length), [2, 2, 2, 2]);
});
