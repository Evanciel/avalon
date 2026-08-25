/**
 * run.mjs 자기시험 — <거부가 실제로 걸리는가>를 잰다.
 *
 * 🔴 이 파일의 존재 이유: 러너의 값어치는 <막는 것>이다.
 *    막는 코드를 지웠을 때 시험이 빨개지지 않으면 그 러너는 장식이다.
 *    그래서 대부분의 케이스가 "이것이 <반드시> 실패해야 한다" 형태다.
 *
 * 실행: node run.selftest.mjs
 */

import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadGraph, loadState, saveState, cmdStart, cmdMeasure, cmdDone,
  lintOrTrap, staleness, stateFileFor, freshState, evaluateGate, main,
} from './run.mjs'

let pass = 0
const fails = []

function ok (name, fn) {
  try { fn(); pass++; console.log(`  🟢 ${name}`) }
  catch (e) { fails.push([name, e]); console.log(`  🔴 ${name}\n       ${String(e?.message ?? e).split('\n')[0]}`) }
}

/** ok 의 async 판. sync 인 ok 로 async fn 을 부르면 throw 가 밖으로 새어 하네스가 죽는다. */
async function okA (name, fn) {
  try { await fn(); pass++; console.log(`  \u{1F7E2} ${name}`) }
  catch (e) { fails.push([name, e]); console.log(`  \u{1F534} ${name}\n       ${String(e?.message ?? e).split('\n')[0]}`) }
}

/** "이 호출은 반드시 던져야 한다" — 러너의 방어벽 하나하나가 여기서 증명된다. */
function rejects (name, fn, mustContain) {
  ok(name, () => {
    let threw = null
    try { fn() } catch (e) { threw = e }
    if (!threw) throw new Error('거부하지 않았다 — 방어벽이 없다')
    if (mustContain && !String(threw.message).includes(mustContain)) {
      throw new Error(`다른 이유로 거부했다: ${threw.message}`)
    }
  })
}

