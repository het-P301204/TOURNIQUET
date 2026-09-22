/**
 * TOURNIQUET design system.
 *
 * Every colour is stored as a space-separated RGB triplet on a CSS custom
 * property so that Tailwind's `/opacity` modifier keeps working and so that
 * the light theme is a genuine re-specification rather than an inversion.
 * The triplets live in `src/index.css`; nothing here hardcodes a colour.
 *
 * Two axes of colour, kept strictly apart.
 *
 * ROLE -- what a thing is:
 *
 *   accent   blue     the product's own voice, and the primary action
 *   link     cyan     a relationship: this action reaches that artifact
 *   time     gold     the clock, and pressure from it
 *
 * FATE -- what happens to a piece of evidence:
 *
 *   preserved   emerald  captured before anything touched it
 *   degraded    orange   still there, but a step altered it
 *   lost        red      destroyed before it could be captured
 *   unknown     violet   the plan does not say what happens to it
 *   retained    slate    nothing in the plan touches it; still on the system
 *
 * `unknown` is a hue rather than a grey on purpose. A greyed-out row reads as
 * "not applicable"; the whole product depends on the reader understanding that
 * an unknown impact is an open question about their own remediation, not the
 * absence of one.
 */

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'rgb(var(--surface-0) / <alpha-value>)',
          1: 'rgb(var(--surface-1) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
          3: 'rgb(var(--surface-3) / <alpha-value>)',
          4: 'rgb(var(--surface-4) / <alpha-value>)',
          inset: 'rgb(var(--surface-inset) / <alpha-value>)',
        },
        line: {
          1: 'rgb(var(--line-1) / <alpha-value>)',
          2: 'rgb(var(--line-2) / <alpha-value>)',
          3: 'rgb(var(--line-3) / <alpha-value>)',
        },
        ink: {
          0: 'rgb(var(--ink-0) / <alpha-value>)',
          1: 'rgb(var(--ink-1) / <alpha-value>)',
          2: 'rgb(var(--ink-2) / <alpha-value>)',
          3: 'rgb(var(--ink-3) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          strong: 'rgb(var(--accent-strong) / <alpha-value>)',
          dim: 'rgb(var(--accent-dim) / <alpha-value>)',
        },
        /* Role hues. `link` is a relationship; `time` is the clock. */
        link: 'rgb(var(--link) / <alpha-value>)',
        time: 'rgb(var(--time) / <alpha-value>)',
        preserved: 'rgb(var(--state-preserved) / <alpha-value>)',
        degraded: 'rgb(var(--state-degraded) / <alpha-value>)',
        lost: 'rgb(var(--state-lost) / <alpha-value>)',
        unknown: 'rgb(var(--state-unknown) / <alpha-value>)',
        retained: 'rgb(var(--state-retained) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Space Grotesk Variable"', '"Space Grotesk"', '"Inter Variable"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.034em',
        tighter: '-0.026em',
        tight: '-0.016em',
        wide: '0.08em',
        wider: '0.12em',
        widest: '0.2em',
      },
      fontSize: {
        // A tight, deliberate scale. Line heights are set for dense technical
        // reading: generous under 14px where scanning happens, tighter above.
        // Display sizes carry progressively more negative tracking, which is
        // what keeps a large heading from looking like body text that grew.
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0.01em' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.4375rem' }],
        md: ['0.9375rem', { lineHeight: '1.5rem' }],
        lg: ['1.0625rem', { lineHeight: '1.6rem' }],
        xl: ['1.375rem', { lineHeight: '1.7rem', letterSpacing: '-0.018em' }],
        '2xl': ['1.8125rem', { lineHeight: '2.1rem', letterSpacing: '-0.026em' }],
        '3xl': ['2.375rem', { lineHeight: '2.6rem', letterSpacing: '-0.03em' }],
        '4xl': ['3.25rem', { lineHeight: '3.375rem', letterSpacing: '-0.036em' }],
        // The countdown on the command centre. Nothing else uses it.
        clock: ['3rem', { lineHeight: '1', letterSpacing: '-0.038em' }],
      },
      spacing: {
        // 8px rhythm, with the half-steps that dense UI actually needs.
        1: '0.25rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
        16: '4rem',
        20: '5rem',
        24: '6rem',
      },
      /* Softer than the first pass throughout. A 3px corner on a dense
         technical panel reads as "unstyled"; these are round enough to feel
         deliberate and still square enough that a table inside one does not
         look like it is sitting in a pill. */
      borderRadius: {
        sm: '5px',
        DEFAULT: '8px',
        md: '11px',
        lg: '16px',
        xl: '22px',
      },
      boxShadow: {
        hair: '0 1px 0 0 rgb(var(--line-1) / 1)',
        raise:
          '0 1px 2px rgb(0 0 0 / var(--shadow-alpha-1)), 0 0 0 1px rgb(var(--line-1) / 1)',
        // Panels lift off the page by a hair. Enough to read as layered, far
        // short of the drop shadows that make a dashboard look like a deck.
        panel:
          '0 1px 1px rgb(0 0 0 / calc(var(--shadow-alpha-1) * 0.35)), 0 4px 16px -12px rgb(0 0 0 / var(--shadow-alpha-1))',
        pop: '0 20px 56px -20px rgb(0 0 0 / var(--shadow-alpha-2)), 0 0 0 1px rgb(var(--line-2) / 1)',
        drawer: '-28px 0 72px -28px rgb(0 0 0 / var(--shadow-alpha-2))',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        inout: 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      transitionDuration: {
        90: '90ms',
        140: '140ms',
        220: '220ms',
        380: '380ms',
      },
      keyframes: {
        'stage-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'drawer-in': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'sheet-in': {
          from: { opacity: '0', transform: 'translateY(100%)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.97) translateY(-4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        // The signature motion: the loss boundary sweeping across the evidence
        // layers as the reader scrubs the plan.
        'boundary-settle': {
          from: { opacity: '0.35' },
          to: { opacity: '1' },
        },
        // An evidence bar that has just crossed the boundary. It does not fade
        // out -- it is struck through, because the artifact did not become
        // less visible, it stopped existing.
        sever: {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        // Unknown impact does not resolve. It breathes and never settles.
        waver: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.9' },
        },
        'dash-drift': { to: { strokeDashoffset: '-16' } },
        sweep: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(300%)' } },
      },
      animation: {
        'stage-in': 'stage-in 380ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'drawer-in': 'drawer-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'sheet-in': 'sheet-in 260ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 140ms linear both',
        'pop-in': 'pop-in 140ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'boundary-settle': 'boundary-settle 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        sever: 'sever 260ms cubic-bezier(0.65, 0, 0.35, 1) both',
        waver: 'waver 2.4s ease-in-out infinite',
        'dash-drift': 'dash-drift 1.4s linear infinite',
        sweep: 'sweep 1.5s cubic-bezier(0.65, 0, 0.35, 1) infinite',
      },
    },
  },
  plugins: [],
}
