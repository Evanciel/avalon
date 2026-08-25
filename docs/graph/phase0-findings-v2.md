# Avalon Phase 0 — 딥리서치 결과 (v2)

> 실행: 2026-08-12 / 12 에이전트 · 1.40M 토큰 · 352 도구 호출 · 52분 · 오류 0
> 구성: 조사 7갈래(병렬) → 적대적 반증 3건(병렬) → 종합 1 → 완결성 비평 1
> 대상: `phase0-findings.md`(1차 조사)의 잠정 결론 검증
> ⚠️ **1차 조사는 삭제하지 않는다.** 이 문서는 정정본이며 1차 조사 원본은 이력으로 보존한다.

---

## 0. 결론 요약

| 1차 조사 잠정 결론 | 검증 결과 |
|---|---|
| 업계 표준 5단 → **4단을 6단으로 확장** | ❌ **기각.** 5단 표준은 출처 1건이 아니라 **출처 0건** |
| ④ PGO는 Observability 파생 → **격하** | ◐ **부분반증.** 인과 귀속이 틀림. 선행조건은 Evaluation |
| 차별점은 **「자동 설계」** 하나 | ❌ **완전반증.** 반례 24건 이상 |
| ② BACKEND는 **진짜 갭** | ❌ **오판.** 붐비는 전장. 진짜 갭은 IR 직렬화 형식 |
| ③ DRIVER = bkit `sprint-orchestrator` **일반화** | ❌ **기각.** `Object.freeze` + 완주 이력 0건 |

**최종: 4단 유지 (신설 0 · 삭제 0 · 개칭 1).**

---

## 1. "업계 표준 5단"은 존재하지 않았다 — 가장 중요한 정정

1차 조사가 G2 미통과 판정의 근거로 삼은 5단 분해:
`Design/Authoring · Compilation · Execution/Runtime · Observability · Governance`

**인용 출처 3편을 직접 열람한 결과 어느 글도 5단을 열거하지 않는다.**

- '다섯'으로 보인 것은 시스템 계층이 아니라 **거버넌스 툴링 제품 카테고리 5종**
  (observability / security / policy enforcement / compliance reporting / audit)
- **세 글 모두 무기명**
- 표준화 기구 어디에도 없음 — NIST CAISI는 3 pillar, Linux Foundation은 MCP/A2A 프로토콜, CNCF는 SPIFFE, OASIS/IEEE 미발견

**같은 축(생애주기)의 벤더 정의는 오히려 4단계다:**

| 출처 | 분해 |
|---|---|
| LangChain | Build → Test → Deploy → Monitor (거버넌스는 *"sits **around** the entire lifecycle"*) |
| Google | build / scale / govern / optimize |

게다가 5단 가설에는 벤더 생애주기에 반드시 들어가는 **Test와 Deploy가 빠져 있고**, 대신 벤더 확인 1.5/10짜리 Compilation이 들어가 있다.

> **5단은 관찰된 표준이 아니라 합성물이었다.**

### Observability·Governance의 실제 위상

복수 출처가 일관되게 **단이 아니라 rail 또는 병합된 단일 층**으로 그린다:

| 출처 | 표현 |
|---|---|
| codingwithroby | Rail A / Rail B — *"cut across all of them"* |
| aimultiple | **Layer 7 하나로 병합** |
| ADK 서드파티 투어 | *"Observability and governance"* 한 덩어리 |
| MS CAF | 개발층 **위를** 함께 덮는 스택 |

→ 한쪽만 단으로 올릴 근거가 없다. **5단(Observability만 승격) 절충안도 증거와 배치된다.**

---

## 2. 차별점 「자동 설계」 — 완전반증

부정 명제(*"~하는 제품은 없다"*)는 반례 하나로 무너진다. 반례 **24건 이상** 확인.

### 상용 (직접 경쟁)

