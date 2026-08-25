/**
 * Avalon IR — 실행 러너 (graph.json 을 <실제로 집행>한다)
 *
 * 왜 있나: validate.mjs 는 그래프가 <옳게 그려졌는지>만 본다.
 *          그 뒤 노드를 순서대로 도는 것은 아무도 강제하지 않아서,
 *          건너뛰거나 게이트 판정을 손으로 바꿔도 <아무도 모른다>.
 *          이 파일이 그 구멍을 막는다.
 *
 * INV-1  게이트 판정은 <이 도구만> 내린다. 사람/에이전트는 <측정값>만 넣는다.
 * INV-2  프론티어에 없는 노드는 start 할 수 없다.
 * INV-3  게이트가 참조하는 필드를 <이번 방문에> 재지 않았으면 done 이 거부된다.
 * INV-4  모든 측정은 원장(ledger)에 append-only 로 남는다.
 * INV-5  그래프 해시가 바뀌면 상태가 stale 임을 알린다 (조용히 이어가지 않는다).
 *
 * 의존성 없음. 네트워크 없음. node >= 18.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, rmSync } from 'node:fs'
import { specHash } from './hash.mjs'
import { dirname, resolve, isAbsolute } from 'node:path'

const OPS = {
  '==': (a, b) => a === b,
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
}

const WHEN_RE = /^gate:([A-Za-z0-9_]+):(pass|fail)$/

// ── 그래프 읽기 ────────────────────────────────────────────────────────────

export function loadGraph (graphPath) {
  const g = JSON.parse(readFileSync(graphPath, 'utf8'))
  const nodes = new Map((g.nodes ?? []).map(n => [n.id, n]))
  const gates = new Map((g.gates ?? []).map(x => [x.id, x]))
  const fields = new Map((g.state ?? []).map(s => [s.field, s]))
  return { g, nodes, gates, fields, graphPath }
}

/** 상태 파일 경로 — graph.host.state_file. 상대경로는 graph.json 기준. */
export function stateFileFor (ctx) {
  const declared = ctx.g.graph?.host?.state_file
  if (!declared) throw new Error('graph.host.state_file 이 없다 — 러너가 상태를 둘 곳이 없다')
  return isAbsolute(declared) ? declared : resolve(dirname(ctx.graphPath), declared)
}

const ledgerFor = sf => sf.replace(/\.json$/, '') + '.ledger.jsonl'

/** 이 노드에서 나가는 엣지가 참조하는 게이트들. */
export function gatesOf (ctx, nodeId) {
  const ids = new Set()
  for (const e of ctx.g.edges ?? []) {
    if (e.from !== nodeId) continue
    const m = WHEN_RE.exec(e.when ?? '')
    if (m) ids.add(m[1])
  }
  return [...ids]
}

/**
 * 🔴 한 노드에 게이트가 2개 이상이면 pass 엣지가 여럿이라 <AND 가 아니라 OR> 가 된다.
 *    validate.mjs 는 이걸 못 잡는다(조용히 틀리는 오류). 여기서 린트로 세운다.
 */
export function lintOrTrap (ctx) {
  const bad = []
  for (const id of ctx.nodes.keys()) {
    const gs = gatesOf(ctx, id)
    if (gs.length > 1) bad.push({ node: id, gates: gs })
  }
  return bad
}

// ── 상태 ───────────────────────────────────────────────────────────────────

// INV-5 — 선언된 spec.hash 를 <믿지 않는다>. 내용에서 다시 계산한다.
//   왜: 선언값만 보면 graph.json 을 고치고 hash.mjs 를 <안 돌린> 경우를 못 잡는다.
//       그때 상태와 그래프의 해시가 그대로 같아서 STALE 이 안 뜨고, 러너는 <다른 그래프>를
//       집행하면서 아무 말도 안 한다 (2026-08-20 실측 — 자기시험이 이 구멍을 드러냈다).
//   ★이 저장소가 계속 하는 말과 같은 부류다: 검증 도구가 <의도한 대상>을 재고 있는지 보라.
const graphHash = ctx => {
  try { return specHash(ctx.g) } catch { return ctx.g.graph?.spec?.hash ?? 'sha256:UNKNOWN' }
}

