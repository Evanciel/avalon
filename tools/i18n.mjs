/**
 * Avalon i18n — bilingual console/CLI messages (en default, ko opt-in).
 *
 * Scope rule — the line that keeps determinism intact:
 *   · Console/CLI messages (errors, refusals, verdicts, plans) → t(en, ko).
 *   · Build ARTIFACTS (scaffold skeletons, compiled workflow.js, hooks.json,
 *     rendered graph.md labels) → English, always. Artifacts are hashed and
 *     byte-compared; their bytes must never depend on an environment variable.
 *
 * Language selection (per call, lazy — safe against import order):
 *   1. AVALON_LANG=ko|en wins.
 *   2. System locale starting with "ko" → ko.
 *   3. Otherwise → en.
 *
 * INV-1: pure functions, no LLM, no I/O.
 */

export function lang() {
  const v = (process.env.AVALON_LANG ?? '').trim().toLowerCase()
  if (v === 'ko' || v === 'en') return v
  const sys = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || ''
  if (/^ko/i.test(sys)) return 'ko'
  try {
    if (/^ko/i.test(Intl.DateTimeFormat().resolvedOptions().locale)) return 'ko'
  } catch { /* Intl unavailable → en */ }
  return 'en'
}

/** t('english', '한국어') — picks by lang() at call time. */
export const t = (en, ko) => (lang() === 'ko' ? ko : en)
