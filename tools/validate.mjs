/**
 * Avalon IR — 정적 검사 6종 (G4c) + G0 판정
 *
 * INV-1: 순수 함수. LLM 없이 전부 판정 가능하다.
 *
 * ⚠️ PlanCompiler의 7번째 검사 "노드당 단일 inbound"는 의도적으로 **넣지 않는다.**
 *    fan-in/join/barrier를 금지하므로 병렬 지점이 있는 Avalon 그래프를 전부 거부한다.
 *    avalon-graph.md v4 "게이트 설계에서 제거한 것" 참조.
 */

const VALID_OPS = new Set(['==', '>=', '<=', '>', '<'])
const VALID_GROUND_TRUTH = new Set(['measured', 'reported', 'human', 'assumed'])
const VALID_TYPES = new Set(['int', 'ratio', 'bool', 'enum', 'ref', 'text'])
const VALID_UNITS = new Set(['count', 'percent', 'ratio', 'ms', 'usd', 'none'])
// 게이트가 참조할 수 있는 타입. enum·ref·text 는 판정 불가 — 카운터로 파생시켜야 한다
const GATEABLE_TYPES = new Set(['int', 'ratio', 'bool'])
const VALID_WHEN = /^(always|gate:[A-Za-z0-9_]+:(pass|fail))$/

/**
 * 스키마 버저닝 (X4) — `graph.spec.version` 이 검증 어휘를 고른다.
 *
 * 왜 필요한가: v4에서 `kind:"gate"` 를 폐기하고, 실행에 필요한 target·task 를 새로 넣었다.
 * 그런데 그 전에 만든 실사용 그래프가 6개 있다(전부 v1.1.0).
 *   - 전부 거부하면 회귀 측정 정본이 사라진다
 *   - 전부 통과시키면 폐기한 어휘가 영원히 산다
 * 그래서 **과거 그래프는 과거 규칙으로** 판정한다.
 *
 * ⚠️ 단 `runnable: false` 인 버전은 **컴파일이 거부한다.** 검증 통과와 실행 가능은 다른 문제다 —
 *    v1.1에는 "어느 저장소에서 무엇을 하는가"를 적을 자리가 아예 없어서, 컴파일해봐야
 *    에이전트가 대상도 과제도 모르는 코드가 나온다. 실사용 투입에서 실제로 걸린 결함.
 */
const SCHEMAS = {
  '1.1': {
    // 'gate'·'workflow-script' 는 v1.1 당시의 어휘다. 실측에서 게이트 노드가 0~16개로
    // 갈리고 전부 통과한 것이 폐기 근거였으므로, 과거 그래프에 소급 적용하지 않는다.
    kinds: new Set(['work', 'human', 'join', 'gate']),
    runners: new Set(['agent', 'script', 'hook', 'manual', 'workflow-script']),
    // 'judged'(=LLM 판정)는 v1.1 어휘다. v1.4에서 measured|reported|human|assumed 4종으로 좁혔다.
    groundTruth: new Set([...VALID_GROUND_TRUTH, 'judged']),
    extraFields: [],
    runnable: false,
  },
  '1.4': {
    // 게이트는 노드가 아니다 — gates[] + edges[].when 으로만 존재한다.
    // workflow-script 는 host.pipeline 이지 노드 runner 가 아니다. 결정적 코드 노드는 script.
    kinds: new Set(['work', 'human', 'join']),
    runners: new Set(['agent', 'script', 'hook', 'manual']),
    groundTruth: VALID_GROUND_TRUTH,
    extraFields: [
      ['graph.target.root', (g) => nonEmpty(g.graph?.target?.root)],
      ['graph.task.request', (g) => nonEmpty(g.graph?.task?.request)],
    ],
    runnable: true,
  },
}

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0

/** 선언 버전 이하의 최신 스키마를 고른다. 아는 것보다 낮으면 null(미지원). */
export function schemaFor(version) {
  const m = /^(\d+)\.(\d+)\.\d+$/.exec(version ?? '')
  if (!m) return null
  const [wantMajor, wantMinor] = [Number(m[1]), Number(m[2])]
  let key = null
  for (const k of Object.keys(SCHEMAS).sort()) {
    const [a, b] = k.split('.').map(Number)
    if (a < wantMajor || (a === wantMajor && b <= wantMinor)) key = k
  }
  return key ? { key, ...SCHEMAS[key] } : null
}

