import type { GiftSender } from './rail';

/** Scripted "Try gifts" run for the preview: exercises every mode, combos, queueing and degrade. */
export type DemoStep = { at: number; giftId: string; sender: GiftSender };

const who = (id: string, name: string): GiftSender => ({ id, name, username: id });
const bea = who('bea_reads', 'Bea');
const tomo = who('tomo', 'Tomo');
const priya = who('priya.k', 'Priya');
const dan = who('dan_the_man', 'Dan');
const wren = who('wren', 'Wren');
const ollie = who('ollie', 'Ollie');
const juno = who('juno', 'Juno');

export const DEMO_STEPS: DemoStep[] = [
  // Rail combos: five hearts from Bea, three smiles from Tomo, all inside the 3s window.
  ...[0, 500, 1000, 1500, 2000].map((at) => ({ at, giftId: 'heart', sender: bea })),
  ...[300, 900, 1500].map((at) => ({ at, giftId: 'smile', sender: tomo })),
  // Sparks: a rail card with a puff.
  { at: 1200, giftId: 'warm-mug', sender: priya },
  // Glow (anchored), Burst, Shower and Sunrise land close together: they queue by value.
  { at: 2600, giftId: 'bouquet', sender: dan },
  { at: 3200, giftId: 'campfire', sender: wren },
  { at: 3800, giftId: 'true-north', sender: ollie },
  { at: 4400, giftId: 'sunrise', sender: juno },
  // Ten rapid mixed gifts: queue depth, the 70% window cap, rail overflow.
  { at: 6000, giftId: 'sparkle', sender: bea },
  { at: 6150, giftId: 'tulip', sender: tomo },
  { at: 6300, giftId: 'cupcake', sender: priya },
  { at: 6450, giftId: 'fireworks', sender: dan },
  { at: 6600, giftId: 'palm-tree', sender: wren },
  { at: 6750, giftId: 'main-stage', sender: ollie },
  { at: 6900, giftId: 'mountain-top', sender: juno },
  { at: 7050, giftId: 'lucky-clover', sender: bea },
  { at: 7200, giftId: 'disco-ball', sender: tomo },
  { at: 7350, giftId: 'hype-horn', sender: priya },
];
