# letter-spec

The single source of truth for the **letter engine**: how a letter template, plus the data of one application, becomes the text that is printed, in English and Hebrew. Two engines implement it (the Cloudflare Worker module, which is the reference build, and the Java services, which are production) and both must pass the same conformance vectors. Drawing the PDF is **not** part of the contract: each side uses its own PDF library and draws the engine's output.

| File | What it is |
|---|---|
| `dictionary.sample.json` | A sample data dictionary (`formatVersion` 1) used by the vectors |
| `vectors/formats.json` | How a value prints (numbers, money, dates, terms, choices) |
| `vectors/rules.json` | Rule evaluation against fixed data and a fixed date |
| `vectors/resolve.json` | Whole documents resolved to text, with the audit decisions |

## The pieces

```
template (document)  +  data dictionary  +  saved rules  +  application data  +  issue date
                                  |
                          resolveLetter(input, lang)           <- pure function, the contract
                                  |
              ResolvedLetter { header, body, footer, decisions, missing }
                                  |
                  renderer (pdf-lib in the Worker, iText/PDFBox in Java)  <- not in the contract
```

`resolveLetter` has no clock and no I/O. The issue date (`today`) is an input, so a letter can be rebuilt exactly later for an auditor from the stored template version and data.

## Document

A document has three zones, `header`, `body` and `footer`, each a list of nodes. All text is bilingual (`{ "en": "...", "he": "..." }`) and may contain tokens (below).

| Node | Meaning |
|---|---|
| `heading` | One block of text. `level` 1 to 3 (default 1), `align`, `indent` |
| `paragraph` | One block of text. A `\n` is a line break. `align`, `indent` |
| `list` | Points, each bilingual with an optional `level` 0 to 2. `ordered: true` numbers them (1. 2. 3.; a sub-level restarts), otherwise bullets |
| `table` | Rows of a label and a value |
| `image` | A picture: `imageId` (an uploaded image) or `kind` (a built-in one), with a description |
| `signature` | A signature picture (`imageId`) with a caption |
| `when` | Shows its `children` only when `rule` is met (`rule: null` = always) |
| `repeat` | Shows its `children` once per entry of the list `over`, keeping only entries that meet `where` |
| `alternatives` | Several `variants`, each with a rule; **the first variant whose rule is met is used**. A variant with `rule: null` always matches, so put it last as the "otherwise". If none match, nothing is shown |

Nodes nest: a `when` can sit in a `repeat`, a `repeat` in an `alternatives`, and so on. Inside a `repeat`, `item.<field>` is the current entry.

### Rich text

Text (headings, paragraphs, list items, table cells, captions) can be formatted with `<b>bold</b>`, `<i>italic</i>` and `<u>underline</u>`, nested properly and combinable (`<b><i>both</i></b>`). Nothing else is markup. A literal `&`, `<` or `>` is written `&amp;`, `&lt;`, `&gt;` (a lone `&` that is not one of those entities is read as `&`). A newline is a line break. Tokens (`{{field}}`) are not markup and may sit inside tags: `<b>{{loan.amount}}</b>`.

**A value filled into a token is escaped** (`&` `<` `>` become their entities) so data can never add or break formatting.

Block layout: `align` is `start`, `center` or `end` (start is the left in English, the right in Hebrew; default `start`); `indent` is 0 to 4 steps (a step is 18 pt in the PDF). Both are mirrored in Hebrew. The stored document and the resolved blocks only carry layout fields that differ from the default.

Italic needs an italic face; the Worker's font (Alef) has none, so the PDF slants the letters. A renderer with a real italic face should use it. Bold, italic and underline, alignment, indent, numbering and bullet levels must all be drawn; exact point sizes are the renderer's choice.

## Data dictionary

Everything a letter can use. `fields` maps a dotted path to `{ label, type, fmt?, choices?, itemFields? }`. Types: `text`, `number`, `money`, `percent`, `date`, `bool`, `choice` (with `choices: [{v, en, he}]`), `list` (with `itemFields`). Dates are `YYYY-MM-DD`. A value may also be a bilingual object `{en, he}` (a name from a master, say), which prints in the language asked for and compares as its English text.

