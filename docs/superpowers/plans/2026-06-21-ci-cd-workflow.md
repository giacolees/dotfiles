# CI/CD Cross-Platform Verification Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions workflow that verifies, on every push and PR, that this chezmoi config still applies cleanly across `ubuntu-latest`, `ubuntu-22.04`, `macos-latest`, and `macos-13`.

**Architecture:** A single workflow file (`.github/workflows/ci.yml`) with one matrix job. Each leg checks out the repo, installs chezmoi, runs `chezmoi apply --source "$GITHUB_WORKSPACE" --force` against the runner's real `$HOME`, then runs the same checks already proven manually on this branch: confirm `sgpt` is on `PATH`, confirm the `.zshrc` wrapper function shadows it, and lint both templates (`bash -n` / `zsh -n` on their rendered output).

**Tech Stack:** GitHub Actions, chezmoi, bash, zsh.

This repo has no automated test suite — "testing" the workflow means pushing it and watching the Actions run go green across all four matrix legs, same as the manual macOS/Docker verification already done for the shellgpt feature.

## Global Constraints

- Workflow file path: exactly `.github/workflows/ci.yml`.
- Triggers: `push` (no branch filter — every branch) and `pull_request` targeting `main` and `chezmoi-migration` only.
- Matrix: exactly `ubuntu-latest`, `ubuntu-22.04`, `macos-latest`, `macos-13`, with `fail-fast: false`.
- No secrets are referenced or required anywhere in the workflow — CI never has `~/.config/secrets.env`, and nothing in this workflow should assume it exists.
- `chezmoi apply` runs against `$GITHUB_WORKSPACE` as the source (the already-checked-out repo), not a fresh `chezmoi init` from GitHub — avoids needing any GitHub auth for a private-repo clone inside the job.
- No deployment, publishing, or release steps — verification only.

---

### Task 1: Add the CI workflow file

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the existing `run_onchange_install-packages.sh.tmpl` and `dot_zshrc.tmpl` templates (unmodified by this task) as the artifacts under verification.
- Produces: nothing consumed by a later task in this plan — Task 2 only pushes and observes this file's behavior on GitHub's infrastructure.

- [ ] **Step 1: Create the directory and workflow file**

Create `.github/workflows/ci.yml` with exactly this content:

```yaml
name: CI

on:
  push:
  pull_request:
    branches: [main, chezmoi-migration]

jobs:
  verify:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, ubuntu-22.04, macos-latest, macos-13]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Install chezmoi
        run: |
          sh -c "$(curl -fsLS get.chezmoi.io)" -- -b "$HOME/bin"
          echo "$HOME/bin" >> "$GITHUB_PATH"

      - name: Apply chezmoi config from checked-out source
        run: chezmoi apply --source "$GITHUB_WORKSPACE" --force

      - name: Verify sgpt is on PATH
        run: command -v sgpt

      - name: Verify .zshrc wrapper shadows the sgpt binary
        run: |
          zsh -ic 'type sgpt' | tee /tmp/sgpt-type.txt
          grep -q "shell function" /tmp/sgpt-type.txt

      - name: Lint bootstrap script template
        run: |
          chezmoi execute-template < "$GITHUB_WORKSPACE/run_onchange_install-packages.sh.tmpl" > /tmp/bootstrap-check.sh
          bash -n /tmp/bootstrap-check.sh

      - name: Lint .zshrc template
        run: |
          chezmoi execute-template < "$GITHUB_WORKSPACE/dot_zshrc.tmpl" > /tmp/zshrc-check.zsh
          zsh -n /tmp/zshrc-check.zsh
```

- [ ] **Step 2: Validate the YAML syntax locally**

Run: `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo YAML_OK`
Expected output: `YAML_OK`

If `python3`/`pyyaml` is unavailable, use this equivalent instead:
Run: `ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml'); puts 'YAML_OK'"`
Expected output: `YAML_OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add cross-platform verification workflow"
```

---

### Task 2: Push and confirm all four matrix legs pass

**Files:**
- None created or modified — this task only pushes Task 1's commit and observes GitHub Actions.

**Interfaces:**
- Consumes: `.github/workflows/ci.yml` from Task 1.
- Produces: nothing — final task in this plan.

- [ ] **Step 1: Push the branch**

Run: `git push`
Expected: pushes the new commit to `origin/shellgpt-integration` (already tracked from the earlier PR #2 push).

- [ ] **Step 2: Watch the workflow run**

Run: `gh run watch $(gh run list --branch shellgpt-integration --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')`

Expected: the command streams live status for all four matrix legs (`verify (ubuntu-latest)`, `verify (ubuntu-22.04)`, `verify (macos-latest)`, `verify (macos-13)`) and exits 0 once all complete successfully.

- [ ] **Step 3: If any leg fails, fix the root cause**

Run: `gh run view --log-failed $(gh run list --branch shellgpt-integration --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')`

Read the failing step's output. Common causes to check first:
- A package name differs between Ubuntu versions (e.g. `pipx` not in `ubuntu-22.04`'s default repos at the same version) — adjust the install step in `run_onchange_install-packages.sh.tmpl` if so, following the existing `command -v` guard pattern already used in that file.
- A macOS Homebrew formula behaving differently between `macos-latest` and `macos-13` — same fix location.

If a fix is needed, edit the relevant file (not the workflow itself, unless the failure is in the workflow's own step commands), commit, push, and repeat Step 2.

- [ ] **Step 4: Confirm the PR shows the check**

Run: `gh pr checks 2`
Expected: lists the `verify` matrix legs as part of PR #2's checks, all passing.

---

## Self-Review Notes

- **Spec coverage:** trigger config, matrix OS list, `fail-fast: false`, all five verification steps (chezmoi apply, `sgpt` on PATH, wrapper shadowing, two template lints), and the "no secrets in CI" constraint are all present in Task 1's workflow file. Task 2 covers the "watch all four legs go green" testing approach called out in the spec.
- **Placeholder scan:** no TBD/TODO; the workflow YAML and all commands are complete and runnable as written.
- **Consistency:** the verification commands in Task 1 (`command -v sgpt`, `zsh -ic 'type sgpt'`, `chezmoi execute-template` + `bash -n`/`zsh -n`) are the exact same commands already run manually and proven to work on this branch (Tasks 1, 3, and 4 of the shellgpt-integration plan), so no new untested command sequences are introduced.