| 제품 | 내용 |
|---|---|
| **Blitzy** | 코드베이스 역공학 → 의존성 인지 지식그래프 → bespoke agent plan → 3,000+ 에이전트 자율 구동. **2026-05 $200M 조달, 밸류 $1.4B**. Avalon ①②③ 통째 상용화 |
| **AWS Kiro** | 코드베이스 → requirements/design/tasks 3종 → 의존성 그래프를 wave로 조직 → wave 내부 병렬 + 상태 추적 |
| **GitHub Spec Kit** | `/speckit.tasks`가 의존성 정렬 + `[P]` 병렬 마커 + 파일 경로 + 페이즈 체크포인트가 박힌 tasks.md 생성. **CC 포함 30+ 하네스** → H1 이식성 주장도 부분 잠식 |
| **GitHub Copilot Workspace** | 리포·커밋·이슈 분석 → 의존성 포함 구현 계획을 `.copilot/plans/`에 저장 → PR까지 |
| **GitLab Auto DevOps** | 2018~. 언어·프레임워크 자동 감지 → 파이프라인 생성 → 완주. **LLM 이전에 이미 8년 된 개념** |
| **Nx Project Crystal** | 파일시스템·툴 설정을 읽어 프로젝트 그래프·태스크 추론 (결정론적·비LLM) |
| **Harness AI DevOps Agent** | 리포 설정으로 SCM 감지, steps/stages/pipelines 생성·편집 |
| **n8n AI Workflow Builder** | 자연어 → 노드 선택·배치·설정·연결 전체 생성. Make Maia · Zapier Copilot 동급 → **자동 생성은 2026 시점 table stakes** |

### 학술

`CodePlan`(MSR, ACM PACMSE 2024 — 6개 리포 중 5개 통과, 베이스라인 0) · `ADAS`(ICLR 2025, archive 축적 루프 = Avalon ①+④) · `AFlow`(ICLR 2025, MCTS로 노드·엣지 직접 편집, +5.7%) · `MaAS`(ICML 2025 Oral, 쿼리 난이도별 맞춤 시스템 샘플링 = "요청마다 다른 그래프") · `FlowReasoner` · `AOrchestra`(ICML 2026) · `MASFactory` · `COVENANT` · `AutoPipelineAI`

### 사용자 자신의 환경에 이미 있는 것 ★

| 자산 | 내용 |
|---|---|
| **Claude Code 내장 Plan 서브에이전트** | *"designs an implementation strategy and returns a step-by-step plan"*. 하네스 **기본 기능**이며 `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1`로 비활성화 가능 |
| **barkain/claude-code-workflow-orchestration** | **무료** CC 플러그인. 태스크 복잡도 분석 → 원자 페이즈 분해 → 의존성 분석 → wave 병렬 → 검증 에이전트. Avalon ①+③의 축소판 |

> ① FRONTEND 능력의 일부는 **Avalon 자산이 아니라 하네스 자산이다.**

### 시장이 실제로 표방하는 가치는 자동 설계가 아니다

오픈소스 코딩 에이전트 오케스트레이터 9종 중 태스크 그래프 자동 생성은 **1종뿐**. LangGraph 포지셔닝은 *명시적 제어·검사 가능성*이다.
→ 역량 부재가 아니라 **의도적 설계 선택**일 가능성이 높다.

### 경제성 공격

arXiv 2601.11147: top-K **태스크 레벨** 워크플로 라이브러리가 인스턴스별 생성 대비 **토큰 83% 절감 · 성능 -0.61%**.
→ 인스턴스마다 새로 설계하는 것 자체의 정당성이 흔들린다.

---

## 3. ② BACKEND — 갭이 아니라 붐비는 전장

2025-12 ~ 2026-07 사이 **최소 9개 시스템**이 동일 문제를 겨냥:

| 시스템 | 비고 |
|---|---|
| Compiled AI (2604.05150) | **프리프린트.** 공개된 것은 평가 프레임워크(스타 4)뿐 |
| PayPal 선언적 DSL (2512.19769) | |
| PlanCompiler (2604.13092) | LLM을 결정론 경계 상류에만 두는 분리를 명시. first-pass **92.67%** vs GPT-4.1 67% |
| SPL + splc (2607.07727) | |
| One-Shot Agentic Compilation (2604.09718) | |
| AgentSPEX (2604.13346) | |
| Agint (2511.19635) | |
| **GitHub gh-aw** | **프로덕션 컴파일러** |
| **BAML** | **프로덕션 컴파일러** |

