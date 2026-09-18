import test from "node:test";
import assert from "node:assert/strict";
import { detectPitch } from "../site/js/pitch.js";

test("detects an A4 sine wave", () => {
  const sampleRate = 48000;
  const samples = new Float32Array(4096);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = 0.35 * Math.sin(2 * Math.PI * 440 * index / sampleRate);
  }
  const result = detectPitch(samples, sampleRate);
  assert.ok(Math.abs(result.frequency - 440) < 3, `detected ${result.frequency}`);
  assert.ok(result.clarity > 0.8);
});

test("rejects silence below the noise gate", () => {
  const result = detectPitch(new Float32Array(2048), 48000);
  assert.equal(result.frequency, null);
});

test("prefers the fundamental peak over a low subharmonic", () => {
  const sampleRate = 48000;
  const samples = new Float32Array(1024);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = 0.35 * Math.sin(2 * Math.PI * 880 * index / sampleRate);
  }
  const result = detectPitch(samples, sampleRate);
  assert.ok(Math.abs(result.frequency - 880) < 8, `detected ${result.frequency}`);
});
