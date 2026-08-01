// web/lib/meetupSafety.ts
// Single source of truth for the public first-meeting reference (/playdate-safety)
// and any in-app surface that needs the same content.
//
// PURE DATA — no React, no JSX, so it stays renderer-agnostic and can be pulled
// into an in-app surface later without dragging a marketing page's deps along.
//
// HONESTY RULES FOR EDITING THIS FILE:
//  1. Every claim here must be one a named professional source actually makes.
//     If you add an item, add its `sources`, open the URL, and confirm that page
//     says that thing. A citation that does not resolve, or that resolves to an
//     article about something else, is worse than no citation at all.
//     An empty `sources` array means "this is ours, nobody published it" — that
//     is allowed, but then the caveat has to say so out loud.
//  2. Where the guidance is a rule of thumb, a practical convention, or actively
//     disputed, say so via `evidence` + `caveat`. Do not launder it into fact.
//  3. Never imply GoDoggyDate verifies dogs, vets owners, or that following any
//     of this makes a meeting safe. This is a reference to other people's
//     guidance, not a guarantee. See MEETUP_DISCLAIMER.

/** How well-supported a given claim is. Rendered to the reader — not internal. */
export type EvidenceLevel =
  /** Named professional bodies (AVSAB, ASPCA, AKC, SPCAs) state this directly. */
  | 'professional-consensus'
  /** Widely taught by trainers and shelters as a practical convention, but it is
   *  a guideline rather than a documented finding. Timelines especially. */
  | 'rule-of-thumb'
  /** Sources disagree, or the signal is genuinely ambiguous in isolation. */
  | 'contested';

export interface Source {
  id: string;
  /** Organization first — attribution is the point. */
  name: string;
  url: string;
}

export interface FirstMeetingStep {
  id: string;
  title: string;
  detail: string;
  /** The mechanism. Owners follow steps they understand; they skip steps they don't. */
  whyItMatters?: string;
  evidence: EvidenceLevel;
  caveat?: string;
  sources: SourceId[];
}

export interface BodyLanguageSignal {
  id: string;
  /** Which column of the play-vs-conflict reference this belongs in. */
  column: 'play' | 'caution';
  signal: string;
  meaning: string;
  /** Ambiguity note. Several of these signals mean nothing on their own. */
  caveat?: string;
  sources: SourceId[];
}

export interface AbortSign {
  id: string;
  sign: string;
  detail: string;
  sources: SourceId[];
}

