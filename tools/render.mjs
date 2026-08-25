/**
 * Avalon IR — JSON → 마크다운 렌더러
 *
 * 정본은 JSON이다. 마크다운은 산출물이다.
 * ⚠️ JSON에 없는 정보를 추가하지 않는다. 순수 함수.
 *
 * G0의 markdown_synced: sha256(render(graph.json)) == sha256(graph.md)
 */

import { t } from './i18n.mjs'

const esc = (s) => String(s).replace(/\|/g, '\\|')
const list = (a) => (a?.length ? a.map((x) => `\`${x}\``).join(' ') : '—')

export function render(g) {
  const L = []
  const spec = g.graph?.spec ?? {}
  const fp = g.project?.fingerprint ?? {}

  L.push(`# ${g.graph?.name ?? 'graph'}`, '')
  L.push('> Generated from `graph.json`. **Do not edit directly** — the JSON is canonical.', '')
  L.push(`| | |`, `|---|---|`)
  L.push(`| spec.version | \`${spec.version ?? '—'}\` |`)
  L.push(`| spec.hash | \`${spec.hash ?? '—'}\` |`)
  L.push(`| mode | \`${g.graph?.mode ?? '—'}\` |`, '')

  L.push('## project.fingerprint', '')
  L.push(`| field | value |`, `|---|---|`)
  L.push(`| stack | ${list(fp.stack)} |`)
  L.push(`| scale | files \`${fp.scale?.files ?? '—'}\` / modules \`${fp.scale?.modules ?? '—'}\` |`)
  L.push(`| markers | ${list(fp.markers)} |`)
  L.push(`| hash | \`${fp.hash ?? '—'}\` |`, '')

  L.push('## state', '')
  L.push(`| field | type |`, `|---|---|`)
  for (const s of g.state ?? []) L.push(`| \`${esc(s.field)}\` | ${esc(s.type)} |`)
  L.push('')

  L.push('## nodes', '')
  L.push(`| id | kind | runner | retry.max | on_exhaust | approval | reversible | budget(tok/iter/s) |`)
  L.push(`|---|---|---|---|---|---|---|---|`)
  for (const n of g.nodes ?? []) {
    const p = n.policy ?? {}, b = p.budget ?? {}
    L.push(
      `| \`${esc(n.id)}\` | ${esc(n.kind)} | ${esc(n.runner)} | ${n.retry?.max ?? '—'} | ` +
      `${esc(n.retry?.on_exhaust ?? '—')} | ${p.requires_approval ? '**required**' : '—'} | ` +
      `${p.reversible === false ? '**irreversible**' : 'reversible'} | ` +
      `${b.tokens ?? '—'} / ${b.iterations ?? '—'} / ${b.wall_clock_s ?? '—'} |`
    )
  }
  L.push('')

  const withTools = (g.nodes ?? []).filter((n) => n.policy?.allowed_tools?.length)
  if (withTools.length) {
    L.push('### allowed_tools', '')
    for (const n of withTools) L.push(`- \`${esc(n.id)}\` — ${list(n.policy.allowed_tools)}`)
    L.push('')
  }

  const withProduces = (g.nodes ?? []).filter((n) => n.produces?.length)
  if (withProduces.length) {
    L.push('### produces', '')
    for (const n of withProduces) L.push(`- \`${esc(n.id)}\` → ${list(n.produces)}`)
    L.push('')
  }

  L.push('## edges', '')
  L.push(`| from | to | when |`, `|---|---|---|`)
  for (const e of g.edges ?? []) {
    L.push(`| \`${esc(e.from)}\` | \`${esc(e.to)}\` | \`${esc(e.when)}\` |`)
  }
  L.push('')

  L.push('## gates', '')
  L.push(`| id | condition | on fail | max retry | evidence | threshold source |`)
  L.push(`|---|---|---|---|---|---|`)
  for (const x of g.gates ?? []) {
    L.push(
      `| **${esc(x.id)}** | \`${esc(x.field)} ${esc(x.op)} ${x.threshold}\` | ` +
      `\`${esc(x.on_fail?.goto ?? '—')}\` | ${x.on_fail?.max_retry ?? '—'} | ` +
      `${esc(x.ground_truth ?? '—')} | ${esc(x.threshold_source ?? '—')} |`
    )
  }
  L.push('')

  // Step 0 / Step 5 의 결정 — 이게 없으면 정본에도 산출물에도 안 남는다
  if (g.graph?.scope) {
    L.push('## Scope — one run of what', '')
    L.push(`This graph covers one run of **${esc(g.graph.scope.unit ?? '—')}**.`, '')
    if (g.graph.scope.not_covered?.length) {
      L.push('Not covered:', '')
      for (const x of g.graph.scope.not_covered) L.push(`- ${esc(x)}`)
      L.push('')
    }
  }

  if (g.graph?.host) {
    const h = g.graph.host
    L.push('## Host', '')
    L.push(`| | |`, `|---|---|`)
    L.push(`| pipeline | \`${esc(h.pipeline ?? '—')}\` |`)
    L.push(`| reason | ${esc(h.reason ?? '—')} |`)
    L.push(`| state file | \`${esc(h.state_file ?? '—')}\` |`)
    // enforced_by_hook 는 문자열(구형)과 {gate, check}(선언+기계) 둘 다 온다
    const hookCells = (h.enforced_by_hook ?? []).map((e) =>
      typeof e === 'string' ? `\`${esc(e)}\`` : `\`${esc(e?.gate ?? '—')}\` ← \`${esc(e?.check ?? '—')}\``)
    L.push(`| enforced by hook | ${hookCells.join(' · ') || '—'} |`)
    L.push('')
  }

  // fan-in 표시 — 스키마가 허용하는 사실을 드러낸다 (새 정보 아님)
  const inbound = new Map()
  for (const e of g.edges ?? []) inbound.set(e.to, (inbound.get(e.to) ?? 0) + 1)
  const joins = [...inbound.entries()].filter(([, c]) => c > 1)
  if (joins.length) {
    L.push('## Join points (fan-in)', '')
    for (const [id, c] of joins) L.push(`- \`${esc(id)}\` ← inbound ${c}`)
    L.push('')
  }

  // ── 근거 필드 (선택) — graph-architect 절대규칙이 요구하는 서술 ──────────
  const rationaled = (g.nodes ?? []).filter((n) => n.rationale)
  if (rationaled.length) {
    L.push('## Node rationale', '')
    L.push(`| node | rationale |`, `|---|---|`)
    for (const n of rationaled) L.push(`| \`${esc(n.id)}\` | ${esc(n.rationale)} |`)
    L.push('')
  }

  if (g.graph?.verdict) {
    L.push('## Verdict', '')
    L.push(`| axis | value |`, `|---|---|`)
    for (const [k, v] of Object.entries(g.graph.verdict)) L.push(`| ${esc(k)} | ${esc(v)} |`)
    L.push('')
  }

  if (g.graph?.excluded?.length) {
    L.push('## Not attached', '')
    L.push(`| node | exclusion reason |`, `|---|---|`)
    for (const x of g.graph.excluded) L.push(`| \`${esc(x.node)}\` | ${esc(x.reason)} |`)
    L.push('')
  }

  const gr = g.graph?.guarantees
  if (gr) {
    L.push('## Guarantees', '')
    L.push(`| | content |`, `|---|---|`)
    L.push(`| provides | ${(gr.provides ?? []).map(esc).join(' · ') || '—'} |`)
    L.push(`| **does not** | ${(gr.excludes ?? []).map(esc).join(' · ') || '—'} |`)
    L.push('')
  }

  return L.join('\n')
}

