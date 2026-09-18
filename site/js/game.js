import { activeNote, displayScore, maximumScoreWeight, scoreFrame } from "./scoring.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function currentAndNext(phrases, timeMs) {
  let index = phrases.findIndex((phrase) => phrase.endMs >= timeMs - 120);
  if (index < 0) return { current: null, next: null };
  return { current: phrases[index], next: phrases[index + 1] || null };
}

function resizeCanvas(canvas) {
  // Very high DPR canvases are expensive and add no useful detail here.
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(320, canvas.clientWidth);
  const height = Math.max(145, canvas.clientHeight);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
}

const PAST_WINDOW_MS = 1800;
const ANALYSIS_INTERVAL_MS = 80;
const RENDER_INTERVAL_MS = 1000 / 30;

function notesInWindow(notes, windowStart, windowEnd, startIndex = 0) {
  let first = startIndex;
  while (first < notes.length && notes[first].endMs < windowStart) first += 1;
  let last = first;
  while (last < notes.length && notes[last].startMs <= windowEnd) last += 1;
  return { notes: notes.slice(first, last), startIndex: first };
}

export function targetPitchBounds(notes) {
  const pitched = notes.filter((note) => note.type !== "F");
  if (!pitched.length) return { min: -6, max: 6 };
  const values = pitched.map((note) => note.pitch);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const center = (low + high) / 2;
  // Every visible note must remain inside the lane. The previous 20-semitone
  // cap pushed later notes onto one shared edge for previews above ~3 seconds.
  const range = Math.max(12, high - low + 4);
  return { min: center - range / 2, max: center + range / 2 };
}

function drawLane(canvas, notes, timeMs, color, hitSegments, futureSeconds, pitchScale) {
  const { context, width, height } = resizeCanvas(canvas);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(255,255,255,.018)";
  context.fillRect(0, 0, width, height);
  const windowStart = Math.max(0, timeMs - PAST_WINDOW_MS);
  const windowEnd = timeMs + futureSeconds * 1000;
  if (!notes.length) {
    context.fillStyle = "rgba(255,255,255,.45)";
    context.font = "600 15px system-ui";
    context.textAlign = "center";
    context.fillText("Keine Noten in der Vorschau", width / 2, height / 2);
    return;
  }

  const target = targetPitchBounds(notes);
  if (pitchScale.min == null) {
    pitchScale.min = target.min;
    pitchScale.max = target.max;
  } else {
    pitchScale.min += (target.min - pitchScale.min) * 0.16;
    pitchScale.max += (target.max - pitchScale.max) * 0.16;
  }
  const minPitch = pitchScale.min;
  const maxPitch = pitchScale.max;
  const range = Math.max(1, maxPitch - minPitch);
  const padX = 22;
  const padY = 16;
  const span = Math.max(1, windowEnd - windowStart);
  const usableWidth = width - 2 * padX;
  const usableHeight = height - 2 * padY;
  const barHeight = Math.max(12, Math.min(20, height * 0.085));
  const xForTime = (value) => padX + (value - windowStart) / span * usableWidth;
  const yForPitch = (pitch) => {
    const top = padY + barHeight / 2;
    const pitchHeight = Math.max(1, usableHeight - barHeight);
    return top + (maxPitch - pitch) / range * pitchHeight;
  };

  const hitsByNote = new Map();
  for (const segment of hitSegments) {
    if (!hitsByNote.has(segment.note)) hitsByNote.set(segment.note, []);
    hitsByNote.get(segment.note).push(segment);
  }

  context.strokeStyle = "rgba(255,255,255,.055)";
  context.lineWidth = 1;
  for (let guide = 1; guide < 4; guide += 1) {
    const guideY = padY + usableHeight * guide / 4;
    context.beginPath();
    context.moveTo(padX, guideY);
    context.lineTo(width - padX, guideY);
    context.stroke();
  }

  for (const note of notes) {
    const rawX = xForTime(note.startMs);
    const rawRight = xForTime(note.endMs);
    const x = Math.max(padX, rawX);
    const right = Math.min(width - padX, rawRight);
    const noteWidth = Math.max(4, right - x - 2);
    const centerY = note.type === "F" ? height / 2 : yForPitch(note.pitch);
    const y = centerY - barHeight / 2;
    const active = timeMs >= note.startMs && timeMs <= note.endMs;
    context.fillStyle = active ? `${color}52` : `${color}32`;
    roundedRect(context, x, y, noteWidth, barHeight, 7);
    context.fill();

    const hits = hitsByNote.get(note) || [];
    if (hits.length) {
      context.save();
      roundedRect(context, x, y, noteWidth, barHeight, 7);
      context.clip();
      context.fillStyle = color;
      for (const hit of hits) {
        const hitX = Math.max(x, xForTime(hit.startMs));
        const hitRight = Math.min(right - 2, xForTime(hit.endMs));
        if (hitRight > hitX) context.fillRect(hitX, y, hitRight - hitX, barHeight);
      }
      context.restore();
    }

    context.strokeStyle = active ? "white" : "rgba(255,255,255,.35)";
    context.lineWidth = active ? 2 : 1;
    context.stroke();
    context.save();
    roundedRect(context, x, y, noteWidth, barHeight, 7);
    context.clip();
    context.fillStyle = "#fff";
    context.font = `800 ${Math.max(13, Math.min(17, height * 0.07))}px system-ui`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(note.lyric || "·", x + noteWidth / 2, y + barHeight / 2, Math.max(1, noteWidth - 4));
    context.restore();
  }

  const cursorX = xForTime(timeMs);
  context.strokeStyle = "rgba(255,255,255,.88)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(cursorX, 5);
  context.lineTo(cursorX, height - 5);
  context.stroke();
}