/** G0 공통 필수 필드 11종 — ir-schema.md §6 (버전별 extraFields 가 뒤에 붙는다) */
const BASE_FIELDS = [
  ['graph.entry', (g) => !!g.graph?.entry && g.nodes?.some((n) => n.id === g.graph.entry)],
  ['nodes[].id', (g) => g.nodes?.length > 0 && g.nodes.every((n) => !!n.id)],
  ['edges', (g) => Array.isArray(g.edges) && g.edges.length > 0],
  ['gates{field,op,threshold}', (g) =>
    g.gates?.length > 0 &&
    g.gates.every((x) => !!x.field && VALID_OPS.has(x.op) && typeof x.threshold === 'number')],
  ['state', (g) => Array.isArray(g.state) && g.state.length > 0],
  ['retry.max', (g) => g.nodes?.every((n) => Number.isInteger(n.retry?.max))],
  ['human_gate', (g) => g.nodes?.some((n) => n.kind === 'human')],
  ['policy', (g) => g.nodes?.every((n) => !!n.policy)],
  ['graph.spec.hash', (g) => isHash(g.graph?.spec?.hash)],
  ['graph.spec.version', (g) => /^\d+\.\d+\.\d+$/.test(g.graph?.spec?.version ?? '')],
  ['project.fingerprint', (g) => !!g.project?.fingerprint && isHash(g.project.fingerprint.hash)],
]

const isHash = (v) => typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v)

// ── 정적 검사 6종 ───────────────────────────────────────────────────────────

/** #1 게이트가 state 화이트리스트 밖 필드를 참조하는가 */
function checkGateFields(g) {
  const allowed = new Set((g.state ?? []).map((s) => s.field))
  return (g.gates ?? [])
    .filter((gate) => !allowed.has(gate.field))
    .map((gate) => `게이트 ${gate.id}: state에 없는 필드 '${gate.field}'`)
}

/** #2 비가역 노드가 승인 없이 실행되는가 (G6) */
function checkIrreversibleApproval(g) {
  return (g.nodes ?? [])
    .filter((n) => n.policy?.reversible === false && n.policy?.requires_approval !== true)
    .map((n) => `노드 ${n.id}: reversible=false 인데 requires_approval 아님`)
}

/**
 * #3 진입점에서 도달 불가한 노드가 있는가
 *
 * ⚠️ 진입점은 **추론하지 않는다.** `graph.entry`로 명시받는다.
 *    재시도 루프백(gate:X:fail → 앞 노드)이 있으면 진입 노드에도 inbound가 생기므로
 *    "inbound 없는 노드 = 진입점" 추론이 원리적으로 성립하지 않는다.
 *    자기적용(avalon-phase0)에서 실제로 걸린 결함.
 */
function checkReachability(g) {
  const ids = (g.nodes ?? []).map((n) => n.id)
  const entry = g.graph?.entry
  if (!entry) return ['graph.entry 없음 — 진입점을 명시해야 한다']
  if (!ids.includes(entry)) return [`graph.entry '${entry}': 그런 노드 없음`]
  const entries = [entry]

  const adj = new Map(ids.map((id) => [id, []]))
  for (const e of g.edges ?? []) adj.get(e.from)?.push(e.to)

  const seen = new Set(entries)
  const stack = [...entries]
  while (stack.length) {
    for (const nxt of adj.get(stack.pop()) ?? []) {
      if (!seen.has(nxt)) { seen.add(nxt); stack.push(nxt) }
    }
  }
  return ids.filter((id) => !seen.has(id)).map((id) => `노드 ${id}: 진입점에서 도달 불가`)
}

/**
 * #4 종료 보장 없는 순환 경로가 있는가 (Tarjan SCC)
 *
 * ⚠️ v1.2에서 판정 기준을 바꿨다. 이전 구현은 "순환 안에 retry.max 가진 노드가 있는가"를
 *    봤는데, G0가 retry.max를 **전 노드에 강제**하므로 그 조건은 G0 통과 그래프에서
 *    절대 거짓이 될 수 없었다 → 검사가 공허했다(실측: 게이트 없는 무한 순환이 PASS).
 *
 *    올바른 기준: 순환을 끊는 것은 노드 재시도가 아니라 **게이트 루프 상한**이다.
 *    - nodes[].retry.max   = 그 노드 자체의 실행 실패(크래시·타임아웃) 재실행
 *    - gates[].on_fail.max_retry = 그 게이트가 만든 루프를 도는 횟수
 *    둘은 독립이고, 순환 종료를 보장하는 것은 후자뿐이다.
 */
