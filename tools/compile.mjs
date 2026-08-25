/**
 * Avalon ② BACKEND — IR → Claude Code Workflow 스크립트 (상태 기계)
 *
 * ⚠️ INV-1: LLM을 호출하지 않는다. 순수 함수. 같은 IR → 같은 바이트 (G4a).
 *    비결정성 차단 — Date · Math.random · 객체 키 순회 · Set/Map 반복 순서.
 *
 * v3 변경 (실사용 그래프 6개 실측 후):
 *   - 병렬 fan-out 컴파일 (`parallel()` + join). 실측 3/6이 여기서 막혔다
 *   - 휴먼 노드 게이트 방출. 실측 2/6이 `design_approved`·`owner_go` 등을 잃었다
 *   - 재개 입력(`args.resume_from`). ③의 "완료까지 구동"이 성립하려면 필요하다
 */

import { validate, schemaFor } from './validate.mjs'

const q = (s) => JSON.stringify(String(s))
const lit = (v) => (v === null || v === undefined ? 'null' : JSON.stringify(String(v)))
const JS_OP = { '==': '===', '>=': '>=', '<=': '<=', '>': '>', '<': '<' }

const outEdges = (g, id) =>
  g.edges.filter((e) => e.from === id).slice().sort((a, b) => (a.when + a.to < b.when + b.to ? -1 : 1))

const alwaysOut = (g, id) => outEdges(g, id).filter((e) => e.when === 'always')

/** 이 노드에서 나가는 엣지가 참조하는 게이트 (id 정렬) */
function gatesOf(g, id) {
  const ids = new Set(
    outEdges(g, id).map((e) => /^gate:([A-Za-z0-9_]+):(pass|fail)$/.exec(e.when ?? '')?.[1]).filter(Boolean)
  )
  return g.gates.filter((x) => ids.has(x.id)).sort((a, b) => (a.id < b.id ? -1 : 1))
}

/**
 * 팬아웃 분석. always 엣지가 2개 이상인 노드를 병렬 지점으로 본다.
 * 지원 형태: 각 갈래가 단일 노드이고, 갈래들의 pass 경로가 **같은 join 노드**로 모인다.
 * (실측 3개 그래프가 전부 이 형태였다. 다갈래 다단 체인은 아직 거절한다)
 */
function fanOut(g, id) {
  const br = alwaysOut(g, id).map((e) => e.to)
  if (br.length < 2) return null
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const joins = new Set()
  for (const b of br) {
    const oe = outEdges(g, b)
    if (oe.length === 0) return { error: `갈래 '${b}' 에 나가는 엣지가 없다` }
    if (oe.length > 2) return { error: `갈래 '${b}' 의 출구가 ${oe.length}개 — 갈래는 pass/fail 최대 2개여야 한다` }
    const gs = gatesOf(g, b)
    if (gs.length > 1) return { error: `갈래 '${b}' 에 게이트 ${gs.length}개 — OR 함정` }
    const passTo = gs.length
      ? oe.find((e) => e.when === `gate:${gs[0].id}:pass`)?.to
      : oe.find((e) => e.when === 'always')?.to
    if (!passTo) return { error: `갈래 '${b}' 의 통과 경로를 찾을 수 없다` }
    joins.add(passTo)
    if (alwaysOut(g, b).length > 1) return { error: `갈래 '${b}' 가 또 팬아웃한다 — 중첩 병렬 미지원` }
  }
  if (joins.size !== 1) {
    return { error: `갈래들이 서로 다른 곳으로 모인다 (${[...joins].sort().join(', ')}) — 단일 join 필요` }
  }
  return { branches: br.map((b) => byId.get(b)), join: [...joins][0] }
}

/**
 * 전 노드가 공유하는 컨텍스트. 산출 코드에 `CTX` 상수 하나로 나가고 각 프롬프트 앞에 붙는다.
 *
 * ⚠️ 이게 없던 v3까지는 `project.fingerprint` 를 **측정해서 IR에 저장해놓고 프롬프트에
 *    한 글자도 싣지 않았다.** 실사용 투입에서 걸린 결함 — 에이전트가 대상 저장소도,
 *    무슨 과제인지도 모르는 코드가 나왔다. 계측했으면 소비해야 한다.
 */
