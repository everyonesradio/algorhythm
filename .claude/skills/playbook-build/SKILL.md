---
name: playbook-build
description: Bartek Marzec's Product Design Playbook — 33 named plays and 12 product strategies for building consumer products that feel considered instead of generic. Use this whenever designing, building, or writing any user-facing part of a product — onboarding flows, empty states, paywalls, loading and waiting states, permission prompts, success moments, error states, UI copy, button labels, activation or retention features, notifications, widgets, or referral flows. Apply it even when the user never says "design", never names a play, and simply asks for a screen, a flow, a component, a feature, or some button text. Also use for product strategy questions about activation, retention, engagement, conversion, monetisation, habit formation, trust, or growth. If the task touches a moment a real user will experience, this skill applies.
---

# Product Design Playbook

Bartek Marzec's system for building products people come back to. Seven years of consumer
product design compressed into 33 named plays and 12 strategies that combine them.

> "In the world of consumer apps, users don't just remember what your product does. They
> remember how it feels."

## Why this exists

The default output of an AI asked to design a product moment is *competent and forgettable*. It
produces the empty state that says "No items found", the loading spinner with no copy, the paywall
that fires on launch, the button that says "Continue". Each is defensible. Together they produce a
product nobody feels anything about.

This playbook exists to replace that default. Its real asset is a **named vocabulary of moves** —
Perceived Effort Delay, Effort Moat, Momentum Bias, Spark Curiosity — that nobody reaches for
without being reminded they exist, plus a **pairing graph** that turns single moves into strategy.
Reaching for a specific, named play instead of generic good practice is the whole difference.

## How to use this when building

When the task involves any moment a user will experience, run this loop before writing a line of
UI, copy, or code. It takes seconds and it changes the output completely.

**1. Name the moment.** Where in the journey is this? First run · nothing to show · waiting ·
just succeeded · about to decide · about to pay · about to destroy something · returning after
absence · hesitating · finished something worth showing.

**2. Name the job.** What is the user actually trying to get done here, in their words, not the
system's? This is the JTBD frame and it governs every word you write.

**3. Pick plays — usually two to four.** Use the index below. One play is a tactic. Ten is noise.
Two to four that reinforce each other is a designed moment.

**4. Pull the pairs.** Every play card carries a **Pairs with** line. Those links are the
combination engine, not decoration — a Success Moment paired with Permission Serve converts far
better than either alone, because you're asking at an emotional peak instead of a cold start.
Read the full cards in [references/plays.md](references/plays.md) before committing to values.

**5. Apply the bar** (below) and cut anything that fails it.

**6. Name your plays in the output.** After delivering the work, state briefly which plays you
used and why. This makes the reasoning auditable and teaches the person the system. Keep it to a
line or two — it's a footnote, not an essay.

For goal-level work ("improve retention", "we need better activation"), start instead from
[references/strategies.md](references/strategies.md), which maps each of the 12 strategies to its
play stack, its metrics, and the diagnostic questions that reveal why the number isn't moving.

## The four spines

Almost every rule in the playbook is a consequence of one of these. When a specific play doesn't
cover the situation you're in, reason from here.

### 1. Value before ask

Nearly every "Don't" in the playbook is a version of this: don't ask before they've felt something.
The paywall lands *after* a milestone. Permission is requested *after* the feature is wanted. The
referral prompt fires *after* the win. Commitment is invited *after* they know what they're
committing to. Contact sync comes *after* trust exists.

Ask first and you're a stranger demanding a favour. Ask after value and you're offering the
obvious next step. If you find yourself placing an ask early because it's "in the flow there",
that's the flow being wrong, not the ask.

### 2. Make invested effort visible

People value what they build, and they abandon what they can't see themselves in. Every upload,
setting, streak, saved item, and completed step is attachment — but only if the user can *see* it.
Effort that goes unacknowledged is effort that never happened, emotionally. Show cumulative
progress, reflect input back, elevate earned status. This is the moat: not features competitors
can't copy, but a personal history they'd have to rebuild.

### 3. Every dead moment is a designed moment

Blank screens, loading, waiting, no results, errors, ends of flows. These are where products leak,
and where almost nobody spends design effort. A blank screen is either a dead end or an open door.
A spinner is either dead air or your brand's voice. Treat each one as a surface you own.

### 4. Fast where they act, deliberate where they judge

Time to Value says strip everything and sprint to the payoff. Perceived Effort Delay says pause,
because instant results feel cheap. Both are right, in different places. Sprint through anything
between the user and the thing they came for. Slow down when you're *delivering a considered
result* — a match, a score, an analysis, a recommendation. Speed feels cheap when the user expects
effort; a pause suggests care. Never confuse the two: a slow onboarding is a bug, a slow
"analysing your answers" is luxury.

## The bar

Cross-cutting rules. Each one exists because breaking it is the specific way this kind of product
loses trust — the reasoning matters more than the rule, because you'll meet cases the rule
doesn't name.

