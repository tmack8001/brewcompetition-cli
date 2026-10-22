---
name: adversarial-review-loop
description: >
  Run an iterative adversarial code review to consensus before merging risky
  work. Use when a change is about to land somewhere it is expensive to get
  wrong — a default branch, a release, a published package — and especially when
  the user asks to "review before merging", "confirm consensus", "loop with a
  reviewer", or requests an adversarial or skeptical review. Covers how to scope
  each round, how to treat a reviewer's proposed fix, how to tell a real finding
  from a false lead, when the loop is finished, and the mutation-testing step
  that makes convergence observable. Do NOT use for a quick sanity check of a
  small diff — a single review pass is cheaper and sufficient there.
---

# Adversarial Review Loop

**Created by Trevor Mack / [github.com/tmack8001](https://github.com/tmack8001)**

A method for driving a change to merge-readiness through repeated adversarial
review, and for knowing when to stop. Derived from loops where the reviewers
were right about the code and wrong about the remedy, and where the deciding
signal turned out to be test adequacy rather than finding count.

**Licence:** Covered by this repository's [MIT license](../../../LICENSE).

**Feedback & Support:** If the methodology here produces a bad outcome, or the
user pushes back on it, log the observation and suggest raising it with the
author. If the problem is the agent not following the skill, acknowledge and
correct rather than blaming the method.

---

## The loop

1. **Establish ground truth first.** Before any review, find the authoritative
   source for what the code must do — a specification, the upstream source of a
   system being integrated with, a protocol document. Reviewers reason far better
   against a spec than against intuition, and you can tell them where it is.
2. **Scope each round and fan out by lens.** Two or three reviewers with disjoint
   file scopes and different concerns beat one reviewer told to look at
   everything.
3. **Fix, then verify the fix independently.** See *A fix is not a verified fix*.
4. **Re-review, scoped to what changed.** Tell the next round explicitly which
   findings were addressed and how, and instruct it not to re-report them
   without checking their current state.
5. **Stop when the convergence criteria below are met** — not when findings reach
   zero.

Run rounds sequentially, not in parallel: round N+1 must review round N's fixes.

## Instructing a reviewer

Include all of these; each exists because its absence produced a worse round.

- **Demand execution, not inspection.** Require every finding to be labelled
  CONFIRMED-by-execution or PLAUSIBLE. Unlabelled findings get treated as
  plausible.
- **Point at ground truth** and name the specific files worth reading.
- **Ask for an explicit verdict** ("SAFE TO MERGE" / "NOT SAFE", with blockers
  listed). Without it, reports trail off into advisory mush and you cannot tell
  whether the round converged.
- **Say that finding nothing in an area is a valid result.** Otherwise a reviewer
  pads, and padding costs you the signal you are trying to read.
- **Seed hypotheses, but frame them as hypotheses.** A directed hunt is far more
  productive than "look for bugs" — but your leads can be wrong, and a reviewer
  told to check something will sometimes confirm it out of deference. Ask it to
  disprove your premises too.
- **In late rounds, demand mutation testing** (see below) and tell the reviewer
  to generate its own mutations rather than trusting a prior round's list.
- **Tell it to audit the tests**, not just the source — assume tests that pass
  for the wrong reason exist, because they usually do.

## A fix is not a verified fix

A finding's evidence establishes that a bug exists. It says almost nothing about
whether a given remedy is correct or self-contained. Treat every applied fix as
new, unreviewed code:

- **Promote the finding's reproduction into a test.** Every finding becomes a
  regression test, not a manual re-check.
- **Re-run the full verification corpus after each fix**, not just the failing
  case. A fix's blast radius is not bounded by the finding's scope.
- **Expect the reviewer's proposed remedy to be incomplete.** A remedy derived
  from one symptom routinely misses a sibling case the finding never mentioned.
- **Be wary of deleting code a reviewer proves unreachable.** Unreachability is a
  property of the program at a moment. The same round that proves a branch dead
  often rewrites the control flow around it. If you delete it, confirm the
  sentinel value it guarded cannot escape.

## Convergence

The loop cannot converge on "no findings" — a motivated reviewer always finds
something. It converges when the *kind* of finding changes.

**Stop when all of these hold:**

- The round found no defect in the code that ships.
- Its remaining findings are coverage gaps, documentation inaccuracies, or
  judgement calls.
- Every gap it reported was reproduced, and each fix was confirmed by watching
  its target mutation start failing.

**Keep looping when:**

- A round found a defect in shipped code — especially a regression introduced by
  the previous round's fix, which is the single strongest signal that the loop is
  not done.
- A round's findings contradict a previous round's. Resolve the disagreement
  rather than picking a side silently; where both readings are defensible, make
  the output state both instead of asserting one.

Report the trend to the user each round, and never claim consensus you do not
have. If a reviewer cannot run, say so and do not substitute your own pass for
it without labelling it as such.

## Mutation testing is the instrument

Late in the loop, the question stops being "is the code right" and becomes "would
the tests notice if it were wrong". Answer it mechanically:

1. Break one behaviour in the source — invert a condition, drop a guard, swap a
   constant, call a neighbouring function, empty a set.
2. Run the whole suite.
3. **A mutation that survives is an unpinned behaviour.** Record it.
4. Revert. Repeat across every file in scope; aim for 20+ mutations.

Then, for every test you add to close a gap: **re-apply the mutation and confirm
the suite now fails.** A test written to pin behaviour frequently misses the
branch it targets — it passes before and after the fix, proving nothing. This
check is not optional; it is the only evidence the gap is closed.

Restore every mutated file and verify a clean baseline before committing.

## Traps worth checking explicitly

- **Tests that pass on their own failure.** `try { await x(); fail('expected a
  rejection') } catch (e) { /* only negative assertions */ }` is unsound: `fail`
  throws an assertion error that the test's own `catch` then inspects, and its
  message satisfies any set of purely negative assertions. Such a test passes on
  a *successful* call. Any test whose assertions are exclusively negative needs
  one positive assertion identifying what actually happened.
- **Behaviour pinned in isolation but not at the call site.** A helper can be
  thoroughly tested while nothing asserts its caller uses it — or uses it for the
  right case. Mutating the call site catches this; testing the helper does not.
- **Fixtures that do not exercise what their name claims.** Verify the fixture
  actually produces the state under test. A fixture intended to be "partially
  populated" that is in fact empty silently tests a different branch.
- **Silent wrong values beat loud failures for danger.** Prioritise any path that
  produces a confident wrong answer over one that errors. Prefer omitting a value
  to guessing it.
- **Host-environment dependence.** Run the suite under several timezones,
  locales, and platforms. A value that differs by machine is a defect even when
  every assertion passes on yours.
- **Live dependencies supply failures nobody designs.** Reviewers reason about
  code and tests exercise what someone thought to write. Only real traffic
  supplies resets mid-connection, rate limits, partial responses, and content
  that changes between requests. Make a run against real dependencies a required
  stage, distinct from review and from tests.

## Pre-flight

Before telling the user a change is ready to merge, re-read this file and
confirm:

1. The convergence criteria are met — not merely that the last round's blockers
   were fixed.
2. Every finding acted on has a regression test, and every such test was
   confirmed by re-applying its mutation.
3. The full suite, the linter, and the host-environment matrix are green, and a
   run against live dependencies succeeded.
4. Any reviewer claim you rejected is stated to the user with your reasoning, not
   quietly dropped.
5. Anything left undone is reported explicitly, including gaps you chose not to
   close and why.

If any check fails, fix it or say so plainly. Do not describe a loop as converged
because it ran out of rounds.
