#!/usr/bin/env node
/**
 * Avalon hook installer — wires the build/hooks.json spec into the PROJECT's
 * .claude/settings.json as a Stop hook. This is the resolution path for X3.
 *
 * Approval boundaries this tool enforces:
 *   1. Writes nothing without `--yes`. Shows the plan and exits 3 (awaiting approval).
 *      An agent may run this tool, but must never add --yes without the user's say-so.
 *   2. Refuses the global ~/.claude/settings.json even with --yes. Hook checks are
 *      project-relative paths, and silently rewiring the whole session's enforcement
 *      layer is exactly the kind of thing this project exists to prevent.
 *   3. Refuses a stale spec — hooks.json whose spec_hash differs from the current graph.
 *   4. Leaves other people's hooks alone — the merge replaces/removes only OUR entries
 *      (commands containing hooks-gate.mjs). Reinstall is idempotent.
 *
 * 🔒 Approval pinning (TOCTOU defense): the byte hash of hooks.json at approval time
 *    is embedded into the installed command (--approved sha256:…). If the file changes
 *    in any way afterwards, the gate blocks BEFORE executing a single check.
 *
 * 🧪 Probe verification (counter-oracle): a hook entry may declare `probe` — a command
 *    that constructs/targets a known-bad state and therefore MUST exit non-zero.
 *    An oracle that cannot fail is decoration; if a declared probe exits 0, install is
 *    refused. Probes run during plan and install (declared by the project itself, same
 *    trust class as the checks they exercise). Missing probes are reported, not refused.
 *
 * INV-1: never calls an LLM.
 *
 * Usage
 *   node tools/install-hooks.mjs <graph.json> <hooks.json>            # plan only (exit 3)
 *   node tools/install-hooks.mjs <graph.json> <hooks.json> --yes      # install (after user approval)
 *   node tools/install-hooks.mjs <graph.json> <hooks.json> --uninstall --yes
 *   node tools/install-hooks.mjs <graph.json> <hooks.json> --status   # read-only report
 *   [--settings <path>]  default: <graph dir>/.claude/settings.json
 *
 * Exit codes: 0 ok · 1 refused · 2 usage / would-block · 3 awaiting approval / not installed
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, resolve, join, relative } from 'node:path'
import { homedir } from 'node:os'
import { specHash, sha256, isMain } from './hash.mjs'
import { hookLoss } from './compile.mjs'
import { t } from './i18n.mjs'

const MARK = 'hooks-gate.mjs'   // ownership marker — only commands containing this are ours

const norm = (p) => resolve(p).replace(/\\/g, '/')

/**
 * Run every declared probe. A probe proves the oracle CAN fail: it must exit != 0.
 *   verified: true  → probe ran and exited non-zero (oracle demonstrably able to fail)
 *   verified: false → probe exited 0 (oracle cannot fail = decoration) or never finished
 *   probe: null     → no probe declared (nothing proven, nothing refused)
 */
export function verifyProbes(spec, projDir, { timeout = 60_000 } = {}) {
  const results = []
  for (const h of spec.hooks ?? []) {
    if (typeof h.probe !== 'string' || !h.probe.trim()) {
      results.push({ gate: h.gate, probe: null, exit: null, verified: false })
      continue
    }
    let exit
    try { execSync(h.probe, { cwd: projDir, timeout, stdio: 'pipe' }); exit = 0 }
    catch (e) { exit = typeof e.status === 'number' ? e.status : null }   // null = timeout/killed
    results.push({ gate: h.gate, probe: h.probe, exit, verified: exit !== null && exit !== 0 })
  }
  return results
}