export interface NewOwnerNote {
  id: string;
  title: string;
  body: string;
  evidence: EvidenceLevel;
  caveat?: string;
  sources: SourceId[];
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export const SOURCES = [
  {
    id: 'avsab-socialization',
    name: 'AVSAB — Position Statement on Puppy Socialization',
    url: 'https://avsab.org/wp-content/uploads/2018/03/Puppy_Socialization_Position_Statement_Download_-_10-3-14.pdf',
  },
  {
    id: 'avsab-statements',
    name: 'AVSAB — Position Statements and Handouts',
    url: 'https://avsab.org/resources/position-statements/',
  },
  {
    id: 'aspca-body-language',
    name: 'ASPCApro — Canine Body Language Tips',
    url: 'https://www.aspcapro.org/resource/7-tips-canine-body-language',
  },
  {
    id: 'akc-play-or-fight',
    name: 'American Kennel Club — Are Dogs Playing or Fighting?',
    url: 'https://www.akc.org/expert-advice/advice/dogs-playing-or-fighting/',
  },
  {
    id: 'sfspca-intros',
    name: 'San Francisco SPCA — Dog-Dog Introductions',
    url: 'https://www.sfspca.org/resource/dog-dog-introductions/',
  },
  {
    id: 'ahs-intros',
    name: 'Animal Humane Society — How to Successfully Introduce Two Dogs',
    url: 'https://www.animalhumanesociety.org/resource/how-successfully-introduce-two-dogs',
  },
  {
    id: 'preventive-vet-play',
    name: 'Preventive Vet — Press Pause: How to Manage Dog Play',
    url: 'https://www.preventivevet.com/dogs/how-to-manage-dog-play',
  },
  {
    id: 'preventive-vet-dogpark',
    name: 'Preventive Vet — When Can You Take Your Dog to the Dog Park?',
    url: 'https://www.preventivevet.com/dogs/what-you-should-know-before-taking-your-puppy-to-the-dog-park',
  },
  {
    id: 'vca-socialization',
    name: 'VCA Animal Hospitals — Puppy Behavior and Training: Socialization and Fear Prevention',
    url: 'https://vcahospitals.com/know-your-pet/puppy-behavior-and-training---socialization-and-fear-prevention',
  },
  {
    id: 'osu-socialization',
    name: 'Ohio State University CVM — Balancing Puppy Socialization with Infectious Disease Prevention',
    url: 'https://vet.osu.edu/sites/default/files/documents/balancing-puppy-socialization-with-infectious-disease-prevention.pdf',
  },
  {
    id: 'wdj-leash-reactivity',
    name: 'Whole Dog Journal — Leash Reactivity in Otherwise Friendly Dogs',
    url: 'https://www.whole-dog-journal.com/behavior/leash-barrier-reactivity/leash-reactivity-in-otherwise-friendly-dogs/',
  },
  {
    id: 'paws-abilities-greetings',
    name: 'Paws Abilities (Sara Reusche, CPDT) — Like a Handshake, but with Noses and Butts',
    url: 'https://paws4udogs.wordpress.com/2013/11/18/like-a-handshake-but-with-noses-and-butts/',
  },
  {
    id: 'sniffspot-333',
    name: 'Sniffspot — The 3-3-3 Rule for Rescue Dogs: What to Expect in the First Year',
    url: 'https://www.sniffspot.com/blog/dog-training/the-3-3-3-rule-for-rescue-dogs',
  },
  {
    id: 'iaabc',
    name: 'IAABC — Find a Certified Behavior Consultant',
    url: 'https://iaabc.org/consultants',
  },
  {
    id: 'ccpdt',
    name: 'CCPDT — Find a Certified Dog Trainer',
    url: 'https://www.ccpdt.org/dog-owners/certified-dog-trainer-directory/',
  },
] as const satisfies readonly Source[];

export type SourceId = (typeof SOURCES)[number]['id'];

/** Lookup used by every renderer so citations can never drift from SOURCES. */
export function getSource(id: SourceId): Source {
  const found = SOURCES.find((s) => s.id === id);
  // Ids are compile-time checked, so this is a safety net, not a real path.
  if (!found) throw new Error(`Unknown source id: ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// The protocol
// ---------------------------------------------------------------------------

export const FIRST_MEETING_STEPS: readonly FirstMeetingStep[] = [
  {
    id: 'ask-first',
    title: 'Trade real information before you pick a date',
    detail:
      'Vaccination status, size, age, how they play, what they guard, and whether they have ever bitten or been in a fight. Ask directly. Say the same about your own dog, including the unflattering parts.',
    whyItMatters:
      'Nothing else on this page can compensate for a mismatch you did not know about. Two strangers arranging a meetup are the only screening that happens.',
    evidence: 'rule-of-thumb',
    caveat:
      'We have not found a professional body that publishes this as a step, because the published protocols are written for shelters and for adding a second dog at home, where staff or the adopter already hold the history. It is our own addition. And everything either of you says here is self-reported: nobody has checked it, including us. Treat it as a starting point, not a clearance.',
    sources: [],
  },
  {
    id: 'neutral-ground',
    title: 'Meet on ground neither dog owns',
    detail:
      'Not either home or yard. Not the park one of them walks every day. A quiet street, an unfamiliar green space, a wide empty lot — somewhere with room to walk and room to leave.',
    whyItMatters:
      'The SF SPCA opens its introduction protocol here: the first meeting happens on neutral ground outside the house and yard, because territory and familiar contested items are what turn a greeting into a dispute.',
    evidence: 'professional-consensus',
    sources: ['sfspca-intros', 'ahs-intros'],
  },
  {
    id: 'one-handler-each',
    title: 'One adult per dog, hands free',
    detail:
      'Each dog gets their own person holding their own leash. Nobody is holding two dogs, a coffee, and a phone.',
    whyItMatters:
      'The Animal Humane Society walk-and-reward introduction is written for two people walking two dogs. If it goes wrong you need two people who can each move one dog away in opposite directions at the same moment.',
    evidence: 'professional-consensus',
    sources: ['ahs-intros'],
  },
  {
    id: 'clear-the-ground',
    title: 'Put every high-value thing away first',
    detail:
      'Toys, balls, chews, bones, food bowls, and the open treat pouch on your hip. If you are using treats, both handlers should be using them, quietly, and away from the other dog.',
    whyItMatters:
      'The SF SPCA tells adopters to pick up toys, chews, bones, food bowls, and the resident dog\'s favorite items before the new dog arrives — those are the things dogs argue over. The same list applies to a patch of grass you both walked onto.',
    evidence: 'professional-consensus',
    sources: ['sfspca-intros'],
  },
  {
    id: 'one-dog-at-a-time',
    title: 'One dog out of the car at a time',
    detail:
      'Get the first dog out, walk them well away from the vehicles, and only then have the second dog come out. Never let them greet through a car window, a cracked door, or a crate.',
    whyItMatters:
      'A vehicle is a hard barrier at a face-to-face angle. Whole Dog Journal describes restraint and thwarted greeting as a route to frustration and an outburst in dogs who are otherwise friendly, and a car window is restraint with a stranger on the other side of it.',
    evidence: 'rule-of-thumb',
    caveat:
      'This one is practical handling convention taught by trainers rather than a formal position statement. The underlying principle — avoid barriers and head-on contact — is not.',
    sources: ['wdj-leash-reactivity', 'paws-abilities-greetings'],
  },
  {
    id: 'parallel-walk',
    title: 'Walk parallel at distance before any greeting',
    detail:
      'Same direction, same path, both dogs on the outside. Start far enough apart that both dogs can still take a treat and pay more attention to their own person than to each other. The Animal Humane Society then closes the gap about three to five feet at a time, and adds the distance back the moment either dog locks on.',
    whyItMatters:
      'It lets both dogs collect information about each other while moving, with an easy exit, before anyone has to make a decision at nose range.',
    evidence: 'professional-consensus',
    caveat:
      'The published protocol gives you the increments, not a starting number, and that is deliberate — the right starting distance is whatever distance your dog can still think at. It may take more than one walk.',
    sources: ['ahs-intros'],
  },
  {
    id: 'loose-leash',
    title: 'Keep the leash slack the entire time',
    detail:
      'If you need more space, walk away and make space. Do not manufacture it by shortening the leash. A leash you are gripping tight is doing the opposite of what you want.',
    whyItMatters:
      'Tension travels down the leash. Restraint raises arousal, changes the dog\'s posture and how they can carry themselves, and takes away the small movements dogs use to defuse each other. Owners routinely tighten up right at the moment their dog most needs to look relaxed.',
    evidence: 'professional-consensus',
    sources: ['wdj-leash-reactivity', 'ahs-intros'],
  },
  {
    id: 'no-head-on',
    title: 'Let them arc. No nose-to-nose approach',
    detail:
      'Dogs left to their own devices curve toward each other and greet at the side and rear, not the face. Walk a curved line into the greeting instead of marching straight at the other dog.',
    whyItMatters:
      'A direct frontal approach with eye contact is exactly the shape of a threat display. Two polite dogs pointed head-on at each other by their handlers can look like two rude dogs.',
    evidence: 'rule-of-thumb',
    caveat:
      'This is well-established trainer practice drawn from observing how dogs greet when unrestrained, not from a controlled trial.',
    sources: ['paws-abilities-greetings', 'aspca-body-language'],
  },
  {
    id: 'two-second-sniff',
    title: 'Two to three seconds, then call them away',
    detail:
      'Let them sniff briefly, then both handlers cheerfully call their own dog away, praise, treat, and walk on. Then do it again. Short repeated greetings beat one long one.',
    whyItMatters:
      'The SF SPCA specifies two to three seconds. A leashed greeting that runs long tends to stall out — the dogs cannot complete the sniff-and-move-on sequence they would use off leash, so they end up stuck at close range with nowhere to go, and the tension builds from there.',
    evidence: 'professional-consensus',
    sources: ['sfspca-intros', 'paws-abilities-greetings'],
  },
  {
    id: 'keep-it-short',
    title: 'Make the whole first meeting short',
    detail:
      'Think minutes, not an afternoon. Off-leash play, if it happens at all, is a later meeting in a securely fenced space — not this one. The Animal Humane Society only puts two dogs loose together after several relaxed leashed meetings.',
    whyItMatters:
      'Tired plus over-aroused is where good play degrades. Ending early is how you get a second playdate.',
    evidence: 'rule-of-thumb',
    caveat:
      'The nearest published number is the SF SPCA\'s "around five minutes", and that is specifically about the first time two dogs are inside the house together, both still on leash — not about a meeting on neutral ground. We are extending it by analogy rather than quoting it at you.',
    sources: ['sfspca-intros', 'ahs-intros'],
  },
  {
    id: 'end-on-a-good-note',
    title: 'End it while it is still going well',
    detail:
      'Do not wait for a reason to stop. Pick a moment when both dogs look loose and happy, and leave then. If either owner wants to end it, that is reason enough and needs no justification.',
    whyItMatters:
      'Every extra minute past "this is going well" is a minute spent finding out where it stops going well. A meeting stopped early while both dogs were still comfortable costs you nothing and rules nothing out.',
    evidence: 'professional-consensus',
    sources: ['preventive-vet-play', 'akc-play-or-fight'],
  },
];

// ---------------------------------------------------------------------------
// Play vs. conflict
// ---------------------------------------------------------------------------

/** No single signal means anything on its own. Rendered above the two columns. */
export const BODY_LANGUAGE_PREAMBLE =
  'Read the whole dog and the whole situation, not one body part. ASPCA guidance is explicit that individual signals are misleading in isolation — the same bared teeth can be a threat or a submissive grin depending on everything else the dog is doing.';

export const BODY_LANGUAGE: readonly BodyLanguageSignal[] = [
  // --- Play column -------------------------------------------------------
  {
    id: 'play-bow',
    column: 'play',
    signal: 'Play bow',
    meaning:
      'Front end down, chest near the ground, rear end up. The clearest invitation there is, and dogs repeat it mid-play to reconfirm that everything still counts as a game.',
    sources: ['akc-play-or-fight', 'preventive-vet-play'],
  },
  {
    id: 'play-loose',
    column: 'play',
    signal: 'Loose, wiggly, curvy body',
    meaning:
      'Soft face, relaxed muscles, a body that bends rather than holds a line. The Animal Humane Society uses "loose, wiggly bodies" as its cue that two dogs are ready for the next step.',
    sources: ['preventive-vet-play', 'ahs-intros'],
  },
  {
    id: 'play-open-mouth',
    column: 'play',
    signal: 'Open mouth, silly grin',
    meaning:
      'A big open-mouthed, relaxed face. The AKC calls it the open-mouthed grin, and it is one of the plainest differences from a real fight.',
    sources: ['akc-play-or-fight'],
  },
  {
    id: 'play-bouncy',
    column: 'play',
    signal: 'Bouncy, exaggerated, inefficient movement',
    meaning:
      'Play looks like a bad cartoon: springy, over-large, wasteful movements. Serious dogs are quick and economical.',
    sources: ['akc-play-or-fight'],
  },
  {
    id: 'play-self-handicap',
    column: 'play',
    signal: 'Self-handicapping',
    meaning:
      'The bigger, faster, or stronger dog throttles themselves down — lying on their side, moving in slow motion, letting themselves be caught, rolling over on purpose.',
    sources: ['preventive-vet-play', 'akc-play-or-fight'],
  },
  {
    id: 'play-role-reversal',
    column: 'play',
    signal: 'Taking turns and swapping roles',
    meaning:
      'Chaser becomes chased. Whoever is on top ends up on the bottom. Play with a fair back-and-forth is play both dogs are choosing.',
    sources: ['preventive-vet-play', 'akc-play-or-fight'],
  },
  {
    id: 'play-pauses',
    column: 'play',
    signal: 'Frequent short pauses',
    meaning:
      'Good play is full of small breaks — a shake-off, a sniff, a breath — followed by both dogs opting back in. Play with no pauses in it is play that is climbing.',
    sources: ['preventive-vet-play'],
  },
  {
    id: 'play-growl',
    column: 'play',
    signal: 'Loud, theatrical growling',
    meaning:
      'Play growls tend to be long, exaggerated, and noisy, packaged with a wagging tail and a bowing, bouncing body.',
    caveat:
      'Growling alone tells you nothing. It is play growling only when the rest of the dog is loose. If the pitch or tone suddenly changes, stop and look.',
    sources: ['preventive-vet-play', 'akc-play-or-fight'],
  },
  {
    id: 'play-comes-back',
    column: 'play',
    signal: 'Coming back for more',
    meaning:
      'After you separate them, both dogs want back in. This is the answer the consent test is looking for.',
    sources: ['preventive-vet-play'],
  },

  // --- Caution column ----------------------------------------------------
  {
    id: 'caution-stiff',
    column: 'caution',
    signal: 'Stiff or frozen body',
    meaning:
      'Muscles locked, movement stops. ASPCApro lists freezing among the things to watch for, and pairs a hard stare and tight facial muscles with a dog who is not comfortable. Treat a freeze as information, not as calm.',
    sources: ['aspca-body-language', 'akc-play-or-fight'],
  },
  {
    id: 'caution-hard-stare',
    column: 'caution',
    signal: 'Hard stare',
    meaning:
      'A fixed, unblinking, direct look at the other dog with a tight face. Very different from the loose, flicking attention of a dog who is playing.',
    sources: ['aspca-body-language'],
  },
  {
    id: 'caution-whale-eye',
    column: 'caution',
    signal: 'Whale eye',
    meaning:
      'Whites of the eyes showing in a crescent, usually because the dog is holding their head still while tracking something they are worried about. A discomfort signal.',
    sources: ['aspca-body-language'],
  },
  {
    id: 'caution-closed-mouth',
    column: 'caution',
    signal: 'Closed, tight mouth and pinned ears',
    meaning:
      'The grin disappears, the mouth shuts, the ears go flat back. The AKC lists closed mouths and pinned ears among the signs that this is not play.',
    sources: ['akc-play-or-fight'],
  },
  {
    id: 'caution-lip-curl',
    column: 'caution',
    signal: 'Lip curl',
    meaning:
      'Muzzle wrinkled, lips pulled up to show front teeth — ASPCA calls this the offensive pucker, often paired with a low growl. It is a warning, and it deserves to be respected rather than punished.',
    sources: ['aspca-body-language'],
  },
  {
    id: 'caution-tucked-tail',
    column: 'caution',
    signal: 'Tucked tail',
    meaning:
      'Tail pulled between the rear legs or clamped against the belly. Fear. A frightened dog is not enjoying this regardless of what the other dog is doing.',
    sources: ['aspca-body-language', 'akc-play-or-fight'],
  },
  {
    id: 'caution-high-stiff-tail',
    column: 'caution',
    signal: 'High tail with short, rapid movement',
    meaning:
      'A tail held high and vibrating in tight, stiff strokes signals tension, not friendliness. A wagging tail is not automatically a happy tail.',
    sources: ['aspca-body-language'],
  },
  {
    id: 'caution-hackles',
    column: 'caution',
    signal: 'Raised hackles',
    meaning:
      'Hair standing up along the shoulders or spine. Worth noticing — it means the dog is switched on.',
    caveat:
      'Genuinely ambiguous, and easy to over-read. ASPCApro puts it plainly: hackles do not always indicate aggression, they indicate that the dog is excited or aroused. That covers fear, excitement, and high-energy play. Judge it by everything else on the dog.',
    sources: ['aspca-body-language', 'akc-play-or-fight'],
  },
  {
    id: 'caution-mounting',
    column: 'caution',
    signal: 'Mounting or repeated pinning',
    meaning:
      'Especially when it keeps happening, and when the dog underneath is trying to get out. Preventive Vet demonstrates calling a dog away from humping mid-play rather than letting it run.',
    caveat:
      'Brief mounting during high arousal is common and is not on its own a sign of aggression, and our sources do not treat it as one. What matters is whether the other dog is fine with it and whether it keeps repeating.',
    sources: ['preventive-vet-play'],
  },
  {
    id: 'caution-no-break',
    column: 'caution',
    signal: 'One dog never gets a break',
    meaning:
      'No role reversal, no pauses, one dog constantly on the receiving end, ducking away, hiding behind a person, or trying to leave while the other keeps coming. Easy to miss, because from a distance it still looks like two dogs running around.',
    sources: ['preventive-vet-play', 'akc-play-or-fight'],
  },
  {
    id: 'caution-ignoring-signals',
    column: 'caution',
    signal: 'Ignoring the other dog saying stop',
    meaning:
      'One dog signals that they are done — turning away, freezing, a lip curl, moving off — and the other carries on anyway. Interrupt. The dog being ignored has already tried the polite option.',
    sources: ['preventive-vet-play'],
  },
  {
    id: 'caution-ganging-up',
    column: 'caution',
    signal: 'Two or more dogs focused on one',
    meaning:
      'Multiple dogs chasing or targeting a single dog. Preventive Vet flags this as one of the situations to break up immediately — it can flip into a genuinely dangerous group chase very fast.',
    sources: ['preventive-vet-play'],
  },
  {
    id: 'caution-efficient-movement',
    column: 'caution',
    signal: 'Fast, quiet, efficient movement',
    meaning:
      'When the bounce goes out of it and the movements get short, quick, and purposeful, the game is over even if nobody has made a sound.',
    sources: ['akc-play-or-fight'],
  },
];

export const PLAY_SIGNALS: readonly BodyLanguageSignal[] = BODY_LANGUAGE.filter(
  (s) => s.column === 'play',
);

export const CAUTION_SIGNALS: readonly BodyLanguageSignal[] = BODY_LANGUAGE.filter(
  (s) => s.column === 'caution',
);

/** The one technique that answers "is the quiet one actually having fun?" */
export const CONSENT_TEST = {
  id: 'consent-test',
  name: 'The consent test',
  alsoCalled: 'pressing pause',
  summary:
    'When you cannot tell whether both dogs are enjoying it, stop guessing and ask them.',
  steps: [
    'Calmly take hold of the more forward dog — the one on top, or the one doing the chasing — and guide them a few steps away.',
    'Hold that pause for a few seconds. Do not talk the other dog into anything.',
    'Let go and watch what the other dog does.',
  ],
  yesLooksLike:
    'The other dog comes straight back in, play bows, bounces, or re-invites. Both dogs were choosing this. Carry on.',
  noLooksLike:
    'The other dog uses the gap to walk off, sniff the ground, shake off, go to their person, or just stand there. They were not having fun — they were coping. They need a break, or a different playmate.',
  evidence: 'professional-consensus' as EvidenceLevel,
  sources: ['preventive-vet-play'] as SourceId[],
};

// ---------------------------------------------------------------------------
// Stop now
// ---------------------------------------------------------------------------

export const WHEN_TO_ABORT: readonly AbortSign[] = [
  {
    id: 'abort-freeze',
    sign: 'Either dog freezes and stares',
    detail:
      'A hard stop with a locked-on stare and a tight face. The Animal Humane Society protocol says it directly: any time the dogs\' bodies go still, lead them away and take a break. Move, calmly and immediately.',
    sources: ['ahs-intros', 'aspca-body-language'],
  },
  {
    id: 'abort-trying-to-leave',
    sign: 'One dog is trying to leave and cannot',
    detail:
      'Ducking behind their person, pressing into a fence or a car, tail tucked, repeatedly turning away while the other dog keeps re-engaging. Take the pressure off now, not in a minute.',
    sources: ['preventive-vet-play', 'aspca-body-language'],
  },
  {
    id: 'abort-sound-changes',
    sign: 'The sound changes',
    detail:
      'Play noise is loud, long, and silly. A sudden shift in pitch or tone, a short hard growl, a snarl, or a yelp means stop and separate.',
    sources: ['preventive-vet-play', 'akc-play-or-fight'],
  },
  {
    id: 'abort-chase-turns-real',
    sign: 'A chase stops being a game',
    detail:
      'The dog in front is running away rather than circling back, tail tucked, no turn-taking. Real play chase has the target coming back for another round.',
    sources: ['preventive-vet-play', 'akc-play-or-fight'],
  },
  {
    id: 'abort-gang-up',
    sign: 'More than one dog targets a single dog',
    detail:
      'Break it up straight away. Preventive Vet is unambiguous that multiple dogs should not be allowed to gang up on one dog during play.',
    sources: ['preventive-vet-play'],
  },
  {
    id: 'abort-unresponsive',
    sign: 'A dog stops hearing their own person',
    detail:
      'If your dog will not respond to their name or to a recall they normally know cold, they are over threshold. Nothing useful happens above that line.',
    sources: ['preventive-vet-play', 'wdj-leash-reactivity'],
  },
  {
    id: 'abort-teeth-contact',
    sign: 'Any yelp, any teeth that connect, any injury',
    detail:
      'End the meeting. Separate the dogs, check both of them over, and do not restart to see whether it settles down. If there is a puncture, call your vet.',
    sources: ['akc-play-or-fight', 'preventive-vet-play'],
  },
  {
    id: 'abort-owner-uncomfortable',
    sign: 'Either owner wants to stop',
    detail:
      'No explanation required, no negotiation. "I want to end here" is a complete sentence. Preventive Vet\'s instruction for play that feels like it is getting too crazy is simply to call the dogs away — you never need the other owner to agree first.',
    sources: ['preventive-vet-play'],
  },
  {
    id: 'abort-escalating-fast',
    sign: 'It is escalating faster than you can interrupt',
    detail:
      'If you find yourself waiting to see whether it calms down, you are already behind it. Leave. You can always try again another day with more distance and a shorter plan.',
    sources: ['preventive-vet-play'],
  },
];

/** Shown alongside WHEN_TO_ABORT. Ending early is the skill, not the failure. */
export const AFTER_A_BAD_MEETING =
  'Calling it early is not a failed playdate — it is the outcome the protocol is designed to produce. If there was a fight, an injury, or a pattern you cannot explain, that is a job for a credentialed professional rather than more practice. Look for a veterinary behaviorist (DACVB), an IAABC-certified behavior consultant, or a CCPDT-certified trainer.';

// ---------------------------------------------------------------------------
// If you are new to this — or do not have a dog yet
// ---------------------------------------------------------------------------

export const NEW_OWNER_NOTES: readonly NewOwnerNote[] = [
  {
    id: 'socialization-window',
    title: 'The socialization window is real, and it is short',
    body:
      'Puppies pass through a developmental period, starting at around three weeks old, when they are unusually open to new things. AVSAB states plainly that the first three months of life are the primary and most important time for puppy socialization, and that puppies should be exposed to as many new people, animals, stimuli and environments as can be managed safely and without overwhelming them. Incomplete socialization during that time can raise the risk of fear, avoidance and aggression later on.',
    evidence: 'professional-consensus',
    caveat:
      'Where the window closes depends on the dog and on who you ask. AVSAB says the first three months. The veterinary behaviorists writing for VCA put the sensitive period at three to sixteen weeks. The veterinary paper below calls the first twelve weeks prime time. It tapers rather than slams shut — a window, not a deadline you either hit or miss.',
    sources: ['avsab-socialization', 'vca-socialization', 'osu-socialization'],
  },
  {
    id: 'socialization-vs-vaccines',
    title: 'You do not wait for the last shot to start socializing',
    body:
      'This surprises people. AVSAB\'s position is that socialization should begin before a puppy is fully vaccinated, because behavior problems, not infectious disease, are the leading cause of death for dogs under three years old. Their guidance is that puppies can start puppy classes as early as seven to eight weeks, with at least one set of vaccines given at least seven days before the first class plus a first deworming.',
    evidence: 'professional-consensus',
    caveat:
      'That applies to a well-run puppy class on a cleanable surface with health-screened puppies. It is not a general permission slip for public ground. Your vet knows your puppy and your local disease picture; ask them.',
    sources: ['avsab-socialization', 'avsab-statements', 'vca-socialization'],
  },
  {
    id: 'no-dog-parks-yet',
    title: 'A dog park is not where a puppy gets socialized',
    body:
      'Parvovirus can persist in the environment for months after an infected dog has been there, and a public dog park is exactly the kind of high-traffic ground where that risk accumulates. AVSAB says to avoid dog parks and other areas that are not sanitized or are heavily trafficked by dogs of unknown vaccination status. Preventive Vet puts the medical floor at a minimum of seventeen weeks — the series typically finishes around sixteen weeks, plus about a week for full protection.',
    evidence: 'contested',
    caveat:
      'The number is where sources part ways. Preventive Vet says seventeen weeks is the medical minimum but separately recommends waiting until six to eight months on behavioral grounds. The veterinary paper below puts full protection at sixteen to twenty weeks. That is a decision for your vet, not for a web page. The underlying point — high-traffic unsanitized ground is the wrong place for an unprotected puppy — is not disputed.',
    sources: ['preventive-vet-dogpark', 'avsab-socialization', 'osu-socialization'],
  },
  {
    id: 'three-three-three',
    title: 'The "3-3-3 rule" is a helpful story, not a finding',
    body:
      'You will see this everywhere: three days to decompress, three weeks to settle, three months to feel at home. It is genuinely useful as an expectation-setter, and it prevents a lot of dogs from being returned in week one over behavior that was always going to pass.',
    evidence: 'rule-of-thumb',
    caveat:
      'It came out of rescue and shelter communities as a framing device, not out of research, and the sources that promote it say so. Plenty of dogs need six months or a year. Others settle in a fortnight. Do not treat the numbers as a schedule your dog is failing to meet.',
    sources: ['sniffspot-333'],
  },
  {
    id: 'decompression',
    title: 'A brand-new dog is the worst possible candidate for a playdate',
    body:
      'A newly adopted dog spends the first stretch at home decompressing, and the published descriptions of it are unflattering: hiding, not eating or drinking, sleeping excessively, panting or pacing, refusing to go outside, looking shut down or flat. A dog doing any of that is not a dog to take to meet a stranger\'s dog. Low stimulation, a predictable routine, short walks, and no new dogs until they are clearly themselves.',
    evidence: 'rule-of-thumb',
    caveat:
      'You will see specific numbers for this — three days, two weeks — and we are deliberately not giving one, because we could not find a professional body that publishes a measured figure. The sources that give numbers describe them as general frameworks rather than schedules. Some dogs need far longer. Go by the dog in front of you.',
    sources: ['sniffspot-333'],
  },
  {
    id: 'what-its-actually-like',
    title: 'What the first weeks actually look like',
    body:
      'A dog who hides or avoids contact. A dog who does not eat or drink much, sleeps a great deal, paces or pants, refuses to go outside, or seems flat and distant. Those are on Sniffspot\'s list of normal first-days behavior for a rescue dog, and none of them is a verdict on the dog or on you. Interrupted sleep and mouthing are the puppy equivalents. The point of an unhurried start is that both of you get to be bad at this for a while.',
    evidence: 'rule-of-thumb',
    caveat:
      'Not eating, lethargy, or a sudden behavior change can also be medical rather than emotional — Sniffspot draws that line at 48 hours without food, or any vomiting, diarrhea or significant lethargy. If you are unsure whether something is adjustment or illness, that is a vet question, and it is not a silly one to ask.',
    sources: ['sniffspot-333'],
  },
  {
    id: 'thinking-about-a-dog',
    title: 'If you do not have a dog yet',
    body:
      'The single most useful thing to know before you get one: "good with dogs" is not a fixed trait a dog either has or lacks. It depends on the other dog, the place, the day, the handling, and what happened in those first three months. A dog who loves one specific neighbour dog and wants nothing to do with a busy park is a completely normal dog, not a broken one. Plan for the dog you get, not the one in the photos.',
    evidence: 'rule-of-thumb',
    caveat:
      'This is our framing, not a citation-backed claim. The one load-bearing part of it — that early socialization shapes how a dog responds to other dogs later — is AVSAB\'s, linked below.',
    sources: ['avsab-socialization'],
  },
];

// ---------------------------------------------------------------------------
// Guardrail
// ---------------------------------------------------------------------------

/** Must be rendered on every surface that shows this content. Non-negotiable. */
export const MEETUP_DISCLAIMER =
  'GoDoggyDate does not screen, verify, test, or vet any dog or any owner. Everything in a profile is what an owner typed about their own dog. This page collects guidance published by veterinary and animal-welfare organizations so you can read it in one place — it is not veterinary or behavioral advice about your dog, and following it does not make a meeting safe. Dogs are individuals and any introduction between unfamiliar dogs carries risk. If your dog has a bite history, has been in a fight, or frightens you, work with a credentialed professional before arranging a meeting.';
