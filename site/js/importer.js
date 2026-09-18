import { parseUltraStar } from "./ultrastar.js";

function normalized(value) {
  return String(value ?? "").normalize("NFC").toLocaleLowerCase();
}

function directory(file) {
  const path = file.webkitRelativePath || file.name;
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function baseName(value) {
  return value.replace(/\.[^.]+$/, "");
}

function isAudio(file) {
  return file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name);
}

function findAudio(txt, song, audioFiles) {
  const sameDirectory = audioFiles.filter((audio) => directory(audio) === directory(txt));
  const expected = normalized(song.audioName.split(/[\\/]/).pop());
  if (expected) {
    const exact = sameDirectory.find((audio) => normalized(audio.name) === expected)
      || audioFiles.find((audio) => normalized(audio.name) === expected);
    if (exact) return exact;
  }
  const stem = normalized(baseName(txt.name));
  return sameDirectory.find((audio) => normalized(baseName(audio.name)) === stem)
    || (sameDirectory.length === 1 ? sameDirectory[0] : null);
}

export async function importSongFiles(fileList) {
  const files = [...fileList];
  const textFiles = files.filter((file) => /\.txt$/i.test(file.name));
  const audioFiles = files.filter(isAudio);
  const songs = [];
  const errors = [];

  for (const txt of textFiles) {
    try {
      const raw = await txt.text();
      const parsed = parseUltraStar(raw, txt.name);
      const audio = findAudio(txt, parsed, audioFiles);
      if (!audio) {
        errors.push(`${txt.name}: Audiodatei „${parsed.audioName || "passende MP3"}“ fehlt.`);
        continue;
      }
      songs.push({
        ...parsed,
        id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        audioFile: audio,
        audioUrl: URL.createObjectURL(audio),
        sourcePath: txt.webkitRelativePath || txt.name,
      });
    } catch (error) {
      errors.push(`${txt.name}: ${error.message}`);
    }
  }

  if (!textFiles.length) errors.push("Keine UltraStar-TXT-Datei ausgewählt.");
  return { songs, errors };
}

export function releaseSongs(songs) {
  for (const song of songs) if (song.audioUrl) URL.revokeObjectURL(song.audioUrl);
}
