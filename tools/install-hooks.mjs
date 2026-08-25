#!/usr/bin/env node
/**
 * Avalon 훅 설치자 — build/hooks.json 명세를 <프로젝트> .claude/settings.json 의
 * Stop 훅으로 설치한다. X3 의 해소 경로다.
 *
 * 승인 경계 — 이 도구가 지키는 것:
 *   1. `--yes` 없이는 아무것도 쓰지 않는다. 계획만 보여주고 exit 3 (승인 대기).
 *      에이전트가 이 도구를 불러도, --yes 는 사용자 승인 없이 붙이면 안 된다.
 *   2. 전역(~/.claude/settings.json) 설치는 --yes 가 있어도 거부한다.
 *      훅의 check 는 프로젝트 상대 경로라 전역에서는 성립하지도 않고,
 *      세션 전체의 강제 계층을 조용히 바꾸는 것은 이 프로젝트가 막으려는 종류의 일이다.
 *   3. 낡은 명세는 설치하지 않는다 — hooks.json 의 spec_hash 가 지금 그래프와 다르면 거부.
 *   4. 남의 훅은 건드리지 않는다 — 병합은 <자기 항목>(hooks-gate.mjs 포함 명령)만
 *      교체/제거하고 나머지는 그대로 둔다. 재설치는 멱등이다.
 *
 * INV-1: LLM 을 호출하지 않는다.
 *
 * 사용
 *   node tools/install-hooks.mjs <graph.json> <hooks.json>            # 계획만 (exit 3)
 *   node tools/install-hooks.mjs <graph.json> <hooks.json> --yes      # 설치
 *   node tools/install-hooks.mjs <graph.json> <hooks.json> --uninstall --yes
 *   [--settings <path>]  기본: <graph 디렉터리>/.claude/settings.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve, join, relative } from 'node:path'
import { homedir } from 'node:os'
import { specHash, sha256, isMain } from './hash.mjs'
import { hookLoss } from './compile.mjs'

const MARK = 'hooks-gate.mjs'   // 자기 항목 식별자 — 이 문자열이 든 command 만 우리 것으로 본다

const norm = (p) => resolve(p).replace(/\\/g, '/')

export function plan(graphPath, hooksPath, { settingsPath } = {}) {
  const g = JSON.parse(readFileSync(graphPath, 'utf8'))
  const hooksRaw = readFileSync(hooksPath, 'utf8')
  const spec = JSON.parse(hooksRaw)
  const projDir = dirname(resolve(graphPath))
  const settings = norm(settingsPath ?? join(projDir, '.claude', 'settings.json'))

  // 경계 2 — 전역 설치 거부
  const globalSettings = norm(join(homedir(), '.claude', 'settings.json'))
  if (settings === globalSettings) {
    throw new Error('전역 설치 거부 — ~/.claude/settings.json 은 이 도구의 범위 밖이다. 프로젝트 .claude/settings.json 에만 설치한다')
  }
  // 경계 3 — 낡은 명세 거부
  const now = specHash(g)
  if (spec.spec_hash !== now) {
    throw new Error(`낡은 명세 거부 — hooks.json 은 ${spec.spec_hash.slice(7, 19)}… 인데 그래프는 ${now.slice(7, 19)}… 다. 재컴파일부터: node tools/compile.mjs`)
  }
  // 완전성 — hook_loss 0 이 아니면 설치할 자격이 없다
  const loss = hookLoss(g, hooksRaw)
  if (loss.length) throw new Error(`hook_loss ${loss.length} — 설치 거부:\n  ` + loss.join('\n  '))
  if (!spec.hooks?.length) throw new Error('설치할 훅이 없다 — hooks.json 의 hooks 가 비어 있다')

  // Stop 훅 명령 — settings 는 프로젝트 루트에서 실행되므로 상대 경로로 적는다.
  // 🔒 승인 박제: <지금 승인받는 hooks.json 바이트>의 해시를 명령에 박는다.
  //    이후 파일이 어떻게 바뀌든(check 바꿔치기·그래프째 재생성) 게이트는
  //    실행 없이 차단한다 — 재승인(--yes 재설치) 없이는 새 명령이 돌 수 없다.
  const rg = relative(projDir, resolve(graphPath)).replace(/\\/g, '/') || 'graph.json'
  const rh = relative(projDir, resolve(hooksPath)).replace(/\\/g, '/')
  const approvedHash = sha256(hooksRaw)   // 'sha256:<64hex>' 형식으로 반환된다
  const command = `node tools/hooks-gate.mjs ${rg} ${rh} --approved ${approvedHash}`

  return { settings, command, gates: spec.hooks.map((h) => h.gate), projDir, approvedHash }
}

export function install(graphPath, hooksPath, { settingsPath, uninstall = false } = {}) {
  const p = plan(graphPath, hooksPath, { settingsPath })

  let s = {}
  if (existsSync(p.settings)) {
    // 파싱 안 되는 settings 를 덮어쓰지 않는다 — 남의 설정을 지우는 것보다 멈추는 게 낫다
    try { s = JSON.parse(readFileSync(p.settings, 'utf8')) }
    catch { throw new Error(`기존 settings 가 JSON 으로 안 읽힌다 — 덮어쓰지 않는다: ${p.settings}`) }
  }

  s.hooks = s.hooks ?? {}
  const stop = Array.isArray(s.hooks.Stop) ? s.hooks.Stop : []
  const ours = (e) => (e?.hooks ?? []).some((h) => typeof h?.command === 'string' && h.command.includes(MARK))
  const keep = stop.filter((e) => !ours(e))   // 경계 4 — 남의 항목은 그대로

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

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2)
  const yes = args.includes('--yes')
  const uninstall = args.includes('--uninstall')
  const si = args.indexOf('--settings')
  const settingsPath = si >= 0 ? args[si + 1] : undefined
  const rest = args.filter((a, i) => !a.startsWith('--') && (si < 0 || i !== si + 1))
  const [graphPath, hooksPath] = rest
  if (!graphPath || !hooksPath) {
    console.error('usage: node tools/install-hooks.mjs <graph.json> <hooks.json> [--yes] [--uninstall] [--settings <path>]')
    process.exit(2)
  }
  try {
    if (!yes) {
      // 경계 1 — 승인 없이는 계획만
      const p = plan(graphPath, hooksPath, { settingsPath })
      console.log(`설치 계획 (아직 아무것도 쓰지 않았다):`)
      console.log(`  대상    ${p.settings}`)
      console.log(`  훅      Stop → ${p.command}`)
      console.log(`  게이트  ${p.gates.join(', ')}`)
      console.log(`\n승인이 필요하다 — 사용자 확인 후: 같은 명령에 --yes`)
      process.exit(3)
    }
    const r = install(graphPath, hooksPath, { settingsPath, uninstall })
    if (r.action === 'uninstall') {
      console.log(r.changed ? `제거 완료 — ${r.settings} 에서 아발론 Stop 훅을 뺐다` : `제거할 것 없음 — 아발론 훅이 설치되어 있지 않다`)
    } else {
      console.log(`설치 완료 — ${r.settings}`)
      console.log(`  Stop → ${r.command}`)
      console.log(`  게이트 ${r.gates.join(', ')} 미달 시 세션 종료가 차단된다 (exit 2)`)
      console.log(`  제거: node tools/install-hooks.mjs ${rest[0]} ${rest[1]} --uninstall --yes`)
    }
    process.exit(0)
  } catch (e) {
    console.error(`설치자 거부: ${e.message}`)
    process.exit(1)
  }
}
