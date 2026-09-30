import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { pageTitle } from '@/config/brand';
import { brand, palettes } from '@/lib/theme';

const { dark, light } = palettes;

// Web-only document shell (static rendering). Global CSS lives here so the very first
// paint is already dark and focus rings are consistent on every element.
const css = `
body { background-color: ${dark.bg}; margin: 0; }
:focus-visible { outline: 2px solid ${dark.focus} !important; outline-offset: 2px; }
::selection { background: ${brand.pink}; color: ${dark.onPrimary}; }
/* Reels feed: one page per snap point (FlashList cells are absolutely positioned, so mark the pages themselves). */
[data-reels] { scroll-snap-type: y mandatory; }
[data-reels] [data-reel-page] { scroll-snap-align: start; scroll-snap-stop: always; }
/* Touch screens: the feed pages in JS (useWebTouchPager) so every swipe lands on one whole reel. */
@media (pointer: coarse) { [data-reels] { scroll-snap-type: none; overscroll-behavior-y: contain; } }
@media (prefers-color-scheme: light) {
  body { background-color: ${light.bg}; }
  :focus-visible { outline-color: ${light.focus} !important; }
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="color-scheme" content="dark light" />
        <meta name="theme-color" content={dark.bg} />
        <title>{pageTitle()}</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