### 1차 조사의 사실 오류 2건

1. **`Compiled AI`는 실물 제품이 아니다.** 논문 스스로 *"Code Factory invocations rely on runtime LLM calls"* 를 한계로 인정 — H=0 결정론은 control plane 한정
2. **"eBay 워크플로 DSL(2025-12)"은 오귀속.** 해당 논문은 **PayPal**이다. eBay DSL은 조사 범위에서 확인되지 않음

### 진짜 갭

IR 부재가 아니라 **IR 직렬화 형식 부재**. `graph-architect` 실측:

| | 상태 |
|---|---|
| **semantic** | ✅ 이미 강제됨 — 절대규칙 1(DEFINED NOT GUESSED) + Step 4 + UP-CONTRACT가 노드·엣지·숫자게이트·상태필드·재시도한도·휴먼게이트를 전부 요구 |
| **syntax** | ❌ 마크다운 표 + ASCII 아트뿐. **JSON/YAML 산출 지시 0건** |

> ⚠️ **인과 귀속 주의**: PlanCompiler의 92.67% vs 67% 격차를 "결정론 경계 분리" 하나에 귀속시킬 수 없다. 두 시스템은 프롬프트·스캐폴드·정적 검증·재생성 루프가 전부 다르며 교란 통제된 ablation이 없다.

---

## 4. ③ DRIVER — bkit 기각, Workflow 채택

### bkit `sprint-orchestrator` 일반화 기각

| 근거 | 실측 |
|---|---|
| 8-phase enum · 전이 인접행렬 · `ACTIVE_GATES_BY_PHASE` | 전부 `Object.freeze` |
| `sprint-paths.js` 헤더 | *"Frozen - extension requires explicit code change"* |
| `.bkit/state/sprints` | **전 드라이브 0건 — 완주 이력 자체가 없다** |

→ 검증된 적 없는 고정 구조를 억지로 늘리는 일이 된다.

### Claude Code Workflow 실측 (본 세션에서 직접 측정)

`wf_*.json` **316건**:

| 필드 | 커버리지 |
|---|---|
| `timestamp` / `startTime` / `durationMs` / `totalTokens` / `totalToolCalls` / `agentCount` / `status` | **전부 316/316 (100%)** |

- status: completed **306** / failed 5 / killed 5 → **완주율 96.84%**
- durationMs 중앙값 1,463,402ms(약 24분) / 최대 35,728,518ms(약 9.9시간)
- totalTokens 합계 **417,798,827** / 중앙값 956,416

> ⚠️ **증거 기준 비대칭 기록**: bkit 기각에는 "이력 0"을, Workflow 채택에는 "실행 316건"을 썼다. 그러나 316건은 **리뷰·검증 워크플로 실행 이력이지 임의 그래프 구동 이력이 아니다.** 채택 근거는 "검증됐다"가 아니라 "동결되지 않았다"이다.

---

## 5. ④ PGO → ARCHIVE — 격하 기각, 대신 3중 강등

### 격하 기각 근거 (인과 귀속 정정)

1차 조사: *"PGO는 Observability 파생"* → **틀렸다.**

| 근거 | 내용 |
|---|---|
| arXiv 2507.21046 | 자기진화는 What/When/How/Where to Evolve **4축을 갖는 독립 연구분야** |
| EvoAgentX (EMNLP 2025 Demo) | Evolving을 Evaluation과 **별개 레이어**로 배치 |
| DSPy / GEPA | **트레이싱·관측 플랫폼 없이** 시드 후보 + 데이터셋 + 평가함수만으로 동작 |
| gcc 실제 구조 | `-fprofile-generate`(계측)와 `-fprofile-use`(최적화 패스)가 **분리된 2단계**, profiler와 optimizer는 별개 컴포넌트 |

> **선행조건은 Observability가 아니라 Evaluation(판정 메트릭 + 케이스)이다.**

### 그러나 3중 강등

