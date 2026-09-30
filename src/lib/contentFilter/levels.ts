/**
 * The viewer side of the speech dial: what a person sees for a stored message.
 *
 *   effective level = min(room level, viewer level), and never above Standard for a minor.
 *
 * A message at or below the effective level is shown. Above it:
 *   - a message that is Standard ONLY because it swears is shown to a Family viewer with the swears
 *     masked (***), not hidden;
 *   - anything else is hidden behind "Hidden by your settings · Show". Only adults get Show.
 *     Minors never receive rows above Standard at all (the database's SELECT policies), so for
 *     them this is belt and braces.
 */
import { maskProfanity } from './profanity.ts';
import { stageA } from './stageA.ts';
import { LEVEL_RANK, MINOR_MAX_LEVEL, minLevel, type SpeechLevel } from './types.ts';

export function effectiveLevel(room: SpeechLevel, viewer: SpeechLevel, viewerIsAdult: boolean): SpeechLevel {
  const lvl = minLevel(room, viewer);
  return viewerIsAdult ? lvl : minLevel(lvl, MINOR_MAX_LEVEL);
}

/** The highest level a person may pick for themselves (minors: Standard). */
export function allowedLevels(isAdult: boolean): SpeechLevel[] {
  return isAdult ? ['family', 'standard', 'open', 'max'] : ['family', 'standard'];
}

export type ViewerDisplay =
  | { mode: 'show'; text: string }
  | { mode: 'masked'; text: string }
  | { mode: 'hidden'; canReveal: boolean };

/** True when swearing is the only thing keeping `text` above Family. */
export function onlySwearing(text: string): boolean {
  const a = stageA(text, { surface: 'comment' });
  return a.reasons.length > 0 && a.reasons.every((r) => r.code === 'profanity');
}

export function displayFor(
  text: string,
  requiredLevel: SpeechLevel,
  effective: SpeechLevel,
  viewerIsAdult: boolean,
): ViewerDisplay {
  if (LEVEL_RANK[requiredLevel] <= LEVEL_RANK[effective]) return { mode: 'show', text };
  if (requiredLevel === 'standard' && effective === 'family' && onlySwearing(text)) {
    return { mode: 'masked', text: maskProfanity(text) };
  }
  return { mode: 'hidden', canReveal: viewerIsAdult };
}
