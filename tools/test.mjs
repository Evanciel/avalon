/**
 * Avalon 도구 스모크 테스트
 * 실행: node avalon/tools/test.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { canonical, sha256, stamp, specHash, fingerprintHash } from './hash.mjs'
import { validate } from './validate.mjs'
import { compile, gateLoss, compileHooks, hookLoss } from './compile.mjs'
import { render } from './render.mjs'

let pass = 0, fail = 0
const t = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass++ }
  catch (e) { console.log(`  FAIL  ${name}\n         ↳ ${e.message}`); fail++ }
}
const ta = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); pass++ }
  catch (e) { console.log(`  FAIL  ${name}\n         ↳ ${e.message}`); fail++ }
}
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} 기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`) }
const ok = (c, m) => { if (!c) throw new Error(m) }

const GRAPH = JSON.parse(readFileSync(new URL('../graph.json', import.meta.url), 'utf8'))
const clone = () => structuredClone(GRAPH)

console.log('\n── hash.mjs ──')

t('canonical: 키 순서 무관', () => {
  eq(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }))
  eq(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}')
})

t('canonical: 중첩 객체도 정렬', () => {
  eq(canonical({ z: { y: 1, x: 2 } }), '{"z":{"x":2,"y":1}}')
})

t('canonical: 배열 순서는 보존 (의미가 있음)', () => {
  ok(canonical([1, 2]) !== canonical([2, 1]), '배열 순서가 무시되면 안 됨')
})

t('canonical: undefined 거부', () => {
  let threw = false
  try { canonical({ a: undefined }) } catch { threw = true }
  ok(threw, 'undefined를 조용히 통과시키면 안 됨')
})

t('sha256: 형식 sha256:<64 hex>', () => {
  ok(/^sha256:[0-9a-f]{64}$/.test(sha256('x')), '형식 불일치')
})

t('stamp: 3회 실행 결과 동일 (결정론)', () => {
  const h = [stamp(clone()), stamp(clone()), stamp(clone())].map((g) => g.graph.spec.hash)
  eq(new Set(h).size, 1, '3회 해시가 갈림:')
})

t('stamp: 멱등 (두 번 찍어도 같음)', () => {
  const once = stamp(clone())
  eq(stamp(once).graph.spec.hash, once.graph.spec.hash)
})

t('stamp: 입력을 변형하지 않음', () => {
  // 리터럴을 하드코딩하지 않는다 — graph.json이 스탬프되면 낡은 단정이 된다.
  const src = clone()
  src.graph.spec.hash = 'sha256:SENTINEL'
  const before = canonical(src)
  stamp(src)
  eq(canonical(src), before, '원본이 오염됨:')
})

t('specHash: graph.spec.hash 자신을 제외', () => {
  const a = clone(); a.graph.spec.hash = 'sha256:AAA'
  const b = clone(); b.graph.spec.hash = 'sha256:BBB'
  eq(specHash(a), specHash(b), 'hash 필드가 자기 해시에 영향을 줌:')
})

t('specHash: 내용이 바뀌면 해시도 바뀜', () => {
  const m = clone(); m.nodes[0].retry.max = 99
  ok(specHash(clone()) !== specHash(m), '변경이 해시에 반영 안 됨')
})

t('fingerprintHash: hash 필드 자신을 제외', () => {
  const a = { stack: ['x'], scale: { files: '1-29' }, markers: [], hash: 'sha256:AAA' }
  const b = { ...a, hash: 'sha256:BBB' }
  eq(fingerprintHash(a), fingerprintHash(b))
})

t('fingerprintHash: 버킷이 다르면 값도 다름 (판별력)', () => {
  const a = { stack: [], scale: { files: '1-29' }, markers: [] }
  const b = { stack: [], scale: { files: '500-1999' }, markers: [] }
  ok(fingerprintHash(a) !== fingerprintHash(b), '스케일 버킷이 무시됨')
})

console.log('\n── validate.mjs ──')

const STAMPED = stamp(clone())

t('실제 graph.json: 정적 검사 6/6 통과', () => {
  const r = validate(STAMPED)
  const bad = r.results.filter((x) => !x.passed)
  ok(bad.length === 0, `실패: ${bad.map((b) => b.name + ' → ' + b.violations.join('; ')).join(' / ')}`)
})

t('실제 graph.json: G0 통과 (필수 필드 10/10)', () => {
  const r = validate(STAMPED)
  const miss = r.fieldResults.filter((f) => !f.ok).map((f) => f.name)
  eq(r.metrics.ir_field_coverage, 1, `누락: ${miss.join(', ')} —`)
  ok(r.G0, 'G0 미통과')
})

t('★ 회귀: fan-in(합류)을 거부하지 않는다', () => {
  // v4에서 뺀 PlanCompiler 7번째 검사 "노드당 단일 inbound".
  // 넣으면 병렬 지점이 있는 정상 그래프를 전부 컴파일 실패시킨다.
  const g = stamp(clone())
  g.nodes.push(
    { id: 'p1', kind: 'work', runner: 'agent', retry: { max: 1, on_exhaust: 'fail' },
      policy: { requires_approval: false, reversible: true, budget: { tokens: 1, iterations: 1, wall_clock_s: 1 } } },
    { id: 'p2', kind: 'work', runner: 'agent', retry: { max: 1, on_exhaust: 'fail' },
      policy: { requires_approval: false, reversible: true, budget: { tokens: 1, iterations: 1, wall_clock_s: 1 } } },
    { id: 'join1', kind: 'join', runner: 'agent', retry: { max: 1, on_exhaust: 'fail' },
      policy: { requires_approval: false, reversible: true, budget: { tokens: 1, iterations: 1, wall_clock_s: 1 } } }
  )
  g.edges.push(
    { from: 'backend', to: 'p1', when: 'always' },
    { from: 'backend', to: 'p2', when: 'always' },
    { from: 'p1', to: 'join1', when: 'always' },   // ← 합류
    { from: 'p2', to: 'join1', when: 'always' }    // ← 합류
  )
  const r = validate(g)
  const bad = r.results.filter((x) => !x.passed)
  ok(bad.length === 0, `합류 그래프가 거부됨: ${bad.map((b) => b.violations.join('; ')).join(' / ')}`)
})

t('★ 회귀: 재시도 루프백이 있어도 진입점을 찾는다', () => {
  // 버그: 진입점을 "inbound 없는 노드"로 추론했는데, validate→frontend 재시도
  // 루프백 때문에 진입 노드에도 inbound가 생겨 "진입점 없음"으로 오판했다.
  // 해결: graph.entry 명시 필드. 추론하지 않는다.
  const g = stamp(clone())
  ok(g.edges.some((e) => e.to === g.graph.entry), '전제: 진입 노드에 inbound가 있어야 의미 있는 테스트')
  ok(validate(g).results[2].passed, '루프백 있는 그래프에서 진입점을 못 찾음')
})

t('#3 잡음: graph.entry 누락', () => {
  const g = stamp(clone())
  delete g.graph.entry
  ok(!validate(g).results[2].passed, '미탐')
  ok(!validate(g).G0, 'entry 없이 G0가 통과함')
})

t('#3 잡음: graph.entry가 없는 노드를 가리킴', () => {
  const g = stamp(clone())
  g.graph.entry = 'ghost'
  ok(!validate(g).results[2].passed, '미탐')
})

t('#1 잡음: state 밖 필드를 참조하는 게이트', () => {
  const g = stamp(clone())
  g.gates[0].field = 'nonexistent_field'
  ok(!validate(g).results[0].passed, '미탐')
})

t('#2 잡음: 비가역 노드가 승인 없음', () => {
  const g = stamp(clone())
  g.nodes.find((n) => n.id === 'install_hooks').policy.requires_approval = false
  ok(!validate(g).results[1].passed, '미탐')
})

t('#3 잡음: 도달 불가 노드', () => {
  const g = stamp(clone())
  g.nodes.push({ id: 'orphan', kind: 'work', runner: 'agent', retry: { max: 0, on_exhaust: 'fail' },
    policy: { requires_approval: false, reversible: true, budget: { tokens: 1, iterations: 1, wall_clock_s: 1 } } })
  g.edges.push({ from: 'orphan', to: 'orphan', when: 'always' })
  ok(!validate(g).results[2].passed, '미탐')
})

t('#4 잡음: 루프 상한 없는 순환 (게이트 기준)', () => {
  // v1.2 의미 변경: 순환을 끊는 것은 노드 retry.max 가 아니라 게이트 on_fail.max_retry 다.
  const g = stamp(clone())
  delete g.gates.find((x) => x.id === 'G4c').on_fail.max_retry
  ok(!validate(g).results[3].passed, '미탐 — backend 자기루프를 끊을 게이트 상한이 없음')
})

t('★ 회귀: 노드 retry.max 는 순환을 끊지 못한다', () => {
  // 옛 구현은 "순환 안에 retry.max 가진 노드가 있으면 통과"였는데, G0가 retry.max를
  // 전 노드에 강제하므로 그 조건이 절대 거짓이 될 수 없었다 → 검사가 공허했다.
  // 실측: 게이트 없는 무한 순환이 PASS 했다.
  const g = stamp(clone())
  g.edges.push({ from: 'human_go', to: 'backend', when: 'always' })  // 게이트 없는 순환
  ok(g.nodes.every((n) => Number.isInteger(n.retry?.max)), '전제: 전 노드에 retry.max 존재')
  ok(!validate(g).results[3].passed, '노드 retry.max 만으로 무한 순환이 통과함 — 검사가 공허하다')
})

t('★ 회귀: 죽은 게이트를 잡는다', () => {
  const g = stamp(clone())
  g.gates.push({ id: 'G_DEAD', field: 'archive_cases', op: '>=', threshold: 1,
                 on_fail: { goto: 'backend', max_retry: 0 }, ground_truth: 'measured' })
  ok(!validate(g).results[5].passed, '어떤 엣지도 참조하지 않는 게이트가 통과함')
})

t('★ 회귀: 유령 게이트 참조를 잡는다', () => {
  const g = stamp(clone())
  g.edges.push({ from: 'frontend', to: 'backend', when: 'gate:G99:pass' })
  ok(!validate(g).results[5].passed, 'gates[]에 없는 G99 참조가 통과함')
})

t('#5 잡음: 예산 없는 노드', () => {
  const g = stamp(clone())
  delete g.nodes[0].policy.budget
  ok(!validate(g).results[4].passed, '미탐')
})

t('#6 잡음: 존재하지 않는 노드를 가리키는 엣지', () => {
  const g = stamp(clone())
  g.edges.push({ from: 'frontend', to: 'ghost', when: 'always' })
  ok(!validate(g).results[5].passed, '미탐')
})

t('#6 잡음: when 형식 오류', () => {
  const g = stamp(clone())
  g.edges[0].when = '적당히 되면'
  ok(!validate(g).results[5].passed, '미탐 — 서술형 조건이 통과됨')
})

t('★ 서술형 게이트는 스키마가 거부한다', () => {
  const g = stamp(clone())
  g.gates[0].threshold = '충분히 높을 때'
  ok(validate(g).schemaViolations.length > 0, '서술형 threshold가 통과됨')
  ok(!validate(g).G0, 'G0가 서술형 게이트를 허용함')
})

t('★ 회귀: ratio 필드에 퍼센트 threshold', () => {
  const g = stamp(clone())
  g.state.find((s) => s.field === 'ir_field_coverage').type = 'ratio'
  g.gates.find((x) => x.id === 'G0').threshold = 95
  ok(validate(g).schemaViolations.some((v) => v.includes('ratio')), '단위 혼동을 못 잡음')
})

t('★ 회귀: 판정 불가 타입을 게이트가 참조', () => {
  const g = stamp(clone())
  g.state.find((s) => s.field === 'compile_hashes').type = 'ref'
  ok(validate(g).schemaViolations.some((v) => v.includes('판정 불가')), 'ref 참조가 통과함')
})

t('★ 회귀: threshold 가 boolean', () => {
  const g = stamp(clone())
  g.gates[0].threshold = true
  ok(!validate(g).G0, 'boolean threshold 가 G0를 통과함')
})

t('★ 회귀: 폐기된 runner 이름', () => {
  const g = stamp(clone())
  g.nodes[0].runner = 'workflow-script'
  ok(validate(g).schemaViolations.some((v) => v.includes('runner')), '옛 runner 이름이 통과함')
})

t('품질: scope·host 누락을 경고한다', () => {
  const g = stamp(clone())
  delete g.graph.scope
  delete g.graph.host
  const q = validate(g).quality
  ok(!q.has_scope && !q.has_host, 'Step 0·Step 5 결정 누락이 안 잡힘')
})

console.log('\n── render.mjs ──')

t('render: 3회 결과 동일 (순수)', () => {
  eq(new Set([render(STAMPED), render(STAMPED), render(STAMPED)]).size, 1)
})

t('render: 입력을 변형하지 않음', () => {
  const before = canonical(STAMPED)
  render(STAMPED)
  eq(canonical(STAMPED), before, '렌더러가 입력을 오염시킴:')
})

t('render: 모든 노드 id가 출력에 등장', () => {
  const md = render(STAMPED)
  for (const n of STAMPED.nodes) ok(md.includes(n.id), `노드 ${n.id} 누락`)
})

t('render: 모든 게이트가 출력에 등장', () => {
  const md = render(STAMPED)
  for (const x of STAMPED.gates) ok(md.includes(x.id), `게이트 ${x.id} 누락`)
})

t('render: 해시가 출력에 박힘 (조인 키 추적성)', () => {
  ok(render(STAMPED).includes(STAMPED.graph.spec.hash), 'spec.hash 누락')
})

t('render: 내용이 바뀌면 출력도 바뀜', () => {
  const m = structuredClone(STAMPED); m.nodes[0].retry.max = 42
  ok(render(STAMPED) !== render(m), '변경이 렌더 결과에 반영 안 됨')
})

console.log('\n── compile.mjs (② BACKEND) ──')

t('G4a: 3회 컴파일 결과 동일 (distinct_count == 1)', () => {
  const out = [compile(STAMPED), compile(STAMPED), compile(STAMPED)].map(sha256)
  eq(new Set(out).size, 1, '컴파일이 비결정적:')
})

t('★ INV-1: 컴파일러가 LLM을 호출하지 않는다', () => {
  const src = readFileSync(fileURLToPath(new URL('./compile.mjs', import.meta.url)), 'utf8')
  for (const bad of ['agent(', 'WebFetch', 'WebSearch', 'fetch(']) {
    // 문자열 리터럴로 생성 코드에 넣는 건 허용 — 실제 호출만 금지
    const calls = src.split('\n').filter((l) => l.includes(bad) && !l.trimStart().startsWith('//') && !l.includes('L.push') && !l.includes('q('))
    eq(calls.length, 0, `compile.mjs가 ${bad} 를 직접 호출함:`)
  }
})

t('컴파일러가 입력을 변형하지 않음', () => {
  const before = canonical(STAMPED)
  compile(STAMPED)
  eq(canonical(STAMPED), before, '컴파일러가 IR을 오염시킴:')
})

t('산출 스크립트가 구문상 유효하다', () => {
  // Workflow 스크립트는 최상위 export + 최상위 await/return 을 동시에 쓴다.
  // 함수 본문으로 감싸면 export 에서 깨지므로 export 만 벗기고 파싱한다.
  const src = compile(STAMPED).replace(/^export const meta =/m, 'const meta =')
  new Function('agent', 'phase', 'log', 'parallel', `return (async () => {\n${src}\n})`)
})

t('meta 블록이 순수 리터럴이다 (Workflow 요구사항)', () => {
  const m = /export const meta = (\{[\s\S]*?\n\})\n/.exec(compile(STAMPED))
  ok(m, 'meta 블록을 못 찾음')
  const meta = new Function(`return ${m[1]}`)()
  ok(meta.name && meta.description && Array.isArray(meta.phases), 'meta 필수 키 누락')
  eq(meta.phases.length, STAMPED.nodes.length, 'phase 수가 노드 수와 다름:')
})

t('지원하지 않는 호스트는 거절한다', () => {
  const g = structuredClone(STAMPED)
  g.graph.host.pipeline = '/pdca'
  let threw = false
  try { compile(g) } catch (e) { threw = /컴파일 대상 아님/.test(e.message) }
  ok(threw, '미구현 호스트를 조용히 컴파일함')
})

t('★ gate_loss == 0 (게이트·엣지 무손실)', () => {
  const loss = gateLoss(STAMPED, compile(STAMPED))
  eq(loss.length, 0, `누락: ${loss.join(' / ')} —`)
})

t('★ 회귀: 되돌아가는 엣지가 컴파일된다 (선형 코드는 못 했다)', () => {
  const src = compile(STAMPED)
  // G0 fail → frontend 처럼 앞 노드로 점프하는 엣지
  const back = STAMPED.edges.filter((e) => {
    const m = /^gate:([A-Za-z0-9_]+):fail$/.exec(e.when ?? '')
    return m && e.to !== e.from
  })
  ok(back.length > 0, '전제: 되돌아가는 엣지가 그래프에 있어야 의미 있는 테스트')
  for (const e of back) ok(src.includes(`current = ${JSON.stringify(e.to)}`), `${e.from}→${e.to} 점프 누락`)
})

t('★ 루프 상한이 게이트별로 따로 센다', () => {
  const src = compile(STAMPED)
  for (const x of STAMPED.gates) {
    const mr = x.on_fail?.max_retry
    if (!Number.isInteger(mr)) continue
    ok(src.includes(`LOOP[${JSON.stringify(x.id)}]`), `게이트 ${x.id} 루프 카운터 없음`)
    ok(src.includes(`> ${mr}`), `게이트 ${x.id} 상한 ${mr} 누락`)
  }
})

t('★ 스텝 예산 백스톱이 있다 (명세 밖 무한 전이 차단)', () => {
  const src = compile(STAMPED)
  ok(/MAX_STEPS = \d+/.test(src), 'MAX_STEPS 없음')
  ok(src.includes('step_budget_exhausted'), '예산 소진 처리 없음')
})

t('★ OR 함정을 컴파일 거부한다', () => {
  const g = structuredClone(STAMPED)
  // validate 노드에 게이트 하나 더 붙인다 → AND처럼 보이지만 실제로는 OR
  g.gates.push({ id: 'G_X', field: 'ir_schema_valid', op: '==', threshold: 1,
                 on_fail: { goto: 'frontend', max_retry: 1 }, ground_truth: 'measured' })
  g.edges.push({ from: 'validate', to: 'render_check', when: 'gate:G_X:pass' },
               { from: 'validate', to: 'frontend', when: 'gate:G_X:fail' })
  let msg = ''
  try { compile(g) } catch (e) { msg = e.message }
  ok(/OR/.test(msg), `OR 함정을 조용히 컴파일함: ${msg}`)
})

// ── 병렬 fan-out (v3 신규) ──────────────────────────────────────────────
// 실측 근거: 딥리서치가 만든 실사용 그래프 6개 중 3개가 검증 팬아웃을 가졌고,
// v2 컴파일러는 그 3개를 전부 거부했다. 아래는 그 형태를 그대로 재현한 픽스처다.
function fanGraph() {
  const g = structuredClone(STAMPED)
  const mk = (id, rationale) => ({
    id, kind: 'work', runner: 'script', rationale, produces: [], uses: [],
    retry: { max: 1, on_exhaust: 'fail' },
    policy: { allowed_tools: ['Bash'], requires_approval: false, reversible: true,
              budget: { tokens: 1000, iterations: 1, wall_clock_s: 60 } },
  })
  g.nodes.push(mk('v_a', '검증 A'), mk('v_b', '검증 B'),
    { ...mk('j1', '합류'), kind: 'join' })
  g.state.push({ field: 'a_fail', type: 'int', unit: 'count' },
                { field: 'b_fail', type: 'int', unit: 'count' })
  // backend 의 기존 G4c 분기를 팬아웃으로 교체
  g.edges = g.edges.filter((e) => e.from !== 'backend')
  g.edges.push(
    { from: 'backend', to: 'v_a', when: 'always' },
    { from: 'backend', to: 'v_b', when: 'always' },
    { from: 'v_a', to: 'j1', when: 'gate:G_A:pass' },
    { from: 'v_a', to: 'backend', when: 'gate:G_A:fail' },
    { from: 'v_b', to: 'j1', when: 'gate:G_B:pass' },
    { from: 'v_b', to: 'backend', when: 'gate:G_B:fail' },
    { from: 'j1', to: 'compile_check', when: 'always' },
  )
  g.gates = g.gates.filter((x) => x.id !== 'G4c')
  // G4c 게이트를 뺐으므로 훅 강제 선언에서도 뺀다 — 유령 게이트 강제 선언은 스키마 위반이다
  if (g.graph.host?.enforced_by_hook) {
    g.graph.host.enforced_by_hook = g.graph.host.enforced_by_hook.filter(
      (e) => (typeof e === 'string' ? e : e?.gate) !== 'G4c')
  }
  g.gates.push(
    { id: 'G_A', field: 'a_fail', op: '==', threshold: 0,
      on_fail: { goto: 'backend', max_retry: 2 }, ground_truth: 'measured', threshold_source: '테스트' },
    { id: 'G_B', field: 'b_fail', op: '==', threshold: 0,
      on_fail: { goto: 'backend', max_retry: 2 }, ground_truth: 'measured', threshold_source: '테스트' },
  )
  return stamp(g)
}

t('★ 팬아웃이 parallel() 로 컴파일된다', () => {
  const src = compile(fanGraph())
  ok(src.includes('await parallel(['), 'parallel 방출 없음')
  ok(src.includes('"v_a"') && src.includes('"v_b"'), '갈래 누락')
  ok(src.includes('current = "j1"'), 'join 으로 가는 경로 없음')
})

t('★ 팬아웃 그래프도 gate_loss == 0', () => {
  const g = fanGraph()
  const loss = gateLoss(g, compile(g))
  eq(loss.length, 0, `누락: ${loss.join(' / ')} —`)
})

t('★ 갈래 게이트 실패는 게이트 id 순으로 목적지를 정한다 (결정론)', () => {
  const src = compile(fanGraph())
  ok(src.includes('FAILED.sort('), '실패 정렬 없음 — 목적지가 비결정적')
  ok(src.includes('LOOP[F.gate]'), '갈래 루프 카운터 없음')
})

t('★ 갈래가 서로 다른 곳으로 모이면 거부한다', () => {
  const g = structuredClone(fanGraph())
  g.edges = g.edges.map((e) => (e.from === 'v_b' && e.when === 'gate:G_B:pass' ? { ...e, to: 'compile_check' } : e))
  let msg = ''
  try { compile(stamp(g)) } catch (e) { msg = e.message }
  ok(/단일 join/.test(msg), `발산하는 합류를 통과시킴: ${msg}`)
})

t('★ 흡수된 갈래 노드는 자체 case 를 갖지 않는다', () => {
  const src = compile(fanGraph())
  eq((src.match(/case "v_a":/g) ?? []).length, 0, 'v_a 가 중복 case 로 방출됨:')
})

// ── 휴먼 게이트 + 재개 (v3 신규) ────────────────────────────────────────
t('★ 휴먼 노드의 게이트가 소실되지 않는다', () => {
  // 실측 근거: balju-erp·real-estate-agent 가 design_approved·owner_go 등을 잃었다.
  const g = structuredClone(STAMPED)
  g.state.push({ field: 'owner_go', type: 'bool', unit: 'none' })
  g.edges = g.edges.filter((e) => e.from !== 'human_go')
  g.edges.push({ from: 'human_go', to: 'install_hooks', when: 'gate:G_GO:pass' },
               { from: 'human_go', to: 'backend', when: 'gate:G_GO:fail' })
  g.gates.push({ id: 'G_GO', field: 'owner_go', op: '==', threshold: 1,
                 on_fail: { goto: 'backend', max_retry: 1 }, ground_truth: 'human',
                 threshold_source: '사람 승인' })
  const st = stamp(g)
  const src = compile(st)
  ok(src.includes('awaiting:'), 'awaiting 블록 없음')
  ok(src.includes('"owner_go"'), '휴먼 게이트 필드 소실')
  ok(src.includes('resume_to_pass: "install_hooks"'), 'pass 목적지 없음')
  ok(src.includes('resume_to_fail: "backend"'), 'fail 목적지 없음')
  eq(gateLoss(st, src).length, 0, '휴먼 게이트에서 손실 발생:')
})

t('★ 재개 입력을 받는다 (③ "완료까지 구동"의 전제)', () => {
  const src = compile(STAMPED)
  ok(src.includes('A.resume_from'), '재개 진입점 없음')
  ok(src.includes('A.resume_state'), '상태 복원 없음')
  ok(src.includes('A.resume_loops'), '루프 카운터 복원 없음')
})

t('★ 회귀: args 가 문자열로 와도 조용히 처음부터 돌지 않는다', () => {
  // 실행에서 발견: args 를 JSON 문자열로 넘겼더니 typeof 검사에 걸려 {} 로 떨어지고
  // 이미 끝낸 노드 4개를 다시 실행했다. 조용히 틀리는 동작.
  const src = compile(STAMPED)
  ok(src.includes('typeof args === "string"'), '문자열 args 처리 없음')
  ok(src.includes('JSON.parse(args)'), '문자열 파싱 없음')
  ok(/log\("args 가 문자열로 왔다/.test(src), '문자열 수신을 조용히 넘김')
})

t('★ 회귀: 존재하지 않는 resume_from 을 거부한다', () => {
  const src = compile(STAMPED)
  ok(src.includes('NODE_IDS'), '노드 id 집합 없음')
  ok(src.includes('bad_resume_from'), '잘못된 재개 지점을 거부하지 않음')
  // 집합에 실제 노드가 다 들어 있어야 오탐이 안 난다
  for (const n of STAMPED.nodes) ok(src.includes(`"${n.id}"`), `NODE_IDS 에 ${n.id} 누락`)
})

t('★ 회귀: resume_to 가 문자열 "null" 이 아니다', () => {
  // 실행에서 발견: q() 가 String(null) 을 거쳐 "null" 을 뱉었다.
  const src = compile(STAMPED)
  ok(!/resume_to: "null"/.test(src), 'null 이 문자열로 새어나옴')
  ok(/resume_to: (null|"[^"]+")/.test(src), 'resume_to 방출 형태가 깨짐')
})

t('★ 회귀: description 에 "1회분"이 중복되지 않는다', () => {
  const g = structuredClone(STAMPED)
  g.graph.scope.unit = '상태 기계 실행 검증 1회분'
  const m = /description: "([^"]*)"/.exec(compile(g))
  ok(m, 'description 을 못 찾음')
  ok(!/1회분\s*1회분/.test(m[1]), `중복: ${m[1]}`)
})

t('휴먼 노드에서 멈추고 넘긴다', () => {
  const src = compile(STAMPED)
  ok(src.includes("reason: 'human_gate'"), '휴먼 게이트가 산출에 없음')
})

t('게이트 임계값이 산출 코드에 그대로 박힌다 (무손실)', () => {
  const src = compile(STAMPED)
  for (const x of STAMPED.gates) {
    ok(src.includes(`${x.op === '==' ? '===' : x.op} ${x.threshold}`), `게이트 ${x.id} 임계값 누락`)
  }
})

console.log('\n── 스키마 버저닝 (X4) + 실사용 투입 회귀 ──')

/** 컴파일이 거부하면 true. 거부 사유도 같이 돌려준다. */
const refused = (g) => {
  try { compile(g); return { refused: false, why: null } }
  catch (e) { return { refused: true, why: e.message } }
}

