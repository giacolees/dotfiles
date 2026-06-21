# ShellGPT Multi-Provider Integration — Design

## Goal

Add `sgpt` (ShellGPT) shell-command suggestions to the chezmoi-managed dotfiles, with the LLM backend switchable between OpenRouter and Gemini, and a zsh keybinding to invoke it.

## Scope

- Install `sgpt` (with LiteLLM support) via the existing bootstrap script, on both macOS and Ubuntu.
- Add a chezmoi-tracked `sgpt` config file with no secrets in it.
- Add a `SGPT_PROVIDER` environment variable that selects the active provider for a shell session, defaulting to OpenRouter when unset.
- Add a `sgpt` wrapper function in `.zshrc` that maps `SGPT_PROVIDER` to the right `--model` flag.
- Add the standard Ctrl+L zsh widget that turns the current command-line buffer into a shell command suggestion via `sgpt --shell`.
- Document the new secrets and behavior in the README.

Out of scope: any provider beyond OpenRouter/Gemini, any UI beyond the standard sgpt Ctrl+L recipe, any persistent cross-session default-provider storage (provider choice is per-shell-session only, via `export SGPT_PROVIDER=...`).

## Components

### 1. Package install (`run_onchange_install-packages.sh.tmpl`)

Add, after the existing oh-my-zsh/plugin block, OS-independent steps:
- Ensure `pipx` is present: `brew install pipx` on macOS, `sudo apt-get install -y pipx` on Ubuntu (inside the existing OS branches), guarded by `command -v pipx`.
- Ensure `sgpt` is installed: `pipx install "shell-gpt[litellm]"`, guarded by `command -v sgpt`.

This keeps the script idempotent (re-running `run_onchange_` doesn't reinstall) and keeps `sgpt`/LiteLLM (pure Python) out of the OS-specific branches except for the `pipx` bootstrap itself.

### 2. ShellGPT config (`dot_config/shell_gpt/dot_sgptrc`)

A new chezmoi-managed static file, applied to `~/.config/shell_gpt/.sgptrc`. Contains `USE_LITELLM=true` plus sgpt's other defaults (default role, default model placeholder, etc.) — no API keys live here. LiteLLM resolves `OPENROUTER_API_KEY` / `GEMINI_API_KEY` directly from the environment based on the model string prefix (`openrouter/...`, `gemini/...`), so this file never touches a secret.

### 3. `.zshrc` additions (`dot_zshrc.tmpl`)

OS-independent block (no `.chezmoi.os` branching needed — pure zsh/POSIX):

```sh
export SGPT_PROVIDER="${SGPT_PROVIDER:-openrouter}"
sgpt() {
  local model
  case "$SGPT_PROVIDER" in
    openrouter) model="openrouter/anthropic/claude-3.5-sonnet" ;;
    gemini)     model="gemini/gemini-1.5-pro" ;;
    *) echo "Unknown SGPT_PROVIDER: $SGPT_PROVIDER" >&2; return 1 ;;
  esac
  command sgpt --model "$model" "$@"
}

# Ctrl+L: turn the current buffer into a shell command suggestion
_sgpt_zsh() {
  if [[ -n "$BUFFER" ]]; then
    local _prev=$BUFFER
    BUFFER+="⌛"
    zle -I && zle redisplay
    BUFFER=$(sgpt --shell <<< "$_prev" --no-interaction)
    zle end-of-line
  fi
}
zle -N _sgpt_zsh
bindkey ^l _sgpt_zsh
```

To switch providers for a session: `export SGPT_PROVIDER=gemini` then `exec zsh` (or open a new shell). Default with `SGPT_PROVIDER` unset is OpenRouter.

### 4. Secrets

Two new keys the user adds themselves to the existing untracked `~/.config/secrets.env` (chmod 600, already excluded via `.chezmoiignore`, already sourced by `.zshrc`):

```sh
export OPENROUTER_API_KEY="..."
export GEMINI_API_KEY="..."
```

Never pasted into chat; user edits the file directly. No change needed to `.chezmoiignore` (already covers this file).

### 5. README update

Add a "ShellGPT suggestions" section under Features documenting: `Ctrl+L` behavior, `SGPT_PROVIDER` env var and default, and the two new required secrets.env keys (alongside the existing `ANTHROPIC_API_KEY` example block).

## Error handling

- Unknown `SGPT_PROVIDER` value: the wrapper function prints an error and returns 1 without invoking `sgpt`.
- Missing API key for the selected provider: surfaces as whatever error LiteLLM/sgpt raises natively (no extra handling added — this matches how the existing `secrets.env` pattern already behaves for `ANTHROPIC_API_KEY`).

## Testing

- `chezmoi diff` / `chezmoi apply --force` on macOS (as already done for the migration) to confirm the new config file and `.zshrc` block land correctly.
- Reuse the Ubuntu Docker verification approach from the chezmoi migration (mount source dir, `chezmoi apply --source /source --force`) to confirm `pipx`/`sgpt` install on a fresh Ubuntu container and that the `.zshrc` wrapper/keybinding load without errors (`zsh -ic "type sgpt"`).
- Manual check: `export SGPT_PROVIDER=gemini; zsh -ic 'echo $SGPT_PROVIDER'` confirms the override behavior; new shell with unset var confirms default-to-openrouter.
