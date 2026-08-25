#!/usr/bin/env node
/**
 * 훅 설치 경로(X3) 자기시험 — install-hooks.mjs + hooks-gate.mjs
 *
 * run.selftest 와 같은 철학: 방어벽의 존재는 <금지된 상황을 실제로 만들어서> 증명한다.
 * 여기서 재는 방어벽:
 *   설치자 — 승인(--yes) 없이 쓰기 금지 · 전역 설치 금지 · 낡은 명세 금지 · 남의 훅 보존 · 멱등
 *   게이트 — 통과=0 · 미달=2(Stop 차단) · STALE=2(낡은 규칙으로 통과시키지 않는다)
 *   박제   — 승인 뒤 바뀐 명세는 <실행 없이> 차단 (TOCTOU)
 *   프로브 — 실패할 줄 모르는 오라클(probe exit 0)은 설치 거부
 *   status — 읽기 전용 진단 · i18n — 기본 영어, AVALON_LANG=ko 로 한국어
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { specHash } from './hash.mjs'
import { compileHooks } from './compile.mjs'

// 이 스위트의 단정은 한국어 메시지에 걸려 있다 — 자식 프로세스까지 ko 로 고정한다.
// (기본 언어는 영어다 — 영어 기본값 자체는 아래 'i18n' 구획이 잰다.)
process.env.AVALON_LANG = 'ko'

const TOOLS = dirname(fileURLToPath(import.meta.url))
const TMP_BASE = process.env.CLAUDE_SELFTEST_TMP
  || (existsSync('A:/claude-temp') ? 'A:/claude-temp' : tmpdir())
const DIR = mkdtempSync(join(TMP_BASE, 'hookinst-'))

let pass = 0, fail = 0
const t = (name, fn) => {
  try { fn(); pass++; console.log(`  🟢 ${name}`) }
  catch (e) { fail++; console.log(`  🔴 ${name}\n     ${e.message}`) }
}
const eq = (a, b, why) => { if (a !== b) throw new Error(`${why ?? ''} — expected ${b}, got ${a}`) }
const ok = (v, why) => { if (!v) throw new Error(why ?? 'falsy') }

/** 도구를 자식 프로세스로 실행하고 exit 코드를 돌려받는다 — CLI 계약 그대로를 잰다 */
function run(tool, args, env) {
  try {
    const out = execFileSync(process.execPath, [join(TOOLS, tool), ...args],
      { stdio: 'pipe', env: env ? { ...process.env, ...env } : process.env })
    return { exit: 0, out: String(out) }
  } catch (e) {
    return { exit: e.status ?? -1, out: String(e.stdout ?? '') + String(e.stderr ?? '') }
  }
}

/** 최소 그래프 — 검증 대상이 아니라 해시·훅 명세의 <운반체>다 */
function miniGraph(checkCmd, probeCmd) {
  const g = {
    graph: {
      spec: { version: '1.4.0', hash: '' },
      host: { enforced_by_hook: [{ gate: 'G1', check: checkCmd, ...(probeCmd ? { probe: probeCmd } : {}) }] },
    },
    gates: [{ id: 'G1', field: 'x', op: '==', threshold: 1 }],
  }
  g.graph.spec.hash = specHash(g)
  return g
}

function mk(name, checkCmd, probeCmd) {
  const dir = join(DIR, name)
  mkdirSync(join(dir, 'build'), { recursive: true })
  mkdirSync(join(dir, 'tools'), { recursive: true })
  const g = miniGraph(checkCmd, probeCmd)
  const graphPath = join(dir, 'graph.json')
  const hooksPath = join(dir, 'build', 'hooks.json')
  writeFileSync(graphPath, JSON.stringify(g, null, 2))
  writeFileSync(hooksPath, compileHooks(g))
  return { dir, graphPath, hooksPath, g, settings: join(dir, '.claude', 'settings.json') }
}

const PASS_CMD = `node -e "process.exit(0)"`
const FAIL_CMD = `node -e "process.exit(1)"`

console.log('\n── hooks-gate.mjs — 집행자 ──')

t('통과: check 전부 exit 0 → 게이트 exit 0', () => {
  const f = mk('gate-pass', PASS_CMD)
  eq(run('hooks-gate.mjs', [f.graphPath, f.hooksPath]).exit, 0)
})

t('미달: check exit 1 → 게이트 exit 2 (Stop 차단), 게이트 id 를 말한다', () => {
  const f = mk('gate-fail', FAIL_CMD)
  const r = run('hooks-gate.mjs', [f.graphPath, f.hooksPath])
  eq(r.exit, 2)
  ok(r.out.includes('G1'), '어느 게이트가 미달인지 stderr 에 있어야 한다')
})