// ── CLI ────────────────────────────────────────────────────────────────────
const { isMain } = await import('./hash.mjs')
if (isMain(import.meta.url)) {
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs')
  const { sha256 } = await import('./hash.mjs')
  const [, , file, out, flag] = process.argv
  if (!file) {
    console.error('usage: node render.mjs <graph.json> [out.md] [--check]')
    process.exit(2)
  }
  const md = render(JSON.parse(readFileSync(file, 'utf8'))) + '\n'

  // G0b markdown_synced — 정본(JSON)에서 렌더한 것과 디스크의 .md가 같은가.
  // 사람이 .md만 고치면 ②가 승인되지 않은 그래프를 컴파일한다.
  if (flag === '--check') {
    if (!existsSync(out)) { console.log(t(`markdown_synced  0  (${out} missing)`, `markdown_synced  0  (${out} 없음)`)); process.exit(1) }
    const disk = readFileSync(out, 'utf8')
    const synced = sha256(md) === sha256(disk)
    console.log(`  rendered  ${sha256(md)}`)
    console.log(`  on disk   ${sha256(disk)}`)
    console.log(`  markdown_synced  ${synced ? 1 : 0}      G0b ${synced ? 'PASS' : 'FAIL'}`)
    if (!synced) console.log(t(`  ↳ the .md may have been edited directly. The JSON is canonical — regenerate with render`,
                               `  ↳ .md를 직접 고쳤을 수 있다. 정본은 JSON — render로 재생성할 것`))
    process.exit(synced ? 0 : 1)
  }

  if (out) { writeFileSync(out, md, 'utf8'); console.log(`rendered → ${out}`) }
  else process.stdout.write(md)
}
