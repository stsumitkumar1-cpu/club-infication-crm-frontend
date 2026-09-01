import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { ServerResponse } from 'node:http';

/**
 * Config is a function so it can read .env before the server starts.
 *
 * The third argument to loadEnv is the prefix filter: '' loads every variable,
 * not just VITE_-prefixed ones. That is deliberate and safe here — this runs in
 * Node, and nothing read at this level is inlined into the browser bundle. Only
 * `import.meta.env.VITE_*` reaches the client.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const proxyTarget = env.API_PROXY_TARGET?.trim() || 'http://localhost:3000';
  const apiBase = env.VITE_API_BASE_URL?.trim() || '/api';

  /*
   * An absolute VITE_API_BASE_URL means the browser talks to the API directly,
   * so nothing is proxied and a proxy entry would be dead config. Only a
   * same-origin path like /api needs forwarding.
   */
  const needsProxy = apiBase.startsWith('/');
  const proxyPath = needsProxy ? apiBase : null;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: proxyPath
        ? {
            [proxyPath]: {
              target: proxyTarget,
              changeOrigin: true,
              /*
               * Without this, every request made while the API is restarting
               * prints a six-line AggregateError [ECONNREFUSED] stack — one per
               * in-flight call, so a page load spams the terminal with what is
               * really a single fact: the API is not listening. Node tries both
               * ::1 and 127.0.0.1, which is where the "(x6)" comes from.
               *
               * The handler replaces that with one line, and answers the
               * browser with a JSON 503. fetchApi already treats any 5xx as
               * "unreachable" rather than as an auth failure, so the app shows
               * its "server is not responding" banner instead of logging the
               * user out.
               */
              configure(proxy: any) {
                let lastWarnedAt = 0;

                proxy.on(
                  'error',
                  (
                    err: Error & { code?: string },
                    req: { url?: string },
                    res: unknown,
                  ) => {
                    const isDown =
                      err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET';

                    // One warning per second at most: a failed page load fires
                    // many requests, and repeating the line for each buries it.
                    const now = Date.now();
                    if (now - lastWarnedAt > 1000) {
                      lastWarnedAt = now;
                      console.warn(
                        isDown
                          ? `[api proxy] backend not reachable at ${proxyTarget} — start it with "npm run start:dev" in backend/ (${req.url})`
                          : `[api proxy] ${err.code ?? err.message} (${req.url})`,
                      );
                    }

                    // Websocket upgrades hand back a Socket, with no writeHead.
                    const response = res as ServerResponse;
                    if (typeof response?.writeHead !== 'function') {
                      (response as unknown as { destroy?: () => void })?.destroy?.();
                      return;
                    }
                    if (response.headersSent) {
                      response.end();
                      return;
                    }

                    response.writeHead(503, {
                      'Content-Type': 'application/json',
                    });
                    response.end(
                      JSON.stringify({
                        statusCode: 503,
                        message: isDown
                          ? 'The API is not running. Start the backend and try again.'
                          : 'The API could not be reached.',
                      }),
                    );
                  },
                );
              },
            },
          }
        : undefined,
    },
  };
});