export function plan(graphPath, hooksPath, { settingsPath, probeTimeout = 60_000 } = {}) {
  const g = JSON.parse(readFileSync(graphPath, 'utf8'))
  const hooksRaw = readFileSync(hooksPath, 'utf8')
  const spec = JSON.parse(hooksRaw)
  const projDir = dirname(resolve(graphPath))
  const settings = norm(settingsPath ?? join(projDir, '.claude', 'settings.json'))

  // Boundary 2 — global install refused
  const globalSettings = norm(join(homedir(), '.claude', 'settings.json'))
  if (settings === globalSettings) {
    throw new Error(t(
      'global install refused — ~/.claude/settings.json is out of scope for this tool. Install to the project\'s .claude/settings.json only',
      '전역 설치 거부 — ~/.claude/settings.json 은 이 도구의 범위 밖이다. 프로젝트 .claude/settings.json 에만 설치한다'))
  }
  // Boundary 3 — stale spec refused
  const now = specHash(g)
  if (spec.spec_hash !== now) {
    throw new Error(t(
      `stale spec refused — hooks.json is for ${spec.spec_hash.slice(7, 19)}… but the graph is ${now.slice(7, 19)}…. Recompile first: node tools/compile.mjs`,
      `낡은 명세 거부 — hooks.json 은 ${spec.spec_hash.slice(7, 19)}… 인데 그래프는 ${now.slice(7, 19)}… 다. 재컴파일부터: node tools/compile.mjs`))
  }
  // Completeness — with hook_loss > 0 this spec has no right to be installed
  const loss = hookLoss(g, hooksRaw)
  if (loss.length) throw new Error(t(`hook_loss ${loss.length} — install refused:\n  `, `hook_loss ${loss.length} — 설치 거부:\n  `) + loss.join('\n  '))
  if (!spec.hooks?.length) throw new Error(t('nothing to install — hooks.json has an empty hooks list', '설치할 훅이 없다 — hooks.json 의 hooks 가 비어 있다'))

  // Counter-oracle: a declared probe that passes (exit 0) proves the check CANNOT fail.
  // That check is decoration — installing it would enforce nothing. Refuse.
  const probes = verifyProbes(spec, projDir, { timeout: probeTimeout })
  const decorative = probes.filter((p) => p.probe !== null && !p.verified)
  if (decorative.length) {
    throw new Error(t(
      'probe refuted nothing — these checks cannot fail (or the probe never finished), so they enforce nothing:\n  ',
      '프로브가 아무것도 반증하지 못했다 — 이 check 들은 실패할 줄 모른다(또는 프로브가 끝나지 않았다). 강제하는 것이 없다:\n  ') +
      decorative.map((p) => `${p.gate}: probe exit ${p.exit ?? 'timeout'} ← ${p.probe}`).join('\n  '))
  }
  const unproven = probes.filter((p) => p.probe === null).map((p) => p.gate)

  // Stop-hook command — settings run from the project root, so paths are relative.
  // 🔒 Approval pin: hash of the exact hooks.json bytes being approved right now.
  const rg = relative(projDir, resolve(graphPath)).replace(/\\/g, '/') || 'graph.json'
  const rh = relative(projDir, resolve(hooksPath)).replace(/\\/g, '/')
  const approvedHash = sha256(hooksRaw)   // returns 'sha256:<64hex>'
  const command = `node tools/hooks-gate.mjs ${rg} ${rh} --approved ${approvedHash}`

  return { settings, command, gates: spec.hooks.map((h) => h.gate), projDir, approvedHash, probes, unproven }
}

