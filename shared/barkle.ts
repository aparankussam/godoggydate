// shared/barkle.ts
// BARKLE — Wordle for dog breeds. Pure, static, no AI, no backend, no I/O.
//
// This module is the single source of truth for the daily puzzle:
//  - A curated list of widely-recognizable breeds, each with SIX escalating
//    clue tiers (index 0 = vaguest/hardest → index 5 = near-giveaway).
//  - A deterministic daily-selection function keyed off the UTC calendar date,
//    so every player worldwide gets the SAME breed on the same day and it is
//    impossible to peek at tomorrow's answer by changing timezone.
//  - A guess evaluator that recognizes breed names (with common aliases /
//    spellings) and reports whether a guess is correct plus spoiler-free
//    "closeness" signals (same breed group / same size band) for hints and the
//    shareable emoji grid.
//
// HONESTY: every clue is qualitative, widely-established breed knowledge
// (origin, group, coat, classic role, temperament, silhouette). No invented
// statistics, no jokes about a dog's weight/body, health, or rescue history.
//
// SSR-safe: this file touches no browser or Node APIs. `getDailyBreed()`
// defaults to `new Date()` only when called; pass an explicit date for tests.

export type BreedGroup =
  | 'Sporting'
  | 'Hound'
  | 'Working'
  | 'Terrier'
  | 'Toy'
  | 'Herding'
  | 'Non-Sporting';

export type BreedSize = 'toy' | 'small' | 'medium' | 'large' | 'giant';

export interface Breed {
  /** Canonical display name shown on the reveal. */
  name: string;
  /** Alternate spellings / short names accepted as a correct or valid guess. */
  aliases?: string[];
  group: BreedGroup;
  size: BreedSize;
  /** A single representative emoji for the win/reveal screen (never shared). */
  emoji: string;
  /** Exactly CLUES_PER_BREED clues, hardest first, revealed one per wrong guess. */
  clues: [string, string, string, string, string, string];
}

export const MAX_TRIES = 6;
export const CLUES_PER_BREED = 6;

// ── The breed set ─────────────────────────────────────────────────────────────
// ~64 breeds spread across all seven groups and every size band. Clue tiers go
// hardest → easiest: a vibe, then coat/size, then origin, then a silhouette
// cue, then a famous role, then a near-giveaway.

