const NOTE_TYPES = new Set([":", "*", "F", "R", "G"]);

function number(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanPiece(value) {
  return String(value ?? "").replaceAll("~", "");
}

function lineText(notes) {
  return notes
    .map((note) => cleanPiece(note.text))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function parseVoiceNames(video = "") {
  const names = {};
  for (const part of video.split(",")) {
    const [key, ...rest] = part.split("=");
    const match = key?.trim().match(/^p(\d+)$/i);
    if (match && rest.length) names[Number(match[1])] = rest.join("=").trim();
  }
  return names;
}

function makeClock(baseBpm, changes) {
  const ordered = [{ beat: 0, bpm: baseBpm }, ...changes]
    .filter((segment) => Number.isFinite(segment.beat) && segment.bpm > 0)
    .sort((a, b) => a.beat - b.beat);
  const segments = [];
  for (const segment of ordered) {
    if (segments.at(-1)?.beat === segment.beat) segments[segments.length - 1] = segment;
    else segments.push(segment);
  }

  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    segments[index].elapsed = (previous.elapsed ?? 0)
      + (segments[index].beat - previous.beat) * 60000 / (previous.bpm * 4);
  }
  segments[0].elapsed = 0;

  return (beat) => {
    let segment = segments[0];
    for (const candidate of segments) {
      if (candidate.beat > beat) break;
      segment = candidate;
    }
    return (segment.elapsed ?? 0) + (beat - segment.beat) * 60000 / (segment.bpm * 4);
  };
}

export function parseUltraStar(source, filename = "song.txt") {
  if (typeof source !== "string" || !source.trim()) throw new Error("Die TXT-Datei ist leer.");

  const rows = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const metadata = {};
  const events = [];
  const tempoChanges = [];
  let currentVoice = 1;
  const offsets = new Map();
  const voiceOffset = () => offsets.get(currentVoice) || 0;

  rows.forEach((raw, rowIndex) => {
    const row = raw.trimEnd();
    if (!row.trim()) return;

    if (row.startsWith("#")) {
      const separator = row.indexOf(":");
      if (separator > 1) {
        metadata[row.slice(1, separator).trim().toUpperCase()] = row.slice(separator + 1).trim();
      }
      return;
    }

    const player = row.trim().match(/^P(\d+)$/i);
    if (player) {
      currentVoice = Number(player[1]);
      return;
    }

    const tempo = row.trim().match(/^B\s+(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)/i);
    if (tempo) {
      tempoChanges.push({ beat: number(tempo[1]) + voiceOffset(), bpm: number(tempo[2]) });
      return;
    }

    const phrase = row.trim().match(/^-\s+(-?\d+(?:[.,]\d+)?)(?:\s+(-?\d+(?:[.,]\d+)?))?/);
    if (phrase) {
      const rawEnd = number(phrase[1]);
      events.push({ kind: "break", voice: currentVoice, beat: rawEnd + voiceOffset(), row: rowIndex + 1 });
      if (/^(yes|true|1|on)$/i.test(metadata.RELATIVE || "")) {
        offsets.set(currentVoice, voiceOffset() + number(phrase[2], rawEnd));
      }
      return;
    }

    const note = row.match(/^([:*FRG])\s+(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)\s+(-?\d+)\s?(.*)$/i);
    if (note && NOTE_TYPES.has(note[1].toUpperCase() === "F" ? "F" : note[1])) {
      events.push({
        kind: "note",
        voice: currentVoice,
        type: note[1].toUpperCase() === "F" ? "F" : note[1],
        beat: number(note[2]) + voiceOffset(),
        duration: Math.max(0.01, number(note[3])),
        pitch: Number(note[4]),
        text: note[5] ?? "",
        row: rowIndex + 1,
      });
    }
  });

  const bpm = number(metadata.BPM);
  if (!bpm || bpm <= 0) throw new Error("#BPM fehlt oder ist ungültig.");
  const gap = number(metadata.GAP);
  const beatToMs = makeClock(bpm, tempoChanges);
  const startOffset = number(metadata.START) * 1000;
  const voiceNames = parseVoiceNames(metadata.VIDEO);
  const voiceIds = [...new Set(events.filter((event) => event.kind === "note").map((event) => event.voice))].sort((a, b) => a - b);
  if (!voiceIds.length) throw new Error("Keine gültigen UltraStar-Noten gefunden.");

  const voices = voiceIds.map((voiceId) => {
    const voiceEvents = events.filter((event) => event.voice === voiceId);
    const phrases = [];
    let notes = [];
    const flush = (breakBeat = null) => {
      if (!notes.length) return;
      const timed = notes.map((note) => ({
        ...note,
        startMs: gap + beatToMs(note.beat) - startOffset,
        endMs: gap + beatToMs(note.beat + note.duration) - startOffset,
        lyric: cleanPiece(note.text).trim(),
      }));
      const first = timed[0];
      const last = timed[timed.length - 1];
      phrases.push({
        id: `${voiceId}-${phrases.length}`,
        voice: voiceId,
        startBeat: first.beat,
        endBeat: breakBeat ?? last.beat + last.duration,
        startMs: first.startMs,
        endMs: Math.max(last.endMs, breakBeat == null ? last.endMs : gap + beatToMs(breakBeat) - startOffset),
        text: lineText(timed),
        notes: timed,
      });
      notes = [];
    };

    for (const event of voiceEvents) {
      if (event.kind === "break") flush(event.beat);
      else notes.push(event);
    }
    flush();
    return { id: voiceId, name: voiceNames[voiceId] || `Stimme ${voiceId}`, phrases };
  });

  const durationMs = Math.max(
    number(metadata.END),
    ...voices.flatMap((voice) => voice.phrases.map((phrase) => phrase.endMs)),
  );

  return {
    filename,
    raw: source,
    metadata,
    artist: metadata.ARTIST || "Unbekannter Interpret",
    title: metadata.TITLE || filename.replace(/\.txt$/i, ""),
    audioName: metadata.MP3 || metadata.AUDIO || "",
    bpm,
    gap,
    durationMs,
    voices,
    isDuet: voices.length > 1,
  };
}

export function serializeMetadata(song) {
  return `${song.artist} – ${song.title}`;
}
