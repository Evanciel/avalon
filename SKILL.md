---
name: avalon
description: 작업을 그래프로 선언해서 진행한다 — 실측 → IR → 검증 → 무손실 컴파일 → 숫자 게이트 집행. 파일 4개 이상·여러 모듈·비가역 단계가 섞인 작업, 자율 루프로 돌릴 작업, "아발론 진행"·"그래프로 가자"·"avalon" 신호에 사용. 한두 파일 수정에는 쓰지 않는다.
---

# Avalon — 그래프로 선언하고 집행한다

즉흥 착수 대신, **무엇을 언제 어떤 근거로 판정할지 먼저 못 박고** 시작한다.
도구는 전부 결정적이다 — LLM을 호출하지 않는다(INV-1). 판단은 사람과 모델이 하고, 판정은 도구가 한다.

## 언제 쓰나

- 파일 4개 이상 · 여러 모듈 · 되돌리기 어려운 단계가 섞인 작업
- 자율 루프로 돌릴 작업 — 판정 근거가 없으면 루프가 스스로를 속인다

한두 파일 고치는 일에는 쓰지 않는다. 그래프 비용이 작업 비용보다 크면 본말전도다.

## 절차

### 1. 골격 — 기계가 실측한다

```bash
node tools/scaffold.mjs <대상경로> "<과제 한 줄>" graph.json
```

저장소를 실측해 스택·규모·표식(fingerprint)을 채우고, 해시를 찍고, **G0를 통과하는** 골격을 낸다.
초록에서 시작해 초록을 유지하며 내용을 바꾼다. 빨강에서 시작하지 않는다.

### 2. 설계 — 판단이 필요한 부분

골격의 `TODO:`를 실제 설계로 바꾼다. 노드가 무엇인지, 게이트가 **무엇을 어떻게 재는지**는
판단이라 기계가 못 한다. 지켜야 할 것:

- **DEFINED — NOT GUESSED.** 지문의 표식은 이 저장소에서 직접 잰 값이어야 한다.
- **게이트는 숫자다.** 서술형 게이트는 스키마가 표현 자체를 거부한다. `threshold_source`에
  그 숫자가 어디서 나왔는지 적는다 — 근거 없는 임계값은 장식이다.
- **단위를 맞춘다.** `type: ratio`(0~1)에 임계값 90을 주면 영원히 통과하지 못한다. 실제로 있었던 버그다.
- 되돌릴 수 없는 노드에는 `policy.requires_approval: true`를 단다. **산출 코드가 그 지점에서 실제로 멈춘다.**
- 훅으로 강제할 게이트는 `host.enforced_by_hook`에 `{ "gate": "<id>", "check": "<명령>" }`으로
  선언한다. check는 게이트 미달 시 exit≠0이어야 한다 — **기계 없는 선언은 hook_loss로 잡힌다.**

### 3. 재스탬프 → 검증 → 컴파일

```bash
node tools/hash.mjs graph.json --write
node tools/validate.mjs graph.json
node tools/compile.mjs graph.json build/graph.workflow.js
```

**네 숫자를 확인한다.** 하나라도 안 맞으면 실행하지 않는다.

| | 통과 조건 | 뜻 |
|---|---|---|
| `ir_field_coverage` | 1.00 | 필수 13필드가 다 찼다 |
| `static_checks_passed` | 6/6 | 서술형 게이트·상태 밖 참조·비가역 무단실행·도달불가·무한루프·엣지 깨짐 없음 |
| `gate_loss` | 0 | IR의 게이트가 산출 코드에 전부 실렸다 |
| `hook_loss` | 0 | 훅 강제를 선언한 게이트가 전부 `build/hooks.json`에 실렸다 (선언 없으면 미표시) |

loss가 0이 아니면 **선언만 하고 강제하지 않는 상태**다. 그 그래프는 의미가 없다.

### 4. 집행 — 두 가지 경로

**A. Workflow 스크립트** (`build/graph.workflow.js`) — 에이전트 오케스트레이션 호스트에서 돈다.
실행은 사용자 동의가 필요하다. 멈춘 지점부터 재개할 수 있다:

```
Workflow({ scriptPath: "build/graph.workflow.js",
           args: { resume_from, resume_state, resume_loops, approved: ["<노드id>"] } })
```

`policy.requires_approval` 노드는 `approved`에 id가 없으면 **실행 전에 멈춘다.**
기본값은 빈 집합이다 — 게이트가 공허해지지 않도록 회귀 테스트가 고정한다.

**B. 러너** (`tools/run.mjs`) — 세션이 직접 노드를 도는 경우의 집행자.

```bash
node tools/run.mjs graph.json init      # 상태 생성 (그래프 수정 후에는 init --force)
node tools/run.mjs graph.json next      # 지금 할 수 있는 것
node tools/run.mjs graph.json start <node>
node tools/run.mjs graph.json measure <field> <value> [메모]
node tools/run.mjs graph.json done <node>   # 게이트 판정은 도구만 내린다
```

사람/에이전트는 **측정값만** 넣는다. 프론티어 밖 노드는 start가 거부되고, 이번 방문에 안 잰
필드는 done이 거부되며, 모든 측정은 원장에 append-only로 남는다. 그래프 해시가 바뀌면
상태가 STALE로 표시된다 — 조용히 이어가지 않는다.

## 완료 판정 — 포기는 성공이 아니다

산출 코드의 `completed`는 **`abandoned`가 비어 있을 때만 true**다.

- `on_exhaust: partial`로 지나간 게이트 미달은 `abandoned[]`에
  `{gate, node, field, op, threshold, measured, attempts}` 실측 증거로 남는다.
- `fail`/`halt` 소진도 같은 증거를 싣고 `completed: false`로 멈춘다.
- **부분 산출은 완료가 아니다.** abandoned가 있는 완주를 성공으로 보고하지 마라.

## 훅 — 산출과 설치는 다른 단계다

컴파일은 `build/hooks.json` **명세까지만** 낸다 (게이트별 check 명령 + exit 계약).
settings 설치는 별도 승인 노드의 일이며, 자동 설치는 금지다. 명세는 설치되기 전까지
아무것도 차단하지 않는다 — 이 한계를 완료 보고에 그대로 쓴다.

## 보장 범위를 항상 쓴다

그래프에는 `guarantees.provides / excludes`를 채운다. 도구가 증명하는 것은 **선언된 오라클**뿐이다 —
check가 게이트의 한국어 제목과 같은 뜻인지는 증명하지 못한다. 재지 않은 것을 잰 것처럼 쓰지 마라.

## 검증

```bash
npm test   # tools/test.mjs (스키마·컴파일러·실행 의미론) + tools/run.selftest.mjs (러너 거부 방어벽)
```
