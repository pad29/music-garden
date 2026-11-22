# TUN-93 — Create accounts with a generated garden name and passphrase, and keep the profile name on the device

Branch `ao/garden-accounts/root` · Size **M** (label and `## Size` agree) · `needs-owner` · PR: draft, at the
design checkpoint

## Plan (Claude)

As GPT reviewed it. **Revised** in *Plan, revised after the design review*, below.

### What changes for the player

- **Making an account** (Home → *Create account*): the game shows a garden name such as `Brave-Otter-42`
  with a 🎲 *Roll again* button, and a *Make my garden* button. The child types nothing. Pressing it
  generates a four-word passphrase, makes the account, and shows **the garden card**.
- **The garden card**: the garden name, the four passphrase words, `tunegarden.game`, and one line: *"Keep
  this card. With it you can open your garden on any device."* Buttons: 🖨️ *Print* and 💾 *Save as a
  picture* (Question 2). A box, *"I've kept my card"*, unlocks *Go to my garden*. The card is shown
  once: the passphrase is never stored, so it cannot be shown again.
- **Signing in** (Home and the landing screen): two boxes, *Garden name* and *Passphrase*. Capitals, extra
  spaces, and spaces, hyphens or underscores between words are all forgiven, in both boxes.
- **No email anywhere**: the field is gone from the form, the server refuses it, and the template no
  longer offers email recovery.
