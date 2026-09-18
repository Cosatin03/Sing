import { detectPitch } from "./pitch.js";

self.addEventListener("message", ({ data }) => {
  const result = detectPitch(new Float32Array(data.samples), data.sampleRate, { minRms: data.minRms });
  self.postMessage({
    ...result,
    sampleId: data.sampleId,
    timeMs: data.timeMs,
  });
});