t('★ 회귀(D1): G0 미달 그래프를 컴파일이 거부한다', () => {
  // v3까지 compile 은 validate 를 아예 안 봤다. 스키마 위반 그래프 6개가 전부 exit=0 으로
  // 컴파일됐고, "gate_loss 0 · 6/6" 이라는 숫자가 그 위에서 나왔다.
  const g = structuredClone(STAMPED)
  g.nodes[0].kind = 'gate'                       // v1.4 어휘 위반
  ok(!validate(g).G0, '전제: 이 그래프는 G0 미달이어야 한다')
  const r = refused(g)
  ok(r.refused, 'G0 미달인데 컴파일이 통과했다 — 조용히 틀리는 코드가 나온다')
  ok(/G0 미달/.test(r.why), `거부 사유가 G0를 가리켜야 한다: ${r.why}`)
})

t('★ 회귀(D3/D4): target·task 가 없으면 v1.4 에서 G0 미달이다', () => {
  // 실사용 투입에서 걸린 결함 — 그래프가 "어디서/무엇을" 을 표현할 자리 자체가 없었다.
  for (const drop of ['target', 'task']) {
    const g = structuredClone(STAMPED)
    delete g.graph[drop]
    const v = validate(g)
    ok(!v.G0, `graph.${drop} 를 지웠는데 G0 가 통과했다`)
    ok(v.fieldResults.some((f) => f.name.startsWith(`graph.${drop}`) && !f.ok),
       `graph.${drop} 누락이 필수 필드로 잡히지 않았다`)
    ok(refused(g).refused, `graph.${drop} 없는 그래프가 컴파일됐다`)
  }
})

