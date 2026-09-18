export function detectPitch(samples, sampleRate, options = {}) {
  const threshold = options.threshold ?? 0.12;
  const minFrequency = options.minFrequency ?? 70;
  const maxFrequency = options.maxFrequency ?? 1100;
  let rms = 0;
  for (const sample of samples) rms += sample * sample;
  rms = Math.sqrt(rms / samples.length);
  if (rms < (options.minRms ?? 0.012)) return { frequency: null, clarity: 0, rms };

  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(samples.length - 2, Math.ceil(sampleRate / minFrequency));
  let bestLag = -1;
  let bestCorrelation = -1;
  const correlations = new Float32Array(maxLag + 1);

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let difference = 0;
    let energy = 0;
    const length = samples.length - lag;
    for (let index = 0; index < length; index += 1) {
      const a = samples[index];
      const b = samples[index + lag];
      const delta = a - b;
      difference += delta * delta;
      energy += a * a + b * b;
    }
    const correlation = energy ? 1 - difference / energy : 0;
    correlations[lag] = correlation;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorrelation < 1 - threshold) return { frequency: null, clarity: bestCorrelation, rms };
  const left = correlations[bestLag - 1] || bestCorrelation;
  const right = correlations[bestLag + 1] || bestCorrelation;
  const denominator = 2 * (2 * bestCorrelation - left - right);
  const correction = denominator ? (right - left) / denominator : 0;
  return {
    frequency: sampleRate / (bestLag + Math.max(-0.5, Math.min(0.5, correction))),
    clarity: bestCorrelation,
    rms,
  };
}

export class PitchInput {
  constructor(stream, audioContext, settings = {}) {
    this.stream = stream;
    this.context = audioContext;
    this.source = audioContext.createMediaStreamSource(stream);
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0;
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.settings = settings;
    this.source.connect(this.analyser);
  }

  read() {
    this.analyser.getFloatTimeDomainData(this.buffer);
    return detectPitch(this.buffer, this.context.sampleRate, { minRms: this.settings.noiseGate ?? 0.012 });
  }

  stop() {
    this.source.disconnect();
    this.stream.getTracks().forEach((track) => track.stop());
  }
}
