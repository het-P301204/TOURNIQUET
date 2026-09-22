#!/usr/bin/env node
/**
 * Real screenshots of the running application, for the README.
 *
 * Drives the built app in a real browser and captures each primary screen.
 * Deliberately excluded from `tsconfig.json` and from the lint config,
 * because it imports Playwright and nothing in the test suite, the build or
 * CI needs a browser — pulling browser binaries into every install to
 * generate documentation images would be a poor trade.
 *
 *   npm run build
 *   npx vite preview --port 4173 --strictPort &
 *   npx playwright install chromium     # once
 *   node scripts/screenshots.ts
 *
 * Every shot is taken against the demonstration data, which is synthetic.
 * No real hostname, vulnerability or person appears in any image.
 */

import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * Playwright, resolved at runtime rather than imported.
 *
 * It is deliberately not a dependency: nothing in the test suite, the build
 * or CI needs a browser, and pulling browser binaries into every install to
 * generate documentation images would be a poor trade. Set
 * `TOURNIQUET_PLAYWRIGHT` to a directory containing it, or install it
 * globally, and this script will find it.
 */
const require_ = createRequire(import.meta.url)
const searchPaths = [
  process.env.TOURNIQUET_PLAYWRIGHT,
  join(import.meta.dirname, '..', 'node_modules'),
].filter((x): x is string => typeof x === 'string' && x.length > 0)

let chromium: { launch: (o?: unknown) => Promise<PlaywrightBrowser> }
try {
  const mod = require_(require_.resolve('playwright', { paths: searchPaths })) as {
    chromium: typeof chromium
  }
  chromium = mod.chromium
} catch {
  console.error(
    [
      'Playwright is not installed.',
      '',
      '  npm i -D playwright && npx playwright install chromium',
      '',
      '  # or, without adding it as a dependency:',
      '  npx -y -p playwright node -e 0',
      '  TOURNIQUET_PLAYWRIGHT=<npx cache>/node_modules node scripts/screenshots.ts',
      '',
    ].join(String.fromCharCode(10)),
  )
  process.exit(1)
}

interface PlaywrightPage {
  setViewportSize(s: { width: number; height: number }): Promise<void>
  goto(url: string, o?: unknown): Promise<unknown>
  evaluate(fn: string): Promise<unknown>
  waitForTimeout(ms: number): Promise<void>
  screenshot(o: { path: string; fullPage?: boolean }): Promise<unknown>
  on(event: string, fn: (m: { type: () => string; text: () => string }) => void): void
}
interface PlaywrightBrowser {
  newContext(o?: unknown): Promise<{ newPage(): Promise<PlaywrightPage> }>
  close(): Promise<void>
}

const BASE = process.env.TOURNIQUET_URL ?? 'http://localhost:4173'
const OUT = join(import.meta.dirname, '..', 'docs', 'screenshots')

/** Desktop wide enough for the dense views without being unrepresentative. */
const DESKTOP = { width: 1600, height: 1000 }
const MOBILE = { width: 390, height: 844 }

interface Shot {
  readonly file: string
  readonly view: string
  readonly scenario?: string
  readonly theme?: 'dark' | 'light'
  readonly mobile?: boolean
  readonly fullPage?: boolean
  readonly scrollTo?: number
  /** Run before capture: expand something, switch a mode, click a filter. */
  readonly prepare?: string
}

const SHOTS: readonly Shot[] = [
  { file: '01-command-centre', view: 'Command centre', fullPage: true },
  { file: '02-situation-map', view: 'Command centre', scrollTo: 520 },
  { file: '03-loss-boundary', view: 'Command centre', scrollTo: 1180 },
  { file: '04-evidence-map', view: 'Evidence map' },
  {
    file: '05-evidence-matrix',
    view: 'Evidence map',
    prepare: `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Matrix')?.click()`,
  },
  { file: '06-remediation-plan', view: 'Remediation plan' },
  { file: '07-preservation-sequence', view: 'Preservation sequence' },
  { file: '08-timeline', view: 'Timeline' },
  { file: '09-conflict-centre', view: 'Conflict centre', scenario: 'MFG-DB-11' },
  { file: '10-accepted-loss', view: 'Accepted loss', scenario: 'MFG-DB-11' },
  { file: '11-report', view: 'Report' },
  { file: '12-unknown-impact', view: 'Conflict centre', scenario: 'EDGE-FW-02' },
  { file: '13-light-mode', view: 'Command centre', theme: 'light', scrollTo: 520 },
  { file: '14-mobile', view: 'Command centre', mobile: true, scrollTo: 170 },
]

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  // An explicit binary, when the installed Playwright and the installed
  // browser revisions do not line up -- which is the usual state of a
  // machine that has several tools each carrying their own copy.
  const executablePath = process.env.TOURNIQUET_CHROMIUM
  const browser = await chromium.launch(
    executablePath === undefined || executablePath === '' ? {} : { executablePath },
  )
  // A fixed device scale factor keeps the images crisp on a retina display
  // and keeps their byte size predictable in the repository.
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: DESKTOP })
  const page = await context.newPage()

  page.on('console', (m) => {
    // The dev server's HMR socket is blocked by the page's own CSP; the
    // preview build has no socket, so anything here is worth seeing.
    if (m.type() === 'error') console.warn('  console error:', m.text())
  })

  for (const shot of SHOTS) {
    await page.setViewportSize(shot.mobile ? MOBILE : DESKTOP)
    await page.goto(BASE, { waitUntil: 'networkidle' })

    await page.evaluate(`document.documentElement.setAttribute('data-theme', '${shot.theme ?? 'dark'}')`)

    if (shot.scenario) {
      await page.evaluate(`
        (() => {
          const go = n => [...document.querySelectorAll('nav[aria-label="Views"] button')]
            .find(x => x.textContent.trim().startsWith(n))?.click()
          go('Catalogue & data')
          const s = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(shot.scenario)}))
          if (s) s.click()
        })()
      `)
      await page.waitForTimeout(120)
    }

    await page.evaluate(`
      [...document.querySelectorAll('nav[aria-label="Views"] button')]
        .find(x => x.textContent.trim().startsWith(${JSON.stringify(shot.view)}))?.click()
    `)
    await page.waitForTimeout(160)

    if (shot.prepare) {
      await page.evaluate(shot.prepare)
      await page.waitForTimeout(160)
    }

    if (shot.scrollTo !== undefined) {
      await page.evaluate(`window.scrollTo(0, ${shot.scrollTo})`)
      await page.waitForTimeout(220)
    }

    // Let every width/transform transition settle before the shutter.
    await page.waitForTimeout(260)

    const path = join(OUT, `${shot.file}.png`)
    await page.screenshot({ path, fullPage: shot.fullPage === true })
    console.log(`  ${shot.file}.png`)
  }

  await browser.close()
  console.log(`\n${SHOTS.length} screenshots written to docs/screenshots/`)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exitCode = 1
})