function contextBlock(g) {
  const t = g.graph.target ?? {}
  const fp = g.project?.fingerprint ?? {}
  const L = [`# 대상`, `저장소 루트: ${t.root}`]
  if (t.vcs) L.push(`버전관리: ${t.vcs}`)
  if (t.branch) L.push(`작업 브랜치: ${t.branch}`)
  L.push('', `# 과제`, g.graph.task.request)
  if (g.graph.task.id) L.push(`(과제 id: ${g.graph.task.id})`)
  if (fp.stack?.length) L.push('', `# 스택`, ...fp.stack.map((s) => `- ${s}`))
  if (fp.scale) L.push('', `# 규모`, `파일 ${fp.scale.files ?? '?'} / 모듈 ${fp.scale.modules ?? '?'}`)
  if (fp.markers?.length) L.push('', `# 실측 표식 (이 저장소에서 직접 잰 값이다)`, ...fp.markers.map((s) => `- ${s}`))
  L.push('', `이 블록은 그래프 명세가 실측한 사실이다. 추측으로 덮어쓰지 마라.`, '─'.repeat(60), '')
  return L.join('\n')
}

/** 노드 프롬프트 = CTX(공유) + 이것 */
function nodePrompt(n, g, gates) {
  const L = [`[노드 ${n.id}] ${n.rationale ?? ''}`.trim(), '',
             `graph.spec.hash: ${g.graph.spec.hash}`,
             `범위: ${g.graph.scope?.unit ?? '미지정'} 1회분`]
  if (n.produces?.length) L.push(`산출: ${n.produces.join(' , ')}`)
  if (n.uses?.length) L.push(`재사용할 자산: ${n.uses.join(' , ')}`)
  if (n.policy?.allowed_tools?.length) L.push(`허용 도구: ${n.policy.allowed_tools.join(' , ')}`)
  if (gates.length) {
    L.push('', '이 노드의 산출은 아래 숫자로 판정된다. 반드시 실측해서 반환해라:')
    for (const x of gates) {
      L.push(`  - ${x.field} ${x.op} ${x.threshold}   (증거등급 ${x.ground_truth ?? 'measured'})`)
      if (x.threshold_source) L.push(`      근거: ${x.threshold_source}`)
    }
    L.push('', '추정치를 반환하지 마라. 측정할 수 없으면 그렇게 보고해라.')
  }
  const b = n.policy?.budget
  if (b) L.push('', `예산: ${b.tokens} 토큰 / ${b.iterations} 반복 / ${b.wall_clock_s}초`)
  return L.join('\n')
}

function schemaOf(g, gates, ind) {
  const p = ' '.repeat(ind)
  const typeOf = new Map((g.state ?? []).map((s) => [s.field, s.type]))
  return ['{', `${p}  type: 'object',`,
    `${p}  required: [${gates.map((x) => q(x.field)).join(', ')}],`,
    `${p}  properties: {`,
    gates.map((x) => `${p}    ${q(x.field)}: { type: 'number', description: ${q(`${x.field} 실측값 (${typeOf.get(x.field) ?? 'number'})`)} }`).join(',\n'),
    `${p}  },`, `${p}}`].join('\n')
}