1. **이름 폐기** — Go 공식 문서 기준 진짜 PGO는 의미 보존 · 무라벨 · *"프로파일이 틀려도 느려지지 않음"* 이라는 실패 하한을 갖는데 에이전트 그래프 최적화는 **셋 다 위반**. 이름이 잘못된 안전 직관을 수입한다
2. **야심 축소** — "토폴로지 자동 재설계" → "(IR, 실행결과, 실패지점, 비용) 튜플 아카이브 + ① 주입". 프로덕션 트레이스로 토폴로지를 진화시킨 유일 사례 APEX(2606.15363)조차 *"Layer 3의 토폴로지 스코어링은 실제 task 완료율이 아니라 손으로 만든 구조적 휴리스틱"* 이라 자백. 검증 규모는 에이전트 1개 · 114 태스크 · 18일
3. **구현 순서 최후**

### `evolve_learning` 9건의 계수 오류 ★

1차 조사: *"evolve_learning 실물이 없다 → ④는 실행된 적 없다"*
딥리서치: *"9개 실존(6개 프로젝트) → 반증됨"*
**비평: 둘 다 틀렸다.**

- 이 파일들은 `.evolve/` 디렉터리에 있는 **`/evolve` 슬래시 명령의 자유형식 산출물**이지 그래프 IR과 조인되는 아카이브가 아니다
- G8이 `archive_join_key_coverage == 1.0 (graph.spec.hash)`을 요구 → **기존 9개에 graph.spec.hash가 있을 리 없다**
- 6개 프로젝트 중 `_oasis-agent-build`는 `oasis-agent`의 빌드 사본으로 보임 → 프로젝트 수도 부풀려짐

> **G8 기준 보유 자산은 9건이 아니라 0건이다.** 정확한 서술: *"④와 목적이 비슷한 다른 도구가 수동으로 돌았다."*

또한 `meta-autopilot`은 `skills/`가 아니라 `C:\Users\KHS\.claude\commands\meta-autopilot.md` **49줄 프롬프트 문서**이며 safe/medium/danger를 강제하는 코드가 **0줄**이다.

---

## 6. 관측성·거버넌스 자산 실측

### 이미 작동 중인 것 (1차 조사보다 많음)

| 자산 | 실측 |
|---|---|
| `.bkit/audit/*.jsonl` | **24개 파일.** action 13종에 `gate_failed` · `destructive_blocked` · `phase_transition` 포함. `blastRadius`/`result`/`reason` 필드까지 → **게이트 판정 이력의 사실상 정본** |
| Workflow journal | 317개 + 에이전트 트랜스크립트 3,609개 (구조화 result 페이로드, `spawnDepth`) |
| gstack `review-log.jsonl` | 유일하게 판정 결과(status/issues_found/critical)를 담음 |
| 훅 | 13종 디스패치 중 |
| control-state | L0~L4 신뢰 상태기 가동 중 |

### 오기·부재

| 항목 | 실측 |
|---|---|
| `agent-events.jsonl` | **부재.** `node-catalog.md` 5절이 실존 자산으로 등재한 것은 **오기** → 수정 필요 |
| `skill-usage.jsonl` | 3필드뿐이고 **gstack 스킬만** 계측 → '미실행 증거'로 쓰면 안 됨 |
| `token-ledger.ndjson` | 전 레코드 `parseStatus=no_payload` (원인은 하네스가 `hookContext.message`를 주지 않음 — Avalon이 고칠 수 있는 부채인지 미확인) |
| `agent-state.json` | 팀메이트 7명 전원 `status=spawning` 고착, `currentTask`/`taskId`/`progress` 전부 null |

### 계측 부채는 존재하지 않는다 ★

종합은 *"journal에 timestamp가 없어 지연·비용을 못 잰다"* 며 G9를 신설했으나 **전제가 사실이 아니다** (§4 실측 참조).

> 부채는 **"계측 부재"가 아니라 "계측 소비 부재"** 다. 데이터가 4.18억 토큰어치 쌓여 있는데 4개월간 아무도 열지 않았다. **처방이 정반대로 나와야 한다** — 새 계측을 만드는 게 아니라 있는 레코드를 파싱하는 어댑터를 만드는 일이다.

### Avalon이 직접 정의해야 하는 것은 3종뿐