- **The profile name** (Home's *Name* box, the title "Pasha's Tune Garden") stays on this device. It is
  never uploaded, and signing in never erases it. A short hint under the box says so.
- **A lost card**: the sign-in form has *"Lost your card?"*, which says plainly: *"Your garden is still
  saved on this device. Make a new account and it goes up to the cloud again. Without the card, the old
  account can't be opened."*
- **Errors**: a child never sees a Cognito message. Wrong name or passphrase → *"That garden name and
  passphrase don't match. Check your card: capitals and spaces don't matter."* Too many tries → *"Too many
  tries. Wait a few minutes, then try again."* No network → *"Can't reach the garden just now. Your garden
  is still saved on this device."* Anything else → the same calm line, with the code in the console only.
  TUN-87/TUN-88's sign-up messages stay as they are.

### The words (Question 1)

- **Garden name** = *Adjective* `-` *Noun* `-` *number*. 64 adjectives (kind, bright, nature and sky
  words: nothing about bodies, looks, religion or politics), 64 nouns (55 animals, 9 plants), and a number
  10–99 without 14, 18, 28, 69 and 88 (hate-code and crude numbers): 85 numbers. Four pairs are banned:
  `Silver-Fox` (slang), `Fancy-Bear` and `Cozy-Bear` (names of hacking groups), `Dancing-Bear` (a cruel
  tradition). **64 × 64 × 85 − 4 × 85 = 347,820 names.**
- **Passphrase** = four words from a separate list of **256** short, concrete, easy-to-spell nouns (at
  most 9 letters; no common homophones such as *bear/bare*, *sea/see*, *flower/flour*; nothing scary,
  crude, or about weapons, drink or drugs). Shown and typed with spaces between the words.
- **Strength:** 256 words = 8 bits a word; four words, drawn with `crypto.getRandomValues` = **32 bits**
  (4.3 billion passphrases). That is enough for these reasons, and only these: the passphrase is the only
  secret (the garden name will be public on shared songs, TUN-99); nobody can guess offline, because
  Cognito's SRP sign-in never exposes a hash; online, Cognito locks a user out for a while after five
  failed sign-ins, doubling up to about 15 minutes. That allows a few hundred guesses a day per account,
  so even 2^31 guesses take tens of thousands of years. Spraying one guess across every account gains
  nothing at this account count. A 512-word list (36 bits) would mean longer, harder words for an
  8-year-old to copy; I'd keep 256.
- The automated check (in the tests): every list word against a word blocklist (crude, slur, hate,
  violence, drugs); banned strings that **span** the join of adjective and noun (none do); a small
  reviewed allowlist for whole words that contain a banned string (`Butterfly`); no duplicates; letters
  only; the four banned pairs and five banned numbers never produced. The blocklist is a safety net. The
  real guarantee is that every word is hand-picked and the owner approves the lists.

<details><summary>The draft lists (for the owner's approval)</summary>

**Adjectives (64):** Amber, Bold, Bouncy, Brave, Breezy, Bright, Bubbly, Busy, Calm, Cheery, Clever, Cosmic,
Cozy, Curious, Daring, Dancing, Dashing, Dreamy, Eager, Fancy, Fluffy, Friendly, Frosty, Fuzzy, Gentle,
Giggly, Glad, Golden, Happy, Humming, Jolly, Kind, Lively, Lucky, Lunar, Mellow, Merry, Mighty, Misty,
Moonlit, Nimble, Peaceful, Playful, Plucky, Quick, Quiet, Rosy, Shiny, Silver, Sleepy, Snowy, Snug,
Sparkly, Zippy, Starry, Steady, Sunlit, Sunny, Swift, Twinkly, Velvet, Wandering, Whistling, Wise

**Nouns (64):** Otter, Badger, Bear, Rabbit, Robin, Finch, Wren, Owl, Fox, Hedgehog, Panda, Koala, Penguin,
Puffin, Dolphin, Turtle, Squirrel, Chipmunk, Hamster, Kitten, Puppy, Pony, Lamb, Duckling, Swan, Heron,
Sparrow, Lark, Honeybee, Ladybug, Firefly, Butterfly, Dragonfly, Cricket, Frog, Seal, Llama, Alpaca, Lynx,
Fawn, Sunflower, Lemur, Gecko, Parrot, Toucan, Pelican, Flamingo, Zebra, Giraffe, Tiger, Lion, Wombat,
Platypus, Starfish, Seahorse, Acorn, Clover, Daisy, Tulip, Poppy, Maple, Willow, Fern, Blossom

**Passphrase words (256):** acorn anchor apple apron arrow attic badger bakery balloon bamboo banjo barn
basin basket beacon beetle bell bench bicycle biscuit blanket blossom boat bonfire bottle bracelet branch
breeze brick bridge brook broom bubble bucket bunny cabbage cabin cactus camel camera candle canoe canyon
carrot castle chalk cherry chimney circus clock cloud clover coat comet cookie corn cotton crayon cricket
crown crumb cupcake curtain daisy desert dinosaur dolphin donut dragon drum dune eagle echo emerald engine
falcon feather fence fern field fig firefly flag flute forest fossil fountain frog garden gate gecko gem
giraffe glove goat guitar hammer harbor harp hedgehog helmet hill honey hoop iceberg igloo island ivy
jacket jelly jigsaw jungle kangaroo kayak kettle kitten kiwi ladder lagoon lamb lantern lemon lily lizard
llama lobster lollipop magnet mango map maple marble meadow mitten moon moss muffin mushroom nest noodle
notebook oak oatmeal ocean octopus olive orange otter owl paddle pancake panda paper parrot pasta peach
peanut pebble pencil penguin pepper petal piano pickle pillow pinecone pinwheel planet plum pocket pond
pony popcorn potato pretzel puddle puffin pumpkin puppet puppy puzzle quilt rabbit raft rainbow reindeer
ribbon river robin robot rocket rooster ruler saddle salad sandal scarf scooter seed shovel skate sled
slipper snowflake snowman sock sparrow sprout squash squirrel star stone stream sugar summer sunset swing
teapot tent thistle thunder tiger toast toffee tomato tortoise tractor train trumpet tuba tulip tunnel
turtle twig umbrella unicorn valley vanilla velvet violin volcano waffle wagon walnut wheel whistle willow
window winter wizard wool wren yarn yogurt zebra zipper

</details>

**Twenty sample garden names** (drawn at random from the draft lists with Node's `crypto.randomInt`):
Lively-Starfish-49 · Dancing-Rabbit-84 · Snowy-Heron-39 · Bouncy-Acorn-32 · Calm-Lion-17 · Merry-Owl-58 ·
Friendly-Swan-73 · Merry-Pelican-83 · Starry-Blossom-63 · Bold-Chipmunk-97 · Jolly-Hedgehog-58 ·
Cheery-Clover-42 · Shiny-Panda-52 · Fuzzy-Tulip-76 · Silver-Lion-96 · Velvet-Honeybee-21 · Lively-Frog-71 ·
Nimble-Lark-50 · Nimble-Rabbit-41 · Mighty-Dragonfly-64

**Five sample passphrases:** `lobster unicorn paper anchor` · `slipper peach moss bottle` ·
`notebook peach tiger valley` · `crayon puppy bubble maple` · `yarn pinwheel squirrel canyon`

### Approach, file by file

1. **`js/garden-words.js`** (new; a classic script loaded by a `<script>` tag before `js/cloud.js`; it lives
   in `js/`, which `cloudflare-build.sh` already copies, so no build config changes): the three lists, the
   banned numbers and pairs, and pure functions:
   - `rollGardenName()`, `rollNumber()`, `rollPassphrase()`, using `crypto.getRandomValues` with rejection
     sampling (no modulo bias).
   - `gardenNameFrom(text)`: forgiving parse to the canonical `Brave-Otter-42` (Title-case words, hyphens),
     or `null` when it is not a garden name the generator could make.
   - `passphraseFrom(text)`: lower-case words joined by single hyphens (`lobster-unicorn-paper-anchor`), the
     form sent to Cognito as the password; `null` unless it is four list words.
   - `signInPair(name, pass)`: both canonical when the name parses; otherwise both **as typed**, so the
     owner's three or four free-text test accounts still sign in until TUN-101 removes them.
2. **`backend/src/garden-words.mjs`** (new): the same lists and `isGardenName(userName)` (the canonical form
   only). A test fails if the two copies differ (the pattern `validate.mjs` already uses for `PACKAGES`).
3. **`backend/src/presignup-api.mjs`**: for `PreSignUp_SignUp`, before the daily counter is touched,
   refuse `signup-not-garden-name` when `event.userName` is not a garden name, and `signup-has-attributes`
   when `event.request.userAttributes` carries **any** attribute (email, phone, anything). Drop the
   `autoVerifyEmail` branch. `PreSignUp_AdminCreateUser` (the owner's own tool) stays as it is. Refusals
   come before the counter so a tampered client cannot burn the day's 100 sign-ups. Both refusals reach a
   child only through an old or tampered page, and `submitAuth` already shows them as "the garden isn't
   taking new accounts just now".
4. **`backend/src/validate.mjs` `checkProgress`**: `name` is **dropped, not refused**, the way the retired
   `toolbox` key already is. A page opened before the deploy keeps saving instead of every save failing as
   "the cloud is resting"; the name is never stored. Records saved before the deploy still hold a `name`
   until TUN-101 cleans them, and the client ignores it (step 6).
5. **`backend/template.yaml`**:
   - `UserPool.AccountRecoverySetting`: `verified_email` → `admin_only` (no self-service recovery). The
     comments that promise optional email go.
   - `UserPoolClient`: set `WriteAttributes` so the browser client cannot write `email` (or any free-text
     attribute) after sign-up through `UpdateUserAttributes`, and `ReadAttributes` to match. **To verify
     while building:** whether CloudFormation and Cognito take an empty list or treat it as "all". If not,
     the narrowest non-text attribute (`updated_at`). The PreSignUp refusal covers sign-up either way.
   - Not touched: `UsernameConfiguration`, `Schema`, `AliasAttributes`, `UsernameAttributes`, `UserPoolName`,
     the client's `UserPoolId`/`GenerateSecret`: the properties whose change replaces the pool or the client.
     `tests/backend-template.test.mjs` gets a check that pins them, so a later edit cannot slip a
     replacement in.
6. **`js/cloud.js`** (kept narrow: TUN-112 is editing `onSignedIn`'s narration):
   - `cloudPush` sends a copy of `progress` without `name` (`cloudCopy(progress)`).
   - `onSignedIn`'s pull: `progress = cloud` becomes "the cloud copy, minus any `name` it holds, plus this
     device's `name`" (one line, `keepLocalName(cloud)`).
   - `cogSignUp(username, password)`: no attributes argument at all.
   - `showAuthForm("up")` → the garden-name roller and the card (new `showGardenCard`); `showAuthForm("in")`
     → *Garden name* + *Passphrase* boxes, with a 👁️ show toggle and `autocomplete="username"` /
     `"current-password"` so a browser may offer to remember it; *Lost your card?*.
   - `submitAuth`: sign-up retries a taken name (`UsernameExistsException`) up to 5 times, keeping the
     child's two words and rolling only the number; then the card. Sign-in goes through `signInPair`.
     Errors go through a new `friendlyAuthError(e)`.
   - The account is made **before** the card is shown, so the card can never show a name that was taken.
     `onSignedIn(true)` (which uploads the guest garden) runs at once, as today; the card is an overlay on
     top, and *Go to my garden* closes it.
7. **`js/boot.js` `doLandingSignIn`** and **`index.html` `#landingauth`**: the same two boxes, the same
   `signInPair` and `friendlyAuthError`. `index.html` also gets the card's markup and its print CSS
   (`@media print`: only the card prints).
8. **`js/home.js`**: the hint under *Name* ("Your name stays on this device"). `updateTitle` is unchanged.
9. **Docs**: `DESIGN.md` §11b gets the account model as built, written for a lawyer reading it cold: what
   is stored (garden name, Cognito's password verifier, progress without a name, songs), what is not (no
   email, no phone, no name, no passphrase anywhere but the card), what the public sees (the garden name,
   TUN-99), and what a lost card means. Also `backend/README.md` (the sign-up rules, recovery, the deploy
   and the stop rule now naming `UserPoolClient` too: a new client would change the client id written into
   `js/cloud.js`), and `README.md` § Current status.

### Tests that would prove it

- `tests/garden-words.test.mjs`: list sizes, uniqueness and letters only; the name count (347,820); 10,000
  rolls all parse and never give a banned pair or number; the blocklist and span checks above; the
  passphrase's 256 words; forgiveness (`"  brave otter 42"`, `"BRAVE_OTTER-42"`, `"Brave  -  Otter 42"` →
  `Brave-Otter-42`; `"Lobster Unicorn-paper  ANCHOR"` → the canonical passphrase); non-names → `null`;
  `signInPair` passing a legacy name through as typed; the JS and backend copies identical.
- `tests/backend-presignup.test.mjs`: a garden name with no attributes is confirmed; an email, a phone, or
  any attribute is refused `signup-has-attributes`; a free-text or non-canonical name is refused
  `signup-not-garden-name`; neither refusal touches the counter; `autoVerifyEmail` is never set;
  AdminCreateUser unchanged.
- `tests/backend-validate.test.mjs`: `name` dropped from what is stored, any type, never a 400.
- `tests/backend-template.test.mjs`: `admin_only` recovery; no `verified_email`; the client's
  `WriteAttributes`; the replacement-sensitive properties pinned.
- `tests/cloud-sync.test.mjs`: the PUT body has no `name`; a pull keeps this device's name (and ignores a
  `name` the cloud still holds); the title still reads it. The file's existing tests use `progress.name`
  as their marker for "which copy was applied", and those markers move to another field (`current` or a
  package's level) so they still prove what they proved.
- `submitAuth`: a taken name re-rolls the number only; each Cognito error code maps to its friendly line;
  no raw message reaches the form. The landing form forgives like the Home form.
- The browser: the roller, the card, its print preview and saved picture, both sign-in forms' layout on a
  phone-sized window. **The account flow cannot be tried off production** (the progress and songs API's
  CORS allows only `tunegarden.game`, and the new sign-up rules need the backend deployed), so it is the
  owner's playtest after merge and deploy.

### Risks

- **Pool or client replacement** would lose every account or break every page. Neither is planned, and
  the deploy steps say to read the change set's `Replacement` column for `UserPool` *and*
  `UserPoolClient` and answer `n` on `True`.
- **Does Cognito run PreSignUp before it checks that a username is free?** If it does, a taken name's
  retries each count against the day's 100. To find out from the docs while building; the number of
  retries is small either way.
- **`WriteAttributes` semantics** (step 5): to verify against the CloudFormation docs before writing it.
- **Old open pages during the deploy:** an old page's sign-up is refused (it shows "not taking new
  accounts"); its saves keep working (`name` dropped). Backend first, then merge, or the other way round:
  either order is safe.
- **`js/cloud.js` overlaps with TUN-112**: my edits there stay in `cloudPush`, one line of `onSignedIn`'s
  pull, and the auth form functions; I merge `origin/main` before finishing.
- **The 32-bit argument rests on Cognito's lockout.** If the owner or the lawyer wants more, the list goes
  to 512 words (36 bits) or the phrase to five words (40 bits).

### Questions only the owner can answer

1. **The words.** Do the draft lists' flavour and the samples above suit the game?
   - **A)** Approve as drafted. · **B)** Approve with edits (name the words to drop or add). · **C)** A
     different flavour, for example music words in the names (`Brave-Banjo-42`).
   - **I'd pick A**: animals and plants fit a garden, every word is kind on its own and next to every
     other, and the lists can still change before launch without touching anything else.
2. **The card.** Print, save as a picture, or both? Can it be shown again later?
   - **A)** Both, shown once, at sign-up. Later, Home shows the garden name only (it is public anyway).
     · **B)** Print only. · **C)** Save as a picture only. · **D)** Both, and the whole card again later:
     that means keeping the passphrase on the device, which the ticket rules out for `localStorage`.
   - **I'd pick A**: a family without a printer can save the picture; one without a phone gallery can
     print; the card is also legible on screen for copying by hand; and nothing secret stays on the device.
