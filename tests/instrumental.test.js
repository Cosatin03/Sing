import test from "node:test";
import assert from "node:assert/strict";
import { encodeWave, reduceCenteredVocals } from "../site/js/instrumental.js";

test("center reduction removes identical stereo content", () => {
  const left = Float32Array.from([0.5, -0.5, 0.25]);
  const right = Float32Array.from(left);
  const [outLeft, outRight] = reduceCenteredVocals(left, right, 0);
  assert.ok([...outLeft, ...outRight].every((sample) => Math.abs(sample) < 1e-8));
});

test("center reduction preserves side information", () => {
  const [left, right] = reduceCenteredVocals(Float32Array.from([0.8]), Float32Array.from([-0.8]), 0);
  assert.ok(left[0] > 0.79);
  assert.ok(right[0] < -0.79);
});

test("wave encoder writes a valid stereo PCM header", () => {
  const wave = encodeWave([Float32Array.from([0, 1]), Float32Array.from([0, -1])], 48000);
  const view = new DataView(wave);
  const text = (offset, length) => String.fromCharCode(...new Uint8Array(wave, offset, length));
  assert.equal(text(0, 4), "RIFF");
  assert.equal(text(8, 4), "WAVE");
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint32(40, true), 8);
});
