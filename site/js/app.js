import { DeviceManager, deviceLabel } from "./devices.js";
import { KaraokeGame } from "./game.js";
import { importSongFiles, releaseSongs } from "./importer.js";
import { assignPhrases } from "./scoring.js";
import { parseUltraStar } from "./ultrastar.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  songs: [],
  activeSong: null,
  devices: { inputs: [], outputs: [] },
  game: null,
  progressFrame: 0,
};
const deviceManager = new DeviceManager();
const audio = $("#songAudio");
const colors = ["#ff4db8", "#35d9f3", "#ffc857", "#7dff9d"];
let saved = {};
try { saved = JSON.parse(localStorage.getItem("sing-local-settings") || "{}"); } catch { saved = {}; }

function saveSettings() {
  const playerCount = Number($("#playerCount").value);
  const players = [...$("#playerSettings").children].slice(0, playerCount).map((row) => ({
    name: row.querySelector("[data-name]").value,
    mic: row.querySelector("[data-mic]").value,
    color: row.querySelector("[data-color]").value,
  }));
  Object.assign(saved, {
    playerCount,
    difficulty: $("#difficulty").value,
    output: $("#outputDevice").value,
    inputLatency: Number($("#inputLatency").value),
    players,
  });
  localStorage.setItem("sing-local-settings", JSON.stringify(saved));
}

function message(text, success = false, target = $("#messages")) {
  const node = document.createElement("div");
  node.className = `message${success ? " message--success" : ""}`;
  node.textContent = text;
  target.append(node);
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
    const edit = document.createElement("button");
    edit.className = "icon-button";
    edit.title = "TXT bearbeiten";
    edit.setAttribute("aria-label", "TXT bearbeiten");
    edit.textContent = "✎";
    edit.addEventListener("click", () => openEditor(song));
    actions.append(play, edit);
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
  if (type === "Lautsprecher") {
    const option = new Option("Systemstandard", "default");
    select.add(option);
  }
  devices.forEach((device, index) => select.add(new Option(deviceLabel(device, index, type), device.deviceId)));
  if (selected && [...select.options].some((option) => option.value === selected)) select.value = selected;
}

function renderPlayerSettings() {
  const container = $("#playerSettings");
  const count = Number($("#playerCount").value);
  container.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const prior = saved.players?.[index] || {};
    const row = document.createElement("div");
    row.className = "player-setting";
    const name = document.createElement("input");
    name.dataset.name = "";
    name.value = prior.name || `Spieler ${index + 1}`;
    name.setAttribute("aria-label", `Name Spieler ${index + 1}`);
    const mic = document.createElement("select");
    mic.dataset.mic = "";
    mic.setAttribute("aria-label", `Mikrofon Spieler ${index + 1}`);
    fillDeviceSelect(mic, state.devices.inputs, "Mikrofon", prior.mic);
    if (!state.devices.inputs.length) mic.add(new Option("Erst Geräte freigeben", ""));
    const color = document.createElement("input");
    color.dataset.color = "";
    color.type = "color";
    color.value = prior.color || colors[index];
    color.setAttribute("aria-label", `Farbe Spieler ${index + 1}`);
    row.append(name, mic, color);
    container.append(row);
  }
}

function openSetup(song) {
  state.activeSong = song;
  $("#setupTitle").textContent = `${song.artist} – ${song.title}`;
  $("#playerCount").value = saved.playerCount || (song.isDuet ? 2 : 1);
  $("#difficulty").value = saved.difficulty || "normal";
  $("#inputLatency").value = saved.inputLatency ?? 120;
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
  return [...$("#playerSettings").children].map((row) => ({
    name: row.querySelector("[data-name]").value.trim() || "Spieler",
    deviceId: row.querySelector("[data-mic]").value,
    color: row.querySelector("[data-color]").value,
  }));
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
  try {
    saveSettings();
    const inputs = await deviceManager.openInputs(players.map((player) => player.deviceId));
    audio.src = state.activeSong.audioUrl;
    const output = await deviceManager.setOutput(audio, $("#outputDevice").value);
    if (!output.supported) $("#deviceHint").textContent = "Der Browser unterstützt keine Lautsprecherauswahl; Systemstandard wird verwendet.";
    const tracks = assignPhrases(state.activeSong, players.length);
    $("#setupDialog").close();
    $("#home").hidden = true;
    $("#gameScreen").hidden = false;
    $("#gameArtist").textContent = state.activeSong.artist;
    $("#gameTitle").textContent = state.activeSong.title;
    state.game = new KaraokeGame({
      root: $("#gamePlayers"), audio, song: state.activeSong, players, tracks, inputs,
      difficulty: $("#difficulty").value,
      inputLatencyMs: Number($("#inputLatency").value) || 0,
      onEnd: showResults,
    });
    progressLoop();
    await state.game.start();
  } catch (error) {
    $("#deviceHint").textContent = `Start fehlgeschlagen: ${error.message}`;
    $("#home").hidden = false;
    $("#gameScreen").hidden = true;
  } finally {
    button.disabled = false;
    button.textContent = "Karaoke starten";
  }
}

function progressLoop() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : state.activeSong?.durationMs / 1000;
  $("#gameProgress").style.width = `${duration ? Math.min(100, audio.currentTime / duration * 100) : 0}%`;
  if (state.game?.running) state.progressFrame = requestAnimationFrame(progressLoop);
}

function stopGame() {
  state.game?.finish();
}

function showResults(stats) {
  cancelAnimationFrame(state.progressFrame);
  state.game = null;
  audio.removeAttribute("src");
  audio.load();
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
    Object.assign(state.activeSong, updated, {
      id: state.activeSong.id,
      audioFile: state.activeSong.audioFile,
      audioUrl: state.activeSong.audioUrl,
      sourcePath: state.activeSong.sourcePath,
    });
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
$("#startGame").addEventListener("click", startGame);
$("#stopGame").addEventListener("click", stopGame);
$("#pauseGame").addEventListener("click", () => state.game?.pause());
$("#fullscreenGame").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen() : $("#gameScreen").requestFullscreen());
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
