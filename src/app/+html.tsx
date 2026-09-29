import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Web-only document shell (static rendering). Global CSS lives here so the very first
// paint is already dark and focus rings are consistent on every element.
const css = `
body { background-color: #0B0A0D; margin: 0; }
:focus-visible { outline: 2px solid #FF6FB5 !important; outline-offset: 2px; }
::selection { background: #FF6FB5; color: #1A0710; }
@media (prefers-color-scheme: light) {
  body { background-color: #FFF8FB; }
  :focus-visible { outline-color: #8C1240 !important; }
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
        <meta name="theme-color" content="#0B0A0D" />
        <title>Smiley</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
