import { DeviceManager, deviceLabel } from "./devices.js";
import { KaraokeGame } from "./game.js";
import { importSongFiles, releaseSongs } from "./importer.js";
import { createInstrumentalVersion } from "./instrumental.js";
import { assignPhrases } from "./scoring.js";
import { parseUltraStar } from "./ultrastar.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  songs: [],
  activeSong: null,
  currentVersion: "original",
  devices: { inputs: [], outputs: [] },
  game: null,
  gameInputs: [],
  gamePlayers: [],
  progressFrame: 0,
  lastProgressAt: 0,
};
const deviceManager = new DeviceManager();
const audio = $("#songAudio");
const colors = ["#ff4db8", "#35d9f3", "#ffc857", "#7dff9d"];
let saved = {};
try { saved = JSON.parse(localStorage.getItem("sing-local-settings") || "{}"); } catch { saved = {}; }

function persistSettings() {
  localStorage.setItem("sing-local-settings", JSON.stringify(saved));
}

function readPlayerRows() {
  return [...$("#playerSettings").children].map((row) => ({
    name: row.querySelector("[data-name]")?.value || "",
    mic: row.querySelector("[data-mic]")?.value || "",
    color: row.querySelector("[data-color]")?.value || "#ff4db8",
    inputGain: Number(row.querySelector("[data-input-gain]")?.value ?? 100),
    monitorVolume: Number(row.querySelector("[data-monitor-volume]")?.value ?? 25),
  }));
}

function saveSettings() {
  Object.assign(saved, {
    playerCount: Number($("#playerCount").value),
    difficulty: $("#difficulty").value,
    output: $("#outputDevice").value,
    inputLatency: Number($("#inputLatency").value),
    futureSeconds: Number($("#futureSeconds").value),
    musicVolume: Number($("#musicVolume").value),
    monitorEnabled: $("#monitorEnabled").checked,
    players: readPlayerRows(),
  });
  persistSettings();
}

function message(text, success = false, target = $("#messages")) {
  const node = document.createElement("div");
  node.className = `message${success ? " message--success" : ""}`;
  node.textContent = text;
  target.append(node);
}

function songSource(song, version) {
  return version === "instrumental" && song.instrumentalUrl ? song.instrumentalUrl : song.audioUrl;
}

function createRange({ label, value, minimum, maximum, step = 1, suffix = "%", data }) {
  const field = document.createElement("label");
  field.className = "range-field player-range";
  const title = document.createElement("span");
  title.textContent = label;
  const output = document.createElement("output");
  output.textContent = `${value} ${suffix}`;
  const input = document.createElement("input");
  input.type = "range";
  input.min = minimum;
  input.max = maximum;
  input.step = step;
  input.value = value;
  input.dataset[data] = "";
  input.addEventListener("input", () => { output.textContent = `${input.value} ${suffix}`; });
  field.append(title, output, input);
  return field;
}

async function makeInstrumental(song, button) {
  button.disabled = true;
  const dialog = $("#instrumentalDialog");
  $("#instrumentalTitle").textContent = `${song.artist} – ${song.title}`;
  $("#instrumentalProgress").value = 0;
  $("#instrumentalStatus").textContent = "Audiodatei wird vorbereitet …";
  $("#closeInstrumental").disabled = true;
  dialog.showModal();
  try {
    const result = await createInstrumentalVersion(song.audioFile, (progress, status) => {
      $("#instrumentalProgress").value = progress;
      $("#instrumentalStatus").textContent = status;
    });
    if (song.instrumentalUrl) URL.revokeObjectURL(song.instrumentalUrl);
    song.instrumentalBlob = result.blob;
    song.instrumentalUrl = result.url;
    song.instrumentalDuration = result.duration;
    renderSongs();
  } catch (error) {
    $("#instrumentalStatus").textContent = `Nicht möglich: ${error.message}`;
  } finally {
    $("#closeInstrumental").disabled = false;
    button.disabled = false;
  }
}

