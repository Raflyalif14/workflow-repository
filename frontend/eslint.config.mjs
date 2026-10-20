import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });
export default [
  { ignores: ['.next/**', 'out/**', 'public/vendor/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals'),
  // Hook unit tests deliberately supply a mock dispatcher outside React render.
  // Keep the rule enabled for all production source.
  { files: ['src/**/*.test.ts', 'src/**/*.test.tsx'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
];