export function freshState (ctx, now = new Date().toISOString()) {
  const entry = ctx.g.graph?.entry
  if (!entry || !ctx.nodes.has(entry)) throw new Error(`graph.entry 가 없거나 nodes 에 없다: ${entry}`)
  return {
    graph: ctx.g.graph?.name ?? '(unnamed)',
    graph_hash: graphHash(ctx),
    started_at: now,
    ready: [entry],
    active: null,
    active_visit: null,
    completed: {},   // nodeId -> 방문 횟수
    measured: {},    // field -> { value, note, at, node, visit }
    gate_runs: [],   // { gate, field, value, op, threshold, verdict, ground_truth, at, node }
    gate_fails: {},  // gateId -> 누적 fail (on_fail.max_retry 와 대조)
    node_runs: {},   // nodeId -> 착수 횟수 (retry.max 와 대조)
    halted: null,
  }
}

export function loadState (ctx, { create = false } = {}) {
  const sf = stateFileFor(ctx)
  if (!existsSync(sf)) {
    if (!create) throw new Error(`상태 파일이 없다: ${sf}\n  → 먼저: run.mjs <graph> init`)
    mkdirSync(dirname(sf), { recursive: true })
    const s = freshState(ctx)
    saveState(ctx, s, 'init', {})
    return s
  }
  return JSON.parse(readFileSync(sf, 'utf8'))
}

export function saveState (ctx, s, action, payload) {
  const sf = stateFileFor(ctx)
  mkdirSync(dirname(sf), { recursive: true })
  // 🔴 대상 파일을 <먼저 열지 않는다>. 임시로 다 쓰고 옮긴다 —
  //    쓰다 죽으면 원본이 0바이트가 되는 사고를 실제로 겪었다 (2026-08-18).
  const tmp = sf + '.tmp'
  writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n', 'utf8')
  writeFileSync(sf, readFileSync(tmp, 'utf8'), 'utf8')
  // INV-4 — 원장은 append 만. 상태 파일을 손으로 고쳐도 여기 흔적이 남는다.
  appendFileSync(ledgerFor(sf),
    JSON.stringify({ at: new Date().toISOString(), action, ...payload }) + '\n', 'utf8')
}

/** INV-5 — 상태를 만든 그래프와 지금 그래프가 같은가. */
export function staleness (ctx, s) {
  const now = graphHash(ctx)
  return s.graph_hash === now ? null : { was: s.graph_hash, now }
}

// ── 진행 ───────────────────────────────────────────────────────────────────

/** join 노드는 <들어오는 엣지의 출발지가 전부> 끝나야 준비된다. */
function joinSatisfied (ctx, nodeId, s) {
  if (ctx.nodes.get(nodeId)?.kind !== 'join') return true
  const sources = (ctx.g.edges ?? []).filter(e => e.to === nodeId).map(e => e.from)
  return sources.every(src => (s.completed[src] ?? 0) > 0)
}

function pushReady (ctx, s, nodeId) {
  if (!ctx.nodes.has(nodeId)) throw new Error(`엣지가 없는 노드를 가리킨다: ${nodeId}`)
  if (!joinSatisfied(ctx, nodeId, s)) return false
  if (!s.ready.includes(nodeId)) s.ready.push(nodeId)
  return true
}

