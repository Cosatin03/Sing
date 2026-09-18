import { activeNote, displayScore, frequencyToMidi, maximumScoreWeight, scoreFrame } from "./scoring.js";

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
  const ratio = window.devicePixelRatio || 1;
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

function pitchInPhraseRange(frequency, minPitch, maxPitch) {
  const midi = frequencyToMidi(frequency);
  if (midi == null || !Number.isFinite(midi)) return null;
  const center = (minPitch + maxPitch) / 2;
  return midi + Math.round((center - midi) / 12) * 12;
}

function drawPhrase(canvas, phrase, timeMs, color, frequency) {
  const { context, width, height } = resizeCanvas(canvas);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(255,255,255,.018)";
  context.fillRect(0, 0, width, height);
  if (!phrase) {
    context.fillStyle = "rgba(255,255,255,.45)";
    context.font = "600 15px system-ui";
    context.textAlign = "center";
    context.fillText("Keine weitere Zeile", width / 2, height / 2);
    return;
  }

  const notes = phrase.notes;
  const pitches = notes.filter((note) => note.type !== "F").map((note) => note.pitch);
  const minPitch = (pitches.length ? Math.min(...pitches) : 0) - 2;
  const maxPitch = (pitches.length ? Math.max(...pitches) : 12) + 2;
  const range = Math.max(8, maxPitch - minPitch);
  const padX = 22;
  const padY = 16;
  const span = Math.max(1, phrase.endMs - phrase.startMs);
  const usableWidth = width - 2 * padX;
  const usableHeight = height - 2 * padY;

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
    const x = padX + (note.startMs - phrase.startMs) / span * usableWidth;
    const noteWidth = Math.max(12, (note.endMs - note.startMs) / span * usableWidth - 2);
    const y = note.type === "F"
      ? height / 2 - 13
      : padY + (maxPitch - note.pitch) / range * usableHeight;
    const barHeight = Math.max(28, Math.min(40, height * 0.16));
    const active = timeMs >= note.startMs && timeMs <= note.endMs;
    context.fillStyle = active ? color : `${color}99`;
    roundedRect(context, x, y, noteWidth, barHeight, 7);
    context.fill();
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

  const progress = Math.max(0, Math.min(1, (timeMs - phrase.startMs) / span));
  const cursorX = padX + progress * usableWidth;
  context.strokeStyle = "rgba(255,255,255,.88)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(cursorX, 5);
  context.lineTo(cursorX, height - 5);
  context.stroke();

  const sungPitch = pitchInPhraseRange(frequency, minPitch, maxPitch);
  if (sungPitch != null) {
    const rawY = padY + (maxPitch - sungPitch) / range * usableHeight;
    const markerY = Math.max(padY, Math.min(padY + usableHeight, rawY));
    context.save();
    context.shadowColor = color;
    context.shadowBlur = 18;
    context.strokeStyle = color;
    context.fillStyle = "white";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(cursorX - 17, markerY);
    context.lineTo(cursorX + 17, markerY);
    context.stroke();
    context.beginPath();
    context.arc(cursorX, markerY, 6, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
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
  constructor({ root, audio, song, players, tracks, inputs, difficulty, inputLatencyMs = 0, onEnd }) {
    this.root = root;
    this.audio = audio;
    this.song = song;
    this.players = players;
    this.tracks = tracks;
    this.inputs = inputs;
    this.difficulty = difficulty;
    this.inputLatencyMs = inputLatencyMs;
    this.onEnd = onEnd;
    this.running = false;
    this.frame = 0;
    this.lastJudge = 0;
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
      row.append(header, current, canvas, next);
      this.root.append(row);
      this.rows.push({ row, current, next, canvas, level, score, phraseId: null, lyricNotes: [] });
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
    const shouldJudge = !this.audio.paused && now - this.lastJudge >= 45;
    const judgeDuration = Math.min(100, Math.max(0, now - this.lastJudge));

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
      const window = currentAndNext(phrases, timeMs);
      const reading = this.inputs[index]?.read() || { frequency: null, rms: 0 };
      updateLyric(view, window.current, timeMs);
      view.next.textContent = window.next ? window.next.text : "";
      drawPhrase(view.canvas, window.current, timeMs, this.players[index].color, reading.frequency);

      view.level.firstElementChild.style.width = `${Math.min(100, Math.round(reading.rms * 420))}%`;

      if (shouldJudge) {
        const note = activeNote(phrases, judgeTime);
        const scored = scoreFrame(note, reading.frequency, this.difficulty, reading.rms);
        if (scored.eligible) {
          const weight = note?.type === "*" || note?.type === "G" ? 2 : 1;
          const remaining = Math.max(0, note.endMs - judgeTime);
          const coveredDuration = Math.min(judgeDuration, remaining);
          if (scored.hit) this.stats[index].earned += scored.quality * coveredDuration * weight;
          this.stats[index].score = displayScore(this.stats[index].earned, this.stats[index].maximum);
          view.score.textContent = this.stats[index].score.toLocaleString("de-DE");
          view.row.classList.toggle("is-hit", scored.hit);
        } else {
          view.row.classList.remove("is-hit");
        }
      }
    });

    if (shouldJudge || this.audio.paused) this.lastJudge = now;
    this.frame = requestAnimationFrame(this.loop);
  };

  pause() {
    if (this.audio.paused) this.audio.play();
    else this.audio.pause();
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
