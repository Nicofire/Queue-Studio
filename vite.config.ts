import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { createProjectApiPlugin } from './dev-server/project-api-plugin.ts';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  root: PROJECT_ROOT,
  plugins: [react(), createProjectApiPlugin(PROJECT_ROOT)],
});
