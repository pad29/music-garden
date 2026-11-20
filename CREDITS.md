# Credits and licences

Tune Garden is made by Pavel Dmitriev, and it plays, shows and speaks other people's work too. This file
says what is under which licence, and credits every sample pack, font, library and famous tune the game
ships, with the source for each claim. It is a record, not legal advice: if you find a mistake, open an
issue.

## Licences at a glance

**Copyright (C) 2026 Pavel Dmitriev.**

| What | Licence | Full text |
|---|---|---|
| **The code**: `index.html`, `js/` (the level, quest and famous-tune data included — but see below for the tunes themselves), `tools/`, `tests/`, `backend/`, `spike/`, the scripts in `.claude/`, `.github/workflows/`, `cloudflare-build.sh`, `_headers` — every file not named in another row | GNU Affero General Public License, version 3 or (at your option) any later version — **AGPL-3.0-or-later** | [`LICENSE`](LICENSE) |
| **The narration clips**: `voice/*.mp3` | Creative Commons Attribution-ShareAlike 4.0 — **CC BY-SA 4.0** | [`LICENSE-CC-BY-SA.md`](LICENSE-CC-BY-SA.md) |
| **The docs**: every Markdown (`*.md`) file at any depth, this one included, and `.github/screenshot.png` | **CC BY-SA 4.0** | [`LICENSE-CC-BY-SA.md`](LICENSE-CC-BY-SA.md) |
| **The instrument samples**: `samples/<instr>/*.mp3`, and the packs `samples/<instr>.js` built from them | each pack's own licence | [Instrument samples](#instrument-samples) |
| **The fonts and the sign-in library** in `vendor/` | their own licences | [Fonts and sign-in library](#fonts-and-sign-in-library) |
| **The name "Tune Garden" and its 🌱 wordmark** | not licensed | [The name and logo](#the-name-and-logo) |

The code's notice, as the AGPL asks:

> This program is free software: you can redistribute it and/or modify it under the terms of the GNU
> Affero General Public License as published by the Free Software Foundation, either version 3 of the
> License, or (at your option) any later version. This program is distributed in the hope that it will
> be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
> A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

**Both licences cover only the project's own work.** They license nothing the project does not own:

- **Other people's music** — the compositions and arrangements behind the famous-tune and level data — is
  not the project's: each has the status [Famous melodies](#famous-melodies) gives it, the flagged rows
  included. The licences cover the project's own contributions: its transcriptions, voicings,
  accompaniments and code, and its own tunes, such as the melody of `fourchord`.
- **The licence texts** are their authors': `LICENSE` is the Free Software Foundation's, copied verbatim as
  it permits, and the licence and notice files in `vendor/` belong to the projects they came from.
- **Quotations inside the docs** — AWS's terms, licence excerpts, other projects' words — stay their owners'.
- **`CODE_OF_CONDUCT.md`** is the [Contributor Covenant](https://www.contributor-covenant.org/), version
  2.1, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); only its contact address is the
  project's.

`vendor/README.md` and `vendor/SHA256SUMS` are the project's own; the files they describe are not.

## The name and logo

Neither licence grants any right to use the name "Tune Garden" or its 🌱 wordmark as a brand — to name a
fork, or to suggest endorsement. Saying truthfully that a work is based on Tune Garden, and the credit the
licences require, are fine.

## Instrument samples

Real recordings, pitch-shifted as they play. The game's map footer credits the two CC BY packs and links
here. "What we changed" is from `tools/build-samples.mjs`; every pack is also base64-encoded into
`samples/<instr>.js`, a generated file, so the game can load it over `file://`.

| Voice | Pack | By | Licence | Source | What we changed |
|---|---|---|---|---|---|
| piano | Salamander Grand Piano V3 | Alexander Holm | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [sfzinstruments/SalamanderGrandPiano](https://github.com/sfzinstruments/SalamanderGrandPiano) (from [archive.org](https://archive.org/details/SalamanderGrandPianoV3)); our copy came from the Tone.js project's mp3 set, `tonejs.github.io/audio/salamander/`, no longer online | 9 notes kept (every 3rd semitone, C4–C6) |
| harp | Etherealwinds Harp II: Community Edition | Versilian Studios LLC; the harp played by Jordi Francis ("Etherealwinds") | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [versilian-studios.com/etherealwinds-harp](https://versilian-studios.com/etherealwinds-harp/) | 9 notes of the loud layer, first round-robin; converted to mp3; trimmed to 3.2 s |
| marimba | Versilian Community Sample Library (VCSL), "Outrigger" marimba | Versilian Studios LLC | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [sgossner/VCSL](https://github.com/sgossner/VCSL) | 5 notes of the medium layer; 24-bit WAV converted to mono mp3; peak-normalised |
| vibraphone | VCSL vibraphone, soft mallets | Versilian Studios LLC | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [sgossner/VCSL](https://github.com/sgossner/VCSL) | 8 notes of the second layer; converted to mp3; trimmed to 3.2 s |
| glockenspiel | VCSL glockenspiel, medium mallets | Versilian Studios LLC | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [sgossner/VCSL](https://github.com/sgossner/VCSL) | 6 notes; converted to mp3; each retuned by 9–24 cents |
| kalimba | FreePats kalimba | the FreePats project: recorded by Gonzalo and Roberto, edited by Roberto, with Xavimart | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [freepats.zenvoid.org — kalimba](https://freepats.zenvoid.org/Ethnic/kalimba.html) | 7 tines; converted to mp3; each retuned to its SFZ `tune` value |
| guitar | FreePats Spanish classical guitar (2008) | roberto@zenvoid.org, for the FreePats project | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [freepats.zenvoid.org — guitars](https://freepats.zenvoid.org/Guitar/acoustic-guitar.html) | 9 notes; FLAC converted to mp3 |

## Fonts and sign-in library

Copied byte for byte from their releases into `vendor/`, with their licence files beside them. Versions,
sources and hashes: [`vendor/README.md`](vendor/README.md).

| What | By | Licence |
|---|---|---|
| Fredoka (400, 500, 600) | The Fredoka Project Authors | SIL Open Font License 1.1 — [`vendor/fonts/fredoka/OFL.txt`](vendor/fonts/fredoka/OFL.txt) |
| Nunito (400, 600, 700, 800) | The Nunito Project Authors | SIL Open Font License 1.1 — [`vendor/fonts/nunito/OFL.txt`](vendor/fonts/nunito/OFL.txt) |
| amazon-cognito-identity-js 6.3.22 | Amazon.com, Inc. or its affiliates | Apache License 2.0 — [`vendor/cognito/LICENSE.txt`](vendor/cognito/LICENSE.txt), with its notices in [`vendor/cognito/NOTICE.txt`](vendor/cognito/NOTICE.txt) |

## Narration

The level stories are read aloud by clips in `voice/`, made with **Amazon Polly** — the generative
engine, voice *Joanna* — by `tools/gen-voice.mjs`. The words are the project's own (the `intro:` strings
in `js/`). AWS's Service Terms § 50.2 say "The output that you generate using AI Services is Your
Content" ([aws.amazon.com/service-terms](https://aws.amazon.com/service-terms/)), so the clips are licensed
with the docs, under CC BY-SA 4.0. The voice is synthetic: it imitates no real person. Where synthetic
speech carries no copyright of its own, the licence covers whatever rights exist.

## Famous melodies

The game draws each tune as notes on its own grid and plays them with its own voices: no recording of
anyone's performance ships, so only the composition matters. The owner transcribed or checked each one
against score images found online; no particular edition is claimed. The voicings, accompaniments and
teaching excerpts are the project's own, except where a row says otherwise. These are the `FAMOUS` entries
in `js/famous.js`.

| Key | Work | Composer or source | Year | Status | Source |
|---|---|---|---|---|---|
| `fourchord` | The I–V–vi–IV chord progression, with a tune of our own on top | none — a common progression | — | A chord progression is not protected; the tune on top is the project's own | [I–V–vi–IV](https://en.wikipedia.org/wiki/I%E2%80%93V%E2%80%93vi%E2%80%93IV_progression) |
| `mary` | Mary Had a Little Lamb | traditional American; the familiar tune's composer is unknown (Lowell Mason's 1831 setting is a different, forgotten tune) | words 1830; tune 19th century | US: public domain. Elsewhere: not checked (a traditional tune) | [Wikipedia](https://en.wikipedia.org/wiki/Mary_Had_a_Little_Lamb) |
| `taps` | Taps | Daniel Butterfield (d. 1901) | 1862 | Public domain | [Wikipedia](https://en.wikipedia.org/wiki/Taps_(bugle_call)) |
| `joy` | Joy to the World (the tune *Antioch*) | arranged by Lowell Mason (d. 1872), after phrases traced to Handel (d. 1759) | 1839 | Public domain | [Wikipedia](https://en.wikipedia.org/wiki/Joy_to_the_World) |
| `odetojoy` | Ode to Joy, from Symphony No. 9 | Ludwig van Beethoven (d. 1827) | 1824 | Public domain | [Wikipedia](https://en.wikipedia.org/wiki/Ode_to_Joy) |
| `shave` | Shave and a Haircut | from Charles Hale's *At a Darktown Cakewalk* | 1899 | US: public domain. Elsewhere: not checked (the composer's dates are not known). **Flagged:** the Jukebox version follows a modern piano-method arrangement (Faber), to be replaced (ticket TUN-117) | [Wikipedia](https://en.wikipedia.org/wiki/Shave_and_a_Haircut) |
| `moldau` | The Moldau (*Vltava*), from *Má vlast* | Bedřich Smetana (d. 1884) | 1874 | Public domain | [Wikipedia](https://en.wikipedia.org/wiki/Vltava_(Smetana)) |
| `bigben` | The Westminster Quarters | attributed to William Crotch (d. 1847) | 1793 | Public domain | [Wikipedia](https://en.wikipedia.org/wiki/Westminster_Quarters) |
| `pachelbel` | Canon in D | Johann Pachelbel (d. 1706) | composed 1680–1706; first published 1919 | Public domain | [Wikipedia](https://en.wikipedia.org/wiki/Pachelbel%27s_Canon) |
| `amazinggrace` | Amazing Grace (the tune *New Britain*) | traditional American; William Walker first joined the tune to John Newton's words | tune printed from 1829; *New Britain* with the words, 1835 | US: public domain. Elsewhere: not checked (a traditional tune) | [Library of Congress, *Amazing Grace* timeline](https://www.loc.gov/collections/amazing-grace/articles-and-essays/timeline/) |
| `blooms` | Three intervals: a 2nd, a 3rd and a 5th | none — not a work | — | Intervals are not protected; the credit names *When the Saints Go Marching In* (traditional) as an example | [Interval](https://en.wikipedia.org/wiki/Interval_(music)) |
| `bodiddley` | The Bo Diddley beat | Bo Diddley; a form of the 3-2 clave heard in records from 1944 on | 1955 | **Flagged:** a rhythm alone, no melody. US copyright is generally read not to protect a rhythm alone; no court ruling found. Kept by the owner | [Wikipedia](https://en.wikipedia.org/wiki/Bo_Diddley_beat) |
| `goinhome` | Largo, from Symphony No. 9 "From the New World" | Antonín Dvořák (d. 1904) | 1893 | Public domain. William Arms Fisher's song *Goin' Home* (1922) added only words, which the game does not use | [Wikipedia](https://en.wikipedia.org/wiki/Symphony_No._9_(Dvo%C5%99%C3%A1k)) |
| `charleston` | The Charleston rhythm | James P. Johnson (d. 1955); words by Cecil Mack (d. 1944), not used | 1923 | **Flagged:** a rhythm only — four drum hits, no melody. US: the song has been public domain since 2019-01-01. Life + 70 countries: since 2026-01-01. Kept by the owner | [US Copyright Office, *Copyright Lore*, January 2019](https://www.copyright.gov/history/lore/pdfs/201901%20CLore_January2019.pdf) |
| `igotrhythm` | I Got Rhythm (the melody alone) | George Gershwin (d. 1937); words by Ira Gershwin (d. 1983), not used | 1930 | **Flagged.** US: public domain since 2026-01-01. EU and UK: most likely protected to the end of 2053, because a song written with words is counted from the death of the last of its composer and lyricist (Directive 2011/77/EU). Kept for now; to be settled before any launch aimed at the EU or UK (ticket TUN-118) | [Duke, Public Domain Day 2026](https://cspd.law.duke.edu/publicdomainday/2026) (US law only) |
| `bachprelude` | Prelude in C major, BWV 846 | Johann Sebastian Bach (d. 1750) | 1722 | Public domain | [Wikipedia](https://en.wikipedia.org/wiki/Prelude_and_Fugue_in_C_major,_BWV_846) |
| `chopsticks` | The Celebrated Chop Waltz | Euphemia Allen (d. 1949) | 1877 | US: public domain. Life + 70 countries: since 2020 | [Wikipedia](https://en.wikipedia.org/wiki/Chopsticks_(music)) |
| `swinglow` | Swing Low, Sweet Chariot | African-American spiritual, attributed to Wallace Willis | 19th century | US: public domain. Elsewhere: not checked (a traditional tune) | [Wikipedia](https://en.wikipedia.org/wiki/Swing_Low,_Sweet_Chariot) |

"Public domain", alone, means two things, and no more: the work was published before 1931, so it is free in
the US; and its composer died before 1926, so life + 100 — the longest general copyright term we know of —
has ended too. Other countries' special rules were not checked. A traditional tune's row says "US: public
domain" only: its status elsewhere was not checked.

### Traditional tunes in the levels

Three early levels (`js/packages.js`, the first package) ask the player to finish well-known tunes:
*Mary Had a Little Lamb* (above), *Hot Cross Buns* (an English street cry, 18th century) and *Au clair
de la lune* (a French song, 18th century). All are traditional, and public domain in the US; other
countries were not checked.
