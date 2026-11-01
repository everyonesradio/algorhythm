---
name: algorhythm-motion
description: >-
  Algorhythm Motion animation craft — subtle, flowy UI motion with the `motion`
  package (`motion/react`). Use whenever building, reviewing, or fixing
  animations, transitions, page enters/exits, camera/scan feedback, waitlist
  toasts, drawers, modals, list reveals, hover/press micro-interactions, or
  when the user asks for motion, animation, spring, fade, or "flowy" feel.
  Prefer this skill for Algorhythm product UI; load the official `motion` skill
  for API details, docs search, springs, and audits.
---

# Algorhythm Motion — subtle & flowy

algoRhythm should feel **quiet and physical**: vinyl settling, soft fades, short
springs — never carnival UI. Motion is presence, not decoration.

## Stack (required)

| Piece | Use |
|-------|-----|
| Package | `motion` (installed). React: `import { motion, AnimatePresence, MotionConfig } from "motion/react"` |
| Official skill | `.cursor/skills/motion/` — best practices, codex, CSS spring, audits |
| Cursor rule | `.cursor/rules/motion.mdc` — fires on UI files; never `framer-motion` |
| MCP | Hosted `motion` / `motion-plus` (`https://mcp.motion.dev`) + local `user-motion` (`generate-css-spring`, `generate-css-bounce-easing`) |

**Never** import `framer-motion`. Prefer CSS `transition` for simple hover/color;
use Motion for springs, layout, exit, gesture, and coordinated sequences.

Also load **`design-engineering`** when craft bar / reduced-motion / “should this
animate?” is unclear. Pair **`playbook-build`** for user-facing moments.

## Aesthetic bar (Algorhythm)

1. **Subtle** — opacity + small translate/scale only. Typical enter:
   `opacity: 0 → 1`, `y: 8 → 0` or `scale: 0.98 → 1` (never `scale: 0`).
2. **Flowy** — soft springs (`type: "spring"`, low bounce `0–0.2`, perceptual
   duration ~0.25–0.45s). Avoid linear snaps and long marketing loops in product
   chrome.
3. **Short** — UI under ~300ms perceptual. Press feedback 100–160ms. Drawers /
   album panel 200–400ms. Skip animation on high-frequency actions.
4. **One job** — each motion has one purpose: feedback, spatial continuity, or
   state clarity. If you can’t name it, delete it.
5. **Reduced motion** — wrap the app (or page tree) in
   `<MotionConfig reducedMotion="user">`. Keep opacity/color when transforms
   are disabled.
6. **GPU** — animate `opacity` and `transform` (or Motion `x`/`y`/`scale` when
   not under load). No layout thrash for decoration.

## Where it belongs in this app

| Surface | Motion role |
|---------|-------------|
| Waitlist home | Soft brand/CTA presence; toast enter/exit via Motion or toast lib — no bounce spam |
| Scan vinyl | Permission / camera ready: calm fade; detection feedback brief; fail → gentle retry CTA |
| Digital album / drawer | Sheet rise with `ease`-out spring; platform link list stagger ≤ 40ms |
| Search / result cards | Layout morph when results swap (`layout` / `layoutId` sparingly) |
| 3D vinyl | Keep Three.js for 3D; use Motion only for DOM chrome around it |

## Default recipes

### Enter / exit (page section or panel)

```tsx
import { motion, AnimatePresence } from "motion/react";

<AnimatePresence mode="wait">
  {open && (
    <motion.div
      key="panel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ type: "spring", bounce: 0.12, duration: 0.35 }}
    />
  )}
</AnimatePresence>
```

### Soft list stagger (results)

```tsx
<motion.ul initial="hidden" animate="show" variants={{
  show: { transition: { staggerChildren: 0.04 } },
}}>
  {items.map((item) => (
    <motion.li
      key={item.id}
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0 },
      }}
      transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
    />
  ))}
</motion.ul>
```

### Press (buttons)

Prefer CSS `:active { transform: scale(0.97) }` with `transition: transform 120ms ease`.
Use Motion only if press must coordinate with layout.

### CSS spring (when Motion is overkill)

Call MCP `generate-css-spring` (bounce `0.1–0.2`, duration `0.3–0.4`) or load
`.cursor/skills/motion/css-spring/`.

## Decision order

1. Should it animate? (frequency table in `design-engineering`)
2. CSS transition enough? → CSS.
3. Need exit / layout / spring / gesture? → `motion/react`.
4. Need a spring curve in CSS? → Motion MCP / css-spring skill.
5. Auditing jank? → `motion` skill `performance-audit` (Motion+ may be required).

## Do / don’t

**Do**
- Import from `motion/react` in client components (pages router: any component
  that uses hooks/Motion is already client-side).
- Keep MotionConfig at `_app` when adding app-wide reduced-motion.
- Match existing visual language (no new purple glow / bounce-fest).

**Don’t**
- Animate everything on first paint.
- Use `ease-in` for UI enters.
- Start from `scale: 0` or huge `y` offsets.
- Install `framer-motion` or `motion-plus` without asking.
- Leave blank recognition fails — motion cannot replace Fail Safe UX.

## Verification

- [ ] No `framer-motion` imports
- [ ] Reduced motion respected (`MotionConfig` or CSS media)
- [ ] Durations stay short; bounce stays low
- [ ] Animation purpose is nameable
- [ ] Camera / recognition paths still have non-motion fallbacks

## Plays used (when shipping UI)

Close user-facing motion work with playbook **Plays used** when
`playbook-build` / `playbook-review` also applied (e.g. Perceived Effort Delay,
Fail Safe, Permission Serve).
