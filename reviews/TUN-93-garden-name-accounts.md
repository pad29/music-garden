# TUN-93 — Create accounts with a generated garden name and passphrase, and keep the profile name on the device

Branch `ao/garden-accounts/root` · Size **M** (label and `## Size` agree) · `needs-owner` · PR #166

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
7. *A fourth PR review round, on round 3's fixes* (the budget is three; round 3 still requested changes, which
   are fixed but unreviewed — *PR review, round 3*): **open**.

## Build (session `music-garden-48`, 2026-11-22)

Built *Plan, revised after the design review*, with the owner's answers above. **No property that replaces
the pool, the client or a table changes**; the template test now pins them (below).

**The two to-verify items, from the AWS documentation:**

1. *An empty `WriteAttributes` list.* AWS documents only that **omitting** `ReadAttributes` / `WriteAttributes`
   grants every standard attribute; nothing says an empty list means "none" (the CloudFormation and
   `CreateUserPoolClient` references, and the user-attributes guide). Both update with *No interruption*. So,
   as the plan said, the client names the narrowest list instead: `[updated_at]`, a number no one types.
   That Cognito accepts it is the deploy's to prove: if it refused, the deploy rolls back with nothing
   changed, and the owner's first check reads the client back.
2. *The PreSignUp event.* The request holds `userAttributes`, `validationData` and `clientMetadata`; AWS does
   not say that a sign-up with no attributes sends an empty map, and says the case-insensitive pool flattens
   "attribute values" in trigger input to lower case without naming `userName`. So the trigger lower-cases
   `userName` itself, and refuses a **named** list of attributes (`REFUSED_ATTRIBUTES`) rather than "any
   key", tolerating a missing or `null` map. AWS also says nothing of when the trigger runs relative to the
   uniqueness check: the owner's optional deploy check 3 (`backend/README.md`) finds out.

**Departures from the plan, and why:**

- *The card's code is its own file*, `js/garden-card.js` (the roller, the card, `createGarden`), loaded after
  `js/cloud.js`; `js/garden-words.js` holds only lists and pure functions, so the backend-copy test can read
  it. The plan had the card in `cloud.js`.
- *A taken name keeps the secret words*; only the name changes, and the card must be kept again. A card
  already copied stays half right, and the redrawn card says what changed.
- *An error that is not the trigger's* (a throttle, an unknown error) leaves the card and offers Try again with
  the same words; only the trigger's refusals (closed, full) withdraw the card, since no account can be made.
- *Sign-in's "as typed" path* (old test accounts) sends the name trimmed and the password untouched, as the old
  form did.
- *Sign-in forgives Unicode dashes* (‐ to ―) as separators too: a card's words pasted from a document may carry them.
- *The progress-size test* pads with JSON whitespace: the name was the last free-text field, so a multibyte
  padding is no longer possible inside a valid record. That bytes, not characters, are measured is the
  multibyte `413` case.
- *`AdminCreateUser`* now runs the same rules, so `backend/README.md` says how the owner makes an account by
  hand (a garden name, no attributes, a permanent four-word password).

