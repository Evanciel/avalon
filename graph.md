# avalon-phase0

> Generated from `graph.json`. **Do not edit directly** — the JSON is canonical.

| | |
|---|---|
| spec.version | `1.4.0` |
| spec.hash | `sha256:5943d2f3ca027a34ea768e2aee57ac750885df77b53dbc70b9ec07cac1c1ac16` |
| mode | `B` |

## project.fingerprint

| field | value |
|---|---|
| stack | — |
| scale | files `1-29` / modules `1-2` |
| markers | — |
| hash | `sha256:a5d0a5c15c815ab6f0ab6ee6dbee3143e85d08b23c16b114b545e3bcbc719f1d` |

## state

| field | type |
|---|---|
| `ir_field_coverage` | ratio |
| `ir_schema_valid` | bool |
| `markdown_synced` | bool |
| `compile_hashes` | int |
| `static_checks_passed` | int |
| `archive_cases` | int |

## nodes

| id | kind | runner | retry.max | on_exhaust | approval | reversible | budget(tok/iter/s) |
|---|---|---|---|---|---|---|---|
| `frontend` | work | agent | 2 | fail | — | reversible | 300000 / 5 / 1800 |
| `validate` | work | hook | 0 | fail | — | reversible | 20000 / 1 / 60 |
| `render_check` | work | script | 0 | fail | — | reversible | 20000 / 1 / 60 |
| `backend` | work | script | 3 | fail | — | reversible | 100000 / 3 / 600 |
| `compile_check` | work | script | 0 | fail | — | reversible | 20000 / 3 / 180 |
| `human_go` | human | manual | 0 | halt | **required** | reversible | 0 / 1 / 0 |
| `install_hooks` | work | hook | 0 | halt | **required** | **irreversible** | 20000 / 1 / 120 |

### allowed_tools

- `frontend` — `Read` `Glob` `Grep` `Write`
- `validate` — `Read`
- `render_check` — `Read` `Write`
- `backend` — `Read` `Write`
- `compile_check` — `Read`
- `install_hooks` — `Read` `Edit`

### produces

- `frontend` → `graph.json`
- `validate` → `validation-report.json`
- `render_check` → `graph.md`
- `backend` → `build/graph.workflow.js` `build/hooks.json`
- `compile_check` → `compile-report.json`
- `human_go` → `decision.json`
- `install_hooks` → `settings.json`

## edges

| from | to | when |
|---|---|---|
| `frontend` | `validate` | `always` |
| `validate` | `frontend` | `gate:G0:fail` |
| `validate` | `render_check` | `gate:G0:pass` |
| `render_check` | `frontend` | `gate:G0b:fail` |
| `render_check` | `backend` | `gate:G0b:pass` |
| `backend` | `backend` | `gate:G4c:fail` |
| `backend` | `compile_check` | `gate:G4c:pass` |
| `compile_check` | `backend` | `gate:G4a:fail` |
| `compile_check` | `human_go` | `gate:G4a:pass` |
| `human_go` | `install_hooks` | `always` |

## gates

| id | condition | on fail | max retry | evidence | threshold source |
|---|---|---|---|---|---|
| **G0** | `ir_field_coverage >= 1` | `frontend` | 2 | measured | validate.mjs 필수 11필드 전수 — 부분 충족은 의미 없으므로 1.00 |
| **G0b** | `markdown_synced == 1` | `frontend` | 1 | measured | sha256(render(json)) == sha256(md) — 이진 판정이라 1 외 값이 없음 |
| **G4a** | `compile_hashes == 1` | `backend` | 2 | measured | 동일 IR 3회 컴파일의 distinct 해시 수. 결정론이면 정의상 1 |
| **G4c** | `static_checks_passed == 6` | `backend` | 3 | measured | validate.mjs 정적 검사 6종 전수. PlanCompiler 7종에서 단일-inbound 제외 |

## Scope — one run of what

This graph covers one run of **조사 1라운드 (Mode B)**.

Not covered:

- ② BACKEND 구현 사이클
- 기존 미결 PDCA 청산
- 운영 배치

## Host

