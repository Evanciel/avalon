<div align="center">

<img src="images/banner.svg" alt="Avalon — declare the graph, let the numbers judge" width="100%" />

**Graph engineering for AI agents — a complete harness, and loops that can't fool themselves.**<br/>
Pin the pass conditions as numbers before the work starts. Let tools, not the AI, do the judging.

[![CI](https://github.com/Evanciel/avalon/actions/workflows/test.yml/badge.svg)](https://github.com/Evanciel/avalon/actions/workflows/test.yml) ![tests](https://img.shields.io/badge/tests-124%20passing-brightgreen) ![deps](https://img.shields.io/badge/dependencies-0-blue) ![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**English** · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh.md)

</div>

## The problem

Give an AI agent a big task and at the end it says "done." The catch: the one saying it and the one checking it are the same AI. It's a student grading their own exam — gaps stay invisible.

It gets worse when you run agents in loops (overnight autonomous work, retry-until-green). Without a judging rule that lives outside the agent, the loop happily fools itself and keeps going.

Avalon flips the order. **Before** the work starts, you draw the plan as a graph: nodes are the work, edges are the order, and gates are pass conditions — **numbers only**. Then small tools do the judging. The tools never call an LLM, so the same graph always gets the same verdict.

<img src="images/who-judges.svg" alt="Without Avalon the agent writes its own grade. With Avalon the agent submits measurements and a deterministic tool gives the verdict." width="100%" />

The agent still does all the work — it just loses the right to grade itself.

## What's in the harness

| Piece | What it does |
|---|---|
| **Graph (JSON IR)** | The plan itself. A gate is `field + operator + number` — there is no place to write "check if it looks good" |
| **Validator** | 6 static checks: unreachable nodes, infinite loops, missing budgets, irreversible steps without approval, broken edges, out-of-whitelist gate fields |
| **Compiler** | Translates the graph into an executable workflow script. If even one gate would be lost in translation, it refuses (`gate_loss`) |
| **Runner** | Enforces the order at execution time. You can't start a node out of turn, can't finish one without measuring, and every measurement lands in an append-only ledger |
| **Hook spec** | Emits `build/hooks.json` so gates can be enforced from *outside* the session too. A declared hook without a real command is caught (`hook_loss`) |

## How a run flows

<img src="images/pipeline.svg" alt="1 scaffold measures the repo, 2 design is human judgment, 3 validate and compile check the four numbers, 4 run enforces order with an append-only ledger" width="100%" />

Two of the four steps are machines, one is you, and one is a machine watching you. Step 2 — deciding what the nodes and gates should be — is the only place judgment enters. Everything around it is deterministic, which is the point: your judgment gets recorded as numbers once, and after that no one gets to re-judge on vibes.

## Quick start

```bash
git clone https://github.com/Evanciel/avalon && cd avalon
npm test        # 124 tests, zero dependencies, Node 18+
```

```bash
# 1. Measure the target repo, generate a skeleton that already passes validation
node tools/scaffold.mjs <target-path> "one line describing the task" graph.json

# 2. Replace the TODOs with real nodes and gates (this part is judgment — yours)

# 3. Stamp → validate → compile
node tools/hash.mjs graph.json --write
node tools/validate.mjs graph.json
node tools/compile.mjs graph.json build/graph.workflow.js

# 4. Execute with the runner
node tools/run.mjs graph.json init
node tools/run.mjs graph.json next
node tools/run.mjs graph.json start <node>
node tools/run.mjs graph.json measure <field> <value>
node tools/run.mjs graph.json done <node>     # the tool decides pass/fail, not you
```

### What a gate looks like

A gate is one JSON object. There is no free-text field, so there is nothing to interpret generously:

```jsonc
{
  "id": "G1",
  "field": "tests_failed",          // must be declared in state[] — unknown fields are rejected
  "op": "==",
  "threshold": 0,
  "on_fail": { "goto": "fix", "max_retry": 2 },
  "ground_truth": "measured",
  "threshold_source": "why this number — forces you to justify it once, in writing"
}
```

When you run `done`, the tool reads the latest measurement of `tests_failed`, applies `== 0`, and answers pass or fail. You can argue with the threshold before the run. You can't argue with the verdict during it.

### What the runner refuses

The runner is mostly a list of things it won't let happen. These come from four invariants (INV-1 to INV-4 in [run.mjs](tools/run.mjs)):

| You try | The runner says |
|---|---|
| `start` a node that isn't next in the graph | Refused — and it lists what you *can* start right now |
| `done` without a fresh measurement this visit | Refused — old measurements don't carry over, so a stale green can't pass a retry |
| `measure` a field the graph never declared | Refused — measuring an undeclared field is guessing with extra steps |
| Edit the graph after `init` and keep going | Flagged **STALE** — the state remembers which graph hash it was built from |
| Fail a gate more times than `max_retry` | **Halted** — the run stops and hands the decision to a human |

Every accepted measurement is appended to `state.ledger.jsonl`. Nothing in the ledger is ever rewritten — even `init --force` keeps it.

**Four numbers must be green before anything runs:**

| | Pass when | Meaning |
|---|---|---|
| `ir_field_coverage` | 1.00 | every required field is filled |
| `static_checks_passed` | 6/6 | the graph is structurally sound |
| `gate_loss` | 0 | every declared gate made it into the compiled code |
| `hook_loss` | 0 | every declared hook has a real command behind it |

If a loss number isn't zero, you have a declaration that nothing enforces. That graph is decoration, and the tools say so with a non-zero exit.

## Where the rules came from

None of this was designed on a whiteboard. Every rule exists because a real bug slipped through, and when the same *kind* of bug repeats, it gets a number:

| # | What happened | What now prevents it |
|---|---|---|
| 1 | A static check that could never fail — it re-asked a condition another check already forced | Rewrote the check to test what actually breaks loops |
| 2 | The project fingerprint was measured, stored in the IR… and never put into a single prompt | Shared context block + regression test |
| 3 | The IR had no field for *which repo* or *what task* — compiled agents started blind | Required `target` and `task` fields; compiler refuses without them |
| 4 | `requires_approval` passed validation, then the compiler silently dropped it — an irreversible `git push` compiled with no stop | Approval gates are emitted into the code; regression-tested |
| 5 | Hook enforcement was declared in the IR, got green checks everywhere — but the hook file never existed | Declarations must carry a runnable command; `hook_loss` counts the gap |

The shared pattern: **a declaration gets validated, then discarded.** The loss metrics exist to make that class of bug impossible to miss.

## Giving up is not succeeding

<img src="images/abandon.svg" alt="A gate that exhausts retries records evidence in abandoned[] and the final completed flag is forced to false while that list is non-empty" width="100%" />

When a gate exhausts its retries with `on_exhaust: partial`, the workflow moves on — but it records `{gate, measured, threshold, attempts}` in an `abandoned[]` list, and the final `completed` flag is **forced to false** while that list is non-empty. A run that skipped a gate can't report itself as a success. Execution-semantics tests pin this down by actually running compiled output.

## Repository map

```
SKILL.md                 skill entry point — procedure and discipline
graph.json / graph.md    self-applied graph (JSON is canonical, md is rendered)
tools/
  scaffold.mjs           measure a repo → green skeleton
  hash.mjs               canonical JSON + sha256 stamping
  validate.mjs           6 static checks + schema versioning
  render.mjs             JSON → markdown (--check is a byte-exact oracle)
  compile.mjs            IR → workflow script + hooks.json (never calls an LLM)
  run.mjs                runner — frontier, measurement ledger, gate verdicts
  test.mjs               schema / compiler / execution-semantics tests (88)
  run.selftest.mjs       runner self-test — "does removing a guard turn it red?" (36)
docs/graph/              design history, IR spec, the scar records above
```

## Honest limits

- The tools prove the **declared oracle** only. Whether a check command means the same thing as its human-language title is still on you.
- `build/hooks.json` is a spec. Until installed (a separate, approval-gated step) it blocks nothing.
- Runtime artifacts produced by agent nodes can't be verified at compile time.

The full, current list lives in the `guarantees` block of the self-applied graph.

## License

[MIT](LICENSE)