/** 컴파일 전 거부 조건 — 조용히 틀리느니 거부한다 */
function reject(g) {
  // ① 스키마 버전. 실행에 필요한 target·task 슬롯이 v1.4에서 생겼으므로 그 이전은 컴파일 불가.
  //    "검증 통과"와 "실행 가능"은 다른 문제다 — v1.1 그래프도 G0는 통과할 수 있다.
  const sc = schemaFor(g.graph?.spec?.version)
  if (!sc) return `graph.spec.version = ${g.graph?.spec?.version ?? '(없음)'} — 미지원 스키마 버전`
  if (!sc.runnable) {
    return `스키마 v${sc.key} (선언 ${g.graph.spec.version}) 는 검증 전용이다. ` +
           `graph.target.root(어느 저장소에서) 와 graph.task.request(무엇을) 를 적을 자리가 없어서 ` +
           `컴파일해도 에이전트가 대상도 과제도 모르는 코드가 나온다. v1.4 로 올리고 두 필드를 채워라`
  }

  // ② G0. 스키마 위반 그래프를 실행 코드로 만들면 조용히 틀린다.
  //    v3까지는 이 검사가 아예 없어서 G0 실패 그래프 6개가 전부 exit=0 으로 컴파일됐다.
  const v = validate(g)
  if (!v.G0) {
    const why = v.schemaViolations.length
      ? v.schemaViolations.slice(0, 3).join(' / ')
      : `필수 필드 누락: ${v.fieldResults.filter((f) => !f.ok).map((f) => f.name).join(', ')}`
    return `G0 미달 (ir_field_coverage ${v.metrics.ir_field_coverage.toFixed(2)} · 스키마위반 ${v.schemaViolations.length}건) — ${why}`
  }

  const host = g.graph?.host?.pipeline
  if (host !== 'workflow-script') {
    return `graph.host.pipeline = ${host ?? '(없음)'}. 현재 지원: workflow-script`
  }
  for (const n of g.nodes) {
    const gs = gatesOf(g, n.id)
    if (gs.length > 1 && !fanOut(g, n.id)) {
      return `노드 '${n.id}' 에 게이트 ${gs.length}개(${gs.map((x) => x.id).join(', ')}). ` +
             `edges[].when 은 게이트를 하나만 가리키므로 AND가 아니라 OR가 된다 — 파생 카운터로 합치거나 직렬로 쪼개라`
    }
    const f = fanOut(g, n.id)
    if (f?.error) return `노드 '${n.id}' 팬아웃: ${f.error}`
    // 갈래 노드는 parallel() 안에서 돌아 자체 case 를 갖지 않는다 → 실행 전에 멈출 자리가 없다.
    // 승인 게이트를 조용히 빠뜨리느니 거부한다.
    if (f && !f.error) {
      const need = f.branches.filter((b) => b.policy?.requires_approval === true)
      if (need.length) {
        return `팬아웃 갈래 ${need.map((b) => `'${b.id}'`).join(', ')} 가 requires_approval 이다. ` +
               `갈래는 parallel() 안에서 돌아 실행 전에 멈출 자리가 없다 — 승인이 필요한 노드는 팬아웃 밖으로 빼라`
      }
    }
  }
  return null
}

/** 방출 순서 — 진입점 BFS + id 정렬. 흡수된 갈래 노드는 자체 case를 갖지 않는다 */
function layout(g) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const absorbed = new Set()
  for (const n of g.nodes) {
    const f = fanOut(g, n.id)
    if (f && !f.error) for (const b of f.branches) absorbed.add(b.id)
  }
  const adj = new Map(g.nodes.map((n) => [n.id, []]))
  for (const e of g.edges) if (adj.has(e.from)) adj.get(e.from).push(e.to)
  for (const [, v] of adj) v.sort()

  const seen = new Set([g.graph.entry])
  const out = [g.graph.entry]
  const qq = [g.graph.entry]
  while (qq.length) {
    const cur = qq.shift()
    const f = fanOut(g, cur)
    const next = f && !f.error ? [f.join, ...(adj.get(cur) ?? [])] : (adj.get(cur) ?? [])
    for (const nx of next) {
      if (seen.has(nx)) continue
      seen.add(nx)
      if (!absorbed.has(nx)) out.push(nx)
      qq.push(nx)
    }
  }
  for (const n of g.nodes) if (!seen.has(n.id) && !absorbed.has(n.id)) out.push(n.id)
  return { nodes: out.map((id) => byId.get(id)).filter(Boolean), absorbed }
}