function renderSongs() {
  const grid = $("#songGrid");
  grid.replaceChildren();
  $("#emptyState").hidden = state.songs.length > 0;
  $("#clearSongs").hidden = state.songs.length === 0;

  state.songs.forEach((song) => {
    const card = document.createElement("article");
    card.className = "song-card";
    const meta = document.createElement("div");
    meta.className = "song-card__meta";
    meta.textContent = `${song.isDuet ? `${song.voices.length} Stimmen` : "Solo"} · ${song.metadata.LANGUAGE || "Sprache offen"}`;
    if (song.instrumentalUrl) {
      const badge = document.createElement("span");
      badge.className = "song-badge";
      badge.textContent = "Instrumental bereit";
      meta.append(badge);
    }
    const title = document.createElement("h3");
    title.textContent = song.title;
    const artist = document.createElement("p");
    artist.textContent = song.artist;
    const actions = document.createElement("div");
    actions.className = "song-card__actions";
    const play = document.createElement("button");
    play.className = "button button--primary";
    play.textContent = "Singen";
    play.addEventListener("click", () => openSetup(song));
    const instrumental = document.createElement("button");
    instrumental.className = "button button--quiet";
    instrumental.textContent = song.instrumentalUrl ? "Instrumental neu" : "Instrumental";
    instrumental.title = "Lokale Version mit reduzierten Center-Vocals erstellen";
    instrumental.addEventListener("click", () => makeInstrumental(song, instrumental));
    const edit = document.createElement("button");
    edit.className = "icon-button";
    edit.title = "TXT bearbeiten";
    edit.setAttribute("aria-label", "TXT bearbeiten");
    edit.textContent = "✎";
    edit.addEventListener("click", () => openEditor(song));
    actions.append(play, instrumental, edit);
    card.append(meta, title, artist, actions);
    grid.append(card);
  });
}

async function addFiles(files) {
  $("#messages").replaceChildren();
  const { songs, errors } = await importSongFiles(files);
  state.songs.push(...songs);
  errors.forEach((error) => message(error));
  if (songs.length) message(`${songs.length} Song${songs.length === 1 ? "" : "s"} nur in den Arbeitsspeicher geladen.`, true);
  renderSongs();
}

function fillDeviceSelect(select, devices, type, selected) {
  select.replaceChildren();
  if (type === "Lautsprecher") select.add(new Option("Systemstandard", "default"));
  devices.forEach((device, index) => select.add(new Option(deviceLabel(device, index, type), device.deviceId)));
  if (selected && [...select.options].some((option) => option.value === selected)) select.value = selected;
}

function renderPlayerSettings() {
  const container = $("#playerSettings");
  const drafts = readPlayerRows();
  const count = Number($("#playerCount").value);
  container.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const prior = drafts[index] || saved.players?.[index] || {};
    const row = document.createElement("section");
    row.className = "player-setting";
    row.style.setProperty("--player", prior.color || colors[index]);
    const top = document.createElement("div");
    top.className = "player-setting__top";
    const name = document.createElement("input");
    name.dataset.name = "";
    name.value = prior.name || `Spieler ${index + 1}`;
    name.setAttribute("aria-label", `Name Spieler ${index + 1}`);
    const color = document.createElement("input");
    color.dataset.color = "";
    color.type = "color";
    color.value = prior.color || colors[index];
    color.setAttribute("aria-label", `Farbe Spieler ${index + 1}`);
    color.addEventListener("input", () => row.style.setProperty("--player", color.value));
    top.append(name, color);
    const micLabel = document.createElement("label");
    micLabel.textContent = "Mikrofon";
    const mic = document.createElement("select");
    mic.dataset.mic = "";
    mic.setAttribute("aria-label", `Mikrofon Spieler ${index + 1}`);
    fillDeviceSelect(mic, state.devices.inputs, "Mikrofon", prior.mic);
    if (!state.devices.inputs.length) mic.add(new Option("Erst Geräte freigeben", ""));
    micLabel.append(mic);
    const levels = document.createElement("div");
    levels.className = "player-setting__levels";
    levels.append(
      createRange({ label: "Mikrofon", value: prior.inputGain ?? 100, minimum: 0, maximum: 200, data: "inputGain" }),
      createRange({ label: "Ausgabe", value: prior.monitorVolume ?? 25, minimum: 0, maximum: 100, data: "monitorVolume" }),
    );
    row.append(top, micLabel, levels);
    container.append(row);
  }
}

function renderVersionOptions(song) {
  const select = $("#songVersion");
  select.replaceChildren(new Option("Original mit Gesang", "original"));
  if (song.instrumentalUrl) select.add(new Option("Instrumental – Gesang reduziert", "instrumental"));
  select.value = song.instrumentalUrl ? "instrumental" : "original";
}