t('★ STALE: 설치 후 그래프가 바뀌면 통과가 아니라 차단(exit 2)이다', () => {
  const f = mk('gate-stale', PASS_CMD)
  const g2 = JSON.parse(readFileSync(f.graphPath, 'utf8'))
  g2.gates.push({ id: 'G2', field: 'y', op: '>=', threshold: 5 })
  g2.graph.spec.hash = specHash(g2)                       // 재스탬프까지 해도
  writeFileSync(f.graphPath, JSON.stringify(g2, null, 2)) // hooks.json 은 옛 그래프 것
  const r = run('hooks-gate.mjs', [f.graphPath, f.hooksPath])
  eq(r.exit, 2)
  ok(r.out.includes('STALE'), 'STALE 이라고 말해야 한다')
})

console.log('\n── install-hooks.mjs — 설치자 ──')

t('★ 승인 경계: --yes 없으면 계획만 보여주고 exit 3, 아무것도 쓰지 않는다', () => {
  const f = mk('inst-plan', PASS_CMD)
  const r = run('install-hooks.mjs', [f.graphPath, f.hooksPath])
  eq(r.exit, 3)
  ok(!existsSync(f.settings), 'settings 가 생기면 안 된다')
})

t('--yes 설치: 프로젝트 .claude/settings.json 에 Stop 훅이 생긴다', () => {
  const f = mk('inst-yes', PASS_CMD)
  eq(run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes']).exit, 0)
  const s = JSON.parse(readFileSync(f.settings, 'utf8'))
  const cmds = s.hooks.Stop.flatMap((e) => e.hooks.map((h) => h.command))
  eq(cmds.length, 1)
  ok(cmds[0].includes('hooks-gate.mjs'), 'hooks-gate 명령이어야 한다')
})

t('★ 남의 훅 보존: 기존 항목은 그대로, 우리 항목만 추가된다', () => {
  const f = mk('inst-merge', PASS_CMD)
  mkdirSync(dirname(f.settings), { recursive: true })
  writeFileSync(f.settings, JSON.stringify({
    permissions: { allow: ['Bash'] },
    hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo other' }] }],
             Stop: [{ hooks: [{ type: 'command', command: 'echo someone-elses-stop' }] }] },
  }, null, 2))
  eq(run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes']).exit, 0)
  const s = JSON.parse(readFileSync(f.settings, 'utf8'))
  ok(s.permissions?.allow?.[0] === 'Bash', 'permissions 보존')
  eq(s.hooks.PostToolUse.length, 1, 'PostToolUse 보존')
  eq(s.hooks.Stop.length, 2, '남의 Stop + 우리 Stop')
  ok(s.hooks.Stop.some((e) => e.hooks[0].command === 'echo someone-elses-stop'), '남의 Stop 항목 보존')
})

t('멱등: 두 번 설치해도 우리 항목은 1개다', () => {
  const f = mk('inst-idem', PASS_CMD)
  run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  const s = JSON.parse(readFileSync(f.settings, 'utf8'))
  const ours = s.hooks.Stop.filter((e) => e.hooks.some((h) => h.command.includes('hooks-gate.mjs')))
  eq(ours.length, 1)
})

t('--uninstall --yes: 우리 항목만 사라지고 남의 것은 남는다', () => {
  const f = mk('inst-uninst', PASS_CMD)
  mkdirSync(dirname(f.settings), { recursive: true })
  writeFileSync(f.settings, JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo keep-me' }] }] },
  }, null, 2))
  run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  eq(run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--uninstall', '--yes']).exit, 0)
  const s = JSON.parse(readFileSync(f.settings, 'utf8'))
  eq(s.hooks.Stop.length, 1)
  eq(s.hooks.Stop[0].hooks[0].command, 'echo keep-me')
})

t('★ 낡은 명세 거부: spec_hash 불일치면 --yes 여도 설치하지 않는다 (exit 1)', () => {
  const f = mk('inst-stale', PASS_CMD)
  const g2 = JSON.parse(readFileSync(f.graphPath, 'utf8'))
  g2.gates[0].threshold = 2
  g2.graph.spec.hash = specHash(g2)
  writeFileSync(f.graphPath, JSON.stringify(g2, null, 2))
  const r = run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  eq(r.exit, 1)
  ok(!existsSync(f.settings), '설치되면 안 된다')
})

t('★ 전역 설치 거부: --settings 가 ~/.claude/settings.json 이면 --yes 여도 거부', () => {
  const f = mk('inst-global', PASS_CMD)
  const r = run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes', '--settings', join(homedir(), '.claude', 'settings.json')])
  eq(r.exit, 1)
  ok(r.out.includes('전역'), '전역 거부라고 말해야 한다')
})