Two paths are derived: `<list>.count` (a list's length) and `today` (the issue date). `page.number` and `page.total` are tokens only a renderer can fill (see Resolving).

## Tokens

`{{path}}` or `{{path|format}}`. The value prints as the field's default format, or as `format` when given. Formats: `int`, `dec`, `money`, `money2`, `pct`, `term`, `date`, `yesno`. Defaults by type: number `int`, money `money`, percent `pct`, date `date`, bool `yesno`, choice = its label in the language, text as is.

## Formats

Written out in full so both engines print the same characters. Rounding is half up on the exact value. `₪` is U+20AA.

| Format | English | Hebrew |
|---|---|---|
| `int` | `1,234,567` | same |
| `dec` | two decimals: `1,234.50` | same |
| `money` | `₪150,000` (whole shekels) | `150,000 ₪` |
| `money2` | `₪2,858.34` | `2,858.34 ₪` |
| negative money | `-₪5` | `-5 ₪` |
| `pct` | at least one, at most two decimals: `5.4%`, `5.25%`, `6.0%` | same |
| `term` (months) | `1 year`, `3 years and 6 months`, `5 months`, `1 month` | `שנה`, `שנתיים`, `3 שנים ו-6 חודשים`, `שנה וחודשיים`, `5 חודשים`, `חודש`, `חודשיים` |
| `date` | `13 November 2026` | `13 בנובמבר 2026` |
| `yesno` | `Yes` / `No` | `כן` / `לא` |

Hebrew `term`: 1 and 2 use the singular and the dual (`שנה`/`שנתיים`, `חודש`/`חודשיים`); other counts are `N שנים` / `N חודשים`. The "and" is the prefix ו, joined with a hyphen only before a numeral (`3 שנים ו-6 חודשים`, but `שנה וחודשיים`). The month names are in `formats.ts`/the vectors; the Java engine must use the same table.

A missing value (null, undefined or empty string) prints as nothing.

## Rules

A rule is a `group` (`op: all | any`, optional `not`, `items`), a `condition`, or a `ref` to a saved rule by id. A condition has a `field` (any dictionary path, or `item.<key>` inside a list), an `op`, and for most ops an `rhs`: `{k: "value", v}`, `{k: "field", v: <other path>}` or `{k: "today"}`; `between` uses `v` and `v2`; `in` uses `list`; `withinDays`, `ageAtLeast`, `ageBelow` use a numeric `v`.

| Operators | Meaning |
|---|---|
| `eq`, `ne` | Equal / not equal. Two numbers compare as numbers, booleans as booleans, anything else as exact text |
| `gt`, `gte`, `lt`, `lte`, `between` | Numeric. `between` is inclusive |
| `contains` | Case-insensitive substring |
| `in` | The value is one of `rhs.list` (compared as text) |
| `empty`, `notEmpty` | Missing, empty text, or an empty list |
| `isYes`, `isNo` | The value is the boolean true / false |
| `before`, `after` | Dates, whole days |
| `withinDays` | The date is at most `v` days from the issue date, either side |
| `ageAtLeast`, `ageBelow` | Whole years between a date of birth and the issue date |
| `anyMatch`, `noneMatch` | On a list: some / no entry meets the `nested` group (evaluated with `item.*` for that entry) |

**Missing values.** Any comparison whose value, or the value it is compared with, is missing is **false** (an unknown value never matches), including `ne`. Only `empty`/`notEmpty` look at missingness itself. A missing list counts as an empty list: `anyMatch` is false, `noneMatch` is true.

**Groups.** An empty group is met. `not` flips the result of a group that has items.

**Saved rules.** A `ref` is met when the saved rule it names is met. A `ref` to a rule that does not exist is not met. References nest; evaluation stops at 20 levels deep (not met).

## Resolving

`resolveLetter(input, lang)` walks the three zones in order and returns:

```
{ lang, header[], body[], footer[],
  decisions: [{ nodeId, kind: when|repeat|alternatives, shown, variant?, items? }],
  missing:   [ paths that a token named and that had no value ] }
```

Blocks: `heading` (`text`, `level?`, `align?`, `indent?`), `paragraph` (`text`, `align?`, `indent?`), `list` (`items[]`, `ordered?: true`, `levels?: number[]` parallel to `items`, present only when one is above 0), `table` (`rows[{label, value}]`), `image` (`imageId?`, `kind?`, `alt`), `signature` (`imageId?`, `caption`). Text has every token filled in and keeps its markup (see Rich text). `{{page.number}}` and `{{page.total}}` are left as they are for the renderer.

- `decisions` are recorded in document order for `when`, `repeat` and `alternatives` nodes **outside** repeats (what happened inside a repeat is not recorded per entry). For `alternatives`, `variant` is the zero-based variant used; for `repeat`, `items` is how many entries were shown. The same decisions result for both languages, so the two cannot disagree.
- `missing` is sorted. A letter with anything in `missing` should not be issued.

## Validating

A template is checked against the data dictionary and the saved rules before it can be published. `error` issues block publishing; `warning` issues are shown and allowed. Each issue has a stable `code`, a human message and, where it concerns one block, that block's `nodeId`. Implementations must raise the same codes (`vectors/validate.json`); wording of messages is free. An identical issue (same severity, code, node and message) is reported once.

Errors: `field.unknown` (a token, condition, comparison field or repeat names a path that is not in the dictionary, or an `item.*` key the list does not have), `field.itemOutsideList` (`item.*` outside a repeat or list condition), `text.markup` (a tag left open, closed out of order, repeated while already open, an unknown tag, or a lone `<`; checked per language), `token.formatUnknown`, `token.formatType` (formats allowed: `int dec` on number/money/percent, `money money2` on number/money, `pct` on number/percent, `term` on number, `date` on date, `yesno` on bool), `token.list` (a list printed as a token), `rule.opType` (operators allowed by type: text `eq ne contains in empty notEmpty`; number/money/percent `eq ne gt gte lt lte between empty notEmpty`; date `eq ne before after withinDays ageAtLeast ageBelow empty notEmpty`; bool `isYes isNo empty notEmpty`; choice `eq ne in empty notEmpty`; list `empty notEmpty anyMatch noneMatch`), `rule.valueMissing` (no comparison value; `in` with no list; `between` without two numbers; `withinDays` / `ageAtLeast` / `ageBelow` without a number), `rule.betweenOrder` (first number above second), `rule.choiceUnknown` (a value that is not one of the field's choices), `rule.compareTypes` (field compared with a field of another type; number, money and percent are alike), `rule.nestedNotList`, `rule.refMissing`, `rule.refCycle` (saved rules refer to each other in a loop; also raised once for each saved rule on the loop), `rule.tooDeep` (more than 20 levels), `node.duplicateId`, `repeat.notList`, `image.unknown` (only when the set of known image ids is supplied).

Warnings: `token.pageInBody`, `text.tokensDiffer` (English and Hebrew name different fields), `text.emptyEn` / `text.emptyHe`, `rule.emptyGroup`, `rule.noMatchCondition` (a list match without a condition for the entries), `when.noRule`, `alternatives.empty`, `alternatives.unreachable` (a variant without a condition that is followed by others), `image.missing`.

Saved rules are also checked on their own, so a faulty one is caught before any template uses it.

## Conformance

The vectors are the contract. Each side runs them:

- Worker: `worker/test/letter-vectors.test.ts`.
- `vectors/markup.json`: rich text input -> styled runs `{text, b, i, u}`, or a substring of the error.
- `vectors/validate.json`: each vector is a document (plus optional `savedRules`, `knownImageIds`); `expect` is the sorted list of `severity:code`.
- Java: to be added next to the workflow engine's `VectorsTest`. Expected values were derived by hand from this document, not copied from the Worker's output.

Matching rule in `resolve.json`: every key in `expect` must equal the result; arrays must match in length and order.

## Not in the contract

PDF drawing (fonts, line breaking, page breaks, right-to-left layout, table layout); the editor; storage of templates, versions and images; who writes calculated values into the application data (the backend does, whenever the data they need exists).
