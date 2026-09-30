const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

const COLOR_MESSAGE =
  'No color literals outside src/lib/theme.ts. Add a token there (see DESIGN.md, "Adding a token") and read it via useTheme().';

module.exports = defineConfig([
  expoConfig,
  prettier,
  { ignores: ['dist/*', '.expo/*', 'supabase/*', 'lib/*'] },
  {
    // Every color lives in the theme. Hex and rgb()/rgba() strings are errors everywhere else.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/theme.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Literal[value=/^#[0-9a-f]{3,8}$/i]', message: COLOR_MESSAGE },
        { selector: 'Literal[value=/^rgba?\\(/i]', message: COLOR_MESSAGE },
        { selector: 'TemplateElement[value.raw=/^#[0-9a-f]{3,8}$/i]', message: COLOR_MESSAGE },
        { selector: 'TemplateElement[value.raw=/^rgba?\\(/i]', message: COLOR_MESSAGE },
      ],
      // Screens use the <Text variant> primitive, never the raw React Native Text.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text'],
              message:
                "Use <Text variant=...> from '@/components/ui' (src/components/ui/Text.tsx).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/ui/Text.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