export function compile(g) {
  const err = reject(g)
  if (err) throw new Error(`컴파일 대상 아님: ${err}`)

  const { nodes } = layout(g)
  const loopBudget = (g.gates ?? []).reduce((a, x) => a + (x.on_fail?.max_retry ?? 0), 0)
  const maxSteps = g.nodes.length + loopBudget + 1

  // host.state_file — 선언했으면 산출 코드가 실어야 한다. workflow-script 는 파일을 쓸 수 없으므로
  // 반환값에 경로를 실어 운영자가 기록하게 한다. 선언만 하고 산출에 안 싣는 것이 다섯 번째 사례였다.
  const stateFile = g.graph?.host?.state_file
  const sf = stateFile ? 'state_file: STATE_FILE, ' : ''

  const unit = g.graph.scope?.unit
  const desc = unit ? (/1회분\s*$/.test(unit) ? unit : `${unit} 1회분`) : g.graph.name

  const L = []
  L.push('// GENERATED by Avalon ② BACKEND — 직접 수정하지 마라.')
  L.push(`// 정본: graph.json (${g.graph.spec.hash})`)
  L.push('// 재생성: node tools/compile.mjs graph.json build/graph.workflow.js')
  L.push('//')
  L.push('// 재개: Workflow({ scriptPath, args: { resume_from, resume_state, resume_loops } })')
  L.push('')
  L.push('export const meta = {')
  L.push(`  name: ${q(g.graph.name)},`)
  L.push(`  description: ${q(desc)},`)
  L.push('  phases: [')
  for (const n of nodes) L.push(`    { title: ${q(n.id)}, detail: ${q(n.rationale ?? '')} },`)
  L.push('  ],')
  L.push('}')
  L.push('')
  // 전 노드 공유 컨텍스트. 프롬프트마다 복제하지 않고 상수 하나로 둔다.
  L.push(`const CTX = ${q(contextBlock(g))}`)
  L.push('')
  L.push(`const NODE_IDS = new Set([${g.nodes.map((n) => q(n.id)).sort().join(', ')}])`)
  // args 를 JSON 문자열로 넘기는 실수가 잦다. 조용히 {} 로 떨어지면 처음부터 다시 돌아
  // 이미 끝낸 노드를 재실행한다 — 조용히 틀리는 동작이라 방어하고 소리내어 알린다.
  L.push('let A = {}')
  L.push('if (typeof args === "string" && args.trim()) {')
  L.push('  try { A = JSON.parse(args); log("args 가 문자열로 왔다 — 파싱해서 진행한다") }')
  L.push('  catch { log("⚠ args 문자열을 파싱할 수 없다. 처음부터 실행한다: " + args.slice(0, 80)) }')
  L.push('} else if (args && typeof args === "object") { A = args }')
  L.push('if (A.resume_from && !NODE_IDS.has(A.resume_from)) {')
  L.push('  return { reason: "bad_resume_from", got: A.resume_from, known: [...NODE_IDS] }')
  L.push('}')
  // 승인받은 노드 목록. policy.requires_approval 노드는 여기 없으면 실행 전에 멈춘다.
  L.push('const APPROVED = new Set(Array.isArray(A.approved) ? A.approved : [])')
  L.push('const STATE = { ...(A.resume_state ?? {}) }')
  L.push('const LOOP = { ...(A.resume_loops ?? {}) }   // 게이트별 fail 엣지 통과 횟수')
  L.push('const VISITS = {}')
  L.push(`let current = A.resume_from ?? ${q(g.graph.entry)}`)
  L.push('let steps = 0')
  L.push(`const MAX_STEPS = ${maxSteps}   // 노드 ${g.nodes.length} + 루프예산 ${loopBudget} + 1`)
  // ABANDON 등가물 — on_exhaust=partial 로 지나간 게이트 미달의 증거를 남긴다.
  // 포기는 종단이되 성공이 아니다: 최종 반환의 completed 를 승격시키지 못한다.
  L.push('const ABANDONED = []   // { gate, node, field, op, threshold, measured, attempts }')
  if (stateFile) {
    L.push(`const STATE_FILE = ${q(stateFile)}   // 실행 기록 경로 — 반환값을 운영자가 여기에 기록한다`)
  }
  L.push('if (A.resume_from) log("재개: " + A.resume_from)')
  L.push('')
  L.push('while (current !== null) {')
  L.push('  if (++steps > MAX_STEPS) {')
  L.push('    log("스텝 예산 소진 — 명세가 허용한 최대 전이를 넘었다: " + MAX_STEPS)')
  L.push(`    return { stopped_at: current, reason: 'step_budget_exhausted', completed: false, abandoned: ABANDONED, ${sf}state: STATE, loops: LOOP }`)
  L.push('  }')
  L.push('  VISITS[current] = (VISITS[current] ?? 0) + 1')
  L.push('  switch (current) {')

  for (const n of nodes) {
    const gates = gatesOf(g, n.id)
    const edges = outEdges(g, n.id)
    const fan = fanOut(g, n.id)
    L.push('')
    L.push(`    // ── ${n.id} ${'─'.repeat(Math.max(0, 52 - n.id.length))}`)
    L.push(`    case ${q(n.id)}: {`)
    L.push(`      phase(${q(n.id)})`)

    // ── 휴먼 노드 ────────────────────────────────────────────────────────
    if (n.kind === 'human') {
      L.push(`      log(${q(`◆ HUMAN GATE [${n.id}] — ${n.rationale ?? '사람 확인 필요'}`)})`)
      if (gates.length === 1) {
        const x = gates[0]
        const passTo = edges.find((e) => e.when === `gate:${x.id}:pass`)?.to
        const failTo = edges.find((e) => e.when === `gate:${x.id}:fail`)?.to
        L.push(`      log(${q(`판정 필요: ${x.field} ${x.op} ${x.threshold}`)})`)
        L.push(`      return { stopped_at: ${q(n.id)}, reason: 'human_gate', ${sf}state: STATE, loops: LOOP,`)
        L.push(`               awaiting: { gate: ${q(x.id)}, field: ${q(x.field)}, op: ${q(x.op)}, threshold: ${x.threshold} },`)
        L.push(`               resume_to_pass: ${lit(passTo)}, resume_to_fail: ${lit(failTo)},`)
        L.push(`               max_retry: ${Number.isInteger(x.on_fail?.max_retry) ? x.on_fail.max_retry : 0} }`)
      } else {
        L.push(`      log(${q('워크플로는 여기서 멈춘다. 사람이 판정한 뒤 이어서 진행할 것.')})`)
        L.push(`      return { stopped_at: ${q(n.id)}, reason: 'human_gate', ${sf}state: STATE, loops: LOOP,`)
        L.push(`               resume_to: ${lit(edges.find((e) => e.when === 'always')?.to)} }`)
      }
      L.push('    }')
      continue
    }

    // ── 승인 게이트 ──────────────────────────────────────────────────────
    // ⚠️ v3까지 `policy.requires_approval` 은 산출 코드에 **한 줄도 반영되지 않았다.**
    //    validate 검사 #2가 "비가역 노드가 승인을 선언했는가"를 확인하고 통과시킨 뒤,
    //    컴파일러가 그 선언을 버렸다. jarvis-agent 의 push 노드는 근거에
    //    "되돌리기 어려운 유일한 노드라 사람 승인을 붙인다"고 적어놓고
    //    `git push origin` 을 정지 없이 실행하는 코드가 나왔다. 선언했으면 강제해야 한다.
    if (n.policy?.requires_approval === true) {
      L.push(`      if (!APPROVED.has(${q(n.id)})) {`)
      L.push(`        log(${q(`◆ APPROVAL GATE [${n.id}] — ${n.rationale ?? '사람 승인 필요'}`)})`)
      if (n.policy?.reversible === false) {
        L.push(`        log(${q('⚠ 비가역 노드다. 승인 전에는 실행하지 않는다.')})`)
      }
      L.push(`        return { stopped_at: ${q(n.id)}, reason: 'approval_required',`)
      L.push(`                 irreversible: ${n.policy?.reversible === false},`)
      L.push(`                 ${sf}state: STATE, loops: LOOP,`)
      L.push(`                 resume_to: ${q(n.id)},`)
      L.push(`                 howto: ${q(`재개: args = { resume_from: "${n.id}", approved: ["${n.id}"], resume_state, resume_loops }`)} }`)
      L.push('      }')
    }

    // ── 팬아웃 노드 ──────────────────────────────────────────────────────
    if (fan && !fan.error) {
      const selfGates = gates.filter((x) => !fan.branches.some((b) => gatesOf(g, b.id).some((y) => y.id === x.id)))
      L.push(`      await agent(CTX + ${q(nodePrompt(n, g, selfGates))}, { label: ${q(n.id)}, phase: ${q(n.id)} })`)
      L.push(`      log(${q(`▶ 병렬 ${fan.branches.length}갈래: ${fan.branches.map((b) => b.id).join(' , ')}`)})`)
      L.push('      const FAN = await parallel([')
      for (const b of fan.branches) {
        const bg = gatesOf(g, b.id)
        L.push(`        () => agent(CTX + ${q(nodePrompt(b, g, bg))}, {`)
        L.push(`          label: ${q(b.id)}, phase: ${q(b.id)},`)
        if (bg.length) L.push(`          schema: ${schemaOf(g, bg, 10)},`)
        L.push('        }),')
      }
      L.push('      ])')
      L.push('      for (const x of FAN) if (x && typeof x === "object") Object.assign(STATE, x)')
      L.push('      {')
      L.push('        const FAILED = []')
      for (let i = 0; i < fan.branches.length; i++) {
        const bg = gatesOf(g, fan.branches[i].id)
        if (!bg.length) continue
        const x = bg[0]
        const failTo = outEdges(g, fan.branches[i].id).find((e) => e.when === `gate:${x.id}:fail`)?.to
        L.push(`        if (!(FAN[${i}] && FAN[${i}][${q(x.field)}] ${JS_OP[x.op]} ${x.threshold})) {`)
        L.push(`          log(${q(`✗ ${x.id} (${fan.branches[i].id}): ${x.field} ${x.op} ${x.threshold} 미달`)})`)
        L.push(`          FAILED.push({ gate: ${q(x.id)}, field: ${q(x.field)}, op: ${q(x.op)}, threshold: ${x.threshold}, goto: ${lit(failTo)}, max_retry: ${Number.isInteger(x.on_fail?.max_retry) ? x.on_fail.max_retry : 0} })`)
        L.push('        }')
      }
      L.push('        if (FAILED.length === 0) {')
      L.push(`          log(${q(`✓ 병렬 ${fan.branches.length}갈래 전부 통과`)})`)
      L.push(`          current = ${q(fan.join)}; break`)
      L.push('        }')
      L.push('        // 여러 갈래가 동시에 미달하면 게이트 id 순으로 첫 번째가 목적지를 정한다 (결정론)')
      L.push('        FAILED.sort((a, b) => (a.gate < b.gate ? -1 : 1))')
      L.push('        const F = FAILED[0]')
      L.push('        LOOP[F.gate] = (LOOP[F.gate] ?? 0) + 1')
      L.push('        if (LOOP[F.gate] > F.max_retry) {')
      L.push('          log(F.gate + " 루프 상한 " + F.max_retry + " 소진")')
      L.push(`          return { stopped_at: ${q(n.id)}, reason: 'loop_exhausted:' + F.gate, completed: false,`)
      L.push(`                   abandoned: [...ABANDONED, { gate: F.gate, node: ${q(n.id)}, field: F.field, op: F.op, threshold: F.threshold, measured: STATE[F.field] ?? null, attempts: LOOP[F.gate] }],`)
      L.push(`                   failed: FAILED, ${sf}state: STATE, loops: LOOP }`)
      L.push('        }')
      L.push('        current = F.goto; break')
      L.push('      }')
      L.push('    }')
      continue
    }

    // ── 일반 노드 ────────────────────────────────────────────────────────
    if (gates.length === 0) {
      L.push(`      await agent(CTX + ${q(nodePrompt(n, g, []))}, { label: ${q(n.id)}, phase: ${q(n.id)} })`)
      const nx = edges.find((e) => e.when === 'always')
      L.push(nx ? `      current = ${q(nx.to)}; break` : '      current = null; break   // 종단')
      L.push('    }')
      continue
    }

    const x = gates[0]
    const passTo = edges.find((e) => e.when === `gate:${x.id}:pass`)?.to ?? null
    const failTo = edges.find((e) => e.when === `gate:${x.id}:fail`)?.to ?? null
    const maxRetry = Number.isInteger(x.on_fail?.max_retry) ? x.on_fail.max_retry : 0
    const onEx = n.retry?.on_exhaust ?? 'fail'

    L.push(`      const r_${n.id.replace(/[^A-Za-z0-9_]/g, '_')} = await agent(CTX + ${q(nodePrompt(n, g, gates))}, {`)
    const rv = `r_${n.id.replace(/[^A-Za-z0-9_]/g, '_')}`
    L.push(`        label: VISITS[${q(n.id)}] === 1 ? ${q(n.id)} : ${q(n.id)} + '#' + VISITS[${q(n.id)}],`)
    L.push(`        phase: ${q(n.id)},`)
    L.push(`        schema: ${schemaOf(g, gates, 8)},`)
    L.push('      })')
    L.push(`      if (!${rv}) {`)
    L.push(`        return { stopped_at: ${q(n.id)}, reason: 'agent_no_result', completed: false, abandoned: ABANDONED, ${sf}state: STATE, loops: LOOP }`)
    L.push('      }')
    L.push(`      Object.assign(STATE, ${rv})`)
    L.push(`      if (${rv}[${q(x.field)}] ${JS_OP[x.op]} ${x.threshold}) {`)
    L.push(`        log(${q(`✓ ${x.id}: ${x.field} ${x.op} ${x.threshold}`)})`)
    L.push(passTo ? `        current = ${q(passTo)}; break` : '        current = null; break   // 종단')
    L.push('      }')
    L.push(`      log(${q(`✗ ${x.id}: ${x.field} ${x.op} ${x.threshold} 미달 → `)} + ${rv}[${q(x.field)}])`)
    L.push(`      LOOP[${q(x.id)}] = (LOOP[${q(x.id)}] ?? 0) + 1`)
    L.push(`      if (LOOP[${q(x.id)}] > ${maxRetry}) {`)
    L.push(`        log(${q(`${x.id} 루프 상한 ${maxRetry} 소진`)})`)
    if (onEx === 'partial') {
      // 포기를 조용히 삼키지 않는다 — 전진하되 증거를 ABANDONED 에 남기고, 최종 completed 를 false 로 만든다.
      // (unlazy 의 ABANDON 규율: 포기는 종단이되 성공이 아니며, 부모 완료를 승격시키지 못한다)
      L.push(`        log(${q('on_exhaust=partial — 부분 산출로 전진한다. 게이트 미달은 abandoned 에 남는다')})`)
      L.push(`        ABANDONED.push({ gate: ${q(x.id)}, node: ${q(n.id)}, field: ${q(x.field)}, op: ${q(x.op)}, threshold: ${x.threshold}, measured: STATE[${q(x.field)}] ?? null, attempts: LOOP[${q(x.id)}] })`)
      L.push(passTo ? `        current = ${q(passTo)}; break` : '        current = null; break')
    } else {
      L.push(`        return { stopped_at: ${q(n.id)}, reason: ${q(`loop_exhausted:${x.id}`)}, completed: false,`)
      L.push(`                 abandoned: [...ABANDONED, { gate: ${q(x.id)}, node: ${q(n.id)}, field: ${q(x.field)}, op: ${q(x.op)}, threshold: ${x.threshold}, measured: STATE[${q(x.field)}] ?? null, attempts: LOOP[${q(x.id)}] }],`)
      L.push(`                 on_exhaust: ${q(onEx)}, ${sf}state: STATE, loops: LOOP }`)
    }
    L.push('      }')
    L.push(failTo ? `      current = ${q(failTo)}; break` : '      current = null; break')
    L.push('    }')
  }

  L.push('')
  L.push('    default:')
  L.push('      log("알 수 없는 노드: " + current)')
  L.push("      return { stopped_at: current, reason: 'unknown_node', state: STATE, loops: LOOP }")
  L.push('  }')
  L.push('}')
  L.push('')
  // completed 는 ABANDONED 가 비어 있을 때만 true — 포기가 완주를 성공으로 둔갑시키지 못한다.
  L.push(`return { completed: ABANDONED.length === 0, abandoned: ABANDONED, ${sf}state: STATE, loops: LOOP, visits: VISITS, spec_hash: ${q(g.graph.spec.hash)} }`)
  return L.join('\n') + '\n'
}

