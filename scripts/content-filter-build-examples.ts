/**
 * Source of truth for src/lib/contentFilter/rules/examples.json — the labelled set stage B's
 * nearest-neighbour classifier compares against. Edit the lists here, then:
 *
 *   bun scripts/content-filter-build-examples.ts          # writes examples.json (stable ids)
 *   bun scripts/content-filter-embed.ts                   # re-embeds with gte-small
 *
 * NEEDS HUMAN REVIEW (Colin / moderation) before anything ships: every label is a policy call.
 *
 * Labels follow the v0.2 speech dial (Community Policy, 2026-09-30). Each entry: [text, policy_ref].
 * The GRADE is the policy_ref's prefix:
 *   family.*    shown at every level (G-rated)
 *   standard.*  swearing; a mild insult aimed at someone (YELLOW mirror at Standard)
 *   open.*      roasting (banter between friends; bullying from a stranger), crude jokes
 *   max.*       dark / edgy humor
 *   orange.*    ceiling, rephrase: bullying, harassing, controlling, sexual, pile-ons, doxxing
 *   red.*       ceiling, blocked + 24h review
 * `sentiment` entries are the never-sentiment set: sad / angry / grieving / venting /
 * self-directed. They are Family unless they swear (then Standard, for the swear alone).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { normalize } from '../src/lib/contentFilter/normalize.ts';
import { hasProfanity } from '../src/lib/contentFilter/profanity.ts';
import type { Grade, PolicyRef } from '../src/lib/contentFilter/types.ts';

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

const FAMILY: Entry[] = [
  // criticism of ideas, institutions, companies, products, public figures in public roles
  ['the new policy from the school board is a disaster', 'family.criticism'],
  ["this company's customer service is a joke", 'family.criticism'],
  ["the senator's vote on this bill was shameful", 'family.criticism'],
  ['congress has failed renters for decades', 'family.criticism'],
  ['I think capitalism is broken', 'family.criticism'],
  ['the ending of that show was lazy writing', 'family.criticism'],
  ["this game's microtransactions are predatory", 'family.criticism'],
  ["the mayor's plan makes no sense", 'family.criticism'],
  ['the ref made a terrible call', 'family.criticism'],
  ["billionaires shouldn't exist", 'family.criticism'],
  ['the police response was unacceptable', 'family.criticism'],
  ["the CEO's statement was tone deaf", 'family.criticism'],
  ['this platform needs better moderation, honestly', 'family.criticism'],
  // disagreement
  ['I disagree, the data says otherwise', 'family.disagreement'],
  ["that's a bad take and here's why", 'family.disagreement'],
  ["you're wrong about this, the study was retracted", 'family.disagreement'],
  ["I don't think that's true at all", 'family.disagreement'],
  ['strongly disagree, the first album is better', 'family.disagreement'],
  ['your point ignores the cost of housing', 'family.disagreement'],
  ['no way, pineapple on pizza is elite', 'family.disagreement'],
  ["that argument doesn't hold up", 'family.disagreement'],
  ['you have no idea what you are talking about on this one, read the report', 'family.disagreement'],
  // hard subjects
  ['my father was an alcoholic and it shaped everything', 'family.hard_subjects'],
  ["let's talk about suicide prevention resources", 'family.hard_subjects'],
  ['my sister overdosed last year', 'family.hard_subjects'],
  ["surviving abuse doesn't make you broken", 'family.hard_subjects'],
  ['living with HIV for ten years now', 'family.hard_subjects'],
  ["I'm homeless and posting from the library", 'family.hard_subjects'],
  ['the war footage is horrifying', 'family.hard_subjects'],
  ['domestic violence hotlines saved my life', 'family.hard_subjects'],
  ['my friend is in the hospital after a suicide attempt', 'family.hard_subjects'],
  // everyday figures of speech about death and disaster (G-rated, not edgy)
  ['my bank account is in hospice', 'family.hyperbole'],
  ["I've died and this is my ghost posting", 'family.hyperbole'],
  ["the group project killed me and I'm writing from the afterlife", 'family.hyperbole'],
  ["I'd rather be buried alive than do taxes", 'family.hyperbole'],
  ['my sleep schedule is a crime scene', 'family.hyperbole'],
  ['this spreadsheet is going to be my cause of death', 'family.hyperbole'],
  ['I laughed so hard I died', 'family.hyperbole'],
  ['my houseplants have filed for divorce', 'family.hyperbole'],
  // everyday, including second-person warmth
  ['great stream tonight', 'family.everyday'],
  ['what song is this?', 'family.everyday'],
  ["you're so talented", 'family.everyday'],
  ['love this', 'family.everyday'],
  ['hi from Brazil!', 'family.everyday'],
  ['you look happy today', 'family.everyday'],
  ['thank you for the advice', 'family.everyday'],
  ["you're right, my bad", 'family.everyday'],
  ['can you play the old song?', 'family.everyday'],
  ['your dog is adorable', 'family.everyday'],
  ['good luck on your exam!', 'family.everyday'],
  ['happy birthday!!', 'family.everyday'],
  ['this is so cozy', 'family.everyday'],
  ['you killed it', 'family.everyday'],
  ["you're a legend", 'family.everyday'],
  ["I'm so sorry for your loss, I'm here if you need anything", 'family.everyday'],
  ['you are not alone, reach out any time', 'family.everyday'],
  ['he is the kindest person I know', 'family.everyday'],
  ['she absolutely crushed that performance', 'family.everyday'],
  // NEW v0.2 — caring things that look like control, but aren't
  ['text me when you get home safe', 'family.everyday'],
  ["share your location with me for the hike so we don't lose each other", 'family.everyday'],
  ["you're not allowed to leave without trying my cake", 'family.everyday'],
  ["tell me where you are and I'll come pick you up", 'family.everyday'],
  ["I miss you, call me when you're free", 'family.everyday'],
  // NEW v0.2 — minced oaths and bathroom talk that isn't a joke
  ['gosh darn it, I dropped my ice cream', 'family.everyday'],
  ["oh heck, that's a lot of homework", 'family.everyday'],
  ['brb, bathroom break', 'family.everyday'],
];

const STANDARD: Entry[] = [
  // swearing not aimed at anyone
  ['holy shit this song slaps', 'standard.profanity'],
  ['fucking finally, the update is out', 'standard.profanity'],
  ['damn that was a good goal', 'standard.profanity'],
  ['this is some bullshit weather', 'standard.profanity'],
  ['what the fuck just happened in that episode', 'standard.profanity'],
  ['hell yes, we won', 'standard.profanity'],
  // mild insults aimed at someone: the YELLOW mirror at Standard
  ["you're an idiot", 'standard.insult'],
  ['you are so stupid', 'standard.insult'],
  ['shut up, nobody asked you', 'standard.insult'],
  ["you're a clown", 'standard.insult'],
  ["honestly you're trash at this", 'standard.insult'],
  ["you're dumb as a rock", 'standard.insult'],
  ['listen here you moron', 'standard.insult'],
  ["you're a fraud", 'standard.insult'],
  ['fuck you', 'standard.insult'],
  ['go fuck yourself', 'standard.insult'],
  ['@kay is a clown', 'standard.insult'],
  ['stfu no one cares', 'standard.insult'],
  ['you have the brain of a goldfish', 'standard.insult'],
  ['you fell off hard, embarrassing', 'standard.insult'],
];

const OPEN: Entry[] = [
  // roasting: harsh insults and mockery of how someone looks, sounds, or moves
  ['what a loser you are', 'open.roast'],
  ["you're pathetic", 'open.roast'],
  ["you're a joke and everyone knows it", 'open.roast'],
  ["you're useless", 'open.roast'],
  ["you're a complete waste of time", 'open.roast'],
  ["you're so cringe it hurts to watch", 'open.roast'],
  ['you people are the worst', 'open.roast'],
  ['keep crying about it, loser', 'open.roast'],
  ['your voice is so annoying lol', 'open.roast'],
  ['you look like a thumb', 'open.roast'],
  ['your teeth are so ugly', 'open.roast'],
  ['nice lisp lmao', 'open.roast'],
  ['you walk like a penguin', 'open.roast'],
  ['did you get dressed in the dark?', 'open.roast'],
  ['your accent is hilarious, talk normal', 'open.roast'],
  ["you're so fat lol", 'open.roast'],
  ["you look like you haven't showered in a week", 'open.roast'],
  ['big forehead energy', 'open.roast'],
  ['your stutter is painful to listen to', 'open.roast'],
  ['your nose is huge lol', 'open.roast'],
  ['imagine looking like that on camera', 'open.roast'],
  // NEW v0.2 — banter between friends (a roast; bullying if aimed at a stranger)
  ['bro your aim is so bad my grandma could carry you', 'open.roast'],
  ['you absolute muppet, you forgot the cake again lol', 'open.roast'],
  ['you look like a lost golden retriever in that jacket lmao', 'open.roast'],
  ["you're so bad at this game it's actually impressive", 'open.roast'],
  ["imagine losing to a bot, couldn't be me", 'open.roast'],
  ['you dress like a substitute teacher', 'open.roast'],
  ['your cooking could be classified as a weapon', 'open.roast'],
  ['that haircut is a crime and you know it', 'open.roast'],
  // NEW v0.2 — crude jokes (not sexual)
  ['I just farted so loud the dog left the room', 'open.crude'],
  ['that burrito is going to destroy my toilet', 'open.crude'],
  ["that's what she said", 'open.crude'],
  ['he got hit right in the balls lmao', 'open.crude'],
  ['my butt is numb from this stream', 'open.crude'],
  ['the baby pooped on the new couch, I am crying laughing', 'open.crude'],
  ['who keeps leaving boogers on the wall, this is disgusting lol', 'open.crude'],
];

const MAX: Entry[] = [
  // NEW v0.2 — dark and edgy jokes, aimed at nobody
  ['dead baby jokes are the only thing getting me through mondays', 'max.dark_humor'],
  ["I have a joke about cancer but it's terminal", 'max.dark_humor'],
  ["my grandpa's last words were 'hold my beer'", 'max.dark_humor'],
  ["the funeral was so boring even the guest of honor didn't show up", 'max.dark_humor'],
  ["I want to die peacefully in my sleep like my grandpa, not screaming like his passengers", 'max.dark_humor'],
  ['what do you call an orphan who loses a race? a double loser', 'max.dark_humor'],
];

const ORANGE: Entry[] = [
  // harassing: persistent unwanted targeting, wishing harm
  ["I'm going to keep messaging you until you answer", 'orange.harassing'],
  ["I'll make your life hell", 'orange.harassing'],
  ["you'll regret this", 'orange.harassing'],
  ['I hope you get cancer', 'orange.harassing'],
  ['the world would be better without you', 'orange.harassing'],
  ["you don't deserve to live", 'orange.harassing'],
  ["I'll follow you to every stream", 'orange.harassing'],
  ['you should die', 'orange.harassing'],
  ["you'll never be safe here", 'orange.harassing'],
  ["I'm not going to stop until you delete your account", 'orange.harassing'],
  // NEW v0.2 — harassing
  ['answer me. answer me. ANSWER ME', 'orange.harassing'],
  ['I made another account since you blocked me', 'orange.harassing'],
  ["you can block me all you want, I'll keep finding you", 'orange.harassing'],
  ["I'll be in every one of your streams until you reply", 'orange.harassing'],
  ["why are you ignoring me, I've messaged you 20 times", 'orange.harassing'],
  ["I'm going to comment on every post you make until you quit", 'orange.harassing'],
  ["you can't hide from me forever", 'orange.harassing'],
  // bullying: demeaning a person, or a mockery campaign
  ['everyone hates you and you should leave the internet', 'orange.bullying'],
  ["you're so annoying, nobody likes you", 'orange.bullying'],
  ['nobody wants you here', 'orange.bullying'],
  // NEW v0.2 — bullying (vs the banter above)
  ['nobody at school likes you, just stop showing up', 'orange.bullying'],
  ["everyone laugh at @mia's haircut", 'orange.bullying'],
  ["let's rate how ugly she is 1-10", 'orange.bullying'],
  ["you're a worthless nobody and everyone knows it", 'orange.bullying'],
  ['you should quit, everyone is laughing at you not with you', 'orange.bullying'],
  ['go cry to your mom, nobody here wants you', 'orange.bullying'],
  ['post more pics of him so we can all make fun of him', 'orange.bullying'],
  ['look at this loser, screenshot it before he deletes', 'orange.bullying'],
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
  // NEW v0.2 — controlling / coercion
  ["tell me where you are right now or we're done", 'orange.controlling'],
  ['send me your location, I need to know where you are at all times', 'orange.controlling'],
  ["you're not allowed to hang out with them anymore", 'orange.controlling'],
  ["I don't want you talking to your friends, they're a bad influence on us", 'orange.controlling'],
  ['give me your password so I can check your messages', 'orange.controlling'],
  ['let me see your phone, now', 'orange.controlling'],
  ["if you go to that party I'll tell everyone your secrets", 'orange.controlling'],
  ["you owe me after everything I've done for you, so you'll do what I say", 'orange.controlling'],
  ["block him or I'm leaving you", 'orange.controlling'],
  ["why haven't you answered, I can see you're online, answer me now", 'orange.controlling'],
  ['you have to ask me before you go anywhere', 'orange.controlling'],
  ["if you leave me I'll hurt myself and it'll be your fault", 'orange.controlling'],
  ["delete your account or I'll tell everyone what you did", 'orange.controlling'],
  ["you can't wear that, change before you go out", 'orange.controlling'],
  ["share your location with me or don't bother coming home", 'orange.controlling'],
  ["you're not allowed to post without my permission", 'orange.controlling'],
  // sexual: out at every level (App Store), aimed at someone or not
  ["you're so hot, can I see more", 'orange.sexual'],
  ["you'd look better in a bikini", 'orange.sexual'],
  ['take your shirt off', 'orange.sexual'],
  ['sexy legs girl', 'orange.sexual'],
  ["damn I'd hit that", 'orange.sexual'],
  ['you should show more skin', 'orange.sexual'],
  ['I want to fuck you', 'orange.sexual'],
  ['send me nudes', 'orange.sexual'],
  ['show me your tits', 'orange.sexual'],
  ["I'd bend you over", 'orange.sexual'],
  ['I want to see you naked', 'orange.sexual'],
  ['let me touch you', 'orange.sexual'],
  // NEW v0.2 — sexual (vs the crude jokes above)
  ["I'm so horny tonight", 'orange.sexual'],
  ['who wants to sext', 'orange.sexual'],
  ["describe what you'd do to me in bed", 'orange.sexual'],
  ['send me something spicy 😏', 'orange.sexual'],
  ["I want to see what's under that shirt", 'orange.sexual'],
  ['dm me for my nudes', 'orange.sexual'],
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
  ['I know his workplace, want it?', 'orange.doxxing'],
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

type Out = { id: string; text: string; grade: Grade; policy_ref: PolicyRef; set?: 'sentiment' };
const out: Out[] = [];
const pad = (n: number) => String(n).padStart(3, '0');
SENTIMENT.forEach((text, i) => {
  const swears = hasProfanity(normalize(text));
  out.push({
    id: `s${pad(i + 1)}`,
    text,
    grade: swears ? 'standard' : 'family',
    policy_ref: swears ? 'standard.profanity' : 'family.own_feelings',
    set: 'sentiment',
  });
});
const add = (prefix: string, list: Entry[]) =>
  list.forEach(([text, ref], i) => out.push({ id: `${prefix}${pad(i + 1)}`, text, grade: ref.split('.')[0] as Grade, policy_ref: ref }));
add('f', FAMILY);
add('d', STANDARD);
add('p', OPEN);
add('m', MAX);
add('o', ORANGE);
add('r', RED);

const seen = new Set<string>();
for (const e of out) {
  const key = e.text.toLowerCase();
  if (seen.has(key)) throw new Error(`duplicate example: ${e.text}`);
  seen.add(key);
}

const file = fileURLToPath(new URL('../src/lib/contentFilter/rules/examples.json', import.meta.url));
writeFileSync(
  file,
  JSON.stringify({ policy_version: 'v0.2', review_status: 'DRAFT — needs Colin review', examples: out }, null, 1) + '\n',
);
const counts: Record<string, number> = {};
for (const e of out) counts[e.grade] = (counts[e.grade] ?? 0) + 1;
console.log(`wrote ${out.length} examples to ${file}`, counts, `sentiment: ${SENTIMENT.length}`);
