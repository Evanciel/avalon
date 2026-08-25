#!/usr/bin/env node
/**
 * Avalon hook gate — the EXECUTOR the installed hook actually runs.
 *
 * Installed as a Stop hook, it runs every gate check when the session tries to end its turn.
 *   exit 0  → all pass. Let the turn end.
 *   exit 2  → a gate is red. Under the Stop-hook contract, 2 BLOCKS and stderr reaches the model.
 *
 * INV-1: this file never calls an LLM. The verdict is the check command's exit code, nothing else.
 *
 * ⚠️ STALE blocks, it does not pass. If hooks.json's spec_hash differs from the current
 *    graph's hash, this spec is enforcing a DIFFERENT graph. Between passing on stale rules
 *    and blocking on stale rules, blocking is the honest one — recompile → reinstall to resolve.
 *
 * ⚠️ Approval pin (--approved) — closes the TOCTOU between approval and execution.
 *    The installer embeds the byte hash of hooks.json AS APPROVED into the settings command.
 *    At run time, if the file differs from that hash — a swapped check, or a whole
 *    consistently-regenerated graph+spec — the gate blocks WITHOUT executing anything (exit 2).
 *    Without this, write access to one file equals the right to run arbitrary commands.
 *
 * Usage
 *   node tools/hooks-gate.mjs <graph.json> <hooks.json> [--approved <sha256:...>] [--timeout <ms>] [--json]
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { specHash, sha256, isMain } from './hash.mjs'
import { t } from './i18n.mjs'

export function runGate(graphPath, hooksPath, { timeout = 60_000, approved = null } = {}) {
  const g = JSON.parse(readFileSync(graphPath, 'utf8'))
  const hooksRaw = readFileSync(hooksPath, 'utf8')
  const spec = JSON.parse(hooksRaw)
  const cwd = dirname(resolve(graphPath))

  // Approval-pin comparison — BEFORE anything runs. Failing here means zero checks execute.
  if (approved) {
    const actual = sha256(hooksRaw)   // returns 'sha256:<64hex>'
    if (actual !== approved) {
      return {
        ok: false, stale: true,
        message: t(
          `🔴 TAMPERED — hooks.json differs from the approved spec.\n` +
          `   approved: ${approved.slice(7, 19)}…  actual: ${actual.slice(7, 19)}…\n` +
          `   checks changed without approval run ZERO times — blocked before execution.\n` +
          `   resolve: review the change, then reinstall: node tools/install-hooks.mjs --yes (re-approval)`,
          `🔴 TAMPERED — hooks.json 이 승인받은 명세와 다르다.\n` +
          `   승인: ${approved.slice(7, 19)}…  지금: ${actual.slice(7, 19)}…\n` +
          `   승인 없이 바뀐 check 는 <하나도 실행하지 않고> 차단한다.\n` +
          `   해소: 변경을 검토한 뒤 node tools/install-hooks.mjs --yes 재설치 (재승인)`),
        results: [],
      }
    }
  }

  const now = specHash(g)
  if (spec.spec_hash !== now) {
    return {
      ok: false, stale: true,
      message: t(
        `🔴 STALE — hooks.json enforces ${spec.spec_hash.slice(7, 19)}… but the graph is now ${now.slice(7, 19)}….\n` +
        `   On stale rules neither pass nor block is honest → block.\n` +
        `   resolve: node tools/compile.mjs → node tools/install-hooks.mjs --yes (reinstall)`,
        `🔴 STALE — hooks.json 은 ${spec.spec_hash.slice(7, 19)}… 를 강제하는데 지금 그래프는 ${now.slice(7, 19)}… 다.\n` +
        `   낡은 명세로는 통과도 차단도 정직하지 않다 → 차단한다.\n` +
        `   해소: node tools/compile.mjs → node tools/install-hooks.mjs --yes 재설치`),
      results: [],
    }
  }

  const results = []
  for (const h of spec.hooks ?? []) {
    let exit = 0
    try {
      execSync(h.check, { cwd, timeout, stdio: 'pipe' })
    } catch (e) {
      // A timeout is a failure too — a gate that could not be judged does not count as passed.
      exit = typeof e.status === 'number' ? e.status : 124
    }
    results.push({ gate: h.gate, check: h.check, exit, pass: exit === (h.expect_exit ?? 0) })
  }
  const failed = results.filter((r) => !r.pass)
  return {
    ok: failed.length === 0, stale: false,
    message: failed.length === 0
      ? t(`🟢 hook gate passed — all ${results.length} checks exit 0`, `🟢 훅 게이트 통과 — ${results.length}개 check 전부 exit 0`)
      : t(`🔴 hook gate failed ${failed.length}/${results.length}:\n`, `🔴 훅 게이트 미달 ${failed.length}/${results.length}:\n`) +
        failed.map((r) => `   ${r.gate}  exit ${r.exit}  ← ${r.check}`).join('\n'),
    results,
  }
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const ti = args.indexOf('--timeout')
  const timeout = ti >= 0 ? Number(args[ti + 1]) : 60_000
  const ai = args.indexOf('--approved')
  const approved = ai >= 0 ? args[ai + 1] : null
  const rest = args.filter((a, i) =>
    a !== '--json' && a !== '--timeout' && a !== '--approved' &&
    (ti < 0 || i !== ti + 1) && (ai < 0 || i !== ai + 1))
  const [graphPath, hooksPath] = rest
  if (!graphPath || !hooksPath) {
    console.error('usage: node tools/hooks-gate.mjs <graph.json> <hooks.json> [--approved <sha256:...>] [--timeout <ms>] [--json]')
    process.exit(2)
  }
  let r
  try { r = runGate(graphPath, hooksPath, { timeout, approved }) }
  catch (e) {
    console.error(t(`🔴 hook gate cannot run: ${e.message} — what cannot be judged is blocked`, `🔴 훅 게이트 실행 불가: ${e.message} — 판정 못 하면 차단한다`))
    process.exit(2)
  }
  if (json) console.log(JSON.stringify(r, null, 2))
  ;(r.ok ? console.log : console.error)(r.message)
  process.exit(r.ok ? 0 : 2)
}