/** gate_loss — IR의 게이트·엣지가 산출 코드에 몇 개나 옮겨졌는가. 0이어야 한다 */
export function gateLoss(g, src) {
  const missing = []
  for (const x of g.gates ?? []) {
    if (!src.includes(q(x.field))) missing.push(`gate ${x.id}: 필드 '${x.field}' 누락`)
    const thr = `${JS_OP[x.op]} ${x.threshold}`
    if (!src.includes(thr) && !src.includes(`threshold: ${x.threshold}`)) {
      missing.push(`gate ${x.id}: 임계값 ${x.threshold} 누락`)
    }
    const mr = x.on_fail?.max_retry
    if (Number.isInteger(mr) && !src.includes(`> ${mr}`) && !src.includes(`max_retry: ${mr}`)) {
      missing.push(`gate ${x.id}: 루프 상한 ${mr} 누락`)
    }
  }
  for (const e of g.edges ?? []) {
    const terminal = !(g.edges ?? []).some((y) => y.from === e.to)
    if (!terminal && !src.includes(q(e.to))) missing.push(`edge ${e.from}→${e.to}: 목적지 누락`)
  }
  return missing
}

/**
 * 훅 명세 산출 — host.enforced_by_hook → build/hooks.json
 *
 * ⚠️ 다섯 번째 사례 (2026-08-25): `enforced_by_hook: ["G0","G0b","G4c"]` 는 IR에 선언되고
 *    G0·G4c·gate_loss 전부 초록을 받았지만, 훅 파일은 존재한 적이 없다 — 선언을 아무 게이트도
 *    쳐다보지 않았다. requires_approval(네 번째)·fingerprint(두 번째)와 같은 계열:
 *    **검증되고 폐기된 선언.** 이제 선언은 기계(check 명령)를 동반해야만 훅으로 실린다.
 *
 * 산출은 명세 파일까지다. 설치는 install-hooks.mjs(--yes 승인 필수, 프로젝트 범위만)의 일 — 자동 설치 금지.
 */
