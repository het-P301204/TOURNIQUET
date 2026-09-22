/**
 * Turning operator-supplied strings into safe output.
 *
 * Every report TOURNIQUET produces interpolates text the operator typed —
 * hostnames, decision records, override reasons, the name of whoever accepted
 * a loss. All three output formats need different protection, and getting one
 * of them wrong produces a document that lies about its own contents.
 *
 * **Bidirectional control characters are stripped first, for every format.**
 * A right-to-left override embedded in an asset name reorders the *rendered*
 * text without changing the bytes, so a decision record can be made to read
 * as its own opposite in a viewer while surviving any amount of HTML
 * escaping. Escaping does not help, because these characters are not markup;
 * they have to be removed. The same applies to the other invisible formatting
 * characters — zero-width joiners and friends — which are used to make two
 * different identifiers render identically.
 *
 * **Markdown table cells need the pipe escaped.** An unescaped `|` in a
 * hostname does not break the table: it silently forges an extra column, and
 * every cell after it shifts left. A reader sees a well-formed table with the
 * wrong values in it, which is worse than a broken one.
 *
 * **HTML needs the five standard entities**, including the apostrophe, since
 * attribute values in the generated report use single quotes in places.
 *
 * The functions are applied at the generator, not at the parser, and the
 * generator is the only place they are applied — a string that has been
 * through `escapeHtml` must not then be put through `escapeCell`, because the
 * result would be double-escaped and visibly wrong.
 */

/**
 * Explicit bidirectional formatting and invisible joiners.
 *
 * Listed individually rather than matched by Unicode category, because the
 * category `Cf` also contains characters that are legitimately part of text in
 * several scripts, and removing those would corrupt names rather than protect
 * them.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g

/** C0 and C1 control characters, except tab, newline and carriage return. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

/**
 * The first thing done to any operator-supplied string, in every format.
 *
 * Removal rather than replacement: a visible placeholder would be a second
 * thing to get wrong, and these characters carry no meaning that a reader of
 * a forensic report needs.
 */
export function stripInvisible(input: string): string {
  return input.replace(INVISIBLE, '').replace(CONTROL, '')
}

export function escapeHtml(input: string): string {
  return stripInvisible(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * A string safe to place inside a markdown table cell.
 *
 * Newlines become spaces as well as the pipe being escaped: a literal newline
 * ends the row, which forges a whole extra row rather than a single cell.
 */
export function escapeCell(input: string): string {
  return stripInvisible(input).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim()
}

/**
 * A string safe to place in markdown prose.
 *
 * Deliberately lighter than `escapeCell`. Backslash-escaping every markdown
 * metacharacter in a paragraph of English produces unreadable output, and the
 * characters that actually matter in prose are the ones that can start a block
 * at the beginning of a line.
 */
export function escapeProse(input: string): string {
  return stripInvisible(input).replace(/^([#>\-*+]|\d+\.)/gm, '\\$1')
}

/** A value safe to appear inside a fenced code block. */
export function escapeFence(input: string): string {
  return stripInvisible(input).replace(/```/g, "'''")
}

/**
 * Truncate for a fixed-width column without cutting mid-surrogate.
 *
 * `slice` on a string containing an emoji or any other astral character can
 * split a surrogate pair and produce a lone half, which renders as a
 * replacement glyph and, in a JSON export, is not valid UTF-8.
 */
export function truncate(input: string, max: number): string {
  const chars = [...input]
  if (chars.length <= max) return input
  return `${chars.slice(0, Math.max(0, max - 1)).join('')}…`
}

/** Title Case for a snake_case or kebab-case identifier. */
export function humanise(id: string): string {
  const words = id.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
