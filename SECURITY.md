# Security

TOURNIQUET is an offline planning tool. It has no server, no account, no
storage and no network capability. That shape removes most of the attack
surface a web application normally has, and it concentrates what remains into
two places: **the plan you paste in**, and **the report it produces**.

This document describes what the tool assumes, what it defends against, what
it does not, and how to report something.

---

## Threat model

### What the tool is trusted with

A remediation plan for a real asset. In practice that means a hostname, a
vulnerability reference, timings, and — in the accepted-loss records — free
text about an incident and the name of the person who made a decision about
it. It is not classified material, but it is the kind of thing an
organisation would not want relayed anywhere.

**The tool relays it nowhere.** It cannot: see *Local processing* below.

### Trust boundaries

```
┌─ the operator ──────────────────────────────────────────────┐
│                                                             │
│   a plan they wrote, or a report export they were sent      │
│                            │                                │
│                            ▼   ← TRUST BOUNDARY             │
│   ┌─ the page ──────────────────────────────────────────┐   │
│   │  parsePlan()   coerce, bound, strip                 │   │
│   │      │                                              │   │
│   │      ▼                                              │   │
│   │  analyse()     pure; no DOM, no clock, no network   │   │
│   │      │                                              │   │
│   │      ▼   ← TRUST BOUNDARY                           │   │
│   │  toHtml / toMarkdown / toJson   escape per format   │   │
│   └─────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│   a file on their disk, which will end up in a ticket       │
└─────────────────────────────────────────────────────────────┘
```

Two boundaries, and the same data crosses both. Everything a plan contains is
hostile on the way in and hostile again on the way out, because the document
produced from it is going to be opened by somebody else.

### What is out of scope

- **The browser.** A compromised browser or a malicious extension can read
  anything on the page. Nothing here defends against that.
- **The operator's own machine.** Downloaded reports are ordinary files.
- **Whoever you send a report to.** The HTML report is inert and scriptless,
  but the tool has no say in what happens after you attach it to an email.
