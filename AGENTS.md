# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# HomeOS Context

Before making changes, read `000_Project_Docs/000_CURRENT_HOMEOS_STATUS.md`.

# Focused Work Areas

Read `docs/WORK_AREAS.md` before starting a feature change. Work in one listed area at a time, and also read the nearest feature-level `AGENTS.md` when present. Do not broaden a repair into another area unless the requested workflow truly crosses that boundary.

# Validation And Staging

Run `npx.cmd tsc --noEmit` and `git diff --check` unless explicitly instructed otherwise.
Inspect `git status --short` before reporting.
Stage only files for the requested pass.
Commit and push only when explicitly asked.

# Protected Paths

Never touch `bravo-relay-codex-hotfix/` unless explicitly requested.