export const BREEDS: Breed[] = [
  {
    name: 'Labrador Retriever',
    aliases: ['labrador', 'lab', 'labradore'],
    group: 'Sporting',
    size: 'large',
    emoji: '🦮',
    clues: [
      'A friendly, endlessly food-motivated family favourite.',
      'A large sporting dog with a short, dense, water-shedding coat.',
      'Bred in Newfoundland and refined in Britain to fetch nets and game.',
      'Comes in yellow, chocolate and black, with a thick "otter" tail.',
      'The most popular pet breed in much of the world, and a top guide dog.',
      'A "retriever" from Labrador — its short name is literally "Lab".',
    ],
  },
  {
    name: 'Golden Retriever',
    aliases: ['golden', 'goldie'],
    group: 'Sporting',
    size: 'large',
    emoji: '🐕',
    clues: [
      'Gentle, eager to please, and famously good with children.',
      'A large sporting dog wearing a long, feathered, water-repellent coat.',
      'Developed in the Scottish Highlands to retrieve waterfowl.',
      'Its whole coat is a shade of gold, from cream to rich amber.',
      'A staple of dog-show "best in show" and heart-warming movies alike.',
      'A "retriever" whose name is simply the colour of its coat.',
    ],
  },
  {
    name: 'German Shepherd',
    aliases: ['gsd', 'alsatian', 'german shepard', 'german shepherd dog'],
    group: 'Herding',
    size: 'large',
    emoji: '🐕‍🦺',
    clues: [
      'Confident, loyal and highly trainable — a classic working partner.',
      'A large herding dog with a tan-and-black saddle and erect ears.',
      'Standardised in Germany in the late 1800s from farm herding dogs.',
      'A sloping topline and bushy tail give it an unmistakable outline.',
      'The definitive police, military and search-and-rescue dog.',
      'A "shepherd" from Germany — once also called the Alsatian.',
    ],
  },
  {
    name: 'French Bulldog',
    aliases: ['frenchie', 'french bull dog'],
    group: 'Non-Sporting',
    size: 'small',
    emoji: '🐶',
    clues: [
      'A compact, comical city companion that snorts and snuffles.',
      'A small, muscular flat-faced dog with a smooth coat.',
      'Bred from toy bulldogs carried to France by lace workers.',
      'Its trademark is a pair of upright, rounded "bat ears".',
      'A runaway favourite of apartment-dwellers and celebrities.',
      'A bat-eared bulldog named for France — the "Frenchie".',
    ],
  },
  {
    name: 'Bulldog',
    aliases: ['english bulldog', 'british bulldog'],
    group: 'Non-Sporting',
    size: 'medium',
    emoji: '🐶',
    clues: [
      'Placid and dignified despite a famously grumpy face.',
      'A medium, low-slung, heavy dog with a wrinkled flat face.',
      'An old English breed, once mascot of British grit and pluck.',
      'A wide undershot jaw and rolling, wide-legged gait.',
      'The living emblem of universities, sports teams and the U.S. Marines.',
      'The classic wrinkled English breed simply called the "Bulldog".',
    ],
  },
  {
    name: 'Poodle',
    aliases: ['standard poodle', 'toy poodle', 'miniature poodle'],
    group: 'Non-Sporting',
    size: 'medium',
    emoji: '🐩',
    clues: [
      'Elegant, exceptionally clever, and a frequent obedience champion.',
      'Sizes from toy to standard, all with a dense, curly, low-shedding coat.',
      'A water retriever refined in Germany and France for wildfowling.',
      'Show trims sculpt that curly coat into distinctive pom-poms.',
      'The proverbial "smart" breed and parent of every "-doodle" cross.',
      'The curly-coated breed clipped into pom-poms — the "Poodle".',
    ],
  },
  {
    name: 'Beagle',
    aliases: [],
    group: 'Hound',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A merry, nose-led pack hound that follows scents everywhere.',
      'A small, sturdy hound in tricolour or tan-and-white.',
      'An old English rabbit hound bred to hunt in packs.',
      'Long drop ears, a white tail tip, and a loud baying "voice".',
      'The model for Snoopy and a familiar airport sniffer dog.',
      'The small tricolour scent hound famous as Snoopy — the "Beagle".',
    ],
  },
  {
    name: 'Rottweiler',
    aliases: ['rottie', 'rott'],
    group: 'Working',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A calm, powerful guardian that is deeply devoted to its family.',
      'A large, muscular working dog in black with clear rust markings.',
      'Descended from Roman drover dogs kept in a German market town.',
      'A broad head and blocky, heavy-boned build.',
      'A trusted police, cart-pulling and cattle-droving worker.',
      'The black-and-rust German guardian nicknamed the "Rottie".',
    ],
  },
  {
    name: 'German Shorthaired Pointer',
    aliases: ['gsp', 'german pointer', 'shorthaired pointer'],
    group: 'Sporting',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A tireless, versatile gundog that lives to work in the field.',
      'A large sporting dog with a sleek liver-and-white ticked coat.',
      'Bred in Germany as an all-purpose hunter of fur and feather.',
      'It freezes in a classic "point" with one foreleg raised.',
      'A field-trial star prized for pointing and retrieving alike.',
      'The ticked German gundog that "points" — the GSP.',
    ],
  },
  {
    name: 'Dachshund',
    aliases: ['doxie', 'sausage dog', 'wiener dog', 'dackel', 'daschund'],
    group: 'Hound',
    size: 'small',
    emoji: '🌭',
    clues: [
      'A bold, stubborn little hound with an outsized personality.',
      'A small hound in smooth, wire or long coats and many colours.',
      'Bred in Germany to go to ground after badgers.',
      'A long body on very short legs — the original "hot dog" shape.',
      'The affectionate "wiener dog" of countless memes and cartoons.',
      'The German "badger dog" shaped like a sausage — the Dachshund.',
    ],
  },
  {
    name: 'Pembroke Welsh Corgi',
    aliases: ['corgi', 'pembroke corgi', 'welsh corgi'],
    group: 'Herding',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A big-dog attitude packed into a short, low frame.',
      'A small herding dog with a fox-like face and huge upright ears.',
      'A Welsh cattle drover that nips at heels to move stock.',
      'Short legs, a long back, and (in this variety) little to no tail.',
      'The lifelong favourite breed of Queen Elizabeth II.',
      'The Queen’s short-legged Welsh herder — the "Corgi".',
    ],
  },
  {
    name: 'Australian Shepherd',
    aliases: ['aussie', 'australian shepard'],
    group: 'Herding',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'A whip-smart, high-drive herder that needs a real job.',
      'A medium herding dog with a merle or tricolour coat.',
      'Despite the name, it was actually developed in the American West.',
      'Often born with a naturally short tail and striking blue eyes.',
      'The show-off breed of rodeos, frisbee and dog-sport arenas.',
      'The American ranch herder confusingly called the "Aussie".',
    ],
  },
  {
    name: 'Yorkshire Terrier',
    aliases: ['yorkie', 'yorkshire'],
    group: 'Toy',
    size: 'toy',
    emoji: '🐕',
    clues: [
      'A tiny, brave lapdog with a feisty terrier streak.',
      'A toy breed with a fine, silky blue-and-tan coat.',
      'Bred by Yorkshire mill workers to hunt rats in the 1800s.',
      'Its long, straight coat is often tied up with a top bow.',
      'A perennial favourite handbag-sized companion dog.',
      'The silky blue-and-tan toy from Yorkshire — the "Yorkie".',
    ],
  },
  {
    name: 'Boxer',
    aliases: [],
    group: 'Working',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A bouncy, playful clown that stays puppyish for years.',
      'A large working dog with a short fawn or brindle coat.',
      'Developed in Germany from old bull-baiting and mastiff stock.',
      'A short square muzzle, undershot jaw, and a habit of "boxing" with paws.',
      'Once a war messenger and guard dog, now a family favourite.',
      'The square-jawed German dog said to spar with its front paws — the "Boxer".',
    ],
  },
  {
    name: 'Great Dane',
    aliases: ['dane', 'deutsche dogge'],
    group: 'Working',
    size: 'giant',
    emoji: '🐕',
    clues: [
      'A gentle giant that thinks it is a lapdog.',
      'A giant, smooth-coated dog, one of the tallest of all breeds.',
      'Developed in Germany to hunt wild boar, despite the "Dane" name.',
      'A long neck and towering legs give a regal, statue-like stance.',
      'The breed behind cartoon icons like Scooby-Doo and Marmaduke.',
      'The towering German "Apollo of dogs" called the Great Dane.',
    ],
  },
  {
    name: 'Siberian Husky',
    aliases: ['husky', 'sibe'],
    group: 'Working',
    size: 'medium',
    emoji: '🐺',
    clues: [
      'An energetic, escape-artist sled dog that loves to "talk".',
      'A medium working dog with a thick double coat and wolfish look.',
      'Bred by the Chukchi people of Siberia to pull sleds over snow.',
      'Erect ears and often piercing blue (or two-coloured) eyes.',
      'The star of the 1925 Nome serum run and countless snow films.',
      'The blue-eyed Siberian sled dog — the "Husky".',
    ],
  },
  {
    name: 'Cavalier King Charles Spaniel',
    aliases: ['cavalier', 'king charles spaniel', 'cav'],
    group: 'Toy',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A sweet, cuddly lapdog bred purely for companionship.',
      'A small toy spaniel with a silky, feathered coat.',
      'Named for the English king who adored its spaniel ancestors.',
      'Big round eyes, long feathered ears, and a plumed tail.',
      'The classic royal-lap spaniel of old court paintings.',
      'The toy spaniel named for King Charles — the "Cavalier".',
    ],
  },
  {
    name: 'Doberman Pinscher',
    aliases: ['doberman', 'dobie', 'dobermann'],
    group: 'Working',
    size: 'large',
    emoji: '🐕',
    clues: [
      'An alert, intensely loyal protector and quick study.',
      'A large working dog with a sleek black-and-rust coat.',
      'Created by a German tax collector who wanted a guard on his rounds.',
      'A lean, athletic build with a long muzzle and elegant lines.',
      'A stereotype guard dog of films, patrols and estates.',
      'The sleek German guardian named for Herr Dobermann.',
    ],
  },
  {
    name: 'Shih Tzu',
    aliases: ['shitzu', 'shih-tzu', 'shitsu'],
    group: 'Toy',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A proud, affectionate little lapdog with a lion-hearted strut.',
      'A small toy breed under a long, flowing double coat.',
      'Cherished in the imperial courts of China for centuries.',
      'A short muzzle and hair that grows up from the nose ("chrysanthemum face").',
      'Its name means "little lion" in Chinese.',
      'The long-haired Chinese "lion dog" — the Shih Tzu.',
    ],
  },
  {
    name: 'Boston Terrier',
    aliases: ['boston', 'boston bull'],
    group: 'Non-Sporting',
    size: 'small',
    emoji: '🐶',
    clues: [
      'A lively, friendly little gentleman of a dog.',
      'A small, flat-faced dog with a tidy short coat.',
      'One of the first breeds actually developed in the United States.',
      'Its tuxedo-like black-and-white markings earned a nickname.',
      'Known as the "American Gentleman" for that dapper coat.',
      'The tuxedoed American breed named for a city — the "Boston".',
    ],
  },
  {
    name: 'Bernese Mountain Dog',
    aliases: ['bernese', 'berner', 'bernese mountain'],
    group: 'Working',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A big, mellow, affectionate farm companion.',
      'A large working dog with a long tricolour (black, white, rust) coat.',
      'A draft and drover dog from the Swiss canton of Bern.',
      'Distinctive white "blaze" and chest cross on a jet-black body.',
      'Once pulled dairy carts through Alpine villages.',
      'The tricolour Swiss mountain dog from Bern — the "Berner".',
    ],
  },
  {
    name: 'Pomeranian',
    aliases: ['pom', 'pom pom'],
    group: 'Toy',
    size: 'toy',
    emoji: '🐕',
    clues: [
      'A tiny, bold ball of fluff with a big opinion.',
      'A toy spitz with a puffball double coat and fox-like face.',
      'Bred down from larger sled and spitz dogs of the north.',
      'A plumed tail curling up over a round, poofy body.',
      'A favourite of Queen Victoria, who shrank the breed in fashion.',
      'The fluffy pint-sized spitz — the "Pom".',
    ],
  },
  {
    name: 'Havanese',
    aliases: ['havana silk dog'],
    group: 'Toy',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A cheerful, people-loving companion and natural charmer.',
      'A small toy breed with a long, silky, wavy coat.',
      'The national dog of Cuba, favoured by its old aristocracy.',
      'A springy gait and a coat in many colours.',
      'Named for the Cuban capital of Havana.',
      'The silky little companion dog of Cuba — the "Havanese".',
    ],
  },
  {
    name: 'Shetland Sheepdog',
    aliases: ['sheltie', 'shetland'],
    group: 'Herding',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A sensitive, quick-learning herder that adores its people.',
      'A small herding dog with a long mane-like coat.',
      'A miniature farm herder from Scotland’s Shetland Islands.',
      'Looks like a scaled-down rough collie with a pointed face.',
      'An agility and obedience-ring standout despite its size.',
      'The little Shetland Islands herder — the "Sheltie".',
    ],
  },
  {
    name: 'Brittany',
    aliases: ['brittany spaniel'],
    group: 'Sporting',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'A compact, energetic gundog that is happiest hunting.',
      'A medium sporting dog with an orange-and-white or liver coat.',
      'A pointing bird dog from the Brittany region of France.',
      'Leggy and light, often born with a very short tail.',
      'A field-trial favourite that both points and retrieves.',
      'The French pointing gundog named for a region — the "Brittany".',
    ],
  },
  {
    name: 'English Springer Spaniel',
    aliases: ['springer', 'springer spaniel', 'english springer'],
    group: 'Sporting',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'An eager, happy gundog with a wagging, busy tail.',
      'A medium spaniel with a feathered liver- or black-and-white coat.',
      'An English flushing spaniel that "springs" game into the air.',
      'Long, low-set ears and a docked or feathered tail.',
      'A dual worker in field and show ring across Britain.',
      'The English spaniel that "springs" birds — the Springer.',
    ],
  },
  {
    name: 'Pug',
    aliases: ['mops', 'carlin'],
    group: 'Toy',
    size: 'small',
    emoji: '🐶',
    clues: [
      'An affectionate, comical little charmer that loves a lap.',
      'A small, stocky toy dog with a smooth fawn or black coat.',
      'An ancient companion dog bred for Chinese emperors.',
      'A deeply wrinkled flat face and a tightly curled tail.',
      'A palace favourite that later became a European fashion pet.',
      'The wrinkle-faced, curly-tailed Chinese lapdog — the "Pug".',
    ],
  },
  {
    name: 'Mastiff',
    aliases: ['english mastiff', 'old english mastiff'],
    group: 'Working',
    size: 'giant',
    emoji: '🐕',
    clues: [
      'A calm, watchful colossus and a devoted family guardian.',
      'A giant working dog, one of the heaviest of all breeds.',
      'An ancient English guardian used to defend home and livestock.',
      'A massive head, dark mask and loose, jowly face.',
      'Its name is a byword for any huge, heavy-boned dog.',
      'The giant English guardian simply called the "Mastiff".',
    ],
  },
  {
    name: 'Chihuahua',
    aliases: ['chihuahua', 'chi', 'chiwawa'],
    group: 'Toy',
    size: 'toy',
    emoji: '🐕',
    clues: [
      'A tiny, sassy dog with a giant sense of self.',
      'The smallest recognised breed, in smooth or long coats.',
      'Traces to companion dogs of ancient Mexico.',
      'An apple-shaped head and big, upright ears on a wee frame.',
      'A famous purse dog and fast-food advert star.',
      'The world’s smallest breed, named for a Mexican state — the Chihuahua.',
    ],
  },
  {
    name: 'Border Collie',
    aliases: ['border', 'collie dog'],
    group: 'Herding',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'An intense, tireless worker widely called the smartest breed.',
      'A medium herding dog, most often black-and-white.',
      'Bred on the Anglo-Scottish borders to herd sheep.',
      'Controls a flock with a low, crouching "strong eye" stalk.',
      'The record-holder for herding trials and trick vocabularies.',
      'The sheep-herding genius of the English-Scottish border — the "Border Collie".',
    ],
  },
  {
    name: 'Basset Hound',
    aliases: ['basset'],
    group: 'Hound',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'A mellow, stubborn scent hound with a deep, mournful bay.',
      'A long, low, heavy-boned hound with a short coat.',
      'A French-bred trailing hound whose name means "low".',
      'Enormous drooping ears and loose, sad-eyed folds of skin.',
      'The droopy hound of cough-syrup and shoe adverts.',
      'The long-eared, short-legged trailing hound — the "Basset".',
    ],
  },
  {
    name: 'Belgian Malinois',
    aliases: ['malinois', 'belgian mal'],
    group: 'Herding',
    size: 'large',
    emoji: '🐕‍🦺',
    clues: [
      'An intense, driven worker with a bottomless appetite for tasks.',
      'A large herding dog with a short fawn coat and black mask.',
      'A Belgian sheepherding breed from the city of Malines.',
      'Leaner and lighter-footed than the German Shepherd it resembles.',
      'Today’s elite military and police K-9 of choice.',
      'The Belgian shepherd from Malines — the "Malinois".',
    ],
  },
  {
    name: 'Maltese',
    aliases: [],
    group: 'Toy',
    size: 'toy',
    emoji: '🐕',
    clues: [
      'A gentle, affectionate lapdog that has charmed people for millennia.',
      'A toy breed under a long, pure-white, silky coat.',
      'An ancient Mediterranean companion linked to the island of Malta.',
      'Its floor-length white hair is often parted down the spine.',
      'A perennial "prettiest coat" contender at dog shows.',
      'The pure-white silky lapdog named for Malta — the "Maltese".',
    ],
  },
  {
    name: 'Weimaraner',
    aliases: ['weim', 'grey ghost', 'weimeraner'],
    group: 'Sporting',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A fast, fearless, velcro-close hunting companion.',
      'A large sporting dog with a sleek, solid silver-grey coat.',
      'Bred by German nobles in Weimar to hunt big game, then birds.',
      'Amber or blue-grey eyes glow against that silvery coat.',
      'Made famous by William Wegman’s dressed-up dog photographs.',
      'The silvery "Grey Ghost" gundog of Weimar — the Weimaraner.',
    ],
  },
  {
    name: 'Collie',
    aliases: ['rough collie', 'lassie dog', 'scotch collie'],
    group: 'Herding',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A graceful, gentle herder devoted to its family.',
      'A large herding dog with a long mane and sable-and-white coat.',
      'A Scottish sheep and cattle herder of the Highlands.',
      'A long, tapering "wedge" face and abundant neck ruff.',
      'The breed of the fictional heroine Lassie.',
      'The long-nosed Scottish herder of "Lassie" fame — the "Collie".',
    ],
  },
  {
    name: 'Newfoundland',
    aliases: ['newfie', 'newf'],
    group: 'Working',
    size: 'giant',
    emoji: '🐕',
    clues: [
      'A sweet, patient giant nicknamed the "nanny dog".',
      'A giant working dog with a heavy, water-resistant coat.',
      'A Canadian fisherman’s dog from the island it is named for.',
      'Webbed feet and a massive frame make it a natural swimmer.',
      'Renowned for hauling nets and rescuing people from the water.',
      'The giant Canadian water-rescue dog — the "Newfie".',
    ],
  },
  {
    name: 'Rhodesian Ridgeback',
    aliases: ['ridgeback', 'african lion hound'],
    group: 'Hound',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A dignified, independent hound with a strong guarding streak.',
      'A large hound with a short, sleek wheaten coat.',
      'Developed in southern Africa from native and settler dogs.',
      'A ridge of hair grows backwards along its spine.',
      'Once used in packs to bay and hold lions at bay.',
      'The African hound with a reversed ridge down its back — the Ridgeback.',
    ],
  },
  {
    name: 'Shiba Inu',
    aliases: ['shiba', 'doge'],
    group: 'Non-Sporting',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A spirited, catlike, famously stubborn little dog.',
      'A small spitz with a plush double coat, often rich red.',
      'The smallest of Japan’s native hunting breeds.',
      'Pricked ears, a curled tail, and a fox-like "smiling" face.',
      'The face of the "Doge" internet meme and Dogecoin.',
      'The red Japanese spitz of the "Doge" meme — the "Shiba".',
    ],
  },
  {
    name: 'West Highland White Terrier',
    aliases: ['westie', 'west highland white', 'west highland terrier'],
    group: 'Terrier',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A confident, cheerful little terrier that misses nothing.',
      'A small terrier with a hard, pure-white double coat.',
      'A Scottish Highland ratting and fox terrier.',
      'A rounded white head with dark eyes and a carrot-shaped tail.',
      'A long-time dog-food and whisky advertising mascot.',
      'The white Scottish Highland terrier — the "Westie".',
    ],
  },
  {
    name: 'Bichon Frise',
    aliases: ['bichon'],
    group: 'Non-Sporting',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A merry, affectionate charmer that loves an audience.',
      'A small dog under a soft, curly, powder-puff white coat.',
      'A Mediterranean companion once favoured by French and Spanish courts.',
      'Groomed into a round, fluffy cloud with dark button eyes.',
      'A frequent circus and lapdog throughout European history.',
      'The white powder-puff lapdog — the "Bichon".',
    ],
  },
  {
    name: 'Bloodhound',
    aliases: ['sleuth hound', 'st hubert hound'],
    group: 'Hound',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A gentle, dogged trailer that lives by its nose.',
      'A large hound with a short coat and enormous loose skin.',
      'An ancient European scenting hound refined in Belgium and Britain.',
      'Long ears and deep facial wrinkles funnel scent to its nose.',
      'Its trail evidence is famous enough to be cited in court.',
      'The wrinkled, droopy-eared scent tracker — the "Bloodhound".',
    ],
  },
  {
    name: 'Akita',
    aliases: ['akita inu', 'japanese akita'],
    group: 'Working',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A dignified, aloof and intensely loyal guardian.',
      'A large spitz-type dog with a thick double coat and curled tail.',
      'A powerful hunting and guard breed from northern Japan.',
      'A broad, bear-like head with small triangular eyes and ears.',
      'Immortalised by Hachiko, who waited years for his late owner.',
      'The loyal Japanese spitz of the Hachiko story — the "Akita".',
    ],
  },
  {
    name: 'Saint Bernard',
    aliases: ['st bernard', 'saint bernard dog'],
    group: 'Working',
    size: 'giant',
    emoji: '🐕',
    clues: [
      'A patient, kindly giant and devoted family dog.',
      'A giant working dog with a red-and-white coat, rough or smooth.',
      'Bred at a hospice in the Swiss Alps to find lost travellers.',
      'A massive head with jowls and a gentle, drooping expression.',
      'The legendary Alpine rescuer, often pictured with a neck cask.',
      'The giant Alpine rescue dog of the hospice — the "St Bernard".',
    ],
  },
  {
    name: 'Bull Terrier',
    aliases: ['bully', 'english bull terrier'],
    group: 'Terrier',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'A playful, mischievous clown with a one-of-a-kind head.',
      'A muscular terrier with a short, dense coat.',
      'An English cross of bulldog and terrier lines.',
      'An unmistakable egg-shaped head and small triangular eyes.',
      'The long-time face of Target and a classic beer mascot.',
      'The egg-headed English terrier — the "Bull Terrier".',
    ],
  },
  {
    name: 'Whippet',
    aliases: [],
    group: 'Hound',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'A quiet, gentle couch-potato that turns into a rocket outdoors.',
      'A medium sighthound with a fine, smooth coat and slim build.',
      'Bred in northern England for racing and rabbit coursing.',
      'A deep chest, tucked waist and arched back built for speed.',
      'Once called the "poor man’s racehorse" of mill towns.',
      'The small, slender English racing sighthound — the "Whippet".',
    ],
  },
  {
    name: 'Chow Chow',
    aliases: ['chow'],
    group: 'Non-Sporting',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'A dignified, aloof and famously cat-like companion.',
      'A medium spitz with a thick, lion-like ruff of fur.',
      'An ancient Chinese breed used for guarding and hauling.',
      'A scowling face, stiff-legged gait and a rare blue-black tongue.',
      'One of very few breeds with a naturally dark purple tongue.',
      'The lion-maned Chinese breed with a blue-black tongue — the "Chow".',
    ],
  },
  {
    name: 'Alaskan Malamute',
    aliases: ['malamute', 'mally'],
    group: 'Working',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A powerful, affectionate freight dog with a wolfy look.',
      'A large working dog with a dense coat and plumed tail over the back.',
      'Bred by the Malemiut Inupiaq people of Alaska to haul heavy loads.',
      'Bigger and stockier than a husky, with brown (not blue) eyes.',
      'The classic heavy-freight sled dog of the far north.',
      'The big Alaskan freight sled dog — the "Malamute".',
    ],
  },
  {
    name: 'Papillon',
    aliases: ['pap', 'butterfly dog', 'continental toy spaniel'],
    group: 'Toy',
    size: 'toy',
    emoji: '🦋',
    clues: [
      'A dainty but surprisingly athletic and clever toy dog.',
      'A toy spaniel with a fine, flowing, mostly-white coat.',
      'A companion dog of European nobility for centuries.',
      'Large fringed ears spread like butterfly wings.',
      'Its French name literally means "butterfly".',
      'The butterfly-eared French toy spaniel — the "Papillon".',
    ],
  },
  {
    name: 'Australian Cattle Dog',
    aliases: ['blue heeler', 'red heeler', 'heeler', 'cattle dog', 'acd'],
    group: 'Herding',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'A tough, tireless worker with a strong loyalty to one person.',
      'A medium herding dog with a speckled blue or red coat.',
      'Bred in Australia to drove cattle across vast distances.',
      'A compact, muscular build with pricked ears and a bushy tail.',
      'Moves stock by nipping at their heels — hence its nickname.',
      'The speckled Australian drover known as the "Blue Heeler".',
    ],
  },
  {
    name: 'Cocker Spaniel',
    aliases: ['cocker', 'american cocker spaniel', 'english cocker spaniel'],
    group: 'Sporting',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A gentle, sweet-natured gundog and cheerful companion.',
      'A small sporting spaniel with a silky, feathered coat.',
      'A flushing bird dog named for the woodcock it hunted.',
      'Long, low, richly feathered ears frame a soft-eyed face.',
      'The star of Disney’s "Lady and the Tramp".',
      'The feather-eared woodcock spaniel — the "Cocker".',
    ],
  },
  {
    name: 'Dalmatian',
    aliases: ['dal', 'dalmation', 'plum pudding dog'],
    group: 'Non-Sporting',
    size: 'large',
    emoji: '🐕',
    clues: [
      'An energetic, outgoing dog that bonds hard to its people.',
      'A large, smooth-coated dog with a truly unique coat pattern.',
      'A historic coaching dog that trotted beside horse-drawn carriages.',
      'Born pure white, it develops black or liver spots as it grows.',
      'The traditional firehouse mascot and star of "101" fame.',
      'The spotted coaching dog of the fire station — the Dalmatian.',
    ],
  },
  {
    name: 'Great Pyrenees',
    aliases: ['pyrenean mountain dog', 'pyr', 'great pyr'],
    group: 'Working',
    size: 'giant',
    emoji: '🐕',
    clues: [
      'A calm, watchful guardian that patrols its flock by night.',
      'A giant working dog with a thick white weather-proof coat.',
      'Guards sheep in the Pyrenees mountains between France and Spain.',
      'A huge white body with double dewclaws on the hind legs.',
      'A centuries-old livestock protector against wolves and bears.',
      'The great white flock-guardian of the Pyrenees mountains.',
    ],
  },
  {
    name: 'Samoyed',
    aliases: ['sammy', 'smiley dog'],
    group: 'Working',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'A friendly, gentle sled dog that seems permanently cheerful.',
      'A medium spitz under a thick, pure-white, stand-off coat.',
      'Bred by the Samoyede people of Siberia to herd reindeer and pull sleds.',
      'Upturned mouth corners give it the trademark "Sammy smile".',
      'Its shed white fur is soft enough to be spun into yarn.',
      'The smiling white Siberian reindeer dog — the "Samoyed".',
    ],
  },
  {
    name: 'Cane Corso',
    aliases: ['corso', 'italian mastiff'],
    group: 'Working',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A serious, powerful protector deeply devoted to its family.',
      'A large working dog with a short black, grey or fawn coat.',
      'An Italian mastiff descended from Roman war and guard dogs.',
      'A broad, blocky head and a heavily muscled, athletic frame.',
      'Its name comes from Latin for a "guardian" or bodyguard dog.',
      'The Italian mastiff guardian — the "Cane Corso".',
    ],
  },
  {
    name: 'Vizsla',
    aliases: ['hungarian vizsla', 'magyar vizsla'],
    group: 'Sporting',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'An affectionate "velcro" gundog that hates being alone.',
      'A medium sporting dog with a short, sleek golden-rust coat.',
      'A Hungarian pointing and retrieving breed of the plains.',
      'A lean, elegant build; even its nose blends into that rust coat.',
      'A versatile pointer-retriever prized by falconers of old Hungary.',
      'The rust-coloured Hungarian pointing gundog — the "Vizsla".',
    ],
  },
  {
    name: 'Basenji',
    aliases: ['congo dog', 'barkless dog'],
    group: 'Hound',
    size: 'small',
    emoji: '🐕',
    clues: [
      'An independent, tidy, almost cat-like little hound.',
      'A small, smooth-coated hound with a tightly curled tail.',
      'An ancient hunting dog from Central Africa.',
      'A wrinkled forehead and upright ears give an alert, quizzical look.',
      'It does not bark — it yodels a sound called a "baroo".',
      'The barkless, yodeling African hound — the "Basenji".',
    ],
  },
  {
    name: 'Jack Russell Terrier',
    aliases: ['jack russell', 'jrt', 'russell terrier', 'parson russell terrier'],
    group: 'Terrier',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A bold, tireless little dynamo that never quits.',
      'A small terrier with a mostly-white smooth or broken coat.',
      'Bred by an English parson to bolt foxes from their dens.',
      'A compact, athletic body with tan or black head markings.',
      'The scene-stealing dog of "Frasier" and "The Mask".',
      'The white foxing terrier named for a parson — the "Jack Russell".',
    ],
  },
  {
    name: 'Old English Sheepdog',
    aliases: ['oes', 'bobtail', 'old english sheep dog'],
    group: 'Herding',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A good-natured, bumbling herder with a rolling, bear-like walk.',
      'A large herding dog buried under a shaggy grey-and-white coat.',
      'An English drover’s dog once used to move sheep and cattle to market.',
      'So much coat that its eyes disappear; often a docked "bobtail".',
      'The classic mop-like dog of paint adverts and family films.',
      'The shaggy grey English "bobtail" sheepdog.',
    ],
  },
  {
    name: 'Afghan Hound',
    aliases: ['afghan', 'tazi'],
    group: 'Hound',
    size: 'large',
    emoji: '🐕',
    clues: [
      'An aloof, elegant and rather aristocratic sighthound.',
      'A large sighthound draped in a long, flowing silky coat.',
      'An ancient coursing hound from the mountains of Afghanistan.',
      'A narrow face, topknot and hipbones set high beneath that glamorous coat.',
      'A runway-glamorous breed famous for its high-maintenance hair.',
      'The silky-coated coursing hound of Afghanistan — the "Afghan".',
    ],
  },
  {
    name: 'Greyhound',
    aliases: ['grey hound'],
    group: 'Hound',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A gentle, quiet "45-mph couch potato" that loves to lounge.',
      'A large sighthound with a fine, smooth coat and slim frame.',
      'An ancient coursing hound depicted since antiquity.',
      'A deep chest, tiny waist and long legs built purely for speed.',
      'The fastest dog breed and the star of the racing track.',
      'The fastest sighthound of the race track — the "Greyhound".',
    ],
  },
  {
    name: 'Irish Setter',
    aliases: ['red setter', 'irish red setter'],
    group: 'Sporting',
    size: 'large',
    emoji: '🐕',
    clues: [
      'An exuberant, outgoing gundog that stays playful for years.',
      'A large sporting dog with a long, silky mahogany-red coat.',
      'A bird-finding setter developed in Ireland.',
      'A long, lean build with rich chestnut-red feathering.',
      'Its glamorous red coat makes it a favourite of the show ring.',
      'The glossy chestnut-red Irish gundog — the Irish Setter.',
    ],
  },
  {
    name: 'Scottish Terrier',
    aliases: ['scottie', 'scotty', 'scottish', 'aberdeen terrier'],
    group: 'Terrier',
    size: 'small',
    emoji: '🐕',
    clues: [
      'A feisty, independent and famously dignified little terrier.',
      'A short-legged terrier with a hard, wiry coat, often jet black.',
      'A Scottish Highland den-hunting terrier.',
      'A long "beard", bushy eyebrows and a distinctive scimitar tail.',
      'A Monopoly game token and a two-time White House pet.',
      'The bearded black Scottish terrier — the "Scottie".',
    ],
  },
  {
    name: 'Airedale Terrier',
    aliases: ['airedale', 'king of terriers'],
    group: 'Terrier',
    size: 'large',
    emoji: '🐕',
    clues: [
      'A versatile, clever and slightly headstrong all-rounder.',
      'The largest terrier, with a dense, wiry tan-and-black coat.',
      'Bred in the Aire valley of Yorkshire to hunt otters and rats.',
      'A long, flat "beard-and-eyebrows" face and squared-off build.',
      'Nicknamed the "King of Terriers" and used as a WWI messenger dog.',
      'The largest terrier, from the Aire valley — the "Airedale".',
    ],
  },
  {
    name: 'Portuguese Water Dog',
    aliases: ['pwd', 'portie', 'cao de agua'],
    group: 'Working',
    size: 'medium',
    emoji: '🐕',
    clues: [
      'A bright, energetic worker that adores swimming.',
      'A medium working dog with a curly or wavy, low-shedding coat.',
      'Once helped Portuguese fishermen herd fish and retrieve gear.',
      'Webbed feet and a lion-clip trim leaving the hindquarters shaved.',
      'Chosen as the Obama family’s White House dogs.',
      'The curly Portuguese fishing dog of the Obamas — the "Portie".',
    ],
  },
];

