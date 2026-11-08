// ---------- "Hear a famous one": show the very construct you're learning, alive in a real song ----------
// A famous example places the CHORDS you just built (block triads) PLUS a melody riding on top, both drawn on the grid
// and played in the garden's own voice — so you can SEE where the progression lives and hear it as a real song. It STAYS
// on the field afterward (press ▶ to replay). Public-domain / non-copyrightable only — no audio assets, just notes.
// Each entry is `mel` (single notes [midi,col]) and/or `chords` (block triads [[midi,midi,midi],col]) — both as absolute
// MIDI so they work in ANY palette (pentatonic OR diatonic). Public-domain / non-copyrightable tunes only.
const FAMOUS = {
  // River Turns "The Famous River" — I → V → vi → IV: show exactly those four chords, made into a little song.
  fourchord: { title:"The Four-Chord Song",
    chords:[[[60,64,67],0],[[67,71,74],4],[[69,72,76],8],[[65,69,72],12]],    // I  V  vi  IV
    mel:[[76,0],[79,2],[79,4],[81,6],[79,8],[76,10],[81,12],[77,14]],         // a gentle tune riding on top
    credit:"🎧 That's I → V → vi → IV — the four chords behind “Let It Be”, “No Woman No Cry”, “Don't Stop Believin'” and a thousand more songs. You just built the famous one! 🎶" },
  // Stepping Stones — stepwise motion. Mary tiptoes in tiny steps (one leap at the end).
  mary: { title:"Mary Had a Little Lamb", cols:64, meter:"4/4", origin:0,                             // full verse 1, transcribed from the score (Lowell Mason, 4/4, ♩=150): faithful note lengths, CONTINUOUS (no mid-song gap), lands home on C
    //   each quarter = 2 cols, the phrase-ending half-note "lamb"s = 4 cols, the final "snow" a whole note (owner's score review, 2026-09-27)
    mel:[[76,0,2],[74,2,2],[72,4,2],[74,6,2],   [76,8,2],[76,10,2],[76,12,4],   [74,16,2],[74,18,2],[74,20,4],   [76,24,2],[79,26,2],[79,28,4],     // "Mary had a little LAMB, / Little LAMB, / little LAMB,"
         [76,32,2],[74,34,2],[72,36,2],[74,38,2],   [76,40,2],[76,42,2],[76,44,2],[76,46,2],   [74,48,2],[74,50,2],[76,52,2],[74,54,2],   [72,56,8]], // "Mary had a little lamb, Whose / fleece was white as / SNOW."
    credit:"🎵 That's “Mary Had a Little Lamb.” Hear how it tiptoes along in tiny steps, one note at a time? That's the smooth, stepwise motion you just learned." },
  // Standing Towers — triads. Taps is a C-major triad (C-E-G) sung one note at a time, then rung as a chord.
  taps: { title:"Taps", cols:46,                                               // from the score (tapsbugler.com, ♩=40, "Slowly"): pure C-E-G triad + high G, with LONG held fermata notes at the phrase ends
    //   Day-is-DONE    gone-the-SUN   from-the-lakes  from-the-HILLS  from-the-sky   all-is-well    safely-rest    God-is-NIGH
    mel:[[67,0],[67,1],[72,2],   [67,6],[72,7],[76,8],   [67,12],[72,13],[76,14],   [72,17],[76,18],[79,19],
         [76,23],[79,24],[79,25],   [79,28],[76,29],[72,30],   [67,33],[72,34],[76,35],   [72,38],[67,39],[72,40]],
    chords:[[[60,64,67],42]],                                                  // a final C-major triad rings as a chord (our "tower" flourish — NOT in the score itself)
    credit:"🎺 That's “Taps,” the bugle call — and it's secretly a tower! Those are the very stones you stacked, C, E and G, sung one at a time, then rung together as a chord." },
  // Two New Colors — the full scale. Joy to the World slides down all seven notes (F and B included).
  joy: { title:"Joy to the World", cols:64,                                    // Pavel's tuned version (from save-link, 2026-07-01) matching his score (Handel, 2/4, ♩=100): the full first line — octave descent + the climb back up. All naturals ✓ (major key).
    mel:[[72,0],[71,4],[69,7],[67,8],                                          // "Joy to the world" — C5 held, then the dotted to-the pickup into a LONG held G4 ("world")
         [65,13],[64,15],[62,19],[60,23],                                      // "the Lord is come" — F E D, landing on a long held low C (home, the breath)
         [67,29],[69,31],                                                      // "Let earth" — the climb back up begins: G, then A held long
         [69,37],[71,39],                                                      // "re-ceive" — A pickup into B held long
         [71,45],[72,47]],                                                     // "her King" — B pickup into C5, all the way back up to high do
    credit:"🎵 That's the opening of “Joy to the World” by Handel. Hear the melody tumble ALL the way down the full seven-note scale — every colour, the new F and B included — and then climb joyfully right back up to greet its King." },
  // Ways Home — coming home. Ode to Joy wanders up and away, then settles back home on C.
  odetojoy: { title:"Ode to Joy", cols:32,                    // CAPSTONE (ways-home reward) = the theme's SECOND half, which resolves all the way HOME to C. Faithful 4/4 at ♩=100 from Pavel's leadsheet (quarter=2 cols, dotted-quarter=3, eighth=1, half=4). C4=60 D=62 E=64 F=65 G=67.
    mel:[[64,0],[64,2],[65,4],[67,6],[67,8],[65,10],[64,12],[62,14],    // E E F G  G F E D
         [60,16],[60,18],[62,20],[64,22],                              // C C D E
         [62,24],[60,27],[60,28]],                                     // D. C C — settles HOME on do
    jukebox:{ cols:64, meter:"4/4", origin:0,                                                 // JUKEBOX = the FULL theme (both halves). Identical except the last bar: M4 "E. D D" hangs away on re, M8 "D. C C" lands home on do — the away/home pair.
      mel:[[64,0,2],[64,2,2],[65,4,2],[67,6,2],[67,8,2],[65,10,2],[64,12,2],[62,14,2],  // E E F G  G F E D
           [60,16,2],[60,18,2],[62,20,2],[64,22,2],[64,24,3],[62,27],[62,28,4],     // C C D E  E. D D (hangs away on re)
           [64,32,2],[64,34,2],[65,36,2],[67,38,2],[67,40,2],[65,42,2],[64,44,2],[62,46,2], // E E F G  G F E D
           [60,48,2],[60,50,2],[62,52,2],[64,54,2],[62,56,3],[60,59],[60,60,4]] },  // C C D E  D. C C (home on do)
    credit:"🎵 That's Beethoven's “Ode to Joy.” It wanders up and away, then comes all the way home to rest — the homecoming you just practised." },
  // Pull of the Moon — the V → I authentic cadence. "Two bits" is V → I, the top voice climbing B → C.
  shave: { title:"Shave and a Haircut",                                        // CAPSTONE = the bare jingle: "shave-and-a-hair-cut" (the "and-a" quick), a pause, then "two-bits" = the taught V→I
    mel:[[72,0],[67,2],[67,3],[69,4],[67,6],   [71,9],[72,11]],                // C G-G A G  (pause)  B C
    chords:[[[67,71,74],9],[[60,64,67],11]],                                   // V  then  I  (under "two"  &  "bits")
    jukebox:{ cols:64, meter:"4/4", origin:2,                                                         // JUKEBOX = the full first phrase of the Faber lesson piece (through the 1st ending): a one-bar figure — bass half note · two staccato dyads · quick A-G eighths — cycling I I I(walk) V V V(tied) V(walk) I. 8 bars × 8 cols, OPENING with the score's A-G pickup (cols 0-1) into the C downbeat; the loop wraps seamlessly like the score's repeat (bar 8's own eighths ARE cols 0-1). LH lifted an octave (score's G3/B3/A3 sit below our C4 grid floor).
      mel:[[69,0],[67,1],                                                      // PICKUP: the "and-a" A-G eighths, leading into...
           [72,2,4],[69,8],[67,9],                                               // bar 1 (I): C bass rings · ...dyads... · A-G eighths  (whole bass line lifted ONE octave: the score's C4→B3→A3→G3 walk sits below our C4 floor, and the walk's DESCENT is the point — home strolling down to the dominant)
           [72,10,4],[69,16],[67,17],                                            // bar 2 (I): again
           [72,18,4],[71,22,2],[69,24,2],                                            // bar 3 (I→V): C bass, then the bass WALKS DOWN B A toward G — home leaving for the dominant
           [67,26,4],[69,32],[67,33],                                            // bar 4 (V): G bass · dyads · A-G
           [67,34,4],[69,40],[67,41],                                            // bar 5 (V): again
           [67,42,4],[69,48],[67,49],                                            // bar 6 (V): G bass again (the score ties it, but a tied pluck has already decayed — restrike per Pavel's ear) · dyads · A-G
           [67,50,4],[69,54,2],[71,56,2],                                            // bar 7 (V→I): G bass, then walks back UP A B toward home — the dominant's pull
           [72,58,4]],                                                           // bar 8 (I, the 1st ending): C bass home · dyads — its closing eighths are cols 0-1, wrapping the loop
      chords:[[[72,76],4],[[72,76],6],[[72,76],12],[[72,76],14],[[72,76],20],  // I-bar dyads: staccato C5+E5 pairs on beats 2 & 3
              [[71,74],28],[[71,74],30],[[71,74],36],[[71,74],38],[[71,74],44],[[71,74],46],[[71,74],52],  // V-bar dyads: B4+D5
              [[72,76],60],[[72,76],62]] },                                    // 1st-ending dyads: home C5+E5
    credit:"🎵 “Shave and a hair-cut… two bits!” That “two bits” is V → I, the dominant's pull home — hear the very top note climb B → C, the strongest landing of all." },
  // Sun & Moon Garden — the wistful minor mood. The Moldau, set in A minor (all natural notes).
  moldau: { title:"The Moldau", cols:54, meter:"6/8", origin:1,                                       // Pavel's tuned version (from save-link, 2026-07-01) matching his score (flute part, E minor 6/8 "Allegro commodo non agitato") → A minor, all naturals ✓. 6/8 lilt: 1 col = 8th, bar = 6 cols.
    mel:[[64,0],                                                               // pickup: the LOW mi (E4, staccato 8th) — the river rising from the deep fifth below
         [69,1,2],[71,3],[72,4,2],[74,6],                                          // bar 1: la-ti do-re — the rising lilt (♩♪ ♩♪)
         [76,7,2],[76,9],[76,10,3],                                                // bar 2: mi mi-mi (♩♪ + held) — the river broadening
         [77,13,3],[77,16,3],                                                      // bar 3: fa · fa — the accented sf peak (dotted-quarters)
         [76,19,3],[76,22,2],[76,24],                                              // bar 4: mi (♩. ♩♪) — the descent sequence begins, each degree gets the figure
         [74,25,3],[74,28,2],[74,30],                                              // bar 5: re
         [72,31,2],[74,33],[72,34,2],[72,36],                                      // bar 6: do-re do-do — the little turn on the way down
         [71,37,3],[71,40,2],[71,42],                                              // bar 7: ti
         [69,43,6]],                                                             // bar 8: la — home on the moon's rest, ringing out
    credit:"🎧 That's “The Moldau” by Smetana — a famous river in the wistful minor mood you just met. The same seven notes as the sunny garden, but it rests on the moon's home, so it feels misty and far away." },
  // Twin Blooms Plus — tension & release. The Westminster / Big Ben chimes: MAJOR key, all naturals (melody uses only C D E G),
  // so no minor-scale leading-tone problem. The chime's very identity IS tension→release: the "ding-dong" phrases hang on the
  // dominant, then the hour strikes HOME. We voice the cadence as G7 (G-B-D-F — holds the exact F-B tritone the lessons drill) → C.
  // Nothing invented: the V7→I is how the chime is harmonised. 4/4, ♩=84 (quarter=2 cols, phrase-end half=4 cols).
  bigben: { title:"Big Ben Chimes", cols:56, meter:"4/4", origin:0,                                   // Pavel's tuned version (from save-link). MAJOR, all naturals (melody uses only C D E G). The chime's identity IS tension→release.
    mel:[[76,0,2],[74,2,2],[72,4,2],[67,6,4],                                          // phrase 1: mi re do sol — hangs on sol (dominant)
         [72,10,2],[74,12,2],[76,14,2],[72,16,4],                                     // phrase 2: do re mi do
         [76,20,2],[72,22,2],[74,24,2],[67,26,4],                                     // phrase 3: mi do re sol — hangs on sol again
         [67,30,2],[74,32,2],[76,34,2],[72,36,4]],                                    // phrase 4: sol re mi do — lands on home (do)
    chords:[[[67,71,74,77],40,4],                                               // TENSION: G7 (G-B-D-F) — the dominant-7th hanging, holds the F-B tritone
            [[72,76,79],44,8]],                                                 // RELEASE: the hour strikes HOME — C major (F→E, B→C) resolves
    credit:"🔔 That's the “Westminster Chimes” — Big Ben's famous bells! Hear the tune hang in the air on a restless, unfinished chord, leaning hard toward home... and then the clock strikes and it all settles into rest. That pull from tension to home is the very shiver-then-sigh you just learned to weave." },
  // False Doors — the deceptive V→vi. Pachelbel's Canon (famous composer, real piece): the false-door move woven through it.
  pachelbel: { title:"Pachelbel's Canon", cols:32, meter:"4/4", origin:0,                             // from the score (Canon in D, ♩=70) → transposed to C; the 8 chords as HALF notes, voiced up in the treble with the famous descant as the top voice
    //   descant (top): E5 D5  C5  B4  A4  G4  A4  B4   — the iconic descending Pachelbel melody
    chords:[[[67,72,76],0,4],[[67,71,74],4,4],[[64,69,72],8,4],[[64,67,71],12,4],[[60,65,69],16,4],[[60,64,67],20,4],[[60,65,69],24,4],[[62,67,71],28,4]],  // I V vi iii IV I IV V
    credit:"🎼 That's “Pachelbel's Canon” — the most famous chord journey ever written, heard at a thousand weddings. Listen for the moment it slips from V to vi instead of going home — the false door you just learned — and feel why it aches so sweetly." },
  // Question & Answer — open call + closed answer. Amazing Grace: line 1 climbs up and hangs (open); line 2 settles home (closed).
  amazinggrace: { title:"Amazing Grace", cols:48,                  // CAPSTONE (Q&A reward) — LINE 1 + LINE 4 of Pavel's transcription, ♩=80. Lines 2 & 4 are the SAME phrase bar the last note (L2 hangs open on high sol / L4 resolves home on do), so L1+L4 = a clean, contiguous call→home-answer (Pavel's pick 2026-06-30: "not 100% accurate but very close, illustrates the concept well"). sol=67 do=72 mi=76 re=74 la=69.
    mel:[[67,0],[72,2],[76,6],[72,7],[76,8],[74,12],[72,14],[69,18],[67,20],[67,24],   // L1 (CALL) "A-maz-ing grace, how sweet the sound" — climbs (with the mi·do·mi turn), then dips and hangs OPEN on the low sol
         [72,26],[76,30],[72,31],[76,32],[74,36],[72,38]],                             // L4 (ANSWER) "…was blind, but now I see" — same shape as L2 but settles all the way HOME on do
    jukebox:{ cols:96, meter:"3/4", origin:2,                                                                 // JUKEBOX = the FULL verse, exactly as Pavel typed it in. Capstone & jukebox MAY differ: jukebox is the whole song, capstone just the teaching arc above.
      mel:[[67,0,2],[72,2,4],[76,6],[72,7],[76,8,4],[74,12,2],[72,14,4],[69,18,2],[67,20,4],[67,24,2], // "Amazing grace, how sweet the sound"
           [72,26,4],[76,30],[72,31],[76,32,4],[74,36,2],[79,38,6],                            // "that saved a wretch like me!"
           [76,48,2],[79,50,3],[76,53],[79,54],[76,55],[72,56,4],[67,60,2],[69,62,3],            // "I once was lost, but now am found"
           [72,65],[72,66],[69,67],[67,68,4],[67,72,2],[72,74,4],[76,78],[72,79],[76,80,4],[74,84,2],[72,86,6]] },  // "was blind, but now I see" — resolves HOME on do
    credit:"🎵 That's “Amazing Grace.” Hear how the first line rises and then hangs in the air, still asking — that's the open call. The second line echoes it but settles all the way home. One question, one reply — the very shape you just built." },
  // Twin Blooms — harmonic pairs. Three blooms, one of each feeling, with the famous sounds each lives in.
  blooms: { title:"Three Famous Blooms",
    chords:[ [[62,64],2], [[72,76],7], [[60,67],12] ],              // CLOSE 2nd (D+E) · BRIGHT 3rd (C+E) · OPEN 5th (C+G)
    credit:"🌸 Three famous blooms! A CLOSE pair hums right next to itself — cozy and buzzy. A BRIGHT pair is a sunny 3rd, the leap that opens “When the Saints Go Marching In.” And an OPEN pair rings wide as a 5th — the sound of bagpipes droning and grand fanfares. Same two-note magic, three different feelings." },
  // Footsteps — steady pulse + backbeat, rendered on the DRUM pads (lane 0 kick, 1 snare, 2 hi-hat).
  // NO METER: this pattern is ONE bar of 16ths (the standard notation: dotted-8th, 16th tied to an 8th, 8th,
  // 8th rest, 8th, quarter — onsets at 16ths 0,3,6,10,12, exactly the kick below; owner, 2026-09-27). Read
  // as eighths it would be two bars with the snare on beat 3 and the hats on quarters, so no METERS preset
  // describes it — the same 16th-grid question as the Charleston and the Bach Prelude.
  bodiddley: { title:"The Bo Diddley Beat",
    drums:[ [0,0],[0,3],[0,6],[0,10],[0,12],                        // kick: the famous 3-2 clave (the signature bounce)
            [1,4],[1,12],                                           // snare: the backbeat you just learned
            [2,0],[2,2],[2,4],[2,6],[2,8],[2,10],[2,12],[2,14] ],   // hi-hats: steady 8th shimmer
    credit:"🥁 That's the Bo Diddley beat — a groove so catchy that whole songs ride on this one rhythm! The kick taps out its famous bouncing pattern — boom ba-boom ba-boom… boom-boom — while the snare keeps the backbeat you just learned. A rhythm with a name of its own." },
  // Tiny Motifs — one idea, repeated & resolved. The Largo cor-anglais theme from Dvořák's "New World"
  // Symphony (1893), so loved it became the song "Goin' Home" — and famously PENTATONIC, so it fits this
  // package's palette. Pavel's score-checked version (from save-link, 2026-07-06): 8 bars, A B A B' —
  // the B phrase hangs OPEN on re, then B' returns and settles HOME on do: repetition plus a resolving
  // twist, exactly the lesson. 4/4 Largo, the score's ♩=60 nudged to 66 at the owner's ear (2026-09-27): 1 col = 8th; held phrase-end notes ring through their gaps.
  goinhome: { title:"Goin' Home (New World Symphony)", cols:64, meter:"4/4", origin:0,
    mel:[[64,0,3],[69,3],[69,4,4],                                      // bar 1: mi—— la la——     ("go-in' home")
         [64,8,3],[62,11],[60,12,4],                                    // bar 2: mi—— re do——     ("go-in' home")
         [62,16,3],[64,19],[69,20,3],[64,23],                           // bar 3: re— mi la—— mi   ("I'm a-go-in' home")
         [62,24,8],                                                   // bar 4: re———— (hangs OPEN, still away from home)
         [64,32,3],[69,35],[69,36,4],                                   // bar 5: the little motif returns
         [64,40,3],[62,43],[60,44,4],                                   // bar 6: mi—— re do——
         [62,48,3],[64,51],[62,52,3],[60,55],                           // bar 7: re— mi re—— do
         [60,56,8]],                                                  // bar 8: do———— (the twist: this time it settles HOME)
    credit:"🌍 That's the Largo from Dvořák's “New World” Symphony — a tune so loved it became the song “Goin' Home.” Listen: one tiny motif, sung twice — and the second time, it finds its way home. A world-famous melody grown from one little seed, just like yours." },
  // Wind & Gaps — space + syncopation, on the DRUM pads. The Charleston barely touches the beats and dances in the gaps.
  charleston: { title:"The Charleston",
    drums:[ [0,0],[0,8],                                            // kick: just the downbeats 1 & 3 (the anchor)
            [1,6],[1,14] ],                                         // snare: the off-beat Charleston stabs, floating in the GAPS
    credit:"🎩 That's the Charleston — the most famous bounce in music, from the roaring 1920s dance everyone knew. Listen how it barely touches the main beats and leaps into the GAPS between them instead. That off-beat hop is exactly the groove-from-space you just discovered." },
  // Off the Path — syncopation. Gershwin's "I Got Rhythm" (1930; the composition entered the US public
  // domain 2026-01-01). The A-section is the syncopation lesson made famous: three "I got…" phrases ride
  // a four-note pentatonic cell (sol-la-do-re) landing a beat BEHIND the pulse — dotted-quarter chain,
  // only one note per phrase touches a strong beat — then "who could ask for anything more" answers with
  // a pickup-led mi-re turn that settles home on do. Pure pentatonic, fits this package's 10-row grid.
  // A steady kick pulse is planted under it so the lean-off-the-beat is audible. 8 bars, C major, 1 col = 8th.
  // Pavel's score-checked save-link version (2026-07-10): my draft's last line was WRONG (a plain
  // stepwise descent) — the real line re-picks up early (re on the crack at col 47) into mi-mi re-mi-re do.
  igotrhythm: { title:"I Got Rhythm", cols:64, meter:"4/4", origin:0,
    drums:[[0,0],[0,4],[0,8],[0,12],[0,16],[0,20],[0,24],[0,28],   // kick: the steady walking pulse
           [0,32],[0,36],[0,40],[0,44],[0,48],[0,52],[0,56],[0,60]], // …the tune dances AGAINST it
    mel:[[67,2,3],[69,5,3],[72,8,3],[74,11,3],                              // "I got rhythm"  — sol la do re, rising, a beat behind
         [74,18,3],[72,21,3],[69,24,3],[67,27,3],                           // "I got music"   — the same cell falling
         [67,34,3],[69,37,3],[72,40,3],[74,43,2],[79,45,2],                 // "I got my man"  — rising again, still off the path. The high G5 at 45 was MISSING
                                                                            // until the owner's score review (2026-09-27); the D5 before it shortens to a quarter.
         [74,47],[76,48,2],[76,50,2],[74,52],[76,53],[74,54,2],[72,56,8]],  // "who could ask for anything more" — a pickup in the crack, then the mi-re turn settling home on do
    credit:"🕺 That's “I Got Rhythm” by George Gershwin — a song so proud of its rhythm it's named after it! Listen: every “I got…” lands just OFF the steady pulse, skipping in the cracks — exactly the trick you just learned — until the last line rushes back onto the beat. Jazz musicians still build new songs on its bones." },
  // Shifting Shadows — voicing/inversions. Bach's Prelude in C (WTC I, BWV 846, 1722; PD). The most famous
  // broken-chord piece ever: chords lean into new shapes over a barely-moving bass. 1 col = a 16th
  // (FAMOUS_TEMPO doubled to compensate). Pavel's save-link version (2026-07-12, both tiers): the first
  // FOUR bars at full length (each 8-note half-pattern twice, 16 cols/bar) — C · Dm7/C · the G7 bar with
  // its B3 bass (below the C4 grid floor) read as a C pedal · C home again — then a 16-col ringing tail
  // before the loop wraps (cols:80). My draft's held-chord flourish dropped; all naturals.
  bachprelude: { title:"Prelude in C (Bach)", cols:80,
    mel:[[60,0],[64,1],[67,2],[72,3],[76,4],[67,5],[72,6],[76,7],              // bar 1: C major — the pattern that made history
         [60,8],[64,9],[67,10],[72,11],[76,12],[67,13],[72,14],[76,15],
         [60,16],[62,17],[69,18],[74,19],[77,20],[69,21],[74,22],[77,23],      // bar 2: D minor 7 TURNED over the same low C
         [60,24],[62,25],[69,26],[74,27],[77,28],[69,29],[74,30],[77,31],
         [60,32],[62,33],[67,34],[74,35],[77,36],[67,37],[74,38],[77,39],      // bar 3: the dominant leaning over the same stone
         [60,40],[62,41],[67,42],[74,43],[77,44],[67,45],[74,46],[77,47],
         [60,48],[64,49],[67,50],[72,51],[76,52],[67,53],[72,54],[76,55],      // bar 4: home again — the bass never moved
         [60,56],[64,57],[67,58],[72,59],[76,60],[67,61],[72,62],[76,63]],
    credit:"🌅 That's the Prelude in C by Johann Sebastian Bach, written three hundred years ago — perhaps the most famous broken-chord piece on Earth. Listen to the lowest stone: it never moves, while the towers above it turn into new shapes — the same turning trick you just learned. People love it so much that another composer floated the melody “Ave Maria” right on top of it." },
  // Soft Wobble — graded tension. "Chopsticks" (The Celebrated Chop Waltz, Euphemia Allen, 1877; PD).
  // The most famous WOBBLE in music: a soft whole-step shimmer (F+G) struck over and over, melting by
  // grades — a bright 3rd, an open 6th, home to a calm octave. Dissonance resolving by degrees = this
  // package's lesson, verbatim. 3/4 waltz, 1 col = 8th so a quarter strike = 2 cols.
  // Pavel's score-checked save-link version (2026-07-14), TWO-TIER: JUKEBOX = the full first section,
  // two passes — the first ends in the classic turnaround (octave ×4, then D+B → E+A walking back in),
  // the second closes properly (one final octave, then a descending G–E–C walk home). CAPSTONE (top
  // level) = the second pass alone, ending with the true cadence.
  chopsticks: { title:"Chopsticks", cols:48,
    mel:[[65,0],[67,0],[65,2],[67,2],[65,4],[67,4],[65,6],[67,6],[65,8],[67,8],[65,10],[67,10],          // F+G — the famous SOFT wobble, six strikes
         [64,12],[67,12],[64,14],[67,14],[64,16],[67,16],[64,18],[67,18],[64,20],[67,20],[64,22],[67,22], // E+G — the wobble melts into a bright 3rd
         [62,24],[71,24],[62,26],[71,26],[62,28],[71,28],[62,30],[71,30],[62,32],[71,32],[62,34],[71,34], // D+B — wider still, an open calm 6th
         [60,36],[72,36],                                                                                 // C+C — home: a perfectly still octave…
         [67,38],[64,40],[60,42]],                                                                        // …and the closing walk down: G, E, C
    jukebox:{ cols:102, meter:"3/4", origin:0,
      mel:[[65,0,2],[67,0,2],[65,2,2],[67,2,2],[65,4,2],[67,4,2],[65,6,2],[67,6,2],[65,8,2],[67,8,2],[65,10,2],[67,10,2],         // pass 1: F+G shimmer ×6
           [64,12,2],[67,12,2],[64,14,2],[67,14,2],[64,16,2],[67,16,2],[64,18,2],[67,18,2],[64,20,2],[67,20,2],[64,22,2],[67,22,2], // E+G ×6
           [62,24,2],[71,24,2],[62,26,2],[71,26,2],[62,28,2],[71,28,2],[62,30,2],[71,30,2],[62,32,2],[71,32,2],[62,34,2],[71,34,2], // D+B ×6
           [60,36,2],[72,36,2],[60,38,2],[72,38,2],[60,40,2],[72,40,2],[60,42,2],[72,42,2],                                 // C+C octave ×4…
           [62,44,2],[71,44,2],[64,46,2],[69,46,2],                                                                 // …then the turnaround: D+B, E+A walk back in
           [65,48,2],[67,48,2],[65,50,2],[67,50,2],[65,52,2],[67,52,2],[65,54,2],[67,54,2],[65,56,2],[67,56,2],[65,58,2],[67,58,2], // pass 2: F+G ×6
           [64,60,2],[67,60,2],[64,62,2],[67,62,2],[64,64,2],[67,64,2],[64,66,2],[67,66,2],[64,68,2],[67,68,2],[64,70,2],[67,70,2], // E+G ×6
           [62,72,2],[71,72,2],[62,74,2],[71,74,2],[62,76,2],[71,76,2],[62,78,2],[71,78,2],[62,80,2],[71,80,2],[62,82,2],[71,82,2], // D+B ×6
           [60,84,2],[72,84,2],                                                                                 // one final octave…
           [67,86,2],[64,88,2],[60,90,6]] },                                                                      // …and the walk home: G, E, C
    credit:"🥢 That's Chopsticks — the first tune half the world ever learns to play! Listen to what it is made of: one SOFT wobble, two notes rubbing shoulders, struck again and again — and then the wobble melts, step by step, wider and wider, all the way home to a perfectly calm octave. A whole famous song built from a single softening shimmer." },
  // Two Kinds of Walking — the FIRST entry written with real note lengths (the third number on each tuple).
  // Traditional spiritual, public domain; transposed from the score's F major UP a fifth into C, which lands
  // the whole tune inside the pentatonic palette (it only ever uses do-re-mi-sol-la) and inside the C4–A5 field.
  // One column = one eighth at ♩=88, so a quarter is 2 columns and the tonic it lands on is a whole note = MAX_VINE.
  // NOTE LENGTHS ARE THE OWNER'S, from his own save link (2026-08-13) — in particular the dotted cha-ri-ot figure,
  // which keeps the score's printed 3:1 dot rather than evening it into swung eighths. Never re-even it.
  swinglow: { title:"Swing Low, Sweet Chariot", cols:32,
    // CAPSTONE = the first phrase only, a pure TRUNCATION of the jukebox below (shortening is allowed, rewriting
    // is not — so the last note keeps its own length rather than being stretched to fill the bar). It lands on
    // the fifth, which leaves the phrase asking a question; the Studio version below answers it by going home.
    mel:[[76,0,2],                                            // Swing              (quarter pickup)
         [72,2,6],                                            // low,               (dotted half — the first hold)
         [76,8,2],                                            // sweet
         [72,10,3],[72,13],[69,14],[67,15,3],                 // cha-ri-ot,         a dotted step, two quick ones, a hold
         [72,18],[72,19],[72,20],[72,21],                     // Com-in' for to     four quick steps
         [76,22],[76,23],[79,24,2],                           // car-ry me
         [79,26,6]],                                          // home.              held — but on the fifth, still hanging
    jukebox:{ cols:72, meter:"4/4", origin:2,                                        // JUKEBOX = both phrases, landing home. Capstone & jukebox MAY differ.
      mel:[[76,0,2],[72,2,6],[76,8,2],
           [72,10,3],[72,13],[69,14],[67,15,3],
           [72,18],[72,19],[72,20],[72,21],
           [76,22],[76,23],[79,24,2],[79,26,6],
           [81,32],[79,33],                                   // Swing — a two-note pickup into the second phrase
           [76,34,6],                                         // low,
           [79,40,2],                                         // sweet
           [72,42,3],[72,45],[69,46],[67,47,3],               // cha-ri-ot,
           [72,50],[72,51],[72,52],[72,53],                   // Com-in' for to
           [76,54],[76,55],[74,56,2],                         // car-ry me          (this time it steps DOWN to land)
           [72,58,8]] },                                      // home.              the tonic, a whole note, longest of all
    credit:"🎧 That's Swing Low, Sweet Chariot — and listen to where it holds. Every line hurries along in quick little steps and then leans on a long one, exactly like the walks you have been building. It ends the way your own walks do, on a note that holds. 🎶" },
};
// Each famous example plays at its OWN tempo (quarter-note BPM) — Taps slow & mournful, the grooves brisk — in BOTH the jukebox and the capstone reward. (Default 108 when unlisted.)
const FAMOUS_TEMPO={ swinglow:88, taps:40, pachelbel:70, amazinggrace:80, moldau:112, joy:100, mary:150, bigben:84, odetojoy:100, charleston:116, shave:128, bodiddley:130, goinhome:66, igotrhythm:156, bachprelude:126, chopsticks:132 };   // bachprelude cols are 16ths → BPM doubled (sounds like ♩=63)
function famousRow(m){ for(let r=0;r<ROWS;r++) if(MIDI[r]===m) return r; return -1; }   // grid row for a MIDI pitch in this palette
// Which package reveals this entry: the one whose level carries famous:id. Each id is on exactly one level.
function famousOwner(id){ for(const pid in PACKAGES){ if((PACKAGES[pid].levels||[]).some(l=>l.famous===id)) return pid; } return null; }
// Has EVERY child who reaches this package already been taught the vine? True for two-kinds-of-walking and for
// anything that requires it, however indirectly. Nothing does today — it is a leaf on the rhythm branch — so
// swinglow is the only reveal that may hold a note. The lengths written on the other entries are for the
// Jukebox, which opens in the Studio, where vines are simply part of the instrument.
function vinesTaughtBy(pid, seen){ if(!pid) return false; if(pid==="two-kinds-of-walking") return true;
  seen=seen||new Set(); if(seen.has(pid)) return false; seen.add(pid);
  const p=PACKAGES[pid]; return !!(p && (p.requires||[]).some(q=>vinesTaughtBy(q,seen))); }
