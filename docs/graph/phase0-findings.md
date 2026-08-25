# Avalon Phase 0 — 조사 결과 (①②③)

> 실행: 2026-08-12 / 그래프 명세 v3 기준
> ④ FEASIBILITY 미실행 (Workflow opt-in 또는 세션 재시작 필요)

---

## ① MARKET — G1 통과 ✅

`competitors >= 5` **AND** `market_src >= competitors` → **충족**

### 경쟁 지형 3계층

**A. 오케스트레이션 프레임워크 (런타임)**

| 제품 | 특징 |
|---|---|
| **LangGraph** | Python-native, GitHub 126,000★, 오픈소스 지배적 |
| **Temporal** | 내구 실행(durable execution), 이벤트 소싱, 다일 워크플로 |
| **Mastra** | TypeScript-native, 22,000★, 주 30만 npm 다운로드 |
| **Microsoft Agent Framework 1.0** | .NET/Python, **2026-04 GA**, Azure 통합 |
| **OpenAI Agents SDK** | handoff 기반 단순 토폴로지 |

**B. 비주얼 빌더 (사람이 그림)**

Langflow · Flowise · n8n · Dify · Sim Studio
- Langflow는 캔버스를 **실행 가능한 LangChain 체인으로 컴파일**한다
- 다만 *"프로덕션급 프레임워크 코드로의 진짜 번역은 제한적"* — 결국 코드 프레임워크로 이주 필요

**C. DSL / 컴파일러 (Avalon ②와 직접 경쟁)** ★

| 시스템 | 시점 | 내용 |
|---|---|---|
| **eBay DSL** | 2025-12 | 워크플로 명세를 구현과 분리, **다중 백엔드 언어**(Java/Python/Go), 개발시간 60% 감소 |
| **PayPal 선언적 시스템** | — | 같은 파이프라인 정의를 여러 백엔드·배포환경에서 실행 |
| **Agentics 2.0 (IBM)** | 2026-03 | logical transduction algebra, 타입 있는 의미 변환 |
| **Compiled AI** | 2026-04 | **비결정성을 컴파일 타임 LLM 호출로 해결** — LLM을 명세 시점에 한 번 돌려 결정론적 실행 아티팩트 생성 |
| **Microsoft Foundry Agent Service** | 2026 | workflow agents = 선언적 정의로 다중 에이전트 조율 |

### ★ 가장 중요한 발견

**`Compiled AI`(2026-04)가 Avalon ②의 핵심 문제(G4 결정론)를 이미 겨냥했다.**
접근법: LLM을 실행 시점이 아니라 **명세 시점에 한 번만** 돌려서 결정론적 산출물을 만든다.

→ Avalon ② BACKEND는 **새로운 아이디어가 아니다.** 선행 사례가 있고, 참고할 수 있다.

### 차별점 후보 — 조사로 확인된 것

경쟁 제품 전부가 **그래프를 사람이 만든다**:
- 비주얼 빌더 → 캔버스에서 드래그
- DSL/컴파일러 → 사람이 명세를 작성

**프로젝트를 분석해서 그래프를 자동 설계(① FRONTEND)하는 제품은 조사 범위에서 발견되지 않았다.**
이것이 현재까지 확인된 유일한 차별점 후보다. (⚠️ 5개 표본 기준 — 시장 전체를 본 것이 아님)

---

## ② ARCH — G2 **미통과** ❌

`stage_verdicts >= 4` 는 충족했으나 **빠진 단 2개 발견** → 4단 구조 수정 필요

### 업계 표준 분해 (2026 프로덕션 기준)

| # | 단계 | Avalon 대응 |
|---|---|---|
| 1 | **Design/Authoring** — 그래프 토폴로지, 타입 있는 상태 계약, 조율 규칙 | ✅ ① FRONTEND |
| 2 | **Compilation** — 워크플로 정의 → 실행 그래프 번역 | ✅ ② BACKEND |
| 3 | **Execution/Runtime** — 체크포인트, 상태 전이, 내구 재생 | ✅ ③ DRIVER |
| 4 | **Observability** — 추적, 상태 diff, 감사 로그 | ❌ **없음** |
| 5 | **Governance** — 인터럽트 게이트, 정책 강제, 사람 감독 | ◐ 그래프 명세 안에 흩어져 있음 |