export function install(graphPath, hooksPath, { settingsPath, uninstall = false } = {}) {
  const p = plan(graphPath, hooksPath, { settingsPath })

  let s = {}
  if (existsSync(p.settings)) {
    // Never overwrite settings we cannot parse — stopping beats erasing someone's config.
    try { s = JSON.parse(readFileSync(p.settings, 'utf8')) }
    catch { throw new Error(t('existing settings do not parse as JSON — refusing to overwrite: ', '기존 settings 가 JSON 으로 안 읽힌다 — 덮어쓰지 않는다: ') + p.settings) }
  }

  s.hooks = s.hooks ?? {}
  const stop = Array.isArray(s.hooks.Stop) ? s.hooks.Stop : []
  const ours = (e) => (e?.hooks ?? []).some((h) => typeof h?.command === 'string' && h.command.includes(MARK))
  const keep = stop.filter((e) => !ours(e))   // Boundary 4 — other people's entries stay

  if (uninstall) {
    if (keep.length === stop.length) return { ...p, changed: false, action: 'uninstall' }
    if (keep.length) s.hooks.Stop = keep; else delete s.hooks.Stop
    if (!Object.keys(s.hooks).length) delete s.hooks
  } else {
    s.hooks.Stop = [...keep, { hooks: [{ type: 'command', command: p.command }] }]
  }

  mkdirSync(dirname(p.settings), { recursive: true })
  writeFileSync(p.settings, JSON.stringify(s, null, 2) + '\n')
  return { ...p, changed: true, action: uninstall ? 'uninstall' : 'install' }
}

/**
 * Read-only report: is the gate installed, and would it currently block?
 * Runs no commands, writes nothing.
 *   installed  — our Stop entry exists in the project settings
 *   tampered   — hooks.json bytes differ from the pinned approval hash
 *   stale      — hooks.json spec_hash differs from the current graph
 */