// Keyed on the entry's OWNER, never on currentPkg: a pure function of the id, so a reveal that fires after
// navigation, a test, or the I_famous_sweep golden all see the same answer.
const famousHolds=id=>vinesTaughtBy(famousOwner(id));
function placeFamous(f, tempo, holds){ tx("famous",()=>{                             // ONE journal entry — a 100-note reveal must not evict the player's undo history
  if(f.cols && f.cols>COLS) addColumns(f.cols-COLS);   // a rhythmic tune (e.g. Amazing Grace) needs room to breathe — held notes ring through the gaps
  wipe();
  (f.chords||[]).forEach(([midis,col])=> midis.forEach(m=>{ const r=famousRow(m); if(r>=0&&col<COLS) setCell(r,col,true); }));  // chords (block triads, MIDI)
  (f.mel||[]).forEach(([m,col])=>{ const r=famousRow(m); if(r>=0&&col<COLS) setCell(r,col,true); });                            // melody on top
  // …then the LENGTHS, once every onset is down. A third element on a mel or chord tuple is the note's length
  // in columns, from the score. It is honoured here ONLY when `holds` says the package that owns this reveal
  // has taught the vine: before that, a held note in a reward is an unexplained mystery; after, it is the
  // lesson turning up in a real song. This used to be enforced by nobody writing lengths anywhere else —
  // which stopped being true the moment the Jukebox wanted them, since six entries share one `mel` between
  // their reveal and their Jukebox song.
  if(holds){ const t=melTrack();
    const hold=(m,col,len)=>{ if(!len||len<2) return; const r=famousRow(m); if(r<0||col>=COLS) return;
      const n=t.notes.find(q=>q.pitch===m && noteCol(q)===col); if(!n) return;
      n.durationTicks=Math.min(len, MAX_VINE, COLS-col)*TICKS_PER_COL; };
    (f.mel||[]).forEach(([m,col,len])=>hold(m,col,len));
    (f.chords||[]).forEach(([ms,col,len])=>ms.forEach(m=>hold(m,col,len))); }
  reproject();
  if(f.drums&&f.drums.length){ if(!drumsOn){ drumsOn=true; drumBtn.classList.add("on"); } showDrumArea(true);                   // rhythm examples (footsteps, wind & gaps): plant the beat on the pads
    wipeDrums(); placeDrums(f.drums.filter(([d,c])=>d<DRUMS.length&&c<COLS)); syncCursor(); }        // the lane just became visible — re-measure the cursor rail
  // The tune's own tempo belongs INSIDE this transaction. Set after it had closed, it was missing from the
  // journal's "after" snapshot, so undo restored the player's tempo correctly and redo brought the arrangement
  // back at that tempo instead of the tune's — Taps replayed at 108. tx() snapshots after fn() returns.
  if(tempo){ if(tempoOnLoan===null) tempoOnLoan=+tempoEl.value;   // remember the child's before borrowing
             tempoEl.value=tempo; } });
  renderVines(); }                       // …and draw the stems: setCell's own render ran before the lengths were written