**Tests** (1062 pass): new `tests/garden-words.test.mjs` (all 323,189 names in both copies of the rule; the two
copies' lists identical; every word and adjective–noun join against a ROT13-encoded blocklist, with one
reviewed exception, `butterfly`; all 65,536 passphrase pairs against a phrase blocklist; scripted and real
randomness; forgiveness; no storage) and `tests/garden-card.test.mjs` (the card through a DOM of its own:
nothing sent before the card is kept, taken names, lost answers both ways, closed and full sign-ups, a
failed upload and a failed sign-in, double presses, Cancel, friendly errors on both forms). Changed:
`backend-presignup` (the rules, both sources, before the counter), `backend-validate` and
`backend-handlers` (`name` refused with no write; `GET` strips it from both stored shapes),
`backend-template` (recovery, the client's lists, the creation-fixed properties, each with a mutation),
`cloud-sync` (markers moved to package levels; the name never uploaded, kept by a pull, saved with no push)
and `cloud-resting` (the sign-up refusals through `createGarden`; what the real library sends).

**Browser** (AO's browser on this worktree, files checked byte for byte): the landing sign-in form and its
lost-card help; Home's name hint, roller, card (Go disabled until the box is ticked), *Save as a picture*
reporting success, Cancel clearing the card, Home's sign-in form, and the empty-form message. No errors. Go
was **not** pressed: it would make a real account in the production pool under the old trigger.

**Not verified here** (the owner's): the account flow against the deployed backend (deploy check 2, on the
PR preview, then laptop to phone on production); print preview and the saved picture on a phone; the
layout on a phone-sized screen; a `file://` load of the two new scripts.

## PR review, round 1 (`gpt-6.2-astra`, through `ask.sh`)

`ask.sh fresh read-only`, 2026-11-22, on head `eaa7aa2`. Prompt: the ticket verbatim, the owner's answers, the
files built, the departures, what to look at. Usage: in 2,751,130 (cached 2,607,744), out 11,146.
**Verdict: changes requested.**

<details><summary>GPT's PR review, verbatim</summary>

**Request changes on PR #166 at `eaa7aa2a59445591d47a7ae476b1e45d638ca29f`.** A card retry can overwrite a different account’s unread progress, an ambiguous sign-up can discard a valid card, and the card can report a successful save after newer progress failed to upload.

### Required before merge

1. **High — Bind the card’s upload permission to the account it created.** `createGarden` remembers `a.signedIn` as a boolean. After a failed upload, *Try again* calls `onSignedIn(true)`, which starts a new cloud run using whichever user the SDK currently has in shared browser storage. If another tab has signed in to account B, the retry can PUT this device’s progress to B without reading B’s garden. It can also override B’s failed-load protection. Capture the authenticated subject for the card, verify the subject of the token actually used for the PUT, and invalidate the upload permission when the session changes. A missing session should offer sign-in with the kept card. [js/garden-card.js:49](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:49) · [js/cloud.js:106](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:106)

2. **High — Resolve a lost sign-up answer before submitting another sign-up.** The retry repeats `cogSignUp` first. A quota or trigger refusal on that second request withdraws the card even though the first request might have created the account. If the retry returns `UsernameExistsException`, a throttled or temporarily locked sign-in is treated as proof that somebody else owns the name. Both paths can strand an account and tell the child to discard its valid card. Try signing in with the original card first, as the revised plan specifies. Preserve the card through ambiguous service failures. Rename only after establishing a collision and a definitive credential mismatch. [js/garden-card.js:36](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:36) · [design decision:294](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/reviews/TUN-93-garden-name-accounts.md:294)

3. **High — Give the card the same save guarantee as Home.** `onSignedIn` checks `_pushSeq===push` before telling Home “saved to cloud,” then returns the unqualified `ok` to the card. A delayed first PUT can succeed after a newer save was queued or failed. The card then says “Your garden is saved in the cloud ✓” and removes *Try again*. Return whether the **current** progress was confirmed saved, and show success only for that outcome. Two existing tests already construct this race but assert only Home’s text. [js/cloud.js:116](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:116) · [js/garden-card.js:104](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:104) · [tests/cloud-sync.test.mjs:564](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/tests/cloud-sync.test.mjs:564)

4. **Medium — Fix the card controls after submission.** The checkbox stays editable during the request. If the child unticks it and the upload fails, the handler removes the checkbox and disables *Try again* based on its now-unchecked value. There is no way to re-enable it. A separate failure leaves the child stuck: when sign-up succeeds but sign-in fails, Cancel is removed and Done has never been created. Latch acknowledgment for that exact card, reset it only on a rename, and drive the controls from the operation’s state. After account creation, offer an exit that explains the account exists and the local garden still needs uploading. [js/garden-card.js:90](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:90)

5. **Medium — Make the card a keyboard- and screen-reader-accessible modal.** Opening it destroys the initiating button, moves no focus, and leaves Home’s actions reachable with Tab. A keyboard user can operate the account panel behind the card or open a second roller while the first attempt is visible. `overlayUp()` suppresses game shortcuts but does not stop native button activation. Use a labelled modal dialog, move and contain focus, make the background inert, announce collision and operation messages, and restore focus to an appropriate Home control when the card closes. [index.html:1017](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/index.html:1017) · [js/garden-card.js:78](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:78)

6. **Medium — Stop telling the child the PNG was saved when the browser has only received a download request.** A canceled or blocked download still produces “Saved.” That assurance comes immediately before the child decides whether they have kept their only recovery credential. Also, exceptions inside the asynchronous `toBlob` callback escape the surrounding `try`. Say to check the downloaded picture before ticking the box, handle callback failures, and retain the print and handwritten alternatives. [js/garden-card.js:126](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:126) · [HTML download behavior](https://html.spec.whatwg.org/multipage/links.html#downloading-resources)

7. **Medium — Protect the local name during the backend-first deploy gap.** An old page signing in or resuming during the gap assigns `progress=cloud` and immediately persists it. The new GET strips `name`, so that old page erases the device’s name. Its subsequent nameless PUT can also succeed. The runbook describes only rejected saves and recommends reloading, which can itself trigger the destructive pull while the old site is still live. Keep old clients from applying the new GET during the transition, or, for the owner’s few accounts, document and enforce a window with those sessions closed until the new client is confirmed live. Also qualify the claim that the old sign-up form is refused: the trigger accepts an allowed garden name with no attributes regardless of which page supplied it. [backend/src/progress-api.mjs:27](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/backend/src/progress-api.mjs:27) · [backend/README.md:392](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/backend/README.md:392)

8. **Medium — Correct the change-set stop rule and the owner’s deploy checks.** The runbook omits the revised plan’s explicit stop on **Remove/Add** for the pool, client, or either player table. Those actions need not have a `Replacement: True` row. `CloudSwitchFn` is already in the usual-rows table. Describe the rows as expectations, require inspection of dependent `Conditional` rows, and verify stack status and physical IDs after an update or rollback. The optional counter check also needs an authorized data reader and a quiet interval before attributing an increment to the duplicate attempt. The documented `mg-deploy` identity cannot read table items. [backend/README.md:352](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/backend/README.md:352) · [backend/README.md:383](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/backend/README.md:383) · [AWS change-set examples](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets-samples.html)

9. **Medium — Correct the privacy inventory.** Cognito assigns a persistent `sub`. The backend stores it as the progress key and song owner, and the vendored SDK persists the last username and ID, access, and refresh tokens on the device. The configured refresh-token lifetime is 365 days. These facts matter on a shared device and explain why losing the card need not end an existing session. The trigger also cannot inspect the password or prove who generated the username. Document what the game generates, what the trigger enforces, which identifiers link records, and which credentials the browser retains. Correct the same section’s claim that the client loads Cognito from a CDN. [DESIGN.md:338](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/DESIGN.md:338) · [DESIGN.md:368](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/DESIGN.md:368) · [backend/template.yaml:257](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/backend/template.yaml:257) · [AWS ID-token claims](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html)

10. **Medium — Finish the sign-in form lifecycle on both screens.** After *Show → Back* on the landing screen, the next visitor’s passphrase field is still plain text. Closing Home by its normal Close button or backdrop leaves the password in a hidden input. Back and Cancel also remain active during sign-in, so an operation the child believes they canceled can finish and apply cloud progress. Clear and remask on every exit. Disable dismissal while signing in or invalidate the pending operation on dismissal. Restore the busy controls in `finally` so a rejected session lookup cannot leave either form stuck. [js/boot.js:117](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/boot.js:117) · [js/cloud.js:199](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:199) · [js/home.js:8](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/home.js:8)

11. **Low — Make the fifth collision choose a different word pair.** `rollGardenName` can draw the current adjective and noun again. `tried` rejects only a repeated *full* name, so a different suffix satisfies the check and defeats the promised escape from a crowded pair. Exclude the current pair on that draw and select from remaining suffixes on number-only retries. [js/garden-card.js:25](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:25)

### Missing tests and acceptance evidence

12. **`tests/garden-card.test.mjs` — Uncertain creation.** Lose the first sign-up response after simulated account creation. Assert that the next call is sign-in with the same credentials. Return a throttle, lockout, or internal error and assert the original face and retry survive. Separately cover a request that never reached Cognito, a genuine collision, and a quota refusal after an ambiguous request. Assert no second account or replacement card while ownership remains unresolved.

13. **`tests/cloud-sync.test.mjs` — Account-bound retry and truthful success.** Fail A’s initial PUT, switch the cached session to B, fail B’s GET, then retry A’s card. Assert zero PUTs to B and that B stays write-blocked. Also complete an older successful PUT after a newer save is queued or rejected. Assert the **card** retains a retry and does not report the current garden saved.

14. **`tests/garden-card.test.mjs` — Controls and dismissal.** Hold the first request open, attempt to untick, then fail the upload. Assert Retry remains usable. Fail sign-in after confirmed creation and assert the child can exit with their local progress intact. Exercise Show/Back/reopen, Home Close and backdrop, pending sign-in dismissal, and a rejected session lookup. Assert masking, field cleanup, correct busy state, and no late application of a canceled sign-in. Force the fifth collision to draw the old pair with a fresh suffix and assert it redraws.

15. **`tests/cloud-sync.test.mjs` — Profile name through actual entry points.** Type the name through Home, reload from the same storage, pull a nameless cloud record, and reopen Home. Assert the field, title, and stored name agree. Repeat after accepted and declined `?reset`. Cover the deploy-gap procedure with an old-client pull against the new GET. The current tests cover the helper and in-memory pull but miss the old client persisting the nameless response.

16. **`backend/README.md` — Effective AWS permissions and JWT acceptance.** After the owner deploys, verify an ordinary signed-in account is denied post-sign-up writes to email, phone, name, and `preferred_username`. Inspect a freshly issued legacy-account token privately for omitted profile attributes and retained `sub`, `iss`, and `aud`. Use the fresh token for an authenticated progress request through API Gateway. A CORS failure from the branch preview proves none of those API properties. AWS documents `updated_at` as a mutable numeric standard attribute, the changed pool/client properties as in-place updates, and issuer/audience as authorizer inputs. I found no template change requiring pool, client, or table replacement. Acceptance by this deployed pool and authorizer remains an owner check. [AWS attribute schema](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_DescribeUserPool.html) · [Pool updates](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpool.html) · [Client updates](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolclient.html) · [API Gateway JWT validation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)

17. **`reviews/TUN-93-garden-name-accounts.md` — Real-browser card acceptance.** Use a fictional longest-name, long-word card. Open `index.html` through `file://`, traverse the card with keyboard and assistive technology, inspect print preview, and **open the saved PNG** on a phone. Assert that the name, all four words in order, and the site address are legible, that print excludes the surrounding game, and that Home cannot be activated behind the card. Record the owner’s backend-first preview sign-up and subsequent production laptop-to-phone sign-in separately.

**Verification.** Syntax passed for all 31 game scripts and the vendored SDK. All **133 tests** in the eight directly affected suites passed. My full-suite run produced **949 passes and 113 failures** in the read-only sandbox, including `EPERM` creating temporary test directories. I could not independently confirm the reported 1,062-pass run. The working tree remained clean.

</details>

### My answers

1. **High, the card's upload bound to its account — agreed.** `onSignedIn(true, name)` and `cloudPush(name)` now
   run only while the card's account is the one signed in, and fetch a token only for it (`freshToken(onlyFor)`);
   a mismatch returns `false` without touching sync state. The card re-signs in with its own words when another
   tab has switched accounts. Tests: `cloud-sync` (another tab's sign-in, its failed load untouched, a switch
   while the token is fetched) and `garden-card`.
2. **High, a lost answer settled before another sign-up — agreed.** After any sign-up failure that is not a
   collision or the trigger's refusal, the card is *uncertain*; its next try signs in with the card first. Only
   a plain "incorrect username or password" settles that the card's account does not exist (the pool answers
   "no such user" the same way); a lockout, a throttle, an internal error or no network keeps the card and its
   Try again, with no second sign-up. A collision renames only after that settling.
3. **High, the card's "saved" — agreed.** `onSignedIn` returns the same test as Home's "saved to cloud": the
   push succeeded *and* no newer save was queued or begun. The two existing race tests now assert the card's
   answer too.
4. **Medium, the card's controls — agreed.** Pressing Go latches the tick for that card (a renamed card is a new
   one); the box is locked while it works and removed after; Try again follows the operation's state. Once the
   account exists, a failure shows Done with "Your account is made. Keep your card…".
5. **Medium, a modal card — agreed.** `role="dialog"`, `aria-modal`, labelled by the card's title; everything
   else on the page is made `inert` while it is up and given back on close; Tab cycles inside; focus moves in on
   open and back to Home on close; the notice is an alert, the message a polite live region. Not checked with a
   screen reader (the owner's list).
6. **Medium, the picture message — agreed.** It now says the browser *should have* saved it, and to open it and
   check the words before ticking; a failure inside the `toBlob` callback is caught.
7. **Medium, the deploy gap — agreed on the facts, disagreed on the remedy.** The facts are right: an old
   signed-in page pulling from the new `GET` would store a nameless copy and erase that device's name, and the
   old sign-up form accepts a typed name that happens to be a valid garden name. But only the owner's test
   accounts exist and a guest never pulls, so code to keep old clients from the new `GET` would serve three
   accounts for minutes. The runbook now says to close every signed-in tunegarden.game tab before the deploy
   and not to open the live site signed in until the merge's build is live, says what goes wrong otherwise, and
   qualifies the sign-up claim. The order stays the owner's: backend, preview, merge.
8. **Medium, the runbook — agreed.** The stop rule adds Remove/Add of the pool, client or tables; every other
   `Conditional` is read, not waved through; the table is described as past expectations; the stack status and
   the pool's and client's physical ids are checked after the deploy; the redundant `CloudSwitchFn` line is
   gone; the counter check names an identity that can read the table and a quiet moment.
9. **Medium, the privacy inventory — agreed.** `DESIGN.md` §11b adds the `sub` and what it links, what the
   sign-in library keeps on the device (the username and tokens; the refresh token lasts 365 days), what the
   trigger enforces and cannot (the name's form, not its origin; never the password); the "CDN" claim is
   corrected.
10. **Medium, the sign-in forms — agreed.** A shared `authBusy`: Home's Close and backdrop, the landing's Back and
    the form's Cancel do nothing while a sign-in is out; every way out empties and re-masks the passphrase;
    closing Home redraws the panel; busy state is restored in `finally`, and a failing session lookup returns
    the calm message.
11. **Low, the fifth collision — agreed.** A number is drawn only from the numbers this pair has not tried; the
    fifth (or a pair with none left) draws a different pair, never the crowded one.
12. **Tests, uncertain creation — added** (`garden-card`: a made account found by signing in; a request that
    never arrived; a real collision; a lockout, a throttle, an internal error and no network keep the card; a
    full day believed only after the words are refused).
13. **Tests, account-bound retry and truthful success — added** (`cloud-sync`).
14. **Tests, controls and dismissal — added** (`garden-card`: unticking mid-request; leaving after a failed
    sign-in; the modal's inert page; Cancel and Home's Close mid-sign-in; the passphrase box emptied and
    re-masked; a failing session lookup; the fifth collision drawing the old pair).
15. **Tests, the name through the real entry points — added, but not the old-client part.** Home's box, a reload
    from the same storage, a nameless pull and Home reopened agree (`cloud-sync`); `?reset` was already covered
    by TUN-84's tests. **Disagreed:** an old client against the new `GET` cannot be tested from this code — the
    old client is gone from it — so that risk is handled by the runbook (7).
16. **Owner checks, permissions and the authorizer — agreed**, added as step 3 of the TUN-93 deploy checks: an
    authenticated `GET /progress` from the CLI with the new client's token, `update-user-attributes` refused for
    `email`, `phone_number`, `name` and `preferred_username`, and an old account's fresh token read privately.
17. **Real-browser card acceptance — partly here, the rest the owner's.** AO's browser showed the card as a dialog
    with the page behind it inert, and Cancel giving it back. `file://`, a screen reader, print preview and the
    saved PNG on a phone are on the playtest list.

GPT's verification note (113 failures in its sandbox) was its read-only sandbox refusing to create temporary
directories; the suite here: 1069/1069.

## PR review, round 2 (`gpt-6.2-astra`, through `ask.sh`)

`ask.sh fresh read-only`, 2026-11-22, on head `c994b34` (the delta since `eaa7aa2`, with round 1 and my answers
by path). Usage: in 1,791,019 (cached 1,677,184), out 8,223. **Verdict: changes requested.** GPT judged round 1's
findings 3, 4, 6, 7 and 11 resolved — 7 being my disagreement on the remedy, which it accepted — and the rest
partly resolved.

<details><summary>GPT's PR review, verbatim</summary>

**Request changes on PR #166 at `c994b34b4f4b358eff3e4b54fce3df02387af4b8`.** Two High findings remain. A card can leave this tab authorized to overwrite another account’s unread garden, and an ambiguous sign-in failure can still cause the game to discard a valid card.

### Round‑1 disposition

1. **Partly — account-bound upload.** The initial username check catches an existing mismatch. The token’s `sub` goes unchecked, and subsequent debounced saves lose the account restriction.
2. **Partly — uncertain creation.** Retry now signs in first. `wordsDontOpenIt` still treats almost every `NotAuthorizedException` as a definitive credential mismatch.
3. **Resolved — truthful save result.** Home and the card now use the same successful-PUT and unchanged-save-sequence check.
4. **Resolved — acknowledgment and exit.** The tick survives a failed attempt, a replacement card requires a fresh tick, and failed sign-in after creation offers Done. Item 20 covers a separate defect on the *next* retry.
5. **Partly — modal accessibility.** The normal card has focus management, an inert background, and status announcements. The quota and trigger-refusal screen removes the dialog’s accessible name.
6. **Resolved — picture download.** The message asks the child to open and check the picture. The asynchronous callback handles failure.
7. **Resolved — deploy gap.** The runbook remedy holds for the owner’s three or four accounts. It closes signed-in production tabs before deployment, keeps them closed until the new build is live, and describes which old-form sign-ups still succeed.
8. **Partly — deployment checks.** The change-set stop rule, conditional-row inspection, and counter check are fixed. The post-deploy check covers only two protected resources and overstates what a completed rollback proves.
9. **Partly — privacy inventory.** The document now identifies `sub`, record linkage, local credentials, token lifetime, trigger limits, and the vendored SDK. Its new token description and its lost-card statement need correction.
10. **Partly — form lifecycle.** Landing Back, Home Close, backdrop, and form Cancel are guarded. Package, Studio, and quest navigation still bypass the Home guard. A failed session lookup can also be reported as a successful sign-in.
11. **Resolved — fifth collision.** The generator excludes the current pair and draws number-only retries from the remaining suffixes.
12. **Partly — uncertain-creation tests.** The named network, throttle, lockout, collision, and quota cases are covered. An ambiguous `NotAuthorizedException` with another message is missing.
13. **Partly — account and save-race tests.** The sequence-result assertions are present. The purported cross-tab test calls `doSignOut()` in the tab under test, advancing `_cloudRun` and canceling work that a real remote account switch leaves pending.
14. **Partly — controls and dismissal tests.** The latch and fifth collision are covered. The landing test calls `clearPassBox` directly, and the failed-sign-in exit test finds Done without pressing it or checking local progress.
15. **Partly — profile-name tests.** Home, reload, and a nameless pull are covered together. The reset tests check the in-memory name separately. The old-client disagreement does **not** hold as a testability claim. The pre-PR client is available at merge base `3706e02a854fc4d812a3f7f8340cde228475d58e`.
16. **Partly — AWS acceptance.** The runbook adds permission and API checks. It makes legacy-token inspection optional and sends the new account’s token through the authorizer. The requested legacy-account evidence remains outstanding.
17. **Partly — browser acceptance.** The record reports a browser dialog and an inert background. The `file://`, keyboard and screen-reader, print-preview, opened phone PNG, and deployed device-to-device checks remain outstanding.

### Required changes

18. **High — bind write permission to the authenticated subject for its entire lifetime.** After A’s card upload fails, this tab can remain `ready`. If another tab signs in as B, the next ordinary save calls `cloudPush()` without `onlyFor`. It can send A’s progress with B’s token before this tab has read B’s garden. The card-specific path also compares the cached username before `getSession` and never checks the returned ID token’s subject. Capture the card’s `userSub` or authenticated `sub`, bind the ready state and queued saves to it, and compare the actual PUT token’s `sub` before sending. Invalidate stale write permission on a session change. If the cached username survives an unusable session, let the card reauthenticate with its kept words. [js/cloud.js:49](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:49) · [js/cloud.js:69](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:69) · [js/garden-card.js:60](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:60) · [Cognito ID-token subject](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html)

19. **High — require positive evidence of a credential mismatch.** After a lost sign-up response, a delayed SRP challenge can return `NotAuthorizedException` even for the correct words. The predicate accepts any such exception whose message lacks “attempts exceeded,” including one with no message. It clears uncertainty and resubmits sign-up. A duplicate or quota response can then replace or withdraw the valid card. Recognize only the known credential-mismatch response as grounds to proceed. Preserve the original card and Retry on unknown or ambiguous denials. [js/garden-card.js:40](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:40) · [AWS `PASSWORD_VERIFIER` timeout behavior](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_RespondToAuthChallenge.html)

20. **Medium — guard Done during a retry.** After a failed sign-in, Done and Try again are both present. Pressing Try again disables Go and the detached Cancel button, leaving Done active. The child can close the card and begin another Home action while the old retry still signs in and uploads. The `_gardenCard` check runs after those effects. Disable Done while the retry is outstanding, or invalidate the operation before dismissal can take effect. [js/garden-card.js:117](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:117)

21. **Medium — route every Home exit through the sign-in guard.** With a sign-in pending, the child can open Studio, enter a package, or start a quest. Those handlers hide Home directly. A delayed pull can then replace progress during play. With an unsubmitted form, those same exits leave the passphrase in the hidden DOM. Apply the guard and form cleanup before each navigation action changes game state. [js/home.js:10](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/home.js:10) · [js/home.js:36](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/home.js:36) · [js/home.js:60](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/home.js:60)

22. **Medium — distinguish a missing session from a failed progress load.** If `cogSignIn` succeeds and the session disappears before lookup, `onSignedIn` returns `false`. `signInWith` discards that result and returns `{ok:true}`, so landing clears the words and dismisses the form while the player is a guest. Return an explicit authentication outcome and keep the form available when the session is missing or superseded. Preserve the signed-in, cloud-resting behavior when only the progress GET fails. [js/cloud.js:115](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:115) · [js/cloud.js:192](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:192)

23. **Medium — correct the promise made after account creation.** The new Done message promises that signing in later uploads this device’s garden. Ordinary sign-in pulls first. If another device has already saved progress, following those instructions replaces the original device’s garden. Tell the child the account exists, the local garden still needs uploading, and Try again on this device retries that upload. This requires a copy change and leaves the owner’s TUN‑122 decision intact. [js/garden-card.js:14](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:14) · [js/cloud.js:121](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:121)

24. **Low — retain a dialog name after refusal.** The closed/full branch removes `face`, which contains `#gctitle`. The still-open dialog’s `aria-labelledby` then points nowhere as focus moves to Close. Keep a heading outside the removable credential face or assign the refusal screen its own accessible name. [js/garden-card.js:126](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:126) · [index.html:1018](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/index.html:1018)

25. **Medium — verify the deployed resources and the legacy token.** The physical-ID query omits both player tables. The statement that `UPDATE_ROLLBACK_COMPLETE` means “nothing changed” also fails for a rollback completed with skipped resources. Compare all four protected physical IDs against their pre-deploy values, check stack events and effective settings after rollback, and stop on discrepancies. Make the fresh legacy-token check mandatory, inspect profile-claim omission privately, and use that same ID token for the authenticated progress GET. A successful GET for the newly created account leaves the legacy case unverified. [backend/README.md:370](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/backend/README.md:370) · [backend/README.md:414](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/backend/README.md:414) · [AWS rollback behavior](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-continueupdaterollback.html)

26. **Low — correct the shared-device privacy description.** A reader is told that all three tokens carry readable identity claims and later that losing the card loses the account. Identify the ID and access tokens as readable JWTs and the refresh token as opaque. State that losing the card prevents a new sign-in while an existing session can still provide access. [DESIGN.md:339](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/DESIGN.md:339) · [DESIGN.md:345](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/DESIGN.md:345) · [AWS token formats](https://docs.aws.amazon.com/en_en/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-with-identity-providers.html)

### Missing tests and acceptance evidence

27. **`tests/cloud-sync.test.mjs` — remote session switch.** Fail A’s card PUT, change only the shared cached user to B, and flush an ordinary save in A’s tab. Repeat with a session callback whose token subject differs from the selected user. Assert zero PUTs to B, no saved message, and no write permission for B before a successful load. Repeat with A’s cached username and no valid session. Assert that Retry can reauthenticate.
28. **`tests/garden-card.test.mjs` — ambiguous denial.** Lose the creation response, then return `NotAuthorizedException` with an unfamiliar message and with no message. Assert one sign-up, the same name and four words, and an enabled Retry. Let a later sign-in succeed and assert one upload.
29. **`tests/garden-card.test.mjs` — retry and exit.** Fail sign-in after confirmed creation, hold the retry pending, and attempt Done. Assert that the card stays open and no second Home action starts. Separately press Done while idle and verify that the account-made message was accurate and local progress survives.
30. **`tests/garden-card.test.mjs` — actual form exits.** Drive landing Show → Back → reopen through the wired buttons. Exercise Home Close, backdrop, package, Studio, and quest navigation with a visible passphrase, both idle and during a held sign-in. Assert field cleanup on exit, masking on reopen, and no late pull into a newly entered activity. Return a missing session through the SDK callback and assert that landing remains available for retry.
31. **`tests/cloud-sync.test.mjs` — reset and transition.** Repeat the Home-name, nameless-pull, and reopen assertions after accepting and declining `?reset`. Verify the field, title, and stored name together. For the one-time transition, use the pre-PR client and a disposable fixture with the new GET response. Record that the old pull erases the fixture’s name and that the closed-tab procedure preserves it. Production accounts are unnecessary for this check.
32. **`backend/README.md` — owner verification after deployment.** Record unchanged physical IDs, effective client settings, four denied attribute writes with valid values, omitted legacy profile claims, retained `sub`/`iss`/`aud`, and HTTP 200 with that fresh legacy ID token. Record outcomes only.
33. **`reviews/TUN-93-garden-name-accounts.md` — owner browser evidence.** Use a fictional longest-name, long-word card through `file://`. Verify keyboard focus containment and restoration, a named refusal dialog, card-only print preview, and legibility of all four words and the site address in the PNG opened on a phone. Record preview sign-up/sign-in before merge and production laptop-to-phone play after the build is live.

I verified the requested Git head and reviewed the delta statically. I made no edits and executed no PR code. The reported 1,069 passing tests are the author’s result.

</details>

### My answers

- **1, 18 (High), the write bound to one account for its whole life — agreed.** A sign-in's run now records the
  account it belongs to (`_syncUser`), and every push — the debounced saves included — fetches a token only for
  it; `freshToken` also checks the token's own `cognito:username` claim against it. Another tab signing someone
  else in leaves this tab unable to write until it signs in and loads that account's copy. After any failed
  upload the card signs in with its words again before retrying. I bound by the username, not the `sub`: both
  are permanent and unique in this pool, and the username is what the session store and the card hold.
- **2, 19 (High), positive evidence of a mismatch — agreed.** Only Cognito's own "Incorrect username or
  password." settles that the card's words don't open the account; any other `NotAuthorizedException` — no
  message, an unfamiliar one, a lockout — keeps the card, its words and Try again, with no second sign-up.
- **5, 24 (Low), the refusal screen's name — agreed.** It is labelled "Tune Garden: no new account" once the face
  (and its title) is gone; a new card is labelled by its title again.
- **8, 25 (Medium), the deploy checks — agreed.** All four protected resources' physical ids are noted before and
  compared after; a rollback is checked through the stack's events, the ids and the settings, never assumed to
  have changed nothing. The old account's fresh token is now a required check, and the authenticated
  `GET /progress` runs with each account's token, old and new; the attribute writes use valid values.
- **9, 26 (Low), the privacy wording — agreed.** The ID and access tokens are readable JWTs, the refresh token is
  opaque; a lost card means no new sign-in, while a device still signed in keeps access until it signs out or
  its session lapses.
- **10, 21 (Medium), every way out of Home — agreed.** `leaveHome()` serves Close, the backdrop, a quest card, the
  quest trail, `openPkg` and `openStudio`: nothing leaves Home while a sign-in is out, and leaving redraws the
  account panel, so a form's words never stay hidden in the page.
- **10, 22 (Medium), a session gone before it is used — agreed.** `onSignedIn` returns `false` only when there is
  no usable session; `signInWith` then reports a failure and the form keeps its words. A failed progress load is
  still a sign-in (the panel says the cloud is resting), as before.
- **20 (Medium), Done during a retry — agreed.** Done is disabled while the card works, and does nothing if pressed.
- **23 (Medium), the promise after the account is made — agreed.** It now says the garden isn't in the cloud yet,
  and that Try again *on this device* sends it up; nothing promises what a later sign-in elsewhere would do
  (TUN-122 is that question).
- **Tests 27–30 — added.** `cloud-sync`: another tab's sign-in with no sign-out here, the debounced save included;
  a token naming another account. `garden-card`: an unfamiliar or empty refusal after a lost answer; Done held
  during a retry and leaving with the garden untouched; the landing's wired Show and Back; leaving Home, a
  package and the Studio mid-sign-in; a session gone before it is used; the refusal screen's name.
- **15, 31, the reset and the old client — the reset cases added** (`?reset` accepted and declined, then a
  nameless pull and Home, the box, the title and the stored name together). **The old client: run once, not
  kept as a test.** GPT is right that the pre-PR client is reachable at the merge base, so my round-1 "cannot
  be tested" was wrong as stated. But a suite test that loads files from a past commit cannot run in CI, which
  checks out one commit, and the transition happens once. So I ran it once: the files of `3706e02` loaded in
  this branch's harness, signed in, answered by a nameless `GET`, store the copy with **no name** — the name is
  erased, in memory and in storage. That is the risk the runbook's closed-tabs step exists for; with every
  signed-in tab closed no old page pulls, so the name is kept.
- **16, 17, 32, 33 — the owner's.** The deploy checks above, and the playtest list (`file://`, keyboard and a
  screen reader, print preview, the PNG opened on a phone, the preview before merge and laptop to phone after).

Suite: 1078/1078.

## PR review, round 3 (`gpt-6.2-astra`, through `ask.sh`) — the last round of the budget

`ask.sh fresh read-only`, 2026-11-22, on head `e1efafc` (the delta since `c994b34`, with rounds 1–2 and my answers
by path). Usage: in 1,828,410 (cached 1,689,344), out 7,339. **Verdict: changes requested** — two High. GPT judged
round 2's findings 2, 5, 8, 12, 15, 19, 20, 23, 24, 28, 29 and 31 resolved; it accepted the one-off run of the
pre-PR client (15/31) as enough; the rest partly, and 32–33 the owner's.

<details><summary>GPT's PR review, verbatim</summary>

**Request changes on PR #166 at `e1efafc628af50762d0eff013d21b635181ef4b7`.** Two High findings remain. A sync run can read one account’s garden and become ready to write it to another. A stale tab can also write to a replacement account that has the same garden name. Both failures cross the boundary the backend enforces with Cognito’s `sub`.

### Round‑2 disposition

| Item | Disposition | Reason |
|---:|---|---|
| 1 | Partly | Ordinary saves now reject a different username. The read and write still lack a shared, authenticated subject. |
| 2 | Resolved | An unfamiliar or empty denial preserves the original card and does not trigger a second sign-up. |
| 5 | Resolved | The refusal dialog has an accessible name after its heading is removed. A new card restores the heading reference. |
| 8 | Resolved | The runbook compares all four physical IDs and requires event and settings inspection after rollback. |
| 9 | Partly | The token formats and surviving session are described correctly. The new lost-card statement overlooks the approved password-manager path. |
| 10 | Partly | Every listed Home exit checks `authBusy`. Overlapping sign-ins can release it early, and Home can discard a failed form. |
| 12 | Resolved | The tests cover unfamiliar, absent, and empty denial messages followed by successful recovery with the same card. |
| 13 | Partly | The new test changes shared identity without a local sign-out. It misses a switch during the pull and different subjects sharing a username. |
| 14 | Partly | Done is pressed and local progress is checked. Several dismissal tests still bypass the wired controls. |
| 15 | Resolved | Both reset decisions are covered. The recorded merge-base run is sufficient for this one-time transition. |
| 16 | Partly | The legacy-token check is mandatory. Effective AWS permissions and authorizer acceptance still need owner evidence. |
| 17 | Partly | The earlier browser run verified the dialog and inert background. The remaining browser and device checks belong to the owner. |
| 18 | Partly | A routine username switch blocks the PUT. Subject binding, read binding, and revocation of stale write permission remain incomplete. |
| 19 | Resolved | Only the recognized credential-mismatch response advances the uncertain creation attempt. Item 39 concerns what the child is told. |
| 20 | Resolved | Done is disabled during retry, and its handler independently checks `busy`. |
| 21 | Partly | Close, backdrop, package, Studio, quest card, and quest trail use the guard. Its shared boolean can become false during a second sign-in. |
| 22 | Partly | Landing handles a missing initial session. A superseded pull can still report success, and a failed seed upload can report authentication failure. |
| 23 | Resolved | The copy identifies the outstanding upload and directs the child to Retry on the original device. |
| 24 | Resolved | The refusal dialog retains a name, and reopening restores `aria-labelledby`. |
| 25 | Partly | The resource, rollback, and two-token GET checks are present. The legacy-claim acceptance criterion also rejects a permitted attribute. |
| 26 | Partly | JWT and refresh-token wording is correct. Losing the physical card still permits a fresh sign-in with credentials remembered by the browser. |
| 27 | Partly | The added tests cover a changed cached username and a mismatch at the first token lookup. They miss the actual GET/PUT boundaries and an unusable cached session through card Retry. |
| 28 | Resolved | The tests assert one sign-up, unchanged credentials, enabled Retry, and one eventual upload. |
| 29 | Resolved | The test invokes Done during a held retry and separately closes an idle failed card with local progress intact. |
| 30 | Partly | Wired landing Show and Back are covered. Reopen, backdrop, and both quest actions are missing. The Home test substitutes a successful sync stub. |
| 31 | Resolved | The one-off run used the identified pre-PR client and observed name loss in memory and storage. Closing signed-in tabs removes the old pull during the deploy window. A permanent historical-client fixture adds no acceptance evidence here. |
| 32 | Not resolved | Deployment outcomes have not been recorded. Owner check only. |
| 33 | Partly | Basic modal evidence exists. The longest-card, accessibility, print, phone, preview, and production evidence is outstanding. Owner check only. |

### Required changes

34. **High — Bind the progress GET to the account that authorized the run.** `signInWith` discards Cognito’s authenticated session. `onSignedIn` selects an account from shared storage, checks one token, then `cloudPull()` obtains a second token without an account constraint. A switch during token refresh can load B’s progress into A’s run. The tab persists B’s garden locally and can later write it to A when A is current again. Carry the authenticated subject from sign-in, use its token for the GET, and discard a superseded response before changing local storage or granting write permission. A card upload must retain the card’s identity throughout the same path. [js/cloud.js:64](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:64) · [js/cloud.js:122](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:122) · [js/cloud.js:202](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:202)

35. **High — Bind write permission to `sub` and revoke it on an observed identity change.** Cognito permits a deleted username to be reused. If a shared browser signs into the replacement account, an old ready tab accepts its token because the username matches. The backend then writes the old garden into the replacement account’s `sub` row. A detected username mismatch also leaves `cloudSync` ready, allowing writes to resume when the old name reappears. Capture the sign-up `userSub` or authenticated `sub`, require that subject on the actual PUT token, and revoke readiness on identity loss or mismatch. A subsequent ordinary sign-in must read its cloud copy before saving. [js/cloud.js:55](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:55) · [js/cloud.js:73](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:73) · [backend/src/progress-api.mjs:34](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/backend/src/progress-api.mjs:34) · [AWS username reuse rules](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html)

36. **Medium — Return authentication and save outcomes separately.** A superseded GET returns `undefined`, which `signInWith` accepts as success. Conversely, a valid sign-in followed by `GET null` and a failed seed PUT returns `false`. Landing then displays a sign-in error and retains the words even though the account is signed in. Return explicit session and sync outcomes. Dismiss the form on a valid sign-in and report the failed save through cloud status. Preserve the form when authentication was lost or superseded. This leaves TUN‑122’s empty-copy policy intact. [js/cloud.js:128](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:128) · [js/cloud.js:139](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:139) · [js/cloud.js:205](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:205)

37. **Medium — Keep Home’s retry form attached on session failure.** When the initial session lookup fails, `onSignedIn` calls `renderAuth()`, which removes the form. Its submit handler then writes the error into a detached `msg`. The child sees the guest panel and must re-enter both credentials. Let the submitting form retain its fields and display the failure until retry or explicit dismissal. [js/cloud.js:126](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:126) · [js/cloud.js:233](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:233)

38. **Medium — Give the pending sign-in ownership of the Home navigation guard.** During a slow GET, Home already shows Sign out. Signing out and starting another sign-in leaves two pending operations. When the first finishes, its `finally` clears `authBusy` while the second is still running. Home can then open an activity before the second pull applies. Serialize submissions or give each operation an identity so an older completion cannot unlock navigation for a newer one. [js/cloud.js:127](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:127) · [js/cloud.js:152](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:152) · [js/cloud.js:208](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:208)

39. **Low — Give an ambiguous card check an accurate message.** The card now correctly survives an unfamiliar `NotAuthorizedException`, but `friendlyAuthError` tells the child that the generated name and words “don't match.” The child cannot correct either field and can discard a valid card on that advice. For this uncertain-creation branch, say the game could not check the account and ask the child to keep the same card and retry. [js/garden-card.js:51](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/garden-card.js:51) · [js/cloud.js:189](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/js/cloud.js:189)

40. **Low — Qualify the lost-card statement.** A child who loses the printout can still sign in afresh with a browser-saved password or another copy of the words. Replace “no new sign-in … anywhere, ever” with the actual limit: once all copies of the credentials are gone, the game offers no self-service recovery. Keep the existing-session explanation. [DESIGN.md:345](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/DESIGN.md:345)

41. **Low — Specify which legacy profile claims must be absent.** The runbook permits `updated_at` as the sole readable attribute, then requires “no other profile claim.” A legacy account with a populated `updated_at` can fail that instruction under the intended configuration. Require omission of personal attributes, explicitly permit `updated_at`, and retain the required identity and authorizer checks. [backend/README.md:398](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/backend/README.md:398) · [backend/README.md:415](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/backend/README.md:415) · [AWS readable attribute permissions](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html)

### Missing tests

42. **`tests/cloud-sync.test.mjs` — identity changes during the read.** Authenticate A, hold session resolution, and change only the shared user to B. Give the two accounts distinct progress. Also switch while A’s GET response is pending. Assert that B’s copy never lands in A’s run, a stale response cannot change local storage, and no unread account becomes writable. [tests/cloud-sync.test.mjs:743](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/tests/cloud-sync.test.mjs:743)

43. **`tests/cloud-sync.test.mjs` — identity changes at the PUT.** Fail A’s first card PUT and queue an ordinary save. Supply a replacement token with the same username and a different `sub` only at the PUT lookup. Assert zero replacement-account PUTs, no saved message, and revoked readiness. Also observe a switch away and back and assert that ordinary writes require a fresh load. The current mismatch fixture fails at the first lookup and never exercises a ready writer. [tests/cloud-sync.test.mjs:761](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/tests/cloud-sync.test.mjs:761)

44. **`tests/garden-card.test.mjs` — recover a stale cached session through Retry.** Keep the card’s username cached, make its session unusable during upload, then press Retry with the real sync path. Assert one sign-up, reauthentication with the original words, and one successful PUT to the original subject. The existing card test replaces the upload path with a boolean stub. [tests/garden-card.test.mjs:54](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/tests/garden-card.test.mjs:54)

45. **`tests/garden-card.test.mjs` — distinguish the three form outcomes.** Through Home, fail session lookup and assert that the visible form retains its words, error, and enabled retry. Through landing, return `GET null` then PUT 503 and assert that sign-in completes with a save failure. Supersede a held GET and assert that the stale submission cannot dismiss the active form. [tests/garden-card.test.mjs:487](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/tests/garden-card.test.mjs:487)

46. **`tests/garden-card.test.mjs` — operate the actual navigation controls.** Reopen landing after Show and Back. Exercise Home Close, backdrop, package, Studio, quest card, and enabled quest-trail action with visible words, both idle and during sign-in. Assert cleanup and masking on exit, unchanged activity while busy, and no late pull into play. Include a superseded first sign-in finishing while a second is held. Calling `leaveHome()` directly cannot catch a handler that bypasses it. [tests/garden-card.test.mjs:460](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/tests/garden-card.test.mjs:460)

47. **`tests/garden-card.test.mjs` — check the ambiguous-denial copy.** Extend the existing unfamiliar and empty denial cases to assert that the card asks the child to keep it and retry, without claiming the words are wrong. Keep the existing credential and eventual-upload assertions. [tests/garden-card.test.mjs:422](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-48/tests/garden-card.test.mjs:422)

### Owner checks

48. **Deployment.** Keep signed-in production tabs closed through the transition. Read the change set, compare all four physical IDs, verify effective pool and client settings, and record four denied attribute writes with valid values. Privately inspect the fresh legacy ID token and confirm HTTP 200 with that token and with the new account’s token. Record outcomes only.

49. **Browser and devices.** Use a fictional longest-name, long-word card through `file://`. Verify keyboard containment and restored focus, the refusal dialog’s announced name, card-only print preview, and legibility of all four words and the site address in the PNG opened on a phone. Verify preview sign-up and sign-in after backend deployment and before merge. Verify production laptop-to-phone play after the merged build is live.

50. **Review evidence.** I verified the requested Git head and reviewed the delta statically. I made no edits and executed no PR code. The 1,078 passing tests and the merge-base client run are the author’s recorded results.

</details>

### My answers — all agreed, fixed in the commit that records this round, **not yet reviewed**

- **34 (High), the read bound to the run's account — agreed.** A run's `GET` now fetches its token through
  `freshId(name, sub)`, the same check the writes use; an account switched while the session or the load was out
  is a mismatch: nothing is applied or stored, the run gives up its right to write (`loseSync`), and the result
  is "not signed in".
- **35 (High), the `sub` — agreed.** A run records the `sub` from its first token; every write checks both the
  name and the `sub` on the very token it sends. A different account under the same name (a deleted name reused)
  or another account in this one's place revokes readiness at once: no write until a sign-in reads the cloud
  copy again. The card also passes the `userSub` its sign-up returned.
- **36 (Medium), separate outcomes — agreed.** `onSignedIn` returns `{ signedIn, saved }`. A superseded or
  sessionless run is not a sign-in; a failed load or save is (the form goes, the panel says the cloud is resting).
- **37 (Medium), Home's form on a session failure — agreed.** A run with no session no longer redraws a sign-in
  form: the form keeps its words and shows the failure, with Sign in usable.
- **38 (Medium), overlapping sign-ins — agreed.** `authBusy` counts sign-ins that are out; an older one finishing
  can't unlock Home while a newer one is out.
- **39 (Low), the unsettled check's words — agreed.** "The garden couldn't check your account just now. Keep this
  same card, and press Try again." — never "they don't match".
- **40 (Low), the lost card — agreed.** No way back once every copy of the words is gone, a browser's remembered
  copy included; a signed-in device keeps access until it signs out or its session lapses.
- **41 (Low), the old token's claims — agreed.** No personal attribute; `updated_at` may be there.
- **Tests 42–47 — added.** `cloud-sync`: an account switched while the session or the `GET` is out; the same name
  with a different `sub` at the `PUT`, readiness revoked, and a fresh load needed after switching back; the card's
  `sub` check. `garden-card`: the unsettled check's words; the real sync path with an unusable session, the card
  signing in again and uploading once to its own account; Home's form keeping its words, and a landing sign-in
  whose seed save fails still closing the landing; Home's wired Close and backdrop waiting through two overlapping
  sign-ins; the landing reopened empty and masked. **Not added:** pressing the quest card and the quest-trail row
  themselves (they need a profile with a quest on offer); both call the same `leaveHome()` the tested exits use.
- **48–49 — the owner's** (the deploy checks and the playtest list).

Suite: 1084/1084. **Round 3 was the third review round:** by `work-ticket` § 8 the fixes are pushed without a
fourth review, and the owner decides (*Owner's decisions* 7).

## Merged `origin/main` after TUN-112 (PR #163), 2026-11-22

`origin/main` merged into the branch (a merge, not a rebase: the branch is shared and never force-pushed). One
conflict, in `onSignedIn`'s pull in `js/cloud.js`: kept TUN-112's narration handling around the load, with this
PR's `keepLocalName(cloud)` and its `{ signedIn, saved }` result. TUN-112's new `tests/narration.test.mjs` stubbed
the session the old way, so two stubs gained what this PR checks: the token's `cognito:username` and `sub`
claims, and `freshId` in place of `freshToken`. Its assertions are unchanged. Suite: 1105/1105. Not reviewed by
GPT: owner's question 1 (*Owner's decisions* 7) still decides whether a fourth round runs.