const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`) }

// ── 픽스처 ─────────────────────────────────────────────────────────────────

const DIR = mkdtempSync(join(process.env.CLAUDE_SELFTEST_TMP || 'A:/claude-temp', 'graphrun-'))

/**
 * a → (G1) → b ∥ c → j(join) → h(human)
 *          ↘ (G1 fail, max_retry 1) → a
 */
function fixture (over = {}) {
  const g = {
    graph: {
      spec: { version: '1.1.0', hash: 'sha256:' + 'a'.repeat(64) },
      name: 'fixture', mode: 'A', entry: 'a',
      host: { pipeline: 'none', state_file: join(DIR, `${over.name ?? 'f'}.state.json`) },
    },
    project: { fingerprint: { hash: 'sha256:' + 'b'.repeat(64) } },
    state: [
      { field: 'count', type: 'int', unit: 'count' },
      { field: 'rate', type: 'ratio', unit: 'ratio' },
      { field: 'bcount', type: 'int', unit: 'count' },
    ],
    nodes: [
      { id: 'a', kind: 'work', runner: 'script', retry: { max: 2 }, policy: {} },
      { id: 'b', kind: 'work', runner: 'script', retry: { max: 0 }, policy: {} },
      { id: 'c', kind: 'work', runner: 'script', retry: { max: 0 }, policy: {} },
      { id: 'j', kind: 'join', runner: 'script', retry: { max: 0 }, policy: {} },
      { id: 'h', kind: 'human', runner: 'manual', retry: { max: 0 }, policy: {} },
    ],
    edges: [
      { from: 'a', to: 'b', when: 'gate:G1:pass' },
      { from: 'a', to: 'c', when: 'gate:G1:pass' },
      { from: 'a', to: 'a', when: 'gate:G1:fail' },
      { from: 'b', to: 'j', when: 'always' },
      { from: 'c', to: 'j', when: 'always' },
      { from: 'j', to: 'h', when: 'always' },
    ],
    gates: [
      { id: 'G1', field: 'count', op: '>=', threshold: 3, on_fail: { goto: 'a', max_retry: 1 }, ground_truth: 'measured' },
    ],
    ...over.patch,
  }
  const p = join(DIR, `${over.name ?? 'f'}.graph.json`)
  writeFileSync(p, JSON.stringify(g, null, 2), 'utf8')
  return loadGraph(p)
}

const boot = name => { const ctx = fixture({ name }); return { ctx, s: loadState(ctx, { create: true }) } }

console.log('\n== INV-2  프론티어 밖은 못 연다 ==')

rejects('진입이 아닌 노드를 start 하면 거부', () => {
  const { ctx, s } = boot('t1')
  cmdStart(ctx, s, 'b')          // 진입은 a 다
}, '프론티어에 없는')

rejects('아예 없는 노드를 start 하면 거부', () => {
  const { ctx, s } = boot('t2')
  cmdStart(ctx, s, 'nope')
}, '프론티어에 없는')

rejects('두 노드를 동시에 start 하면 거부', () => {
  const { ctx, s } = boot('t3')
  cmdStart(ctx, s, 'a')
  cmdStart(ctx, s, 'a')
}, '이미 진행 중')

console.log('\n== INV-3  이번 방문에 재지 않았으면 판정하지 않는다 ==')

rejects('측정 없이 done 하면 거부', () => {
  const { ctx, s } = boot('t4')
  cmdStart(ctx, s, 'a')
  cmdDone(ctx, s, 'a')
}, '판정할 수 없다')

rejects('🔴 <옛 방문>의 측정값으로 재통과하려 하면 거부', () => {
  const { ctx, s } = boot('t5')
  // 1회차: 미달로 실패시켜 a 로 되돌아온다
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 1, '1회차'); cmdDone(ctx, s, 'a')
  // 2회차: <새로 재지 않고> 그냥 끝내려 한다 → 막혀야 한다
  cmdStart(ctx, s, 'a')
  cmdDone(ctx, s, 'a')
}, '이번 방문에 잰 값이 아니다')

rejects('진행 중이 아닌 노드를 done 하면 거부', () => {
  const { ctx, s } = boot('t6')
  cmdDone(ctx, s, 'a')
}, '진행 중인 노드가 아니다')

console.log('\n== 측정 위생 ==')

rejects('state[] 에 없는 필드는 못 잰다', () => {
  const { ctx, s } = boot('t7')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'made_up', 5)
}, 'state[] 에 없는 필드')

rejects('숫자가 아니면 거부', () => {
  const { ctx, s } = boot('t8')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', '충분히 많음')
}, '숫자가 아니다')

rejects('int 필드에 소수는 거부', () => {
  const { ctx, s } = boot('t9')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 3.5)
}, '정수여야 한다')

rejects('ratio 는 0~1 밖이면 거부', () => {
  const { ctx, s } = boot('t10')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'rate', 95)
}, 'ratio 는 0~1')

console.log('\n== INV-1  판정은 도구가 한다 ==')

ok('경계값 정확 — threshold 와 같으면 >= 는 pass', () => {
  const { ctx, s } = boot('t11')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 3)
  eq(evaluateGate(ctx, s, 'G1').verdict, 'pass', '3 >= 3')
})

ok('경계값 정확 — 하나 모자라면 fail', () => {
  const { ctx, s } = boot('t12')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 2)
  eq(evaluateGate(ctx, s, 'G1').verdict, 'fail', '2 >= 3')
})

ok('verdict 를 상태에 손으로 써 넣어도 done 이 <다시 계산>한다', () => {
  const { ctx, s } = boot('t13')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 1)
  s.gate_runs.push({ gate: 'G1', verdict: 'pass', field: 'count', value: 999 })  // 조작 시도
  const r = cmdDone(ctx, s, 'a')
  eq(r.results[0].verdict, 'fail', '조작을 무시하고 재계산해야 한다')
  eq(r.opened.join(','), 'a', 'fail 이므로 a 로 되돌아간다')
})

console.log('\n== 위상 — fan-out · join · 종단 ==')

ok('pass 하나로 두 노드가 함께 열린다 (fan-out)', () => {
  const { ctx, s } = boot('t14')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 5)
  const r = cmdDone(ctx, s, 'a')
  eq([...r.opened].sort().join(','), 'b,c', 'fan-out')
})

ok('🔴 join 은 선행이 <전부> 끝나야 열린다', () => {
  const { ctx, s } = boot('t15')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 5); cmdDone(ctx, s, 'a')
  cmdStart(ctx, s, 'b'); cmdDone(ctx, s, 'b')
  if (s.ready.includes('j')) throw new Error('c 가 안 끝났는데 join 이 열렸다')
  cmdStart(ctx, s, 'c'); cmdDone(ctx, s, 'c')
  if (!s.ready.includes('j')) throw new Error('둘 다 끝났는데 join 이 안 열렸다')
})

ok('끝까지 돌면 terminal 이고 human 노드가 마지막이다', () => {
  const { ctx, s } = boot('t16')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 5); cmdDone(ctx, s, 'a')
  for (const n of ['b', 'c']) { cmdStart(ctx, s, n); cmdDone(ctx, s, n) }
  cmdStart(ctx, s, 'j'); cmdDone(ctx, s, 'j')
  eq(s.ready.join(','), 'h', 'human 이 남아야 한다')
  cmdStart(ctx, s, 'h')
  eq(cmdDone(ctx, s, 'h').terminal, true, '종단')
})

console.log('\n== 루프 상한 — 무한 재시도를 끊는다 ==')

ok('🔴 게이트 fail 이 max_retry 를 넘으면 halt 한다', () => {
  const { ctx, s } = boot('t17')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 0, '1회'); cmdDone(ctx, s, 'a')  // fail 1 (≤1 허용)
  if (s.halted) throw new Error('첫 실패에 멈추면 안 된다')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 0, '2회')
  const r = cmdDone(ctx, s, 'a')                                                      // fail 2 > 1
  if (!r.halted) throw new Error('상한을 넘었는데 계속 돈다')
})

rejects('halt 뒤에는 아무 노드도 못 연다', () => {
  const { ctx, s } = boot('t18')
  s.halted = '테스트 중단'
  saveState(ctx, s, 'halt', {})
  cmdStart(ctx, s, 'a')
}, '중단됨')

ok('노드 자체 재시도(retry.max)도 상한이 있다', () => {
  const { ctx, s } = boot('t19')
  // b 는 retry.max=0 → 착수는 1회만 가능
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 5); cmdDone(ctx, s, 'a')
  cmdStart(ctx, s, 'b'); cmdDone(ctx, s, 'b')
  s.ready.push('b')                       // 억지로 다시 열어 본다
  let threw = null
  try { cmdStart(ctx, s, 'b') } catch (e) { threw = e }
  if (!threw) throw new Error('두 번째 착수를 막지 않았다')
})

console.log('\n== 재개 · 감사 ==')

ok('🔴 상태를 <디스크에서 다시 읽어도> 프론티어가 같다 (컨텍스트 압축 생존)', () => {
  const { ctx, s } = boot('t20')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 5); cmdDone(ctx, s, 'a')
  const again = loadState(loadGraph(ctx.graphPath))
  eq([...again.ready].sort().join(','), 'b,c', '재개 프론티어')
  eq(again.measured.count.value, 5, '측정값 보존')
})

// 🔴 계약이 바뀌었다 (2026-08-20). 예전엔 <선언된> spec.hash 를 비교했다.
//    그러면 graph.json 을 고치고 hash.mjs 를 안 돌린 경우를 못 잡아서, 지금은
//    내용에서 <다시 계산>한다. 그래서 판정이 두 방향 다 뒤집힌다 — 둘 다 못박는다.
ok('INV-5  그래프 <내용>이 바뀌면 stale 을 알린다', () => {
  const { ctx, s } = boot('t21')
  const g = JSON.parse(readFileSync(ctx.graphPath, 'utf8'))
  g.gates[0].threshold = 42                       // 내용 변경. spec.hash 는 안 건드린다
  writeFileSync(ctx.graphPath, JSON.stringify(g), 'utf8')
  if (!staleness(loadGraph(ctx.graphPath), s)) throw new Error('내용이 바뀌었는데 조용하다')
})

ok('INV-5  선언된 hash 만 손으로 바꾼 것은 stale 이 <아니다> (같은 그래프다)', () => {
  const { ctx, s } = boot('t21b')
  const g = JSON.parse(readFileSync(ctx.graphPath, 'utf8'))
  g.graph.spec.hash = 'sha256:' + 'c'.repeat(64)  // 내용은 그대로
  writeFileSync(ctx.graphPath, JSON.stringify(g), 'utf8')
  if (staleness(loadGraph(ctx.graphPath), s)) throw new Error('같은 그래프인데 stale 이라 한다')
})

ok('INV-4  원장이 append-only 로 쌓인다', () => {
  const { ctx, s } = boot('t22')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', 5, '메모'); cmdDone(ctx, s, 'a')
  const led = stateFileFor(ctx).replace(/\.json$/, '') + '.ledger.jsonl'
  if (!existsSync(led)) throw new Error('원장이 없다')
  const rows = readFileSync(led, 'utf8').trim().split('\n').map(JSON.parse)
  const acts = rows.map(r => r.action)
  for (const need of ['init', 'start', 'measure', 'done']) {
    if (!acts.includes(need)) throw new Error(`원장에 ${need} 가 없다`)
  }
  if (!rows.some(r => r.note === '메모')) throw new Error('측정 메모가 안 남았다')
})

console.log('\n== OR 함정 린트 ==')

ok('한 노드에 게이트 1개면 통과', () => {
  if (lintOrTrap(fixture({ name: 't23' })).length) throw new Error('멀쩡한 그래프를 잡았다')
})

ok('🔴 한 노드에 게이트 2개면 잡는다 (validate.mjs 가 못 잡는 것)', () => {
  const ctx = fixture({
    name: 't24',
    patch: {
      gates: [
        { id: 'G1', field: 'count', op: '>=', threshold: 3, on_fail: { goto: 'a', max_retry: 1 } },
        { id: 'G2', field: 'bcount', op: '>=', threshold: 1, on_fail: { goto: 'a', max_retry: 1 } },
      ],
      edges: [
        { from: 'a', to: 'b', when: 'gate:G1:pass' },
        { from: 'a', to: 'c', when: 'gate:G2:pass' },
        { from: 'a', to: 'a', when: 'gate:G1:fail' },
        { from: 'b', to: 'j', when: 'always' },
        { from: 'c', to: 'j', when: 'always' },
        { from: 'j', to: 'h', when: 'always' },
      ],
    },
  })
  const bad = lintOrTrap(ctx)
  if (!bad.length) throw new Error('OR 함정을 놓쳤다')
  eq(bad[0].node, 'a', '어느 노드인지')
})

console.log('\n== 상태 쓰기 안전 ==')

ok('🔴 상태 저장이 대상 파일을 <먼저 자르지> 않는다', () => {
  const { ctx, s } = boot('t25')
  const sf = stateFileFor(ctx)
  const before = readFileSync(sf, 'utf8')
  if (!before.trim()) throw new Error('init 이 빈 파일을 남겼다')
  cmdStart(ctx, s, 'a')
  const after = readFileSync(sf, 'utf8')
  if (!after.trim() || !JSON.parse(after).active) throw new Error('저장 뒤 파일이 깨졌다')
})

ok('상태 파일이 없으면 create 없이는 거부', () => {
  const ctx = fixture({ name: 't26' })
  let threw = null
  try { loadState(ctx) } catch (e) { threw = e }
  if (!threw) throw new Error('없는 상태를 조용히 만들었다')
  freshState(ctx)   // 순수 함수라 부작용이 없어야 한다
  if (existsSync(stateFileFor(ctx))) throw new Error('freshState 가 디스크를 건드렸다')
})

console.log('\n== 분기 게이트 (max_retry 0) ==')

// 분기 픽스처: a -(G1 pass)-> b / a -(G1 fail, max_retry 0)-> c  ← 미달도 정상 결과다
const branchPatch = (over = {}) => ({
  nodes: [
    { id: 'a', kind: 'work', runner: 'script', retry: { max: 0 }, policy: {} },
    { id: 'b', kind: 'work', runner: 'script', retry: { max: 0 }, policy: {} },
    { id: 'c', kind: 'human', runner: 'manual', retry: { max: 0 }, policy: {} },
  ],
  edges: [
    { from: 'a', to: 'b', when: 'gate:G1:pass' },
    { from: 'a', to: 'c', when: 'gate:G1:fail' },
  ],
  gates: [{ id: 'G1', field: 'count', op: '>=', threshold: 3,
            on_fail: { goto: over.goto ?? 'c', max_retry: 0 }, ground_truth: 'measured' }],
})

ok('★ max_retry 0 은 <분기>다 — 미달해도 멈추지 않고 fail 쪽으로 간다', () => {
  const ctx = fixture({ name: 'br1', patch: branchPatch() })
  const s = loadState(ctx, { create: true })
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', '1')
  const r = cmdDone(ctx, s, 'a')
  if (r.halted) throw new Error(`분기인데 멈췄다: ${r.halted}`)
  eq(r.results[0].verdict, 'fail', '판정')
  if (!r.s.ready.includes('c')) throw new Error(`fail 목적지가 안 열렸다: ready=${r.s.ready}`)
  if (r.s.ready.includes('b')) throw new Error('pass 쪽이 열렸다')
})

ok('★ 그래도 <이미 끝난 노드>로 되돌아가는 분기는 멈춘다 (예산 없는 루프)', () => {
  const ctx = fixture({ name: 'br2', patch: branchPatch({ goto: 'a' }) })
  const g = JSON.parse(readFileSync(ctx.graphPath, 'utf8'))
  g.edges = [{ from: 'a', to: 'b', when: 'gate:G1:pass' },
             { from: 'a', to: 'a', when: 'gate:G1:fail' }]
  writeFileSync(ctx.graphPath, JSON.stringify(g, null, 2), 'utf8')
  const ctx2 = loadGraph(ctx.graphPath)
  const s = loadState(ctx2, { create: true })
  cmdStart(ctx2, s, 'a'); cmdMeasure(ctx2, s, 'count', '1')
  const r = cmdDone(ctx2, s, 'a')
  if (!r.halted) throw new Error('예산 없는 되돌이 분기를 안 잡는다')
})

ok('max_retry 1 짜리 루프는 여전히 상한에서 멈춘다', () => {
  const { ctx, s } = boot('br3')          // 기본 픽스처: G1 fail → a, max_retry 1
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', '1'); cmdDone(ctx, s, 'a')
  cmdStart(ctx, s, 'a'); cmdMeasure(ctx, s, 'count', '1')
  const r = cmdDone(ctx, s, 'a')
  if (!r.halted) throw new Error('상한을 넘겼는데 안 멈춘다')
})

console.log('\n== INV-5b  그래프를 고친 뒤 재init ==')

// 조용히 돌린다 — main 은 사람용 출력을 콘솔에 쓴다.
async function runQuiet (argv) {
  const real = console.log
  console.log = () => {}
  try { return await main(argv) } finally { console.log = real }
}
// 픽스처 그래프를 <내용까지> 바꿔 해시를 달라지게 한다.
function bumpGraph (ctx, threshold) {
  const g = JSON.parse(readFileSync(ctx.graphPath, 'utf8'))
  g.gates[0].threshold = threshold
  writeFileSync(ctx.graphPath, JSON.stringify(g, null, 2), 'utf8')
  return loadGraph(ctx.graphPath)
}

await okA('init 은 상태 파일을 만든다', async () => {
  const ctx = fixture({ name: 'ri1' })
  eq(await runQuiet([ctx.graphPath, 'init']), 0, 'exit')
  if (!existsSync(stateFileFor(ctx))) throw new Error('상태 파일이 안 생겼다')
})

await okA('★ 회귀: 그래프가 바뀌었는데 그냥 init 하면 <거부>하고 상태를 안 덮는다', async () => {
  const ctx = fixture({ name: 'ri2' })
  await runQuiet([ctx.graphPath, 'init'])
  const s0 = loadState(ctx); s0.completed = { a: 1 }; saveState(ctx, s0, 'testmark', {})

  const ctx2 = bumpGraph(ctx, 99)
  eq(await runQuiet([ctx2.graphPath, 'init']), 1, '어긋난 상태 위에 init 이 성공하면 안 된다')
  eq(Object.keys(loadState(ctx2).completed).length, 1, 'init 이 상태를 덮었다')
})

await okA('★ init --force 는 상태를 재생성하고 halt 를 푼다', async () => {
  const ctx = fixture({ name: 'ri3' })
  await runQuiet([ctx.graphPath, 'init'])
  const s0 = loadState(ctx)
  s0.completed = { a: 1, b: 1 }; s0.halted = '노드 재시도 소진: b'
  saveState(ctx, s0, 'testmark', {})

  const ctx2 = bumpGraph(ctx, 99)
  eq(await runQuiet([ctx2.graphPath, 'init', '--force']), 0, 'exit')
  const s1 = loadState(ctx2)
  eq(Object.keys(s1.completed).length, 0, '완료가 안 비워졌다')
  eq(s1.halted ?? null, null, 'halt 가 안 풀렸다')
  eq(s1.graph_hash, staleness(ctx2, { graph_hash: 'x' }).now, '새 해시로 안 갈렸다')
})

await okA('★ --force 가 <원장을 지우지 않는다> (INV-4)', async () => {
  const ctx = fixture({ name: 'ri4' })
  await runQuiet([ctx.graphPath, 'init'])
  const led = stateFileFor(ctx).replace(/\.json$/, '') + '.ledger.jsonl'
  const before = readFileSync(led, 'utf8').trim().split('\n').length

  const ctx2 = bumpGraph(ctx, 99)
  await runQuiet([ctx2.graphPath, 'init', '--force'])
  const after = readFileSync(led, 'utf8').trim().split('\n')
  if (after.length <= before) throw new Error(`원장이 줄었다: ${before} → ${after.length}`)
  if (!after.some(l => JSON.parse(l).action === 'reinit')) throw new Error('reinit 기록이 없다')
})

await okA('★ 회귀: hash.mjs 를 <안 돌리고> 고쳐도 STALE 이 뜬다', async () => {
  const ctx = fixture({ name: 'ri6' })
  await runQuiet([ctx.graphPath, 'init'])
  // spec.hash 는 그대로 두고 <내용만> 바꾼다 — 재스탬프를 잊은 상황이다.
  const ctx2 = bumpGraph(ctx, 77)
  if (!staleness(ctx2, loadState(ctx2))) throw new Error('재스탬프 없이 고친 것을 못 잡는다')
  eq(await runQuiet([ctx2.graphPath, 'init']), 1, '어긋난 상태 위에 init 이 성공하면 안 된다')
})

await okA('같은 그래프면 --force 없이도 init 이 이어간다', async () => {
  const ctx = fixture({ name: 'ri5' })
  await runQuiet([ctx.graphPath, 'init'])
  const s0 = loadState(ctx); s0.completed = { a: 1 }; saveState(ctx, s0, 'testmark', {})
  eq(await runQuiet([ctx.graphPath, 'init']), 0, 'exit')
  eq(Object.keys(loadState(ctx).completed).length, 1, '멀쩡한 상태를 날렸다')
})

// ── 결과 ───────────────────────────────────────────────────────────────────

console.log(`\n──\n  통과 ${pass} / 실패 ${fails.length}   (임시: ${DIR})`)
if (fails.length) {
  console.log('\n🔴 실패 상세')
  for (const [n, e] of fails) console.log(`  · ${n}\n      ${e?.stack ?? e}`)
  process.exit(1)
}
console.log('  🟢 전부 통과 — 거부 방어벽 15종이 <실제로> 걸린다')
