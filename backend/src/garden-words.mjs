// The garden-name lists (TUN-93), as the PreSignUp trigger checks them: a new account's username must be a name
// the game's generator could have made. This is a copy of js/garden-words.js's name lists (the game's scripts
// are classic browser scripts, not modules); tests/garden-words.test.mjs fails if the two differ. The passphrase
// list is the game's alone — the server never sees the words, only Cognito's password check does.
export const ADJECTIVES = Object.freeze([
  "amber", "bold", "bouncy", "brave", "breezy", "bright", "bubbly", "busy", "calm", "cheery", "clever", "cosmic",
  "cozy", "curious", "dancing", "daring", "dashing", "dreamy", "eager", "fancy", "fluffy", "friendly", "frosty",
  "gentle", "giggly", "glad", "golden", "graceful", "happy", "hopeful", "humming", "jolly", "joyful", "kind",
  "lively", "lucky", "mellow", "merry", "mighty", "misty", "moonlit", "nimble", "peaceful", "playful", "plucky",
  "quick", "quiet", "rosy", "shiny", "silver", "sleepy", "snowy", "snug", "sparkly", "starry", "steady", "sunlit",
  "sunny", "swift", "velvet", "wandering", "whistling", "wise", "zippy"]);
export const NOUNS = Object.freeze([
  "acorn", "alpaca", "badger", "bear", "blossom", "bluebird", "butterfly", "chipmunk", "clover", "daisy", "dolphin",
  "dragonfly", "duckling", "fawn", "fern", "finch", "firefly", "flamingo", "fox", "gecko", "giraffe", "hamster",
  "hedgehog", "heron", "honeybee", "kitten", "koala", "ladybug", "lamb", "lark", "lemur", "lion", "llama", "maple",
  "marmot", "meerkat", "otter", "owl", "panda", "parrot", "pelican", "penguin", "platypus", "pony", "poppy", "puffin",
  "puppy", "rabbit", "robin", "seahorse", "seal", "sparrow", "squirrel", "starfish", "starling", "sunflower", "swan",
  "tiger", "toucan", "tulip", "turtle", "willow", "wombat", "wren"]);
export const SKIPPED_NUMBERS = Object.freeze([12, 13, 14, 18, 28, 33, 38, 43, 69, 83, 88]);
export const NUMBERS = Object.freeze(Array.from({ length: 90 }, (_, i) => i + 10).filter(n => !SKIPPED_NUMBERS.includes(n)));
export const BANNED_PAIRS = Object.freeze(["silver-fox", "fancy-bear", "cozy-bear", "dancing-bear", "sleepy-bear"]);

const SHAPE = /^([a-z]+)-([a-z]+)-(\d\d)$/;
// The exact, lower-case form only: the trigger lower-cases the username before it asks.
export function isGardenName(id) {
  const m = SHAPE.exec(typeof id === "string" ? id : "");
  return !!m && ADJECTIVES.includes(m[1]) && NOUNS.includes(m[2]) && NUMBERS.includes(Number(m[3]))
    && !BANNED_PAIRS.includes(m[1] + "-" + m[2]);
}
