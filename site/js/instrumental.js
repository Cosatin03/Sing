function clamp(value, minimum = -1, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function reduceCenteredVocals(left, right, centerRetention = 0.08) {
  if (left.length !== right.length) throw new Error("Die Stereokanäle haben unterschiedliche Längen.");
  const outputLeft = new Float32Array(left.length);
  const outputRight = new Float32Array(right.length);
  let peak = 0;

  for (let index = 0; index < left.length; index += 1) {
    const mid = (left[index] + right[index]) * 0.5 * centerRetention;
    const side = (left[index] - right[index]) * 0.5;
    outputLeft[index] = side + mid;
    outputRight[index] = -side + mid;
    peak = Math.max(peak, Math.abs(outputLeft[index]), Math.abs(outputRight[index]));
  }

  const scale = peak > 0.98 ? 0.98 / peak : 1;
  if (scale !== 1) {
    for (let index = 0; index < outputLeft.length; index += 1) {
      outputLeft[index] *= scale;
      outputRight[index] *= scale;
    }
  }
  return [outputLeft, outputRight];
}

function writeString(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

export function encodeWave(channels, sampleRate) {
  if (!channels.length || !channels[0].length) throw new Error("Keine Audiodaten vorhanden.");
  const frameCount = channels[0].length;
  const channelCount = channels.length;
  const bytesPerSample = 2;
  const dataSize = frameCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = clamp(channels[channel][frame]);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return buffer;
}

export async function createInstrumentalVersion(file, onProgress = () => {}) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Dieser Browser kann die Audiodatei nicht bearbeiten.");
  const context = new AudioContextClass();
  try {
    onProgress(8, "Audiodatei wird gelesen …");
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.numberOfChannels < 2) {
      throw new Error("Die Instrumental-Erzeugung benötigt eine Stereo-Datei.");
    }
    onProgress(38, "Gesang in der Stereomitte wird reduziert …");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const channels = reduceCenteredVocals(decoded.getChannelData(0), decoded.getChannelData(1));
    onProgress(72, "Instrumental-Version wird erstellt …");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const wave = encodeWave(channels, decoded.sampleRate);
    const blob = new Blob([wave], { type: "audio/wav" });
    onProgress(100, "Instrumental-Version ist bereit.");
    return { blob, url: URL.createObjectURL(blob), duration: decoded.duration };
  } finally {
    await context.close();
  }
}
