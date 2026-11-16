// Refuses to touch the STABLE deployment (digibank-personal-loans / DB "digibank") unless the
// working tree is a clean, pushed `master`. New work deploys to loans2 only (npm run deploy:dev2).
import { execSync } from 'node:child_process';

const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fail = (m) => { console.error(`\n✖ Stable deploy blocked: ${m}\n  New work goes to loans2: npm run deploy:dev2\n`); process.exit(1); };

try { sh('git fetch origin master --quiet'); } catch { fail('could not reach origin to verify master'); }
const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'master') fail(`on branch "${branch}", stable deploys run from master only`);
if (sh('git status --porcelain --untracked-files=no')) fail('uncommitted changes in the working tree');
if (sh('git rev-parse HEAD') !== sh('git rev-parse origin/master')) fail('local master differs from origin/master (push or pull first)');
console.log(`✔ Stable guard passed: master @ ${sh('git rev-parse --short HEAD')}`);
