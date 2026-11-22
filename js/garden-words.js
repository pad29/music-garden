// ---------- Garden names and passphrases (TUN-93) ----------
// An account is a generated garden name and four generated words: the child types nothing when making one,
// and nothing personal is ever asked for (DESIGN.md §11b). Every word here was hand-picked and the owner
// approved the lists (reviews/TUN-93-garden-name-accounts.md, *The lists, revised*). A garden name is public —
// a friend who opens a shared song sees it — so tests/garden-words.test.mjs checks every one of the 323,189
// names, and every pair of passphrase words, against a blocklist. Change a list only with that test, the
// backend's copy of the name lists (backend/src/garden-words.mjs, which must stay identical) and the owner.
//
// The account's username is lower case with hyphens ("brave-otter-42"): the pool is case-insensitive, and
// Cognito hands triggers the lower-case form. The card and Home show it in title case ("Brave-Otter-42").
// The passphrase goes to Cognito as lower-case words joined by hyphens ("acorn-map-tulip-wren"); the card
// shows the words with spaces. Nothing here touches storage: the passphrase lives only on the card.
const GARDEN_ADJECTIVES=Object.freeze([
  "amber", "bold", "bouncy", "brave", "breezy", "bright", "bubbly", "busy", "calm", "cheery", "clever", "cosmic",
  "cozy", "curious", "dancing", "daring", "dashing", "dreamy", "eager", "fancy", "fluffy", "friendly", "frosty",
  "gentle", "giggly", "glad", "golden", "graceful", "happy", "hopeful", "humming", "jolly", "joyful", "kind",
  "lively", "lucky", "mellow", "merry", "mighty", "misty", "moonlit", "nimble", "peaceful", "playful", "plucky",
  "quick", "quiet", "rosy", "shiny", "silver", "sleepy", "snowy", "snug", "sparkly", "starry", "steady", "sunlit",
  "sunny", "swift", "velvet", "wandering", "whistling", "wise", "zippy"]);
const GARDEN_NOUNS=Object.freeze([
  "acorn", "alpaca", "badger", "bear", "blossom", "bluebird", "butterfly", "chipmunk", "clover", "daisy", "dolphin",
  "dragonfly", "duckling", "fawn", "fern", "finch", "firefly", "flamingo", "fox", "gecko", "giraffe", "hamster",
  "hedgehog", "heron", "honeybee", "kitten", "koala", "ladybug", "lamb", "lark", "lemur", "lion", "llama", "maple",
  "marmot", "meerkat", "otter", "owl", "panda", "parrot", "pelican", "penguin", "platypus", "pony", "poppy", "puffin",
  "puppy", "rabbit", "robin", "seahorse", "seal", "sparrow", "squirrel", "starfish", "starling", "sunflower", "swan",
  "tiger", "toucan", "tulip", "turtle", "willow", "wombat", "wren"]);
// 10–99 without numbers with crude or hateful uses: 79 numbers.
const GARDEN_SKIPPED_NUMBERS=Object.freeze([12, 13, 14, 18, 28, 33, 38, 43, 69, 83, 88]);
const GARDEN_NUMBERS=Object.freeze(Array.from({ length:90 }, (_, i)=>i+10).filter(n=>!GARDEN_SKIPPED_NUMBERS.includes(n)));
// Pairs that are something else already: slang, hacking groups' names, a cruel tradition, a mascot.
const GARDEN_BANNED_PAIRS=Object.freeze(["silver-fox", "fancy-bear", "cozy-bear", "dancing-bear", "sleepy-bear"]);
// 256 words: four drawn independently and uniformly give 32 bits (the review record says what that holds against).
const PASSPHRASE_WORDS=Object.freeze([
  "acorn", "anchor", "apple", "apron", "attic", "badger", "bakery", "balloon", "bamboo", "banjo", "barn", "basin",
  "basket", "beacon", "beehive", "beetle", "bench", "bicycle", "biscuit", "blanket", "blossom", "boat", "bonfire",
  "bottle", "bracelet", "branch", "breeze", "brick", "bridge", "brook", "broom", "bubble", "bucket", "cabbage",
  "cabin", "cactus", "camel", "camera", "candle", "canoe", "canyon", "castle", "chalk", "cherry", "chimney", "circus",
  "clock", "cloud", "clover", "coat", "comet", "cookie", "corn", "cotton", "crayon", "crown", "crumb", "cupcake",
  "curtain", "daisy", "desert", "dinosaur", "dolphin", "dragon", "drum", "dune", "eagle", "echo", "emerald", "engine",
  "falcon", "feather", "fence", "fern", "field", "fig", "firefly", "flag", "flute", "forest", "fossil", "fountain",
  "frog", "garden", "gecko", "gem", "giraffe", "glove", "goat", "goldfish", "guitar", "hammer", "hamster", "harp",
  "hedgehog", "helmet", "hill", "honey", "hoop", "iceberg", "igloo", "island", "ivy", "jacket", "jelly", "jigsaw",
  "jungle", "kangaroo", "kayak", "kettle", "kitchen", "kite", "kitten", "kiwi", "ladder", "lagoon", "lamb", "lantern",
  "lemon", "lily", "lizard", "llama", "lobster", "lollipop", "magnet", "mango", "map", "maple", "marble", "meadow",
  "mitten", "moon", "moss", "muffin", "nest", "noodle", "notebook", "oak", "oatmeal", "ocean", "octopus", "olive",
  "orange", "ostrich", "otter", "owl", "oyster", "paddle", "pancake", "panda", "paper", "parrot", "pasta", "peach",
  "peanut", "pebble", "pencil", "penguin", "pepper", "petal", "piano", "pickle", "pillow", "pinecone", "pinwheel",
  "planet", "pond", "pony", "popcorn", "potato", "pretzel", "puddle", "puffin", "pumpkin", "puppet", "puppy",
  "puzzle", "quilt", "rabbit", "radish", "raft", "rainbow", "reindeer", "ribbon", "river", "robin", "robot", "rocket",
  "rooster", "ruler", "saddle", "sailboat", "salad", "sandal", "sandbox", "scarf", "scooter", "seed", "seesaw",
  "shovel", "skate", "sled", "slipper", "snowman", "sock", "sparrow", "sprout", "squash", "squirrel", "star", "stone",
  "stream", "sugar", "summer", "sunset", "swing", "tadpole", "teacup", "teapot", "tent", "thistle", "thunder",
  "tiger", "toast", "toffee", "tomato", "tortoise", "tractor", "train", "trumpet", "tuba", "tulip", "tunnel",
  "turnip", "turtle", "twig", "umbrella", "unicorn", "valley", "vanilla", "velvet", "violin", "volcano", "waffle",
  "wagon", "walnut", "whistle", "willow", "window", "winter", "wizard", "wool", "wren", "yarn", "zebra", "zipper"]);

