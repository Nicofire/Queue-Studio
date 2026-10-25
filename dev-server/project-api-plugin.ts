import type { PluginOption } from 'vite';

import { handleAutomatic1111Request } from './automatic1111-api.ts';
import { handleCategorysRequest } from './categorys-api.ts';
import { handleConfigFilesRequest } from './config-files-api.ts';
import { handleGenerationRequest } from './generation-api.ts';

export function createProjectApiPlugin(projectRoot: string): PluginOption {
  return {
    name: 'config-json-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = req.url ?? '';
        const parsedUrl = new URL(requestUrl, 'http://localhost');

        if (await handleAutomatic1111Request(req, res, parsedUrl)) {
          return;
        }

        if (await handleCategorysRequest(req, res, parsedUrl, projectRoot)) {
          return;
        }

        if (await handleConfigFilesRequest(req, res, requestUrl, projectRoot)) {
          return;
        }

        if (await handleGenerationRequest(req, res, parsedUrl, projectRoot)) {
          return;
        }

        next();
      });
    },
  };
}