t('★ 회귀(D5): 산출 코드가 대상·과제·fingerprint 를 싣는다', () => {
  // 측정해서 IR에 저장해놓고 프롬프트에 안 싣던 결함. 계측했으면 소비해야 한다.
  const src = compile(STAMPED)
  ok(src.includes(STAMPED.graph.target.root), '대상 저장소 경로가 산출 코드에 없다')
  ok(src.includes(STAMPED.graph.task.request.slice(0, 24)), '과제 요청이 산출 코드에 없다')
  const fp = STAMPED.project.fingerprint
  for (const m of (fp.markers ?? []).slice(0, 3)) {
    ok(src.includes(m.slice(0, 20)), `fingerprint 표식이 실리지 않았다: ${m.slice(0, 20)}`)
  }
})

t('★ 회귀(D5): 모든 agent 프롬프트가 공유 컨텍스트를 받는다', () => {
  const src = compile(STAMPED)
  const calls = (src.match(/agent\(/g) ?? []).length
  const withCtx = (src.match(/agent\(CTX \+ /g) ?? []).length
  ok(calls > 0, 'agent 호출이 하나도 없다')
  eq(withCtx, calls, 'CTX 를 못 받는 agent 호출이 있다:')
})

t('★ X4: v1.1 그래프는 옛 어휘(kind:gate·runner:workflow-script)를 통과시킨다', () => {
  // 과거 그래프는 과거 규칙으로 판정한다 — 안 그러면 회귀 측정 정본 6개가 통째로 사라진다.
  const g = structuredClone(STAMPED)
  g.graph.spec.version = '1.1.0'
  g.nodes[0].kind = 'gate'
  g.nodes[1].runner = 'workflow-script'
  const v = validate(g)
  eq(v.schema.applied, '1.1', '적용 스키마:')
  eq(v.schemaViolations.length, 0, `v1.1 어휘가 위반으로 잡혔다: ${v.schemaViolations.join(' / ')}`)
})

t('★ X4: 같은 어휘를 v1.4 는 거부한다', () => {
  const g = structuredClone(STAMPED)
  g.nodes[0].kind = 'gate'
  g.nodes[1].runner = 'workflow-script'
  const v = validate(g)
  eq(v.schema.applied, '1.4', '적용 스키마:')
  ok(v.schemaViolations.length >= 2, 'v1.4 에서 폐기 어휘가 통과했다')
})

t('★ X4: v1.1 은 검증되지만 컴파일은 거부된다 (검증≠실행가능)', () => {
  // 이게 핵심 구분이다. v1.1 에는 target·task 를 적을 자리가 없으므로,
  // 컴파일해봐야 에이전트가 대상도 과제도 모르는 코드가 나온다.
  const g = structuredClone(STAMPED)
  g.graph.spec.version = '1.1.0'
  eq(validate(g).schema.runnable, false, 'v1.1 runnable:')
  const r = refused(g)
  ok(r.refused, 'v1.1 그래프가 컴파일됐다')
  ok(/검증 전용/.test(r.why), `거부 사유가 실행불가를 가리켜야 한다: ${r.why}`)
})

t('★ X4: 미지원 버전은 조용히 통과하지 않는다', () => {
  for (const bad of ['0.9.0', 'v1.4', '', undefined]) {
    const g = structuredClone(STAMPED)
    g.graph.spec.version = bad
    const v = validate(g)
    eq(v.schema.applied, null, `'${bad}' 적용 스키마:`)
    ok(!v.G0, `'${bad}' 인데 G0 가 통과했다`)
    ok(refused(g).refused, `'${bad}' 인데 컴파일됐다`)
  }
})

t('★ X4: 선언 버전과 적용 스키마를 보고한다', () => {
  const v = validate(STAMPED)
  eq(v.schema.declared, STAMPED.graph.spec.version, '선언 버전:')
  eq(v.schema.applied, '1.4', '적용 스키마:')
  eq(v.schema.runnable, true, '실행 가능:')
  eq(v.schema.required_count, 13, 'v1.4 필수 필드 수:')
})

t('★ 회귀(D6): requires_approval 노드는 실행 전에 멈춘다', () => {
  // v3까지 requires_approval 은 산출 코드에 한 줄도 안 나갔다. validate 검사 #2가
  // "비가역 노드가 승인을 선언했는가"를 통과시킨 뒤 컴파일러가 그 선언을 버렸다.
  const src = compile(STAMPED)
  const need = STAMPED.nodes.filter((n) => n.policy?.requires_approval === true && n.kind !== 'human')
  ok(need.length > 0, '전제: 승인 필요 노드가 있어야 한다')
  for (const n of need) {
    ok(src.includes(`APPROVED.has(${JSON.stringify(n.id)})`), `노드 ${n.id}: 승인 게이트가 방출되지 않았다`)
    ok(src.includes(`stopped_at: ${JSON.stringify(n.id)}, reason: 'approval_required'`),
       `노드 ${n.id}: 승인 정지가 없다`)
  }
})

t('★ 회귀(D6): 비가역 노드는 승인 없이 실행되지 않는다', () => {
  const src = compile(STAMPED)
  for (const n of STAMPED.nodes.filter((x) => x.policy?.reversible === false && x.kind !== 'human')) {
    const at = src.indexOf(`case ${JSON.stringify(n.id)}`)
    ok(at >= 0, `노드 ${n.id} 의 case 가 없다`)
    const body = src.slice(at, at + 900)
    const gateAt = body.indexOf('APPROVED.has')
    const workAt = body.indexOf('agent(CTX')
    ok(gateAt >= 0, `비가역 노드 ${n.id}: 승인 게이트 없음`)
    ok(workAt < 0 || gateAt < workAt, `비가역 노드 ${n.id}: 승인 게이트가 실행보다 뒤에 있다`)
    ok(/irreversible: true/.test(body), `비가역 노드 ${n.id}: 비가역 표시가 없다`)
  }
})

t('★ 회귀(D6): 승인되면 그 노드를 실행한다', () => {
  const src = compile(STAMPED)
  // APPROVED 는 args.approved 로만 채워진다 — 기본값이 "전부 승인"이면 게이트가 공허해진다
  ok(src.includes('const APPROVED = new Set(Array.isArray(A.approved) ? A.approved : [])'),
     'APPROVED 초기화가 args.approved 기반이 아니다')
  ok(!/APPROVED = new Set\(\[/.test(src), 'APPROVED 가 기본으로 채워져 있다 — 게이트가 공허하다')
})

t('★ D6: 승인 필요한 노드가 팬아웃 갈래면 컴파일을 거부한다', () => {
  // 갈래는 parallel() 안에서 돌아 실행 전에 멈출 자리가 없다.
  const g = fanGraph()
  const b = g.nodes.find((n) => n.id === 'v_a')
  b.policy.requires_approval = true
  const r = refused(g)
  ok(r.refused, '승인 필요한 갈래가 조용히 컴파일됐다')
  ok(/팬아웃 갈래/.test(r.why), `거부 사유가 팬아웃을 가리켜야 한다: ${r.why}`)
})

t('★ 회귀: CTX 추가 후에도 컴파일은 결정적이다 (G4a)', () => {
  const a = compile(STAMPED), b = compile(structuredClone(STAMPED))
  eq(sha256(a), sha256(b), '같은 IR 이 다른 바이트를 냈다:')
})

console.log('\n── 훅 산출 (D7 — 선언-실재 대조) ──')
// 다섯 번째 사례 (2026-08-25): host.enforced_by_hook 가 IR에 선언되고 G0·G4c·gate_loss 전부
// 초록을 받았지만, 훅 파일은 존재한 적이 없었다 — 선언을 아무 게이트도 쳐다보지 않았다.
// requires_approval(네 번째)·fingerprint(두 번째)와 같은 계열: 검증되고 폐기된 선언.

t('★ D7: 강제 선언된 게이트가 전부 hooks.json 에 실린다 (hook_loss 0)', () => {
  const hooks = compileHooks(STAMPED)
  ok(hooks, 'hooks.json 이 산출되지 않았다')
  const loss = hookLoss(STAMPED, hooks)
  eq(loss.length, 0, `hook_loss: ${loss.join(' / ')} —`)
  const parsed = JSON.parse(hooks)
  for (const e of STAMPED.graph.host.enforced_by_hook) {
    ok(parsed.hooks.some((h) => h.gate === e.gate && h.check === e.check),
       `게이트 ${e.gate} 가 훅 명세에 없거나 check 가 다르다`)
  }
  eq(parsed.spec_hash, STAMPED.graph.spec.hash, '조인 키(spec_hash):')
})

t('★ D7: check 없는 강제 선언은 hook_loss 로 잡힌다 (선언-후-폐기 차단)', () => {
  const g = structuredClone(STAMPED)
  g.graph.host.enforced_by_hook = ['G0']   // 구형 — 기계 없는 선언
  const loss = hookLoss(g, compileHooks(g))
  ok(loss.length === 1 && /check 명령이 없어/.test(loss[0]),
     `기계 없는 선언이 조용히 통과했다: [${loss.join(' / ')}]`)
})

t('★ D7: 유령 게이트 강제 선언은 스키마 위반이다', () => {
  const g = structuredClone(STAMPED)
  g.graph.host.enforced_by_hook = [{ gate: 'G99', check: 'node tools/validate.mjs graph.json' }]
  const v = validate(g)
  ok(v.schemaViolations.some((x) => x.includes('G99')), '존재하지 않는 게이트 강제 선언이 통과했다')
  ok(!v.G0, '유령 게이트 강제 선언인데 G0 가 통과했다')
})

t('★ D7: hooks.json 산출이 결정적이다 (G4a 계열)', () => {
  const out = [compileHooks(STAMPED), compileHooks(STAMPED), compileHooks(STAMPED)].map(sha256)
  eq(new Set(out).size, 1, '훅 산출이 비결정적:')
})

t('★ state_file 선언이 산출 코드에 실린다 (선언했으면 소비한다)', () => {
  const src = compile(STAMPED)
  ok(src.includes(STAMPED.graph.host.state_file), 'state_file 경로가 산출 코드에 없다')
  ok(src.includes('state_file: STATE_FILE'), '반환 객체에 state_file 이 실리지 않는다')
})

console.log('\n── ABANDON (포기는 종단이되 성공이 아니다) ──')

t('★ ABANDON: 최종 completed 는 ABANDONED 가 비어 있을 때만 true 다', () => {
  const src = compile(STAMPED)
  ok(src.includes('completed: ABANDONED.length === 0'),
     '최종 반환의 completed 가 무조건 true 다 — partial 소진이 성공으로 둔갑한다')
  ok(!/return \{ completed: true/.test(src), '무조건 completed:true 반환이 남아 있다')
})

/** 실행 의미론 픽스처 — 게이트 1개짜리 최소 그래프. compile 산출물을 스텁 호스트로 실제 구동한다 */
function miniGraph(onExhaust) {
  const pol = { allowed_tools: [], requires_approval: false, reversible: true,
                budget: { tokens: 1000, iterations: 1, wall_clock_s: 60 } }
  const fp = { stack: [], scale: { files: '1-29', modules: '1-2' }, markers: [] }
  return stamp({
    graph: {
      spec: { version: '1.4.0', hash: 'sha256:PENDING' },
      name: 'mini', mode: 'B', entry: 'n1',
      host: { pipeline: 'workflow-script', state_file: '.avalon/runs/mini.jsonl', enforced_by_hook: [] },
      target: { root: 'X:/mini', vcs: 'none' },
      task: { id: 'mini', request: '실행 의미론 테스트 1회분' },
      scope: { unit: '테스트' },
    },
    project: { fingerprint: { ...fp, hash: fingerprintHash(fp) } },
    state: [{ field: 'm', type: 'int', unit: 'count' }],
    nodes: [
      { id: 'n1', kind: 'work', runner: 'agent', rationale: '피검 노드',
        retry: { max: 0, on_exhaust: onExhaust }, policy: pol, produces: [], uses: [] },
      { id: 'h1', kind: 'human', runner: 'manual', rationale: '실패 시 사람에게 넘긴다',
        retry: { max: 0, on_exhaust: 'halt' }, policy: { ...pol, requires_approval: true }, produces: [], uses: [] },
    ],
    edges: [{ from: 'n1', to: 'h1', when: 'gate:G_T:fail' }],
    gates: [{ id: 'G_T', field: 'm', op: '==', threshold: 1,
              on_fail: { goto: 'h1', max_retry: 0 }, ground_truth: 'measured', threshold_source: '테스트' }],
    policy: { defaults: {} },
  })
}

/** 컴파일 산출물을 Workflow 호스트 없이 실행한다 — agent/phase/log/parallel 스텁 주입 */
async function execute(g, agentStub, args = {}) {
  const src = compile(g).replace(/^export const meta =/m, 'const meta =')
  const fn = new Function('agent', 'phase', 'log', 'parallel', 'args',
    `return (async () => {\n${src}\n})()`)
  return fn(agentStub, () => {}, () => {}, async (thunks) => Promise.all(thunks.map((f) => f())), args)
}

await ta('★ ABANDON(실행): partial 소진은 전진하되 completed 를 승격시키지 못한다', async () => {
  const r = await execute(miniGraph('partial'), async () => ({ m: 0 }))
  eq(r.completed, false, 'partial 소진인데 completed:')
  eq(r.abandoned?.length, 1, 'abandoned 증거 수:')
  const a = r.abandoned[0]
  eq(a.gate, 'G_T', '포기된 게이트:')
  eq(a.measured, 0, '실측값 증거:')
  eq(a.threshold, 1, '임계값 증거:')
  eq(a.attempts, 1, '시도 횟수 증거:')
  eq(r.state_file, '.avalon/runs/mini.jsonl', '반환값의 state_file:')
})

await ta('★ ABANDON(실행): fail 소진은 증거를 싣고 멈춘다', async () => {
  const r = await execute(miniGraph('fail'), async () => ({ m: 0 }))
  eq(r.reason, 'loop_exhausted:G_T', '중단 사유:')
  eq(r.completed, false, 'fail 소진인데 completed:')
  eq(r.abandoned?.length, 1, 'abandoned 증거 수:')
  eq(r.abandoned[0].measured, 0, '실측값 증거:')
})

await ta('★ ABANDON(실행): 게이트를 통과하면 completed:true / abandoned 0건이다', async () => {
  const r = await execute(miniGraph('fail'), async () => ({ m: 1 }))
  eq(r.completed, true, '통과했는데 completed:')
  eq(r.abandoned?.length, 0, '통과했는데 abandoned:')
  eq(r.state_file, '.avalon/runs/mini.jsonl', '완주 반환값의 state_file:')
})

console.log('\n── 배포 동기화 ──')

t('avalon/tools 와 skill/tools 가 갈라지지 않았다', () => {
  // 도구는 두 곳에 산다: avalon/tools(개발 정본), graph-architect/tools(런타임).
  // 드리프트를 규율이 아니라 게이트로 막는다.
  const RUNTIME = 'C:/Users/KHS/.claude/skills/graph-architect/tools'
  // fileURLToPath 필수 — .pathname은 Windows 한글 경로를 URL 인코딩해서 깨진다
  const DEV = fileURLToPath(new URL('.', import.meta.url))
  if (!existsSync(RUNTIME)) { console.log('         ↳ (런타임 사본 없음 — 건너뜀)'); return }
  if (sha256(DEV) === sha256(RUNTIME + '/')) return  // 자기 자신과 비교하는 경우
  // run.mjs 는 미러에만 있고 정본에 없던 역방향 드리프트가 실제로 있었다 (2026-08-25 발견).
  // 4파일만 검사하던 이 게이트가 못 잡았다 — 이제 러너·스캐폴드까지 전부 잰다.
  for (const f of ['hash.mjs', 'validate.mjs', 'render.mjs', 'compile.mjs', 'run.mjs', 'scaffold.mjs']) {
    const a = sha256(readFileSync(DEV + f, 'utf8'))
    const b = sha256(readFileSync(`${RUNTIME}/${f}`, 'utf8'))
    eq(a, b, `${f} 가 두 위치에서 다름 — 재배포 필요:`)
  }
})

console.log('\n' + '─'.repeat(46))
console.log(`  ${fail === 0 ? '🟢 ALL PASS' : '🔴 FAIL'}   ${pass} passed / ${fail} failed`)
console.log('─'.repeat(46) + '\n')
process.exit(fail === 0 ? 0 : 1)