// pick(n): a whole number in [0, n), uniform. gardenPicker turns a source of 32-bit values into one, rejecting
// the values that would make some answers likelier than others (no modulo bias). Tests inject their own source.
function gardenPicker(next32){ return n=>{ const lim=0x100000000-(0x100000000%n);
  for(;;){ const v=next32(); if(v<lim) return v%n; } }; }
const gardenPick=gardenPicker(()=>{ const b=new Uint32Array(1); crypto.getRandomValues(b); return b[0]; });

const gardenPairBanned=(adj,noun)=> GARDEN_BANNED_PAIRS.includes(adj+"-"+noun);
function rollGardenWords(pick=gardenPick){
  for(;;){ const adj=GARDEN_ADJECTIVES[pick(GARDEN_ADJECTIVES.length)], noun=GARDEN_NOUNS[pick(GARDEN_NOUNS.length)];
    if(!gardenPairBanned(adj,noun)) return [adj,noun]; } }
const rollGardenNumber=(pick=gardenPick)=> GARDEN_NUMBERS[pick(GARDEN_NUMBERS.length)];
function rollGardenName(pick=gardenPick){ const [adj,noun]=rollGardenWords(pick); return adj+"-"+noun+"-"+rollGardenNumber(pick); }
const rollPassphrase=(pick=gardenPick)=> [0,1,2,3].map(()=>PASSPHRASE_WORDS[pick(PASSPHRASE_WORDS.length)]);

// Whether the generator could have made this username: the rule a new account must meet (the backend's
// PreSignUp trigger checks the same, with its own copy of these lists).
const GARDEN_NAME_SHAPE=/^([a-z]+)-([a-z]+)-(\d\d)$/;
function isGardenName(id){ const m=GARDEN_NAME_SHAPE.exec(String(id));
  return !!m && GARDEN_ADJECTIVES.includes(m[1]) && GARDEN_NOUNS.includes(m[2]) && GARDEN_NUMBERS.includes(+m[3]) && !gardenPairBanned(m[1],m[2]); }
// "brave-otter-42" → "Brave-Otter-42". Anything not shaped like a garden name (an old test account) is shown as it is.
const gardenDisplayName=id=> GARDEN_NAME_SHAPE.test(String(id)) ? String(id).replace(/(^|-)([a-z])/g,(m,s,c)=>s+c.toUpperCase()) : String(id);

// Sign-in forgives capitals, extra spaces, and spaces, hyphens or underscores between words, in both boxes. It goes
// by the SHAPE of the name, never by today's lists, so a card stays good if a word is ever retired. A name that
// is not shaped like word-word-NN (the owner's old test accounts, until TUN-101) goes to Cognito exactly as typed.
const gardenSqueeze=s=> String(s==null?"":s).toLowerCase().replace(/[\s_‐-―-]+/g,"-").replace(/^-+|-+$/g,"");
function signInPair(nameText, passText){ const name=gardenSqueeze(nameText);
  if(GARDEN_NAME_SHAPE.test(name)) return { username:name, password:gardenSqueeze(passText) };
  return { username:String(nameText==null?"":nameText).trim(), password:String(passText==null?"":passText) }; }