Avalon의 ④ PGO(최적화)는 표준 분해에 **없다.** 상위 개념이거나 Observability의 파생이다.

### ★ 업계가 명시적으로 경고하는 것

> **"1일차부터 계측하라. 프로덕션 에이전트 그래프에 관측성을 나중에 끼워 넣는 것은 비싸다."**

Observability는 **가장 흔히 놓치는 단**으로 지목된다. Avalon도 정확히 놓쳤다.

### 오늘 아침 감사와 일치

2026-08-12 스킬 감사에서 **GOVERNANCE가 7축 중 가장 약함**으로 판정됐다.
독립적인 두 경로에서 같은 결론이 나왔다.

### 판정

| Avalon 단 | 판정 |
|---|---|
| ① FRONTEND | **유지** |
| ② BACKEND | **유지** |
| ③ DRIVER | **유지** |
| ④ PGO | **격하** — Observability의 파생. 독립 단이 아닐 수 있음 |
| **⑤ OBSERVABILITY** | **신설 필요** ★ |
| **⑥ GOVERNANCE** | **신설 필요** — 명세 안에 흩어진 것을 단으로 승격 |

---

## ③ GAP — G3 통과 ✅ (결과는 예상과 다름)

`compile_assets_checked >= 1` **AND** `learn_assets_checked >= 1` → 충족

### 핵심 발견 — "없음"이 아니라 **"있는데 대상이 다름"**

| 단 | 대응 자산 | 판정 |
|---|---|---|
| ① FRONTEND | `graph-architect` | ✅ **확보** (2026-08-12 제작) |
| ② BACKEND | 없음 | ❌ **진짜 갭** |
| ③ DRIVER | bkit `sprint-orchestrator` | ◐ **있으나 고정 파이프라인 전용** |
| ④ PGO | `/meta-autopilot` | ◐ **있으나 미사용 + 대상이 다름** |
| ⑤ OBSERVABILITY | 데이터 소스 4종 | ◐ **수집은 되나 그래프 실행 추적은 없음** |

### ③ DRIVER — bkit `sprint-orchestrator`

```
PRD/Plan → Design → Do → Iterate → QA → Report → Archive
  (sequential specialist dispatch, advancePhase ×6, Phase Exit Self-Assessment)
```

**드라이버가 이미 있다.** 차이는 하나뿐:
- bkit = **고정 파이프라인**(sprint 8-phase)을 구동
- Avalon = **프로젝트마다 다른 그래프**를 구동

→ 신규 제작이 아니라 **일반화**의 문제다.

### ④ PGO — `/meta-autopilot`

"자기반성 엔진". 실행 결과 분석 → 학습 → **되먹임 메커니즘까지 이미 있다**:

| 레벨 | 동작 |
|---|---|
| safe | memory 업데이트 → **자동 적용** |
| medium | **스킬 텍스트 수정 제안** → 사용자 확인 |
| danger | 아키텍처 변경 → 수동만 |

분석 항목에 **"Gate 실패 패턴"**까지 있다.

**그러나**: `evolve_learning_*.md` 실물이 디스크에 **존재하지 않는다** → 한 번도 실행된 적 없는 것으로 보임.
그리고 대상이 autopilot/evolve 실행 결과이지 **그래프 설계 규칙**이 아니다.

### ⑤ OBSERVABILITY — 부품 현황

