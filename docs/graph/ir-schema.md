# Avalon IR — 기계 판독 그래프 명세 (v1)

> 2026-08-12 / `avalon-graph.md` v4의 **G0** 충족을 위한 스펙
> 해소 대상: **X5** (`project.fingerprint` 미정의로 G0 판정 불가)
> 상태(2026-08-25 갱신): **구현 완료** — validate·render·compile·hash·test 5종 작동, 테스트 88건. §8 선언-실재 대조(D7)까지 반영

---

## 0. 이 문서가 푸는 문제

`graph-architect` 실측 결과:

| | 상태 |
|---|---|
| semantic | ✅ 이미 강제됨 (절대규칙 1 + Step 4 + UP-CONTRACT) |
| syntax | ❌ 마크다운 표 + ASCII 아트뿐. **JSON/YAML 산출 지시 0건** |

즉 ①은 **이미 옳은 것을 요구하고 있으나 옳은 형식으로 내놓지 않는다.** 이 문서는 형식만 정의한다 — 의미론은 건드리지 않는다.

**INV-1 재확인**: LLM은 ①에만 둔다. 이 스키마의 소비자(②)는 LLM-free 순수 함수다. 따라서 **스키마는 LLM 없이 파싱 가능해야 한다** — 자연어 필드에 의미를 싣지 않는다.

---

## 1. `project.fingerprint` — X5 해소

### 요구 조건

| # | 조건 | 이유 |
|---|---|---|
| R1 | **결정론적** | 같은 프로젝트 → 같은 값. G4a의 전제 |
| R2 | **무관한 변화에 안정** | 파일 3개 추가로 값이 바뀌면 ④ 조회가 항상 미스 |
| R3 | **프로젝트 간 판별력** | 전부 같은 값이면 ④ 검색 키로 무용 |
| R4 | **LLM 없이 산출** | ②가 재계산해 대조할 수 있어야 함 |

단일 해시로는 R2와 R3을 동시에 만족할 수 없다. **구조화 레코드 + 파생 해시**로 정의한다.

### 정의

```json
{
  "project": {
    "fingerprint": {
      "stack":   ["nextjs", "supabase", "tailwind"],
      "scale":   { "files": "100-499", "modules": "3-9" },
      "markers": ["auth", "payment", "e2e-playwright", "ci-github"],
      "hash":    "sha256:9f2c…"
    }
  }
}
```

| 필드 | 산출 규칙 |
|---|---|
| `stack` | 매니페스트 실측으로만 판정. `package.json` deps · `pubspec.yaml` · `*.xcodeproj`/`Package.swift` · `composer.json` · `requirements.txt`/`pyproject.toml`. **사전 정의 목록에 있는 것만**, 알파벳 정렬. 미검출 시 `[]` — **추측 금지** |
| `scale` | 버킷만 기록. `files`: `1-29` / `30-99` / `100-499` / `500-1999` / `2000+`. `modules`: `1-2` / `3-9` / `10-29` / `30+`. **정확한 수를 쓰지 않는 것이 R2의 핵심** |
| `markers` | 사전 정의 마커 집합의 부분집합. 알파벳 정렬. 아래 표 참조 |
| `hash` | `sha256(canonical_json({stack, scale, markers}))`. canonical = 키 정렬 + 공백 제거 + UTF-8 |

### 마커 집합 (v1 — 고정 12종)

`auth` · `payment` · `db-sql` · `db-nosql` · `realtime` · `file-upload`
`e2e-playwright` · `e2e-other` · `ci-github` · `ci-other` · `docker` · `monorepo`

> **닫힌 집합인 이유**: 열어두면 ①이 매번 새 마커를 지어내 R1(결정론)과 R3(판별력)이 동시에 무너진다. 마커 추가는 이 문서 개정으로만 한다.

### 판별력 검증 (v1 기준 미실시)

`hash` 충돌률은 실제 프로젝트 N개를 넣어봐야 안다. **현재 표본 0건.**
→ **보장하지 않는 것**에 기재. 프로젝트 10개 축적 시점에 재검토한다.