function checkTermination(g) {
  const ids = (g.nodes ?? []).map((n) => n.id)
  const gateById = new Map((g.gates ?? []).map((x) => [x.id, x]))

  // 유계 엣지 = 유한한 on_fail.max_retry 를 가진 게이트의 fail 엣지.
  // 이런 엣지를 **제거한 뒤에도 순환이 남으면** 그 순환은 영원히 돈다.
  // (SCC 안에 유계 엣지가 하나라도 있으면 통과시키는 방식은 틀렸다 — 큰 SCC는
  //  유계 부분순환과 무계 부분순환을 동시에 가질 수 있다. 실측으로 걸렸다.)
  const isBounded = (e) => {
    const m = /^gate:([A-Za-z0-9_]+):fail$/.exec(e.when ?? '')
    return !!m && Number.isInteger(gateById.get(m[1])?.on_fail?.max_retry)
  }

  const adj = new Map(ids.map((id) => [id, []]))
  for (const e of g.edges ?? []) if (adj.has(e.from) && !isBounded(e)) adj.get(e.from).push(e.to)

  const index = new Map(), low = new Map(), onStack = new Set()
  const stack = []
  let counter = 0
  const sccs = []

  const strongConnect = (v) => {
    index.set(v, counter); low.set(v, counter); counter++
    stack.push(v); onStack.add(v)
    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) { strongConnect(w); low.set(v, Math.min(low.get(v), low.get(w))) }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)))
    }
    if (low.get(v) === index.get(v)) {
      const comp = []
      let w
      do { w = stack.pop(); onStack.delete(w); comp.push(w) } while (w !== v)
      sccs.push(comp)
    }
  }
  for (const id of ids) if (!index.has(id)) strongConnect(id)

  // 유계 엣지를 뺀 그래프에서 self-loop 재계산
  const unboundedSelfLoop = new Set(
    (g.edges ?? []).filter((e) => e.from === e.to && !isBounded(e)).map((e) => e.from)
  )
  return sccs
    .filter((c) => c.length > 1 || unboundedSelfLoop.has(c[0]))
    .map((c) =>
      `순환 [${c.join(' → ')}]: 루프 상한 없음 — 이 순환을 끊는 gate:*:fail 엣지가 없거나 ` +
      `그 게이트에 on_fail.max_retry 정수가 없다. 노드의 retry.max는 순환을 끊지 못한다`
    )
}

/** #5 예산 상한 없는 노드가 있는가 (G6) */
function checkBudget(g) {
  return (g.nodes ?? [])
    .filter((n) => !n.policy?.budget)
    .map((n) => `노드 ${n.id}: policy.budget 없음`)
}

/** #6 노드·게이트 참조 무결성 — 엣지↔노드, 엣지↔게이트 양방향 */
function checkEdgeIntegrity(g) {
  const ids = new Set((g.nodes ?? []).map((n) => n.id))
  const gateIds = new Set((g.gates ?? []).map((x) => x.id))
  const referenced = new Set()
  const out = []

  for (const e of g.edges ?? []) {
    if (!ids.has(e.from)) out.push(`엣지 ${e.from}→${e.to}: from '${e.from}' 없음`)
    if (!ids.has(e.to)) out.push(`엣지 ${e.from}→${e.to}: to '${e.to}' 없음`)
    if (!VALID_WHEN.test(e.when ?? '')) {
      out.push(`엣지 ${e.from}→${e.to}: when '${e.when}' 형식 오류`)
      continue
    }
    // 형식만 보고 통과시키면 gate:G99:pass 같은 유령 참조가 샌다
    const m = /^gate:([A-Za-z0-9_]+):(pass|fail)$/.exec(e.when)
    if (m) {
      if (!gateIds.has(m[1])) out.push(`엣지 ${e.from}→${e.to}: 게이트 '${m[1]}' 이 gates[]에 없음`)
      else referenced.add(m[1])
    }
  }

  // 어떤 엣지도 참조하지 않는 게이트는 판정해도 갈 곳이 없다 = 죽은 게이트
  for (const id of gateIds) {
    if (!referenced.has(id)) out.push(`게이트 ${id}: 이 게이트를 참조하는 엣지가 없음 — 판정해도 분기가 없다`)
  }

  // on_fail.goto 만 적고 엣지를 안 그리면 도달가능성 검사에서 엉뚱한 메시지로 터진다
  for (const x of g.gates ?? []) {
    const goto = x.on_fail?.goto
    if (!goto) continue
    if (!ids.has(goto)) { out.push(`게이트 ${x.id}: on_fail.goto '${goto}' 노드 없음`); continue }
    const hasFailEdge = (g.edges ?? []).some((e) => e.when === `gate:${x.id}:fail` && e.to === goto)
    if (!hasFailEdge) {
      out.push(`게이트 ${x.id}: on_fail.goto='${goto}' 인데 대응하는 gate:${x.id}:fail 엣지가 없음 — 엣지로도 그려야 한다`)
    }
  }
  return out
}

