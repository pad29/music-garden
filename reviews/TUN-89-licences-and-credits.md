# TUN-89 — Add the licences and a credits file for every sample, font and tune

Branch `ao/licence-credits/root` · Size S · `needs-owner` · session `music-garden-41`

Not legal advice: every claim below names its source, and anything in doubt is the owner's call.

## Plan (Claude)

Measured on `origin/main` 73f6100. TUN-98 has merged: the README opening already carries the one-line
**Licence** summary linking `LICENSE` and `CREDITS.md`. TUN-81 has merged: `vendor/` holds the fonts and
the Cognito library with their licence texts, so `CREDITS.md` links them rather than naming them.

**Three files, and one line extended:**

- **`LICENSE`** — the AGPL-3.0 text from <https://www.gnu.org/licenses/agpl-3.0.txt>, byte for byte, with
  nothing added, so GitHub's licence detection recognises it. The copyright line and the "only / or
  later" choice live in `CREDITS.md`'s licence map (below), because the AGPL's own "How to Apply" puts them
  in a per-file header, and the ticket forbids headers on the scripts.
- **`LICENSE-CC-BY-SA.md`** — the second licence file: which files are under CC BY-SA 4.0 (`voice/*.mp3`,
  every `*.md` the project wrote, `.github/screenshot.png`), how to attribute them, and the legal code's
  URL (<https://creativecommons.org/licenses/by-sa/4.0/legalcode>). CC BY-SA 4.0 § 3(a)(1)(C) lets a
  licensor give the licence by URI, so the legal code is linked, not copied.
- **`CREDITS.md`**, top to bottom:
  1. **Licences at a glance** — a path → licence table, the copyright line, and the AGPL-3.0 "only / or
     later" statement. Code is everything not listed elsewhere: `index.html`, `js/` (level and quest
     data included), `tools/`, `tests/`, `backend/`, `spike/`, `.claude/` scripts, `cloudflare-build.sh`,
     `_headers`. Docs and narration → `LICENSE-CC-BY-SA.md`. `samples/`, `vendor/` → their own terms,
     below. Generated `samples/<instr>.js` carry their pack's licence: they are the mp3s in base64.
  2. **The name and logo** — "Tune Garden" and its logo are not licensed by either licence; forks pick
     their own name. There is no logo artwork in the repo today: the mark is the `🌱 Tune Garden`
     wordmark (`index.html` `#title`).
  3. **Instrument samples** — one row per voice: pack, author, licence with version, source URL, what we
     changed (CC BY requires saying so: mp3 conversion, trimming, tuning correction — from
     `tools/build-samples.mjs`).
  4. **Fonts and sign-in library** — Fredoka, Nunito (SIL OFL 1.1), amazon-cognito-identity-js 6.3.22
     (Apache-2.0), linking `vendor/README.md` and the licence files beside them.
  5. **Narration** — Amazon Polly, generative engine, voice Joanna (`tools/gen-voice.mjs`), what AWS's
     terms say (quoted below), and that the narrated text is the project's own (the `intro:` strings).
  6. **Famous melodies** — every `FAMOUS` key: title, composer or source, year, and why it is free to
     use. The game ships notes, not recordings, so only the composition matters, never a recording.
     The three uncertain ones are marked *flagged — owner to confirm*, with the evidence.
  7. **Traditional tunes in the levels** — *Mary Had a Little Lamb*, *Hot Cross Buns*, *Au clair de la
     lune* (`js/packages.js` 63–73). Not in `FAMOUS`, so not in the ticket's list, but shipped all the same.
- **`README.md`** — extend the existing **Licence** line (no second one): "GNU AGPL-3.0" gains the owner's
  "only / or later" choice, and "Creative Commons BY-SA 4.0" links `LICENSE-CC-BY-SA.md`. It must stay one
  short line: TUN-98 measured it at GitHub's first-screen fold. The repository map gains a row for the
  three files.
- **`AGENTS.md` § Where to find things** — one pointer: licences and third-party credits → `CREDITS.md`.
- **`js/home.js` `.mapcred`** — unchanged unless the owner picks otherwise (question 4); it already credits
  both CC BY packs.

Not touched: any `FAMOUS` melody, any asset, the 29 scripts' headers, `CONTRIBUTING.md` (TUN-91/TUN-92).

**Tests** (`tests/licences.test.mjs`): `LICENSE` is the AGPL-3.0 text (its title and its last section's
heading, and no line added before it); `CREDITS.md` names every `FAMOUS` key and every `SAMPLED` voice in
`js/audio.js`, so a new tune or instrument without a credit fails the suite; every relative link in
`CREDITS.md`, `LICENSE-CC-BY-SA.md` and the README's Licence line resolves to a file; `.mapcred` still
names both CC BY packs. Plus the whole suite and the syntax check.

## Research

### Amazon Polly — may the clips be redistributed under an open licence?

