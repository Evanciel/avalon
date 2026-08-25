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
 * 사용
 *   node tools/hooks-gate.mjs <graph.json> <hooks.json> [--timeout <ms>] [--json]
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { specHash, isMain } from './hash.mjs'

export function runGate(graphPath, hooksPath, { timeout = 60_000 } = {}) {
  const g = JSON.parse(readFileSync(graphPath, 'utf8'))
  const spec = JSON.parse(readFileSync(hooksPath, 'utf8'))
  const cwd = dirname(resolve(graphPath))

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
  const rest = args.filter((a, i) => a !== '--json' && a !== '--timeout' && (ti < 0 || i !== ti + 1))
  const [graphPath, hooksPath] = rest
  if (!graphPath || !hooksPath) {
    console.error('usage: node tools/hooks-gate.mjs <graph.json> <hooks.json> [--timeout <ms>] [--json]')
    process.exit(2)
  }
  let r
  try { r = runGate(graphPath, hooksPath, { timeout }) }
  catch (e) { console.error(`🔴 훅 게이트 실행 불가: ${e.message} — 판정 못 하면 차단한다`); process.exit(2) }
  if (json) console.log(JSON.stringify(r, null, 2))
  ;(r.ok ? console.log : console.error)(r.message)
  process.exit(r.ok ? 0 : 2)
}