표준에서 90%를 빌려온다 (OTel `gen_ai.*` · OpenInference `graph.node.id`/`parent_id`/`name` · LangSmith `dotted_order`).
OTel·OpenInference·Langfuse·LangSmith **어디에도 없음이 확인된 것**:

`gate.*` (판정 기록) · `branch.*` (분기 선택 기록) · `graph.spec.hash` (실행↔IR 조인 키)

> ⚠️ OTel `gen_ai.*`는 전 속성 **Development 등급**이며 2026-06에 코어 semconv에서 분리돼 안정성 보증 밖이다. 100% 준수를 요구하면서 플랫폼(Langfuse/LangSmith)을 붙이지 않으면 **비용만 지불하고 편익은 포기**하는 구조가 된다 — v4는 `otel_span_name_conformance_rate == 1.0`을 유지하되 이 위험을 기록한다.

### 규제 부담 없음

EU AI Act Art.2(10)이 **순수 개인·비직업 사용을 명시 면제**한다. 개인용 도구 명세에 컴플라이언스 챕터를 넣지 않는다.

---

## 7. 완결성 비평이 잡은 종합 자체의 문제

| # | 문제 | v4 반영 |
|---|---|---|
| 1 | **G9 전제가 사실 아님** — wf 레코드에 timestamp 100% | ✅ G9를 "계측 소비 어댑터"로 재작성 |
| 2 | **완주율 96.4%는 층위 오류** — 워크플로가 아니라 에이전트 스폰 이벤트 카운트 | ✅ **96.84%**(306/316, status 기준)로 정정 + 측정 대상 명시 |
| 3 | **G4c "노드당 단일 inbound"가 병렬을 금지** — fan-in/join/barrier 불가 → 정상 그래프 전부 컴파일 실패 | ✅ 삭제. 7 → **6** |
| 4 | **S1 기본동작 뒤집기 vs X4 위치보류 = 자기모순** + 부트스트랩 불가(0→10) | ✅ 뒤집기 **철회**. 부트스트랩 경로 명시 |
| 5 | **입증 책임 이중잣대** — ⑥(4.0/10) 격하하면서 ②(1.5) ④(0) 유지 | ✅ **벤더 카운트를 판정 도구에서 폐기**, 파이프라인 단 정의로 통일 |
| 6 | `agent_writable_policy_file_count == 0` 자기모순 — ②의 출력 타깃이 훅 파일 | ✅ 삭제 |
| 7 | 게이트 인플레이션 — 절반이 "상수 하나 박으면 통과" | ✅ **설정 선언 4개를 게이트에서 분리** |
| 8 | `semantic_output_hash_match_rate` 형용모순 — 해시 일치는 구문 동일 | ✅ G4d **보류**로 강등 |
| 9 | `retry_free_coverage` 판정자 없음 | ✅ G4b **보류**로 강등 |
| 10 | 숨은 전제(프로젝트 10~20개) 미기재 | ✅ 명시 |
| 11 | H1/H2 승격 조건이 원리적 충족 불가(1인 통제실험 불가) | ✅ 승격 조건 **삭제**, 대외 주장 금지 |
| 12 | 모델 id 핀은 통제 불가 대상 | ✅ 락파일 필드 4 → **3** |

### 비평이 "문제없다"고 판단한 것

- 6단 확장 기각의 **결론**은 타당 (논증 방식엔 이견)
- **G0를 최우선으로 둔 판단은 이 문서에서 가장 견고한 항목** — 로컬 실측(semantic 강제 / syntax 사람용)과 정확히 일치
- 무기명 출처 3편을 직접 열어 "5단은 출처 0건"임을 확인한 것이 **가장 값진 작업**

---

## 8. 남은 약점 — 정직하게

