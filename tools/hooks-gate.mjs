#!/usr/bin/env node
/**
 * Avalon 훅 게이트 — 설치된 훅이 실제로 실행하는 <집행자>.
 *
 * Stop 훅으로 설치되어, 세션이 턴을 끝내려 할 때 게이트 check 를 전부 돌린다.
 *   exit 0  → 전부 통과. 통과시킨다.
 *   exit 2  → 미달 게이트 존재. Stop 훅 규약상 2 는 <차단>이고 stderr 가 모델에게 전달된다.
 *
 * INV-1: 이 파일은 LLM 을 호출하지 않는다. 판정은 check 명령의 exit 코드가 전부다.
 *
 * ⚠️ STALE 은 통과가 아니라 차단이다. hooks.json 의 spec_hash 와 지금 그래프의 해시가
 *    다르면, 이 명세는 <다른 그래프>를 강제하고 있는 것이다. 낡은 규칙으로 통과시키는 것과
 *    낡은 규칙으로 차단하는 것 중, 정직한 쪽은 차단이다 — 재컴파일 → 재설치가 해소 경로다.
 *
 * ⚠️ 승인 박제 (--approved) — 승인과 실행 사이의 TOCTOU 를 막는다.
 *    설치자는 <승인 시점의 hooks.json 바이트 해시>를 settings 명령에 박아 넣는다.
 *    실행 시점에 파일이 그 해시와 다르면 — check 명령을 바꿔치기했든, 그래프째로
 *    말이 되게 재생성했든 — <아무 명령도 실행하지 않고> 차단한다(exit 2).
 *    이게 없으면 파일 쓰기 권한이 곧 임의 명령 자동 실행 권한이 된다.
 *
 * 사용
 *   node tools/hooks-gate.mjs <graph.json> <hooks.json> [--approved <sha256:...>] [--timeout <ms>] [--json]
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { specHash, sha256, isMain } from './hash.mjs'

export function runGate(graphPath, hooksPath, { timeout = 60_000, approved = null } = {}) {
  const g = JSON.parse(readFileSync(graphPath, 'utf8'))
  const hooksRaw = readFileSync(hooksPath, 'utf8')
  const spec = JSON.parse(hooksRaw)
  const cwd = dirname(resolve(graphPath))

  // 승인 박제 대조 — 실행보다 <먼저>. 여기서 걸리면 어떤 check 도 실행되지 않는다.
  if (approved) {
    const actual = sha256(hooksRaw)   // 'sha256:<64hex>' 형식으로 반환된다
    if (actual !== approved) {
      return {
        ok: false, stale: true,
        message: `🔴 TAMPERED — hooks.json 이 승인받은 명세와 다르다.\n` +
                 `   승인: ${approved.slice(7, 19)}…  지금: ${actual.slice(7, 19)}…\n` +
                 `   승인 없이 바뀐 check 는 <하나도 실행하지 않고> 차단한다.\n` +
                 `   해소: 변경을 검토한 뒤 node tools/install-hooks.mjs --yes 재설치 (재승인)`,
        results: [],
      }
    }
  }

  const now = specHash(g)
  if (spec.spec_hash !== now) {
    return {
      ok: false, stale: true,
      message: `🔴 STALE — hooks.json 은 ${spec.spec_hash.slice(7, 19)}… 를 강제하는데 지금 그래프는 ${now.slice(7, 19)}… 다.\n` +
               `   낡은 명세로는 통과도 차단도 정직하지 않다 → 차단한다.\n` +
               `   해소: node tools/compile.mjs → node tools/install-hooks.mjs --yes 재설치`,
      results: [],
    }
  }

  const results = []
  for (const h of spec.hooks ?? []) {
    let exit = 0
    try {
      execSync(h.check, { cwd, timeout, stdio: 'pipe' })
    } catch (e) {
      // 타임아웃도 미달이다 — 판정 못 한 게이트를 통과로 치지 않는다
      exit = typeof e.status === 'number' ? e.status : 124
    }
    results.push({ gate: h.gate, check: h.check, exit, pass: exit === (h.expect_exit ?? 0) })
  }
  const failed = results.filter((r) => !r.pass)
  return {
    ok: failed.length === 0, stale: false,
    message: failed.length === 0
      ? `🟢 훅 게이트 통과 — ${results.length}개 check 전부 exit 0`
      : `🔴 훅 게이트 미달 ${failed.length}/${results.length}:\n` +
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
  catch (e) { console.error(`🔴 훅 게이트 실행 불가: ${e.message} — 판정 못 하면 차단한다`); process.exit(2) }
  if (json) console.log(JSON.stringify(r, null, 2))
  ;(r.ok ? console.log : console.error)(r.message)
  process.exit(r.ok ? 0 : 2)
}
