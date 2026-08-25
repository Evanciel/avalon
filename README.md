<div align="center">

# Avalon

**작업을 그래프로 선언하고, 숫자로 판정하고, 무손실로 컴파일해서 집행한다.**

에이전트가 "다 됐습니다"라고 말할 때, 그 말 대신 볼 수 있는 숫자를 만드는 도구 체인.

</div>

## 무엇인가

AI 에이전트에게 여러 단계 작업을 시키면 스스로 완료를 선언한다 — 채점자와 응시자가 같다.
Avalon은 그 판정을 에이전트에게서 뺏는다:

1. **선언** — 작업을 노드·엣지·게이트의 그래프(JSON IR)로 먼저 못 박는다
2. **검증** — 정적 검사 6종이 LLM 없이 그래프의 건전성을 판정한다
3. **컴파일** — LLM-free 순수 함수가 IR을 실행 코드로 번역한다. 게이트가 하나라도 새면 exit 1
4. **집행** — 게이트 판정은 도구만 내린다. 사람과 에이전트는 측정값만 넣는다

핵심 설계는 **서술형 게이트를 표현 불가능하게 만든 것**이다. 게이트는
`field(화이트리스트) + op + 숫자 리터럴` 3튜플만 허용된다. "잘 됐는지 확인" 같은
문장을 적을 칸이 스키마에 없다.

## 설치

```bash
git clone <this-repo> avalon
cd avalon && npm test   # 의존성 0개, Node 18+
```

Claude Code 스킬로 쓰려면 저장소를 스킬 디렉터리에 두고 `SKILL.md`를 진입점으로 삼는다.

## 빠른 시작

```bash
# 1. 대상 저장소를 실측해 G0-초록 골격 생성
node tools/scaffold.mjs <대상경로> "<과제 한 줄>" graph.json

# 2. TODO를 실제 설계로 교체 (노드·게이트·threshold_source)

# 3. 재스탬프 → 검증 → 컴파일
node tools/hash.mjs graph.json --write
node tools/validate.mjs graph.json
node tools/compile.mjs graph.json build/graph.workflow.js

# 4. 집행 (러너 경로)
node tools/run.mjs graph.json init
node tools/run.mjs graph.json next
```

**네 숫자가 전부 통과해야 실행한다:**

| | 통과 조건 | 재는 것 |
|---|---|---|
| `ir_field_coverage` | 1.00 | 필수 13필드 전수 |
| `static_checks_passed` | 6/6 | 상태 밖 참조 · 비가역 무단실행 · 도달불가 · 무한루프 · 예산 누락 · 엣지 깨짐 |
| `gate_loss` | 0 | 선언한 게이트가 산출 코드에 전부 실렸는가 |
| `hook_loss` | 0 | 훅 강제 선언이 전부 `build/hooks.json`에 실렸는가 |

## 왜 loss 지표인가 — 흉터 이력

이 저장소의 규칙은 전부 실측에서 나왔다. 같은 계열의 결함이 반복되면 번호를 붙여 센다:

| # | 결함 | 잡은 방법 |
|---|---|---|
| 1 | 검사 #4(종료 가능성)가 공허 — G0가 강제하는 조건을 다시 물어서 절대 실패 불가 | 판정 기준을 게이트 루프 상한으로 교체 |
| 2 | `project.fingerprint`를 측정해서 IR에 저장하고 **프롬프트에 한 글자도 안 실음** | 공유 컨텍스트 블록(CTX) + 회귀 테스트 D5 |
| 3 | IR에 대상 저장소·과제를 적을 **자리 자체가 없음** — 컴파일해도 에이전트가 어디서 뭘 할지 모름 | v1.4 필수 필드 `target`·`task` + 컴파일 거부 |
| 4 | `requires_approval`이 검증 통과 후 **컴파일러가 폐기** — 비가역 노드가 정지 없이 실행됨 | 승인 게이트 방출 + 회귀 테스트 D6 |
| 5 | `enforced_by_hook`·`state_file`이 선언되고 초록을 받았지만 **훅 파일이 존재한 적 없음** | `{gate, check}` 선언 + `hook_loss` + 회귀 테스트 D7 |

공통 패턴: **선언은 검증되고, 그 다음 폐기된다.** loss 지표는 "선언한 것이 산출물에
실재하는가"를 기계로 대조해 이 클래스를 차단한다.

## 완료 판정 — ABANDON 의미론

`on_exhaust: partial`로 게이트를 못 넘고 지나간 경우, 산출 코드는
`abandoned[]`에 `{gate, field, threshold, measured, attempts}` 실측 증거를 남기고
최종 `completed`를 **false로 강제**한다. 포기는 종단이되 성공이 아니다 —
부분 산출이 완료 보고로 둔갑하는 경로를 실행 의미론 테스트가 막는다.

## 저장소 지도

```
SKILL.md                 스킬 진입점 — 절차와 규율
graph.json / graph.md    자기적용 그래프 (정본은 JSON, md는 렌더 산출물)
tools/
  scaffold.mjs           대상 실측 → G0-초록 골격 생성
  hash.mjs               canonical JSON + sha256 스탬프
  validate.mjs           정적 검사 6종 + G0 + 스키마 버저닝(X4)
  render.mjs             JSON → 마크다운 (--check = G0b 오라클)
  compile.mjs            IR → Workflow 스크립트 + hooks.json (INV-1: LLM-free)
  run.mjs                러너 — 프론티어·측정 원장·게이트 집행 (거부 방어벽 15종)
  test.mjs               스키마·컴파일러·실행 의미론 테스트
  run.selftest.mjs       러너 자기시험 — "막는 코드를 지우면 빨개지는가"
docs/graph/              설계 이력 (v1→v4 딥리서치, IR 스키마, 흉터 기록)
```

## 검증

```bash
npm test
```

- `test.mjs` — 스키마 버저닝, 컴파일 결정론(G4a), gate/hook 무손실, 승인 정지,
  ABANDON 의미론(컴파일 산출물을 스텁 호스트로 실제 구동)
- `run.selftest.mjs` — 러너의 거부 방어벽 15종이 실제로 걸리는지. 대부분의 케이스가
  "이것이 반드시 실패해야 한다" 형태다

## 보장하지 않는 것

- 도구는 **선언된 오라클**만 증명한다. check 명령이 게이트 제목의 뜻과 일치하는지는 증명 못 한다
- `build/hooks.json`은 명세다 — 설치되기 전까지 아무것도 차단하지 않는다. 설치는 승인 노드의 일
- `project.fingerprint`의 프로젝트 간 판별력은 미검증 (표본 부족)
- 에이전트 노드의 런타임 산출물(`produces`)은 컴파일 시점에 대조할 수 없다

자기적용 그래프의 `guarantees` 블록에 현재 상태의 전체 목록이 있다.

## 라이선스

[MIT](LICENSE)