export function cmdStart (ctx, s, nodeId) {
  if (s.halted) throw new Error(`중단됨: ${s.halted}`)
  if (s.active) throw new Error(`이미 진행 중인 노드가 있다: ${s.active}  → 먼저 done 하거나 abort`)
  if (!s.ready.includes(nodeId)) {
    throw new Error(
      `🔴 프론티어에 없는 노드다: ${nodeId}\n` +
      `   지금 할 수 있는 것: ${s.ready.length ? s.ready.join(', ') : '(없음)'}\n` +
      '   ★그래프를 건너뛰려 한 것이다. 순서를 바꾸려면 graph.json 을 고치고 재검증하라.')
  }
  const tries = (s.node_runs[nodeId] ?? 0) + 1
  const max = ctx.nodes.get(nodeId)?.retry?.max ?? 0
  if (tries > max + 1) {
    s.halted = `노드 재시도 소진: ${nodeId} (retry.max=${max})`
    saveState(ctx, s, 'halt', { node: nodeId, reason: s.halted })
    throw new Error(s.halted)
  }
  s.node_runs[nodeId] = tries
  s.active = nodeId
  s.active_visit = s.completed[nodeId] ?? 0
  s.ready = s.ready.filter(x => x !== nodeId)
  saveState(ctx, s, 'start', { node: nodeId, attempt: tries })
  return s
}

export function cmdMeasure (ctx, s, field, raw, note) {
  if (!ctx.fields.has(field)) {
    throw new Error(
      `🔴 state[] 에 없는 필드다: ${field}\n` +
      `   선언된 필드: ${[...ctx.fields.keys()].join(', ')}\n` +
      '   ★없는 필드를 재는 것은 추측이다. graph.json 의 state[] 에 먼저 선언하라.')
  }
  const spec = ctx.fields.get(field)
  const value = Number(raw)
  if (raw === undefined || raw === '' || !Number.isFinite(value)) throw new Error(`숫자가 아니다: ${field}=${raw}`)
  if (spec.type === 'int' && !Number.isInteger(value)) throw new Error(`정수여야 한다: ${field}=${raw}`)
  if (spec.type === 'ratio' && (value < 0 || value > 1)) throw new Error(`ratio 는 0~1 이다: ${field}=${raw}`)

  s.measured[field] = {
    value,
    note: note ?? '',
    at: new Date().toISOString(),
    node: s.active ?? null,
    visit: s.active ? s.active_visit : null,
  }
  saveState(ctx, s, 'measure', { field, value, note: note ?? '', node: s.active ?? null })
  return s
}

/** 게이트 판정 — INV-1. 사람이 verdict 를 넣을 자리가 없다. */
export function evaluateGate (ctx, s, gateId) {
  const gate = ctx.gates.get(gateId)
  if (!gate) throw new Error(`없는 게이트: ${gateId}`)
  const m = s.measured[gate.field]
  if (!m) return { gate: gateId, missing: gate.field }
  return {
    gate: gateId,
    field: gate.field,
    value: m.value,
    op: gate.op,
    threshold: gate.threshold,
    verdict: OPS[gate.op](m.value, gate.threshold) ? 'pass' : 'fail',
    ground_truth: gate.ground_truth ?? '(미기재)',
  }
}

