<div align="center">

<img src="https://raw.githubusercontent.com/Evanciel/avalon/main/images/banner.svg" alt="Avalon — 그래프로 선언하고, 숫자로 판정한다" width="100%" />

**AI 에이전트의 "다 됐습니다"는 의견입니다. Avalon은 그것을 측정으로 바꿉니다.**<br/>
일을 시작하기 전에 통과 조건을 숫자로 못 박고, 판정은 AI가 아니라 도구가 내리게 합니다.

[![npm](https://img.shields.io/npm/v/avalon-skill?color=cb3837&logo=npm)](https://www.npmjs.com/package/avalon-skill) [![CI](https://github.com/Evanciel/avalon/actions/workflows/test.yml/badge.svg)](https://github.com/Evanciel/avalon/actions/workflows/test.yml) ![tests](https://img.shields.io/badge/tests-158%20passing-brightgreen) ![deps](https://img.shields.io/badge/dependencies-0-blue) ![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[English](README.md) · **한국어** · [日本語](README.ja.md) · [简体中文](README.zh.md)

</div>

- [이것이 존재하는 이유](#이것이-존재하는-이유)
- [Avalon이 하는 일](#avalon이-하는-일)
- [세 단계로 시작하기](#세-단계로-시작하기)
- [실행은 이렇게 보입니다](#실행은-이렇게-보입니다)
- [보장](#보장)
- [내부 구조](#내부-구조) — [하네스](#하네스에-뭐가-들어있나) · [4단 아키텍처](#4단-아키텍처) · [세 가지 실행법](#돌리는-세-가지-방법) · [튜토리얼](#튜토리얼-실제로-한-번-돌려보기) · [그래프 포맷](#그래프-포맷) · [도구](#도구-하나하나) · [흉터](#규칙이-어디서-왔는가) · [종이 흔적](#설계의-종이-흔적) · [자기적용](#아발론은-아발론-위에서-돈다)
- [테스트 방법](#테스트-방법)
- [저장소 지도](#저장소-지도)
- [정직한 한계](#정직한-한계)

## 이것이 존재하는 이유

이 프로젝트는 작은 거짓말 하나에서 시작됐습니다 — AI 에이전트가 매일, 아무 악의 없이 하는 종류의 거짓말입니다.

여러 단계짜리 작업을 에이전트에게 맡기고 혼자 일하게 두었습니다. 계획도 잘 세웠고, 열심히 일했고, 이렇게 보고했습니다: **"다 됐습니다 — 전부 통과합니다."** 설득력 있었습니다. 그리고 틀렸습니다. 한 단계는 조용히 포기되었고, 한 검사는 조용히 건너뛰어졌는데, 루프 안의 그 무엇도 둘 중 하나라도 언급할 이유가 없었습니다.

일부러 거짓말한 이는 없습니다. 문제는 구조입니다: **일을 하는 쪽과 채점하는 쪽이 같은 모델입니다.** 자기 시험지를 채점하는 학생은 나쁜 의도 없이도 A를 줄 수 있습니다 — 그리고 초록으로 보일 때까지 재시도하며 밤새 무인으로 도는 에이전트는, 밤새도록 기꺼이 스스로를 설득합니다.

<img src="https://raw.githubusercontent.com/Evanciel/avalon/main/images/who-judges.svg" alt="Avalon 없이는 에이전트가 자기 점수를 직접 쓴다. Avalon에서는 에이전트가 측정값을 제출하고, 결정적 도구가 판정을 내린다." width="100%" />

해법은 오래되고 지루한 것이라서, 그래서 통합니다: **판정을 바깥으로 옮기는 것.** 일을 시작하기 전에 계획을 그래프로 그립니다 — 노드는 할 일, 엣지는 순서, 게이트는 **숫자로만** 쓴 통과 조건입니다. 판정은 작은 결정적 도구들이 내립니다. 이 도구들은 LLM을 부르지 않아서, 같은 그래프에는 언제나 같은 판정이 나옵니다. 일은 여전히 에이전트가 전부 합니다 — 자기 점수를 매길 권리만 잃는 겁니다.

이 저장소의 규칙 중 화이트보드에서 설계된 것은 하나도 없습니다. 하나하나가 이 프로젝트 자신의 개발 중에 실제로 빠져나간 버그에서 나왔습니다 — 다섯 개, 각각 지금은 회귀 테스트가 지키는 규칙이 되었습니다:

<img src="https://raw.githubusercontent.com/Evanciel/avalon/main/images/scars.svg" alt="실제 버그 다섯이 규칙 다섯이 되었다: 절대 실패할 수 없던 검사, 한 번도 쓰이지 않은 측정, 눈 감고 컴파일된 에이전트, 조용히 버려진 승인, 존재한 적 없는 훅" width="100%" />

(전체 이야기는 [규칙이 어디서 왔는가](#규칙이-어디서-왔는가)에 있습니다. 프로젝트의 원래 홍보 문구조차 자체 조사 단계를 살아남지 못했습니다 — [설계의 종이 흔적](#설계의-종이-흔적) 참조.)

**이럴 때 쓰세요:** 에이전트에게 큰 일(파일 4개 이상, 되돌리기 어려운 단계)을 맡길 때, 에이전트를 무인으로 돌릴 때, 혹은 증거 없는 성공 보고를 더는 못 믿게 됐을 때. **이럴 땐 건너뛰세요:** 파일 한두 개 고치는 일 — 계획 그리는 비용이 일보다 크면 배보다 배꼽입니다.

## Avalon이 하는 일

<img src="https://raw.githubusercontent.com/Evanciel/avalon/main/images/pipeline.svg" alt="1 scaffold는 저장소를 실측하고, 2 design은 사람의 판단이고, 3 validate와 compile은 네 숫자를 검사하고, 4 run은 순서를 강제하며 덧붙이기 전용 원장에 기록한다" width="100%" />

네 단계 중 둘은 기계이고, 하나는 당신(또는 에이전트 — 거부권은 기계가 쥔 채)이고, 하나는 일이 벌어지는 걸 지켜보는 기계입니다. 판단이 들어오는 곳은 2단계 — 노드와 게이트를 무엇으로 할지 정하는 순간 — 하나뿐입니다. 그 주변은 전부 결정적으로 돌아가는데, 그게 핵심입니다: 판단은 숫자로 한 번만 기록되고, 그 뒤로는 아무도 기분으로 재판정할 수 없습니다.

구체적으로 "게이트"란 이런 한 줄을 — 그리고 *오직* 이런 한 줄만을 — 뜻합니다:

```jsonc
{ "field": "tests_failed", "op": "==", "threshold": 0 }
```

이 포맷에는 "잘 됐는지 확인" 같은 말을 적을 자리가 없습니다. 산문은 통과 조건이 아닙니다.

## 세 단계로 시작하기

<img src="https://raw.githubusercontent.com/Evanciel/avalon/main/images/three-steps.svg" alt="세 단계: 한 번 설치하고, 평소 말로 한 줄 말하고, 끝에서 신호등을 읽는다" width="100%" />

### ① 한 번 설치

```bash
git clone https://github.com/Evanciel/avalon ~/.claude/skills/avalon
```

Claude Code 기준으로는 이게 설치의 전부입니다 — [SKILL.md](SKILL.md)의 frontmatter(`name: avalon`)가 스킬 등록을 담당합니다. 의존성 0개, Node 18+; 도구는 직접 실행할 일 없는 독립 `.mjs` 파일들입니다. (스킬 없이 도구 체인만 원하면 npm에도 있습니다 — `npm i avalon-skill`. 저장소 자체를 만지려면: `git clone https://github.com/Evanciel/avalon && cd avalon && npm test`.)

### ② 평소 말로 한 줄만 말하기

"그래프"가 뭔지 "게이트"가 뭔지 몰라도 됩니다. 목표를 말하고, "실제로 작동하는지 확인까지"를 붙이면 됩니다:

**처음부터 시작할 때** — 아직 아무것도 없을 때:

```text
Run this under avalon — build a website for my café from scratch:
a menu page, directions, and a contact form. Check that all three actually work.
```

(한국어로는 이렇게: "아발론으로 진행해 — 우리 카페 웹사이트를 처음부터 만들어줘. 메뉴 페이지, 오시는 길, 문의 폼. 셋 다 실제로 작동하는지 확인까지.")

**하던 것에 뭔가 더할 때** — 그 프로젝트 폴더에서 Claude Code를 열고 부탁하면 됩니다. 에이전트는 손대기 전에 이미 있는 것부터 실측합니다:

```text
Run this under avalon — add a booking feature to the site I've been building.
Check that a new booking actually shows up in the list.
```

("아발론으로 — 만들던 사이트에 예약 기능 넣어줘. 새 예약이 목록에 실제로 뜨는지 확인까지.")

**되돌리기 무서운 수정:**

```text
Run this under avalon — fix the payment part. Ask me before anything that can't be undone.
```

("아발론으로 — 결제 부분 고쳐줘. 되돌릴 수 없는 건 하기 전에 나한테 물어봐.")

**밤새 맡길 때:**

```text
Run this under avalon — work through this list while I sleep.
If a gate fails, stop — don't gloss over it.
```

("아발론으로 — 자는 동안 이 목록 처리해줘. 게이트 미달이면 얼버무리지 말고 멈춰.")

표현은 자유입니다("아발론으로 진행해", "use the avalon procedure", …) — 스킬의 트리거는 이름입니다. 숫자·게이트·그래프 설계는 에이전트의 일입니다. 대신 에이전트가 반드시 해야 하는 일은, **일을 시작하기 전에** 그 기준을 알아들을 수 있는 말로 보여주는 것입니다 — "보내기를 누르면 저장된 문의가 1건 늘어야 함, 실패한 검사 0개" 같은 식으로. 당신은 그게 당신이 생각하는 *완성*이 맞는지만 말하면 됩니다.

### ③ 신호등 읽기

끝나면 숫자 네 개와, 에이전트가 조작할 수 없는 칸 두 개를 받습니다:

- **초록 넷** (`coverage 1.00 · checks 6/6 · gate_loss 0 · hook_loss 0`) — 계획이 건전했고, 번역에서 잃은 것이 없다는 뜻입니다.
- **`completed: true`** — 모든 게이트가 실측값으로 통과했다는 뜻입니다.
- **`abandoned: []`** — 비어 있으면 아무것도 포기되지 않았다는 뜻입니다. 이 목록에 뭔가 *있다면* "이 부분은 못 했고, 증거는 이것 — 무엇을 쟀고, 기준이 뭐였고, 몇 번 시도했는지"라는 뜻입니다.

당신의 역할 전부는 세 동작입니다: 실행 전에 기준 목록을 읽고 "그래, 그게 완성이 맞아"라고 답하기 · *"이 단계는 되돌릴 수 없는데 진행할까요?"*라고 물으면 답하기 · 끝에서 신호등 읽기.

당신이 절대 만질 일 없는 것들: `graph.json`(에이전트가 씀), 명령어(에이전트가 침), 임계값(에이전트가 제안 — 당신은 그게 당신이 생각하는 '완성'과 맞는지만 답하면 됩니다).

### Claude만이 아닙니다

하네스에 Claude 전용은 없습니다 — 도구는 평범한 Node CLI이고, API 키도 벤더 호출도 없습니다. 셸 명령을 돌릴 수 있는 에이전트라면 어디든 절차를 가리키면 됩니다:

```text
Clone https://github.com/Evanciel/avalon, read SKILL.md, and follow its
procedure for this task: <your task here>
```

어느 에이전트든 같은 대접을 받습니다: 검증기가 그래프 초안에 거부권을 행사하고, 러너가 지름길을 거부하고, 컴파일된 `completed` 플래그는 에이전트의 의견을 무시합니다. AI가 아예 없어도 러너 CLI는 그대로 작동합니다 — 사람을 위한 규율 잡힌 체크리스트로.

## 실행은 이렇게 보입니다

<img src="https://raw.githubusercontent.com/Evanciel/avalon/main/images/where-it-sits.svg" alt="당신이 에이전트에게 한 줄 목표를 주면 에이전트가 저장소에서 일하고, '다 됐어요'는 아발론의 게이트를 지나야만 당신에게 도착한다" width="100%" />

아발론은 AI 에이전트를 대체하지 않습니다 — 에이전트의 "다 됐어요"와 당신의 신뢰 사이에 앉습니다. 일은 여전히 에이전트가 전부 하고, 그 주장이 당신에게 오는 길에 게이트를 지나야 할 뿐입니다.

당신이 친 한 줄에서, 추가 지시 없이:

<img src="https://raw.githubusercontent.com/Evanciel/avalon/main/images/session-flow.svg" alt="실제 세션: 당신의 한 줄에서 에이전트가 실측하고 설계하고, 도구가 판정하고, 미달 게이트는 루프백하고, 비가역 단계에서 승인을 요청하고, 최종 보고에 completed true와 빈 abandoned가 실린다" width="100%" />

1. 에이전트가 `scaffold`를 돌리고 그래프 초안을 그린 뒤, 뭘 하기 전에 네 숫자부터 보여줍니다.
2. 노드를 하나씩 돌며 측정값을 제출하고, 도구가 통과/미달을 답합니다.
3. 비가역 노드에서 멈춰서 당신에게 묻습니다 — 이 정지는 예의가 아니라 산출물에 컴파일된 것입니다.
4. 마지막 메시지에 `completed`와 `abandoned[]` 증거 목록이 실립니다 — 에이전트가 조작할 수 없는 두 칸.

실수까지 포함된 실제 세션이 보고 싶다면? 아래 [튜토리얼](#튜토리얼-실제로-한-번-돌려보기)이 한 세션을 그대로 재생합니다.

## 보장

| 약속 | 지키는 방법 |
|---|---|
| 거짓 성공은 불가능하다 | 게이트를 건너뛴 실행은 자신을 성공이라고 보고할 방법이 없습니다 — 컴파일 산출물을 실제로 실행해 보는 테스트가 증명합니다 |
| 포기는 증거를 남긴다 | 시도 횟수와 실측값이 기록됩니다. "이 정도면 됐지"는 없습니다 |
| 판정은 흔들리지 않는다 | 판정 도구는 LLM을 부르지 않습니다. 같은 그래프면 같은 판정 — 기분도 설득도 안 통합니다 |
| 검사 자체가 감사받는다 | 기계가 강제하는 모든 검사는 자기가 실패할 *수 있음*을 증명해야 합니다 — 일부러 고장난 입력에 겨눠 빨개지지 않으면 설치가 거부됩니다 |
| 기록은 조용히 고쳐 쓸 수 없다 | 모든 측정은 바로 앞 측정과 해시로 사슬지어 있습니다. 과거 줄을 수정·삭제·재배열하면 사람이 볼 때까지 모든 명령이 거부합니다 |

### 포기는 성공이 아니다

<img src="https://raw.githubusercontent.com/Evanciel/avalon/main/images/abandon.svg" alt="재시도를 소진한 게이트는 증거를 abandoned[]에 남기고, 그 목록이 비어 있지 않는 한 최종 completed 플래그는 강제로 false다" width="100%" />

게이트가 `on_exhaust: partial`로 재시도를 소진하면 워크플로는 전진합니다 — 하지만 `{gate, node, field, op, threshold, measured, attempts}`를 `abandoned[]` 목록에 기록하고, 그 목록이 비어 있지 않는 한 최종 `completed` 플래그는 **강제로 false**가 됩니다. 게이트를 건너뛴 실행은 자신을 성공이라고 보고할 수 없습니다. 실행 의미론 테스트가 컴파일 산출물을 실제로 돌려서 이걸 고정합니다.

### 명세는 설치가 아니다

<img src="https://raw.githubusercontent.com/Evanciel/avalon/main/images/stop-hook.svg" alt="에이전트가 턴을 끝내려 하면 hooks-gate가 모든 check를 돌린다: 전부 초록이면 턴이 끝나고, 하나라도 빨간색이면 exit 2로 차단되어 미달 게이트가 모델에게 되먹임된다" width="100%" />

컴파일러는 `build/hooks.json` — 게이트별 check 명령과 exit 코드 계약 — 을 내고, 의도적으로 거기서 멈춥니다. 설치는 별도의 사람 승인을 거치는 별도 도구의 일입니다; 일단 설치되면, 게이트가 빨간 동안 세션은 말 그대로 턴을 끝낼 수 없습니다. 자동 설치는 여전히 금지입니다: 자기를 세션의 강제 계층에 조용히 심는 도구야말로, 이 프로젝트가 막으려고 존재하는 종류의 설명 불가능한 마법이기 때문입니다. 설치 전까지 명세는 아무것도 차단하지 않습니다 — 그리고 완료 보고서는 이 사실을 그 문장 그대로 쓰도록 요구됩니다.

### 모든 검사는 실패할 수 있음을 증명해야 한다

빨개질 수 *없는* 검사가 주는 초록 체크는 강제가 아니라 장식입니다. 그래서 훅 항목에는 `probe`를 선언할 수 있습니다 — 같은 오라클을 일부러 고장난 입력에 겨눈 것으로, 거기서는 **반드시** exit가 0이 아니어야 합니다. 설치자는 뭔가를 설치하기 전에 선언된 프로브를 전부 돌립니다. exit 0으로 끝난 프로브는 방금 "실패할 수 없는 검사"를 시연한 것이고, 그 설치는 거부됩니다:

```text
$ node tools/install-hooks.mjs graph.json build/hooks.json --yes
installer refused: probe refuted nothing — these checks cannot fail (or the probe never finished), so they enforce nothing:
  G1: probe exit 0 ← node -e "process.exit(0)"
```

(설치자 거부: 프로브가 아무것도 반증하지 못했다 — 이 검사들은 실패할 수 없으므로 아무것도 강제하지 않는다.)

건강한 계획은 게이트마다 반증 증거를 출력합니다:

```text
  probe   G0  exit 1 ✅ (the oracle can fail)
  probe   G0b  exit 1 ✅ (the oracle can fail)
  probe   G4c  exit 1 ✅ (the oracle can fail)
```

이 세 줄은 이 저장소 자신의 게이트에서 나온 것입니다 — 각각 커밋된 고장 픽스처([tools/fixtures/](tools/fixtures/))에 겨눠져 있고, 그걸 거부해야만 합니다.

### 증거는 스스로를 방어한다

수락된 모든 측정은 덧붙이기 전용 원장에 남고, 원장은 **해시 체인**입니다: 각 줄이 바로 앞 줄의 해시를 지니고, 상태 파일이 체인 머리를 고정합니다. 아래는 기록된 측정값이 사후에 수정됐을 때 실제로 벌어진 일입니다 — `verify`만이 아니라 모든 명령이 거부합니다:

```text
$ node tools/run.mjs graph.json next
🔴 ledger chain broken — refusing every command:
  line 3: h mismatch — the line was edited
  the ledger is the evidence layer; a run on tampered evidence proves nothing.
  → inspect the ledger, archive it elsewhere, remove it, then re-init
```

(원장 체인이 끊어졌다 — 모든 명령을 거부한다: 3번째 줄 `h` 불일치, 그 줄이 수정되었다. 원장은 증거 계층이라, 변조된 증거 위의 실행은 아무것도 증명하지 않는다.)

체인이 사는 코드에도, 여기에도 정직하게 적어 둡니다: 이것은 변조 *증거(tamper-evident)*이지 변조 *불가(tamper-proof)*가 아닙니다 — [정직한 한계](#정직한-한계) 참조.

## 내부 구조

아래는 기계 장치가 궁금한 독자를 위한 것입니다. 그냥 쓰고 싶었던 거라면 이미 충분히 압니다 — 위의 세 단계가 사용 설명서의 전부입니다.

### 하네스에 뭐가 들어있나

| 구성 | 하는 일 |
|---|---|
| **그래프 (JSON IR)** | 계획 그 자체. 게이트는 `필드 + 연산자 + 숫자` — "잘 됐는지 확인" 같은 문장을 적을 칸이 아예 없습니다 |
| **검증기** | 필수 필드 전수 검사(G0) + 정적 검사 6종 + 서술형 게이트를 표현 단계에서 거부하는 스키마 |
| **컴파일러** | 그래프를 실행 가능한 멀티 에이전트 워크플로로 번역합니다. 게이트가 하나라도 번역에서 빠지면 거부합니다 (`gate_loss`) |
| **러너** | 실행 순서를 강제합니다. 차례가 아닌 노드는 시작 못 하고, 측정 없이는 완료 못 하고, 모든 측정은 덧붙이기 전용 원장에 남습니다 |
| **훅 명세 + 설치자** | 게이트를 세션 **바깥**에서도 강제할 수 있게 `build/hooks.json`을 산출하고, 승인 게이트를 거친 설치자가 프로젝트 settings에 Stop 훅으로 심습니다. 명령 없는 선언은 `hook_loss`로 잡힙니다 |
| **스캐폴드** | 대상 저장소를 실측해서 검증을 이미 통과하는 골격을 만듭니다 — 초록에서 시작해 초록을 유지합니다 |

### 4단 아키텍처

아발론은 4단으로 설계되어 있고, 이 저장소의 도구들이 그 구현입니다:

| 단 | 역할 | 구현 |
|---|---|---|
| **① FRONTEND** | 선언 — 저장소를 실측하고 IR을 쓴다 | `scaffold.mjs` + 당신의 판단, 거부권은 `validate.mjs` |
| **② BACKEND** | 컴파일 — 무손실 IR → 실행 코드, 아니면 거부 | `compile.mjs` (`gate_loss` · `hook_loss` · 승인 정지 · 훅 명세) |
| **③ DRIVER** | 집행 — 숫자 게이트 아래서 완료까지 구동 | `run.mjs`, 또는 오케스트레이션 호스트에서 도는 컴파일 산출물 |
| **④ ARCHIVE** | 축적 — 끝난 실행이 사례가 되어 설계로 되먹임 | **의도적 비활성** — 전제 조건(적대적 입력에 대한 위협 모델)이 갖춰질 때까지 꺼져 있습니다. 아직 안전하지 않은 단은 어설프게 반쯤 돌리는 게 아니라 비활성이라고 선언합니다 |

단 사이의 경계가 하중을 받는 부분입니다: 판단이 들어오는 곳은 ①뿐이고, ②는 무손실이거나 거부해야 하고, ③은 집행하되 판정하지 않고, ④는 아직 존재가 허용되지 않습니다. 경계마다 흉터가 최소 하나씩 있습니다([규칙이 어디서 왔는가](#규칙이-어디서-왔는가) 참조).

### 돌리는 세 가지 방법

**① 원샷, 스킬로 — 의도된 사용법.** 목표만 말하면 에이전트가 나머지를 합니다:

1. 대상 저장소에 `scaffold`를 돌려 실측합니다.
2. 일을 노드로 쪼개고 게이트를 씁니다. 여기가 판단 단계 — 초안은 에이전트가 쓰고, 거부권은 검증기가 쥡니다.
3. 스탬프 → 검증 → 컴파일로 [네 숫자](#네-숫자)를 초록으로 만듭니다.
4. 컴파일된 워크플로를 실행합니다: 노드마다 서브에이전트 하나, 인수인계마다 숫자 게이트, 그래프가 끝날 때까지.

완료까지 스스로 굴러가되, 예외 둘이 이 스킬의 존재 이유입니다: 비가역 단계는 멈춰서 사람 승인을 기다리고, 포기한 게이트는 `abandoned[]`에 남습니다 — 에이전트가 "이 정도면 됐지"를 조용히 결정할 수 없습니다.

**② 컴파일된 워크플로.** `compile.mjs`는 그래프를 에이전트 오케스트레이션 호스트용 워크플로 스크립트로 바꿉니다(노드당 `agent()` 호출 하나, 팬아웃은 `parallel()`). 중단 지점 재개와 비가역 노드 사전 승인을 지원합니다:

```
Workflow({ scriptPath: "build/graph.workflow.js",
           args: { resume_from, resume_state, resume_loops, approved: ["<node-id>"] } })
```

`policy.requires_approval: true`인 노드는 id가 `approved`에 없으면 **실행 전에 멈춥니다.** 기본값은 빈 집합 — 승인 게이트가 슬그머니 무력화되지 않도록 회귀 테스트가 고정하고 있습니다.

**③ 러너 CLI — 수동 또는 에이전트 직접 구동.** 세션이 서브에이전트를 띄우지 않고 노드를 직접 도는 경우:

```bash
node tools/run.mjs graph.json init            # create state (after editing the graph: init --force)
node tools/run.mjs graph.json next            # what can be worked on right now
node tools/run.mjs graph.json status          # whole picture, including gates that never ran
node tools/run.mjs graph.json start <node>    # refused if the node isn't in the frontier
node tools/run.mjs graph.json measure <field> <value> [note]
node tools/run.mjs graph.json done <node>     # the tool decides pass/fail, not you
node tools/run.mjs graph.json verify          # ledger hash-chain check (tamper / truncation)
node tools/run.mjs graph.json abort           # cancel the active node
node tools/run.mjs graph.json lint            # OR-trap check (2+ gates on one node)
```

모든 명령에 기계용 출력 `--json`이 있습니다. 러너는 사실상 "안 되는 일 목록"이고, 네 가지 불변식(INV-1~4, [run.mjs](tools/run.mjs))에서 나옵니다:

| 이렇게 하면 | 러너의 답 |
|---|---|
| 순서가 아닌 노드를 `start` | 거부 — 대신 지금 시작할 수 있는 노드를 알려준다 |
| 이번 방문의 측정 없이 `done` | 거부 — 옛 측정값은 이월되지 않아서, 낡은 초록으로 재시도를 통과할 수 없다 |
| 그래프에 선언 안 된 필드를 `measure` | 거부 — 선언 없는 필드를 재는 건 절차를 갖춘 추측일 뿐이다 |
| `init` 후에 그래프를 고치고 계속 진행 | **STALE** 표시 — 상태는 자기가 어느 그래프 해시에서 태어났는지 기억한다 |
| 게이트를 `max_retry`보다 많이 실패 | **중단** — 실행이 멈추고 결정이 사람에게 넘어간다 |

수락된 측정은 전부 원장에 덧붙습니다. 원장의 어떤 것도 고쳐 쓰이지 않습니다 — `init --force`조차 상태만 버리지 원장은 남깁니다. 그리고 원장은 스스로를 방어합니다: [증거는 스스로를 방어한다](#증거는-스스로를-방어한다) 참조.

도구 메시지는 기본이 영어입니다. 시스템 로케일이 한국어이거나 `AVALON_LANG=ko`를 주면 한국어로 나옵니다. 빌드 산출물은 항상 영어입니다 — 바이트가 해시되므로 환경에 따라 달라지면 안 되기 때문입니다.

### 튜토리얼: 실제로 한 번 돌려보기

아래는 전부 실제로 일어난 일입니다 — 명령과 출력은 라이브 세션에서 그대로 가져왔고, 실수까지 포함입니다. (원래 세션은 한국어 도구 메시지로 캡처되었습니다 — 도구 기본값은 이제 영어이고 `AVALON_LANG=ko`로 한국어가 됩니다. 아래에는 영어판 출력을 싣고, 필요한 곳에 한국어 풀이를 달았습니다.)

작은 Node 프로젝트 `my-api`가 있고, 에이전트에게 검색 엔드포인트를 추가하고 테스트를 통과시키게 하고 싶다고 합시다.

**1. 스캐폴드.** 저장소와 과제 한 줄을 주면:

```bash
node tools/scaffold.mjs ../my-api "add a search API and make the tests pass" ../my-api/graph.json
```

이미 검증을 통과하는 3노드 골격(`survey → check → review`)이 나옵니다. 스택·규모는 실측되어 있고 해시 두 개가 찍혀 있습니다.

**2. 설계.** 자리표시자를 진짜 계획으로 바꿉니다 — 노드 3개, 게이트 1개:

```jsonc
"state": [{ "field": "tests_failed", "type": "int", "unit": "count" }],
"gates": [{
  "id": "G1", "field": "tests_failed", "op": "==", "threshold": 0,
  "on_fail": { "goto": "implement", "max_retry": 2 },
  "ground_truth": "measured",
  "threshold_source": "the whole suite must pass — partial passing is not a ship criterion"
}],
"edges": [
  { "from": "implement", "to": "test", "when": "always"       },
  { "from": "test", "to": "implement", "when": "gate:G1:fail" },
  { "from": "test", "to": "ship",      "when": "gate:G1:pass" }
]
```

**3. 스탬프와 검증.** 이 튜토리얼을 쓰면서 실제로 실수를 했습니다 — 노드 이름을 바꾸고 `graph.entry`를 깜빡했죠. 검증기가 뭐든 돌기 전에 잡았습니다:

```
$ node tools/validate.mjs graph.json
  FAIL  reachability
         ↳ graph.entry 'survey': no such node
  static_checks_passed  5/6      G4c FAIL
```

(도달 가능성 검사 실패 — `graph.entry 'survey'`: 그런 노드 없음.) entry를 고치고 재스탬프(`hash.mjs --write`), 재검증 → `6/6`, 커버리지 `1.00`.

**4. 컴파일.**

```
$ node tools/compile.mjs graph.json build/graph.workflow.js
  gate_loss  0      PASS
  hook_loss  0      PASS
  compiled → build/graph.workflow.js
  hooks    → build/hooks.json
```

**5. 집행.** 러너 세션, 출력 원문 그대로 (주석만 추가):

```
$ run.mjs graph.json init
$ run.mjs graph.json start ship          # trying to skip ahead
🔴 not in the frontier: ship — you can start: implement

$ run.mjs graph.json start implement     # ok — do the actual work here
$ run.mjs graph.json done implement      # opens: test

$ run.mjs graph.json start test
$ run.mjs graph.json done test           # forgot to measure
🔴 cannot judge the gate — no measurement this visit:
   G1: tests_failed was never measured

$ run.mjs graph.json measure tests_failed 3 "npm test: 3 failing"
$ run.mjs graph.json done test
🔴 G1: tests_failed=3 == 0 → fail        # loops back to implement (attempt 1/2)

# ...fix the code, come back through implement → test...
$ run.mjs graph.json measure tests_failed 0 "npm test: all green"
$ run.mjs graph.json done test
🟢 G1: tests_failed=0 == 0 → pass

$ run.mjs graph.json status
  ▶ ship  (human/manual)  ⏸ waiting for a person   # irreversible → a human takes the exit
```

(순서를 건너뛴 `start`는 거부되고 지금 할 수 있는 노드를 알려줍니다 · 측정 없는 `done`은 판정 불가로 거부 · `tests_failed=3`은 fail이라 `implement`로 루프백 · `0`이 되자 pass · 비가역 `ship`은 사람 대기.)

일어나지 않은 일에 주목하세요: 아무도 에이전트에게 "다 됐어?"라고 묻지 않았습니다. 3을 보고하니 도구가 fail이라 했고, 0을 보고하니 pass라 했습니다.

**6. 세션 바깥에서도 강제하기 (선택).** 컴파일 단계가 이미 `build/hooks.json`을 냈습니다. 설치하면 게이트가 세션의 Stop 훅에 연결되는데 — 설치자는 명시적 승인 없이는 움직이지 않습니다:

```
$ node tools/install-hooks.mjs graph.json build/hooks.json
Install plan (nothing written yet):
  target  .claude/settings.json
  hook    Stop → node tools/hooks-gate.mjs graph.json build/hooks.json
  gates   G1
approval required — after user confirmation: same command with --yes    (exit 3)
```

(설치 계획만 보여주고 아직 아무것도 쓰지 않은 상태 — 사용자 확인 후 같은 명령에 `--yes`를 붙여야 설치됩니다.)

`--yes`로 설치하면 그때부터 게이트가 빨간 동안 세션이 턴을 끝낼 수 없습니다(`hooks-gate.mjs`가 exit 2로 차단). 설치 후 그래프가 바뀌면 게이트는 STALE을 보고하고, 낡은 규칙으로 통과시키는 대신 차단합니다 — 재컴파일 → 재설치가 해소 경로입니다. 제거는 언제든 `--uninstall --yes`.

### 그래프 포맷

정본은 JSON 파일 하나입니다. 구성 요소:

**노드** — 할 일. `kind`는 `work` · `human` · `join` (v1.1에 있던 `gate` 노드는 폐기 — 게이트는 이제 엣지의 소관입니다). 노드마다 `budget`과 `retry.max`가 있고, 비가역 단계에는 `policy.requires_approval: true`를 답니다 — 컴파일러가 이걸 실제 정지로 바꿉니다.

**엣지** — 순서. `when`은 `always` 아니면 `gate:<id>:pass` / `gate:<id>:fail`. 어휘는 이게 전부고, "가끔"은 없습니다.

**게이트** — 통과 조건. JSON 객체 하나, 자유 서술 칸 없음, 후하게 해석할 여지 없음:

```jsonc
{
  "id": "G1",
  "field": "tests_failed",          // must be declared in state[] — unknown fields are rejected
  "op": "==",                        // one of  ==  >=  <=  >  <
  "threshold": 0,
  "on_fail": { "goto": "fix", "max_retry": 2 },
  "ground_truth": "measured",        // measured | reported | human | assumed
  "threshold_source": "why this number — forces you to justify it once, in writing"
}
```

(주석 풀이: `field`는 `state[]`에 선언된 필드만 — 모르는 필드는 거부 · `op`는 다섯 연산자 중 하나 · `threshold_source`는 "왜 이 숫자인가"를 글로 한 번은 적게 만드는 칸.)

`max_retry: 0`은 *중단*이 아니라 *분기*입니다 — "실패하면 재시도 없이 그 길로 간다"(축소 출시 경로, NO-GO 리포트). 단, 재시도 0짜리 분기가 이미 끝난 노드로 되돌아가면 예산 없는 루프라서 러너가 멈춥니다.

`done`을 치면 도구가 `tests_failed`의 최신 측정값을 읽고 `== 0`을 적용해서 통과/미달을 답합니다. 임계값 논쟁은 실행 전에. 실행 중에 판정에 따질 방법은 없습니다.

**상태(state)** — 선언된 측정 필드 목록으로, 각각 타입이 있습니다: `int` · `ratio` · `bool` · `enum` · `ref` · `text`. 게이트를 걸 수 있는 건 `int`/`ratio`/`bool`뿐 — 산문에는 임계값을 걸 수 없으니 `enum`/`ref`/`text`는 먼저 카운터로 파생시켜야 합니다. 단위 실수도 스키마가 잡습니다. `ratio`(0~1) 필드에 퍼센트 임계값 90을 주면 영원히 통과 못 하는 게이트가 되는데, 실제로 있었던 버그입니다.

**지문(fingerprint)** — 대상 저장소의 실측 사실(스택, 규모, 표식). `scaffold`가 채우며, 추측은 금지입니다. 규모는 구간(`100-299` 파일)으로 적습니다 — 정확한 수는 내일이면 틀리지만 구간은 오래 맞습니다.

**호스트(host)** — 강제가 사는 곳: `state_file`(러너 상태 위치), `enforced_by_hook`(기계 강제할 게이트, 각각 `{ "gate": "G0", "check": "node tools/validate.mjs graph.json" }` 형태 — 명령 없는 선언이 바로 `hook_loss`가 세는 것), `produces`.

**스펙 해시** — `hash.mjs`가 그래프의 canonical 형태(키 순서 무관, 배열 순서 보존)에 sha256을 찍습니다. 모든 하위 산출물이 이 해시를 지니고, 그래서 러너가 실행 중 바뀐 그래프를 감지하고(STALE) 훅이 정확히 어느 그래프를 강제하는지 대조됩니다.

**스키마 버저닝** — `spec.version`이 검증 어휘를 고릅니다. 옛 v1.1 그래프는 v1.1 규칙으로 검증됩니다(회귀 측정의 정본이라 거부하면 기준선이 사라집니다). 하지만 v1.1은 *실행 불가*로 표시됩니다 — "어느 저장소에서 무엇을"을 적을 자리가 없어서 컴파일러가 거부합니다. 검증 통과와 실행해도 안전함은 다른 주장이고, 도구는 이 둘을 섞지 않습니다.

### 네 숫자

**뭐든 돌기 전에 네 숫자가 전부 초록이어야 합니다:**

| | 통과 조건 | 뜻 |
|---|---|---|
| `ir_field_coverage` | 1.00 | 필수 13필드가 다 찼다 |
| `static_checks_passed` | 6/6 | 그래프 구조에 문제가 없다 |
| `gate_loss` | 0 | 선언한 게이트가 컴파일된 코드에 전부 실렸다 |
| `hook_loss` | 0 | 선언한 훅마다 실제 명령이 붙어 있다 |

loss가 0이 아니라는 건 "선언만 있고 강제하는 게 없다"는 뜻입니다. 그런 그래프는 장식이고, 도구가 0 아닌 exit 코드로 그렇게 말해줍니다.

### 도구 하나하나

독립 파일들이고, 상호 의존은 import뿐이며, 어느 것도 LLM을 부르지 않습니다(INV-1). 결정적이라는 말은 문자 그대로입니다: 같은 입력이면 같은 바이트가 나옵니다.

**`scaffold.mjs` — 추측 말고 실측.** 대상 저장소를 걷고(`node_modules` · `.git` · 빌드 산출물은 건너뛰고, 5만 파일을 걷는 일이 없게 상한 존재), 스택을 감지하고, 규모를 구간화하고, 해시를 찍고, **이미 검증을 통과하는** 그래프 골격을 냅니다. 노드는 자리표시자입니다 — 그 부분이 판단이고, 당신 몫입니다. 하지만 비싼 보일러플레이트(필수 13필드, 해시, retry/policy 기본값, 필수 human 노드 1개)는 기계가 채웁니다. 초록에서 시작해 초록을 유지하는 쪽이, 빨강에서 시작해 초록을 바라는 것보다 낫습니다.

**`hash.mjs` — canonical JSON + sha256.** 정규화(키 순서 무관, 배열 순서 보존 — 순서엔 의미가 있으니까)하고, 해시하고, 해시 필드 자신은 제외한 채 `sha256:<64hex>`를 그래프에 찍습니다. 멱등입니다 — 세 번 돌려도 결과가 같습니다. STALE 감지와 훅 대조가 전부 이 스탬프에 걸려 있습니다.

**`validate.mjs` — G0 + 검사 6종 + 고집 있는 스키마.**

- **G0**: 필수 13필드 전수. 부분 충족은 의미가 없어서 기준이 1.00입니다.
- **정적 검사 6종**: 게이트는 선언된 상태 필드만 참조 · 비가역 노드에 승인 존재 · 모든 노드 도달 가능 · 모든 순환에 상한 존재(종료성) · 모든 노드에 예산 · 모든 엣지가 실존 노드를 가리키고 `when` 형식이 올바름.
- **스키마 수준 거부** (검사가 돌기도 전에): 서술형 게이트 — `필드/연산자/임계값` 대신 산문을 쓴 게이트는 표현 자체가 안 됨 · 모르는 연산자 · 게이트 불가 타입에 게이트 · boolean 임계값 · `host.enforced_by_hook`의 유령 게이트 참조 · 새 그래프에 폐기된 어휘.
- **품질 경고** (비치명): `scope`/`host` 누락, check 명령 없는 훅 선언.

**`render.mjs` — 마크다운은 산출물이다.** JSON을 읽기 좋은 마크다운으로 결정적으로 렌더합니다. `--check`는 다시 렌더해서 커밋된 `graph.md`와 **바이트 단위**(sha256)로 대조합니다 — 이게 G0b 게이트입니다. 누가 마크다운을 손으로 고치면 검사가 터집니다. 문서가 계획에서 어긋날 수 없습니다. 문서가 곧 계획의 렌더이기 때문입니다.

**`compile.mjs` — 무손실 번역, 아니면 번역 거부.** IR에서 워크플로 스크립트로 가는 순수 함수입니다. 내부에서 비결정성은 금지 — `Date` 없음, `Math.random` 없음, 객체 키 순회 순서 의존 없음. 방출하는 것:

- 노드당 서브에이전트 호출 하나, 모든 프롬프트에 **공유 컨텍스트 블록**(지문·target·task) 주입 — 실측 사실이 일과 함께 이동합니다;
- `always` 엣지가 여럿인 노드는 **병렬 팬아웃**, 갈래들은 단일 join에서 합류;
- 휴먼 노드 게이트 보존 (사람이 재는 `design_approved`도 게이트지, 주석이 아닙니다);
- `requires_approval` 노드의 **승인 정지**, `approved` 인자 존중 (기본값: 아무도 승인 안 됨);
- **재개** 지원 (`resume_from` · `resume_state` · `resume_loops`);
- **ABANDONED 원장** ([위 참조](#포기는-성공이-아니다));
- `build/hooks.json` — 훅 강제 게이트마다 한 항목: `{ gate, field, op, threshold, check, expect_exit: 0 }`, 스펙 해시로 그래프와 결합.

그리고 자기 자신을 감사합니다: IR의 모든 게이트가 산출물에 있어야 하고(`gate_loss`), 선언된 모든 훅이 명령과 함께 `hooks.json`에 있어야 합니다(`hook_loss`). 어디든 loss가 있으면 → exit 비영, 산출물 신뢰 금지.

**`run.mjs` — 집행자.** 프론티어 규율, 측정 원장, 게이트 판정, STALE 감지, 중단 시 사람 이관. 위 [돌리는 세 가지 방법](#돌리는-세-가지-방법)에서 설명했습니다; 파일 머리의 불변식 4개가 계약이고, 자기시험은 그 각각이 실제로 무는지 증명하려고 존재합니다. 원장 해시 체인 — 그리고 변조 앞에서 그것이 내는 거부 — 은 [증거는 스스로를 방어한다](#증거는-스스로를-방어한다)에 있습니다.

**`install-hooks.mjs` + `hooks-gate.mjs` — 세션을 넘어서는 강제.** 설치자는 `build/hooks.json`을 **프로젝트의** `.claude/settings.json`에 Stop 훅으로 심습니다. 핵심은 설치자가 지키는 경계입니다: `--yes` 없이는 아무것도 쓰지 않고(계획만 보여주고 exit 3 — 에이전트가 사용자 승인 없이 `--yes`를 붙이는 건 금지), 전역 `~/.claude` settings는 `--yes`여도 거부하고, 해시가 현재 그래프와 안 맞는 명세를 거부하고, 남의 훅 항목은 보존하고, 재설치는 멱등입니다. `--uninstall --yes`로 언제든 뺄 수 있습니다.

그리고 **승인받은 것 자체를 박제합니다**: 승인 시점 `build/hooks.json`의 바이트 해시가 설치되는 명령에 그대로 박힙니다(`--approved sha256:…`). 이후 파일이 어떤 식으로든 바뀌면 게이트는 **check 하나 실행하기 전에** TAMPERED로 차단합니다 — 이게 없으면 JSON 파일 하나에 대한 쓰기 권한이 곧 매 턴 끝마다 임의 명령을 자동 실행시킬 권한이 됩니다. 되돌리는 길은 재승인(`--yes` 재설치)뿐입니다.

그리고 [모든 검사는 실패할 수 있음을 증명해야 한다](#모든-검사는-실패할-수-있음을-증명해야-한다)에서 본 반증 증거를 요구합니다. 프로브 없는 훅도 설치는 됩니다(미증명으로 보고될 뿐 — 소급 파괴는 없습니다). 그리고 `--status`는 언제든 읽기 전용 진단을 줍니다: 설치 여부, 승인 박제가 온전한지 TAMPERED인지, 명세가 최신인지 STALE인지 — check는 하나도 실행하지 않으면서.

설치되면 `hooks-gate.mjs`가 세션이 턴을 끝내려 할 때마다 선언된 check를 전부 돌립니다: 전부 통과 → exit 0, 하나라도 미달 → exit 2로 종료를 차단하고 미달 게이트를 모델에게 되먹입니다. 그래프가 바뀌면 STALE을 보고하고 차단합니다 — 어제의 규칙을 조용히 강제하는 것보다는 멈추는 게 낫습니다.

### 규칙이 어디서 왔는가

이 규칙들은 화이트보드에서 설계된 게 아닙니다. 전부 실제로 빠져나간 버그에서 나왔고, 같은 *종류*가 반복되면 번호를 붙여서 셉니다:

| # | 무슨 일이 있었나 | 지금은 뭐가 막나 |
|---|---|---|
| 1 | 절대 실패할 수 없는 검사가 있었다 — 다른 검사가 이미 강제하는 조건을 또 물었다 | 루프를 실제로 끊는 조건으로 검사를 다시 씀 |
| 2 | 프로젝트 지문을 측정해서 IR에 저장까지 해놓고, 프롬프트에는 한 글자도 안 실었다 | 공유 컨텍스트 블록 + 회귀 테스트 |
| 3 | "어느 저장소에서 무슨 일을"을 적을 칸이 IR에 없었다 — 컴파일된 에이전트가 눈 감고 시작했다 | `target`·`task` 필수화, 없으면 컴파일 거부 |
| 4 | `requires_approval`이 검증을 통과한 뒤 컴파일러가 조용히 버렸다 — 비가역 `git push`가 정지 없이 컴파일됐다 | 승인 게이트를 코드에 방출 + 회귀 테스트 |
| 5 | 훅 강제가 IR에 선언되고 검사도 전부 초록이었는데, 훅 파일이 존재한 적이 없었다 | 선언에 실행 가능한 명령을 필수로 붙임, 그 간극을 `hook_loss`가 셈 |

공통 패턴은 하나입니다: **선언은 검증받고, 그다음 버려진다.** loss 지표는 이 종류의 버그를 그냥 지나칠 수 없게 만들려고 존재합니다.

### 설계의 종이 흔적

[docs/graph/](docs/graph/)에 설계 이력 전체가 있습니다 — 1,300줄이 넘고, 마케팅은 한 줄도 없습니다:

- **[avalon-graph.md](docs/graph/avalon-graph.md)** — v4 명세: 판마다 근거를 명시한 버전 이력, 4단 구조, 게이트 명부(활성 9개, 그리고 측정 절차가 아직 정의 안 돼서 명시적으로 *보류*인 2개 — 절차 없는 게이트는 게이트가 아니므로, 있는 척하지 않고 주차해 둡니다), 게이트 설계에서 의도적으로 제거한 것들, 그리고 숨은 전제를 소리 내어 적어둔 목록.
- **[ir-schema.md](docs/graph/ir-schema.md)** — 기계 판독 IR 명세: 지문(고정 표식 12종, 실측만), `target`/`task`, 스키마 버저닝, 상태 화이트리스트, 정적 검사 6종, 마크다운이 JSON에서 렌더되는 이유, 그리고 아발론 자신의 그래프를 작업 예제로 — 자기적용에서 드러난 것 섹션 포함.
- **[phase0-findings-v2.md](docs/graph/phase0-findings-v2.md)** — 홍보 문구를 죽인 조사: "업계 표준 5단"이라는 틀은 존재하지 않는 것으로 판명 · "자동 설계" 차별점은 상용·학술 선행 사례와 대조해 반증되어 폐기 · 그리고 반례를 못 찾은 주장조차 *여전히* 대외 주장으로 쓰지 않습니다 — 반례의 부재는 증명이 아니니까.

이 마지막 습관이 이 디렉터리 전체의 요점입니다: 문서는 아발론이 무엇인지만이 아니라, 무엇이 될 뻔했고 그게 왜 틀렸는지까지 기록합니다.

### 아발론은 아발론 위에서 돈다

저장소 루트의 [graph.json](graph.json)은 예제가 아닙니다 — 아발론 자신의 개발을 아발론이 관리하는 그래프입니다. 노드 7개(`frontend → validate → render_check → backend → compile_check → human_go → install_hooks`), 선언된 상태 필드 6개, 그리고 게이트 3개(G0 · G0b · G4c)가 `host.enforced_by_hook`으로 기계 강제됩니다 — 각각 실제로 검사하는 명령이 붙어 있고, 그 명령이 실패할 수 있음을 증명하는 프로브(커밋된 고장 픽스처를 겨눈)가 함께 달려 있습니다. [graph.md](graph.md)는 그 렌더이고, G0b가 바이트 단위로 검증합니다.

그래프의 `guarantees` 블록은 정직한 한계 목록의 기계 인접 형태입니다: `provides`는 초록 실행이 정확히 무엇을 증명하는지, `excludes`는 무엇을 증명하지 않는지 적습니다. 이 저장소 자신의 게이트가 빨개지면 CI가 실패합니다.

## 테스트 방법

`npm test` 하나로 도는 세 스위트, 합계 158건:

- **[test.mjs](tools/test.mjs) (93건)** — 스키마와 컴파일러 동작, 그리고 **실행 의미론**: 컴파일된 워크플로 산출물을 스텁 호스트에서 실제로 실행합니다. "abandoned가 비어 있지 않으면 completed는 false" 같은 주장이 단언이 아니라 시연됩니다. 여기 새로 실린 것이 **지문 변별력**입니다 — 같은 저장소를 두 번 스캐폴드하면 바이트까지 같은 지문이 나와야 하고, 다른 저장소 둘에서는 달라야 합니다. 실제 scaffold 실행으로 실측하며, 지문의 변별력은 이 테스트들 전까지 *미검증* 주장이었습니다. 배포 동기화 게이트는 런타임 파일 9개를 설치된 스킬 사본과 바이트 대조해서, 저장소와 배포본이 조용히 어긋나는 걸 막습니다.
- **[run.selftest.mjs](tools/run.selftest.mjs) (41건)** — 러너의 거부 방어벽을, 방어벽의 존재를 증명하는 유일한 방법으로 테스트합니다: *가드를 지우면 스위트가 빨개져야 한다.* 각 테스트는 금지된 상황(프론티어 밖 start, 측정 없는 done, 그래프 고치고 계속)을 구성하고, 러너가 거부해야만 통과합니다. 원장 체인 테스트는 진짜 원장을 공격합니다 — 과거 측정을 수정하고, 꼬리를 절단하고, 체인을 우회해 덧붙입니다 — 그리고 모든 명령이 거부해야만 통과합니다.
- **[install.selftest.mjs](tools/install.selftest.mjs) (24건)** — 설치자의 경계를 같은 방법으로: `--yes` 없이 쓰기 금지, 전역 settings 거부, 낡은 명세 거부, 남의 훅 보존, 멱등 재설치, 그리고 게이트의 미달·STALE 차단(exit 2). 3건은 TOCTOU 공격 시나리오입니다: 승인 *뒤에* `build/hooks.json`을 바꿔치기합니다 — check를 악성 명령으로 교체하고, 그래프째 말이 되게 재생성까지 해봅니다 — 게이트가 **아무것도 실행하지 않고** 차단해야만 통과합니다(심어둔 명령이 안 돌았음을 마커 파일로 증명). 나머지는 프로브 방어벽(실패할 수 없는 오라클은 장식으로 보고 거부), `--status`가 쓰지 않고 읽기만 하는 것, 그리고 기본 언어가 실제로 영어라는 것을 고정합니다.

CI는 ubuntu와 windows에서 세 스위트를 전부 돌립니다. 줄바꿈은 [.gitattributes](.gitattributes)로 LF에 고정했습니다 — G0b가 바이트 단위 오라클이라, CRLF 체크아웃은 엄밀히 다른 문서이기 때문입니다.

## 저장소 지도

```
SKILL.md / SKILL.ko.md   skill entry point — procedure and discipline (en / ko)
graph.json / graph.md    the self-applied graph (JSON is canonical, md is rendered)
tools/
  scaffold.mjs           measure a repo → green skeleton
  hash.mjs               canonical JSON + sha256 stamping
  validate.mjs           G0 coverage + 6 static checks + schema versioning
  render.mjs             JSON → markdown (--check is a byte-exact oracle)
  compile.mjs            IR → workflow script + hooks.json (never calls an LLM)
  run.mjs                runner — frontier, hash-chained ledger, gate verdicts
  i18n.mjs               bilingual messages (en default, AVALON_LANG=ko) — artifacts stay English
  install-hooks.mjs      approval-gated hook installer (project settings only)
  hooks-gate.mjs         Stop-hook enforcer — red gate blocks ending the turn
  fixtures/              committed broken inputs — what the probes aim at
  test.mjs               schema / compiler / execution-semantics / fingerprint tests (93)
  run.selftest.mjs       runner self-test — "does removing a guard turn it red?" (41)
  install.selftest.mjs   installer/gate self-test — approval, probe, tamper walls (24)
docs/graph/              design history, IR spec, the scar records above
images/                  the diagrams in this README
```

## 정직한 한계

- 도구가 증명하는 건 **선언된 오라클**뿐입니다. check 명령이 게이트의 사람 언어 제목과 같은 뜻인지는 여전히 당신 몫입니다. `probe`가 이 간극을 좁히지만 — 오라클이 실패할 *수 있다*는 것까지는 증명합니다 — 닫지는 못합니다; 어떤 결정적 도구도 닫을 수 없습니다.
- `build/hooks.json`은 명세입니다. `install-hooks.mjs --yes`(사람 승인 단계)로 설치되기 전까지는 아무것도 차단하지 않습니다.
- 에이전트 노드가 런타임에 만드는 산출물은 컴파일 시점에 검증할 수 없습니다.
- 원장 체인은 변조 *증거(tamper-evident)*이지 변조 *불가(tamper-proof)*가 아닙니다: 수정·삭제·절단은 잡지만, 원장과 상태를 함께 고쳐 쓰는 자는 못 잡습니다. 그걸 잡을 외부 앵커는 ④ ARCHIVE의 몫이고, ④는 여전히 휴면입니다.
- 도구 메시지는 기본 영어입니다(`AVALON_LANG=ko`로 한국어). 코드 주석과 [docs/graph/](docs/graph/)의 설계 이력은 한국어입니다 — 추론은 기록되어 있고, 아직 번역이 안 됐을 뿐입니다.

전체 최신 목록은 자기적용 그래프의 `guarantees` 블록에 있습니다.

## 라이선스

[MIT](LICENSE)