t('망가진 settings 를 덮어쓰지 않는다', () => {
  const f = mk('inst-broken', PASS_CMD)
  mkdirSync(dirname(f.settings), { recursive: true })
  writeFileSync(f.settings, '{ not json !!!')
  const r = run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  eq(r.exit, 1)
  eq(readFileSync(f.settings, 'utf8'), '{ not json !!!', '원본이 그대로여야 한다')
})

console.log('\n── 승인 박제 — TOCTOU 방어 ──')

t('★ 설치된 명령에 승인 시점 해시가 박혀 있다 (--approved)', () => {
  const f = mk('pin-embed', PASS_CMD)
  run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  const s = JSON.parse(readFileSync(f.settings, 'utf8'))
  const cmd = s.hooks.Stop.find((e) => e.hooks[0].command.includes('hooks-gate.mjs')).hooks[0].command
  ok(/--approved sha256:[0-9a-f]{64}/.test(cmd), '승인 해시가 명령에 없다')
})

t('★★ 설치 후 check 를 바꿔치기하면 — 차단되고, 바꿔친 명령은 <실행되지 않는다>', () => {
  const f = mk('pin-tamper', PASS_CMD)
  run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  const s = JSON.parse(readFileSync(f.settings, 'utf8'))
  const cmd = s.hooks.Stop.find((e) => e.hooks[0].command.includes('hooks-gate.mjs')).hooks[0].command
  // 공격: 파일 쓰기 권한만으로 check 를 악성 명령으로 교체 (마커 파일 생성 = 실행 증거)
  const marker = join(f.dir, 'PWNED')
  const spec = JSON.parse(readFileSync(f.hooksPath, 'utf8'))
  spec.hooks[0].check = `node -e "require('fs').writeFileSync(${JSON.stringify(marker)},'x')"`
  writeFileSync(f.hooksPath, JSON.stringify(spec, null, 2))
  // 설치된 명령 그대로 실행
  const parts = cmd.split(' ').slice(1)
  parts[0] = join(TOOLS, 'hooks-gate.mjs')
  let exit = 0, out = ''
  try { execFileSync(process.execPath, parts, { cwd: f.dir, stdio: 'pipe' }) }
  catch (e) { exit = e.status; out = String(e.stdout ?? '') + String(e.stderr ?? '') }
  eq(exit, 2, '차단(exit 2)이어야 한다')
  ok(out.includes('TAMPERED'), 'TAMPERED 라고 말해야 한다')
  ok(!existsSync(marker), '★핵심: 바꿔친 명령이 실행되면 안 된다 — 마커 파일이 존재한다')
})

t('★ 그래프째로 말이 되게 재생성해도 — 승인 해시가 다르므로 차단된다', () => {
  const f = mk('pin-regen', PASS_CMD)
  run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  const s = JSON.parse(readFileSync(f.settings, 'utf8'))
  const cmd = s.hooks.Stop.find((e) => e.hooks[0].command.includes('hooks-gate.mjs')).hooks[0].command
  // 공격: 그래프의 check 를 바꾸고 재스탬프 + hooks.json 재컴파일 — 서로는 완전히 일관됨
  const marker = join(f.dir, 'PWNED2')
  const g2 = miniGraph(`node -e "require('fs').writeFileSync(${JSON.stringify(marker)},'x')"`)
  writeFileSync(f.graphPath, JSON.stringify(g2, null, 2))
  writeFileSync(f.hooksPath, compileHooks(g2))
  const parts = cmd.split(' ').slice(1)
  parts[0] = join(TOOLS, 'hooks-gate.mjs')
  let exit = 0
  try { execFileSync(process.execPath, parts, { cwd: f.dir, stdio: 'pipe' }) } catch (e) { exit = e.status }
  eq(exit, 2, '일관된 재생성도 재승인 전에는 차단이어야 한다')
  ok(!existsSync(marker), '재생성된 check 도 실행되면 안 된다')
})

console.log('\n── 반증 프로브 — 실패할 줄 아는 오라클만 설치된다 ──')

t('★ probe 가 exit!=0 이면 (오라클이 실패 가능함을 증명) 설치된다', () => {
  const f = mk('probe-ok', PASS_CMD, FAIL_CMD)   // probe: 고장난 입력에서 exit 1
  const r = run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  eq(r.exit, 0)
  ok(r.out.includes('프로브'), '설치 출력에 프로브 판정이 보여야 한다')
  ok(existsSync(f.settings), '설치되어야 한다')
})