| # | 약점 |
|---|---|
| 1 | **"5단이 표준 아님"에서 "4단이 맞다"가 따라 나오지 않는다.** 4단도 어떤 벤더 문서에도 없다. v4는 4단을 기본값(입증 불필요)으로, 신설안을 예외(입증 필요)로 취급했다 |
| 2 | 벤더 카운트 상위 3개는 **Runtime(9.5) / State(9.0) / Observability(9.0)** 인데 이 중 둘이 격하됐다 |
| 3 | **단일 논문 1건에 걸린 구조 결정 3건** — 2601.11147(①기본동작) · 2607.07405(G6 절대조항) · 2607.22868(게이트 클래스 A/B) |
| 4 | "환원 가능하면 단이 아니다"는 판정 기준은 **반증 불가능한 형태** — 무엇이든 게이트로 환원할 수 있다 |
| 5 | ⑥ Governance를 격하했는데 **G6이 5개 조항짜리 최대 게이트** — 라벨과 실질 작업량이 반대. 별도 취급이 필요했다는 신호로도 읽힌다 |
| 6 | **사용자의 실제 실패 사례에서 요구사항을 역산한 갈래가 0건.** 로컬에 답이 있는데(audit `gate_failed` 8건 · `destructive_blocked` 17건 · loop-counters의 `graph-architect` SKILL.md 10회 편집 루프 · agent-state 7명 고착) 이 4개 실패 유형을 게이트가 몇 개나 막았을지 역산한 사람이 없다 |
| 7 | **이 틈에 수요가 있다는 근거는 조사 범위에서 발견되지 않았다** |

---

## 9. 출처

### 학술
`arXiv 2604.05150` Compiled AI · `2512.19769` PayPal 선언적 DSL · `2604.13092` PlanCompiler · `2607.07727` SPL+splc · `2604.09718` One-Shot Agentic Compilation · `2604.13346` AgentSPEX · `2511.19635` Agint · `2601.11147` 워크플로 라이브러리 경제성 · `2607.07405` silent wrong-state 78% · `2607.22868` 게이트 클래스 A/B · `2507.21046` 자기진화 4축 · `2606.15363` APEX · `2606.20615` 인간-에이전트 경계 형식문법 · `2606.06662` AutoPipelineAI · `2603.06007` MASFactory · `2607.25400` COVENANT · `2607.28527` MANTA
ICLR 2025 `ADAS` · `AFlow` / ICML 2025 Oral `MaAS` / ICML 2026 `AOrchestra` / EMNLP 2025 Demo `EvoAgentX` / ACM PACMSE 2024 `CodePlan`(MSR)

### 벤더·표준
LangGraph · Temporal · Mastra · Microsoft Agent Framework · OpenAI Agents SDK · CrewAI · AutoGen · Google ADK · MS CAF / OTel GenAI semconv · OpenInference · LangSmith · Langfuse / NIST CAISI · EU AI Act Art.2(10) · Go PGO 공식 문서 · reproducible-builds

### 상용 반례
Blitzy · AWS Kiro · GitHub Spec Kit · GitHub Copilot Workspace · GitLab Auto DevOps · Nx Project Crystal · Harness AI DevOps Agent · n8n AI Workflow Builder · Make Maia · Zapier Copilot · LangSmith Engine(2026-05-13) · gh-aw · BAML · Bernstein · barkain/claude-code-workflow-orchestration

### 로컬 실측
`wf_*.json` 316건 · `.bkit/audit/*.jsonl` 24개 · `.bkit/state/sprints` 0건 · `sprint-paths.js` · `graph-architect/SKILL.md` · `commands/meta-autopilot.md` · `.evolve/evolve_learning_*.md` 9건 · `agent-state.json` · `token-ledger.ndjson` · `node-catalog.md`

---

## 부록 — 워크플로 구성

```
Research (7 병렬)   stage-decomposition · observability · governance
                    pgo-selfimprove · prior-art-compiler · auto-design · local-assets
Refute   (3 병렬)   5단표준 반증 · 차별점 반증 · PGO격하 반증
Synthesize (1)      effort=max, 단 개수를 결과 도출값으로 개방
Critic     (1)      effort=high, 증거보다 강한 주장 · 모순 · 범위확대 · 검증불가 게이트 탐지
```

**설계 의도**: 종합 스키마에서 `stage_count_decision`을 자유 서술로 두어 "6단"을 전제하지 않았고, 프롬프트에 *"4단→6단이 v1의 6 Layer 재현인지 판정하라"* 를 최우선 지시로 심었다. 이 장치가 실제로 작동해 1차 조사의 결론을 뒤집었다.
