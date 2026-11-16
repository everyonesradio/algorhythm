# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately — **do not open a public issue or pull request**.

- Use GitHub's **Report a vulnerability** button on the Security tab of this repository (private vulnerability reporting), or
- email <security contact>.

Include what you found, where (file/endpoint), how to reproduce it with test data, and the impact you expect. We'll acknowledge within 3 business days, share a remediation plan within 10, and credit you when the fix ships if you'd like.

## Scope

In scope: this repository's code and its deployed services. Out of scope: denial-of-service and volumetric testing, social engineering, physical attacks, third-party services we integrate with (report those to the vendor), and findings that require a compromised device or account.

Test only against your own accounts and data. Don't access, modify, or delete other users' data, and stop and report as soon as you've confirmed an issue.

## How we handle security work

Agents and engineers follow the `security-harness` skill (`.claude/skills/security-harness/`) and the repo threat model (`docs/security/THREAT-MODEL.md`): threat model first, proof against unmodified code, an independent validator, the smallest fix with a regression test, and human review before merge.
