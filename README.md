<div align="center">

<img src="images/banner.svg" alt="Avalon — declare the graph, let the numbers judge" width="100%" />

**Graph engineering for AI agents — a complete harness, and loops that can't fool themselves.**<br/>
Pin the pass conditions as numbers before the work starts. Let tools, not the AI, do the judging.

[![npm](https://img.shields.io/npm/v/avalon-skill?color=cb3837&logo=npm)](https://www.npmjs.com/package/avalon-skill) [![CI](https://github.com/Evanciel/avalon/actions/workflows/test.yml/badge.svg)](https://github.com/Evanciel/avalon/actions/workflows/test.yml) ![tests](https://img.shields.io/badge/tests-158%20passing-brightgreen) ![deps](https://img.shields.io/badge/dependencies-0-blue) ![node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**English** · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh.md)

</div>

- [The problem](#the-problem)
- [Who this is for](#who-this-is-for)
- [What's in the harness](#whats-in-the-harness)
- [The four stages](#the-four-stages)
- [How a run flows](#how-a-run-flows)
- [Install](#install)
- [Three ways to run it](#three-ways-to-run-it)
- [What it looks like in practice](#what-it-looks-like-in-practice)
- [Tutorial: a real run](#tutorial-a-real-run)
- [The graph format](#the-graph-format)
- [Four numbers](#four-numbers)
- [The tools, one by one](#the-tools-one-by-one)
- [Where the rules came from](#where-the-rules-came-from)
- [The paper trail](#the-paper-trail)
- [Giving up is not succeeding](#giving-up-is-not-succeeding)
- [Hooks: a spec is not an installation](#hooks-a-spec-is-not-an-installation)
- [Avalon runs on Avalon](#avalon-runs-on-avalon)
- [How it's tested](#how-its-tested)
- [Repository map](#repository-map)
- [Honest limits](#honest-limits)

## The problem

Give an AI agent a big task and at the end it says "done." The catch: the one saying it and the one checking it are the same AI. It's a student grading their own exam — gaps stay invisible.

It gets worse when you run agents in loops (overnight autonomous work, retry-until-green). Without a judging rule that lives outside the agent, the loop happily fools itself and keeps going.

Avalon flips the order. **Before** the work starts, you draw the plan as a graph: nodes are the work, edges are the order, and gates are pass conditions — **numbers only**. Then small tools do the judging. The tools never call an LLM, so the same graph always gets the same verdict.

<img src="images/who-judges.svg" alt="Without Avalon the agent writes its own grade. With Avalon the agent submits measurements and a deterministic tool gives the verdict." width="100%" />

The agent still does all the work — it just loses the right to grade itself.

## Who this is for

- **You hand agents big work.** Four-plus files, several modules, steps that are hard to undo. The bigger the task, the bigger the gap a "done" can hide.
- **You run agents unattended.** Overnight loops, retry-until-green. Without a judge outside the agent, the loop fools itself until morning.
- **You've been burned by "done".** Once is enough. For everyone who stopped trusting success reports without evidence.

Not for one-or-two-file edits — if drawing the plan costs more than the work, that's the tail wagging the dog.

**What you get:**

| Promise | How it's kept |
|---|---|
| False success is impossible | A run that skipped a gate has no way to report itself as a success — and tests prove it by executing the compiled output |
| Giving up leaves evidence | Attempts and measured values are recorded; "close enough" is not a thing |
| Verdicts don't drift | The judging tools never call an LLM. Same graph, same verdict — no mood, no persuasion |

## What's in the harness

| Piece | What it does |
|---|---|
| **Graph (JSON IR)** | The plan itself. A gate is `field + operator + number` — there is no place to write "check if it looks good" |
| **Validator** | Required-field coverage (G0) + 6 static checks + a schema that rejects descriptive gates outright |
| **Compiler** | Translates the graph into an executable multi-agent workflow. If even one gate would be lost in translation, it refuses (`gate_loss`) |
| **Runner** | Enforces the order at execution time. You can't start a node out of turn, can't finish one without measuring, and every measurement lands in an append-only ledger |
| **Hook spec + installer** | Emits `build/hooks.json` so gates can be enforced from *outside* the session too — and an approval-gated installer wires it into project settings as a Stop hook. A declared hook without a real command is caught (`hook_loss`) |
| **Scaffold** | Measures the target repo and generates a skeleton that already passes validation — you start green and stay green |

## The four stages

Avalon is architected as four stages. The tools in this repo are their implementation:

| Stage | Role | Implemented by |
|---|---|---|
| **① FRONTEND** | Declare — measure the repo, write the IR | `scaffold.mjs` + your judgment, with `validate.mjs` holding veto power |
| **② BACKEND** | Compile — lossless IR → executable, or refuse | `compile.mjs` (`gate_loss`, `hook_loss`, approval stops, hooks spec) |
| **③ DRIVER** | Execute — drive to completion under numeric gates | `run.mjs`, or the compiled workflow on an agent-orchestration host |
| **④ ARCHIVE** | Accumulate — finished runs become cases that feed back into design | **dormant, deliberately** — it stays off until its precondition (a threat model for adversarial inputs) is met. A stage that isn't safe to run yet is declared dormant, not quietly half-run |

The stage boundaries are load-bearing: ① is the only place judgment enters, ② must be lossless or refuse, ③ may execute but never judge, and ④ isn't allowed to exist yet. Each boundary has at least one scar behind it (see [Where the rules came from](#where-the-rules-came-from)).

## How a run flows

<img src="images/pipeline.svg" alt="1 scaffold measures the repo, 2 design is human judgment, 3 validate and compile check the four numbers, 4 run enforces order with an append-only ledger" width="100%" />

Two of the four steps are machines, one is you, and one is a machine watching you. Step 2 — deciding what the nodes and gates should be — is the only place judgment enters. Everything around it is deterministic, which is the point: your judgment gets recorded as numbers once, and after that no one gets to re-judge on vibes.

## Install

```bash
git clone https://github.com/Evanciel/avalon && cd avalon
npm test        # 158 tests, zero dependencies, Node 18+
```

The toolchain is also on npm — `npm i avalon-skill` — if you want the tools without the skill; the skill itself installs by cloning into `~/.claude/skills` as above.

To use it as a **Claude Code skill**, clone it into your skills directory — [SKILL.md](SKILL.md) has the frontmatter (`name: avalon`) that registers it:

```bash
git clone https://github.com/Evanciel/avalon ~/.claude/skills/avalon
```

Then "run this under avalon" (or any similar phrasing) loads the whole procedure. No install step, no dependencies — the tools are six standalone `.mjs` files.

## Three ways to run it

### ① One-shot, as a skill — the intended way

You state the goal; the agent does the rest:

1. Runs `scaffold` against the target repo to measure it.
2. Splits the work into nodes and writes the gates. This is the judgment step — the agent drafts it, the validator holds veto power.
3. Gets the [four numbers](#four-numbers) green: stamp → validate → compile.
4. Executes the compiled workflow: one sub-agent per node, every hand-off through a numeric gate, until the graph is done.

It drives itself to completion, with two exceptions that are the whole point: irreversible steps stop and wait for human approval, and a gate it gave up on stays in `abandoned[]` — the agent can't quietly decide "close enough".

### ② The compiled workflow

`compile.mjs` turns the graph into a workflow script for an agent-orchestration host (one `agent()` call per node, `parallel()` for fan-out). It supports resuming a stopped run and pre-approving specific irreversible nodes:

```
Workflow({ scriptPath: "build/graph.workflow.js",
           args: { resume_from, resume_state, resume_loops, approved: ["<node-id>"] } })
```

A node with `policy.requires_approval: true` **stops before executing** unless its id is in `approved`. The default is the empty set — a regression test pins that, so the approval gate can't quietly become a no-op.

### ③ The runner CLI — manual or agent-driven

When a session works through nodes directly instead of spawning sub-agents:

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

Every command takes `--json` for machine-readable output. The runner is mostly a list of things it won't let happen — four invariants (INV-1 to INV-4 in [run.mjs](tools/run.mjs)):

| You try | The runner says |
|---|---|
| `start` a node that isn't next in the graph | Refused — and it lists what you *can* start right now |
| `done` without a fresh measurement this visit | Refused — old measurements don't carry over, so a stale green can't pass a retry |
| `measure` a field the graph never declared | Refused — measuring an undeclared field is guessing with extra steps |
| Edit the graph after `init` and keep going | Flagged **STALE** — the state remembers which graph hash it was built from |
| Fail a gate more times than `max_retry` | **Halted** — the run stops and hands the decision to a human |

Every accepted measurement is appended to the ledger. Nothing in it is ever rewritten — even `init --force` discards the state but keeps the ledger. And the ledger defends itself: every line is **hash-chained** to the one before it, and the state file anchors the chain head, so editing, deleting, or reordering a past entry makes every command refuse until a human looks.

Tool messages are English by default; a Korean system locale (or `AVALON_LANG=ko`) switches them to Korean. Build artifacts are always English — their bytes are hashed, so they must not depend on the environment.

## What it looks like in practice

<img src="images/where-it-sits.svg" alt="You give the agent a one-line goal, the agent works on the repo, and 'done' can only reach you through Avalon's gates" width="100%" />

Avalon doesn't replace your AI agent — it sits between the agent's "done" and your trust. The agent keeps doing all the work; its claims just have to pass through gates on the way to you.

### In Claude Code

With the skill installed ([Install](#install)), the whole invocation is one line of plain language:

```text
Run this under avalon — add a search endpoint to my-api, all tests must pass.
```

Any phrasing works ("avalon으로 진행해", "use the avalon procedure", …) — the skill's trigger is the name. What happens next, with no further prompting:

<img src="images/session-flow.svg" alt="A real session: one line from you, the agent measures and designs, tools give verdicts, a failing gate loops back, approval is requested at the irreversible step, and the final report says completed true, abandoned empty" width="100%" />

1. The agent runs `scaffold`, drafts the graph, and shows you the four numbers before doing anything.
2. It works node by node, submitting measurements; the tools answer pass or fail.
3. At the irreversible node it stops and asks you — that pause is compiled into the output, not a courtesy.
4. The final message carries `completed` and the `abandoned[]` evidence list — the two fields it cannot fake.

Your actual role: read the gate design once at step 1 (the thresholds are yours to argue), answer the approval question, and read four numbers at the end.

### You don't need to be a developer

If "search endpoint" meant nothing to you, that's fine — the command is just everyday language. Two situations, one example each:

**Starting a project from scratch** — nothing exists yet. Say the goal, and add "check it actually works":

```text
Run this under avalon — build a website for my café from scratch:
a menu page, directions, and a contact form. Check that all three actually work.
```

**Adding to something you're already building** — open Claude Code in that project's folder and ask. The agent measures what's already there (`scaffold`) before touching anything:

```text
Run this under avalon — add a booking feature to the site I've been building.
Check that a new booking actually shows up in the list.
```

Other ways people phrase it:

- A change you're scared of: *"Run this under avalon — fix the payment part. Ask me before anything that can't be undone."*
- Leaving it overnight: *"Run this under avalon — work through this list while I sleep. If a gate fails, stop — don't gloss over it."*

The numbers, gates, and graph are the agent's job to design. What it must do is show you the criteria **in plain words before starting** — "pressing send must increase stored messages by one; zero failed checks." Your part is three things:

1. Read the criteria list before the run and say "yes, that's what done means."
2. Answer when it asks "this step can't be undone — proceed?"
3. Read the traffic lights at the end — four greens means done; anything in `abandoned` means "this part didn't make it, and here's the evidence."

Things you will never touch: `graph.json` (the agent writes it), the commands (the agent runs them), the thresholds (the agent proposes them — you just say whether that's what *done* means to you).

### In GPT or any other agent

Nothing in the harness is Claude-specific — the tools are six plain Node CLIs, no API keys, no vendor calls. Point any agent that can run shell commands at the procedure:

```text
Clone https://github.com/Evanciel/avalon, read SKILL.md, and follow its
procedure for this task: <your task here>
```

Every agent gets the same treatment: the validator vetoes its graph drafts, the runner refuses its shortcuts, and the compiled `completed` flag ignores its opinion. And with no AI at all, the runner CLI still works — as a disciplined checklist for humans.

## Tutorial: a real run

Everything below actually happened — the commands and outputs are from a live session, mistakes included. (These outputs were captured with Korean tool messages — the tools now default to English, with `AVALON_LANG=ko` for Korean; translations inline.)

Say you have a small Node project, `my-api`, and you want an agent to add a search endpoint and make the tests pass.

**1. Scaffold.** Point it at the repo with the task in one line:

```bash
node tools/scaffold.mjs ../my-api "add a search API and make the tests pass" ../my-api/graph.json
```

You get a three-node skeleton (`survey → check → review`) that already passes validation, with the repo's stack and size measured and both hashes stamped.

**2. Design.** Replace the placeholders with the real plan — three nodes, one gate:

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

**3. Stamp and validate.** Writing this tutorial we made a real mistake — renamed the nodes but forgot `graph.entry`. The validator caught it before anything ran:

```
$ node tools/validate.mjs graph.json
  FAIL  reachability
         ↳ graph.entry 'survey': no such node
  static_checks_passed  5/6      G4c FAIL
```

Fix the entry, re-stamp (`hash.mjs --write`), revalidate → `6/6`, coverage `1.00`.

**4. Compile.**

```
$ node tools/compile.mjs graph.json build/graph.workflow.js
  gate_loss  0      PASS
  hook_loss  0      PASS
  compiled → build/graph.workflow.js
  hooks    → build/hooks.json
```

**5. Execute.** The runner session, verbatim (annotations added):

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

Note what never happened: nobody asked the agent "is it done?" It reported `3`, the tool said fail; it reported `0`, the tool said pass.

**6. Enforce from outside (optional).** The compile step already emitted `build/hooks.json`. Installing it wires the gates into the session's Stop hook — but the installer refuses to act without explicit approval:

```
$ node tools/install-hooks.mjs graph.json build/hooks.json
Install plan (nothing written yet):
  target  .claude/settings.json
  hook    Stop → node tools/hooks-gate.mjs graph.json build/hooks.json
  gates   G1
approval required — after user confirmation: same command with --yes    (exit 3)
```

With `--yes` it installs; from then on the session literally cannot end its turn while a gate is red (`hooks-gate.mjs` exits 2, which blocks the stop). If the graph changes after install, the gate reports STALE and blocks instead of passing on stale rules — recompile and reinstall to resolve. Remove anytime with `--uninstall --yes`.

## The graph format

One JSON file is the canonical plan. The pieces:

**Nodes** — the work. `kind` is `work`, `human`, or `join` (a `gate` node kind existed in v1.1 and was retired — gates are edges' business now). Each node carries a `budget`, a `retry.max`, and — for irreversible steps — `policy.requires_approval: true`, which the compiler turns into a real stop.

**Edges** — the order. `when` is either `always` or `gate:<id>:pass` / `gate:<id>:fail`. That's the whole vocabulary; there is no "sometimes".

**Gates** — the pass conditions. One JSON object, no free-text field, so there is nothing to interpret generously:

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

`max_retry: 0` means *branch*, not *halt* — "on fail, go that way without retrying" (a downgrade path, a NO-GO report). But if a zero-retry branch points back at a node that already finished, that's a loop with no budget, and the runner halts instead.

When you run `done`, the tool reads the latest measurement of `tests_failed`, applies `== 0`, and answers pass or fail. You can argue with the threshold before the run. You can't argue with the verdict during it.

**State** — the declared measurement fields, each typed: `int`, `ratio`, `bool`, `enum`, `ref`, or `text`. Only `int` / `ratio` / `bool` are gateable — you can't put a threshold on prose, so `enum`/`ref`/`text` must be derived into counters first. The schema also catches unit mistakes, like a percent threshold (90) on a `ratio` field (0–1) — a gate that could never pass, which happened for real.

**Fingerprint** — measured facts about the target repo (stack, size, markers), filled by `scaffold`, never guessed. Sizes are stored as buckets (`100-299` files) because exact counts are wrong by tomorrow but buckets stay true.

**Host** — where enforcement lives: `state_file` (where the runner keeps state), `enforced_by_hook` (which gates get machine-enforced from outside, each as `{ "gate": "G0", "check": "node tools/validate.mjs graph.json" }` — a declaration without a command is exactly what `hook_loss` counts), and `produces`.

**Spec hash** — `hash.mjs` stamps a sha256 over the canonical form of the graph (key order doesn't matter, array order does). Every downstream artifact carries it, which is how the runner detects a graph that changed under a live run (STALE) and how hooks are matched to the exact graph they enforce.

**Schema versioning** — `spec.version` selects the validation vocabulary. Old v1.1 graphs validate under v1.1 rules (they're the regression corpus; rejecting them would erase the baseline), but v1.1 is marked *not runnable* — it has no field for *which repo* or *what task*, so the compiler refuses it. Validating and being safe to execute are different claims, and the tools keep them separate.

## Four numbers

**All four must be green before anything runs:**

| | Pass when | Meaning |
|---|---|---|
| `ir_field_coverage` | 1.00 | all 13 required fields are filled |
| `static_checks_passed` | 6/6 | the graph is structurally sound |
| `gate_loss` | 0 | every declared gate made it into the compiled code |
| `hook_loss` | 0 | every declared hook has a real command behind it |

If a loss number isn't zero, you have a declaration that nothing enforces. That graph is decoration, and the tools say so with a non-zero exit.

## The tools, one by one

Six standalone files, no dependencies between them beyond imports, none of them ever calls an LLM (INV-1). Deterministic means literally: same input, same bytes out.

### `scaffold.mjs` — measure, don't guess

Walks the target repo (skipping `node_modules`, `.git`, build output; capped so it never crawls 50k files), detects the stack, buckets the size, stamps the hashes, and emits a graph skeleton **that already passes validation**. The nodes are placeholders — that part is judgment, yours — but the expensive boilerplate (13 required fields, hashes, retry/policy defaults, a mandatory human node) is machine-filled. Starting green and staying green beats starting red and hoping.

### `hash.mjs` — canonical JSON + sha256

Canonicalizes (key order irrelevant, array order preserved — it carries meaning), hashes, and stamps `sha256:<64hex>` into the graph, excluding the hash field itself. Idempotent; three runs, three identical results. This stamp is what STALE detection and hook matching hang off.

### `validate.mjs` — G0 + six checks + a schema with opinions

- **G0**: all 13 required fields present. Partial coverage is meaningless, so the bar is 1.00.
- **Six static checks**: gates only reference declared state fields · irreversible nodes have approval · every node reachable · every cycle has a cap (termination) · every node has a budget · every edge points at a real node with a well-formed `when`.
- **Schema-level rejections** (before the checks even run): descriptive gates — a gate with prose instead of `field/op/threshold` can't be expressed at all · unknown operators · gates on ungateable types · boolean thresholds · ghost gate references from `host.enforced_by_hook` · retired vocabulary on modern graphs.
- **Quality warnings** (non-fatal): missing `scope`/`host`, hooks declared without a `check` command.

### `render.mjs` — the markdown is an artifact

Renders the JSON into readable markdown deterministically. `--check` re-renders and compares **byte-exact** (sha256) against the committed `graph.md` — that's gate G0b. If someone hand-edits the markdown, the check fails. Docs can't drift from the plan, because docs *are* the plan, rendered.

### `compile.mjs` — lossless translation or no translation

A pure function from IR to a workflow script. Nondeterminism is banned inside it — no `Date`, no `Math.random`, no relying on object-key iteration order. What it emits:

- one sub-agent call per node, with a **shared context block** (fingerprint, target, task) injected into every prompt — measured facts travel with the work;
- **parallel fan-out** when a node has multiple `always` edges, with the branches meeting at a single join;
- human-node gates preserved (a `design_approved` measured by a human is still a gate, not a comment);
- **approval stops** at `requires_approval` nodes, honoring the `approved` argument (default: nobody is approved);
- **resume** support (`resume_from`, `resume_state`, `resume_loops`);
- the **ABANDONED ledger** (next section);
- `build/hooks.json` — one entry per hook-enforced gate: `{ gate, field, op, threshold, check, expect_exit: 0 }`, joined to the graph by its spec hash.

Then it audits itself: every gate in the IR must appear in the output (`gate_loss`), every declared hook must appear in `hooks.json` with a command (`hook_loss`). Loss anywhere → non-zero exit, no artifact trusted.

### `run.mjs` — the executor

Frontier discipline, measurement ledger, gate verdicts, STALE detection, halt-to-human. Described in [Three ways to run it](#three-ways-to-run-it) above; the four invariants at the top of the file are the contract, and the self-test exists to prove each one actually bites.

The ledger is a **hash chain**: each line carries `h = sha256(canonical(line))` plus the `h` of the line before it, and the state file anchors the chain head. This is what happened when a recorded measurement was edited from 7 to 1 after the fact — every command refuses, not just `verify`:

```text
$ node tools/run.mjs graph.json next
🔴 ledger chain broken — refusing every command:
  line 3: h mismatch — the line was edited
  the ledger is the evidence layer; a run on tampered evidence proves nothing.
  → inspect the ledger, archive it elsewhere, remove it, then re-init
```

One caveat, stated in the code where the chain lives: this is tamper-*evident*, not tamper-*proof*. It catches edits, deletions, reordering, and truncation; an actor who rewrites the ledger and the state file *together, consistently* is beyond it — that needs an external anchor, which is precisely the job reserved for the dormant ④ ARCHIVE.

### `install-hooks.mjs` + `hooks-gate.mjs` — enforcement that survives the session

The installer takes `build/hooks.json` and wires it into the **project's** `.claude/settings.json` as a Stop hook. Its boundaries are the point: it writes nothing without `--yes` (prints the plan and exits 3 — an agent must not pass `--yes` without the user's say-so), it refuses the global `~/.claude` settings even with `--yes`, it refuses a spec whose hash doesn't match the current graph, it preserves everyone else's hooks, and reinstalling is idempotent. `--uninstall --yes` takes it back out.

It also pins what was approved: the byte hash of `build/hooks.json` at approval time is embedded in the installed command (`--approved sha256:…`). If the file changes in any way afterwards, the gate blocks **before running a single check** and reports TAMPERED — without this, write access to one JSON file would equal the right to have arbitrary commands executed automatically at the end of every turn. Re-approval (`--yes` reinstall) is the only path back.

And it demands proof that each check **can go red**. A hook entry may declare a `probe` — the same oracle aimed at a known-bad input, so it must exit non-zero. The installer runs every declared probe at plan and install time; a probe that exits 0 has just demonstrated a check that cannot fail, and the install is refused:

```text
$ node tools/install-hooks.mjs graph.json build/hooks.json --yes
installer refused: probe refuted nothing — these checks cannot fail (or the probe never finished), so they enforce nothing:
  G1: probe exit 0 ← node -e "process.exit(0)"
```

A healthy plan prints the counter-evidence per gate:

```text
  probe   G0  exit 1 ✅ (the oracle can fail)
  probe   G0b  exit 1 ✅ (the oracle can fail)
  probe   G4c  exit 1 ✅ (the oracle can fail)
```

Hooks without probes still install (reported as unproven — no retroactive breakage), and `--status` gives a read-only diagnosis any time: installed or not, approval pin intact or TAMPERED, spec current or STALE — without running a single check.

Once installed, `hooks-gate.mjs` runs every declared check when the session tries to end its turn: all pass → exit 0; any fail → exit 2, which blocks the stop and feeds the failing gates back to the model. A changed graph makes it report STALE and block — enforcing yesterday's rules silently would be worse than stopping.

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

## The paper trail

[docs/graph/](docs/graph/) carries the full design history — 1,300+ lines, and none of it is marketing:

- **[avalon-graph.md](docs/graph/avalon-graph.md)** — the v4 spec: a version history where every revision states its evidence, the four stages, the gate roster (9 active, 2 explicitly *on hold* because their measurement procedure isn't defined yet — a gate without a procedure isn't a gate, so they're parked, not pretended), what was deliberately removed from gate design, and the hidden assumptions written out loud.
- **[ir-schema.md](docs/graph/ir-schema.md)** — the machine-readable IR spec: the fingerprint (12 fixed markers, measured not guessed), `target`/`task`, schema versioning, the state whitelist, the six static checks, why markdown renders from JSON, and Avalon's own graph as the worked example — including a section on what self-application exposed.
- **[phase0-findings-v2.md](docs/graph/phase0-findings-v2.md)** — the research that killed the pitch: the "industry-standard 5-layer" framing turned out not to exist; the "automatic design" differentiator was checked against commercial and academic prior art, found refuted, and retired; and claims for which no counterexample was found are *still* not used as public claims — absence of a counterexample isn't proof.

That last habit is the point of the whole directory: the docs record not just what Avalon is, but what it almost was and why that would have been wrong.

## Giving up is not succeeding

<img src="images/abandon.svg" alt="A gate that exhausts retries records evidence in abandoned[] and the final completed flag is forced to false while that list is non-empty" width="100%" />

When a gate exhausts its retries with `on_exhaust: partial`, the workflow moves on — but it records `{gate, node, field, op, threshold, measured, attempts}` in an `abandoned[]` list, and the final `completed` flag is **forced to false** while that list is non-empty. A run that skipped a gate can't report itself as a success. Execution-semantics tests pin this down by actually running compiled output.

## Hooks: a spec is not an installation

<img src="images/stop-hook.svg" alt="When the agent tries to end its turn, hooks-gate runs every check: all green ends the turn, any red blocks it with exit 2 and feeds the failing gates back to the model" width="100%" />

`compile.mjs` emits `build/hooks.json` — per-gate check commands with an exit-code contract — and deliberately stops there. Installation is a separate tool with a separate approval: `install-hooks.mjs` shows its plan and refuses to write anything until a human-confirmed `--yes`, installs to the project's settings only (never global), and can be uninstalled as easily as installed. Auto-install stays forbidden: a tool that silently wires itself into your session's enforcement layer is the exact kind of unaccountable magic this project exists to prevent. Until installed, the spec blocks nothing — and completion reports are required to say so in those words.

Avalon's own three hooks all carry probes: each check is also aimed at a committed broken fixture ([tools/fixtures/](tools/fixtures/)) that it must refuse, so this repo's enforcement layer is provably capable of going red.

## Avalon runs on Avalon

The [graph.json](graph.json) at the repo root is not an example — it's Avalon's own development, managed by Avalon. Seven nodes (`frontend → validate → render_check → backend → compile_check → human_go → install_hooks`), six declared state fields, and three gates (G0, G0b, G4c) machine-enforced via `host.enforced_by_hook` — each with the actual command that checks it, and a probe aimed at a committed broken fixture that proves the command can fail. [graph.md](graph.md) is its render, byte-verified by G0b.

The graph's `guarantees` block is the honest-limits list in machine-adjacent form: `provides` states exactly what a green run proves, `excludes` states what it doesn't. If this repo's own gates went red, its CI would fail.

## How it's tested

158 tests in three suites, all run by `npm test`:

- **[test.mjs](tools/test.mjs) (93)** — schema and compiler behavior, including **execution semantics**: compiled workflow output is actually executed against stubbed hosts, so claims like "completed is false while abandoned is non-empty" are demonstrated, not asserted. New here: **fingerprint discrimination** — the same repo scaffolded twice must produce byte-identical fingerprints and two different repos must not, measured with real scaffold runs; the fingerprint's discriminative power was an *unverified* claim until these tests. A deploy-sync gate byte-compares the nine runtime files against the installed skill copy, so the repo and the deployed skill can't drift apart silently.
- **[run.selftest.mjs](tools/run.selftest.mjs) (41)** — the runner's refusal walls, tested by the only method that proves a guard exists: *remove the guard, and the suite must turn red*. Each test constructs the forbidden situation (out-of-frontier start, unmeasured done, edited-graph continue) and passes only if the runner refuses. The ledger-chain tests attack real ledgers — edit a past measurement, truncate the tail, append past the chain — and pass only when every command refuses.
- **[install.selftest.mjs](tools/install.selftest.mjs) (24)** — the installer's boundaries, same method: no write without `--yes`, global settings refused, stale spec refused, other people's hooks preserved, idempotent reinstall, and the gate blocking (exit 2) on failure and on STALE. Three are TOCTOU attack scenarios: they modify `build/hooks.json` *after* approval — swapping a check for a malicious command, even regenerating graph and spec consistently — and pass only if the gate blocks **without executing anything** (a marker file proves the planted command never ran). The rest pin the probe wall (an oracle that cannot fail is refused as decoration), `--status` reading without writing, and English being the actual default language.

CI runs both suites on ubuntu and windows. Line endings are pinned to LF via [.gitattributes](.gitattributes) because G0b is a byte-exact oracle — a CRLF checkout would technically be a different document.

## Repository map

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

## Honest limits

- The tools prove the **declared oracle** only. Whether a check command means the same thing as its human-language title is still on you. A `probe` narrows this gap — it proves the oracle *can* fail — but does not close it; no deterministic tool can.
- `build/hooks.json` is a spec. Until installed via `install-hooks.mjs --yes` (a human-approved step) it blocks nothing.
- Runtime artifacts produced by agent nodes can't be verified at compile time.
- The ledger chain is tamper-*evident*, not tamper-*proof*: it catches edits, deletions, and truncation, but an actor who rewrites ledger and state together defeats it. The external anchor that would catch that is ④ ARCHIVE's job, and ④ remains dormant.
- Tool messages are English by default (`AVALON_LANG=ko` for Korean). Code comments and the design history in [docs/graph/](docs/graph/) are Korean — the reasoning is documented, just not yet translated.

The full, current list lives in the `guarantees` block of the self-applied graph.

## License

[MIT](LICENSE)