export function compileHooks(g) {
  const entries = g.graph?.host?.enforced_by_hook ?? []
  const gateById = new Map((g.gates ?? []).map((x) => [x.id, x]))
  const hooks = []
  for (const e of entries) {
    const id = typeof e === 'string' ? e : e?.gate
    const check = e && typeof e === 'object' && typeof e.check === 'string' && e.check.trim() ? e.check : null
    const x = gateById.get(id)
    if (!x || !check) continue   // 기계 없는 선언은 싣지 않는다 — hookLoss 가 잡는다
    hooks.push({ gate: x.id, field: x.field, op: x.op, threshold: x.threshold, check, expect_exit: 0 })
  }
  if (!hooks.length) return null
  return JSON.stringify({
    generated_by: 'Avalon ② BACKEND — 직접 수정하지 마라. 재생성: node tools/compile.mjs graph.json build/graph.workflow.js',
    spec_hash: g.graph.spec.hash,
    hooks,
    install: {
      by: 'install-hooks.mjs --yes (사용자 승인 필수, 프로젝트 .claude/settings.json 에만) — 자동 설치 금지',
      contract: '각 check 는 게이트 미달 시 exit != 0 이어야 한다. 훅 호스트가 exit 로 차단한다',
    },
  }, null, 2) + '\n'
}