| Never | Because |
| --- | --- |
| Show a paywall before value is experienced | Conversion is a reward, not a ransom. Ask a stranger for money and they leave |
| Celebrate what wasn't earned | Fake celebration is a participation trophy. It devalues every real one that follows |
| Fake progress to boost numbers | Users feel manipulated the moment they notice, and they do notice |
| Ask for permission unrelated to what the user is doing right now | You get one shot at the native opt-in. Spend it on a moment they already want |
| Add friction without a payoff the user can feel | Friction with purpose builds confidence. Friction without it is just a worse product |
| Force gamification into a flow that doesn't benefit | Meaningless badges and empty points read as contempt for the user's time |
| Put a quirk in a high-stakes flow | Delight belongs in low-stakes, repeated moments — never in checkout or account recovery |
| Randomise where users expect control | Variable reward lives at the edges. The core must stay reliable |
| Reinvent a familiar pattern to be different | If users have to think, you've already lost. Break a pattern only when you can explain why |
| Let a destructive action fire on a single careless tap | Fail-safes are invisible trust signals. Safety is what makes people brave enough to explore |
| Leave a screen blank, frozen, or cryptic | "No items found." is not a design. Neither is an unlabelled spinner |
| Write a CTA that describes the system | "Submit", "Continue", "This feature allows you to…" — every word is a nudge; spend it on the user's why |

**The copy test, for every string you write:** read it aloud after "Now you can…". If it doesn't
make sense, rewrite it. And if you stripped the sentence to six words, would it still move the
user forward?

## The play index

Reach for these by name. Full cards — what it is, why it works, when, do, don't, founder tip,
pairs with — are in [references/plays.md](references/plays.md). Load that file whenever you're
about to commit to specifics; the constraints on the cards are the taste, and paraphrasing them
loses it.

| Play | Reach for it when |
| --- | --- |
| **Empty States** | A screen has nothing to show — after signup, first use, cleared content, no search results |
| **Setup Defaults** | Setup involves creation or configuration and the user faces a blank builder |
| **Time to Value** | Anything stands between a new user and the payoff they downloaded for |
| **Sandbox Experience** | A login or setup wall sits in front of value that's better felt than explained |
| **Momentum Bias** | A flow starts from zero and could start from "already underway" |
| **Progressive Disclosure** | The product is deep and the first screen is showing all of it |
| **Discovery** | Users don't know what's possible and are facing a blank canvas or a search box |
| **Micro Interactions** | An action fires with no confirmation that the app heard it |
| **Loading Feedback** | Anything takes longer than ~100ms |
| **Success Moments** | A user completed something that took real effort and nothing happened |
| **Small Quirk** | A repeated moment is clear, correct, and completely anonymous |
| **Perceived Effort Delay** | A considered result arrives so fast it reads as generic |
| **Pattern Alignment** | You're inventing an interaction users already have muscle memory for |
| **JTBD Copywriting** | Any string in the UI — buttons, empty states, errors, tooltips, modals |
| **Fail Safe** | An action is irreversible or expensive to get wrong |
| **Permission Serve** | You need location, notifications, camera, mic, or contacts |
| **Intentional Friction** | Speed is causing mistakes, or a pause would raise input quality or commitment |
| **Commitment** | Value depends on habit and the user hasn't declared what they want |
| **Investment** | User input could deepen attachment and sharpen the product at the same time |
| **Effort Moat** | Users have built something and can't see how much |
| **Personalisation** | Every user sees the same thing and the product knows better |
| **Intent Mirroring** | Behaviour signals intent — hesitating, backtracking, repeat filtering — and nothing responds |
| **Gamified Progress** | A multi-step process or habit loop needs visible forward motion |
| **System Widget** | The product has daily rhythm worth surfacing without opening the app |
| **Value Replay** | A user drifted away but their progress still exists |
| **Variable Reward** | A core action has gone monotonous and outcomes aren't mission-critical |
| **Deep-link** | A message promises something specific and would otherwise land on a home screen |
| **The Paywall** | A user has felt value and the upgrade is the logical next step |
| **Limited Offer** | Churn or hesitation is detected — skipped paywall, uninstall intent, trial expiry |
| **Spark Curiosity** | A reveal would be more powerful partially hidden than fully shown |
| **Referral** | A user just hit a win and their network would benefit |
| **Shareability** | The output reflects the user's taste, skill, or effort and they'd be proud of it |
| **Contact Bridge** | Connection is core to value and the user arrives alone |

## When not to reach for a play

Restraint is the part that reads as taste. The playbook is explicit that this is a modular system:
*combine, remix, ignore — use what fits, drop what doesn't.* A response that stacks eight plays
onto a simple screen has misunderstood it.

Say plainly that a moment doesn't need a play when:

- **The user is in a hurry and this is a utility moment.** Not every screen is an opportunity.
- **Clarity isn't solved yet.** Personality layers on top of clarity, never instead of it. Small
  Quirk explicitly waits until clarity is nailed.
- **The stakes are high.** Checkout, account recovery, payments, deletion — these want Fail Safe
  and Pattern Alignment and nothing else. Delight here reads as carelessness.
- **The data is what the user came for.** Decoration on information someone is trying to read
  hinders instead of helping.
- **It would be the third nudge in a row.** Interruptions compound. Count them across the whole
  flow, not per screen.

"This moment is already right, don't touch it" is a valid and useful answer.

## Output

When you build with the playbook, the deliverable is the work itself — the flow, the screens, the
copy, the code — not an essay about the work. Match the format to what was asked for.

Then close with a short **Plays used** note: the plays, and one clause on why each. If you
deliberately rejected a play the moment seemed to invite, say so and why — that's often the most
useful line in the response.

Keep Bartek's voice in anything user-facing: warm, direct, outcome-first, never robotic, never
corporate. Founder tips in the cards are written in that voice — match it.

## Invoked with no task

If this skill is invoked bare, with no question or task attached, respond only with:

> Ready. I'll build with Bartek Marzec's Product Design Playbook — 33 plays across 12 product
> strategies for products that feel considered instead of generic. Tell me what you're designing,
> or name a goal or metric you want to move.

Then wait.
