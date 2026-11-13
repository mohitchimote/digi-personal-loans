// The rich text inside letter text: <b>bold</b>, <i>italic</i>, <u>underline</u>, nested properly, with
// &amp; &lt; &gt; for a literal & < >. A newline is a line break. Tokens ({{field}}) are not markup and pass
// through untouched. Written up in letter-spec/README.md ("Rich text"); the Java side implements the same.

export interface Run { text: string; b: boolean; i: boolean; u: boolean }
export interface Parsed { runs: Run[]; error?: string }

const TAG = /^<(\/?)([biu])>/;
const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">" };

/** Splits text into styled runs. On a problem (a tag left open, closed out of order, an unknown tag, a lone `<`) it stops and says what. */
export function parseMarkup(input: string): Parsed {
  const runs: Run[] = [];
  const open: string[] = [];
  const style = { b: false, i: false, u: false };
  let buf = "";
  const flush = () => { if (buf) { runs.push({ text: buf, ...style }); buf = ""; } };
  for (let k = 0; k < input.length; ) {
    const ch = input[k];
    if (ch === "<") {
      const m = TAG.exec(input.slice(k, k + 4));
      if (!m) return { runs, error: `"<" must be written &lt; unless it starts <b>, <i> or <u> (near "${input.slice(k, k + 12)}")` };
      flush();
      const name = m[2] as "b" | "i" | "u";
      if (m[1]) {
        if (open[open.length - 1] !== name) return { runs, error: `</${name}> does not match the tag that is open` };
        open.pop(); style[name] = false;
      } else {
        if (style[name]) return { runs, error: `<${name}> is already open` };
        open.push(name); style[name] = true;
      }
      k += m[0].length;
    } else if (ch === "&") {
      const e = /^&(amp|lt|gt);/.exec(input.slice(k, k + 5));
      if (e) { buf += ENTITIES[e[0]]; k += e[0].length; } else { buf += "&"; k++; }
    } else { buf += ch; k++; }
  }
  flush();
  if (open.length) return { runs, error: `<${open[open.length - 1]}> is never closed` };
  return { runs };
}

/** The text with all markup removed, for length and emptiness checks. */
export const plainText = (input: string): string => parseMarkup(input).runs.map((r) => r.text).join("");
