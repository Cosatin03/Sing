import test from "node:test";
import assert from "node:assert/strict";
import { parseUltraStar } from "../site/js/ultrastar.js";

const solo = `#ARTIST:Test Artist
#TITLE:Test Song
#MP3:test.mp3
#BPM:120
#GAP:1000
: 0 4 0 Hel
* 4 4 2 lo 
- 8
F 10 4 0 speak 
- 16
E`;

test("parses metadata, phrases and millisecond timing", () => {
  const song = parseUltraStar(solo, "test.txt");
  assert.equal(song.artist, "Test Artist");
  assert.equal(song.voices.length, 1);
  assert.equal(song.voices[0].phrases[0].text, "Hello");
  assert.equal(song.voices[0].phrases[0].notes[1].startMs, 1500);
});

test("parses duet voices and names", () => {
  const duet = solo.replace("#GAP:1000", "#GAP:1000\n#VIDEO:p1=Ken,p2=Barbie")
    .replace("F 10 4 0 speak \n- 16", "P2\n: 10 4 7 Answer \n- 16");
  const song = parseUltraStar(duet);
  assert.equal(song.isDuet, true);
  assert.deepEqual(song.voices.map((voice) => voice.name), ["Ken", "Barbie"]);
  assert.equal(song.voices[1].phrases[0].text, "Answer");
});

test("applies relative phrase offsets", () => {
  const relative = solo.replace("#GAP:1000", "#GAP:1000\n#RELATIVE:yes")
    .replace("- 8\nF 10", "- 8 20\nF 0");
  const song = parseUltraStar(relative);
  assert.equal(song.voices[0].phrases[1].notes[0].beat, 20);
});

test("applies BPM changes to following notes", () => {
  const changed = solo.replace("* 4 4 2 lo", "B 4 240\n* 8 4 2 lo");
  const song = parseUltraStar(changed);
  assert.equal(song.voices[0].phrases[0].notes[1].startMs, 1750);
});

test("rejects missing BPM and empty charts", () => {
  assert.throws(() => parseUltraStar("#TITLE:No BPM\nE"), /BPM/);
  assert.throws(() => parseUltraStar("#BPM:120\nE"), /Noten/);
});
