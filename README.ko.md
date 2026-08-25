<div align="center">

<img src="images/banner.svg" alt="Avalon — 그래프로 선언하고, 숫자로 판정한다" width="100%" />

**AI 에이전트를 위한 그래프 엔지니어링 — 완전한 하네스, 그리고 스스로를 속이지 못하는 루프.**<br/>
일을 시작하기 전에 통과 조건을 숫자로 못 박고, 판정은 AI가 아니라 도구가 내립니다.

[![CI](https://github.com/Evanciel/avalon/actions/workflows/test.yml/badge.svg)](https://github.com/Evanciel/avalon/actions/workflows/test.yml) ![tests](https://img.shields.io/badge/tests-124%20passing-brightgreen) ![deps](https://img.shields.io/badge/dependencies-0-blue) ![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[English](README.md) · **한국어** · [日本語](README.ja.md) · [简体中文](README.zh.md)

</div>

## 어떤 문제를 푸나

AI 에이전트에게 큰 작업을 맡기면 마지막에 "다 됐습니다"라고 말합니다. 문제는 그 말을 한 것도, 확인한 것도 같은 AI라는 점입니다. 시험 친 학생이 채점까지 하는 셈이라, 중간에 빠진 게 있어도 아무도 모릅니다.

AI를 루프로 돌릴 때(밤새 자동 작업, 통과할 때까지 재시도) 이 문제는 더 커집니다. 판정 기준이 에이전트 바깥에 없으면, 루프는 스스로를 속이면서 기분 좋게 계속 돕니다.

Avalon은 순서를 뒤집습니다. 일을 시작하기 **전에** 계획을 그래프로 그립니다. 노드는 할 일, 엣지는 순서, 게이트는 통과 조건 — 그리고 게이트에는 **숫자만** 쓸 수 있습니다. 판정은 작은 도구들이 내립니다. 이 도구들은 LLM을 부르지 않아서, 같은 그래프를 넣으면 언제나 같은 답이 나옵니다.

<img src="images/who-judges.svg" alt="Avalon 없이는 에이전트가 자기 점수를 직접 쓴다. Avalon에서는 에이전트가 측정값을 내고, 결정적 도구가 판정한다." width="100%" />

일은 여전히 에이전트가 전부 합니다 — 자기 점수를 매길 권리만 잃는 겁니다.

## 하네스에 뭐가 들어있나

| 구성 | 하는 일 |
|---|---|
| **그래프 (JSON IR)** | 계획 그 자체. 게이트는 `필드 + 연산자 + 숫자` — "잘 됐는지 확인" 같은 문장을 적을 칸이 아예 없습니다 |
| **검증기** | 정적 검사 6종: 도달 못 하는 노드, 무한 루프, 예산 없는 노드, 승인 없는 비가역 단계, 깨진 엣지, 화이트리스트 밖 필드 |
| **컴파일러** | 그래프를 실행 코드로 번역합니다. 게이트가 하나라도 번역에서 빠지면 거부합니다 (`gate_loss`) |
| **러너** | 실행 순서를 강제합니다. 차례가 아닌 노드는 시작 못 하고, 측정 없이는 완료 못 하고, 모든 측정은 지울 수 없는 원장에 남습니다 |
| **훅 명세** | 게이트를 세션 **바깥**에서도 강제할 수 있게 `build/hooks.json`을 산출합니다. 명령 없는 선언은 `hook_loss`로 잡힙니다 |

## 실행 흐름

<img src="images/pipeline.svg" alt="1 scaffold는 저장소를 실측하고, 2 design은 사람의 판단이고, 3 validate와 compile은 네 숫자를 검사하고, 4 run은 순서를 강제하며 원장에 기록한다" width="100%" />

네 단계 중 둘은 기계, 하나는 사람, 하나는 사람을 감시하는 기계입니다. 판단이 들어가는 곳은 2번 — 노드와 게이트를 무엇으로 할지 정하는 순간 — 딱 하나뿐입니다. 그 주변은 전부 결정적으로 돌아가는데, 그게 핵심입니다. 판단은 숫자로 한 번만 기록되고, 그 뒤로는 아무도 기분으로 재판정할 수 없습니다.

## 빠른 시작

```bash
git clone https://github.com/Evanciel/avalon && cd avalon
npm test        # 테스트 124건, 의존성 0개, Node 18+
```

```bash
# 1. 대상 저장소를 실측해서, 검증을 이미 통과하는 골격을 만든다
node tools/scaffold.mjs <대상경로> "과제 한 줄" graph.json

# 2. TODO를 실제 노드와 게이트로 바꾼다 (여기가 판단이 필요한 부분 — 사람 몫)

# 3. 스탬프 → 검증 → 컴파일
node tools/hash.mjs graph.json --write
node tools/validate.mjs graph.json
node tools/compile.mjs graph.json build/graph.workflow.js

# 4. 러너로 집행
node tools/run.mjs graph.json init
node tools/run.mjs graph.json next
node tools/run.mjs graph.json start <노드>
node tools/run.mjs graph.json measure <필드> <값>
node tools/run.mjs graph.json done <노드>     # 통과/미달은 도구가 정한다
```

### 원샷: 스킬로 돌리기

위 명령들은 수동 경로입니다. 이 저장소는 동시에 Claude Code 스킬이기도 하고([SKILL.md](SKILL.md)가 진입점), 원래 의도한 사용법이 그쪽입니다 — 목표만 말하면 에이전트가 나머지를 합니다:

1. 대상 저장소에 `scaffold`를 돌려 실측합니다.
2. 일을 노드로 쪼개고 게이트를 씁니다. 여기가 판단 단계 — 초안은 에이전트가 쓰고, 결과에 대한 거부권은 검증기가 쥡니다.
3. 스탬프 → 검증 → 컴파일로 네 숫자를 초록으로 만듭니다.
4. 실행합니다: 컴파일된 워크플로가 노드마다 서브에이전트를 배정하고, 노드 사이의 인수인계는 전부 숫자 게이트를 통과합니다. (또는 에이전트가 러너 CLI를 직접 몰면서 측정값을 기록합니다.)

완료까지 스스로 굴러가되, 예외 둘이 이 스킬의 존재 이유입니다: 비가역 단계는 멈춰서 사람 승인을 기다리고, 포기한 게이트는 `abandoned[]`에 남아서 "이 정도면 됐지"를 조용히 결정할 수 없습니다.

### 게이트는 이렇게 생겼다

게이트는 JSON 객체 하나입니다. 자유 서술 칸이 없어서, 후하게 해석할 여지 자체가 없습니다:

```jsonc
{
  "id": "G1",
  "field": "tests_failed",          // state[]에 선언된 필드만 — 모르는 필드는 거부
  "op": "==",
  "threshold": 0,
  "on_fail": { "goto": "fix", "max_retry": 2 },
  "ground_truth": "measured",
  "threshold_source": "왜 이 숫자인가 — 근거를 글로 한 번은 적게 만든다"
}
```

`done`을 치면 도구가 `tests_failed`의 최신 측정값을 읽고 `== 0`을 적용해서 통과/미달을 답합니다. 임계값에 대한 논쟁은 실행 전에 하는 것이고, 실행 중에 판정에 대해 따질 방법은 없습니다.

### 러너가 거부하는 것들

러너는 사실상 "안 되는 일 목록"입니다. 네 가지 불변식(INV-1~4, [run.mjs](tools/run.mjs))에서 나옵니다:

| 이렇게 하면 | 러너의 답 |
|---|---|
| 순서가 아닌 노드를 `start` | 거부 — 대신 지금 시작할 수 있는 노드를 알려준다 |
| 이번 방문의 측정 없이 `done` | 거부 — 옛 측정값은 이월되지 않아서, 낡은 초록으로 재시도를 통과할 수 없다 |
| 그래프에 선언 안 된 필드를 `measure` | 거부 — 선언 없는 필드를 재는 건 절차를 갖춘 추측일 뿐이다 |
| `init` 후에 그래프를 고치고 계속 진행 | **STALE** 표시 — 상태는 자기가 어느 그래프 해시에서 태어났는지 기억한다 |
| 게이트를 `max_retry`보다 많이 실패 | **중단** — 실행이 멈추고 결정이 사람에게 넘어간다 |

수락된 측정은 전부 `state.ledger.jsonl`에 덧붙습니다. 원장은 절대 고쳐 쓰지 않고, `init --force`를 해도 남습니다.

**실행 전에 네 숫자가 전부 초록이어야 합니다:**

| | 통과 조건 | 뜻 |
|---|---|---|
| `ir_field_coverage` | 1.00 | 필수 필드가 다 찼다 |
| `static_checks_passed` | 6/6 | 그래프 구조에 문제가 없다 |
| `gate_loss` | 0 | 선언한 게이트가 실행 코드에 전부 실렸다 |
| `hook_loss` | 0 | 선언한 훅마다 실제 명령이 붙어 있다 |

loss가 0이 아니라는 건 "선언만 있고 강제하는 게 없다"는 뜻입니다. 그런 그래프는 장식이고, 도구가 exit 코드로 그렇게 말해줍니다.

## 규칙이 태어난 곳

이 규칙들은 머리로 설계한 게 아닙니다. 전부 실제로 겪은 버그에서 나왔고, 같은 종류가 반복되면 번호를 붙여서 셉니다:

| # | 무슨 일이 있었나 | 지금은 뭐가 막나 |
|---|---|---|
| 1 | 절대 실패할 수 없는 검사가 있었다 — 다른 검사가 이미 강제하는 조건을 또 물었다 | 루프를 실제로 끊는 조건으로 검사를 다시 씀 |
| 2 | 프로젝트 지문을 측정해서 저장까지 해놓고, 프롬프트에는 한 글자도 안 실었다 | 공유 컨텍스트 블록 + 회귀 테스트 |
| 3 | "어느 저장소에서 무슨 일을"을 적을 칸이 IR에 없었다 — 컴파일된 에이전트가 눈 감고 시작했다 | `target`·`task` 필수화, 없으면 컴파일 거부 |
| 4 | 승인 필수 선언이 검증을 통과한 뒤 컴파일러가 조용히 버렸다 — 비가역 `git push`가 정지 없이 나갔다 | 승인 게이트를 코드에 방출 + 회귀 테스트 |
| 5 | 훅 강제가 IR에 선언되고 검사도 전부 초록이었는데, 훅 파일이 존재한 적이 없었다 | 선언에 실행 가능한 명령을 필수로 붙임, 그 간극을 `hook_loss`가 셈 |

공통 패턴은 하나입니다: **선언은 검증받고, 그다음 버려진다.** loss 지표는 이 종류의 버그를 그냥 지나칠 수 없게 만들려고 존재합니다.

## 포기는 성공이 아니다

<img src="images/abandon.svg" alt="재시도를 소진한 게이트는 증거를 abandoned[]에 남기고, 그 목록이 비어 있지 않는 한 최종 completed는 강제로 false다" width="100%" />

게이트가 재시도를 다 쓰고도 못 넘었는데 `on_exhaust: partial`이라 계속 가는 경우 — 워크플로는 전진하지만 `{게이트, 실측값, 임계값, 시도 횟수}`를 `abandoned[]`에 남기고, 그 목록이 비어 있지 않는 한 최종 `completed`는 **강제로 false**가 됩니다. 게이트를 건너뛴 실행이 자기를 성공이라고 보고할 방법이 없습니다. 이건 컴파일 산출물을 실제로 돌려보는 테스트가 고정하고 있습니다.

## 저장소 지도

```
SKILL.md                 스킬 진입점 — 절차와 규율
graph.json / graph.md    자기적용 그래프 (정본은 JSON, md는 렌더 산출물)
tools/
  scaffold.mjs           저장소 실측 → 초록 골격 생성
  hash.mjs               canonical JSON + sha256 스탬프
  validate.mjs           정적 검사 6종 + 스키마 버저닝
  render.mjs             JSON → 마크다운 (--check = 바이트 단위 대조)
  compile.mjs            IR → 워크플로 스크립트 + hooks.json (LLM을 부르지 않음)
  run.mjs                러너 — 순서 강제, 측정 원장, 게이트 판정
  test.mjs               스키마·컴파일러·실행 의미론 테스트 (88건)
  run.selftest.mjs       러너 자기시험 — "막는 코드를 지우면 빨개지는가" (36건)
docs/graph/              설계 이력, IR 명세, 위 흉터 기록의 원본
```

## 정직한 한계

- 도구가 증명하는 건 **선언된 오라클**뿐입니다. check 명령이 게이트 제목과 같은 뜻인지는 여전히 사람이 봐야 합니다.
- `build/hooks.json`은 명세입니다. 설치되기 전까지는 아무것도 차단하지 않습니다 (설치는 별도 승인 단계).
- 에이전트 노드가 런타임에 만드는 산출물은 컴파일 시점에 대조할 수 없습니다.

전체 목록은 자기적용 그래프의 `guarantees` 블록에 있습니다.

## 라이선스

[MIT](LICENSE)
