# Moment-by-Moment Review Checklist

What to check at each kind of user-facing moment, which plays govern it, and the exact constraints
to cite. Use this to sweep a flow systematically so nothing gets skipped — most review misses are
whole moment-types nobody thought to look at, not subtle judgment calls.

Full play cards are in [plays.md](plays.md). Quote constraints from there rather than
approximating; the specificity is what makes a finding actionable.

## Contents

[First run](#first-run) · [Empty states](#empty-states) · [Loading & waiting](#loading--waiting) · [Success](#success) · [Errors](#errors) · [Permission prompts](#permission-prompts) · [Paywall & upgrade](#paywall--upgrade) · [Destructive actions](#destructive-actions) · [CTAs & microcopy](#ctas--microcopy) · [Referral & share](#referral--share) · [Re-engagement](#re-engagement) · [Return visits](#return-visits) · [Search & discovery](#search--discovery) · [The whole flow](#the-whole-flow)

---

<a id="first-run"></a>
## First run — signup, onboarding, first session
*Plays: Time to Value · Setup Defaults · Momentum Bias · Progressive Disclosure · Sandbox Experience · Pattern Alignment*

- Count the steps between arrival and the first real payoff. **Target: value felt in under 3
  minutes.** In the worst case a user gives you **30 seconds** — what do they see, do, and feel?
- Does anything sit in this path that isn't required to reach first value? Tours, modals,
  profile fields, feature tours — each needs to justify its place or be deleted.
- Does the flow start from zero, or from "already underway"? Pre-filled fields, a completed first
  step, a generated draft, a starter template. Starting from zero is a missed Momentum Bias.
- Is progress real? Vanity checklist steps that count nothing are a finding, not a nicety.
- Is complexity staged, or is everything on screen at once? Can an experienced user skip ahead
  without penalty?
- Could any of this happen *before* signup? A login wall in front of value that's better felt than
  explained is a Sandbox Experience opportunity.

---

<a id="empty-states"></a>
## Empty states — nothing to show yet
*Plays: Empty States · Setup Defaults · JTBD Copywriting · Discovery · Progressive Disclosure*

- Is there a headline **and** microcopy explaining what to do next? "No items found." is not a
  design.
- Is there an action, or just an explanation? An empty state should be a prompt, not a placeholder.
- Does it show what "good" looks like — an example, an illustration, a demo, a template?
- Have the *other* empty states been designed, or just the main one? Check: filtered results with
  no match, search with no results, cleared content, first run of each section, error-adjacent
  empties.
- Does the tone match the brand, or is it system-voice?

---

<a id="loading--waiting"></a>
## Loading & waiting
*Plays: Loading Feedback · Perceived Effort Delay · Micro Interactions*

- **Anything over ~100ms needs feedback.** Page loads, uploads, searches, generation, sync.
- Is the feedback branded and specific, or a default spinner? Does it match the task — photos
  stacking while an album builds, not a generic circle?
- "Please wait…" with no context is a finding.
- Is a screen ever blank or frozen during a transition?
- Inverse check: is a *considered* result — a match, score, analysis, recommendation — arriving
  instantly and therefore reading as generic? A framed **1–3 second** pause ("Analysing your
  answers…") raises perceived value. This is the one place slowness is correct.
- Is the pause overused? Constant delays erode trust — it's the illusion of depth, not friction.

---

<a id="success"></a>
## Success — a key action just completed
*Plays: Success Moments · Micro Interactions · Effort Moat · Shareability · Referral · Permission Serve*

- Did something effortful just complete with no acknowledgement at all?
- Is the celebration proportionate? Short, emotionally charged, non-blocking. A long animation or
  loud effect that interrupts momentum is a finding.
- Is it earned? Celebrating trivial actions devalues every real one that follows.
- Does it acknowledge *effort*, not just outcome?
- Is this moment being used? Success is the correct place to ask for permission, a referral, a
  share, or feedback — an emotional peak with no ask following it is often a missed opportunity,
  and an ask *not* placed here is usually placed wrongly somewhere else.
- Onboarding checkpoints at 25% / 50% / 75% — are they marked?

---

<a id="errors"></a>
## Errors and failure states
*Plays: JTBD Copywriting · Fail Safe · Micro Interactions · Pattern Alignment*

- Does the message say what happened, in plain language, and what to do next?
- Is the user's work preserved? Losing input to an error is a trust event, not a bug.
- Is the error blaming the user?
- Is there a way forward from the screen, or is it a dead end?

---

<a id="permission-prompts"></a>
## Permission prompts — location, notifications, camera, mic, contacts
*Plays: Permission Serve · JTBD Copywriting · Success Moments · Contact Bridge*

- **Is the ask tied to something the user is doing right now?** A prompt at launch, or unrelated to
  current intent, is a block. You get one shot at the native opt-in.
- Is there a pre-frame — a short in-app explanation or preview — before the system dialog?
- Does it explain the benefit in one emotionally resonant line, or does it say "Improve your
  experience"?
- Are two prompts stacked back to back?
- Could this ask move to just after a success moment, where the feature is already wanted?
- Does the prompt feel like progress, or like a wall?

---

<a id="paywall--upgrade"></a>
## Paywall & upgrade
*Plays: The Paywall · Time to Value · Investment · Spark Curiosity · Limited Offer · Intentional Friction*

- **Has the user experienced value before this appears?** If not, that's the finding — everything
  else is secondary.
- Is it anchored to a moment: a completed action, a milestone, a streak, a taste of premium,
  post-setup when commitment bias is high?
- Does the copy lead with benefits and emotion, or list features?
- Any guilt-driven language? That's a finding.
- How many options? Too many muddies the decision — keep upgrade paths simple and decisive.
- Is a reverse trial possible — grant access, then pull it back with context?
- Does it reflect their journey back at them ("You've created 5 designs")?
- On skip or dismiss: is there a Limited Offer catching hesitation, or does the moment just pass?

---

<a id="destructive-actions"></a>
## Destructive & high-stakes actions
*Plays: Fail Safe · Intentional Friction · JTBD Copywriting · Pattern Alignment*

- Can anything irreversible fire on a single careless tap? That's a block.
- Is there a soft-delete, undo snackbar, or grace window? Prefer undo over a hard confirmation
  where possible — it's safer *and* faster.
- Does the language state the consequence plainly ("This can't be undone")?
- Is risk hidden behind a pattern that looks harmless, or an ambiguous icon?
- Is work auto-saved or drafted?
- Is there personality in here? There shouldn't be — checkout, payment, and recovery want
  convention and clarity, nothing else.

---

<a id="ctas--microcopy"></a>
## CTAs and microcopy
*Plays: JTBD Copywriting · Pattern Alignment · Small Quirk*

- Read every string aloud after **"Now you can…"**. If it doesn't make sense, it's a finding.
- Strip it to six words — does it still move the user forward?
- Any "Submit", "Continue", "Done", "OK" where the outcome could be named?
- Any system-voice constructions: "This feature allows you to…", "Please select…", jargon?
- Does the voice match the mindset — urgent where there's hesitation, warm where there's effort?
- Does it foreshadow what happens next, so the user feels in control?

---

<a id="referral--share"></a>
## Referral & share
*Plays: Referral · Shareability · Contact Bridge · Success Moments · Deep-link*

- **Is the ask after a win?** Before value, it's a chore.
- Is it native to the flow ("invite your team") or buried in a menu?
- Is there value for both sender and receiver?
- For share: is the artefact something the user is proud of — reflecting their taste, effort, or
  skill? Can they caption or personalise it so it reads as theirs, not your marketing?
- Is the cycle time short — prompted early, right after success — or does it wait until users are
  already cold?
- Where does the shared link land? A generic home screen after a specific promise is a Deep-link
  finding.

---

<a id="re-engagement"></a>
## Notifications & re-engagement
*Plays: Value Replay · Deep-link · Personalisation · Commitment · System Widget*

- Is the message specific ("Your 5th session") or generic ("Welcome back")?
- Does it resurface progress the user would be proud of, or does it just demand attention?
- Is it a growth nudge wearing a progress nudge's clothes? Users can tell.
- One clear CTA that builds on past momentum, or several competing?
- Does the user control frequency?
- Where does it land — the exact context promised, or the home screen?
- Is the volume defensible across a week, not just per message?

---

<a id="return-visits"></a>
## Return visits
*Plays: Deep-link · Effort Moat · Personalisation · Intent Mirroring · Value Replay*

- Does a returning user land where they left off, or at the beginning?
- Is their accumulated work visible and celebrated, or hidden behind navigation?
- Does the product remember preferences they've set, or ask again?
- Does anything respond to hesitation — pauses, backtracking, repeated filtering — or does the
  interface stay inert while the user struggles?

---

<a id="search--discovery"></a>
## Search & discovery
*Plays: Discovery · Empty States · Personalisation · Progressive Disclosure*

- Is there anything before the user types — popular, recent, suggested, "people also used"?
- Zero-results: is it a dead end, or does it suggest a way forward?
- Are suggestions personalised from behaviour, or the same for everyone?
- Is the user overwhelmed with options? Too many suggestions is its own failure.

---

<a id="the-whole-flow"></a>
## The whole flow — read it end to end
*The findings that only appear in sequence. Do this pass last, and never skip it.*

- **Count the interruptions in order.** Modals, prompts, tooltips, permission dialogs, upsells.
  Three in a row is a finding even when each is individually reasonable. This is where most flows
  actually fail, and it's invisible when reviewing screens one at a time.
- **Check every ask against the value that precedes it.** Walk the flow and mark each ask. For each
  one: what had the user felt by then? An ask with nothing before it is a block.
- **Where does the energy drop?** Find the longest stretch with no feedback, no progress, and no
  payoff. That's where they leave.
- **Is the pace right throughout?** Fast through the plumbing, deliberate at the moments of
  judgment. A flow that's uniformly paced is usually uniformly wrong in one direction.
- **Does it sound like one product?** Voice, tone, and personality consistent across the moments,
  or written by different people on different days.
- **What's the aha, and how far in is it?** If you can't identify it, that's the finding — and
  it's the most important one you'll make.
