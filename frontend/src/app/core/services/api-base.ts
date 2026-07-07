/** Resolve the API gateway base URL for the current environment.
 *
 * - localhost: hit the gateway directly on :8080
 * - GitHub Codespaces: swap the port segment in the forwarded-port hostname
 * - Anywhere else (ngrok, etc.): use a relative URL so the Angular dev-server
 *   proxy (proxy.conf.json → /api → localhost:8080) handles the routing,
 *   meaning only a single tunnel/port needs to be exposed. */
function resolveApiBase(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `http://${host}:8080`;
  }
  const codespaces = host.match(/^(.*)-(\d+)\.app\.github\.dev$/);
  if (codespaces) {
    return `https://${codespaces[1]}-8080.app.github.dev`;
  }
  return '';
}

export const API_BASE = resolveApiBase();
