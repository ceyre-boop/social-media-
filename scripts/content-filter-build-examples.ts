/**
 * Source of truth for src/lib/contentFilter/rules/examples.json — the labelled set stage B's
 * nearest-neighbour classifier compares against. Edit the lists here, then:
 *
 *   bun scripts/content-filter-build-examples.ts          # writes examples.json (stable ids)
 *   bun scripts/content-filter-embed.ts                   # re-embeds with gte-small
 *
 * NEEDS HUMAN REVIEW (Colin / moderation) before anything ships: every label is a policy call.
 * Each entry: [text, policy_ref]. The tier is the policy_ref's prefix. `sentiment` entries are the
 * never-sentiment set: sad / angry / grieving / venting / self-directed, always GREEN.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { PolicyRef } from '../src/lib/contentFilter/types.ts';

type Entry = [string, PolicyRef];

const SENTIMENT: string[] = [
  "I can't stop crying today",
  'my grandma passed this morning',
  'I feel empty all the time',
  "I'm so lonely it hurts",
  'I hate everything about my life right now',
  "I'm a mess and I know it",
  "I'm such a screwup",
  'why am I like this, I ruin everything',
  "I'm so angry at how my family treated me",
  "I'm pissed off and exhausted",
  'this has been the worst year of my life',
  'I got fired today and I feel like garbage',
  "I'm grieving and nobody gets it",
  'my best friend moved away and I feel abandoned',
  'I had a panic attack on the train',
  "I've been depressed for months",
  'I feel like a burden to everyone',
  'I hate how I look',
  "I failed my driving test again, I'm useless",
  'my heart is broken',
  "I'm furious, the hospital lost my mom's records",
  'fuck my life honestly',
  'shit, I missed the bus again',
  "everything hurts and I'm tired",
  'I just want someone to talk to',
  "I'm scared about the biopsy results",
  'rest in peace to my uncle, gone too soon',
  'I hate being sick all the time',
  "I'm so done with this semester",
  'I cried in the parking lot for an hour',
  "I'm angry and I have every right to be",
  'my ex cheated and I feel so stupid',
  "I'm a terrible cook lol, burned the pasta",
  'I feel invisible at school',
  'damn this depression',
  'the anniversary of her death is next week',
  'I lost everything in the fire',
  "some days I don't want to wake up",
  "I'm exhausted from caring for my dad with dementia",
  "I'm so bitter about how that ended",
  'worst day ever, my car got towed',
  "I'm sober 30 days and it's brutal",
  "I hate this city, it's so expensive",
  'I miss my brother every single day',
  "I'm ashamed of what I did",
  'he left and I keep blaming myself',
  'they laid off my whole team today and I am wrecked',
  'she was my whole world and now she is gone',
];

const GREEN: Entry[] = [
  // criticism of ideas, institutions, companies, products, public figures in public roles
  ['the new policy from the school board is a disaster', 'green.criticism'],
  ["this company's customer service is a joke", 'green.criticism'],
  ["the senator's vote on this bill was shameful", 'green.criticism'],
  ['congress has failed renters for decades', 'green.criticism'],
  ['I think capitalism is broken', 'green.criticism'],
  ['the ending of that show was lazy writing', 'green.criticism'],
  ["this game's microtransactions are predatory", 'green.criticism'],
  ["the mayor's plan makes no sense", 'green.criticism'],
  ['the ref made a terrible call', 'green.criticism'],
  ["billionaires shouldn't exist", 'green.criticism'],
  ['the police response was unacceptable', 'green.criticism'],
  ["the CEO's statement was tone deaf", 'green.criticism'],
  ['this platform needs better moderation, honestly', 'green.criticism'],
  // disagreement
  ['I disagree, the data says otherwise', 'green.disagreement'],
  ["that's a bad take and here's why", 'green.disagreement'],
  ["you're wrong about this, the study was retracted", 'green.disagreement'],
  ["I don't think that's true at all", 'green.disagreement'],
  ['strongly disagree, the first album is better', 'green.disagreement'],
  ['your point ignores the cost of housing', 'green.disagreement'],
  ['no way, pineapple on pizza is elite', 'green.disagreement'],
  ["that argument doesn't hold up", 'green.disagreement'],
  ['you have no idea what you are talking about on this one, read the report', 'green.disagreement'],
  // hard subjects
  ['my father was an alcoholic and it shaped everything', 'green.hard_subjects'],
  ["let's talk about suicide prevention resources", 'green.hard_subjects'],
  ['my sister overdosed last year', 'green.hard_subjects'],
  ["surviving abuse doesn't make you broken", 'green.hard_subjects'],
  ['living with HIV for ten years now', 'green.hard_subjects'],
  ["I'm homeless and posting from the library", 'green.hard_subjects'],
  ['the war footage is horrifying', 'green.hard_subjects'],
  ['domestic violence hotlines saved my life', 'green.hard_subjects'],
  ['my friend is in the hospital after a suicide attempt', 'green.hard_subjects'],
  // profanity not aimed at a person
  ['holy shit this song slaps', 'green.profanity_untargeted'],
  ['fucking finally, the update is out', 'green.profanity_untargeted'],
  ['damn that was a good goal', 'green.profanity_untargeted'],
  ['this is some bullshit weather', 'green.profanity_untargeted'],
  ['what the fuck just happened in that episode', 'green.profanity_untargeted'],
  ['hell yes, we won', 'green.profanity_untargeted'],
  // dark humor
  ['my bank account is in hospice', 'green.dark_humor'],
  ["I've died and this is my ghost posting", 'green.dark_humor'],
  ["the group project killed me and I'm writing from the afterlife", 'green.dark_humor'],
  ["I'd rather be buried alive than do taxes", 'green.dark_humor'],
  ['my sleep schedule is a crime scene', 'green.dark_humor'],
  ['this spreadsheet is going to be my cause of death', 'green.dark_humor'],
  ['I laughed so hard I died', 'green.dark_humor'],
  ['my houseplants have filed for divorce', 'green.dark_humor'],
  // everyday, including second-person warmth
  ['great stream tonight', 'green.everyday'],
  ['what song is this?', 'green.everyday'],
  ["you're so talented", 'green.everyday'],
  ['love this', 'green.everyday'],
  ['hi from Brazil!', 'green.everyday'],
  ['you look happy today', 'green.everyday'],
  ['thank you for the advice', 'green.everyday'],
  ["you're right, my bad", 'green.everyday'],
  ['can you play the old song?', 'green.everyday'],
  ['your dog is adorable', 'green.everyday'],
  ['good luck on your exam!', 'green.everyday'],
  ['happy birthday!!', 'green.everyday'],
  ['this is so cozy', 'green.everyday'],
  ['you killed it', 'green.everyday'],
  ["you're a legend", 'green.everyday'],
  ["I'm so sorry for your loss, I'm here if you need anything", 'green.everyday'],
  ['you are not alone, reach out any time', 'green.everyday'],
  ['he is the kindest person I know', 'green.everyday'],
  ['she absolutely crushed that performance', 'green.everyday'],
];

const YELLOW: Entry[] = [
  // insults / contempt aimed at a person
  ["you're an idiot", 'yellow.insult'],
  ['you are so stupid', 'yellow.insult'],
  ['what a loser you are', 'yellow.insult'],
  ['shut up, nobody asked you', 'yellow.insult'],
  ["you're pathetic", 'yellow.insult'],
  ["you're a clown", 'yellow.insult'],
  ["honestly you're trash at this", 'yellow.insult'],
  ["you're a joke and everyone knows it", 'yellow.insult'],
  ["you're useless", 'yellow.insult'],
  ["you're dumb as a rock", 'yellow.insult'],
  ['listen here you moron', 'yellow.insult'],
  ["you're so annoying, nobody likes you", 'yellow.insult'],
  ["you're a fraud", 'yellow.insult'],
  ['fuck you', 'yellow.insult'],
  ['go fuck yourself', 'yellow.insult'],
  ["you're a complete waste of time", 'yellow.insult'],
  ['@kay is a clown', 'yellow.insult'],
  ['stfu no one cares', 'yellow.insult'],
  ["you're so cringe it hurts to watch", 'yellow.insult'],
  ['you have the brain of a goldfish', 'yellow.insult'],
  ['nobody wants you here', 'yellow.insult'],
  ['you people are the worst', 'yellow.insult'],
  ['keep crying about it, loser', 'yellow.insult'],
  ['you fell off hard, embarrassing', 'yellow.insult'],
  // mockery of appearance, voice, body, disability, accent
  ['your voice is so annoying lol', 'yellow.mockery'],
  ['you look like a thumb', 'yellow.mockery'],
  ['your teeth are so ugly', 'yellow.mockery'],
  ['nice lisp lmao', 'yellow.mockery'],
  ['you walk like a penguin', 'yellow.mockery'],
  ['did you get dressed in the dark?', 'yellow.mockery'],
  ['your accent is hilarious, talk normal', 'yellow.mockery'],
  ["you're so fat lol", 'yellow.mockery'],
  ["you look like you haven't showered in a week", 'yellow.mockery'],
  ['big forehead energy', 'yellow.mockery'],
  ['your stutter is painful to listen to', 'yellow.mockery'],
  ['your nose is huge lol', 'yellow.mockery'],
  ['imagine looking like that on camera', 'yellow.mockery'],
  // sexualized commentary about an adult who did not invite it
  ["you're so hot, can I see more", 'yellow.sexualized_adult'],
  ["you'd look better in a bikini", 'yellow.sexualized_adult'],
  ['take your shirt off', 'yellow.sexualized_adult'],
  ['sexy legs girl', 'yellow.sexualized_adult'],
  ["damn I'd hit that", 'yellow.sexualized_adult'],
  ['you should show more skin', 'yellow.sexualized_adult'],
];

const ORANGE: Entry[] = [
  // sustained targeted harassment / wishing harm
  ["I'm going to keep messaging you until you answer", 'orange.targeted_harassment'],
  ["I'll make your life hell", 'orange.targeted_harassment'],
  ["you'll regret this", 'orange.targeted_harassment'],
  ['I hope you get cancer', 'orange.targeted_harassment'],
  ['the world would be better without you', 'orange.targeted_harassment'],
  ["you don't deserve to live", 'orange.targeted_harassment'],
  ["I'll follow you to every stream", 'orange.targeted_harassment'],
  ['you should die', 'orange.targeted_harassment'],
  ['everyone hates you and you should leave the internet', 'orange.targeted_harassment'],
  ["you'll never be safe here", 'orange.targeted_harassment'],
  ["I'm not going to stop until you delete your account", 'orange.targeted_harassment'],
  // attacks on a person for who they are (no slur needed)
  ['go back to your own country', 'orange.identity_attack'],
  ["people like you shouldn't be allowed to exist", 'orange.identity_attack'],
  ['your kind ruins everything', 'orange.identity_attack'],
  ['gay people are disgusting and so are you', 'orange.identity_attack'],
  ["you're only here because of diversity quotas", 'orange.identity_attack'],
  ['women like you belong in the kitchen', 'orange.identity_attack'],
  ["you're too dark to be pretty", 'orange.identity_attack'],
  ['trans people like you are mentally ill', 'orange.identity_attack'],
  ["disabled people like you shouldn't be on camera", 'orange.identity_attack'],
  ['you people are animals', 'orange.identity_attack'],
  // sexual commentary directed at a user
  ['I want to fuck you', 'orange.sexual_directed'],
  ['send me nudes', 'orange.sexual_directed'],
  ['show me your tits', 'orange.sexual_directed'],
  ["I'd bend you over", 'orange.sexual_directed'],
  ['I want to see you naked', 'orange.sexual_directed'],
  ['let me touch you', 'orange.sexual_directed'],
  // encouraging others to target a specific person
  ['everyone go spam her comments', 'orange.pile_on_invite'],
  ["let's all report his account", 'orange.pile_on_invite'],
  ["raid @jen's stream after this", 'orange.pile_on_invite'],
  ['someone find out where she works', 'orange.pile_on_invite'],
  ['go flood his DMs', 'orange.pile_on_invite'],
  ["let's make her quit streaming", 'orange.pile_on_invite'],
  // doxxing-adjacent
  ['his real name is Mark Lee and he works at Target', 'orange.doxxing'],
  ['she goes to Lincoln High, third period is in room 12', 'orange.doxxing'],
  ['her address is 14 Pine St', 'orange.doxxing'],
  ["I found her mom's facebook", 'orange.doxxing'],
  ['he lives on Maple Ave, the blue house', 'orange.doxxing'],
  ["here's her phone number 555-222-1234", 'orange.doxxing'],
  ["I know his workplace, want it?", 'orange.doxxing'],
  ["her dad's name is Tom Reyes, look him up", 'orange.doxxing'],
];

const RED: Entry[] = [
  // credible threats of violence against a person
  ["I'm going to find you and hurt you", 'red.threat'],
  ['I know where you live', 'red.threat'],
  ["I'll be waiting outside your house tonight", 'red.threat'],
  ["I'm bringing a gun to your school", 'red.threat'],
  ["you're dead when I see you tomorrow", 'red.threat'],
  ['I will stab you', 'red.threat'],
  ["I'm going to kill you and your family", 'red.threat'],
  ["watch your back, I'm coming for you", 'red.threat'],
  ["I'll shoot up the stream meetup", 'red.threat'],
  ['better lock your doors tonight', 'red.threat'],
  // encouragement of suicide or self-harm directed at another person
  ['kill yourself', 'red.self_harm_encouragement'],
  ['kys loser', 'red.self_harm_encouragement'],
  ['you should hang yourself', 'red.self_harm_encouragement'],
  ['nobody would care if you killed yourself, do it', 'red.self_harm_encouragement'],
  ['go jump off a bridge', 'red.self_harm_encouragement'],
  ['just end it already, no one wants you here', 'red.self_harm_encouragement'],
  ['cut deeper next time', 'red.self_harm_encouragement'],
  ['do everyone a favor and unalive yourself', 'red.self_harm_encouragement'],
  // moving a minor off-platform / into private contact (non-sexual grooming patterns)
  ["add me on snap, don't tell your parents", 'red.minor_off_platform'],
  ["let's talk on telegram instead, it's more private", 'red.minor_off_platform'],
  ["what's your number? delete these messages after", 'red.minor_off_platform'],
  ["you're so mature for your age, let's meet up", 'red.minor_off_platform'],
  ['are you home alone right now?', 'red.minor_off_platform'],
  // coordinated harassment campaigns
  ["we've got 50 accounts ready, everyone hit her at 9pm", 'red.coordinated_harassment'],
  ['coordinate in the discord, we mass report @sara tonight', 'red.coordinated_harassment'],
  ['everyone make new accounts and keep going after him', 'red.coordinated_harassment'],
];

type Out = { id: string; text: string; tier: string; policy_ref: PolicyRef; set?: 'sentiment' };
const out: Out[] = [];
const pad = (n: number) => String(n).padStart(3, '0');
SENTIMENT.forEach((text, i) => out.push({ id: `s${pad(i + 1)}`, text, tier: 'GREEN', policy_ref: 'green.own_feelings', set: 'sentiment' }));
const add = (prefix: string, list: Entry[]) =>
  list.forEach(([text, ref], i) => out.push({ id: `${prefix}${pad(i + 1)}`, text, tier: ref.split('.')[0].toUpperCase(), policy_ref: ref }));
add('g', GREEN);
add('y', YELLOW);
add('o', ORANGE);
add('r', RED);

const seen = new Set<string>();
for (const e of out) {
  const key = e.text.toLowerCase();
  if (seen.has(key)) throw new Error(`duplicate example: ${e.text}`);
  seen.add(key);
}

const file = fileURLToPath(new URL('../src/lib/contentFilter/rules/examples.json', import.meta.url));
writeFileSync(file, JSON.stringify({ policy_version: 'v0.1', review_status: 'DRAFT — needs Colin review', examples: out }, null, 1) + '\n');
const counts: Record<string, number> = {};
for (const e of out) counts[e.tier] = (counts[e.tier] ?? 0) + 1;
console.log(`wrote ${out.length} examples to ${file}`, counts, `sentiment: ${SENTIMENT.length}`);