| | |
|---|---|
| pipeline | `workflow-script` |
| reason | 병렬 fan-out은 없으나 게이트를 훅으로 기계 강제해야 하고 bkit sprint는 Object.freeze로 동결됨 |
| state file | `.avalon/run.state.json` |
| enforced by hook | `G0` ← `node tools/validate.mjs graph.json` · `G0b` ← `node tools/render.mjs graph.json graph.md --check` · `G4c` ← `node tools/validate.mjs graph.json` |

## Join points (fan-in)

- `frontend` ← inbound 2
- `backend` ← inbound 3

## Node rationale

| node | rationale |
|---|---|
| `frontend` | ① FRONTEND. 프로젝트를 실측해 IR을 쓴다. 유일하게 LLM이 도는 단 (INV-1) |
| `validate` | G0·G4c 숫자를 산출한다. 게이트가 아니라 게이트의 입력을 만드는 work 노드다 |
| `render_check` | G0b(markdown_synced)를 산출한다. validate와 합치면 게이트 2개가 한 노드에 붙어 OR가 된다 |
| `backend` | ② BACKEND. IR → 실행 스크립트·훅. LLM-free 순수 함수여야 한다 (INV-1) |
| `compile_check` | G4a(컴파일 결정론)를 산출한다. backend의 G4c와 분리 — 실패 원인이 다르다 |
| `human_go` | 최종 인수. 전역 settings.json을 건드리기 직전이라 사람이 출구를 받아야 한다 |
| `install_hooks` | 유일한 비가역 노드. 프로젝트 .claude/settings.json 수정 — human_go 승인 뒤 install-hooks.mjs --yes 로만 실행 |

## Verdict

| axis | value |
|---|---|
| 유형 | 신규제품 0→1 (좁은 도구) |
| 규모 | 도구 3개 완료 / ②③④ 미착수 |
| 리스크 | 낮음 (개인용, 외부 노출·결제·인증 없음) |
| 검증가능성 | 자동 가능 — 명세→스크립트 번역은 재현성 테스트 대상 |
| 기존자산 | ① graph-architect 확보 / ② 없음 / ③ CC Workflow 후보 / ④ 비활성 |

## Not attached

| node | exclusion reason |
|---|---|
| `gap-detector` | 비교할 설계 문서가 아직 없다 |
| `security-architect` | 외부 노출·인증·결제 없음 |
| `webapp-testing` | 웹 UI 없음 |
| `sprint-qa-flow` | 분해하지 않으므로 통합 검증 대상 없음 |
| `autopilot` | eval·롤백 없음 → 판단이 갈리는 작업에 부적합 |

## Guarantees

| | content |
|---|---|
| provides | G0 통과 시 IR이 기계 판독 가능하고 필수 13필드가 전부 채워짐 · G4c 통과 시 서술형 게이트·상태 밖 참조·비가역 무단실행·도달불가·무한루프·엣지 깨짐 6종이 없음 · G0b 통과 시 graph.md가 graph.json에서 렌더된 것이며 손으로 고쳐지지 않음 · hook_loss 0 시 훅 강제를 선언한 게이트({gate,check})가 전부 build/hooks.json 에 실림 · 산출 코드의 completed 는 abandoned 가 비어 있을 때만 true — partial 소진이 성공으로 둔갑하지 않음 |
| **does not** | 훅 설치는 install-hooks.mjs 가 프로젝트 .claude/settings.json 에만, --yes 승인 하에 수행 — 전역 설치·자동 설치·낡은 명세는 도구가 거부한다. 설치 전까지 명세는 아무것도 차단하지 않는다 · X3(훅 격리)는 설치자 경계로 해소 — 프로젝트 범위 한정·승인 필수·타 훅 보존·STALE 차단, install.selftest.mjs 24건이 고정 (승인-실행 TOCTOU 박제 · 반증 프로브 · --status · i18n 포함) · project.fingerprint의 판별력 미검증 — 표본 0건, 프로젝트 10개 축적 시 재검토 · G8 임계값 10은 assumed — 이 저장소에서 측정된 적 없음 · G8(archive_cases)은 이 그래프에서 제거했다 — ④ ARCHIVE 노드가 없어 산출 노드도 분기도 없는 죽은 게이트였다. v4 명세에는 남아 있다 · 실행 기록(.avalon/runs)은 운영자 기록 방식 — workflow-script 는 파일을 쓸 수 없어 반환값에 state_file 경로만 싣는다 |

