export const DIFFICULTIES = {
  easy: { label: "Easy", tolerance: 110 },
  normal: { label: "Normal", tolerance: 70 },
  hard: { label: "Hard", tolerance: 40 },
};

export function frequencyToMidi(frequency) {
  return frequency > 0 ? 69 + 12 * Math.log2(frequency / 440) : null;
}

export function pitchDistance(expectedMidi, measuredMidi) {
  if (measuredMidi == null || !Number.isFinite(measuredMidi)) return Infinity;
  const direct = Math.abs(expectedMidi - measuredMidi);
  const octaveEquivalent = direct % 12;
  return Math.min(octaveEquivalent, 12 - octaveEquivalent) * 100;
}

export function scoreFrame(note, frequency, difficulty = "normal", rms = 0) {
  if (!note || note.type === "F") return { eligible: false, hit: false, quality: 0, cents: Infinity };
  if (note.type === "R" || note.type === "G") {
    const hit = rms >= 0.012;
    return { eligible: true, hit, quality: hit ? 1 : 0, cents: Infinity };
  }
  const cents = pitchDistance(note.pitch, frequencyToMidi(frequency));
  const tolerance = DIFFICULTIES[difficulty]?.tolerance ?? DIFFICULTIES.normal.tolerance;
  const quality = Math.max(0, 1 - cents / tolerance);
  return { eligible: true, hit: cents <= tolerance, quality, cents };
}

export function displayScore(hitWeight, totalWeight) {
  return totalWeight > 0 ? Math.round(10000 * hitWeight / totalWeight) : 0;
}

export function maximumScoreWeight(phrases) {
  return phrases
    .flatMap((phrase) => phrase.notes)
    .filter((note) => note.type !== "F")
    .reduce((total, note) => {
      const multiplier = note.type === "*" || note.type === "G" ? 2 : 1;
      return total + Math.max(0, note.endMs - note.startMs) * multiplier;
    }, 0);
}

export function activeNote(phrases, timeMs) {
  for (const phrase of phrases) {
    if (timeMs < phrase.startMs) return null;
    if (timeMs <= phrase.endMs) {
      return phrase.notes.find((note) => timeMs >= note.startMs && timeMs <= note.endMs) || null;
    }
  }
  return null;
}

export function assignPhrases(song, playerCount) {
  const count = Math.max(1, Math.min(4, Number(playerCount) || 1));
  const assigned = Array.from({ length: count }, () => []);

  if (song.voices.length === 1) {
    song.voices[0].phrases.forEach((phrase, index) => assigned[index % count].push(phrase));
  } else {
    const voiceCount = song.voices.length;
    song.voices.forEach((voice, voiceIndex) => {
      const group = Array.from({ length: count }, (_, index) => index)
        .filter((index) => index % voiceCount === voiceIndex % voiceCount);
      const targets = group.length ? group : [voiceIndex % count];
      voice.phrases.forEach((phrase, index) => assigned[targets[index % targets.length]].push(phrase));
    });
  }

  return assigned.map((phrases) => phrases.sort((a, b) => a.startMs - b.startMs));
}
