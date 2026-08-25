#!/usr/bin/env node
/**
 * scaffold — 대상 저장소를 실측해서 **G0 를 통과하는** IR 골격을 만든다.
 *
 * 왜 필요한가: 선언 경로가 안 쓰이던 이유는 설계가 어려워서가 아니라 **IR 을 손으로 쓰는 값이
 * 비쌌기 때문**이다. v1.4 는 필수 13필드를 요구한다 — 지문 해시, spec 해시, 노드마다 retry·policy,
 * human 노드 최소 1개, gates{field,op,threshold}, state, edges. 하나라도 빠지면 G0 에서 떨어지고,
 * 컴파일러는 G0 가 아니면 거부한다. 그 벽 때문에 그래프를 안 쓰게 된다.
 *
 * 그래서 역할을 가른다.
 *   기계가 하는 것 (여기)  : 실측 · 골격 · 해시. 결정적이다. 같은 저장소면 같은 바이트가 나온다.
 *   사람/모델이 하는 것    : 노드가 무엇인가, 게이트가 무엇을 재는가. 판단이 필요한 부분.
 *
 * INV-1 을 지킨다 — 이 파일은 LLM 을 호출하지 않는다.
 *
 * 나오는 골격은 **처음부터 초록이다.** 자리표시자 노드로도 validate 를 통과한다.
 * 초록에서 시작해 초록을 유지하며 내용을 바꾸는 편이, 빨강에서 시작해 언제 초록이 될지
 * 모르는 채 채우는 것보다 낫다.
 *
 * 사용
 *   node tools/scaffold.mjs <대상경로> "<과제 한 줄>" [출력.json]
 *   node tools/scaffold.mjs . "hold-out 스위트를 3개 저장소로 확장" graph.json
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, join, basename } from 'node:path'
import { stamp } from './hash.mjs'
import { t } from './i18n.mjs'

// ── 실측 ────────────────────────────────────────────────────────────────────
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'artifacts',
                      '.claude', 'coverage', '__pycache__', '.venv', 'target'])

/** 파일 수를 센다. 상한을 둔다 — 지문을 만들자고 5만개를 걷지 않는다. */
function countFiles(root, cap = 4000) {
  let n = 0
  const walk = (dir, depth) => {
    if (n >= cap || depth > 6) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (n >= cap) return
      if (e.name.startsWith('.') && e.name !== '.github') continue
      if (SKIP.has(e.name)) continue
      if (e.isDirectory()) walk(join(dir, e.name), depth + 1)
      else n++
    }
  }
  walk(root, 0)
  return { n, capped: n >= cap }
}

/** 구간으로 표현한다. 정확한 수는 하루만 지나도 틀리지만 구간은 오래 맞는다. */
const bucket = (n) =>
  n < 30 ? '1-29' : n < 100 ? '30-99' : n < 300 ? '100-299' :
  n < 1000 ? '300-999' : n < 3000 ? '1000-2999' : '3000+'

function detectStack(root) {
  const s = []
  const pj = join(root, 'package.json')
  if (existsSync(pj)) {
    let p = {}
    try { p = JSON.parse(readFileSync(pj, 'utf8')) } catch { /* 깨진 package.json 도 사실이다 */ }
    const dep = { ...(p.dependencies ?? {}), ...(p.devDependencies ?? {}) }
    s.push('node')
    for (const [k, label] of [['typescript', 'typescript'], ['react', 'react'], ['next', 'next'],
                              ['vitest', 'vitest'], ['jest', 'jest'], ['playwright', 'playwright'],
                              ['express', 'express'], ['vue', 'vue'], ['svelte', 'svelte']])
      if (dep[k]) s.push(label)
  }
  for (const [f, label] of [['requirements.txt', 'python'], ['pyproject.toml', 'python'],
                            ['go.mod', 'go'], ['Cargo.toml', 'rust'], ['pom.xml', 'java'],
                            ['Gemfile', 'ruby'], ['composer.json', 'php']])
    if (existsSync(join(root, f))) s.push(label)
  return [...new Set(s)]
}