function lyricPieceText(text) {
  return String(text ?? "").replaceAll("~", "").replaceAll(" ", "\u00a0");
}

function updateLyric(view, phrase, timeMs) {
  if (!phrase) {
    if (view.phraseId !== null) {
      view.current.textContent = "—";
      view.phraseId = null;
      view.lyricNotes = [];
    }
    return;
  }
  if (view.phraseId !== phrase.id) {
    view.current.replaceChildren();
    view.lyricNotes = phrase.notes.map((note) => {
      const piece = el("span", "lyric-piece", lyricPieceText(note.text));
      view.current.append(piece);
      return { note, piece };
    });
    view.phraseId = phrase.id;
  }
  for (const { note, piece } of view.lyricNotes) {
    piece.classList.toggle("is-active", timeMs >= note.startMs && timeMs <= note.endMs);
    piece.classList.toggle("is-sung", timeMs > note.endMs);
  }
}

export class KaraokeGame {
  constructor({ root, audio, song, players, tracks, inputs, difficulty, inputLatencyMs = 0, futureSeconds = 6, onEnd }) {
    this.root = root;
    this.audio = audio;
    this.song = song;
    this.players = players;
    this.tracks = tracks;
    this.inputs = inputs;
    this.difficulty = difficulty;
    this.inputLatencyMs = inputLatencyMs;
    this.futureSeconds = Math.max(2, Math.min(15, Number(futureSeconds) || 6));
    this.onEnd = onEnd;
    this.running = false;
    this.frame = 0;
    this.lastJudge = 0;
    this.lastRender = 0;
    this.noteTracks = tracks.map((phrases) => phrases.flatMap((phrase) => phrase.notes));
    this.stats = tracks.map((phrases) => ({
      earned: 0,
      maximum: maximumScoreWeight(phrases),
      score: 0,
    }));
    this.rows = [];
    this.boundEnded = () => this.finish();
  }

  render() {
    this.root.replaceChildren();
    this.root.dataset.players = String(this.players.length);
    this.players.forEach((player, index) => {
      const row = el("article", "player-stage");
      row.style.setProperty("--player", player.color);
      const header = el("header", "player-stage__header");
      const identity = el("div", "player-stage__identity");
      identity.append(el("span", "player-dot"), el("strong", "", player.name));
      const telemetry = el("div", "player-stage__telemetry");
      const level = el("span", "mic-level");
      level.title = "Mikrofonpegel";
      level.append(el("i", ""));
      const score = el("strong", "player-score", "0");
      telemetry.append(level, score);
      header.append(identity, telemetry);

      const current = el("div", "lyric lyric--current", "Bereit …");
      const next = el("div", "lyric lyric--next", "");
      const canvas = el("canvas", "pitch-lane");
      row.append(header, current, next, canvas);
      this.root.append(row);
      this.rows.push({
        row, current, next, canvas, level, score,
        phraseId: null, lyricNotes: [], hitSegments: [],
        reading: { frequency: null, rms: 0 }, visibleStart: 0, pitchScale: { min: null, max: null },
      });
    });
  }

  async start() {
    this.render();
    this.running = true;
    this.audio.addEventListener("ended", this.boundEnded, { once: true });
    try {
      await this.audio.play();
      this.lastJudge = performance.now();
      this.loop();
    } catch (error) {
      this.running = false;
      this.audio.removeEventListener("ended", this.boundEnded);
      throw error;
    }
  }

