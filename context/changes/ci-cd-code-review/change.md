# Change: ci-cd-code-review

## Identity

- **id**: ci-cd-code-review
- **status**: in-progress
- **type**: feature
- **scope**: devops / ai-agent
- **target-branch**: module-5

## Summary

Introduce a GitHub Actions based AI code review pipeline for pull requests.
The agent runs as a reusable composite action, scores the diff against the
 team's Definition of Done, posts a PR comment and applies pass/fail labels.

## Acceptance Criteria

- [x] Review criteria defined and embedded in the agent (six dimensions, 1–10).
- [x] `scripts/review.ts` accepts PR title/body/diff and supports generic LLM provider config.
- [x] Composite action `.github/actions/ai-reviewer/action.yml` posts a PR comment and labels `ai-cr:passed` / `ai-cr:failed`.
- [x] Workflow `.github/workflows/review.yml` triggers on PRs to `master` / `dev` and on `workflow_dispatch`.
- [x] promptfoo eval harness with at least one fixture diff and static assertions.
- [x] Run the workflow on a real PR and capture evidence for the 10xChampion badge.
  - PR: https://github.com/piotrwrotny/BET/pull/2
  - Workflow run: https://github.com/piotrwrotny/BET/actions/runs/28552069211
  - Comment from `github-actions[bot]` posted, label `ai-cr:passed` applied.

## Decisions

- Used Gemma 4 31B as the green eval model because it returns clean JSON;
  Kimi K2.7-Code emits reasoning text and is kept out of the eval gate.
- Internal endpoints are not reachable from public GitHub runners; workflow
  uses generic `vars.LLM_*` inputs so a self-hosted runner or OpenRouter can
  be plugged in.
- Human-in-the-loop preserved: merge is not auto-blocked by the workflow;
  the red label is a strong signal for the reviewer/author to resolve before
  requesting final review.
