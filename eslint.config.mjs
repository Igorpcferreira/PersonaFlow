import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores(['.next/**', 'src/generated/**', '.local-postgres/**', '.local-tools/**', 'test-results/**', 'playwright-report/**', 'coverage/**', 'next-env.d.ts']),
]);