/** markers 는 "이 저장소에서 직접 잰 값" 이다. 추측을 넣지 않는다. */
function measureMarkers(root) {
  const m = []
  const pj = join(root, 'package.json')
  let scripts = {}
  if (existsSync(pj)) { try { scripts = JSON.parse(readFileSync(pj, 'utf8')).scripts ?? {} } catch { /* 무시 */ } }

  const checks = ['typecheck', 'test', 'smoke', 'lint', 'test:holdout'].filter((k) => scripts[k])
  m.push(checks.length ? `verify scripts: ${checks.join(' · ')}` : 'no verify scripts')

  if (existsSync(join(root, '.github/workflows'))) {
    let n = 0
    try { n = readdirSync(join(root, '.github/workflows')).length } catch { /* 무시 */ }
    m.push(`GitHub Actions workflows: ${n}`)
  } else m.push('no CI config')

  try {
    execSync('git rev-parse --git-dir', { cwd: root, stdio: 'ignore' })
    const dirty = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean).length
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8' }).trim()
    m.push(`git: branch ${branch} · uncommitted ${dirty}`)
  } catch { m.push('not a git repo') }

  if (existsSync(join(root, 'CLAUDE.md'))) m.push('has project CLAUDE.md')
  if (existsSync(join(root, '.claude/verify.json'))) m.push('has verify.json override')
  return m
}

function countModules(root) {
  let n = 0
  for (const d of ['src', 'lib', 'app', 'packages', 'tools', 'scripts']) {
    const p = join(root, d)
    if (!existsSync(p)) continue
    try { n += readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).length || 1 } catch { /* 무시 */ }
  }
  return n || 1
}

// ── 골격 ────────────────────────────────────────────────────────────────────
/**
 * 자리표시자로도 validate 를 통과하는 최소 그래프.
 * 채워야 할 곳은 TODO: 로 표시한다 — 남아 있으면 아직 설계가 안 끝난 것이다.
 */
function skeleton({ root, task, name, files, modules, stack, markers }) {
  return {
    graph: {
      spec: { version: '1.4.0', hash: 'sha256:' + '0'.repeat(64) },
      name,
      mode: 'B',
      entry: 'survey',
      verdict: { statement: `TODO: the condition under which one run of ${name} can be called done`, ground_truth: 'measured' },
      excluded: [],
      // 보장하는 것과 보장하지 않는 것을 나눠 적는다. 안 적으면 전부 보장한다고 읽힌다.
      guarantees: {
        provides: ['TODO: what is true when this graph passes'],
        // 필드명은 excludes 가 정본이다 — validate 의 품질 검사와 render 가 이 이름을 읽는다.
        // (does_not 으로 어긋나 있던 것을 2026-08-25 실측으로 잡았다 — 골격이 WARN 을 달고 태어났다.)
        excludes: ['TODO: what this graph does not guarantee — leaving this empty overclaims'],
      },
      scope: { unit: 'TODO: one run of what' },
      // compile.mjs 는 pipeline 이 'workflow-script' 인 그래프만 컴파일한다.
      host: {
        pipeline: 'workflow-script',
        reason: 'TODO: why this host',
        state_file: '.avalon/run.state.json',   // 러너가 바로 쓸 수 있는 구체 경로 — 골격은 실행까지 초록이어야 한다
        enforced_by_hook: ['G0'],
      },
      target: { root, vcs: existsSync(join(root, '.git')) ? 'git' : 'none' },
      task: { id: name, request: task },
    },
    project: {
      fingerprint: {
        stack,
        scale: { files, modules },
        markers,
        hash: 'sha256:' + '0'.repeat(64),
      },
    },
    state: [
      { field: 'gate_pass', type: 'bool', unit: 'none' },
      { field: 'changed_files', type: 'int', unit: 'count' },
    ],
    // 최소이면서 **올바른** 본이다. 실측 → 판정 → 사람.
    // check 노드가 있어야 게이트가 붙을 자리가 생긴다 — 게이트는 공중에 뜨지 않는다.
    nodes: [
      {
        id: 'survey',
        kind: 'work',
        runner: 'agent',
        rationale: 'TODO: why this stage exists. Start by measuring — never build a graph on guesses',
        produces: ['survey.md'],
        retry: { max: 2, on_exhaust: 'fail' },
        policy: {
          allowed_tools: ['Read', 'Glob', 'Grep'], requires_approval: false, reversible: true,
          budget: { tokens: 200000, iterations: 4, wall_clock_s: 900 },
        },
        uses: ['graph-architect'],
      },
      {
        id: 'check',
        kind: 'work',
        runner: 'script',
        rationale: 'TODO: what is measured and how. Without a measuring stage, gates are decoration',
        produces: ['gate_pass'],
        retry: { max: 1, on_exhaust: 'fail' },
        policy: {
          allowed_tools: ['Bash'], requires_approval: false, reversible: true,
          budget: { tokens: 50000, iterations: 2, wall_clock_s: 600 },
        },
      },
      {
        id: 'review',
        kind: 'human',
        runner: 'manual',
        rationale: 'A human judges here. What cannot be measured automatically must not count as a pass',
        produces: [],
        retry: { max: 0, on_exhaust: 'fail' },
        policy: {
          requires_approval: true, reversible: true,
          budget: { tokens: 0, iterations: 1, wall_clock_s: 0 },
        },
      },
    ],
    // 게이트는 엣지로도 그려야 컴파일러가 산출 코드에 싣는다.
    // gate:<id>:pass / gate:<id>:fail 이 없으면 판정해도 분기가 없어 gate_loss 가 난다.
    edges: [
      { from: 'survey', to: 'check', when: 'always' },
      { from: 'check', to: 'survey', when: 'gate:G0:fail' },
      { from: 'check', to: 'review', when: 'gate:G0:pass' },
    ],
    gates: [
      {
        id: 'G0',
        field: 'gate_pass',
        op: '==',
        threshold: 1,
        on_fail: { goto: 'survey', max_retry: 2 },
        ground_truth: 'measured',
        threshold_source: 'TODO: where this number came from. A threshold without evidence is decoration',
      },
    ],
    policy: {
      defaults: {
        requires_approval: false,
        reversible: true,
        budget: { tokens: 100000, iterations: 3, wall_clock_s: 600 },
      },
    },
  }
}