---

## 2. IR 스키마

### 최상위

```json
{
  "graph": {
    "spec": { "version": "1.4.0", "hash": "sha256:…" },
    "name": "avalon-phase0",
    "mode": "B",
    "entry": "frontend",
    "target": { "root": "E:/…/avalon", "vcs": "none" },
    "task":   { "id": "avalon-phase0", "request": "…무엇을 할 것인가…" }
  },
  "project": { "fingerprint": { … } },
  "state":  [ … ],
  "nodes":  [ … ],
  "edges":  [ … ],
  "gates":  [ … ],
  "policy": { "defaults": { … } }
}
```

`graph.spec.hash` = `sha256(canonical_json(문서 전체에서 graph.spec.hash 자신을 제외한 것))`.
**③의 실행 기록과 ④의 아카이브를 잇는 유일한 조인 키다** (G5·G8).

### `graph.target` · `graph.task` — 어디서 / 무엇을 (v1.4 신설)

> **실사용 투입이 발견한 스펙 누락 (2026-08-13).** 실사용 그래프를 실제로 돌리려고 컴파일 산출물을
> 열어보니, 프롬프트에 **대상 저장소도 과제도 한 글자가 없었다.** IR 전체를 뒤져도
> `task`·`cwd`·`root`·`repo`·`target` 키의 출현 횟수가 **0**이었다.
>
> 그래프는 *어떻게* 를 완벽하게 기술하면서 *어디서 무엇을* 을 표현할 자리가 아예 없었다.
> 그대로 실행하면 에이전트는 프로젝트 50개의 부모 폴더에서 무슨 기능인지도 모르고 시작한다.
>
> G0(필수 필드 11종)도 G4c(정적 검사 6종)도 이걸 잡지 못했다 — **지표가 "실행 가능한가"를 재지 않았다.**
> 검사 #4가 공허했던 건(v1.2) 과 같은 계열의 결함이고, 이번이 세 번째다.

| 필드 | 필수 | 뜻 |
|---|---|---|
| `graph.target.root` | v1.4+ 필수 | 작업 대상 저장소의 절대 경로. 세션 cwd와 무관하게 못 박는다 |
| `graph.target.vcs` | 선택 | `git` \| `none`. 되돌리기 수단이 있는지 |
| `graph.target.branch` | 선택 | 작업 브랜치 |
| `graph.task.request` | v1.4+ 필수 | 이번 1회분에 실제로 무엇을 할 것인가 |
| `graph.task.id` | 선택 | 과제 식별자 |

`scope.unit`("기능 1건")은 작업 **단위**지 **요청**이 아니다. 둘은 다른 필드다.

### 스키마 버저닝 — `graph.spec.version` 이 검증 어휘를 고른다 (X4, v1.4 신설)

| | v1.1 | v1.4 |
|---|---|---|
| `kind` | work·human·join·**gate** | work·human·join |
| `runner` | agent·script·hook·manual·**workflow-script** | agent·script·hook·manual |
| `ground_truth` | measured·reported·human·assumed·**judged** | measured·reported·human·assumed |
| 필수 필드 | 11종 | **13종** (+target·task) |
| 컴파일 | **거부** (검증 전용) | 가능 |

선언 버전 **이하의 최신 스키마**를 적용한다(`1.2.0`·`1.3.0` → v1.1 어휘). 아는 것보다 낮으면 미지원으로 세운다.

**과거 그래프는 과거 규칙으로 판정한다.** 폐기한 어휘를 소급 적용하면 회귀 측정 정본 6개가 통째로 사라지고,
전부 통과시키면 폐기한 어휘가 영원히 산다.

**단 검증 통과 ≠ 실행 가능하다.** v1.1에는 `target`·`task` 를 적을 자리가 없으므로 컴파일러가 거부한다.
실행하려면 v1.4로 올리고 두 필드를 채워야 한다.

### `graph.entry` — 진입점은 추론하지 않는다 (v1.1 신설)