  loop = () => {
    if (!this.running) return;
    const now = performance.now();
    const timeMs = this.audio.currentTime * 1000;
    const judgeTime = timeMs - this.inputLatencyMs;
    const shouldJudge = !this.audio.paused && now - this.lastJudge >= ANALYSIS_INTERVAL_MS;
    const shouldRender = now - this.lastRender >= (this.audio.paused ? 100 : RENDER_INTERVAL_MS);
    const judgeDuration = Math.min(120, Math.max(0, now - this.lastJudge));

    if (this.audio.ended || (
      Number.isFinite(this.audio.duration)
      && this.audio.duration > 0
      && this.audio.currentTime >= this.audio.duration - 0.08
    )) {
      this.finish();
      return;
    }

    this.rows.forEach((view, index) => {
      const phrases = this.tracks[index];
      if (shouldJudge) {
        view.reading = this.inputs[index]?.read() || { frequency: null, rms: 0 };
        const note = activeNote(phrases, judgeTime);
        const scored = scoreFrame(note, view.reading.frequency, this.difficulty, view.reading.rms);
        if (scored.eligible) {
          const weight = note?.type === "*" || note?.type === "G" ? 2 : 1;
          const remaining = Math.max(0, note.endMs - judgeTime);
          const coveredDuration = Math.min(judgeDuration, remaining);
          if (scored.hit) {
            this.stats[index].earned += scored.quality * coveredDuration * weight;
            const startMs = Math.max(note.startMs, judgeTime - judgeDuration);
            const endMs = Math.min(note.endMs, judgeTime);
            const previous = view.hitSegments.at(-1);
            if (previous?.note === note && startMs - previous.endMs < ANALYSIS_INTERVAL_MS * 1.5) {
              previous.endMs = Math.max(previous.endMs, endMs);
            } else if (endMs > startMs) {
              view.hitSegments.push({ note, startMs, endMs });
            }
          }
          this.stats[index].score = displayScore(this.stats[index].earned, this.stats[index].maximum);
          view.score.textContent = this.stats[index].score.toLocaleString("de-DE");
          view.row.classList.toggle("is-hit", scored.hit);
        } else {
          view.row.classList.remove("is-hit");
        }
      }

      if (shouldRender) {
        const window = currentAndNext(phrases, timeMs);
        const windowStart = Math.max(0, timeMs - PAST_WINDOW_MS);
        const windowEnd = timeMs + this.futureSeconds * 1000;
        const visible = notesInWindow(this.noteTracks[index], windowStart, windowEnd, view.visibleStart);
        view.visibleStart = visible.startIndex;
        while (view.hitSegments[0]?.endMs < windowStart) view.hitSegments.shift();
        updateLyric(view, window.current, timeMs);
        view.next.textContent = window.next ? window.next.text : "";
        drawLane(
          view.canvas, visible.notes, timeMs, this.players[index].color,
          view.hitSegments, this.futureSeconds, view.pitchScale,
        );
        view.level.firstElementChild.style.width = `${Math.min(100, Math.round(view.reading.rms * 420))}%`;
      }
    });

    if (shouldJudge || this.audio.paused) this.lastJudge = now;
    if (shouldRender) this.lastRender = now;
    this.frame = requestAnimationFrame(this.loop);
  };

  pause() {
    if (this.audio.paused) this.audio.play();
    else this.audio.pause();
  }

  setFutureSeconds(value) {
    this.futureSeconds = Math.max(2, Math.min(15, Number(value) || 6));
  }

  async switchAudio(url) {
    const position = this.audio.currentTime;
    const shouldResume = !this.audio.paused;
    this.audio.pause();
    this.audio.src = url;
    this.audio.load();
    await new Promise((resolve, reject) => {
      const ready = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("Die gewählte Song-Version konnte nicht geladen werden.")); };
      const cleanup = () => {
        this.audio.removeEventListener("loadedmetadata", ready);
        this.audio.removeEventListener("error", failed);
      };
      this.audio.addEventListener("loadedmetadata", ready, { once: true });
      this.audio.addEventListener("error", failed, { once: true });
    });
    this.audio.currentTime = Math.min(position, Math.max(0, this.audio.duration - 0.1));
    if (shouldResume) await this.audio.play();
  }

  finish() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.audio.pause();
    this.audio.removeEventListener("ended", this.boundEnded);
    this.inputs.forEach((input) => input.stop());
    this.onEnd?.(this.stats.map((stat, index) => ({ ...stat, player: this.players[index] })));
  }
}
