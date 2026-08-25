---
name: avalon
description: Declare work as a graph and enforce it — measure → IR → validate → lossless compile → numeric gate enforcement. For work spanning 4+ files, multiple modules, or irreversible steps, and for autonomous loops. Trigger on "avalon", "graph it", "아발론 진행", "그래프로 가자". Not for one-or-two-file edits.
---

# Avalon — declare as a graph, enforce by machine

Instead of improvising, **pin down what will be judged, when, and on what evidence** before starting.
Every tool is deterministic — none of them calls an LLM (INV-1). People and models exercise judgment;
tools deliver verdicts.

한국어 판: [SKILL.ko.md](SKILL.ko.md) · Tool messages default to English; set `AVALON_LANG=ko` for Korean.

## When to use

- Work spanning 4+ files · multiple modules · steps that are hard to reverse
- Anything run as an autonomous loop — without grounds for verdicts, a loop fools itself

Not for one-or-two-file fixes. If the graph costs more than the work, that is the tail wagging the dog.

## Procedure

### 1. Skeleton — the machine measures

```bash
node tools/scaffold.mjs <target-path> "<task in one line>" graph.json
```

Measures the repository (stack, scale, markers), stamps hashes, and emits a skeleton that
**already passes G0**. Start green, stay green while replacing content. Never start red.

### 2. Design — where judgment enters

Replace the skeleton's `TODO:` items with the real design. What the nodes are and what each gate
**measures and how** is judgment — the machine cannot do it. Rules to keep:

- **DEFINED — NOT GUESSED.** Fingerprint markers must be values measured in this repository.
- **Gates are numbers.** The schema refuses descriptive gates outright. Write `threshold_source`
  for every threshold — an unsourced threshold is decoration.
- **Match units.** `type: ratio` (0–1) with threshold 90 can never pass. This bug actually happened.
- Put `policy.requires_approval: true` on irreversible nodes. **The compiled code actually stops there.**
- Declare hook-enforced gates as `{ "gate": "<id>", "check": "<command>" }` in `host.enforced_by_hook`.
  The check must exit non-zero when the gate is unmet — **a declaration without a machine is caught as hook_loss.**
- Optionally add `"probe": "<command>"` to a hook entry — a command aimed at a known-bad state that
  therefore MUST exit non-zero. It proves the check **can** fail; the installer refuses an oracle
  that cannot (a check that never goes red enforces nothing).

### 3. Restamp → validate → compile

```bash
node tools/hash.mjs graph.json --write
node tools/validate.mjs graph.json
node tools/compile.mjs graph.json build/graph.workflow.js
```

**Check the four numbers.** If any is off, do not run.

| | pass condition | meaning |
|---|---|---|
| `ir_field_coverage` | 1.00 | all 13 required fields present |
| `static_checks_passed` | 6/6 | no descriptive gates · out-of-state refs · unapproved irreversibles · unreachable nodes · unbounded loops · broken edges |
| `gate_loss` | 0 | every IR gate landed in the compiled output |
| `hook_loss` | 0 | every hook-declared gate landed in `build/hooks.json` (absent if none declared) |

Non-zero loss means **declared but not enforced**. Such a graph is meaningless.

### 4. Enforcement — two paths

**A. Workflow script** (`build/graph.workflow.js`) — runs on an agent-orchestration host.
Execution needs user consent. Resumable from where it stopped:

```
Workflow({ scriptPath: "build/graph.workflow.js",
           args: { resume_from, resume_state, resume_loops, approved: ["<node-id>"] } })
```

A `policy.requires_approval` node **stops before executing** unless its id is in `approved`.
The default is the empty set — a regression test pins this so the gate can't hollow out.

**B. Runner** (`tools/run.mjs`) — the enforcer when a session works the nodes directly.

```bash
node tools/run.mjs graph.json init      # create state (after editing the graph: init --force)
node tools/run.mjs graph.json next      # what can be done right now
node tools/run.mjs graph.json start <node>
node tools/run.mjs graph.json measure <field> <value> [note]
node tools/run.mjs graph.json done <node>   # only the tool delivers gate verdicts
node tools/run.mjs graph.json verify    # ledger hash-chain check (tamper/truncation)
```

People/agents enter **measurements only**. Starting an out-of-frontier node is refused; `done`
is refused if this visit didn't measure; every measurement lands append-only in the ledger.
Ledger lines are **hash-chained** (`h`/`prev` + `ledger_head` in state) — editing, deleting, or
reordering past lines makes every command refuse. If the graph hash changes, state is marked
STALE — nothing continues silently.

## Completion — abandonment is not success

`completed` in compiled output is true **only while `abandoned` is empty**.

- A gate missed under `on_exhaust: partial` leaves measured evidence in `abandoned[]`:
  `{gate, node, field, op, threshold, measured, attempts}`.
- `fail`/`halt` exhaustion carries the same evidence and stops with `completed: false`.
- **Partial output is not completion.** Never report a run with non-empty abandoned as success.

## Hooks — emitting and installing are separate steps

Compile emits **only the spec**, `build/hooks.json` (per-gate check commands + exit contract).
Installation is a separate tool under separate approval:

```bash
node tools/install-hooks.mjs graph.json build/hooks.json          # plan only, exit 3
node tools/install-hooks.mjs graph.json build/hooks.json --yes    # only after user approval
node tools/install-hooks.mjs graph.json build/hooks.json --status # read-only diagnosis
```

Boundaries the installer keeps (pinned by install.selftest.mjs):
- Writes nothing without `--yes`. **An agent adding --yes without user approval is forbidden.**
- Project `.claude/settings.json` only — global (`~/.claude`) refused even with `--yes`.
- Stale specs refused. Other people's hook entries preserved. Reinstall is idempotent. `--uninstall` provided.
- The byte hash of the approved spec is pinned into the installed command (`--approved`) — however
  hooks.json changes afterwards, the gate blocks **without executing**. No new check runs before re-approval.
- Declared probes must exit non-zero at install time — an oracle that cannot fail is refused as decoration.

Once installed, `hooks-gate.mjs` runs as a Stop hook and blocks turn end with exit 2 while a gate
is red. If the graph changes, the gate treats STALE as a **block, not a pass** — recompile →
reinstall is the resolution path. Until installed, the spec blocks nothing — completion reports
must say so in those words.

## Always write the guarantee boundary

Fill `guarantees.provides / excludes`. What the tools prove is **the declared oracle only** —
they cannot prove a check means the same as its gate's title. A probe narrows this gap (it proves
the oracle can fail) but does not close it. Never present the unmeasured as measured.

## Verification

```bash
npm test   # tools/test.mjs (schema·compiler·execution semantics) + run.selftest.mjs (runner refusal walls) + install.selftest.mjs (installer/gate walls)
```