> **구현이 발견한 스펙 누락 (2026-08-12).** 처음엔 "inbound 엣지가 없는 노드 = 진입점"으로 추론했는데,
> 자기적용에서 **정적 검사 #3이 즉시 실패**했다. 원인: `validate → frontend`(gate:G0:fail) 재시도 루프백 때문에
> **진입 노드에도 inbound가 생긴다.** 재시도 경로를 갖는 그래프에서는 추론이 원리적으로 불가능하다.
>
> Avalon의 모든 그래프는 정의상 재시도 경로를 갖는다 → 명시 필드가 유일한 해법.

### `state` — 게이트가 참조할 수 있는 필드의 화이트리스트

```json
"state": [
  { "field": "ir_field_coverage", "type": "ratio" },
  { "field": "compile_hashes",    "type": "int"   },
  { "field": "archive_cases",     "type": "int"   }
]
```

`type`: `int` · `ratio`(0~1) · `bool` · `enum`.
**게이트는 이 목록 밖의 필드를 참조할 수 없다.** 검증기가 강제한다(정적 검사 #1).

### `nodes`

```json
{
  "id": "compile",
  "kind": "work",
  "runner": "workflow-script",
  "produces": ["build/graph.workflow.js"],
  "retry": { "max": 2, "on_exhaust": "partial" },
  "policy": {
    "allowed_tools": ["Read", "Write", "Bash"],
    "requires_approval": false,
    "reversible": true,
    "budget": { "tokens": 200000, "iterations": 5, "wall_clock_s": 900 }
  }
}
```

| 필드 | 값 |
|---|---|
| `kind` | `work` · `gate` · `human` · `join` |
| `runner` | `workflow-script` · `agent` · `hook` · `manual` |
| `retry.on_exhaust` | `partial` · `fail` · `halt` |
| `policy` | **전 노드 필수** (G6 `nodes_with_policy_block_ratio == 1.0`) |

`reversible: false`인 노드는 `requires_approval: true`여야 한다 (정적 검사 #2 / G6).

### `edges`

```json
{ "from": "research", "to": "synthesize", "when": "always" }
{ "from": "synthesize", "to": "research", "when": "gate:G2:fail" }
```

`when`: `always` · `gate:<id>:pass` · `gate:<id>:fail`.

> **fan-in 허용.** 한 노드가 여러 inbound edge를 가질 수 있다. `kind: "join"`으로 합류를 표시한다.
> v4에서 PlanCompiler의 "노드당 단일 inbound" 체크를 **삭제**한 이유가 이것이다 — 병렬 지점은 반드시 합류를 낳는다.

### `gates` — 숫자만

```json
{
  "id": "G0",
  "field": "ir_field_coverage",
  "op": ">=",
  "threshold": 1.0,
  "on_fail": { "goto": "frontend", "max_retry": 2 },
  "ground_truth": "measured"
}
```

| 필드 | 제약 |
|---|---|
| `field` | `state` 화이트리스트에 있어야 함 |
| `op` | `==` · `>=` · `<=` · `>` · `<` |
| `threshold` | **수치 리터럴만.** 문자열·표현식 금지 |
| `ground_truth` | `measured` \| `agent_report`. **`agent_report`는 G6가 0개를 요구** |

서술형 게이트를 표현할 방법이 스키마에 **없다.** 이것이 v3부터의 규율을 형식으로 강제하는 지점이다.

---

## 3. 정적 검사 6종 (G4c)

②가 컴파일 전 실행한다. 전부 LLM 없이 판정 가능하다.

| # | 검사 | 실패 조건 |
|---|---|---|
| 1 | 게이트 필드 유효성 | `gates[].field` 중 `state`에 없는 것 |
| 2 | 비가역 노드 승인 | `reversible == false` && `requires_approval == false` |
| 3 | 도달 가능성 | 진입점에서 도달 불가한 노드 존재 |
| 4 | 종료 가능성 | `retry.max` 없는 순환 경로 존재 |
| 5 | 예산 누락 | `policy.budget` 없는 노드 (G6) |
| 6 | 엣지 참조 무결성 | `from`/`to`가 존재하지 않는 노드 id |

> **v4에서 뺀 7번째** — PlanCompiler의 "노드당 단일 inbound". Avalon 그래프를 전부 거부한다.

---

## 4. 마크다운은 JSON에서 렌더링한다

G0의 4번째 조항 `markdown_rendered_from_json == 1`.

**정본은 JSON이다.** 마크다운은 산출물이다. 사람이 마크다운만 고치고 JSON을 안 고치면 ②가 승인되지 않은 그래프를 컴파일한다 — v4가 새로 만든 실패 모드이고, 정본을 한쪽으로 정하는 것 외에 막을 방법이 없다.

```
graph.json  ──renderer──▶  graph.md   (사람이 읽고 승인)
     │
     └──② compile──▶  workflow script · hooks
```

렌더러는 ②와 별개의 순수 함수다. 마크다운에 JSON에 없는 정보를 추가하지 않는다.

---

## 5. 실례 — Avalon 자신의 Phase 0 그래프

스키마를 Avalon v4 그래프 자체로 검증한다. **자기적용이 첫 테스트다.**

```json
{
  "graph": { "spec": { "version": "1.0.0", "hash": "sha256:PENDING" },
             "name": "avalon-phase0", "mode": "B" },
  "project": {
    "fingerprint": {
      "stack": [],
      "scale": { "files": "1-29", "modules": "1-2" },
      "markers": [],
      "hash": "sha256:PENDING"
    }
  },
  "state": [
    { "field": "ir_field_coverage",   "type": "ratio" },
    { "field": "ir_schema_valid",     "type": "bool"  },
    { "field": "markdown_synced",     "type": "bool"  },
    { "field": "compile_hashes",      "type": "int"   },
    { "field": "static_checks_passed","type": "int"   },
    { "field": "archive_cases",       "type": "int"   }
  ],
  "nodes": [
    { "id": "frontend", "kind": "work", "runner": "agent",
      "produces": ["graph.json"],
      "retry": { "max": 2, "on_exhaust": "fail" },
      "policy": { "allowed_tools": ["Read","Glob","Grep","Write"],
                  "requires_approval": false, "reversible": true,
                  "budget": { "tokens": 300000, "iterations": 5, "wall_clock_s": 1800 } } },

    { "id": "validate", "kind": "gate", "runner": "hook",
      "produces": ["validation-report.json"],
      "retry": { "max": 0, "on_exhaust": "fail" },
      "policy": { "allowed_tools": ["Read"],
                  "requires_approval": false, "reversible": true,
                  "budget": { "tokens": 20000, "iterations": 1, "wall_clock_s": 60 } } },

    { "id": "backend", "kind": "work", "runner": "workflow-script",
      "produces": ["build/graph.workflow.js", "build/hooks.json"],
      "retry": { "max": 3, "on_exhaust": "fail" },
      "policy": { "allowed_tools": ["Read","Write"],
                  "requires_approval": false, "reversible": true,
                  "budget": { "tokens": 100000, "iterations": 3, "wall_clock_s": 600 } } },

    { "id": "install_hooks", "kind": "work", "runner": "hook",
      "produces": ["settings.json"],
      "retry": { "max": 0, "on_exhaust": "halt" },
      "policy": { "allowed_tools": ["Read","Edit"],
                  "requires_approval": true, "reversible": false,
                  "budget": { "tokens": 20000, "iterations": 1, "wall_clock_s": 120 } } },

    { "id": "human_go", "kind": "human", "runner": "manual",
      "produces": ["decision.json"],
      "retry": { "max": 0, "on_exhaust": "halt" },
      "policy": { "allowed_tools": [],
                  "requires_approval": true, "reversible": true,
                  "budget": { "tokens": 0, "iterations": 1, "wall_clock_s": 0 } } }
  ],
  "edges": [
    { "from": "frontend",  "to": "validate",      "when": "always" },
    { "from": "validate",  "to": "frontend",      "when": "gate:G0:fail" },
    { "from": "validate",  "to": "backend",       "when": "gate:G0:pass" },
    { "from": "backend",   "to": "human_go",      "when": "gate:G4c:pass" },
    { "from": "backend",   "to": "backend",       "when": "gate:G4c:fail" },
    { "from": "human_go",  "to": "install_hooks", "when": "always" }
  ],
  "gates": [
    { "id": "G0",  "field": "ir_field_coverage",    "op": ">=", "threshold": 1.0,
      "on_fail": { "goto": "frontend", "max_retry": 2 }, "ground_truth": "measured" },
    { "id": "G0b", "field": "markdown_synced",      "op": "==", "threshold": 1,
      "on_fail": { "goto": "frontend", "max_retry": 1 }, "ground_truth": "measured" },
    { "id": "G4a", "field": "compile_hashes",       "op": "==", "threshold": 1,
      "on_fail": { "goto": "backend",  "max_retry": 2 }, "ground_truth": "measured" },
    { "id": "G4c", "field": "static_checks_passed", "op": "==", "threshold": 6,
      "on_fail": { "goto": "backend",  "max_retry": 3 }, "ground_truth": "measured" },
    { "id": "G8",  "field": "archive_cases",        "op": ">=", "threshold": 10,
      "on_fail": { "goto": "human_go", "max_retry": 0 }, "ground_truth": "measured" }
  ],
  "policy": {
    "defaults": { "requires_approval": false, "reversible": true,
                  "budget": { "tokens": 100000, "iterations": 3, "wall_clock_s": 600 } }
  }
}
```

### 자기적용에서 드러난 것

| 발견 | 의미 |
|---|---|
| `install_hooks`가 유일한 `reversible: false` | 전역 `settings.json`을 건드리는 노드. **X3(훅 격리 모델 미조사)가 여기서 실체화된다** — 이 노드는 X3 해소 전까지 실행하면 안 된다 |
| Avalon 자신의 `fingerprint`가 `stack: []`, `markers: []` | 문서뿐인 프로젝트라 판별 정보가 없다. **④ 조회 키로서 무의미** — 판별력 검증(§1)이 왜 필요한지 즉시 드러남 |
| `human_go`의 budget이 전부 0 | 사람 노드에 토큰 예산 개념이 없다. 스키마가 `kind: human`을 특수 처리해야 하는지 **미해결** |
| G8이 `on_fail.goto: human_go` | ④ 비활성이 실패가 아니라 정상 경로임을 엣지로 표현했다. 스키마가 이걸 자연스럽게 담는지 확인됨 |

---

## 6. G0 판정 방법

```
ir_machine_readable_block_count  = graph.json 존재 여부                        → 1
ir_schema_validation_pass_rate   = 스키마 검증 통과 / 전체                      → 1.0
ir_field_coverage                = 채워진 필수 필드 / 필수 필드 총수            → 1.0
markdown_synced                  = sha256(render(graph.json)) == sha256(graph.md) → 1
```

필수 필드 총수는 **버전이 정한다**(§2 스키마 버저닝).

- **v1.1 — 11종**: `graph.entry` · 노드 id · 엣지 · `gate{field,op,threshold}` · state 필드 목록 · `retry.max` · `human_gate` · `policy` · `graph.spec.hash` · `graph.spec.version` · `project.fingerprint`
- **v1.4 — 13종**: 위 11종 + `graph.target.root` + `graph.task.request`

### 컴파일은 G0를 본다 (v1.4 신설)

v3까지 `compile.mjs` 는 `validate.mjs` 를 **아예 호출하지 않았다.** 그래서 스키마 위반 그래프가
그대로 실행 코드가 됐고, 실사용 그래프 6개가 전부 `exit=0` 으로 컴파일됐다.
그 위에서 나온 「gate_loss 0 · 6/6」이 건강 신호로 읽혔지만, 실제로는 `gate_loss` 하나만 잰 숫자였다.

지금은 컴파일 전에 순서대로 거부한다: **① 미지원/실행불가 스키마 버전 → ② G0 미달 → ③ 미지원 호스트 → ④ OR 함정·팬아웃 형태 → ⑤ 승인 필요한 팬아웃 갈래**.

### `policy.requires_approval` 은 산출 코드가 강제한다 (v1.4 신설)

v3까지 `requires_approval` 은 **산출 코드에 한 줄도 나가지 않았다.** 정적 검사 #2는
"비가역 노드가 `requires_approval` 을 선언했는가"를 확인하고 통과시켰는데, 컴파일러가 그 선언을 버렸다.

jarvis-agent 의 `push` 노드는 근거에 *"되돌리기 어려운 유일한 노드라 사람 승인을 붙인다"* 고 적어놓고,
컴파일 결과는 정지 없이 `git push origin` 을 실행하는 코드였다.
**선언은 검증되고 폐기됐다** — `project.fingerprint` 를 측정만 하고 안 실은 것과 같은 계열이고, 이번이 네 번째다.

지금은 `requires_approval` 노드마다 실행 **앞에** 승인 게이트를 방출한다:

```js
if (!APPROVED.has("push")) {
  log("◆ APPROVAL GATE [push] — …")
  log("⚠ 비가역 노드다. 승인 전에는 실행하지 않는다.")
  return { stopped_at: "push", reason: 'approval_required', irreversible: true, … }
}
```

`APPROVED` 는 `args.approved` 로만 채워진다. 기본값을 "전부 승인"으로 두면 게이트가 공허해지므로
빈 집합에서 시작하고, 회귀 테스트가 이를 고정한다.

**팬아웃 갈래는 `parallel()` 안에서 돌아 실행 전에 멈출 자리가 없다** → 갈래가 승인을 요구하면 컴파일을 거부한다.

> **현재 상태 (2026-08-13 실측)** — avalon 자기 그래프 (v1.4.0)
> `ir_field_coverage = 13/13 = 1.00` → **G0 PASS** / `static_checks_passed = 6/6` → **G4c PASS**
> `markdown_synced = 1` → **G0b PASS** / `gate_loss = 0` → **G4c-loss PASS**
>
> ```
> graph.spec.hash      sha256:898013d00769969c6207fb2b8e84c4bcd805a1ffd49e6d8c0eef9a7b25edf156
> project.fingerprint  sha256:a5d0a5c15c815ab6f0ab6ee6dbee3143e85d08b23c16b114b545e3bcbc719f1d
> ```
>
> **실사용 그래프 6개 (v1.1.0)** — G4c 6/6 PASS · G0 **3/6** PASS · 컴파일 6/6 거부(검증 전용).
> G0 실패 3건은 어휘 드리프트가 아니라 **진짜 단위 버그**다:
> `match_rate` 를 `type:ratio`(0~1)로 선언해놓고 임계값을 `>= 90`(퍼센트)으로 썼다 —
> 실측값 0.95는 영원히 게이트를 못 넘고 `max_retry` 소진까지 루프를 돈다.
> (balju-erp G9 · hanyang-survey G5 · notion-obsidian-sync G3)

---

## 7. 다음 작업

| # | 작업 | 산출물 | 선행 |
|---|---|---|---|
| 1 | canonical_json + sha256 산출기 | `hash.mjs` | — |
| 2 | 스키마 검증기 (정적 검사 6종) | `validate.mjs` | 1 |
| 3 | 렌더러 (JSON → 마크다운) | `render.mjs` | 1 |
| 4 | `graph-architect` SKILL.md 수정 — JSON 산출 지시 추가 | SKILL.md 개정 | 2, 3 |
| 5 | G0 재판정 | | 1~4 |

**4번이 실질적 전환점이다.** 1~3은 도구이고, 4가 ①의 행동을 실제로 바꾼다.

---

## 보장 범위

| | |
|---|---|
| **보장하는 것** | X5 해소 — `project.fingerprint`가 산출 규칙까지 정의됨 · IR 스키마가 서술형 게이트를 **표현 불가능**하게 만듦 · 정적 검사 6종이 전부 LLM 없이 판정 가능 · 자기적용으로 스키마를 실제 그래프에 대봄 |
| **보장하지 않는 것** | ① **구현 0줄** — 검증기·렌더러·해시 산출기 전부 미작성. 이 문서는 설계이지 작동하는 물건이 아니다 ② `fingerprint.hash`의 **판별력 미검증** (표본 0건) ③ 스키마가 `kind: human` 노드의 예산 개념을 제대로 다루는지 미해결 ④ 마커 집합 12종이 충분한지 미검증 ⑤ **X3(훅 격리) 미해소** — `install_hooks` 노드는 실행 금지 ⑥ IR 스키마 **버저닝·마이그레이션 규칙 없음**(X4) — 스키마 변경 시 축적된 아카이브 조인이 깨진다 |

---

## 8. 선언-실재 대조 — D7 (2026-08-25 신설)

> **다섯 번째 사례.** `host.enforced_by_hook: ["G0","G0b","G4c"]` 와
> `host.state_file`, `backend.produces: [..., "build/hooks.json"]` 이 IR에 선언되고
> G0·G4c·gate_loss 전부 초록을 받았는데, **훅 파일은 존재한 적이 없고 상태 파일을 쓰는
> 코드도 0줄이었다.** 아무 게이트도 그 선언을 쳐다보지 않았다.
> `fingerprint`(측정 후 미탑재)·검사#4(공허)·`target/task`(표현 불가)·`requires_approval`
> (검증 후 폐기)에 이은 같은 계열이고, 발견 경로도 같다 — 설계 리뷰가 아니라 실측 대조.
> (unlazy 비교 분석 중 "선언한 것이 실재하는가"를 손으로 대조하다 걸렸다. 이제 기계가 한다.)

### 바뀐 것

| | 이전 | 이후 |
|---|---|---|
| `enforced_by_hook` | 게이트 id 문자열 배열 — 강제할 기계 없음 | `{ "gate": "<id>", "check": "<명령>" }` — 선언이 오라클을 동반 |
| 훅 산출 | 없음 (선언만) | `compileHooks()` → `build/hooks.json` (결정적, spec_hash 조인 키 포함) |
| 대조 | 없음 | `hook_loss` — 강제 선언 중 훅 명세에 실리지 못한 것. **0이어야 하며 CLI exit 로 강제** |
| 유령 게이트 강제 선언 | 조용히 통과 | 스키마 위반 → G0 FAIL |
| `state_file` | 선언만, 소비 0줄 | 산출 코드의 모든 반환 경로에 `state_file` 탑재 (운영자 기록 계약) |

### ABANDON 등가물 (unlazy 에서 수입)

`on_exhaust` 소진은 이제 증거를 남긴다:

- `partial`: 전진하되 `ABANDONED[]` 에 `{gate, node, field, op, threshold, measured, attempts}` 를 push.
  최종 반환의 `completed` 는 **`ABANDONED` 가 비어 있을 때만 true** — 포기가 완주를 성공으로 둔갑시키지 못한다.
- `fail`/`halt`: `completed: false` + 같은 증거 스키마의 `abandoned[]` 를 싣고 멈춘다.

### check 명령의 계약

각 check 는 **게이트 미달 시 exit≠0** 이어야 한다. 음성 대조 실측 (2026-08-25):
graph.md 1바이트 오염 → `render --check` exit=1 · 유령 게이트 → `validate` exit=1. 통과 후 복구 확인.

### 보장하지 않는 것

- `hooks.json` 은 **명세다** — 설치되기 전까지 아무것도 차단하지 않는다. 설치는 `install_hooks`(승인 필요, X3 미해소).
- `hook_loss` 는 check **존재**를 대조할 뿐, check 가 게이트 의미와 일치하는지는 증명하지 못한다
  (오라클 간극은 이동하는 것이지 소멸하지 않는다 — unlazy 의 린터가 경고하던 바로 그 지점).
- 에이전트 노드의 `produces`(예: `validation-report.json`)는 런타임 산출물이라 컴파일 시점 대조 불가 — 미해소.
