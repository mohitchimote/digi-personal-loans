/** GitHub Codespaces' forwarded-port URLs give every port its own hostname
 * (`<codespace-name>-<port>.app.github.dev`) rather than `host:port` - so the
 * gateway's public URL has to be derived by swapping the port segment, not by
 * appending :8080 to the page's own hostname like every other environment. */
function resolveApiBase(): string {
  const host = window.location.hostname;
  const codespaces = host.match(/^(.*)-(\d+)\.app\.github\.dev$/);
  if (codespaces) {
    return `https://${codespaces[1]}-8080.app.github.dev`;
  }
  return `http://${host}:8080`;
}

export const API_BASE = resolveApiBase();
