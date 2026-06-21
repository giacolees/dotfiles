# CI/CD Cross-Platform Verification Workflow — Design

## Goal

Add a GitHub Actions workflow that verifies, on every push and on every PR targeting `main`/`chezmoi-migration`, that this chezmoi config still applies cleanly across the OS versions this repo targets — without requiring manual Docker testing for every change.

## Scope

- A single workflow file, `.github/workflows/ci.yml`.
- A matrix job across `ubuntu-latest`, `ubuntu-22.04`, `macos-latest`.
- Verification steps that mirror what has so far been done manually: apply the chezmoi source against the runner's real `$HOME`, confirm `sgpt` installs and is reachable, confirm the `.zshrc` wrapper function shadows it, confirm the bootstrap script and `.zshrc` templates render to syntactically valid bash/zsh.
- Triggers: `push` (any branch) and `pull_request` targeting `main` or `chezmoi-migration`.

Out of scope: testing actual `sgpt`/LiteLLM API calls (no real API keys in CI — `secrets.env` does not exist on runners, and the `.zshrc` source line for it is a no-op when absent); testing oh-my-zsh plugin behavior beyond "clone succeeded"; any deployment step (this is verification-only, nothing gets published).

## Workflow Structure

### Trigger

```yaml
on:
  push:
  pull_request:
    branches: [main, chezmoi-migration]
```

### Matrix job

```yaml
jobs:
  verify:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, ubuntu-22.04, macos-latest]
    runs-on: ${{ matrix.os }}
```

`fail-fast: false` so one OS failing doesn't cancel the others — each leg's result is independently useful on a PR.

### Steps (same for every matrix leg, since the chezmoi templates already branch on `.chezmoi.os`)

1. `actions/checkout@v4`
2. Install chezmoi: `sh -c "$(curl -fsLS get.chezmoi.io)" -- -b ~/bin` (matches the README's documented install method), add `~/bin` to `$GITHUB_PATH`.
3. Apply directly from the checked-out source (no GitHub clone/auth needed, same pattern as the local Docker testing already used manually): `chezmoi apply --source "$GITHUB_WORKSPACE" --force`.
4. Verify `sgpt` is on `PATH`: `command -v sgpt`.
5. Verify the `.zshrc` wrapper function shadows the binary: `zsh -ic 'type sgpt'` and grep its output for `shell function`.
6. Verify template syntax directly (catches errors even if `apply` partially no-ops on a clean runner): render and lint both templates with `chezmoi execute-template`, `bash -n`, and `zsh -n`, the same commands already used manually in Tasks 1 and 3 of the shellgpt-integration plan.

## Error Handling

Each step uses the shell's default `set -e` (GitHub Actions runs each `run:` step as `bash -e` unless overridden), so any failing command — a bad apt package name, a `chezmoi apply` error, a missing `sgpt` binary — fails that step and that matrix leg, while the other legs continue (`fail-fast: false`). No custom retry or fallback logic: a transient failure (e.g. a flaky package mirror) is surfaced as a failed run, to be re-run manually via GitHub's UI rather than auto-retried, consistent with this repo's existing manual-verification philosophy of preferring visible signal over hidden retries.

## Testing

- The workflow itself is the test; there's no separate test suite to verify it with up front. It is validated by pushing it and observing all four matrix legs go green on the `shellgpt-integration` branch (which already contains the sgpt feature this workflow needs to verify).
- If any leg fails, the fix lives in whichever file caused it (bootstrap script, `.zshrc` template, or the workflow's own step commands) — not in the test itself, the same root-cause-first principle already applied during the chezmoi migration's Docker debugging.