export function cmdDone (ctx, s, nodeId) {
  if (s.halted) throw new Error(`중단됨: ${s.halted}`)
  if (s.active !== nodeId) throw new Error(`진행 중인 노드가 아니다: ${nodeId} (지금: ${s.active ?? '없음'})`)

  const gs = gatesOf(ctx, nodeId)
  const visit = s.active_visit ?? 0

  // INV-3 — 이번 방문에 재지 않은 값으로 판정하지 않는다.
  //         (옛 측정값이 남아 재시도를 무한히 통과시키는 것을 막는다.)
  const stale = []
  for (const gid of gs) {
    const f = ctx.gates.get(gid).field
    const m = s.measured[f]
    if (!m) stale.push(`${gid}: ${f} 를 <한 번도> 안 쟀다`)
    else if (m.node !== nodeId || (m.visit ?? -1) !== visit) {
      stale.push(`${gid}: ${f} 는 이번 방문에 잰 값이 아니다 (잰 곳: ${m.node ?? '?'} 방문 ${m.visit ?? '?'})`)
    }
  }
  if (stale.length) {
    throw new Error('🔴 게이트를 판정할 수 없다 — 이번 방문의 측정이 없다:\n  ' + stale.join('\n  ') +
      '\n  → run.mjs <graph> measure <필드> <값> "<어떻게 쟀는지>"')
  }

  const results = gs.map(gid => evaluateGate(ctx, s, gid))
  const at = new Date().toISOString()
  for (const r of results) s.gate_runs.push({ ...r, at, node: nodeId })

  s.completed[nodeId] = (s.completed[nodeId] ?? 0) + 1
  s.active = null
  s.active_visit = null

  // 엣지를 따라간다 — <그래프가> 다음을 정한다. 내 기억이 아니라.
  const opened = []
  for (const e of ctx.g.edges ?? []) {
    if (e.from !== nodeId) continue
    if (e.when === 'always') {
      if (pushReady(ctx, s, e.to)) opened.push(e.to)
      continue
    }
    const mm = WHEN_RE.exec(e.when ?? '')
    if (!mm) continue
    const r = results.find(x => x.gate === mm[1])
    if (!r || r.verdict !== mm[2]) continue
    if (mm[2] === 'fail') {
      const gate = ctx.gates.get(mm[1])
      const n = (s.gate_fails[mm[1]] ?? 0) + 1
      s.gate_fails[mm[1]] = n
      const max = gate.on_fail?.max_retry ?? 0
      // 🔴 max_retry 0 은 <재시도 0회 → 즉시 중단> 이 아니라 <분기> 다.
      //    스킬 Step 3: "미달도 정상 결과다 … max_retry: 0 은 유효하다.
      //    '재시도 없이 그 경로로 간다'는 뜻이다." 전진 스킵·축소 출시·NO-GO 리포트가 그 용도다.
      //    구현이 문서와 어긋나 있었다 — 분기로 쓴 게이트가 첫 미달에 그래프를 멈췄다(2026-08-20 실측).
      if (max === 0) {
        // 단, 분기가 <이미 끝난 노드>로 되돌아가면 예산 없는 루프다. 그건 멈춘다.
        if (s.completed[e.to] !== undefined) {
          s.halted = `분기(max_retry 0)가 이미 끝난 노드로 되돌아간다: ${mm[1]} → ${e.to} — 예산이 없는 루프다`
          saveState(ctx, s, 'halt', { node: nodeId, gate: mm[1], reason: s.halted })
          return { s, results, opened, halted: s.halted }
        }
        // 분기다 — 판정은 원장에 남기고 그대로 진행한다.
      } else if (n > max) {
        s.halted = `게이트 루프 상한 초과: ${mm[1]} (fail ${n}회 > max_retry ${max}) — 사람에게 넘긴다`
        saveState(ctx, s, 'halt', { node: nodeId, gate: mm[1], reason: s.halted })
        return { s, results, opened, halted: s.halted }
      }
    }
    if (pushReady(ctx, s, e.to)) opened.push(e.to)
  }

  const terminal = opened.length === 0 && s.ready.length === 0
  saveState(ctx, s, 'done', { node: nodeId, gates: results, opened, terminal })
  return { s, results, opened, terminal, halted: null }
}

// ── 보고 ───────────────────────────────────────────────────────────────────

function fmtGate (ctx, gid) {
  const g = ctx.gates.get(gid)
  return `${gid}: ${g.field} ${g.op} ${g.threshold}  [${g.ground_truth ?? '?'}]`
}

