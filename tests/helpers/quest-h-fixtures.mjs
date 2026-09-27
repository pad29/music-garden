// Opt-in melody fixture: call AFTER completeDealtSong, which deliberately rebuilds the melody.
// Never add this to the shared readiness helper: Firefly's contours must remain unchanged.
export function withBeatNotes(input) {
  const song = JSON.parse(JSON.stringify(input));
  const notes = song.tracks.find(t => t.kind === "melody").notes;
  for (let c = 0; c < Math.max(16, song.time.cols); c += 4)
    if (!notes.some(n => n.c === c)) notes.push({ p: 60, c, len: 1 });
  return song;
}