3. **The number in the name.** Keep it, or drop it for looks?
   - **A)** Keep a two-digit number (10–99, five numbers left out): 347,820 names, and a taken name changes
     only its number, so the child keeps the words they chose. · **B)** Drop it: 4,092 names with these
     lists, used up in about six weeks at the daily cap of 100; lasting a few years would need lists of
     roughly 600 × 600 words, too many to hand-pick to this standard. · **C)** Drop it, add a third word
     (`Brave-Otter-Meadow`): 64³ ≈ 262,000 names, but longer to type and to fit on the card.
   - **I'd pick A**: it is the only option that keeps the lists small enough to hand-check.

## Design review (`gpt-6.2-astra`)

`ask.sh fresh read-only`, 2026-11-20, on the plan above. Prompt: the whole ticket verbatim, the plan by path,
the area's review records. Usage: in 2,742,789 (cached 2,612,224), out 11,613.

<details><summary>GPT's design review, verbatim</summary>

1. **High — The proposed server check can reject every generated name.** The pool sets `CaseSensitive: false`. AWS says case-insensitive pools lowercase text passed to Lambda triggers. The plan generates `Brave-Otter-42` and accepts only that title-case spelling in PreSignUp. Use `brave-otter-42` as the account identifier and format it for display on the card, on Home, and eventually on shared songs. Test the lowercase trigger event, exact ASCII hyphens, both word lists, allowed numbers, and banned pairs. Keep spaces and underscores as sign-in conveniences only. **Confidence is high** on case folding. Confirm the event shape once with an owner-controlled account. [Pool configuration](backend/template.yaml#L208) · [AWS case-sensitivity rules](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-case-sensitivity.html)

2. **High — A child can create and upload a garden without ever keeping its card.** Sign-up, sign-in, and the first progress PUT are three separate operations. Closing the tab after Cognito creates the account can lose the only passphrase. Losing the sign-up response leaves the browser unsure whether the account exists. Reloading after sign-in can bypass the checkbox because boot resumes the cached session. Show the proposed card and obtain acknowledgment **before submitting sign-up**. On a confirmed collision, invalidate the old card, show the replacement, and require acknowledgment again. On an uncertain response, keep the same credentials and resolve that attempt before offering another roll. Disable double submission and test closing, reloading, and losing the connection at each boundary. [Plan, lines 143–149](reviews/TUN-93-garden-name-accounts.md#L143) · [Sign-up and sign-in](js/cloud.js#L152) · [Session restoration](js/boot.js#L125)

3. **High — A valid card does not prove the guest garden reached the cloud.** `onSignedIn(true)` can finish after a failed PUT. If the child immediately uses the card on a fresh phone, that phone can receive `GET null` and upload its own starter garden. The laptop’s next pull can then replace the original progress. Preserve TUN-106’s rule that failed reads never authorize writes. Show separate outcomes for “account created” and “progress saved,” retain the laptop copy on failure, and give the child a way to retry. A fresh device finding no cloud save should explain that the first device still needs to finish before it seeds the account. Test that two-device sequence, including a lost PUT acknowledgment. [Initial upload and empty-account behavior](js/cloud.js#L99) · [TUN-106 review](reviews/TUN-106-keep-cloud-progress-on-failed-load.md)

4. **High — The server would still accept `progress.name` and still return historical names.** The plan deliberately specifies HTTP success for `name` of *any type*. That contradicts the ticket’s “server no longer accepts `name`.” Remove it from the accepted PUT keys, return the existing fixed 400, and verify there was no database write. Separately, strip only the top-level `name` on GET from both historical DynamoDB maps and JSON-text rows. Preserve other legacy fields and the explicit `null` response. Otherwise an old client can still download a child’s name onto another device. If uninterrupted old-tab saves justify temporary acceptance and stripping, that needs an owner-approved transition and an end condition. TUN-101 can own deleting historical records independently. [Progress validator](backend/src/validate.mjs#L184) · [GET and PUT handler](backend/src/progress-api.mjs#L15) · [Historical-row test](tests/backend-handlers.test.mjs#L345)

5. **High — The account attribute policy is unresolved at the point where it must provide the privacy guarantee.** AWS documents that **omitting** `WriteAttributes` grants standard-attribute writes and omitting `ReadAttributes` grants broad reads. An absent list in a describe response can mean defaults. I found no AWS guarantee that explicitly passing `[]` establishes deny-all. `updated_at` also needs verification against the deployed schema and effective permissions. PreSignUp never protects post-sign-up profile edits. Require a tested, explicit least-privilege client configuration. Check that an ordinary signed-in account cannot add email, phone, name, or `preferred_username`, that fresh tokens omit legacy profile data, and that `sub` still authorizes progress. For a bare local sign-up, AWS describes `userAttributes` as the attributes supplied at sign-up, so an empty map is the expected shape with **moderate confidence**. Verify only the key names from a real event before enforcing it. The current `{}` fixture is synthetic. [AWS app-client permissions](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolclient.html) · [AWS trigger event](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-sign-up.html) · [Current fixture](tests/backend-presignup.test.mjs#L20)

6. **High — The draft can print racial slurs on a child’s card.** The passphrase list permits the adjacent words `jungle bunny` and `moon cricket`. Both are documented anti-Black epithets. The proposed checks examine individual passphrase words and adjective–noun joins, so both phrases pass. `Moonlit-Cricket` and `Lunar-Cricket` also deserve explicit review as public handles. Replace one constituent of each offensive phrase with another easy word before approval. Check all 65,536 ordered passphrase-word pairs, including pairs formed in the middle of a four-word card. Replacing words one-for-one preserves the entropy calculation. [Draft word lists](reviews/TUN-93-garden-name-accounts.md#L56) · [Primary source identifying both epithets](https://www.govinfo.gov/content/pkg/USCOURTS-txnd-3_20-cv-03397/pdf/USCOURTS-txnd-3_20-cv-03397-0.pdf)

7. **High — “Either order is safe” is wrong, and an old tab cannot be updated by a backend deploy.** Client-first leaves public sign-up permissive and existing tabs able to upload names and register free-text identities. Backend-first closes those paths, but strict progress validation makes old-tab saves fail, and an old email form may receive an attribute-permission error before the trigger runs. Its existing catch can show raw Cognito text. Merge `origin/main` **before implementation** as requested, reconcile TUN-112 before hand-off, then have the owner deploy and verify the backend **before merging the client to `main`**. Tell players with a stale page to reopen it before relying on cross-device sync. Document the temporary sign-up interruption and the chosen old-save behavior. [Plan’s deploy claim](reviews/TUN-93-garden-name-accounts.md#L195) · [Old error handling](js/cloud.js#L152) · [Deployment runbook](backend/README.md#L323)

8. **Medium — The CloudFormation replacement explanation confuses service restrictions with replacement behavior.** **High confidence:** `admin_only` as the sole recovery mechanism with priority 1 is valid and updates in place. Client `ReadAttributes` and `WriteAttributes` also update in place. Client `UserPoolId` and `GenerateSecret` require replacement. CloudFormation labels the named pool properties `No interruption`, including `UserPoolName` and `Schema`. Cognito separately makes sign-in options, case sensitivity, and required-attribute choices creation-time decisions, and schema changes have restrictions. An unsupported update can fail. For the actual change set, expect in-place pool/client changes and Lambda code updates. Stop on replacement, unexplained conditional replacement, or remove/add of the pool, client, or player tables. Inspect dependent conditional rows such as `PreSignUpPermission` individually. Retaining an old pool preserves its data while leaving the app pointed elsewhere. Keep the existing cost-switch checks before and after deploy. No deployed change set was available for this review. [AWS recovery option](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cognito-userpool-recoveryoption.html) · [Pool resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpool.html) · [Client resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolclient.html) · [Cognito update restrictions](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-updating.html)

9. **Medium — The 32-bit calculation is correct, but the strength conclusion is too broad.** I counted 256 distinct words. Four independent uniform draws **with replacement** give exactly 32 bits. Public lists are compatible with that calculation, and the public garden name adds zero secret bits. **High confidence:** AWS documents a one-second lockout after five failures, exponential backoff to about 15 minutes, and a reset after an idle period or successful sign-in. AWS reserves the right to change that behavior. It supports a narrow conclusion about online guessing against one account. Chances accumulate across accounts, and SRP does not justify “nobody can guess offline” under a verifier compromise. Card disclosure also grants immediate access. Record the assumed account population, exposure period, and threat model. If the owner wants more margin while retaining four words, 512 equally likely words give 36 bits. Five words would change the ticket. [Draft strength argument](reviews/TUN-93-garden-name-accounts.md#L39) · [AWS lockout rules](https://docs.aws.amazon.com/cognito/latest/developerguide/authentication-flow-things-to-know.html)

10. **Medium — `signInPair` treats membership in today’s generator as an account-version marker.** A legacy account can have a garden-shaped username and an ordinary case-sensitive password. Its password would be rejected or rewritten. Retiring a word or number later can likewise break an issued card’s forgiving sign-in. Keep the strict issuance validator on **sign-up**. Let card sign-in normalize case and separators using a stable syntax independent of the current lists. Privately check whether the few legacy accounts need an explicit exact-credential path through TUN-101. Avoid a silent second authentication attempt on every typo. A free-text sign-in can authenticate an existing user, but cannot create one. Also remove the old 24-character input limit from both sign-in forms, or pasted spaces can truncate a valid name before parsing. [Parser proposal](reviews/TUN-93-garden-name-accounts.md#L101) · [Home field](js/cloud.js#L130) · [Landing field](index.html#L875)

11. **Medium — Collision handling has one documented guarantee and one unresolved ordering question.** **High confidence:** `SignUp` returns `UsernameExistsException` for a taken username even with `PreventUserExistenceErrors: ENABLED`. **Unverified:** AWS describes when PreSignUp runs relative to creation, but does not specify its order relative to the uniqueness check. TUN-88 explicitly allows a counted admission that never becomes an account. Have the owner check one duplicate of their own test name against the counter or invocation evidence, using an authorized view. `mg-deploy` cannot read counter rows. Bound attempts, avoid repeating a suffix already tried, offer a different word pair on exhaustion, and stop immediately on quota, cost-switch, and uncertain network results. Five retries against one popular pair can fail while most names remain free. [AWS existence-error behavior](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-managing-errors.html) · [AWS trigger timing](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-sign-up.html) · [TUN-88 counting contract](backend/README.md#L581)

12. **Medium — The public-name review misses concrete joins, numbers, brands, and associations.** The current arithmetic is correct at **347,820** names, before any further exclusions. The draft contains 54 animals and 10 plant-related nouns, including `Sunflower`. I would return these specific items to the word checkpoint.

    - Removing separators forms `arse` in `Lunar-Seal` and `Lunar-Seahorse`, and `lez` in `Gentle-Zebra` and `Nimble-Zebra`. `Twinkly` contains `twink`. `Fuzzy-Duckling` invites the familiar obscene spoonerism. `Frog` has a derogatory use for a French person. These have different weights, but they disprove the claim that no concerning strings span a join. [Cambridge on “frog”](https://dictionary.cambridge.org/dictionary/english/frog)
    - `12`, `13`, `33`, `38`, `43`, and `83` remain available despite documented extremist uses. One checkpoint sample is `Merry-Pelican-83`. These associations are contextual. If the owner intends to exclude recognized two-digit codes, use a reviewed **allowlist** of suffixes and recalculate capacity. [ADL symbol database](https://go.adl.org/sites/default/files/documents/2023-03/hate-on-display-hate-symbols-database.pdf)
    - `Cosmic-Lynx` is an exact cybercrime-group name, meeting the plan’s own reason for excluding `Fancy-Bear` and `Cozy-Bear`. `Happy-Frog` is a registered gardening brand and `Sleepy-Bear` is Travelodge’s mascot. `Golden-Bear`, `Silver-Bear`, `Golden-Lion`, and `Silver-Lion` are festival awards, with `Silver-Lion-96` already in the samples. Distinguish names worth excluding from ordinary cultural overlaps the owner accepts. [Agari’s Cosmic Lynx report](https://static.fortra.com/agari/pdfs/guide/ag-acid-cosmic-lynx-gd.pdf) · [FoxFarm](https://foxfarm.com/product/happy-frog-potting-soil/) · [Travelodge](https://www.wyndhamhotels.com/travelodge/about-us) · [Berlinale](https://www.berlinale.de/en/festival/awards-and-juries/international-jury.html) · [Venice Biennale](https://www.labiennale.org/en/news/official-awards-83rd-venice-international-film-festival)
    - On private cards, `arrow` contradicts the stated weapon exclusion, `mushroom cloud` is an alarming allowed pair, and `snowflake` has an established insulting use. `bell/belle`, `gate/gait`, `plum/plumb`, and `carrot/carat` contradict the homophone claim. `donut/doughnut` and `yogurt/yoghurt` are ordinary spelling variants that can strand a child copying a card by ear. Test the revised words with a child using a phone keyboard. [Draft passphrase criteria](reviews/TUN-93-garden-name-accounts.md#L39) · [Cambridge on “snowflake”](https://dictionary.cambridge.org/dictionary/english/snowflake)

13. **Medium — The lost-card copy gives the wrong assurance on the device most likely to show it.** A child opening the landing screen on a new phone may have no garden there. Earlier play may survive only in the original browser and origin. An existing session can still open the old account, and creating a new account uploads local **progress** without transferring ownership of old cloud songs or syncing local quest history. Use wording such as “On the browser where you played, your progress may still be there. Open it there to save that progress to a new account.” Put the help on both sign-in screens. On the card distinguish the public garden name from the private four words, and tell the child to share only the name. In this public repository, use fictional cards for screenshots, review records, and test evidence. [Proposed lost-card copy](reviews/TUN-93-garden-name-accounts.md#L23) · [Cloud song ownership](backend/src/songs-api.mjs#L68)

14. **Medium — The privacy documentation promises more than the implementation establishes.** The browser may save a password through the explicitly enabled password manager. A saved picture or printout is an intentional credential copy. The landing form currently hides its password input without clearing it. Clear app-owned fields, card DOM, and temporary download URLs when done or cancelled. Describe what the game itself persists. Also distinguish new registrations from existing email attributes, historical progress, 35-day table recovery, and still-free-text song titles. `AdminCreateUser` is a separate privileged path that currently bypasses the proposed public-name check. Record its policy before TUN-99 displays maker names. Give counsel the factual inventory of identifiers, storage, and sharing for TUN-104. [Landing form lifecycle](js/boot.js#L106) · [Existing admin path](backend/src/presignup-api.mjs#L81) · [Table recovery](backend/README.md#L486) · [FTC guidance on identifiers](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)

15. **Medium — The verification plan misses the tests most likely to catch regressions.** The branch preview **can** exercise real Cognito authentication. TUN-87 and TUN-88 already did so. CORS blocks the progress and songs API there. After the owner deploys the backend, verify sign-up and sign-in on the preview before merging, then verify the real laptop upload and phone pull on production. Add the following checks to the plan. [TUN-88 preview record](reviews/TUN-88-daily-signup-limit.md#L433)

    - Exercise the **vendored SDK**. Its underlying `signUp` callback is positional. Remove email from the game wrapper while supplying the SDK’s empty attributes and validation-data arguments in their proper slots. `tests/cloud-resting.test.mjs` currently *requires* raw “User already exists” and “PreAuthentication failed” messages. Replace those assertions, preserve the quota and switch messages, and cover unknown errors and actual lockout responses on both forms. [Existing SDK and message tests](tests/cloud-resting.test.mjs#L143)
    - Test sign-up upload, debounced save, empty-account initialization, and legacy GET through the actual client and handler. Cover an empty local name, an edit while a pull is pending, sign-out/account switching, reload, `?reset`, Home’s input, and the visible title. `savePlayerName` currently calls `commitProgress` on every keystroke and schedules a whole-progress PUT. A local-only name save can avoid that unnecessary write. Use distinct package levels in sync fixtures because both current fixtures already use `current: "intro"`. [Persistence](js/persistence.js#L34) · [Sync fixtures](tests/cloud-sync.test.mjs#L10) · [Handler tests](tests/backend-handlers.test.mjs#L329)
    - Enumerate every adjective–noun pair and suffix deterministically. Inject test randomness for rejection sampling, repeated passphrase words, collision exhaustion, and exact agreement between client and server. The VM harness has no `crypto` global. The backend needs only the name vocabulary and exclusions. Ten thousand random rolls cannot establish that one bad combination is unreachable. [Harness globals](tests/harness.mjs#L233)
    - Add the required real-browser `file://` check for the new classic script alongside the syntax check and full test suite. On a phone, open the actual saved PNG and inspect print preview. Verify that only the card appears, all four words fit, failed or cancelled export preserves the card, and keyboard, backdrop, and Home controls cannot bypass acknowledgment. The existing `js/` folder already has build and cache coverage. [Repository verification rules](AGENTS.md) · [Home dismissal handlers](js/home.js#L8)

**Additional questions for the owner**

- May old tabs temporarily lose cloud saving until refreshed, so the server can reject `name` immediately, or do you authorize a time-limited compatibility exception?
- Do you accept 32 bits for four randomly issued words under the documented online-only assumptions, or should the four-word list be enlarged before the first cards are issued?
- Do any existing test accounts privately require an exact-password sign-in path, and should administrator-created accounts follow the same public-name and no-email rules? Only a yes/no or policy decision is needed in the public record.

</details>

## My answers

GPT found real problems: two slurs the draft lists could print on a child's card, a sign-up order that could
leave a child with an account and no card, and a server check that might refuse every generated name. Almost
all of it is agreed. One part is disagreed, and nothing is disputed in a way that needs the owner beyond the
questions below.

1. **High, case folding — agreed.** The account identifier becomes lower case (`brave-otter-42`); the card,
   Home and later shared songs show it in title case (`Brave-Otter-42`). The server lower-cases
   `event.userName` before it checks it, so it is right whether or not Cognito folds case for a native
   sign-up. (The AWS page I found confirms the lower-casing only for federated users' names; GPT's
   confidence is higher than the source I could read. Either way this design does not depend on it, and the
   owner's preview sign-up shows the real event.)
2. **High, the card before the account — agreed; the order changes.** Roll the name, roll the passphrase,
   show the card, *"I've kept my card"*, and only then sign up, sign in and upload. A taken name: a new
   number (never one already tried), the card redrawn with *"Someone just took that name, so here is your
   new card. Keep this one."*, and the box must be ticked again. A sign-up whose answer is lost: try signing
   in with the same name and passphrase before anything else; signed in → the account exists, carry on;
   refused → the name belongs to someone else, roll the number; still no network → keep the card, say so,
   and offer *Try again* with the same words. The button is disabled while a step is working. Reloading
   before the box is ticked loses only an unmade account.
3. **High, upload proof — partly agreed.** The card's last step now waits for the upload and says which
   happened: *"Your garden is saved in the cloud ✓"*, or *"Your account is made, but your garden isn't in the
   cloud yet. Keep this page open and press Try again."*, with the laptop's copy kept and a retry. **Disagreed
   on changing what a fresh device does with an empty cloud copy in this ticket:** every account has that
   hazard today (TUN-106 kept it on purpose: an explicit `null` means "nothing saved yet"), the fix changes
   `onSignedIn`'s pull logic while TUN-112 is editing the same function, and the ticket does not ask for it.
   Filed as TUN-122 (Backlog, `needs-owner`: what a device should do with an empty cloud copy is the
   owner's call).
4. **High, `name` on the server — agreed; my plan reversed.** `checkProgress` refuses `name` with the fixed
   400, as the ticket says. I had dropped it silently to spare old open pages, but only three or four
   accounts exist, all the owner's test accounts; a guest never pushes; and a signed-in old page recovers by
   reloading. So no owner decision is needed. `GET /progress` also strips a top-level `name` from what it
   returns (both stored shapes), keeping `null` and every other field, so a historical name never reaches
   a device again. TUN-101 deletes the stored ones.
5. **High, attribute permissions — agreed.** The client gets explicit `ReadAttributes` and `WriteAttributes`
   lists. Whether an empty list means "none" gets settled from the API reference while building; if it is
   not certain, the narrowest list that holds no free text. The owner's deploy check reads the client back
   (`aws cognito-idp describe-user-pool-client`). PreSignUp refuses a **named** list of attributes, `email`,
   `phone_number` and every free-text standard attribute, rather than "any key", so an unexpected key from
   Cognito cannot refuse every sign-up, and it logs the attribute **names** (never values) it saw.
6. **High, slurs across passphrase words — agreed, and thank you.** `bunny` and `cricket` are out of the
   passphrase list; `Cricket` is out of the names. The tests now check all 65,536 ordered pairs against a
   phrase blocklist (it caught `pocket rocket`, so `pocket` went too).
7. **High, deploy order — agreed.** "Either order is safe" was wrong. The order is: the owner deploys the
   backend and checks the change set; signs up and signs in on this PR's branch preview (Cognito works
   there; the progress API does not); merges; then plays the laptop-to-phone flow on production. Until the
   merge, production's old page cannot make an account (it says the garden isn't taking new accounts, or,
   for an email typed in, may show Cognito's raw text), and a signed-in old page's saves fail until it is
   reloaded. That window is minutes, and the docs say so.
8. **Medium, the replacement explanation — agreed.** Corrected below. The stop rule names `UserPool`,
   `UserPoolClient` and the tables, and says to stop on an unexplained `Conditional` too.
9. **Medium, the strength claim — agreed.** Narrowed below: online guessing against one account under
   Cognito's present lockout, which AWS may change; across all accounts, the odds add up; a leaked verifier
   or a seen card is outside what four words can protect. The 512-word option is now Question 4.
10. **Medium, the forgiving parse — agreed.** Sign-in normalises by syntax, not by today's lists: lower
    case, runs of spaces, hyphens and underscores become one hyphen; a name of the form `word-word-NN` is a
    card name and its passphrase is normalised the same way; anything else (the owner's test accounts) goes
    to Cognito as typed. One attempt, never a silent second. The 24-character limit goes from both forms.
11. **Medium, collisions — agreed.** Covered in 2: numbers never repeated; after five taken numbers, a new
    word pair; a refusal for the day's limit, the cost switch or a lost answer stops the loop at once. The
    owner's deploy check notes whether a taken name counted against the day's 100.
12. **Medium, the public names — agreed, with one exception.** Out of the names: `Twinkly`, `Fuzzy`,
    `Lunar`, `Zebra`, `Frog`, `Lynx`, `Cricket`; `Sleepy-Bear` banned. Numbers: an allowlist, 10–99 without
    12, 13, 14, 18, 28, 33, 38, 43, 69, 83 and 88. Out of the passphrase list: `arrow`, `mushroom`,
    `snowflake`, `bell`, `gate`, `plum`, `carrot`, `donut`, `yogurt`, and on my own re-check `wheel` and
    `harbor`. `frog` stays in the passphrase list, which is never public. **Exception:** I would keep
    `Golden-Bear`, `Silver-Bear`, `Golden-Lion` and `Silver-Lion`. A film award is a kind thing to be
    mistaken for. The owner decides in Question 1.
13. **Medium, lost-card copy — agreed.** New wording below, on both sign-in screens; the card says which half
    is safe to share. Screenshots and test evidence use made-up cards.
14. **Medium, the privacy record — agreed.** DESIGN.md §11b lists what the game stores and what it does
    not, and also the copies outside its control: a printed or saved card, a browser's password manager,
    emails and names already stored for the test accounts until TUN-101, 35 days of table backups, and
    song titles (still free text, a separate ticket). The card, its picture URL and the forms are cleared
    when done or cancelled. `AdminCreateUser` follows the same name and no-email rules (a choice the owner
    may overrule).
15. **Medium, the tests — agreed.** Added to the plan below: the vendored SDK's positional `signUp`; the
    `cloud-resting` assertions that require raw Cognito text are replaced; every pair and number enumerated,
    with randomness injected; the name saved to this device without scheduling a cloud push; the `file://`
    check; print preview and the saved picture on a phone; a preview sign-up before merge.

GPT's three extra questions: the old-tab one is settled in 4 (refuse; no owner decision needed); the
strength one is Question 4; the test-account and admin ones are choices I made (10 and 14), listed for the
owner to overrule.

## Plan, revised after the design review

The plan above stands except where this section changes it.

**Sign-up, in order.** 🎲 roll a name (re-roll as often as liked) → *Make my garden* rolls the passphrase
and shows the card → *Print* / *Save as a picture*, and the words are big enough to copy by hand → tick
*"I've kept my card"* → *Go to my garden*: sign up, sign in, upload, each step shown → *"Your garden is saved
in the cloud ✓"*, or the account-made-but-not-uploaded message with *Try again*. Collisions and lost
answers as in answer 2.

**The card says:** the garden name, *"Your garden name. It's OK to share this."*; the four words, *"Your
secret words. Don't share these. With your garden name, they open your garden on any device."*;
`tunegarden.game`.

**Lost your card?** (on Home's and the landing screen's sign-in forms): *"Without the card, that account
can't be opened. On the device where you played, your garden may still be there: open the game there and
make a new account, and your progress goes up to the cloud again. Songs saved to the old account stay
with it."*

**Identifiers.** Account: `brave-otter-42` (lower case, ASCII hyphens). Display: `Brave-Otter-42`.
Passphrase sent to Cognito: `vanilla-zipper-teapot-goldfish`. Card and form: words with spaces.

**Server.** `presignup-api.mjs`: lower-case `event.userName`, then refuse `signup-not-garden-name` unless it
is `adjective-noun-NN` from the lists, the number on the allowlist and the pair not banned; refuse
`signup-has-attributes` for a named attribute; both before the counter; the same for `AdminCreateUser`.
`validate.mjs`: `name` refused (400). `progress-api.mjs`: `GET` strips a stored top-level `name`. The
backend copy of the lists carries only the name vocabulary, numbers and banned pairs.

**Client.** `savePlayerName` saves to this device and does not schedule a cloud push. `cloudPush` sends no
`name`; the pull keeps this device's `name`. Both sign-in forms: no length limit of 24, the syntax-based
normalisation, `friendlyAuthError`, *Lost your card?*.

**Template, and what the change set must show.** In place (`Modify`, `Replacement: False`): `UserPool`
(`AccountRecoverySetting` → `admin_only`), `UserPoolClient` (`ReadAttributes`, `WriteAttributes`), the
three functions' code, and the rows `backend/README.md` already lists as normal. **Stop and answer `n`** on
`Replacement: True`, on a `Conditional` the README does not explain, or on a remove-and-add of `UserPool`,
`UserPoolClient`, `ProgressTable` or `SongsTable`. A replaced pool keeps its accounts (`Retain`) while
the game points at an empty new one; a replaced client changes the client id written into `js/cloud.js`.
The correction to my plan's step 5: CloudFormation marks most pool properties *No interruption*; the
danger is that Cognito fixes some of them at creation (sign-in options, case sensitivity, required
attributes), so changing them fails or forces a new pool. The plan changes none of them, and the template
test pins them.

**Strength, as it will be recorded.** 256 words, four independent uniform draws with replacement: 32 bits.
It holds against online guessing at one account under Cognito's present lockout (five failures, then
waits doubling to about 15 minutes, which AWS may change): a few hundred guesses a day. Across many
accounts the chances add up; a stolen password verifier, or a card someone has seen, is outside what four
words protect against. Assumed: tens of thousands of accounts at most, for years.

**Tests added to the plan.** All 4,096 pairs × 79 numbers enumerated (not sampled); all 65,536 passphrase
pairs against the phrase blocklist; randomness injected for rejection sampling and collision runs; the JS
and backend lists identical; the vendored SDK's `signUp` slots; collision, lost answer and quota stops;
`cloud-resting`'s raw-text assertions replaced by friendly ones on both forms, with lockout
(`NotAuthorizedException` "Password attempts exceeded", `LimitExceededException`) and unknown errors; the
GET strip on both stored shapes; `name` refused with no database write; the local name through an empty
name, a pending pull, sign-out and account switching, reload, `?reset`, Home's box and the title; sync
fixtures told apart by package level, not `name`; the `file://` check; print preview and the saved
picture on a phone; the card's box cannot be skipped by keyboard, backdrop or Home.

**The lists, revised** (the owner approves them in Question 1):

<details><summary>Revised lists</summary>

**Adjectives (64):** Amber, Bold, Bouncy, Brave, Breezy, Bright, Bubbly, Busy, Calm, Cheery, Clever, Cosmic,
Cozy, Curious, Dancing, Daring, Dashing, Dreamy, Eager, Fancy, Fluffy, Friendly, Frosty, Gentle, Giggly,
Glad, Golden, Graceful, Happy, Hopeful, Humming, Jolly, Joyful, Kind, Lively, Lucky, Mellow, Merry, Mighty,
Misty, Moonlit, Nimble, Peaceful, Playful, Plucky, Quick, Quiet, Rosy, Shiny, Silver, Sleepy, Snowy, Snug,
Sparkly, Starry, Steady, Sunlit, Sunny, Swift, Velvet, Wandering, Whistling, Wise, Zippy

**Nouns (64):** Acorn, Alpaca, Badger, Bear, Blossom, Bluebird, Butterfly, Chipmunk, Clover, Daisy, Dolphin,
Dragonfly, Duckling, Fawn, Fern, Finch, Firefly, Flamingo, Fox, Gecko, Giraffe, Hamster, Hedgehog, Heron,
Honeybee, Kitten, Koala, Ladybug, Lamb, Lark, Lemur, Lion, Llama, Maple, Marmot, Meerkat, Otter, Owl, Panda,
Parrot, Pelican, Penguin, Platypus, Pony, Poppy, Puffin, Puppy, Rabbit, Robin, Seahorse, Seal, Sparrow,
Squirrel, Starfish, Starling, Sunflower, Swan, Tiger, Toucan, Tulip, Turtle, Willow, Wombat, Wren

**Numbers (79):** 10–99 except 12, 13, 14, 18, 28, 33, 38, 43, 69, 83, 88. **Banned pairs (5):** Silver-Fox,
Fancy-Bear, Cozy-Bear, Dancing-Bear, Sleepy-Bear. **(64 × 64 − 5) × 79 = 323,189 names.**

**Passphrase words (256, at most 8 letters):** acorn anchor apple apron attic badger bakery balloon bamboo
banjo barn basin basket beacon beehive beetle bench bicycle biscuit blanket blossom boat bonfire bottle
bracelet branch breeze brick bridge brook broom bubble bucket cabbage cabin cactus camel camera candle canoe
canyon castle chalk cherry chimney circus clock cloud clover coat comet cookie corn cotton crayon crown
crumb cupcake curtain daisy desert dinosaur dolphin dragon drum dune eagle echo emerald engine falcon
feather fence fern field fig firefly flag flute forest fossil fountain frog garden gecko gem giraffe glove
goat goldfish guitar hammer hamster harp hedgehog helmet hill honey hoop iceberg igloo island ivy jacket
jelly jigsaw jungle kangaroo kayak kettle kitchen kite kitten kiwi ladder lagoon lamb lantern lemon lily
lizard llama lobster lollipop magnet mango map maple marble meadow mitten moon moss muffin nest noodle
notebook oak oatmeal ocean octopus olive orange ostrich otter owl oyster paddle pancake panda paper parrot
pasta peach peanut pebble pencil penguin pepper petal piano pickle pillow pinecone pinwheel planet pond pony
popcorn potato pretzel puddle puffin pumpkin puppet puppy puzzle quilt rabbit radish raft rainbow reindeer
ribbon river robin robot rocket rooster ruler saddle sailboat salad sandal sandbox scarf scooter seed seesaw
shovel skate sled slipper snowman sock sparrow sprout squash squirrel star stone stream sugar summer sunset
swing tadpole teacup teapot tent thistle thunder tiger toast toffee tomato tortoise tractor train trumpet
tuba tulip tunnel turnip turtle twig umbrella unicorn valley vanilla velvet violin volcano waffle wagon
walnut whistle willow window winter wizard wool wren yarn zebra zipper

</details>

**Twenty sample garden names** (revised lists, drawn with Node's `crypto.randomInt`): Sparkly-Tulip-60 ·
Silver-Gecko-93 · Wandering-Otter-89 · Rosy-Seahorse-35 · Lively-Chipmunk-68 · Bold-Robin-62 ·
Friendly-Lemur-99 · Sunny-Firefly-77 · Fancy-Kitten-63 · Joyful-Sparrow-73 · Plucky-Fern-25 ·
Busy-Blossom-89 · Plucky-Fern-35 · Quiet-Sparrow-30 · Mellow-Koala-41 · Quiet-Lamb-61 · Sunlit-Dragonfly-95 ·
Giggly-Starfish-66 · Dancing-Honeybee-37 · Bubbly-Hedgehog-22

**Five sample passphrases:** `vanilla zipper teapot goldfish` · `potato piano crayon cupcake` ·
`falcon salad glove gecko` · `sprout clock curtain rooster` · `engine oatmeal pickle map`

**Questions for the owner** (these replace the plan's three; the picks stand, and 4 is new):

1. **The words.** Do the revised lists and samples suit the game? **A)** Approve. · **B)** Approve with edits
   (name them). · **C)** A different flavour, e.g. music words in the names. Also: keep `Golden-`/`Silver-`
   `Bear`/`Lion` (film-festival awards), or ban them? — **I'd pick A, and keep them.**
2. **The card.** **A)** Print and save as a picture, shown once, before the account is made; Home later
   shows the garden name only. · **B)** Print only. · **C)** Picture only. · **D)** Show the whole card again
   later, which means keeping the passphrase on the device. — **I'd pick A.**
3. **The number.** **A)** Keep it (323,189 names; a taken name changes only its number). · **B)** Drop it
   (4,091 names, used up in about six weeks at 100 sign-ups a day). · **C)** A third word instead
   (`Brave-Otter-Meadow`, about 262,000 names, longer). — **I'd pick A.**
4. **The passphrase's strength.** **A)** 256 words, 32 bits, under the assumptions above. · **B)** 512 words,
   36 bits: still four words, but longer and harder ones for an 8-year-old to copy. — **I'd pick A.**

## Owner's decisions

All given 2026-11-21 as "1A, 2A, 3A, 4A", relayed by the orchestrator to session `music-garden-48`, which
took the ticket over from `music-garden-47`.

1. *Design checkpoint (`needs-owner`)*: **passed** — build *Plan, revised after the design review*.
2. *The words (Question 1), and the festival-award pairs*: **A, the revised lists approved.** The answer did
   not mention `Golden-`/`Silver-` `Bear`/`Lion`; read as the recommended option, **kept**. The hand-off
   says so, so the owner can correct it.
3. *The card (Question 2)*: **A** — print and save as a picture, shown once, before the account is made;
   Home later shows the garden name only.
4. *The number in the name (Question 3)*: **A** — kept; 323,189 names.
5. *The passphrase's strength (Question 4)*: **A** — 256 words, 32 bits, under the recorded assumptions.
6. *The previous worker's choices* (old tabs fail to save until reloaded; the owner's test accounts sign in
   as typed until TUN-101; `AdminCreateUser` follows the same name and no-email rules; a browser may offer
   to remember the passphrase): **not overruled; they stand.**