// ── main ────────────────────────────────────────────────────────────────────
const [, , rawRoot, task, outArg] = process.argv
if (!rawRoot || !task) {
  console.error(t('usage: node tools/scaffold.mjs <target-path> "<one-line task>" [out.json]',
                  'usage: node tools/scaffold.mjs <대상경로> "<과제 한 줄>" [출력.json]'))
  process.exit(1)
}
const root = resolve(rawRoot).replace(/\\/g, '/')
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(t(`target path is not a directory: ${root}`,
                  `대상 경로가 디렉터리가 아니다: ${root}`))
  process.exit(1)
}

const { n, capped } = countFiles(root)
const g = skeleton({
  root,
  task,
  name: basename(root).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() + '-task',
  files: bucket(n) + (capped ? '+' : ''),
  modules: String(countModules(root)),
  stack: detectStack(root),
  markers: measureMarkers(root),
})

const stamped = stamp(g)
const out = outArg ?? 'graph.draft.json'
writeFileSync(out, JSON.stringify(stamped, null, 2) + '\n', 'utf8')

console.log(t(`skeleton written  ${out}`, `골격 생성  ${out}`))
console.log(t(`  target      ${root}`, `  대상        ${root}`))
console.log(t(`  stack       ${stamped.project.fingerprint.stack.join(' · ') || '(none detected)'}`,
              `  스택        ${stamped.project.fingerprint.stack.join(' · ') || '(감지 없음)'}`))
console.log(t(`  scale       files ${stamped.project.fingerprint.scale.files} / modules ${stamped.project.fingerprint.scale.modules}`,
              `  규모        파일 ${stamped.project.fingerprint.scale.files} / 모듈 ${stamped.project.fingerprint.scale.modules}`))
for (const m of stamped.project.fingerprint.markers) console.log(t(`  measured    ${m}`, `  실측        ${m}`))
console.log(`  fingerprint ${stamped.project.fingerprint.hash}`)
console.log(`  spec.hash   ${stamped.graph.spec.hash}`)
console.log('')
console.log(t('next: replace the TODO: entries with the real design, then',
              '다음: TODO: 를 실제 설계로 바꾼 뒤'))
console.log(t('  node tools/hash.mjs ' + out + ' --write     # re-stamp hashes (required)',
              '  node tools/hash.mjs ' + out + ' --write     # 해시 재스탬프 (필수)'))
console.log(t('  node tools/validate.mjs ' + out + '          # check G0',
              '  node tools/validate.mjs ' + out + '          # G0 확인'))
console.log('  node tools/compile.mjs ' + out + ' build/graph.workflow.js')