Read 2026-11-19. AWS Service Terms (<https://aws.amazon.com/service-terms/>, "Last Updated: November 19,
2026"): Polly is one of the "AI Services" of § 50; its own § 50.18 covers only Voice Cloning, which the
project does not use (stock voice Joanna). *(Corrected after the design review, finding 2.)*

- **§ 50.2:** "The output that you generate using AI Services is Your Content." The clause adds that output
  may not be unique across customers.
- **§ 50.5:** "Except where permitted by the AI Service, you may not use an AI Service to generate Content
  for the express purpose of training an AI model or service" — a restriction on *our* purpose, not on
  what others do with the clips.
- No Service Terms clause restricts storing, replaying or redistributing Polly output.
- **Polly FAQ** (<https://aws.amazon.com/polly/faqs/>): "As between you and AWS, your Polly output belongs
  to you." · "You can cache and replay Amazon Polly's generated speech at no additional cost." · the
  service has "no restrictions on storing and reusing generated speech". · "If you input text into Polly
  that belongs to a third party, we require that you have the rights to do so" — the text is the
  project's own.

**AWS Customer Agreement** (<https://aws.amazon.com/agreement/>, "Last Updated: October 29, 2026") —
read after the design review (finding 2):

- **§ 2.2:** "You are responsible for Your Content." · "You will ensure that Your Content and your and End
  Users' use of Your Content or the Services will not violate any of the Policies or any applicable law."
- **§ 2.5:** "You are responsible for End Users' use of Your Content and the Services, and for their
  compliance with your obligations under this Agreement."
- **§ 6.1:** "we obtain no rights under this Agreement from you (or your licensors) to Your Content."
- **§ 7.1:** you indemnify AWS against claims arising from "(a) your or any End Users' use of the
  Services" and "(b) breach of this Agreement or violation of applicable law by you, End Users or Your
  Content".
- **§ 12, "End User":** "any individual or entity that directly or indirectly through another user (a)
  accesses or uses Your Content, or (b) otherwise accesses or uses the Services under your account."
  "Policies" include the Acceptable Use Policy and the Service Terms.

**AWS Responsible AI Policy** (<https://aws.amazon.com/ai/responsible-ai/policy/>, "Last Updated: January
13, 2025"): "You may not use, or facilitate or allow others to use, the AI/ML Services: … for intentional
disinformation or deception; … to depict a person's voice or likeness without their consent or other
appropriate rights, including unauthorized impersonation …". No disclosure or labelling requirement.

**Verdict, revised:** nothing in the Service Terms, the Customer Agreement, the Responsible AI Policy or
the Acceptable Use Policy forbids publishing the clips under an open licence, so the ticket's literal stop
case ("if it may not") does not hold. **But** § 2.2, § 2.5 and § 7.1 make the account holder responsible
for, and liable to AWS for, what any "End User" — anyone who accesses the clips, directly or *indirectly
through another user* — does with them. That responsibility already covers every player of the live
site today; an open licence widens what those people may lawfully do with the clips (remix, edit, reuse
elsewhere), not who they are. Whether that is acceptable is the owner's call (question 3). Two further
doubts: the clips may carry **no copyright of their own** (machine speech, no human performer); and a
CC0 dedication of the clips could arguably also give away the narrated text, which is the project's.
Not read: the AWS Intellectual Property License; a fetch tool read the Service Terms' Sections 5–39 only
in summary.

### Sample packs

| Voice | Pack | Author | Licence | Source (read 2026-11-19) |
|---|---|---|---|---|
| piano | Salamander Grand Piano V3 | Alexander Holm | **CC BY 3.0** Unported | <https://github.com/sfzinstruments/SalamanderGrandPiano> ("This work is licensed under a Creative Commons Attribution 3.0 Unported License."); origin <https://archive.org/details/SalamanderGrandPianoV3> |
| harp | Etherealwinds Harp II: Community Edition | Versilian Studios LLC; harp played by Jordi Francis ("Etherealwinds") | **CC BY 4.0** | <https://versilian-studios.com/etherealwinds-harp/> ("…this reduced version of the new library under a Creative Commons Attribution 4.0 International license.") |
| marimba, vibraphone, glockenspiel | Versilian Community Sample Library (VCSL) | Versilian Studios LLC | CC0 1.0 | <https://github.com/sgossner/VCSL> ("This collection is under a Creative Commons 0 license.") |
| kalimba | FreePats kalimba | FreePats project: recorded by Gonzalo and Roberto, edited by Roberto, with Xavimart (Javier) — the page's own credits *(corrected, finding 7)* | CC0 1.0 | <https://freepats.zenvoid.org/Ethnic/kalimba.html> ("Published under the terms of the Creative Commons CC0 1.0 public domain dedication.") |
| guitar | FreePats Spanish classical guitar | roberto@zenvoid.org, 2008 | CC0 1.0 | <https://freepats.zenvoid.org/Guitar/acoustic-guitar.html> (same sentence, in its *Spanish classical guitar* entry) |

The code comments say only "CC-BY": the versions differ (3.0 piano, 4.0 harp), and `CREDITS.md` gives
each. `tools/build-samples.mjs` names the piano's download as `tonejs.github.io/audio/salamander/`, which
now returns 404; the credit names the pack's own home.

### Fonts and library (TUN-81, `vendor/README.md`)

Fredoka and Nunito — SIL OFL 1.1 (`vendor/fonts/*/OFL.txt`); amazon-cognito-identity-js 6.3.22 —
Apache-2.0 (`vendor/cognito/LICENSE.txt`, `NOTICE.txt`). Apache-2.0 § 4(d) asks that the NOTICE travel
with the work: it does, beside the file, and the build publishes `vendor/` whole.

### Famous melodies (`FAMOUS`, `js/famous.js`)

The game draws notes on its own grid and plays them with its own voices: no recording of anyone's
performance ships, so only the composition's copyright matters.

| Key | Work | Composer / source, year | Why it is free |
|---|---|---|---|
| `fourchord` | I–V–vi–IV progression, with a tune of the project's own on top | — | A chord progression is not protected; the melody is original. The credit names three songs only as examples. |
| `mary` | Mary Had a Little Lamb | Lowell Mason's tune, 1830s | Public domain |
| `taps` | Taps | Daniel Butterfield, 1862 | Public domain |
| `joy` | Joy to the World (tune *Antioch*) | arr. Lowell Mason, 1839, after Handel | Public domain. *Note:* the in-game credit says "by Handel"; the tune is Mason's, with phrases traditionally traced to Handel. Out of scope to change. |
| `odetojoy` | Ode to Joy | Beethoven, Symphony No. 9, 1824 | Public domain |
| `shave` | Shave and a Haircut | Charles Hale, *At a Darktown Cakewalk*, 1899 | The capstone (the bare jingle) is public domain. **Flagged** *(finding 1)*: the **Jukebox** version is "the full first phrase of the Faber lesson piece" (`js/famous.js` 49) — the bass walk, dyads and phrase plan of a modern piano-method arrangement, which can carry its own copyright (US Copyright Office, Circular 50). |
| `moldau` | The Moldau (*Vltava*) | Bedřich Smetana, 1874 | Public domain |
| `bigben` | Westminster Quarters | attr. William Crotch, 1793 | Public domain |
| `pachelbel` | Canon in D | Johann Pachelbel, c. 1680–1706 | Public domain; the treble voicing is the project's own |
| `amazinggrace` | Amazing Grace (tune *New Britain*) | traditional, published 1829–1835 | Public domain |
| `blooms` | three intervals (2nd, 3rd, 5th) | — | Not a work; the credit names *When the Saints* (traditional) as an example |
| `bodiddley` | The Bo Diddley beat | Bo Diddley, 1955; a variant of the 3-2 clave | **Flagged.** A rhythm alone, no melody. US copyright is generally read not to protect a rhythm alone (e.g. encyclopedia.com's Bo Diddley entry: he received no royalties from the beat for that reason; <https://en.wikipedia.org/wiki/Bo_Diddley_beat> — the pattern appears in R&B records from 1944 on). No court ruling found. |
| `goinhome` | Largo, Symphony No. 9 "From the New World" | Antonín Dvořák, 1893 | Public domain. William Arms Fisher's song *Goin' Home* (1922) added words only, and a 1922 publication was out of US copyright before the 1998 extension (Copyright Office, Circular 22) *(corrected, finding 7)*. |
| `charleston` | The Charleston rhythm | James P. Johnson, 1923 | **Flagged.** Rhythm only — two kick and two snare hits, no melody. The 1923 song entered the US public domain on 2019-01-01 (US Copyright Office, *Copyright Lore*, Jan 2019, <https://www.copyright.gov/history/lore/pdfs/201901%20CLore_January2019.pdf>). Johnson died 1955, so life + 70 countries freed it 2026-01-01. |
| `igotrhythm` | I Got Rhythm (melody, A section and tag) | George Gershwin, 1930 | **Flagged.** Entered the US public domain 2026-01-01 (Duke Center for the Study of the Public Domain, Public Domain Day 2026; e.g. <https://www.broadwayworld.com/article/Music-From-George-Gershwin-Betty-Boop-and-More-Enter-the-Public-Domain-20260105>). **Outside the US, probably still protected** *(corrected, finding 4)*: the EU and UK count a song written with words from the death of the last of its composer and lyricist (Directive 2011/77/EU; UK SI 2013/1782) — Ira Gershwin died 1983, so to the end of 2053 — even though the game uses the melody alone. Other countries not checked. |
| `bachprelude` | Prelude in C, BWV 846 | J. S. Bach, 1722 | Public domain |
| `chopsticks` | The Celebrated Chop Waltz | Euphemia Allen, 1877 | Public domain |
| `swinglow` | Swing Low, Sweet Chariot | spiritual, attr. Wallace Willis, before 1870s | Public domain |

`CREDITS.md` will cite a source for each line; the plain public-domain ones cite the composer's dates
(each died long before any life + 70 cut-off) rather than a page each.

## Design review (Astra)

Run on the plan above as first written (S tickets skip this step; the spawn prompt asked for it).
Local file links shortened to their path; otherwise verbatim.

<details><summary>GPT's design review, verbatim — verdict: revise first</summary>

1. **High — The tune audit clears an old melody without auditing the arrangement actually shipped.** The plan labels `shave` public domain based on Charles Hale’s 1899 work, but js/famous.js:49 explicitly identifies its Jukebox version as the “Faber lesson piece,” including accompaniment and phrase structure. Original arrangements can have separate copyright even when their underlying tunes are public domain. [US Copyright Office, Circular 50](https://www.copyright.gov/circs/circ50.pdf)

   **Instead:** audit both capstone and Jukebox versions, identify the actual score editions, and flag the Faber arrangement for the owner unless its permission or public-domain basis is established. Expand question 5 beyond the three ticket examples; offer “defer clearance pending evidence” explicitly. Do not change any notes.

2. **High — The Polly conclusion is stronger than the research supports.** Plan lines 79–84 declare open licensing permissible while expressly leaving the Customer Agreement and Responsible AI Policy unread. The [Customer Agreement](https://aws.amazon.com/agreement/) §2.2 addresses End Users’ use of Your Content; §2.5 makes the customer responsible for End Users’ compliance; its definition includes people accessing Your Content indirectly. These provisions require analysis before asserting that downstream restrictions “need no mention.” Ownership of output does not alone settle contractual obligations.

   **Instead:** complete that analysis and distinguish verified terms from the inference that CC BY-SA distribution is compatible. If unresolved, present that uncertainty at the checkpoint rather than framing question 3 solely around copyrightability. CC0 would not cure a contractual restriction and could also waive rights in the narrated text. Correct the statement that Polly has no dedicated terms: current [Service Terms](https://aws.amazon.com/service-terms/) §50.18 covers Voice Cloning, apparently outside the stock-Joanna workflow.

3. **High — Question 4 presents incomplete deployed attribution as an ordinary wording preference.** The existing `.mapcred` has names and “CC-BY,” but no licence URI or modification notice; the build excludes `CREDITS.md`. A disconnected GitHub document does not establish attribution accompanying the deployed samples. [CC BY 3.0 §4](https://creativecommons.org/licenses/by/3.0/legalcode) and [CC BY 4.0 §3](https://creativecommons.org/licenses/by/4.0/legalcode) require more than the existing footer, although attribution need not literally sit beside the author.

   **Instead:** present concrete compliant delivery options. A public, reachable full-credits link may be reasonable, but the recommended destination remains private until TUN-103. Make that dependency explicit. Also account for tests/vendor.test.mjs:190: adding the proposed GitHub URL to `js/home.js` fails its exact URL allowlist. Distinguish user-initiated navigation from automatic third-party requests without weakening the latter guard.

4. **Medium — The international public-domain claims use an insufficient rule.** “George died in 1937, therefore life-plus-70 countries freed the music in 2008” is not established merely by omitting Ira’s lyrics. Musical compositions with words can use the last surviving composer/lyricist’s death; transitional provisions and country-of-origin comparisons also matter. The [UK’s implementing regulations](https://www.legislation.gov.uk/uksi/2013/1782/note?timeline=false) explicitly describe this joint term and possible revival.

   **Instead:** retain the verified US conclusion and mark other territories unverified unless researched individually. Apply jurisdiction labels consistently throughout the table. Cite [Duke’s original 2026 research](https://cspd.law.duke.edu/publicdomainday/2026) directly; it expressly limits its conclusions to US law. The owner’s recommendation should reflect that limit.

5. **Medium — “Every Markdown file the project wrote” does not distinguish original material from embedded third-party material.** `reviews/`, `REVIEW-LOG.md`, and this very review contain quotations from external sources, including AWS terms. A project-authored container does not give the owner authority to relicense everything inside it. Conversely, GPT-generated review prose should not automatically be treated as externally owned merely because GPT produced it. Commit authorship also does not establish ownership of every incorporated passage.

   **Instead:** state that CC BY-SA covers the project’s licensable contributions, preserve and identify third-party exceptions, and distinguish those from AI-assisted original text. [Creative Commons expressly recommends marking incorporated third-party material](https://creativecommons.org/faq/#can-i-apply-a-cc-license-to-my-work-if-it-incorporates-material-used-under-fair-use-or-another-exception-or-limitation-to-copyright). Specify recursive Markdown coverage and precedence over directory rules, including `spike/FINDINGS.md`, `.claude/**/*.md`, and the project-authored `vendor/README.md`. Preserve the upstream terms of licence texts and notices.

6. **Medium — The screenshot grant and blanket renaming rule need an explicit, consistent owner decision.** The plan adds `.github/screenshot.png` to CC BY-SA, although the settled scope names narration and Markdown docs. It simultaneously excludes the wordmark wherever embedded and says all forks must choose another name. That leaves unclear how reusers may reproduce the screenshot, preserve historical references, or provide the attribution requested in question 6.

   **Instead:** ask the owner to confirm the screenshot’s treatment and define the brand reservation precisely. Distinguish trademark permission from copyright permission and necessary attribution/reference uses; do not silently turn a reservation into a broader condition on all copying. [Creative Commons discusses this distinction and explicit branding exclusions](https://creativecommons.org/faq/).

7. **Medium — Several research entries remain incomplete or inaccurate despite the “every claim names its source” promise.** Most tune rows provide no supporting source; composer dates alone are neither citations nor evidence about the edition transcribed. The Kalimba row omits Xavimart/Javier and Gonzalo, whom the [actual source page](https://freepats.zenvoid.org/Ethnic/kalimba.html) credits with recording alongside Roberto. The claim that the 1922 *Goin’ Home* became US public domain in 2018 is incorrect: the Copyright Office places expiration for works published or copyrighted before 1923 by January 1, 1998. [Circular 22](https://www.copyright.gov/circs/circ22.pdf)

   **Instead:** complete the source-backed table before requesting approval, correct those entries, and attach uncertainty to unsupported attribution or arrangement claims. Record modifications per instrument; do not imply every pack received every conversion, trim, or tuning change.

8. **Medium — The proposed tests do not establish their stated guarantees.** Checking the AGPL title and final heading accepts a file with most legal clauses deleted. Merely finding a `FAMOUS` key somewhere in `CREDITS.md` accepts an incidental mention without composer, date, source, or status.

   **Instead:** verify the complete canonical licence text using a recorded digest or equivalent full-content comparison. Resolve the “byte-for-byte” promise against `.gitattributes`’ automatic line-ending conversion: either preserve bytes or explicitly normalize line endings for comparison. Check identified credit rows and required fields, including distinct Jukebox provenance where applicable. Keep legal correctness as a human review responsibility.

9. **Low — Verification and documentation integration are incomplete.** The plan omits browser verification if `.mapcred` changes and a rendered check that the extended README line preserves the owner-accepted TUN-98 layout. One Markdown source line can still wrap into additional displayed lines. It also omits the new-doc entry in `AGENTS.md` §What “done” means required by `CLAUDE.md` §Docs.

   **Instead:** add these checks and that pointer. Preserve TUN-98’s accepted layout rather than reopening its settled viewport decision. Keep `CONTRIBUTING.md` untouched and treat its pending link as the known TUN-91/TUN-92 dependency.

**Verified**

- Read the complete TUN-89 plan and inspected the requested repository context, generators, deployment rules, attribution footer, vendored notices, and relevant tests.
- Public upstream sources confirm Salamander CC BY 3.0, Etherealwinds CE CC BY 4.0, VCSL CC0, and both FreePats packs’ CC0 declarations.
- Local files confirm both OFL notices and Cognito’s Apache licence plus bundled third-party notices; deployment copies them.
- Verified the quoted Polly ownership provisions and the US public-domain dates for *I Got Rhythm* and *The Charleston*.
- The plan correctly preserves the existing README Licence line, excludes contributor-guide work, and avoids generated-asset edits.

**Could not verify**

- Permission for the Faber arrangement, every score edition’s provenance, worldwide tune clearance, or sample bytes against upstream originals.
- Definitive compatibility of unrestricted downstream licensing with the owner’s applicable AWS contract.
- GNU’s canonical licence download: requests timed out. Actual GitHub licence detection and rendered layout remain untested.
- No tests or browser checks were run for this pre-implementation review. No files were edited.

**Verdict: revise first.**

</details>

## My answers (Claude)

1. **High, Faber arrangement — agree.** Confirmed at `js/famous.js` 49. I audited every other entry's
   comments: the other Jukebox versions are melodies the owner typed or tuned from scores ("Pavel's
   transcription", "Pavel's leadsheet", "from the score"), with the project's own voicings (Pachelbel's
   treble chords, the Taps closing triad); none names a method book or arranged edition. But the comments
   do not name the editions, and only the owner knows them — so question 6 asks. Question 5 offers
   "replace later, in its own ticket" for the Faber Jukebox. This ticket changes no notes.
2. **High, Polly — agree.** Read the Customer Agreement and the Responsible AI Policy; quoted under
   *Research*. The § 2.2 / § 2.5 / § 7.1 responsibility for "End Users" is real and is now the core of
   question 3, with the CC0 trap GPT names (it could give away the narrated text). § 50.18 corrected. One
   point I add: every player of the live site is already an "End User", so the responsibility exists
   today whatever the licence; the licence changes what those people may do, not who they are.
3. **High, in-game attribution — agree.** The footer lacks the licence URIs and the "modified" notice
   CC BY asks for, and a GitHub link would both be dead until TUN-103 and break
   `tests/vendor.test.mjs`'s two-URL guard. Question 4 now offers options that keep that guard: the
   recommended one publishes `CREDITS.md` on the site itself (same origin, works on `file://`, live
   before the repo is public) and links it from the footer by relative path.
4. **Medium, international terms — agree.** *I Got Rhythm* is the material case: the EU/UK joint-term
   rule most likely protects it to the end of 2053, and the site is served worldwide. Corrected in the
   table; `CREDITS.md` will label every claim with its jurisdiction ("US: …; elsewhere: not checked" unless
   researched) and cite Duke's 2026 page directly. *The Charleston* is unaffected (Cecil Mack d. 1944,
   James P. Johnson d. 1955, and only the rhythm ships). Question 5 asks about *I Got Rhythm*.
5. **Medium, docs scope — agree.** `LICENSE-CC-BY-SA.md` will say: CC BY-SA 4.0 covers the project's own
   writing in every `*.md` at any depth (`spike/FINDINGS.md`, `.claude/**/*.md`, `vendor/README.md`,
   `reviews/`, `REVIEW-LOG.md` included); quoted third-party material (AWS's terms, licence excerpts,
   upstream text quoted in reviews) stays its owners'; the licence texts and notices in `vendor/` keep
   their own terms. GPT-written prose in `reviews/` is treated as the project's own, with the same
   copyrightability doubt as the clips — noted, not asked.
6. **Medium, screenshot and brand — agree.** The screenshot was my addition beyond the decided scope: now
   question 7. The brand note will say what it is — a trademark reservation, not a copyright condition:
   the licences grant no right to use the name or mark *as a brand* (to name a fork, or imply
   endorsement); saying truthfully that a work is based on Tune Garden, and the attribution the licences
   require, stay allowed. Its wording is in question 7 for the owner to approve.
7. **Medium, sources — agree in part.** Kalimba credits and *Goin' Home* corrected; modifications will be
   recorded per instrument from `tools/build-samples.mjs` and `js/audio.js` (e.g. kalimba and glockenspiel
   tuning-corrected; harp and vibraphone trimmed to 3.2 s; marimba peak-normalised; WAV or FLAC sources converted to mp3);
   every tune row in `CREDITS.md` gets a source link (a reference page or IMSLP). **Where I differ:** for
   a melody by a composer who died before 1900, the composer's dates *are* the evidence that the
   composition is free; the edition matters only for what an edition adds — an arrangement (finding 1)
   or, in some EU countries, a critical edition's own short right. That edition question is the owner's
   (question 6), not something more citations would settle.
8. **Medium, tests — agree.** `LICENSE` will be checked against a recorded SHA-256 of the canonical text
   with line endings normalised to LF (`.gitattributes` stores LF and checks out native, so a byte hash of
   the working file would fail on Windows); `CREDITS.md`'s tune and sample tables will be parsed, one row
   per `FAMOUS` key and per `SAMPLED` voice, each with non-empty composer/author, year, licence or basis
   and source cells; the Jukebox provenance gets its own mention where it differs. Legal correctness stays
   a human review.
9. **Low, verification and docs — agree.** Adding: the `AGENTS.md` § What "done" means entry for the new
   docs; a browser check of the map footer if it changes; and a rendered check that the extended Licence
   line keeps TUN-98's accepted layout (one displayed line in the same GitHub-like column).

**Plan changes, in short:** per-claim jurisdiction labels and sources; the scope wording of finding 5;
the brand wording of finding 6; per-instrument modifications; the tests of finding 8; the checks and
pointer of finding 9; and, depending on question 4, publishing `CREDITS.md` with the site
(`cloudflare-build.sh`, `tests/cloudflare-publish.test.mjs`'s allowed list, a `_headers` rule) and a
relative "Credits" link in `.mapcred`.

## Questions for the owner

1. **Copyright line** — every commit (329) is yours, the first on 2026-06-14.
   **A)** `Copyright (C) 2026 Pavel Dmitriev` · **B)** `… Pavel Dmitriev and the Tune Garden
   contributors` · **C)** another holder (e.g. a company). **I'd pick A**: your name, the first public year.
2. **AGPL-3.0 only, or or-later?** **A)** AGPL-3.0-or-later · **B)** AGPL-3.0-only. **I'd pick A**, as
   planning leaned: with no contributor agreement, moving to a later AGPL would otherwise need every
   contributor's consent.
3. **Narration (`voice/`)** — AWS's terms do not forbid an open licence, but its Customer Agreement makes
   you responsible to AWS for what anyone who gets the clips does with them (§ 2.5, § 7.1; *Research*).
   **A)** CC BY-SA 4.0 as decided, accepting that · **B)** keep the clips in the repo and on the site but
   not open-licensed ("all rights reserved; may be shared unmodified as part of Tune Garden"), leaving the
   docs CC BY-SA · **C)** keep them on the site only, out of the public repo (forks get the browser's own
   speech, which the game already falls back to, or generate clips with their own AWS account).
   **I'd pick A**: the responsibility already covers every player today, the clips are children's-story
   narration with little misuse value, and B or C splits the decided licence for a small gain — but it is
   your contract with AWS. (Not CC0: it could give away the narrated text.)
4. **The credit players see** — the map footer (`.mapcred`) is the only credit on the live site, and CC BY
   asks for the licence and a "modified" note too. **A)** publish `CREDITS.md` with the site and make the
   footer "… (CC BY 3.0) · … (CC BY 4.0) · Credits", the last a relative link to it — no third-party
   link, works before the repo is public · **B)** spell it all out in the footer itself (licence names,
   "converted and trimmed"), no link — a longer footer · **C)** leave the footer as is; `CREDITS.md` on
   GitHub carries the notices once public. **I'd pick A.**
5. **Tunes whose status is not plain** (evidence in *Research*): (a) the **Shave and a Haircut Jukebox**
   version follows the Faber lesson piece's arrangement; (b) **I Got Rhythm** is public domain in the US
   but most likely protected in the EU and UK until 2053; (c) **The Charleston** and **The Bo Diddley
   beat** ship as rhythms only. For each: **keep** (credited with the evidence) or **replace later** (a
   Backlog ticket; this one changes no notes). **I'd pick:** (a) replace later, with the bare jingle or
   your own accompaniment; (b) your call — keeping it is defensible only for the US; (c) keep.
6. **Score editions** — besides Faber, did any melody or Jukebox version come from a method book, or a
   simplified or arranged edition, rather than the plain tune? A list, or "no", is enough. (Plain
   public-domain melodies are fine from any edition; arrangements are not.)
7. **Screenshot and brand wording** — (a) put `.github/screenshot.png` under CC BY-SA with the docs:
   **yes / no** (no = all rights reserved). **I'd pick yes**: it shows only the game's own UI. (b) the
   reservation: *"Neither licence grants any right to use the name "Tune Garden" or its 🌱 wordmark as a
   brand — to name a fork, or to suggest endorsement. Saying truthfully that a work is based on Tune
   Garden, and the credit the licences require, are fine."* — **OK / your wording.**
8. **How reusers credit the docs and narration** — **A)** "Tune Garden by Pavel Dmitriev,
   https://github.com/pad29/music-garden" · **B)** "… by the Tune Garden contributors". Follows question 1.

**Not asked, filed after the checkpoint:** AGPL § 13 asks a *modified* version running on a server to
offer its source to its users. You hold the copyright, so it does not bind you, but a "Source" link in the
game shows forks where theirs goes — a Backlog ticket.

## Owner's decisions

*Design checkpoint (`needs-owner`)* — the owner, relayed by the orchestrator (session `music-garden-5`)
to this session, 2026-11-19:

1. **A** — `Copyright (C) 2026 Pavel Dmitriev`.
2. **A** — AGPL-3.0-or-later.
3. **A** — `voice/` under CC BY-SA 4.0, accepting the Customer Agreement's End User responsibility.
4. **A** — publish `CREDITS.md` with the site; the footer adds the licence labels and a relative
   *Credits* link.
5. (a) **Replace later** — the *Shave and a Haircut* Jukebox (Faber arrangement): a Backlog ticket, for the
   bare jingle or the owner's own accompaniment. (b) **Keep for now** — *I Got Rhythm*, credited with the
   evidence, plus a Backlog ticket to revisit it before any EU/UK-facing launch. (c) **Keep** — *The
   Charleston*, *The Bo Diddley beat*.
6. **No other arranged editions**, as far as the owner knows; he confirmed the scores against score images
   found online. Credit that honestly, and claim no specific edition.
7. **Yes and OK** — the screenshot under CC BY-SA; the brand wording as proposed.
8. **A** — "Tune Garden by Pavel Dmitriev, https://github.com/pad29/music-garden".

**Follow-up tickets** (Backlog, `file-ticket`): TUN-117 — the *Shave and a Haircut* Jukebox accompaniment
(5a); TUN-118 — *I Got Rhythm* before an EU/UK-facing launch (5b). The AGPL § 13 Source link was asked
for as a ticket too, but TUN-104 (the "for grown-ups" page) already requires "links to the source, the
licence and the credits", so it got a comment with the § 13 reasoning instead of a duplicate.

## Build

As planned, amended by *My answers* and the owner's decisions:

- `LICENSE` — <https://www.gnu.org/licenses/agpl-3.0.txt> fetched 2026-11-19, unchanged (34,523 bytes,
  SHA-256 `0d96a4ff…abcb0`).
- `LICENSE-CC-BY-SA.md` — scope (finding 5), exclusions, the attribution line (8A), the synthetic-speech
  note. The legal code is linked, not copied (CC BY-SA 4.0 § 3(a)(1)(C)).
- `CREDITS.md` — the licence map with the copyright line and the AGPL "or later" notice (1A, 2A); the
  brand note (7b); per-instrument changes; jurisdiction labels; a source link for every tune; the
  edition statement (6); TUN-117 and TUN-118 named in their rows.
- `README.md` — the one Licence line extended ("AGPL-3.0-or-later", "CC BY-SA 4.0" linking
  `LICENSE-CC-BY-SA.md`); a repository-map row; the build, caching and Deployment lines; the
  *Famous melodies* and *New sampled instrument* conventions now send new work to `CREDITS.md`.
- `AGENTS.md` — the pointer, and `CREDITS.md` in § What "done" means (finding 9).
- 4A — `cloudflare-build.sh` publishes `CREDITS.md`; `_headers` gives it a re-check cache rule and
  `Content-Type: text/plain`; `tests/cloudflare-publish.test.mjs` allows it. The map footer (`js/home.js`)
  now reads "(CC BY 3.0)" / "(CC BY 4.0)" and ends with a **Credits & licences** link to `CREDITS.md`.

**Choices I made that you might overrule:** the link opens in a new tab, so the game is never navigated
away; its words are "Credits & licences"; `CREDITS.md` is served as plain text rather than as a rendered
page; `spike/` counts as code (its one `.md` is a doc); ticket IDs, not Linear links, in `CREDITS.md`,
because Linear is private.

## Tests

`tests/licences.test.mjs`, 6 tests: `LICENSE` against the recorded SHA-256 with line endings normalised;
one complete row per `FAMOUS` key and per `SAMPLED` voice; relative links resolve; one Licence line,
linking both licence files; the footer's two CC BY credits with versions, and its link. Mutation audit,
10/10 caught: a copyright header on `LICENSE`; a dropped AGPL section; a tune row removed; a year emptied;
a voice row removed; a licence version dropped; a broken relative link; a second Licence line; the
footer's piano credit and its link each removed. The publish test's allowed list updated for
`CREDITS.md`; the headers test needed no change, as it already works out the headers of every published
file. Whole suite 1009/1009, syntax check OK. *(Corrected in round 1: this line first said the headers test
was updated — PR review finding 5.)*

Browser (`ao preview`, this worktree, files byte-compared): the world map's footer shows both credits
with versions and the link; the link opens `CREDITS.md` as text in a new tab; no console errors.
The README Licence line's text is 5 characters shorter than TUN-98's, so it cannot wrap onto more lines.

**Not verified:** the link over `file://` (AO's browser refuses it); that Cloudflare honours the
`text/plain` Content-Type (check on the PR preview); the README as GitHub renders it.

## PR review — round 1 (Astra, `ask.sh`, on 4a54e72)

Local file links shortened to their path; otherwise verbatim. GPT's own suite run hit `EPERM` on temporary
directories in its sandbox (112 failures, all that error) — its environment, not this change: the suite
passes here.

<details><summary>GPT's PR review, verbatim — verdict: Changes requested</summary>

1. **High — The licence map grants more than the owner can license.** CREDITS.md:14 explicitly includes famous-tune data under AGPL, without an exception for underlying compositions or arrangements. This conflicts with the Faber and Gershwin qualifications later in the document. LICENSE-CC-BY-SA.md:19 repeats that scope.  
   **Fix:** limit the grant to the project’s own licensable contributions and expressly preserve underlying musical rights. Also exclude upstream licence documents from the catch-all grant: `LICENSE` itself permits verbatim copying under the FSF’s notice. This requires no change to the owner’s decisions about keeping or replacing tunes.

2. **Medium — The deployed credits point to unpublished licence files.** cloudflare-build.sh:21 publishes `CREDITS.md`, but neither `LICENSE` nor `LICENSE-CC-BY-SA.md`. Both are relative destinations in its “Full text” column. The publication-tree helper confirms both are absent; on Pages, those paths receive the game’s SPA fallback. The repository-only link test misses this.  
   **Fix:** publish the linked licence files with appropriate headers and publication checks, or make the deployed credits self-contained with reachable licence URLs and the necessary project notices.

3. **Medium — The worldwide public-domain assurance exceeds the evidence and contradicts one row’s source.** CREDITS.md:103 defines unqualified “Public domain” using publication before 1900, then concludes that no term runs anywhere. Yet `pachelbel` receives that label although its cited source dates first publication to **1919**. Composition dates are not publication dates. The research also does not establish worldwide clearance for every unqualified row. [Pachelbel source](https://en.wikipedia.org/wiki/Pachelbel%27s_Canon)  
   **Fix:** replace the universal assurance with jurisdiction-specific, supported statements; distinguish composition and publication dates; identify unchecked territories. Preserve the owner-approved treatment of the flagged tunes.

4. **Low — Several tune credits need their historical claims reconciled with their sources.** CREDITS.md:85 attributes the familiar `mary` melody to Mason, while its cited page distinguishes Mason’s setting from the commonly sung tune that the game uses. At line 93, “New Britain — 1829” conflates antecedent melodies with Walker’s later named arrangement: the Library of Congress distinguishes the 1829 antecedent from **1835 New Britain**. The `taps` link currently reaches a disambiguation page. [Mary source](https://en.wikipedia.org/wiki/Mary_Had_a_Little_Lamb), [Library of Congress timeline](https://www.loc.gov/collections/amazing-grace/articles-and-essays/timeline/)  
   **Fix:** qualify the disputed Mary attribution, distinguish the Amazing Grace dates and arrangement credit, and link directly to a substantive Taps source. These are credits corrections, not requests to alter notes.

5. **Low — Documentation integration is incomplete.** tests/README.md:39 still says the build publishes an exact list excluding `CREDITS.md`; DESIGN.md:171 also retains the old publication inventory. The review record:380 says headers tests were updated, but that file is unchanged—the existing tests automatically include the new published path.  
   **Fix:** reconcile those descriptions and accurately distinguish existing coverage from newly added checks.

**Missing tests**

- **Published destinations and MIME:** check relative file destinations against `publishedTree`, not just the checkout. Assert `/CREDITS.md` receives exactly one `Content-Type: text/plain; charset=utf-8`; removing that header currently escapes the headers tests. Exercise missing `CREDITS.md` in the build’s missing-source cases.
- **Rendered footer:** execute `renderPkgs` with recording DOM elements and assert the attached anchor’s destination, text, `_blank`, and `noopener`, plus both credited authors. In-memory removal of `cred.appendChild(credLink)` or the target/rel assignments leaves all six licence tests passing.
- **Credit-table regressions:** require sample-source URLs and preserve the distinct `shave` Jukebox provenance while that arrangement ships. Replacing the harp source with plain text or deleting the Faber warning leaves all six tests passing.
- **Manual integration:** verify the pinned-head Cloudflare preview’s actual headers and credits navigation, the relative footer link under `file://`, and the amended README in the previously accepted rendering layout. Five fewer characters does not prove equal wrapping in a proportional font; this check should preserve, not reopen, TUN-98’s accepted layout.

**Verification**

The nine earlier design findings stand as follows:

| Earlier finding | Result |
|---|---|
| 1. Faber arrangement | Disclosure and owner-approved deferral implemented; licence-map conflict remains above. |
| 2. Polly analysis | Checkpoint uncertainty recorded and owner decision followed. |
| 3. Deployed attribution | Sample attribution now accompanies deployment; linked project licences are missing. |
| 4. International terms | Gershwin qualification improved; blanket worldwide assurance remains unsupported. |
| 5. Documentation scope | Recursive Markdown coverage and quotation exclusions implemented; catch-all scope still needs clarification. |
| 6. Screenshot and brand | Owner-approved screenshot grant and brand wording implemented. |
| 7. Sources and modifications | Sample audit substantially resolved; tune-history corrections remain. |
| 8. Tests | Full-text digest and structured rows implemented; regression gaps listed above remain. |
| 9. Integration and rendering | README/AGENTS pointers added; documentation drift and rendering checks remain. |

- Confirmed the checkout is exactly `4a54e729c1aa0b1738ad6264a506f266eb0b724c`, with no working-tree changes. Reviewed the requested diff and repository context. The existing single README Licence summary was extended; `CONTRIBUTING.md` and the two-URL vendor guard are untouched.
- Upstream sources confirm Alexander Holm/Salamander **CC BY 3.0**, Jordi Francis and Versilian/Etherealwinds CE **CC BY 4.0**, VCSL **CC0**, and both FreePats packs’ **CC0** declarations and named contributors. [Salamander](https://github.com/sfzinstruments/SalamanderGrandPiano), [Etherealwinds](https://versilian-studios.com/etherealwinds-harp/), [VCSL](https://github.com/sgossner/VCSL), [kalimba](https://freepats.zenvoid.org/Ethnic/kalimba.html), [guitar](https://freepats.zenvoid.org/Guitar/acoustic-guitar.html)
- Sample counts, layers, trimming, conversions and tuning descriptions agree with the generator and audio comments. Local OFL files and Cognito’s licence/NOTICE support their credits. No shipped file lacks a default licence-map classification; the problem is overbroad classification.
- Confirmed Polly’s output-ownership statement and the recorded End User responsibility provisions. Linking CC BY-SA’s legal code is supported by its URI provision. These checks do not reopen the owner’s narration decision. [AWS terms](https://aws.amazon.com/service-terms/), [AWS agreement](https://aws.amazon.com/agreement/), [CC BY-SA legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode)
- Confirmed the US public-domain dates for *I Got Rhythm* and *The Charleston*. Checked the other tune references against their stated work histories; the exceptions above prevent treating the table as fully verified worldwide clearance. [Duke](https://cspd.law.duke.edu/publicdomainday/2026), [Copyright Office](https://www.copyright.gov/history/lore/pdfs/201901%20CLore_January2019.pdf)
- The build retains its required single-chain copy form. Cache rules do not overlap. The footer introduces no fetch, inline handler or CSP violation. Cloudflare explicitly permits overriding default static-response headers through `_headers`, so the `Content-Type` override is valid configuration. [Cloudflare documentation](https://developers.cloudflare.com/pages/configuration/headers/)
- Syntax checking passed. All **17 licence/header tests passed**. The full suite produced **897 passes and 112 failures**, all reporting denied temporary-directory creation (`EPERM`), so I could not independently reproduce the worker’s 1009/1009 result.
- The six licence tests establish digest equality, row presence/uniqueness and nonempty fields, checkout-path existence, README wording, and source-text footer patterns. They do not establish deployed link resolution, fragment validity, factual correctness, or an attached working footer link.

I could not verify actual browser behavior, the pinned preview, GitHub rendering, upstream sample-byte identity, every score edition, or worldwide musical rights. AO was unavailable and GitHub CLI configuration access was denied. GNU’s canonical download timed out, so I verified the licence against the recorded digest, not an independently downloaded canonical copy. No files were edited.

**Changes requested**

</details>

### My answers (Claude)

1. **High, the grant is too broad — agree.** `CREDITS.md` now says, under the licence map, that both
   licences cover only the project's own work: not the melodies behind the tune data (their status is
   *Famous melodies*'), not the licence texts (`LICENSE` is the FSF's, copied as it permits; `vendor/`'s
   licence and notice files are their projects'), not quotations. The code row points to it;
   `LICENSE-CC-BY-SA.md` says the same. No owner decision changes.
2. **Medium, the deployed credits link unpublished files — agree.** The build now publishes `LICENSE` and
   `LICENSE-CC-BY-SA.md` too, each with a re-check cache rule and `Content-Type: text/plain` (a file with no
   extension would otherwise download). Every relative link in the published files now lands on a
   published file — a new test checks it against the build's own tree.
3. **Medium, the worldwide assurance — agree.** Pachelbel's Canon was first published in 1919: the footnote
   was wrong for a row it labelled. "Public domain", alone, now means two checked things — published before
   1931 (free in the US), and a composer dead before 1926 or unknown (so life + 100, the longest general
   term, has ended) — with other countries' special rules named as not checked. Every plain row was
   re-checked against it; Pachelbel's year now reads "composed 1680–1706; first published 1919".
4. **Low, tune history — agree.** Mary: the familiar tune is traditional, of unknown origin; Wikipedia says
   Mason's 1831 setting "has since fallen out of use". Amazing Grace: the tune printed from 1829, joined to
   Newton's words as *New Britain* by William Walker in 1835, sourced to the Library of Congress timeline.
   Taps now links `Taps_(bugle_call)` (the old link was a disambiguation page — checked through Wikipedia's
   API).
5. **Low, docs — agree.** `tests/README.md` and `DESIGN.md` now list what the build publishes; the review
   record's headers-test line is corrected above; `tests/README.md` gains a paragraph on
   `licences.test.mjs`.

**Missing tests — all added** to `tests/licences.test.mjs` (now 10 tests):
- *Published destinations and MIME:* every relative link in `CREDITS.md` and `LICENSE-CC-BY-SA.md`, and the
  footer's `href`, must be in the build's published tree; `/CREDITS.md`, `/LICENSE` and
  `/LICENSE-CC-BY-SA.md` each get exactly one `Content-Type: text/plain; charset=utf-8`. A build without
  `CREDITS.md` now fails here (the footer's destination is unpublished), as well as the publish test's exact list.
- *Rendered footer:* `renderPkgs` runs for real, with recording elements for the DOM (no `try`: it runs to
  the end); the test reads the attached footer — both authors with versions, and the link's `href`, text,
  `_blank`, `noopener`, and published destination.
- *Credit-table regressions:* every sample source must be a link; the `shave` row must keep its Faber flag
  while `js/famous.js` still names the arrangement.
- *Manual:* the Cloudflare preview on 4a54e72 served `CREDITS.md` as `text/plain; charset=utf-8`, with
  the re-check cache rule and the full security headers, byte-identical to the branch. The README Licence
  line, rendered by GitHub's own renderer (`POST /markdown`, `gfm`, this repository as context) and laid out
  in an 830 px GitHub-style column as TUN-98 measured it, wraps to **two lines, as TUN-98's did**: the
  accepted layout holds. `file://` stays on the owner's playtest list.

Mutation audit of the new tests, 9/9 caught: the link built but never attached; its `target` removed; its
`rel` removed; the harp's source made plain text; the Faber flag deleted; `CREDITS.md`'s Content-Type
removed; `LICENSE` and, separately, `CREDITS.md` dropped from the build; `LICENSE-CC-BY-SA.md` linking an
unpublished file.

Whole suite 1013/1013 after the fixes; syntax check OK.
