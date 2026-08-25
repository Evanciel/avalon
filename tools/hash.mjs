/**
 * Avalon IR — canonical JSON + sha256
 *
 * INV-1: 순수 함수. LLM 호출 없음. 외부 I/O 없음(CLI 진입점 제외).
 * ir-schema.md §1, §2 참조.
 */

import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/**
 * 이 파일이 직접 실행됐는가.
 * ⚠️ `file://${argv[1]}` 문자열 비교를 쓰지 말 것 — Windows에서 한글 경로가
 *    URL 인코딩(%EC%..)되고 슬래시 개수도 달라 항상 false가 된다.
 *    CLI가 조용히 안 돌면서 exit=0을 내 성공처럼 보인다. pathToFileURL을 쓴다.
 */
export const isMain = (url) => !!process.argv[1] && url === pathToFileURL(process.argv[1]).href

/**
 * Canonical JSON — 키 정렬 + 공백 제거 + UTF-8.
 * 같은 의미의 객체는 키 순서와 무관하게 같은 문자열이 된다.
 */
export function canonical(value) {
  if (value === undefined) throw new Error('canonical: undefined는 직렬화할 수 없다')
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
      .join(',') +
    '}'
  )
}

export function sha256(str) {
  return 'sha256:' + createHash('sha256').update(str, 'utf8').digest('hex')
}

/**
 * project.fingerprint.hash = sha256(canonical({stack, scale, markers}))
 * hash 자신은 입력에서 제외한다.
 */
export function fingerprintHash(fp) {
  if (!fp) throw new Error('fingerprintHash: project.fingerprint 없음')
  const { stack, scale, markers } = fp
  return sha256(canonical({ stack, scale, markers }))
}

/**
 * graph.spec.hash = sha256(canonical(문서 전체 - graph.spec.hash 자신))
 * ③의 실행 기록과 ④의 아카이브를 잇는 조인 키 (G5·G8).
 */
export function specHash(graph) {
  const clone = structuredClone(graph)
  if (clone?.graph?.spec) delete clone.graph.spec.hash
  return sha256(canonical(clone))
}

/**
 * 두 해시를 채운 새 문서를 반환한다. 입력을 변형하지 않는다.
 * 순서 주의: fingerprint.hash가 먼저다 — specHash가 그것까지 덮기 때문.
 */
export function stamp(graph) {
  const g = structuredClone(graph)
  if (g?.project?.fingerprint) g.project.fingerprint.hash = fingerprintHash(g.project.fingerprint)
  if (g?.graph?.spec) g.graph.spec.hash = specHash(g)
  return g
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const { readFileSync, writeFileSync } = await import('node:fs')
  const [, , file, flag] = process.argv
  if (!file) {
    console.error('usage: node hash.mjs <graph.json> [--write]')
    process.exit(2)
  }
  const src = JSON.parse(readFileSync(file, 'utf8'))
  const out = stamp(src)
  if (flag === '--write') {
    writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8')
    console.log(`stamped  ${file}`)
  }
  console.log(`graph.spec.hash        ${out.graph?.spec?.hash}`)
  console.log(`project.fingerprint    ${out.project?.fingerprint?.hash}`)
}
