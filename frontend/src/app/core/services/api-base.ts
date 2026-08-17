/** The Cloudflare Worker serves the Angular build and the /api/* routes from the same origin
 * (see worker/wrangler.toml's [assets] + run_worker_first config), so a relative URL always
 * resolves correctly in production. Local `ng serve` reaches the same relative paths via
 * proxy.conf.json, which forwards /api to a locally running `wrangler dev`. No environment
 * detection needed — this used to branch on hostname (localhost / GitHub Codespaces / other)
 * when the backend was a separately-hosted Java API gateway. */
export const API_BASE = '';
