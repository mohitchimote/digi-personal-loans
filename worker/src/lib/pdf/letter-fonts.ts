import regular from "../../assets/fonts/Alef-Regular.ttf";
import bold from "../../assets/fonts/Alef-Bold.ttf";

// The Worker bundles these as Data modules (wrangler.toml [[rules]]). Kept in its own file so tests and
// scripts, which run outside the Worker bundler, load the same fonts from disk and never import this.
export const LETTER_FONT_BYTES = { regular, bold };
