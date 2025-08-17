# Improvements and Recommendations — Profile-Based Security System (PR #2)

This document summarizes recommended improvements to the new profile-based security system (strict, default, permissive), the `set-profile` command, config/schema updates, and fast-approval logic.

## Summary

- Positive: Profiles provide clear risk tiers; default posture is cautious; profile-scoped prompts are a good foundation.
- Focus Areas:
  - Make the policy explicit and testable.
  - Fail-closed behavior for unknown ops and config errors.
  - Strong config validation, schema versioning, and migration.
  - Mandatory confirmations for destructive or high-impact operations.
  - Auditing, logging, and test coverage across the profile matrix.
  - UX safeguards for `set-profile`, especially in CI/non-interactive contexts.
  - Prompt template hardening and runtime error handling.

---

## 1) Policy Model and Guarantees

- Publish an explicit operation-policy matrix for each profile (and enforce it in code).
- Fail-closed: Unknown operations or missing policy entries should require confirmation.
- Always require confirmation (across all profiles) for destructive/high-impact operations:
  - File deletions or overwrites outside staged changes
  - Shell execution and network calls
  - Git pushes, dependency installs, credential/secrets access
- Provide time-bounded “fast approval” and require justification for elevated actions.
- Add a global “dry-run” mode to preview changes without writes.
- Add per-operation overrides (e.g., `--confirm-once`, `--no-write`) that cannot silently downgrade safeguards.

### Recommended Matrix to Document (example)
| Operation                       | strict        | default       | permissive    |
|---------------------------------|---------------|---------------|---------------|
| Read-only actions               | auto-allow    | auto-allow    | auto-allow    |
| Write within workspace          | confirm       | confirm       | auto-allow    |
| Delete/overwrite files          | confirm       | confirm       | confirm       |
| Run shell commands              | confirm       | confirm       | confirm       |
| Network requests                | confirm       | confirm       | confirm       |
| Git commit                      | confirm       | confirm       | auto-allow    |
| Git push                        | confirm       | confirm       | confirm       |
| Dependency install/update       | confirm       | confirm       | confirm       |
| Access secrets/credentials      | confirm       | confirm       | confirm       |

Note: Even in “permissive”, keep confirmations for destructive/high-risk areas.

---

## 2) Config and Schema

- Add schema versioning (e.g., `schemaVersion`) and explicit migration steps.
- Validate configuration strictly with clear error messages; fail-closed on errors.
- Define precedence: CLI flags > env vars > repo config > global config.
- Support per-repo overrides while allowing a global default profile.
- Prevent silent profile downgrades via scripts; require TTY or explicit `--force` for permissive.
- Provide `config.example.yml` and document all fields with defaults.

Example (to include in docs/examples):
```yaml
schemaVersion: 1
profile: default  # strict | default | permissive
fastApproval:
  enabled: true
  ttlSeconds: 600
  requireJustification: true
ci:
  enforceStrictProfile: true
  allowPermissive: false
logging:
  level: info
  auditFile: .logs/security-audit.log
```

---

## 3) `set-profile` Command UX

- Show a summary/diff of what changes when switching profiles; require confirmation.
- Persist profile selection clearly (and show where it’s stored).
- Disallow switching to permissive in non-interactive contexts unless `--force` is given.
- Provide `--show` to print current profile and effective policy.
- Add shell completions and thoughtful error messages.

---

## 4) Fast Approval Logic

- Centralize fast-approval gating in a single module to avoid bypasses.
- Require justification for elevated approvals; log who/when/why with TTL.
- Add rate limiting/cooldown to prevent approval storms.
- Ensure expirations are enforced and visible in the audit log.

---

## 5) Logging and Auditability

- Structured logs with: timestamp, user, repo, profile, operation, path(s), result (allowed/blocked/confirmed), justification.
- Redact secrets and sensitive paths.
- Provide a lightweight `audit` subcommand to view and filter recent security events.
- Document retention and rotation recommendations.

---

## 6) Testing Strategy

- Unit tests:
  - Operation-policy matrix for each profile (table-driven).
  - Fail-closed behavior on unknown ops and invalid configs.
  - Fast-approval TTL and justification requirements.
- Integration/E2E:
  - CLI interactions for `set-profile` including non-interactive modes.
  - CI mode defaults (strict) and override guards.
  - Regression tests for destructive action confirmations.
- Snapshot tests for prompt templates per profile.
- Concurrency/parallel execution tests to ensure a single source of truth.

---

## 7) Prompt Templates (Security Hardening)

- Validate and sanitize all template variables; avoid injecting untrusted content verbatim.
- Include explicit guardrails in prompts clarifying the active profile and allowed actions.
- Provide fallback behavior if a profile template is missing; fail-closed with a clear message.
- Document how to extend or customize prompts safely.

---

## 8) CI/CD and Non-Interactive Environments

- Default to `strict` in CI, regardless of repo config, unless explicitly overridden.
- Forbid permissive in CI without `--force` and a clear, logged justification.
- Ensure exit codes reflect blocked actions to fail pipelines fast.
- Document recommended CI configuration snippets.

---

## 9) Documentation

- Add a quickstart for profiles with decision guidance (when to use which).
- Include the full operation-policy matrix, threat model assumptions, and trust boundaries.
- Migration notes for existing users (breaking changes and safe upgrades).
- Troubleshooting for common validation errors and non-interactive edge cases.

---

## 10) Implementation Notes

- Separate policy evaluation, config loading, and I/O execution.
- Use a typed schema and central config loader; avoid scattered conditionals.
- Single source of truth for “current profile” and effective policy.
- Consistent error handling strategy with actionable messages.

---

## Acceptance Checklist

- [ ] Operation-policy matrix implemented and documented; unknown ops fail-closed.
- [ ] Destructive/high-impact ops require confirmation in all profiles.
- [ ] Schema versioning, strict validation, and migration path in place.
- [ ] `set-profile` has confirmations, TTY checks, `--force`, and `--show`.
- [ ] Centralized fast-approval with TTL, justification, and rate limiting.
- [ ] Structured audit logs with redaction and an `audit` view command.
- [ ] Comprehensive tests: unit, integration, snapshot, CI behavior, concurrency.
- [ ] Prompt templates validated, with safe fallbacks and clear guardrails.
- [ ] CI defaults to strict; permissive requires explicit override with justification.
- [ ] Docs updated (quickstart, matrix, threat model, migration, troubleshooting).

---