export const CHECKS = [
  ['게이트 필드 유효성', checkGateFields],
  ['비가역 노드 승인', checkIrreversibleApproval],
  ['도달 가능성', checkReachability],
  ['종료 가능성', checkTermination],
  ['예산 누락', checkBudget],
  ['엣지 참조 무결성', checkEdgeIntegrity],
]

/** 서술형 게이트 차단 — threshold가 수치 리터럴이 아니면 스키마 위반 */
function checkNumericGates(g) {
  return (g.gates ?? [])
    .filter((x) => typeof x.threshold !== 'number' || !VALID_OPS.has(x.op))
    .map((x) => `게이트 ${x.id}: 서술형 게이트 금지 (op/threshold가 수치 3튜플이어야 함)`)
}

export function validate(graph) {
  const results = CHECKS.map(([name, fn]) => {
    const violations = fn(graph)
    return { name, passed: violations.length === 0, violations }
  })

  const declared = graph.graph?.spec?.version
  const schema = schemaFor(declared)

  // host.enforced_by_hook — 선언-실재 대조 (다섯 번째 사례 봉쇄).
  // 문자열("G0")과 객체({gate,check}) 둘 다 파싱하되, 유령 게이트는 스키마 위반으로 세운다.
  // check 없는 선언은 품질 경고 + 컴파일 시 hook_loss — 강제할 기계가 없는 선언이다.
  const hookGateIds = new Set((graph.gates ?? []).map((x) => x.id))
  const hookEntries = (graph.graph?.host?.enforced_by_hook ?? []).map((e) =>
    typeof e === 'string' ? { id: e, check: undefined } : { id: e?.gate, check: e?.check })
  // 스키마를 못 고르면 어휘 검사를 할 수 없다. 조용히 통과시키지 않고 위반으로 세운다.
  const kinds = schema?.kinds ?? new Set()
  const runners = schema?.runners ?? new Set()
  const groundTruth = schema?.groundTruth ?? VALID_GROUND_TRUTH

  // 스키마 레벨 위반 (검사 6종과 별개 — 통과 시 조용함)
  const schemaViolations = [
    ...(schema ? [] : [`graph.spec.version '${declared ?? '(없음)'}' — 미지원 스키마 버전 (아는 것: ${Object.keys(SCHEMAS).sort().join(', ')})`]),
    ...checkNumericGates(graph),
    ...(graph.nodes ?? [])
      .filter((n) => !kinds.has(n.kind))
      .map((n) => `노드 ${n.id}: kind '${n.kind}' 무효 (v${schema?.key ?? '?'} 어휘: ${[...kinds].sort().join('|') || '판정불가'})`),
    ...(graph.gates ?? [])
      .filter((x) => x.ground_truth !== undefined && !groundTruth.has(x.ground_truth))
      .map((x) => `게이트 ${x.id}: ground_truth '${x.ground_truth}' 무효 (v${schema?.key ?? '?'} 어휘: ${[...groundTruth].sort().join('|')})`),
    ...(graph.nodes ?? [])
      .filter((n) => n.runner !== undefined && !runners.has(n.runner))
      .map((n) => `노드 ${n.id}: runner '${n.runner}' 무효 (v${schema?.key ?? '?'} 어휘: ${[...runners].sort().join('|') || '판정불가'})`),
    ...(graph.state ?? [])
      .filter((s) => s.type !== undefined && !VALID_TYPES.has(s.type))
      .map((s) => `state ${s.field}: type '${s.type}' 무효 (int|ratio|bool|enum|ref|text)`),
    ...(graph.state ?? [])
      .filter((s) => s.unit !== undefined && !VALID_UNITS.has(s.unit))
      .map((s) => `state ${s.field}: unit '${s.unit}' 무효 (count|percent|ratio|ms|usd|none)`),
    ...hookEntries
      .filter((e) => !e.id)
      .map(() => `host.enforced_by_hook: gate id 없는 항목 — { "gate": "<id>", "check": "<명령>" } 형태여야 한다`),
    ...hookEntries
      .filter((e) => e.id && !hookGateIds.has(e.id))
      .map((e) => `host.enforced_by_hook '${e.id}': gates[] 에 없음 — 존재하지 않는 게이트는 강제할 수 없다`),
  ]

  // 단위 혼동 — ratio 는 항상 0~1. threshold 95 는 퍼센트를 ratio로 쓴 것이다.
  const typeOf = new Map((graph.state ?? []).map((s) => [s.field, s.type]))
  for (const x of graph.gates ?? []) {
    if (typeOf.get(x.field) === 'ratio' && typeof x.threshold === 'number' && x.threshold > 1) {
      schemaViolations.push(
        `게이트 ${x.id}: '${x.field}' 은 ratio(0~1)인데 threshold ${x.threshold} — 퍼센트를 쓰려면 type:int + unit:percent`
      )
    }
    if (typeOf.has(x.field) && !GATEABLE_TYPES.has(typeOf.get(x.field))) {
      schemaViolations.push(
        `게이트 ${x.id}: '${x.field}' 의 type '${typeOf.get(x.field)}' 은 판정 불가 — 카운터로 파생시켜라`
      )
    }
    if (typeof x.threshold === 'boolean') {
      schemaViolations.push(`게이트 ${x.id}: threshold 가 boolean — bool 은 0/1 정수로 인코딩한다`)
    }
  }

  // 필수 필드는 버전마다 다르다 — v1.4는 실행에 필요한 target·task 2종이 더 붙는다
  const required = [...BASE_FIELDS, ...(schema?.extraFields ?? [])]
  const fieldResults = required.map(([name, fn]) => {
    let ok = false
    try { ok = !!fn(graph) } catch { ok = false }
    return { name, ok }
  })
  const covered = fieldResults.filter((f) => f.ok).length

  const static_checks_passed = results.filter((r) => r.passed).length
  const ir_field_coverage = covered / required.length

  // 품질 지표 — graph-architect 절대규칙이 요구하지만 G0/G4c는 게이트하지 않는다.
  // (v4 게이트 정의를 건드리지 않으면서 스킬 자기검토가 참조할 수 있게 분리)
  const nodes = graph.nodes ?? []
  const gates = graph.gates ?? []
  const assumed = gates.filter((x) => x.ground_truth === 'assumed')
  const quality = {
    rationale_coverage: nodes.length ? nodes.filter((n) => n.rationale).length / nodes.length : 0,
    has_verdict: !!graph.graph?.verdict,
    has_excluded: Array.isArray(graph.graph?.excluded),
    has_guarantees:
      !!graph.graph?.guarantees?.excludes?.length && !!graph.graph?.guarantees?.provides?.length,
    has_scope: !!graph.graph?.scope?.unit,
    has_host: !!graph.graph?.host?.pipeline,
    // 전 노드의 uses 가 비어 있으면 카탈로그를 안 본 것이다 (절대규칙 3)
    catalog_reuse: nodes.some((n) => n.uses?.length),
    threshold_source_coverage: gates.length ? gates.filter((x) => x.threshold_source).length / gates.length : 0,
    assumed_ratio: gates.length ? assumed.length / gates.length : 0,
    // assumed 게이트는 guarantees.excludes 에 id가 나와야 한다 (절대규칙 1 폴백 3요소 중 3번)
    assumed_undeclared: assumed
      .filter((x) => !(graph.graph?.guarantees?.excludes ?? []).some((s) => String(s).includes(x.id)))
      .map((x) => x.id),
    // 훅 강제를 선언했는데 check 명령이 없다 — 선언에 기계가 없다 (컴파일 시 hook_loss 로 계상)
    hooks_declared_without_check: hookEntries
      .filter((e) => e.id && hookGateIds.has(e.id) && !nonEmpty(e.check))
      .map((e) => e.id),
  }

  return {
    results,
    schemaViolations,
    fieldResults,
    quality,
    schema: {
      declared: declared ?? null,
      applied: schema?.key ?? null,
      // 검증 통과 ≠ 실행 가능. 컴파일러가 보는 값이다.
      runnable: schema?.runnable === true,
      required_count: required.length,
    },
    metrics: {
      static_checks_passed,                                  // G4c: == 6
      ir_field_coverage,                                     // G0:  == 1.0
      ir_schema_valid: schemaViolations.length === 0,        // G0
      ir_machine_readable_block_count: 1,
    },
    G4c: static_checks_passed === 6,
    G0: ir_field_coverage === 1 && schemaViolations.length === 0,
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
const { isMain } = await import('./hash.mjs')
if (isMain(import.meta.url)) {
  const { readFileSync } = await import('node:fs')
  const file = process.argv[2]
  if (!file) { console.error('usage: node validate.mjs <graph.json>'); process.exit(2) }
  const r = validate(JSON.parse(readFileSync(file, 'utf8')))

  console.log(`── 스키마 ──`)
  console.log(`  선언 v${r.schema.declared ?? '(없음)'} → 적용 v${r.schema.applied ?? '(미지원)'}` +
              `   ${r.schema.runnable ? '실행 가능' : '검증 전용 — 컴파일 거부 (target·task 슬롯 없음)'}`)
  console.log('── 정적 검사 6종 (G4c) ──')
  for (const c of r.results) {
    console.log(`  ${c.passed ? 'PASS' : 'FAIL'}  ${c.name}`)
    for (const v of c.violations) console.log(`         ↳ ${v}`)
  }
  if (r.schemaViolations.length) {
    console.log('── 스키마 위반 ──')
    for (const v of r.schemaViolations) console.log(`  ↳ ${v}`)
  }
  console.log(`── G0 필수 필드 ${r.fieldResults.length}종 ──`)
  for (const f of r.fieldResults) console.log(`  ${f.ok ? ' ok ' : 'MISS'}  ${f.name}`)
  console.log('── 품질 (게이트 아님, 스킬 자기검토용) ──')
  console.log(`  ${r.quality.rationale_coverage === 1 ? ' ok ' : 'WARN'}  노드 배치 근거 ${(r.quality.rationale_coverage * 100).toFixed(0)}%`)
  console.log(`  ${r.quality.has_verdict ? ' ok ' : 'WARN'}  판정`)
  console.log(`  ${r.quality.has_excluded ? ' ok ' : 'WARN'}  붙이지 않은 것`)
  console.log(`  ${r.quality.has_guarantees ? ' ok ' : 'WARN'}  보장하지 않는 것`)
  console.log(`  ${r.quality.threshold_source_coverage === 1 ? ' ok ' : 'WARN'}  threshold_source ${(r.quality.threshold_source_coverage * 100).toFixed(0)}%`)
  console.log(`  ${r.quality.has_scope ? ' ok ' : 'WARN'}  범위(Step 0 주어)`)
  console.log(`  ${r.quality.has_host ? ' ok ' : 'WARN'}  호스트(Step 5 결정)`)
  console.log(`  ${r.quality.catalog_reuse ? ' ok ' : 'WARN'}  카탈로그 재사용(uses)${r.quality.catalog_reuse ? '' : ' — 전 노드가 비었다. 카탈로그를 안 봤을 가능성'}`)
  if (r.quality.assumed_ratio > 0) {
    const pct = (r.quality.assumed_ratio * 100).toFixed(0)
    console.log(`  ${r.quality.assumed_ratio > 1 / 3 ? 'WARN' : ' ok '}  assumed 임계값 ${pct}%${r.quality.assumed_ratio > 1 / 3 ? ' — 1/3 초과. 산출 전 사용자에게 먼저 보고할 것' : ''}`)
  }
  if (r.quality.assumed_undeclared.length) {
    console.log(`  WARN  assumed 인데 guarantees.excludes 에 없음: ${r.quality.assumed_undeclared.join(', ')}`)
  }
  if (r.quality.hooks_declared_without_check.length) {
    console.log(`  WARN  훅 강제 선언에 check 명령 없음: ${r.quality.hooks_declared_without_check.join(', ')} — 강제할 기계가 없다. {gate, check} 로 선언할 것 (컴파일 시 hook_loss)`)
  }
  console.log('──')
  console.log(`  static_checks_passed  ${r.metrics.static_checks_passed}/6      G4c ${r.G4c ? 'PASS' : 'FAIL'}`)
  console.log(`  ir_field_coverage     ${r.metrics.ir_field_coverage.toFixed(2)}      G0  ${r.G0 ? 'PASS' : 'FAIL'}`)
  process.exit(r.G0 && r.G4c ? 0 : 1)
}
