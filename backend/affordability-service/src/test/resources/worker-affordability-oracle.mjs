// Runs the Worker's real affordability calculators (TypeScript, via Node's built-in type stripping)
// over the cases on stdin, so the Java port can be compared with them number for number.
// usage: node worker-affordability-oracle.mjs <path to worker/src/lib/affordability-calc.ts> < cases.json
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const calc = await import(pathToFileURL(process.argv[2]).href);
const input = JSON.parse(readFileSync(0, "utf8"));
const out = {
  personal: input.personal.map((req) => calc.assessPersonalAffordability(req, input.rules)),
  business: input.business.map((req) => calc.assessBusinessAffordability(req)),
};
process.stdout.write(JSON.stringify(out));
