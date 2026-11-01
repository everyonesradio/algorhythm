---
name: design-engineering
description: Guiding principles for animation and UI craft, built for our React + Motion (motion.dev / Framer Motion) + Ant Design stack. Use when building, reviewing, or auditing motion and interactive UI — enter/exit transitions, springs, drag/swipe/gesture, popovers, drawers, toasts, hover/press feedback, easing/duration decisions, reduced-motion, or when deciding whether something should animate at all. Also names loosely-described motion effects and picks the right frontend library for a task.
---

# Design Engineering

Principles for building interfaces that feel right. The substance comes from Emil Kowalski's design engineering philosophy ([animations.dev](https://animations.dev/)) and Apple's fluid-interface talks, adapted for our stack.

## Our stack

- **Animation library: Motion** (`motion` / Framer Motion, [motion.dev](https://motion.dev)). Reach for it for springs, layout animations, exit animations, and gesture-driven values. A simple hover or fade doesn't need it — plain CSS transitions are the right tool there.
- **Components: Ant Design + `src/components/`.** Compose existing primitives before inventing new ones (see `.cursor/rules/design-rules.mdc`).
- **Styling: styled-components + global CSS.** Reusable durations, curves and springs live in `src/styles/designTokens.ts` (`motion`), which Ant reads through `src/styles/theme.ts`. Import them rather than hand-typing values per component, and don't invent a `tokens.css`. Which things may move at all is decided by the `patchbay-design-language` skill (`references/motion.md`).

## The one rule above all

Restraint. The best animation is often no animation. Over-animated, sluggish interfaces are the failure mode this skill exists to prevent. A short list of high-conviction motion beats decorating everything.

## Animation decision framework

Answer these in order before writing any animation:

**1. Should it animate at all? (frequency)**

| Frequency | Decision |
| --- | --- |
| 100+/day (keyboard shortcuts, command palette) | No animation. Ever. |
| Tens/day (hover, list navigation) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare / first-time (onboarding, success, celebration) | Delight budget lives here |

Never animate keyboard-initiated actions.

**2. What's the purpose?** Name one: feedback, spatial consistency, state indication, preventing a jarring change, or explanation. "It looks cool" on a frequently-seen element is not valid.

**3. Easing.** Entering/exiting → `ease-out`; moving/morphing on screen → `ease-in-out`; hover/color → `ease`; constant motion → `linear`. Built-in CSS easings are too weak — use strong custom curves as tokens:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

Never `ease-in` on UI — it delays the moment the user watches most.

**4. Duration — UI stays under 300ms.** Press feedback 100–160ms; tooltips/small popovers 125–200ms; dropdowns/selects 150–250ms; modals/drawers 200–500ms; marketing can be longer.

## Non-negotiables

- **Never animate from `scale(0)`** — start from `scale(0.95)` + `opacity: 0`.
- **Popovers/dropdowns/tooltips scale from their trigger** (`transform-origin: var(--transform-origin)`), not center. Modals are exempt — they stay centered.
- **Press feedback**: `transform: scale(0.97)` on `:active`, subtle (0.95–0.98).
- **GPU only**: animate `transform` and `opacity`. Note: Motion/Framer Motion `x`/`y`/`scale` shorthands are NOT hardware-accelerated — use the full `transform` string under load.
- **Interruptibility**: CSS transitions/springs for rapidly-triggered or gesture-driven motion, never keyframes that restart from zero.
- **Accessibility**: honor `prefers-reduced-motion` (gentler, not zero) and gate hover motion behind `@media (hover: hover) and (pointer: fine)`.

## Reference docs — load on demand

| When you're… | Read |
| --- | --- |
| Building or reviewing UI/motion, need the full philosophy, component recipes, CSS/clip-path/gesture patterns | [design-engineering-philosophy.md](design-engineering-philosophy.md) |
| Building gesture-driven UI, springs, drag/swipe/sheets, momentum, translucent materials, typography | [apple-design.md](apple-design.md) |
| Naming a motion effect the user described loosely ("what's it called when…") | [animation-vocabulary.md](animation-vocabulary.md) |
| Searching a codebase/UI for places that should animate (and rejecting those that shouldn't) | [find-animation-opportunities.md](find-animation-opportunities.md) |
| Auditing a codebase's motion and producing prioritized, self-contained improvement plans | [improve-animations.md](improve-animations.md) — uses [AUDIT.md](AUDIT.md) and [PLAN-TEMPLATE.md](PLAN-TEMPLATE.md) |
| Reviewing an animation diff against a high craft bar | [review-animations.md](review-animations.md) — uses [STANDARDS.md](STANDARDS.md) |
| Picking a library for a frontend task (numbers, OTP, charts, command menus, virtualization, drag & drop, toasts, state, styling) | [pick-ui-library.md](pick-ui-library.md) |

## Review output format

When reviewing UI/motion code, use a single markdown table with `| Before | After | Why |` columns — one row per issue. Never a "Before:/After:" list. See [review-animations.md](review-animations.md) for the full method and verdict format.