function syncRange(input, output, suffix = "%") {
  output.textContent = `${input.value} ${suffix}`;
}

function openSetup(song) {
  state.activeSong = song;
  $("#setupTitle").textContent = `${song.artist} – ${song.title}`;
  $("#playerCount").value = saved.playerCount || (song.isDuet ? 2 : 1);
  $("#difficulty").value = saved.difficulty || "normal";
  $("#inputLatency").value = saved.inputLatency ?? 120;
  $("#futureSeconds").value = saved.futureSeconds ?? 6;
  $("#musicVolume").value = saved.musicVolume ?? 85;
  $("#monitorEnabled").checked = saved.monitorEnabled ?? false;
  syncRange($("#musicVolume"), $("#musicVolumeValue"));
  syncRange($("#futureSeconds"), $("#futureSecondsValue"), "s");
  renderVersionOptions(song);
  fillDeviceSelect($("#outputDevice"), state.devices.outputs, "Lautsprecher", saved.output);
  renderPlayerSettings();
  $("#setupDialog").showModal();
}

async function grantDevices() {
  const button = $("#grantDevices");
  button.disabled = true;
  button.textContent = "Freigabe läuft …";
  try {
    state.devices = await deviceManager.unlock();
    renderPlayerSettings();
    fillDeviceSelect($("#outputDevice"), state.devices.outputs, "Lautsprecher", saved.output);
    $("#deviceHint").textContent = `${state.devices.inputs.length} Mikrofon(e) und ${state.devices.outputs.length || "keine wählbaren"} Audioausgänge gefunden.`;
  } catch (error) {
    $("#deviceHint").textContent = `Mikrofonzugriff fehlgeschlagen: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Geräte neu laden";
  }
}

function playerConfiguration() {
  return readPlayerRows().map((player) => ({
    name: player.name.trim() || "Spieler",
    deviceId: player.mic,
    color: player.color,
    inputGain: player.inputGain / 100,
    monitorVolume: player.monitorVolume / 100,
  }));
}

function updateVersionButton() {
  const button = $("#toggleVersion");
  button.hidden = !state.activeSong?.instrumentalUrl;
  button.textContent = state.currentVersion === "instrumental" ? "Ohne Vocals" : "Original";
  button.classList.toggle("is-instrumental", state.currentVersion === "instrumental");
}

function createLiveRange(labelText, value, onInput, maximum = 100) {
  const label = document.createElement("label");
  label.className = "range-field";
  const title = document.createElement("span");
  title.textContent = labelText;
  const output = document.createElement("output");
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = String(maximum);
  input.value = String(Math.round(value * 100));
  const update = () => {
    output.textContent = `${input.value} %`;
    onInput(Number(input.value) / 100);
  };
  input.addEventListener("input", update);
  output.textContent = `${input.value} %`;
  label.append(title, output, input);
  return label;
}

function renderGameMixer(players, inputs) {
  $("#gameMusicVolume").value = String(Math.round(audio.volume * 100));
  syncRange($("#gameMusicVolume"), $("#gameMusicVolumeValue"));
  $("#gameFutureSeconds").value = String(saved.futureSeconds ?? 6);
  syncRange($("#gameFutureSeconds"), $("#gameFutureSecondsValue"), "s");
  $("#gameMonitorEnabled").checked = $("#monitorEnabled").checked;
  const container = $("#gameMicMixers");
  container.replaceChildren();
  players.forEach((player, index) => {
    const section = document.createElement("section");
    section.className = "game-mic-mixer";
    section.style.setProperty("--player", player.color);
    const title = document.createElement("strong");
    title.textContent = player.name;
    section.append(
      title,
      createLiveRange("Mikrofon", player.inputGain, (value) => {
        player.inputGain = value;
        inputs[index].setInputGain(value);
        if (saved.players?.[index]) saved.players[index].inputGain = Math.round(value * 100);
        persistSettings();
      }, 200),
      createLiveRange("Ausgabe", player.monitorVolume, (value) => {
        player.monitorVolume = value;
        inputs[index].setMonitorVolume(value);
        if (saved.players?.[index]) saved.players[index].monitorVolume = Math.round(value * 100);
        persistSettings();
      }),
    );
    container.append(section);
  });
}

async function startGame() {
  const button = $("#startGame");
  const players = playerConfiguration();
  if (!players.length || players.some((player) => !player.deviceId)) {
    $("#deviceHint").textContent = "Bitte erst den Zugriff erlauben und jedem Spieler ein Mikrofon zuweisen.";
    return;
  }
  if (new Set(players.map((player) => player.deviceId)).size !== players.length) {
    $("#deviceHint").textContent = "Jeder Spieler braucht ein eigenes Mikrofon. Ein Gerät ist doppelt zugewiesen.";
    return;
  }

  button.disabled = true;
  button.textContent = "Mikrofone werden geöffnet …";
  let openedInputs = [];
  try {
    saveSettings();
    state.currentVersion = $("#songVersion").value;
    audio.src = songSource(state.activeSong, state.currentVersion);
    audio.volume = Number($("#musicVolume").value) / 100;
    audio.muted = true;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    openedInputs = await deviceManager.openInputs(players, { monitoring: $("#monitorEnabled").checked });
    const output = await deviceManager.setOutput(audio, $("#outputDevice").value);
    if (!output.supported) $("#deviceHint").textContent = "Der Browser unterstützt keine Lautsprecherauswahl; Systemstandard wird verwendet.";
    if (!output.monitorSupported && $("#monitorEnabled").checked) {
      $("#deviceHint").textContent = "Musik nutzt die gewählte Ausgabe, Mikrofon-Monitoring den Systemstandard.";
    }
    const tracks = assignPhrases(state.activeSong, players.length);
    $("#setupDialog").close();
    $("#home").hidden = true;
    $("#gameScreen").hidden = false;
    $("#gameArtist").textContent = state.activeSong.artist;
    $("#gameTitle").textContent = state.activeSong.title;
    state.gameInputs = openedInputs;
    state.gamePlayers = players;
    renderGameMixer(players, openedInputs);
    updateVersionButton();
    state.game = new KaraokeGame({
      root: $("#gamePlayers"), audio, song: state.activeSong, players, tracks, inputs: openedInputs,
      difficulty: $("#difficulty").value,
      inputLatencyMs: Number($("#inputLatency").value) || 0,
      futureSeconds: Number($("#futureSeconds").value) || 6,
      onEnd: showResults,
    });
    await state.game.start();
    state.lastProgressAt = 0;
    progressLoop();
  } catch (error) {
    openedInputs.forEach((input) => input.stop());
    state.game = null;
    audio.pause();
    audio.muted = false;
    $("#deviceHint").textContent = `Start fehlgeschlagen: ${error.message}`;
    $("#home").hidden = false;
    $("#gameScreen").hidden = true;
  } finally {
    button.disabled = false;
    button.textContent = "Karaoke starten";
  }
}

function progressLoop(now = performance.now()) {
  if (now - state.lastProgressAt >= 100) {
    const duration = Number.isFinite(audio.duration) ? audio.duration : state.activeSong?.durationMs / 1000;
    $("#gameProgress").style.width = `${duration ? Math.min(100, audio.currentTime / duration * 100) : 0}%`;
    state.lastProgressAt = now;
  }
  if (state.game?.running) state.progressFrame = requestAnimationFrame(progressLoop);
}

function stopGame() {
  state.game?.finish();
}

function showResults(stats) {
  cancelAnimationFrame(state.progressFrame);
  state.game = null;
  state.gameInputs = [];
  state.gamePlayers = [];
  audio.removeAttribute("src");
  audio.load();
  $("#gameMixer").hidden = true;
  $("#gameScreen").hidden = true;
  $("#home").hidden = false;
  const results = $("#results");
  results.replaceChildren();
  stats.forEach((stat) => {
    const row = document.createElement("div");
    row.className = "result";
    row.style.setProperty("--player", stat.player.color);
    const name = document.createElement("span");
    name.textContent = stat.player.name;
    const score = document.createElement("strong");
    score.textContent = stat.score.toLocaleString("de-DE");
    row.append(name, score);
    results.append(row);
  });
  $("#resultDialog").showModal();
}

async function toggleGameVersion() {
  if (!state.game || !state.activeSong?.instrumentalUrl) return;
  const button = $("#toggleVersion");
  const next = state.currentVersion === "original" ? "instrumental" : "original";
  button.disabled = true;
  button.textContent = "Wechsel …";
  try {
    await state.game.switchAudio(songSource(state.activeSong, next));
    state.currentVersion = next;
  } catch (error) {
    button.title = error.message;
  } finally {
    button.disabled = false;
    updateVersionButton();
  }
}

function openEditor(song) {
  state.activeSong = song;
  $("#editorTitle").textContent = `${song.artist} – ${song.title}`;
  $("#editorText").value = song.raw;
  $("#editorMessage").replaceChildren();
  $("#editorDialog").showModal();
}

function applyEditor() {
  $("#editorMessage").replaceChildren();
  try {
    const updated = parseUltraStar($("#editorText").value, state.activeSong.filename);
    const preserved = {
      id: state.activeSong.id,
      audioFile: state.activeSong.audioFile,
      audioUrl: state.activeSong.audioUrl,
      sourcePath: state.activeSong.sourcePath,
      instrumentalBlob: state.activeSong.instrumentalBlob,
      instrumentalUrl: state.activeSong.instrumentalUrl,
      instrumentalDuration: state.activeSong.instrumentalDuration,
    };
    Object.assign(state.activeSong, updated, preserved);
    renderSongs();
    message("TXT ist gültig und wurde für diese Sitzung übernommen.", true, $("#editorMessage"));
  } catch (error) {
    message(error.message, false, $("#editorMessage"));
  }
}

function downloadEditor() {
  const blob = new Blob([$("#editorText").value], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = state.activeSong.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

$("#fileInput").addEventListener("change", (event) => addFiles(event.target.files));
$("#folderInput").addEventListener("change", (event) => addFiles(event.target.files));
$("#playerCount").addEventListener("change", renderPlayerSettings);
$("#grantDevices").addEventListener("click", grantDevices);
$("#musicVolume").addEventListener("input", () => syncRange($("#musicVolume"), $("#musicVolumeValue")));
$("#futureSeconds").addEventListener("input", () => syncRange($("#futureSeconds"), $("#futureSecondsValue"), "s"));
$("#startGame").addEventListener("click", startGame);
$("#stopGame").addEventListener("click", stopGame);
$("#pauseGame").addEventListener("click", () => state.game?.pause());
$("#fullscreenGame").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen() : $("#gameScreen").requestFullscreen());
$("#toggleVersion").addEventListener("click", toggleGameVersion);
$("#gameMixerToggle").addEventListener("click", () => { $("#gameMixer").hidden = !$("#gameMixer").hidden; });
$("#closeGameMixer").addEventListener("click", () => { $("#gameMixer").hidden = true; });
$("#gameMusicVolume").addEventListener("input", () => {
  audio.volume = Number($("#gameMusicVolume").value) / 100;
  syncRange($("#gameMusicVolume"), $("#gameMusicVolumeValue"));
  saved.musicVolume = Number($("#gameMusicVolume").value);
  persistSettings();
});
$("#gameFutureSeconds").addEventListener("input", () => {
  const value = Number($("#gameFutureSeconds").value);
  state.game?.setFutureSeconds(value);
  syncRange($("#gameFutureSeconds"), $("#gameFutureSecondsValue"), "s");
  saved.futureSeconds = value;
  persistSettings();
});
$("#gameMonitorEnabled").addEventListener("change", () => {
  const enabled = $("#gameMonitorEnabled").checked;
  state.gameInputs.forEach((input, index) => input.setMonitoring(enabled, state.gamePlayers[index].monitorVolume));
  saved.monitorEnabled = enabled;
  persistSettings();
});
$("#applyEditor").addEventListener("click", applyEditor);
$("#downloadTxt").addEventListener("click", downloadEditor);
$("#clearSongs").addEventListener("click", () => {
  releaseSongs(state.songs);
  state.songs = [];
  renderSongs();
  $("#messages").replaceChildren();
});

for (const type of ["dragenter", "dragover"]) {
  $("#dropZone").addEventListener(type, (event) => { event.preventDefault(); $("#dropZone").classList.add("is-over"); });
}
for (const type of ["dragleave", "drop"]) {
  $("#dropZone").addEventListener(type, (event) => { event.preventDefault(); $("#dropZone").classList.remove("is-over"); });
}
$("#dropZone").addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
window.addEventListener("beforeunload", () => releaseSongs(state.songs));
navigator.mediaDevices?.addEventListener?.("devicechange", async () => {
  state.devices = await deviceManager.list();
  if ($("#setupDialog").open) renderPlayerSettings();
});

renderSongs();