// ── Daily selection ───────────────────────────────────────────────────────────
// The puzzle number is a running day count from a fixed launch anchor, computed
// in UTC so it flips at the same instant everywhere and cannot be predicted by
// changing timezone. A fixed, seeded shuffle of the breed list turns that number
// into an answer index that (a) is identical worldwide and (b) does not repeat a
// breed until the whole list has cycled.

const DAY_MS = 86_400_000;
// Barkle #1 = 2024-01-01 (UTC). Kept constant forever so numbers never shift.
const EPOCH_UTC = Date.UTC(2024, 0, 1);

/** UTC midnight (ms) for the calendar day that `date` falls on. */
function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** 1-based day number since the launch anchor; the same worldwide. */
export function puzzleNumberForDate(date: Date = new Date()): number {
  return Math.floor((utcDayStart(date) - EPOCH_UTC) / DAY_MS) + 1;
}

// Deterministic PRNG (mulberry32) for a stable, seeded shuffle.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A once-computed, fixed rotation order over the breed indices. The seed is a
// constant, so this array is byte-for-byte identical in every browser.
const DAILY_ORDER: number[] = (() => {
  const order = BREEDS.map((_, i) => i);
  const rng = mulberry32(0x8a17f2c9);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
})();

export interface DailyPuzzle {
  puzzleNumber: number;
  breed: Breed;
}

