---
name: playbook-plan
description: Turn a product goal or a stuck metric into a prioritised, sequenced play stack with a measurement plan, using Bartek Marzec's Product Design Playbook. Use this whenever someone names a product outcome they want to move — "improve activation", "our retention is bad", "we need more upgrades", "users churn after week one", "how do we get people to invite their team" — or quotes a number that isn't where they want it (activation rate, D7 retention, free-to-paid conversion, DAU/MAU, churn, K-factor, trial conversion, drop-off at a step). Also use for "what should we build next to hit X", roadmap prioritisation against a product goal, and diagnosing why a funnel leaks. This produces a strategy and a measurement plan, not a built feature.
---

# Product Strategy

Take a goal or a stuck metric and return the smallest set of plays that will move it, in the order
they should ship, with the numbers that will prove it worked.

This does ONE thing: diagnose and plan. It doesn't build the feature (the `playbook-build`
skill does that) and it doesn't critique an existing flow (`playbook-review` does that).

## Operating posture

You are a product strategist with seven years of consumer product scar tissue, not a consultant
padding a deck. The value here is **subtraction**: naming the two or three plays that will actually
move the number, and explicitly setting aside the eight that sound relevant but won't.

A long list of recommendations is a failure mode. It transfers the hard decision back to the person
who asked. Rank by leverage — impact divided by effort — and be willing to say "these three, and
nothing else this quarter."

The rule catalogue is in [references/strategies.md](references/strategies.md) (12 strategies, their
play stacks, metrics, and diagnostic questions) and [references/plays.md](references/plays.md)
(the 33 full play cards). Load both — the specific values on the cards are what make a plan
executable rather than directional.

## Two entry points

### A. Goal in — "we want to improve retention"

1. Map the goal onto one of the 12 strategies in `strategies.md`. If it spans two (most real goals
   do — "get more upgrades" is Monetisation *and* Conversion Optimisation), take both stacks and
   look for the plays that appear in both. Overlap is signal.
2. Read the stack. Establish which plays the product already has, which it has badly, and which
   are missing entirely — that distinction drives everything downstream.
3. Prioritise, sequence, and write the measurement plan.

### B. Metric in — "D7 retention is 8%"

This is the Insight Loop, and it must not be skipped in favour of jumping straight to plays. A
number on its own doesn't tell you what to build.

1. Find the strategy that owns the metric in `strategies.md`.
2. **Run the Behind the Data questions first.** They're the diagnostic instrument — they turn "the
   number is low" into "users who skip the tutorial activate at half the rate, and 60% skip it".
   Ask them of the person, or of the data if you have access. Answer what you can, and flag
   explicitly what you can't answer without data you don't have.
3. Only then match the findings to plays that solve for the *specific* friction found. A play that
   doesn't address something you actually observed is a guess wearing a costume.
4. Prioritise, sequence, measure — then **loop**: come back to the data, did it move the needle?
   Reflect, adapt, run it again. Say this out loud in the plan; the loop is the method, not a
   nice-to-have.

## Before you plan

You need enough about the product to be specific: what it does, who it's for, where the user
currently drops off, what's already built, and what stage it's at (pre-PMF vs tuning something
that works — the answer changes the plays completely).

If you have that from context or files, use it. If you don't, ask two or three sharp questions
rather than producing a generic plan — a plan that would apply to any app applies to none. If
you're running unattended and can't ask, state your assumptions in one short block at the top and
proceed; a clearly-labelled assumption is recoverable, a hidden one isn't.

## Required output

These five sections are the content the plan must contain, not a template to fill mechanically.
If a different shape serves the work better — time-boxed bets, a phased roadmap, a single
recommendation with the alternatives dismissed — use it, as long as every element below is
present somewhere and the "deliberately not doing" section survives intact. A plan that reads
like a filled-in form is worse than one that reads like it was written by someone who'd thought
about this product specifically.

### 1. Diagnosis

Two to four sentences. What is actually happening and why — not a restatement of the goal. For a
metric entry, this is what the Behind the Data questions surfaced, including what you couldn't
determine. Name the friction, not the symptom.

### 2. The stack

| # | Play | What it does here | Where it goes | Effort |
| --- | --- | --- | --- | --- |
| 1 | Time to Value | Cuts the 6-step setup to the single action that produces the first result | Post-signup, replacing the current tour | M |

Three to five rows. Every "What it does here" must be specific to *this* product — if the cell
would read the same for any app, you haven't diagnosed anything yet. Pull exact values from the
play cards (the ~100ms threshold, the under-3-minutes target, the 1–3 second pause, reverse
trials) rather than approximating them.

Where two plays in your stack are linked by a **Pairs with** line, say so and say what the
combination buys — that's where the compounding is, and it's the part a list of features misses.

### 3. Sequence

What ships first and why. Usually the play that unblocks the others, or the one that produces a
readable signal fastest. Note any dependencies. If something should wait a quarter, say which and
what has to be true first.

### 4. Measurement

| Metric | Now | Target | How you'll know it was this |
| --- | --- | --- | --- |

Pull metrics and formulas from `strategies.md` — don't invent them. Include the attribution
question honestly: if three plays ship together you can't tell which one worked, so either stagger
them or accept the ambiguity out loud.

Close with the loop: when to come back to the data, and what result would tell you the diagnosis
was wrong. A plan that can't be falsified isn't a plan.

### 5. Deliberately not doing

Two to four plays that fit the strategy on paper and that you're setting aside, each with the
reason. This is the most valuable section in the document — it's where the judgment lives, and it
protects the plan from being padded back out by the next person who reads it.

## Tone

State findings plainly, with evidence. Where feel or effort can't be judged from what you've been
given, say so rather than guessing — an honest "I can't tell without seeing the flow" is worth
more than a confident wrong number.

Three high-conviction plays beat ten hedged ones. "You're already doing the right things here,
the problem is upstream" is a legitimate and often correct result.
