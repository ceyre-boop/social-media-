/**
 * The never-sentiment corpus: sad, angry, grieving, venting, self-directed, profane-but-untargeted,
 * institution/idea criticism, and dark-humor texts. Every one MUST resolve GREEN, under every
 * creator strictness, through stage A alone and through the full pipeline.
 *
 * None of these appear in rules/examples.json: this corpus is unseen by the stage-B index, so it
 * tests generalization rather than memorization. Add to it; never remove from it.
 */
export const SENTIMENT_CORPUS: readonly string[] = [
  // grief
  'my dad died last night and I don’t know how to do this',
  'it’s been a year since mom passed and it still hits me every morning',
  'we lost the baby. I can’t stop crying',
  'my dog died today. he was 14 and my best friend',
  'funeral is tomorrow and I have no idea what to say',
  'I keep picking up my phone to call her and then remembering',
  'grief is so heavy some days I can’t get out of bed',
  // sadness, despair, self-directed
  'I’m not okay',
  'I relapsed. 200 days gone',
  'I feel so worthless lately',
  'I’m such an idiot, I locked myself out again',
  'I hate myself for how I treated her',
  'I’m a failure and everyone can see it',
  'honestly I’m so stupid for trusting him',
  'I’m the worst friend, I forgot her birthday',
  'nobody would notice if I disappeared',
  'I want to disappear for a while',
  'I don’t see the point anymore',
  'I’m so tired of pretending I’m fine',
  'everything I touch falls apart',
  'I feel ugly in every photo',
  'I’m disgusting, I can’t even look in the mirror',
  // anger and venting (no target, or aimed at an institution / idea / thing)
  'I am so angry I could scream',
  'fuck this week',
  'fuck cancer',
  'this is fucking bullshit, I studied for weeks and still failed',
  'I’m furious at myself',
  'my landlord raised the rent again and I’m livid',
  'the insurance company denied my claim for the third time, this system is broken',
  'this app update is garbage, bring back the old layout',
  'the government’s housing policy is a disaster',
  'that law is cruel and it should be repealed',
  'the league’s refereeing this season has been a joke',
  'I strongly disagree with this take, it ignores how rent actually works',
  'your argument makes no sense to me, the numbers don’t add up',
  'traffic today was hell, sat there for two hours',
  'Mondays are the worst',
  'I hate my job so much',
  'being broke is exhausting',
  'my chronic pain is unbearable today',
  // hard subjects
  'I was abused as a kid and I’m only now talking about it',
  'my brother is addicted to opioids and we don’t know what to do',
  'chemo round four. I’m wrecked',
  'we got evicted today',
  'my friend killed himself last spring and I still think about it every day',
  'I’ve been thinking about suicide and I don’t know who to tell',
  // dark humor
  'this exam is going to kill me',
  'if I have to sit through one more meeting I will simply perish',
  'my plants are dead again, I am a serial killer of succulents',
  'dead inside but the coffee is good',
  'I’m going to kill myself laughing at this',
  'the Wi-Fi died and took my will to live with it',
  'bury me with my unfinished to-do list',
  // mixed
  'lost my job, lost my apartment, but at least the cat still likes me',
  'screaming into a pillow rn',
  'I’m heartbroken and I don’t care who knows it',
  'I miss who I used to be',
  'damn, that’s rough. I’m so sorry you’re going through it',
  'sending love, this world is brutal sometimes',
  'I feel like such a loser for crying at work',
];