let famousTimers=[];
function clearFamousTimers(){ famousTimers.forEach(clearTimeout); famousTimers=[];
  document.querySelectorAll(".col-playing").forEach(e=>e.classList.remove("col-playing")); }   // a reveal lights cells outside the transport — litEls doesn't know about those
function playFamous(id){ const f=id&&FAMOUS[id]; if(!f) return 0;
  if(playing) stop(); clearFamousTimers();
  placeFamous(f, FAMOUS_TEMPO[id], famousHolds(id));    // draw the chords + melody on the field (it STAYS — ▶ replays it),
                                                        // at the song's OWN tempo (Taps slow, grooves brisk); ▶ replay inherits it
  setStatus(f.credit);
  initAudio(); actx.resume();
  // This sweep runs entirely outside tick(), so it has never moved the view — and placeFamous widens the field
  // to the tune's own length (32–100 columns), so on a phone a child watched most of the reveal happen
  // off-screen. It is the one moment the whole level was built to earn.
  CAM.yielded=false; camTo(0,true);
  const sd=stepDur()/1000, t0=actx.currentTime+0.12; let lastC=0;   // same tempo as ▶ Play (which now replays this arrangement)
  const hasDrums=!!(f.drums&&f.drums.length);
  for(let c=0;c<COLS;c++){ const rows=[]; for(let r=0;r<ROWS;r++) if(grid[r][c]) rows.push(r);
    const lanes=[]; if(hasDrums) for(let d=0;d<DRUMS.length;d++) if(drumG[d][c]) lanes.push(d);
    if(!rows.length && !lanes.length) continue; lastC=c;
    // sound the pitched column (audio clock), each note for as long as it actually holds. NOT holdOf(): that
    // reads anchorSPT, which the Transport freezes at ITS anchor — and this sweep books its own time from sd.
    rows.forEach(r=>{ const n=gridNote[r]&&gridNote[r][c];
      const hold=(n&&n.durationTicks>TICKS_PER_COL) ? (n.durationTicks/TICKS_PER_COL)*sd : 0;
      voice(instrEl.value, midiToFreq(MIDI[r]), t0+c*sd, hold); });
    lanes.forEach(d=>DRUMS[d].play(t0+c*sd));                                       // sound the drum hits
    famousTimers.push(setTimeout(()=>{ camEnsure(c,{});                            // follow the sweep, same law as ▶
      rows.forEach(r=>flash(cells[r][c],r));                                       // light it (wall clock, aligned)
      if(rows.length) bloom(cells[rows[0]][c], rows.length>=2?"💐":noteFlower(rows[0]));
      lanes.forEach(d=>{ const el=dcells[d]&&dcells[d][c]; if(el){ el.classList.add("col-playing"); setTimeout(()=>el.classList.remove("col-playing"),150); } });
      compReact(); }, 120+c*sd*1000)); }
  return 120 + (lastC+1)*sd*1000;                       // ms until the last column has sounded (so we can speak right after)
}
// Surface it as a REWARD: after a famous-bearing level is completed (and its power card claimed), plant + auto-play it.
// No dedicated button — the arrangement STAYS on the grid, so ▶ Play replays it like any tune.
let pendingFamous=null;
function revealFamous(id){ const f=id&&FAMOUS[id]; if(!f) return;
  if((curStage().famous||currentLevel().famous)!==id) return;                   // navigated away before the reveal fired — skip
  const durMs=playFamous(id);                                                     // plant the chords+melody and play it once
  goalHint.innerHTML='🎧 <b>You built the famous one!</b> It\'s planted in your garden now — press <b>▶</b> to hear it again.';
  if(speakOn) famousTimers.push(setTimeout(()=>narrate(f.credit), durMs+900));    // voice the explanation ONCE, just after the song's first play settles
}
// ARCS: the campaign groups into four "awakening arcs". The arc: field on intro levels still drives companion
// evolution (arcEndsFor) — but the arc label is NOT shown in the level title (removed 2026-07-03: noise for players).