/** hook_loss — 훅 강제를 선언한 게이트 중 산출된 훅 명세에 실리지 못한 것. 0이어야 한다 */
export function hookLoss(g, hooksJson) {
  const entries = g.graph?.host?.enforced_by_hook ?? []
  if (!entries.length) return []
  const gateIds = new Set((g.gates ?? []).map((x) => x.id))
  const emitted = new Set(hooksJson ? JSON.parse(hooksJson).hooks.map((h) => h.gate) : [])
  const missing = []
  for (const e of entries) {
    const id = typeof e === 'string' ? e : e?.gate
    if (!id) { missing.push('enforced_by_hook: gate id 없는 항목 — {gate, check} 형태여야 한다'); continue }
    if (!gateIds.has(id)) { missing.push(`enforced_by_hook '${id}': gates[] 에 없음`); continue }
    if (!emitted.has(id)) missing.push(`enforced_by_hook '${id}': check 명령이 없어 훅으로 강제되지 않는다 — { "gate": "${id}", "check": "<명령>" } 로 선언하라`)
  }
  return missing
}

// ── CLI ────────────────────────────────────────────────────────────────────
const { isMain } = await import('./hash.mjs')
if (isMain(import.meta.url)) {
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs')
  const { dirname, join } = await import('node:path')
  const [, , file, out] = process.argv
  if (!file) { console.error('usage: node compile.mjs <graph.json> [out.js]'); process.exit(2) }
  const g = JSON.parse(readFileSync(file, 'utf8'))
  let src
  try { src = compile(g) } catch (e) { console.error(`컴파일 거부: ${e.message}`); process.exit(1) }
  const loss = gateLoss(g, src)
  console.log(`  gate_loss  ${loss.length}      G4c-loss ${loss.length === 0 ? 'PASS' : 'FAIL'}`)
  for (const m of loss) console.log(`    ↳ ${m}`)
  const hooks = compileHooks(g)
  const hloss = hookLoss(g, hooks)
  if ((g.graph?.host?.enforced_by_hook ?? []).length) {
    console.log(`  hook_loss  ${hloss.length}      D7 ${hloss.length === 0 ? 'PASS' : 'FAIL'}`)
    for (const m of hloss) console.log(`    ↳ ${m}`)
  }
  if (out) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, src, 'utf8')
    console.log(`  compiled → ${out}`)
    if (hooks) { writeFileSync(join(dirname(out), 'hooks.json'), hooks, 'utf8'); console.log(`  hooks    → ${join(dirname(out), 'hooks.json')}`) }
  } else process.stdout.write(src)
  process.exit(loss.length === 0 && hloss.length === 0 ? 0 : 1)
}