export function report (ctx, s) {
  const L = []
  const st = staleness(ctx, s)
  L.push(`── ${s.graph} ──`)
  if (st) L.push(`  🔴 STALE — 상태는 ${st.was.slice(7, 19)}… 로 만들었는데 지금 그래프는 ${st.now.slice(7, 19)}…`)
  if (s.halted) L.push(`  🛑 중단: ${s.halted}`)

  L.push(`  진행  ${Object.keys(s.completed).length}/${ctx.nodes.size} 노드`)
  if (s.active) L.push(`  진행중 ▶ ${s.active}`)

  if (s.gate_runs.length) {
    L.push('── 게이트 실측 ──')
    const last = new Map()
    for (const r of s.gate_runs) last.set(r.gate, r)
    for (const [, r] of last) {
      L.push(`  ${r.verdict === 'pass' ? '🟢' : '🔴'} ${r.gate}  ${r.field}=${r.value} ${r.op} ${r.threshold}  [${r.ground_truth}]`)
    }
  }

  // 🔴 "통과 수" 만 적지 않는다 — 안 돈 게이트를 함께 적는 것이 규칙이다.
  const notRun = [...ctx.gates.keys()].filter(g => !s.gate_runs.some(r => r.gate === g))
  if (notRun.length) {
    L.push(`── 아직 <한 번도> 안 돈 게이트 ${notRun.length}개 ──`)
    for (const g of notRun) L.push(`  ·  ${fmtGate(ctx, g)}`)
  }

  L.push('── 다음 ──')
  if (s.halted) L.push('  (중단됨 — 사람이 판단해야 한다)')
  else if (s.active) L.push(`  run.mjs <graph> done ${s.active}`)
  else if (!s.ready.length) L.push('  ✅ 남은 노드 없음 — 종단')
  else {
    for (const id of s.ready) {
      const n = ctx.nodes.get(id)
      L.push(`  ▶ ${id}  (${n.kind}/${n.runner})${n.kind === 'human' ? '  ⏸ 사람 대기' : ''}`)
      if (n.rationale) L.push(`      왜: ${n.rationale}`)
      for (const gid of gatesOf(ctx, id)) L.push(`      게이트 ${fmtGate(ctx, gid)}`)
    }
  }
  return L.join('\n')
}

// ── CLI ────────────────────────────────────────────────────────────────────

const USAGE = `graph-architect 러너 — graph.json 을 <집행>한다

  run.mjs <graph.json> init                             상태 생성 (진입 노드부터)
  run.mjs <graph.json> init --force                     그래프를 고쳤을 때 <재>생성 (기존 상태 폐기)
  run.mjs <graph.json> next                             지금 할 수 있는 것 (재개 지점)
  run.mjs <graph.json> status                           전체 그림 + 안 돈 게이트
  run.mjs <graph.json> start <node>                     노드 착수 (프론티어 밖이면 거부)
  run.mjs <graph.json> measure <field> <value> [메모]   측정값 기록 (판정은 도구가 한다)
  run.mjs <graph.json> done <node>                      완료 — 게이트 판정 후 다음을 연다
  run.mjs <graph.json> abort                            진행 중 노드 취소
  run.mjs <graph.json> lint                             OR 함정(한 노드 게이트 2개+) 검사

  --json  기계용 출력`