/** The breed everyone in the world is solving on the given day (default today). */
export function getDailyBreed(date: Date = new Date()): DailyPuzzle {
  const puzzleNumber = puzzleNumberForDate(date);
  // Guard against pre-epoch dates so the index is always in range.
  const slot = ((puzzleNumber - 1) % DAILY_ORDER.length + DAILY_ORDER.length) % DAILY_ORDER.length;
  return { puzzleNumber, breed: BREEDS[DAILY_ORDER[slot]] };
}

// ── Guess matching + evaluation ───────────────────────────────────────────────

/** Normalise a name for tolerant matching: lowercase, alphanumerics only. */
export function normalizeBreedName(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
}

// Build a normalized lookup of every canonical name + alias → its Breed once.
const LOOKUP: Map<string, Breed> = (() => {
  const map = new Map<string, Breed>();
  for (const breed of BREEDS) {
    map.set(normalizeBreedName(breed.name), breed);
    for (const alias of breed.aliases ?? []) {
      const key = normalizeBreedName(alias);
      if (!map.has(key)) map.set(key, breed);
    }
  }
  return map;
})();

/** Resolve a raw guess to a known breed, or null if it is not a recognised name. */
export function findBreed(input: string): Breed | null {
  return LOOKUP.get(normalizeBreedName(input)) ?? null;
}

