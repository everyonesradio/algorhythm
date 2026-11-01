# The Product Design Playbook, for your AI

You just added seven years of consumer product design to whatever AI you build with. All 33 named plays and all 12 product strategies from Bartek Marzec's Product Design Playbook, packaged as three skills your AI reads before it designs, plans, or critiques anything user-facing.

Once installed, the generic output stops: the empty state that says "No items found", the paywall that fires on launch, the button that says "Continue". Your AI starts reaching for named plays instead: Perceived Effort Delay, Effort Moat, Permission Serve, Spark Curiosity. The difference shows in the first screen you build with it.

## The three skills

Build it. Plan it. Review it. That's the whole system.

| Skill | What it does | Say something like |
| --- | --- | --- |
| **playbook-build** | Designs any moment a user will experience: screens, flows, copy, components. Picks 2 to 4 plays that reinforce each other and names them so you learn the system as you go. | "Design the onboarding for my meditation app" · "Write the empty state for the saved items tab" · "What should this button say?" |
| **playbook-plan** | Turns a goal or a stuck metric into a prioritised play stack with a measurement plan. Diagnoses why the number isn't moving before prescribing. | "My D7 retention is stuck at 12%" · "How do I get more free users to upgrade?" · "What should we build next to improve activation?" |
| **playbook-review** | Reviews an existing flow, screen, spec, or piece of copy at a high craft bar. Flags what fails the playbook and shows the fix. Approval is earned, not default. | "Would you ship this paywall?" · "Review my signup flow" · "What's wrong with this notification copy?" |

In Claude, you don't even have to name a skill: it notices when a task touches a user-facing moment and applies the right one on its own. In other tools, point your AI at the skill that matches the job and ask away.

## Installing

These are built in Claude's skill format, so Claude is where they trigger automatically. But every file is plain markdown, so they work in any AI tool that can read instructions or context files. Pick your setup below.

This package contains the same three skills twice, in the two formats different tools want: the `skills` folder holds them as plain folders (Claude Code, Cursor, ChatGPT and everything else), and `upload-these-on-claude-ai` holds them pre-zipped, because the claude.ai website only accepts skills as zip files. Use one or the other, never both.

### Claude Code (terminal, desktop app, or web)

Copy the three folders from `skills` into your skills directory:

```
~/.claude/skills/playbook-build/
~/.claude/skills/playbook-plan/
~/.claude/skills/playbook-review/
```

That's it. They're available in every project from your next session. Type `/playbook-build` to invoke one directly, or just describe what you're building and let it fire.

Prefer them in a single project only? Put the same folders in that project's `.claude/skills/` instead.

### Claude on the web (claude.ai)

The `upload-these-on-claude-ai` folder contains one ready-made zip per skill. Go to Settings, then Capabilities, then Skills, and upload all three. Done.

### Cursor

Copy the three folders from `skills` into your repo, for example under `playbook/`, then add a rule in `.cursor/rules` along these lines: "Before designing, planning, or reviewing anything user-facing, read the matching skill first: `playbook/playbook-build/SKILL.md` to create, `playbook/playbook-plan/SKILL.md` to strategise, `playbook/playbook-review/SKILL.md` to critique. Follow its references when committing to specifics."

### ChatGPT, Gemini, and everything else

Create a project (or a custom GPT, or a Gem) and upload the files from the skill folders in `skills`. In a plain chat, paste the SKILL.md of the matching skill at the start and attach its references files. Any AI that can read a document can use the playbook.

## What's inside each skill

Each folder holds a `SKILL.md` (how your AI should think with the playbook: the four spines, the quality bar, when NOT to use a play) plus a `references` folder with the complete play cards. Every card carries what it is, why it works, when to use it, do, don't, a founder tip, and which plays it pairs with. Nothing from the playbook was cut.

Don't ship just the SKILL.md file on its own. The folders belong together: the SKILL.md is the brain, the references are the knowledge.

## Three prompts to try right now

1. "Design the first-run experience for [your product]. I want people to feel the value before I ask them to sign up."
2. "Users churn in week one. Here's what my product does: [description]. Plan what I should change."
3. Paste a screenshot or describe your current paywall, then ask: "Would you ship this?"

Watch for the **Plays used** note at the end of each answer. That's the playbook teaching you its vocabulary while it works.

Questions? bartek@consumerapp.studio