| 소스 | 내용 | 상태 |
|---|---|---|
| `~/.gstack/analytics/skill-usage.jsonl` | 스킬 실행 기록 | ✅ 5개월치 |
| `/usage` | 스킬·에이전트·플러그인·MCP별 사용량 | ✅ 네이티브 |
| `.bkit/state/pdca-status.json` | phase, matchRate, trustScore | ✅ |
| `.bkit/runtime/agent-events.jsonl` | 에이전트 이벤트 | ✅ |
| **그래프 실행 추적** (노드별 소요·게이트 판정·재시도) | | ❌ **없음** |

---

## 종합 — Avalon의 실체가 좁아졌다

### 진짜 신규는 하나뿐

| 단 | 결론 |
|---|---|
| ① FRONTEND | **완료** |
| ② BACKEND | **진짜 신규.** 단 `Compiled AI` 등 선행 사례 참고 가능 |
| ③ DRIVER | **일반화** — `sprint-orchestrator`를 고정 파이프라인 → 임의 그래프로 |
| ④ PGO | **연결** — `meta-autopilot`의 되먹임 대상을 그래프 설계 규칙으로 확장 |
| ⑤ OBSERVABILITY | **신설** — 부품은 있고 그래프 실행 추적만 없음. **1일차부터 넣어야 함** |
| ⑥ GOVERNANCE | **승격** — 명세 안에 흩어진 것을 단으로 |

> **"AI OS를 만든다" → "그래프 컴파일러를 만든다" → 실제로는 "번역기 1개 신규 + 기존 3개 일반화 + 계측 1개 신설"**

### 차별점 (조사 확인)

**자동 설계.** 경쟁 제품은 전부 사람이 그래프를 만든다. Avalon ①은 프로젝트를 분석해서 자동으로 만든다.
⚠️ 단, 5개 표본 기준이며 시장 전체를 본 것이 아니다.

---

## 게이트 판정

| 게이트 | 결과 |
|---|---|
| G1 MARKET | ✅ **통과** — 경쟁 5개 이상 + 출처 확보 |
| G2 ARCH | ❌ **미통과** — 빠진 단 2개(Observability, Governance) 발견. **구조 수정 필요** |
| G3 GAP | ✅ **통과** — ②③④⑤ 대응 자산 조사 완료 |
| G4 FEASIBILITY | ⏸ **미실행** — Workflow opt-in 또는 세션 재시작 필요 |
| G5 종합 진입 | ❌ **불가** — G2·G4 미충족 |

**G2 미통과는 재시도(최대 2회) 대상이 아니다.** 조사가 부실해서가 아니라 **구조가 틀렸음을 발견**했기 때문이다.
→ 그래프 명세를 v4로 갱신한 뒤 G2를 재판정한다.

---

## 보장 범위

| | |
|---|---|
| **보장하는 것** | 경쟁 제품 5개 이상 조사 · 업계 표준 분해와 대조 완료 · ②③④⑤ 대응 자산 로컬 실측 완료 |
| **보장하지 않는 것** | ① 조사 5개 외 시장 전체 · ② 표준 5단 분해가 유일한 정답이라는 보장 (출처 1건 기준) · ③ **실제 사용 시 유용성** — 조사로는 알 수 없음 · ④ 번역 결정론 — **G4 미실행** |

## 출처

- [Graph-Based Agent Workflow Orchestration in Production: The 2026 Landscape (Zylos)](https://zylos.ai/research/2026-04-14-graph-based-agent-workflow-orchestration-production/)
- [Flowise vs Langflow vs n8n vs Sim Studio (MAG)](https://madappgang.com/blog/open-source-visual-agent-builders-compared-flowise-vs-langflow-vs-n8n-vs-sim-studio-in-2026/)
- [A Declarative Language for Building And Orchestrating LLM-Powered Agent Workflows (arXiv)](https://arxiv.org/pdf/2512.19769)
- [SPL: Orchestrating Workflows with Declarative Deterministic-Probabilistic Composition (arXiv)](https://arxiv.org/pdf/2607.07727)
- 로컬 실측: bkit 2.1.35 · `~/.claude/skills` · `~/.claude/commands` · `~/.gstack/analytics`