/** All canonical names, sorted — handy for an autocomplete datalist. */
export const BREED_NAMES: string[] = BREEDS.map((b) => b.name).sort((a, b) =>
  a.localeCompare(b),
);

export interface GuessResult {
  /** The recognised breed the guess resolved to, or null if unrecognised. */
  matched: Breed | null;
  /** True only when the guess resolves to the exact answer breed. */
  correct: boolean;
  /** Spoiler-free warmth: same AKC-style group as the answer. */
  sameGroup: boolean;
  /** Spoiler-free warmth: same size band as the answer. */
  sameSize: boolean;
}

/**
 * Evaluate a raw guess against the answer. A guess that does not resolve to a
 * known breed returns `matched: null` — callers should reject it WITHOUT
 * consuming a try (mirroring Wordle rejecting non-words), so an unrecognised
 * spelling never burns a guess.
 */
export function evaluateGuess(guessRaw: string, answer: Breed): GuessResult {
  const matched = findBreed(guessRaw);
  if (!matched) {
    return { matched: null, correct: false, sameGroup: false, sameSize: false };
  }
  const correct = matched.name === answer.name;
  return {
    matched,
    correct,
    sameGroup: !correct && matched.group === answer.group,
    sameSize: !correct && matched.size === answer.size,
  };
}

// ── Spoiler-free share grid ───────────────────────────────────────────────────
// One emoji tile per guess played. The tiles reveal only how "warm" each guess
// was, never the answer, so a result can be posted publicly without spoiling
// the day for anyone.
//   🟩 correct  ·  🟨 same group  ·  🟧 same size only  ·  ⬛ cold

export function tileForGuess(result: GuessResult): string {
  if (result.correct) return '🟩';
  if (result.sameGroup) return '🟨';
  if (result.sameSize) return '🟧';
  return '⬛';
}

/**
 * Build the shareable, spoiler-free result block:
 *   Barkle #123 4/6
 *   ⬛🟧🟨🟩
 *   🐾 godoggydate.com/barkle
 * `results` is the ordered list of evaluated guesses (recognised ones only).
 * `solved` reflects whether the final guess was correct.
 */
export function buildShareText(
  puzzleNumber: number,
  results: GuessResult[],
  solved: boolean,
): string {
  const score = solved ? `${results.length}/${MAX_TRIES}` : `X/${MAX_TRIES}`;
  const grid = results.map(tileForGuess).join('');
  return `Barkle #${puzzleNumber} ${score}\n${grid}\n🐾 godoggydate.com/barkle`;
}