export async function main (argv) {
  const json = argv.includes('--json')
  const args = argv.filter(a => a !== '--json')
  const [graphPath, cmd, ...rest] = args
  if (!graphPath || !cmd) { console.log(USAGE); return 2 }

  const ctx = loadGraph(graphPath)
  const out = o => console.log(json ? JSON.stringify(o, null, 2) : (o.text ?? ''))

  if (cmd === 'lint') {
    const bad = lintOrTrap(ctx)
    if (!bad.length) { out({ ok: true, text: '🟢 OR 함정 없음 — 노드마다 게이트가 1개 이하다' }); return 0 }
    out({
      ok: false,
      violations: bad,
      text: '🔴 한 노드에 게이트가 여러 개다 — pass 엣지가 여럿이면 AND 가 아니라 OR 다:\n' +
        bad.map(b => `  ${b.node}: ${b.gates.join(', ')}`).join('\n') +
        '\n  → 파생 카운터 1개로 합치거나 노드를 직렬로 쪼개라.',
    })
    return 1
  }

  if (cmd === 'init') {
    // 🔴 init 은 <있으면 읽는다>. 그래프를 고친 뒤 그냥 init 하면 낡은 상태가 그대로 살아남아
    //    STALE 로 표시만 되고 halted 도 안 풀린다 — 스킬 문서가 지시하는 "재검증 → 재init"
    //    경로가 실제로는 없었다(2026-08-20 실측). --force 가 그 경로다.
    const force = rest.includes('--force')
    const sf = stateFileFor(ctx)
    if (existsSync(sf)) {
      const prev = JSON.parse(readFileSync(sf, 'utf8'))
      const doneN = Object.keys(prev.completed ?? {}).length
      if (force) {
        // 원장은 지우지 않는다 — INV-4(append 전용)를 재생성이 깨면 이력이 사라진다.
        rmSync(sf)
        const s2 = loadState(ctx, { create: true })
        saveState(ctx, s2, 'reinit', {
          discarded_hash: prev.graph_hash, discarded_completed: doneN, was_halted: prev.halted ?? null,
        })
        out({ ok: true, state_file: sf, reinit: true, text:
          `상태 재생성: ${sf}\n` +
          `  버린 것: 완료 ${doneN}개 · 해시 ${String(prev.graph_hash).slice(7, 19)}…` +
          `${prev.halted ? ` · 중단(${prev.halted})` : ''}\n` +
          `  🔴 원장(state.ledger.jsonl)은 그대로 남는다 — 이전 실행 이력은 거기 있다\n\n${report(ctx, s2)}` })
        return 0
      }
      const st = staleness(ctx, prev)
      if (st) {
        out({ ok: false, stale: st, text:
          `🔴 상태가 이미 있고 <그래프와 어긋난다> — init 은 그것을 덮지 않는다.\n` +
          `  상태 ${st.was.slice(7, 19)}…  ≠  그래프 ${st.now.slice(7, 19)}…\n` +
          `  → 이어가려면 그래프를 되돌려라. 새 그래프로 갈아타려면:  run.mjs <graph> init --force` })
        return 1
      }
    }
    const s = loadState(ctx, { create: true })
    out({ ok: true, state_file: sf, text: `상태 생성: ${sf}\n\n${report(ctx, s)}` })
    return 0
  }

  const s = loadState(ctx)

  if (cmd === 'next' || cmd === 'status') { out({ ok: true, state: s, text: report(ctx, s) }); return 0 }

  if (cmd === 'abort') {
    const was = s.active
    s.active = null
    s.active_visit = null
    if (was) { s.ready.unshift(was); saveState(ctx, s, 'abort', { node: was }) }
    out({ ok: true, text: `취소: ${was ?? '(진행 중 없음)'}\n\n${report(ctx, s)}` })
    return 0
  }

  if (cmd === 'start') { cmdStart(ctx, s, rest[0]); out({ ok: true, text: report(ctx, s) }); return 0 }

  if (cmd === 'measure') {
    cmdMeasure(ctx, s, rest[0], rest[1], rest.slice(2).join(' '))
    const m = s.measured[rest[0]]
    out({ ok: true, measured: m, text: `기록: ${rest[0]} = ${m.value}${m.note ? `  (${m.note})` : ''}` })
    return 0
  }

  if (cmd === 'done') {
    const r = cmdDone(ctx, s, rest[0])
    const lines = r.results.map(x =>
      `  ${x.verdict === 'pass' ? '🟢' : '🔴'} ${x.gate}: ${x.field}=${x.value} ${x.op} ${x.threshold} → ${x.verdict}`)
    out({ ok: !r.halted, results: r.results, opened: r.opened, halted: r.halted,
      text: [`완료: ${rest[0]}`, ...lines, '', report(ctx, s)].join('\n') })
    return r.halted ? 1 : 0
  }

  console.log(USAGE)
  return 2
}

if (process.argv[1] && /run\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main(process.argv.slice(2))
    .then(code => process.exit(code))
    .catch(e => { console.error(String(e?.message ?? e)); process.exit(1) })
}