export function status(graphPath, hooksPath, { settingsPath } = {}) {
  const g = JSON.parse(readFileSync(graphPath, 'utf8'))
  const projDir = dirname(resolve(graphPath))
  const settings = norm(settingsPath ?? join(projDir, '.claude', 'settings.json'))

  let entries = []
  if (existsSync(settings)) {
    try {
      const s = JSON.parse(readFileSync(settings, 'utf8'))
      for (const e of Array.isArray(s?.hooks?.Stop) ? s.hooks.Stop : [])
        for (const h of e?.hooks ?? [])
          if (typeof h?.command === 'string' && h.command.includes(MARK)) entries.push(h.command)
    } catch { /* unparseable settings = nothing of ours readable there */ }
  }
  if (!entries.length) return { installed: false, settings }

  const pin = entries.map((c) => /--approved (sha256:[0-9a-f]{64})/.exec(c)?.[1] ?? null)

  let tampered = false, stale = false, specHashNow = null, missing = false
  if (!existsSync(hooksPath)) missing = true
  else {
    const hooksRaw = readFileSync(hooksPath, 'utf8')
    const actual = sha256(hooksRaw)
    tampered = pin.some((h) => h !== null && h !== actual)
    try { stale = JSON.parse(hooksRaw).spec_hash !== (specHashNow = specHash(g)) }
    catch { tampered = true }
  }
  const unpinned = pin.some((h) => h === null)
  return { installed: true, settings, commands: entries, tampered, stale, missing, unpinned, spec_hash: specHashNow }
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2)
  const yes = args.includes('--yes')
  const uninstall = args.includes('--uninstall')
  const wantStatus = args.includes('--status')
  const si = args.indexOf('--settings')
  const settingsPath = si >= 0 ? args[si + 1] : undefined
  const rest = args.filter((a, i) => !a.startsWith('--') && (si < 0 || i !== si + 1))
  const [graphPath, hooksPath] = rest
  if (!graphPath || !hooksPath) {
    console.error('usage: node tools/install-hooks.mjs <graph.json> <hooks.json> [--yes] [--uninstall] [--status] [--settings <path>]')
    process.exit(2)
  }
  const showProbes = (p) => {
    for (const pr of p.probes) {
      if (pr.probe === null) console.log(t(`  probe   ${pr.gate}  — none declared (ability to fail unproven)`, `  프로브  ${pr.gate}  — 선언 없음 (실패 가능성 미증명)`))
      else console.log(t(`  probe   ${pr.gate}  exit ${pr.exit} ✅ (the oracle can fail)`, `  프로브  ${pr.gate}  exit ${pr.exit} ✅ (오라클이 실패할 줄 안다)`))
    }
  }
  try {
    if (wantStatus) {
      const r = status(graphPath, hooksPath, { settingsPath })
      if (!r.installed) {
        console.log(t(`not installed — no Avalon Stop hook in ${r.settings}`, `설치 안 됨 — ${r.settings} 에 아발론 Stop 훅이 없다`))
        process.exit(3)
      }
      console.log(t(`installed — ${r.settings}`, `설치됨 — ${r.settings}`))
      for (const c of r.commands) console.log(`  Stop → ${c}`)
      if (r.missing) console.log(t('  🔴 hooks.json is missing — the gate would block (cannot read the spec)', '  🔴 hooks.json 이 없다 — 게이트는 차단한다 (명세를 못 읽는다)'))
      if (r.tampered) console.log(t('  🔴 TAMPERED — hooks.json differs from the approved bytes; the gate blocks without executing. Re-approve: install-hooks.mjs --yes', '  🔴 TAMPERED — hooks.json 이 승인받은 바이트와 다르다. 게이트는 실행 없이 차단한다. 재승인: install-hooks.mjs --yes'))
      if (r.stale) console.log(t('  🔴 STALE — spec_hash differs from the current graph; the gate blocks. Recompile → reinstall', '  🔴 STALE — spec_hash 가 지금 그래프와 다르다. 게이트는 차단한다. 재컴파일 → 재설치'))
      if (r.unpinned) console.log(t('  ⚠️ no approval pin in the installed command (pre-pinning install) — reinstall to pin', '  ⚠️ 설치된 명령에 승인 박제가 없다 (박제 도입 전 설치) — 재설치로 박제하라'))
      const blocked = r.missing || r.tampered || r.stale
      console.log(blocked
        ? t('  → the gate would currently BLOCK turn end', '  → 지금 게이트는 턴 종료를 차단하는 상태다')
        : t('  🟢 consistent — approved bytes, current graph', '  🟢 정합 — 승인 바이트 그대로, 그래프도 현재와 일치'))
      process.exit(blocked ? 2 : 0)
    }
    if (!yes) {
      // Boundary 1 — without approval, plan only
      const p = plan(graphPath, hooksPath, { settingsPath })
      console.log(t('install plan (nothing has been written):', '설치 계획 (아직 아무것도 쓰지 않았다):'))
      console.log(t(`  target  ${p.settings}`, `  대상    ${p.settings}`))
      console.log(t(`  hook    Stop → ${p.command}`, `  훅      Stop → ${p.command}`))
      console.log(t(`  gates   ${p.gates.join(', ')}`, `  게이트  ${p.gates.join(', ')}`))
      showProbes(p)
      console.log(t('\napproval required — after user confirmation: same command with --yes', '\n승인이 필요하다 — 사용자 확인 후: 같은 명령에 --yes'))
      process.exit(3)
    }
    const r = install(graphPath, hooksPath, { settingsPath, uninstall })
    if (r.action === 'uninstall') {
      console.log(r.changed
        ? t(`removed — Avalon Stop hook taken out of ${r.settings}`, `제거 완료 — ${r.settings} 에서 아발론 Stop 훅을 뺐다`)
        : t('nothing to remove — no Avalon hook installed', '제거할 것 없음 — 아발론 훅이 설치되어 있지 않다'))
    } else {
      console.log(t(`installed — ${r.settings}`, `설치 완료 — ${r.settings}`))
      console.log(`  Stop → ${r.command}`)
      showProbes(r)
      console.log(t(`  gate(s) ${r.gates.join(', ')} now block turn end when red (exit 2)`, `  게이트 ${r.gates.join(', ')} 미달 시 세션 종료가 차단된다 (exit 2)`))
      console.log(t(`  remove: node tools/install-hooks.mjs ${rest[0]} ${rest[1]} --uninstall --yes`, `  제거: node tools/install-hooks.mjs ${rest[0]} ${rest[1]} --uninstall --yes`))
    }
    process.exit(0)
  } catch (e) {
    console.error(t('installer refused: ', '설치자 거부: ') + e.message)
    process.exit(1)
  }
}