t('★★ probe 가 exit 0 이면 — check 는 실패할 줄 모르는 장식이다 → 설치 거부', () => {
  const f = mk('probe-deco', PASS_CMD, PASS_CMD)   // probe 도 통과 = 아무것도 반증 못 함
  const r = run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  eq(r.exit, 1, '설치 거부(exit 1)여야 한다')
  ok(r.out.includes('프로브'), '거부 사유에 프로브가 있어야 한다')
  ok(!existsSync(f.settings), '장식 오라클이 설치되면 안 된다')
})

t('probe 는 compile 이 hooks.json 으로 운반한다', () => {
  const g = miniGraph(PASS_CMD, FAIL_CMD)
  const spec = JSON.parse(compileHooks(g))
  eq(spec.hooks[0].probe, FAIL_CMD)
})

t('probe 없는 훅은 (미증명으로 보고하되) 설치는 된다 — 소급 강제는 하지 않는다', () => {
  const f = mk('probe-none', PASS_CMD)
  const r = run('install-hooks.mjs', [f.graphPath, f.hooksPath])
  eq(r.exit, 3)
  ok(r.out.includes('미증명'), '계획에 미증명이 보여야 한다')
  eq(run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes']).exit, 0)
})

console.log('\n── --status — 읽기 전용 진단 ──')

t('status: 설치 전이면 exit 3, 아무것도 쓰지 않는다', () => {
  const f = mk('st-none', PASS_CMD)
  const r = run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--status'])
  eq(r.exit, 3)
  ok(!existsSync(f.settings), 'status 가 settings 를 만들면 안 된다')
})

t('status: 설치 후 정합이면 exit 0', () => {
  const f = mk('st-ok', PASS_CMD)
  run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  const r = run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--status'])
  eq(r.exit, 0)
  ok(r.out.includes('정합'), '정합이라고 말해야 한다')
})

t('★ status: 설치 후 hooks.json 이 바뀌면 exit 2 + TAMPERED — 게이트가 차단할 상태임을 미리 알린다', () => {
  const f = mk('st-tamper', PASS_CMD)
  run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  const spec = JSON.parse(readFileSync(f.hooksPath, 'utf8'))
  spec.hooks[0].check = FAIL_CMD
  writeFileSync(f.hooksPath, JSON.stringify(spec, null, 2))
  const r = run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--status'])
  eq(r.exit, 2)
  ok(r.out.includes('TAMPERED'), 'TAMPERED 라고 말해야 한다')
})

console.log('\n── i18n — 기본 언어는 영어다 ──')

t('AVALON_LANG 없이(비 ko 로케일) 설치자 계획이 영어로 나온다', () => {
  const f = mk('lang-en', PASS_CMD)
  const r = run('install-hooks.mjs', [f.graphPath, f.hooksPath], { AVALON_LANG: 'en' })
  eq(r.exit, 3)
  ok(r.out.includes('install plan'), '영어 계획이어야 한다: ' + r.out.slice(0, 80))
})

t('전역 거부 메시지도 영어로 나온다 (AVALON_LANG=en)', () => {
  const f = mk('lang-en2', PASS_CMD)
  const r = run('install-hooks.mjs',
    [f.graphPath, f.hooksPath, '--yes', '--settings', join(homedir(), '.claude', 'settings.json')],
    { AVALON_LANG: 'en' })
  eq(r.exit, 1)
  ok(r.out.includes('global install refused'), '영어 거부 메시지여야 한다')
})

console.log('\n── 설치 → 집행 왕복 ──')

t('설치된 명령을 그대로 실행하면 게이트가 실제로 돈다', () => {
  const f = mk('roundtrip', PASS_CMD)
  run('install-hooks.mjs', [f.graphPath, f.hooksPath, '--yes'])
  const s = JSON.parse(readFileSync(f.settings, 'utf8'))
  const cmd = s.hooks.Stop.find((e) => e.hooks[0].command.includes('hooks-gate.mjs')).hooks[0].command
  // settings 의 명령은 프로젝트 루트 기준 상대 경로다 — 그 계약대로 실행한다
  const parts = cmd.split(' ').slice(1)   // 'node' 제외
  parts[0] = join(TOOLS, 'hooks-gate.mjs') // 이 저장소의 게이트로 치환 (fixture 에는 tools/ 가 없다)
  let exit = 0
  try { execFileSync(process.execPath, parts, { cwd: f.dir, stdio: 'pipe' }) } catch (e) { exit = e.status }
  eq(exit, 0)
})

console.log(`\n──\n  통과 ${pass} / 실패 ${fail}   (임시: ${DIR})`)
console.log(fail === 0
  ? '  🟢 전부 통과 — 승인 경계·전역 금지·STALE 차단이 <실제로> 걸린다'
  : '  🔴 실패 있음')
process.exit(fail === 0 ? 0 : 1)