- **The correctness of the action library.** A wrong mapping is a
  documentation defect, not a vulnerability. See
  [the limitations](README.md#limitations).

---

## Local processing

The analysis runs in the page. Nothing is uploaded, and nothing is stored —
reload the tab and it is gone. There is no telemetry, no analytics, no error
reporting and no third-party script of any kind.

That claim is enforced three ways rather than asserted once:

| | |
| --- | --- |
| **Browser** | The page ships a `Content-Security-Policy` with `default-src 'none'` and `connect-src 'none'`. The browser refuses any outbound request, whatever the code tries to do. |
| **Lint** | `eslint.config.js` bans `fetch`, `document`, `window` and `localStorage` inside `src/engine` and `src/domain`. |
| **Build** | [`scripts/assert-claims.ts`](scripts/assert-claims.ts) scans the built bundle for `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon`, and fails the build if it finds one. It runs in `npm run verify`. |

The only browser storage used is a single `localStorage` key,
`tourniquet-theme`, holding the string `dark` or `light`. No plan data is
persisted anywhere.

The full CSP:

```
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
font-src 'self' data:; img-src 'self' data:; connect-src 'none';
form-action 'none'; base-uri 'none'; object-src 'none'
```

`style-src 'unsafe-inline'` is required because the interface sets computed
inline styles — a meter's width, a bar's position on the timeline, the offset
of the loss boundary. Those are numbers produced by the analysis, never text
taken from a loaded plan.

`frame-ancestors` is deliberately absent: a browser ignores it in a `meta`
element, so claiming it there would be theatre. If you host this, send it as a
response header, along with `X-Content-Type-Options: nosniff` and
`Referrer-Policy: no-referrer`.

---

## Input validation

Every plan is treated as hostile. [`parsePlan`](src/state.ts) does not spread
the parsed JSON into application state; it reads each field by name and
coerces it. That is more code than a spread, and it is the only way to know
what the resulting object contains.

| Risk | What is done |
| --- | --- |
| **Prototype pollution** | The plan is built field by field. A `__proto__` or `constructor` key in the input is never read and never copied. Asserted in [`hostile.test.ts`](src/engine/hostile.test.ts). |
| **Type confusion** | Every field is coerced to its declared type with a documented fallback. An object where a string belongs does not become `[object Object]`; it becomes the fallback. |
| **Unbounded input** | Input is capped at 2 MB before parsing, arrays at 500 elements, and individual strings at 4 000 characters. |
| **Invalid enums** | Checked against their member list rather than cast. An unrecognised value falls back rather than flowing into a `Record` lookup that would return `undefined` and crash a view elsewhere. |
| **Invisible characters** | Bidirectional overrides, zero-width characters, soft hyphens and C0/C1 controls are **stripped** at the boundary. Escaping does not help with these: they are not markup, they reorder rendered text while leaving the bytes intact. |
| **Unknown asset type** | Refused with a message naming the value and listing what is allowed. |
| **Forged provenance** | `tier.external` is forced to `true`. The type says a remediation tier always comes from outside this tool, and an import must not be able to assert otherwise. |
| **Smuggled content** | Unrecognised keys are dropped rather than carried through into the JSON export, so the tool cannot be used to relay arbitrary content inside somebody's incident ticket. |

An unrecognised `action_id` is **deliberately allowed through**. The engine
represents it as a step with uncharacterised impact, which is more useful than
refusing the file — rejecting it would push the operator towards deleting the
step, and the step nobody understands is exactly the one worth keeping.

---

## Report generation

Reports are generated in the page from a `Blob` and an object URL. There is no
server round trip.

All operator-supplied text passes through [`src/domain/text.ts`](src/domain/text.ts)
on the way out, with a different function per format:

- **HTML** — the five standard entities including the apostrophe. The output
  is a single self-contained file with no scripts, no external references and
  its own restrictive CSP, because its realistic end is an email attachment.
- **Markdown** — pipes escaped and newlines flattened inside table cells. An
  unescaped `|` in a hostname does not break a table; it silently forges a
  column, and every cell after it shifts left. A reader then sees a
  well-formed table with the wrong values in it, which is worse than a broken
  one.
- **Prose** — only line-leading block characters are escaped. Backslashing
  every metacharacter in a paragraph of English produces unreadable output.

[`hostile.test.ts`](src/engine/hostile.test.ts) runs thirteen payloads —
script tags, attribute breaks, `javascript:` URLs, path traversal, template
literals, SVG handlers, markdown structure breaks, bidi overrides, zero-width
characters, null bytes, double-encoded entities — through every field of a
plan and asserts, for each of the three formats, that nothing executable
survives and that no structure can be forged.

---

## Dependency security

Five production dependencies: `react`, `react-dom`, and three `@fontsource`
packages. No UI framework, no chart library, no icon package, no date library,
no markdown renderer.

That is a deliberate constraint rather than an accident. Every chart, every
icon and every piece of layout in this project is hand-written, because a
dependency added for decoration is a supply-chain surface accepted for
decoration.

```bash
npm audit          # 0 vulnerabilities at the time of writing
npm ls --omit=dev  # the complete production tree
```

Nothing is fetched at runtime: the fonts are bundled, and `connect-src 'none'`
would refuse a CDN even if one were referenced.

---

## Secrets

There are none, and there is nowhere to put one. The tool has no
configuration, no environment variables, no API keys and no credentials of any
kind. There is no `.env` and no `.env.example`, because there is nothing to
configure.

All demonstration data is synthetic. Every hostname, vulnerability reference,
person and timestamp in [`src/data/scenarios.ts`](src/data/scenarios.ts) is
invented; no vendor advisory, CVE record or real incident is reproduced.

---

## Reporting a vulnerability

Open an issue describing what you found and how to reproduce it. If you would
rather not do that in public, use GitHub's private vulnerability reporting on
the repository's Security tab.

This is a personal project rather than a supported product, so there is no
service-level commitment. What I will do is acknowledge the report, say
plainly whether I agree it is a vulnerability, and fix it or explain why not.

Please do not test against anything that is not your own copy.

---

## What this document does not claim

- Not audited by anyone.
- Not penetration tested beyond the adversarial test suite in this repository.
- Not a guarantee. The defences above are the ones I could think of and could
  assert in a test; that is a different thing from an absence of flaws.
