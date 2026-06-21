# ShellGPT Multi-Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `sgpt` shell-command suggestions to the chezmoi dotfiles, switchable between OpenRouter and Gemini via `SGPT_PROVIDER`, with a Ctrl+L zsh keybinding.

**Architecture:** Extend the existing `run_onchange_install-packages.sh.tmpl` bootstrap script to install `pipx` and `pipx install "shell-gpt[litellm]"`. Add a new chezmoi-tracked file at `dot_config/shell_gpt/dot_sgptrc` (applies to `~/.config/shell_gpt/.sgptrc`) with `USE_LITELLM=true` and no secrets. Add a `SGPT_PROVIDER`-aware `sgpt` wrapper function plus a Ctrl+L zle widget to `dot_zshrc.tmpl`. Document the two new required `secrets.env` keys and the new behavior in `README.md`.

**Tech Stack:** chezmoi (Go templates), bash (bootstrap script), zsh (`.zshrc`), `sgpt` (ShellGPT) with the LiteLLM extra, `pipx`.

This is a config/infra repo with no automated test suite. "Tests" here means `chezmoi diff`/`chezmoi apply --force` against the live machine, and a fresh Ubuntu Docker container running `chezmoi apply --source /source --force`, following the same pattern already used and proven for this repo's earlier migration work.

## Global Constraints

- Never commit secrets. `OPENROUTER_API_KEY` and `GEMINI_API_KEY` are added by the user directly to the existing untracked `~/.config/secrets.env` (chmod 600), never pasted into chat, never written by any script in this repo.
- The new `dot_config/shell_gpt/dot_sgptrc` file must contain no API keys — LiteLLM resolves provider keys from the environment based on the model string prefix (`openrouter/...`, `gemini/...`).
- `SGPT_PROVIDER` defaults to `openrouter` when unset (`export SGPT_PROVIDER="${SGPT_PROVIDER:-openrouter}"`).
- Model mapping is fixed: `openrouter` → `openrouter/anthropic/claude-3.5-sonnet`, `gemini` → `gemini/gemini-1.5-pro`.
- The Ctrl+L keybinding and the `sgpt` wrapper function must be OS-independent (no `.chezmoi.os` branching) — `sgpt`/LiteLLM are pure Python, no platform-specific behavior.
- The `pipx`/`sgpt` install steps must be idempotent (guarded by `command -v pipx` / `command -v sgpt`), matching the existing guards in `run_onchange_install-packages.sh.tmpl` for oh-my-zsh and its plugins.
- Do not modify `.chezmoiignore` — `.config/secrets.env` is already excluded.

---

### Task 1: Bootstrap script — install pipx and sgpt

**Files:**
- Modify: `run_onchange_install-packages.sh.tmpl`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a `sgpt` binary on `$PATH` (via `pipx`), used by Task 3's `.zshrc` wrapper function and Task 4's verification.

Current file content (for reference — this is the exact file before this task's edit):

```bash
#!/bin/bash
set -euo pipefail

{{ if eq .chezmoi.os "darwin" -}}
brew install neovim gh
if [ ! -d /Applications/Ghostty.app ] && ! brew list --cask ghostty &>/dev/null; then
  brew install --cask ghostty
fi
{{ else -}}
sudo apt-get update
sudo apt-get install -y neovim gh git curl zsh
if [ ! -d /home/linuxbrew/.linuxbrew ]; then
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
{{ end -}}

if [ ! -d "$HOME/.oh-my-zsh" ]; then
  KEEP_ZSHRC=yes RUNZSH=no CHSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
fi

ZSH_CUSTOM="$HOME/.oh-my-zsh/custom"
PLUGINS="
zsh-autosuggestions https://github.com/zsh-users/zsh-autosuggestions
zsh-syntax-highlighting https://github.com/zsh-users/zsh-syntax-highlighting.git
zsh-bat https://github.com/fdellwing/zsh-bat.git
you-should-use https://github.com/MichaelAquilina/zsh-you-should-use.git
"
echo "$PLUGINS" | while read -r name url; do
  [ -z "$name" ] && continue
  dest="$ZSH_CUSTOM/plugins/$name"
  if [ ! -d "$dest" ]; then
    git clone --depth 1 "$url" "$dest"
  fi
done
```

- [ ] **Step 1: Add `pipx` install to each OS branch**

Edit the two OS branches so they read exactly:

```bash
{{ if eq .chezmoi.os "darwin" -}}
brew install neovim gh
if [ ! -d /Applications/Ghostty.app ] && ! brew list --cask ghostty &>/dev/null; then
  brew install --cask ghostty
fi
if ! command -v pipx &>/dev/null; then
  brew install pipx
fi
{{ else -}}
sudo apt-get update
sudo apt-get install -y neovim gh git curl zsh
if [ ! -d /home/linuxbrew/.linuxbrew ]; then
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
if ! command -v pipx &>/dev/null; then
  sudo apt-get install -y pipx
fi
{{ end -}}
```

- [ ] **Step 2: Add `sgpt` install after the plugin-cloning loop**

Append this block at the end of the file (after the `done` that closes the `PLUGINS` while-loop):

```bash

if ! command -v sgpt &>/dev/null; then
  pipx install "shell-gpt[litellm]"
fi
```

- [ ] **Step 3: Verify the full file's templating is syntactically valid**

Run: `chezmoi execute-template < run_onchange_install-packages.sh.tmpl > /tmp/sgpt-bootstrap-check.sh && bash -n /tmp/sgpt-bootstrap-check.sh && echo SYNTAX_OK`

Expected output: `SYNTAX_OK` (no bash syntax errors). Then `rm /tmp/sgpt-bootstrap-check.sh`.

- [ ] **Step 4: Commit**

```bash
git add run_onchange_install-packages.sh.tmpl
git commit -m "feat: install pipx and shell-gpt[litellm] in bootstrap script"
```

---

### Task 2: ShellGPT config file

**Files:**
- Create: `dot_config/shell_gpt/dot_sgptrc`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `~/.config/shell_gpt/.sgptrc` on disk after `chezmoi apply`, read by the `sgpt` binary installed in Task 1.

- [ ] **Step 1: Create the directory and config file**

Create `dot_config/shell_gpt/dot_sgptrc` with exactly this content (this mirrors `sgpt`'s own default `.sgptrc` template, with `USE_LITELLM` turned on and no API key fields — LiteLLM reads keys from the environment instead):

```ini
CHAT_CACHE_PATH=/tmp/chat_cache
CACHE_PATH=/tmp/cache
CHAT_CACHE_LENGTH=100
CACHE_LENGTH=100
REQUEST_TIMEOUT=60
DEFAULT_MODEL=openrouter/anthropic/claude-3.5-sonnet
DEFAULT_COLOR=magenta
ROLE_STORAGE_PATH=/tmp/sgpt_roles
DEFAULT_EXECUTE_SHELL_CMD=false
DISABLE_STREAMING=false
CODE_THEME=dracula
OPENAI_FUNCTIONS_PATH=/tmp/sgpt_functions
OPENAI_USE_FUNCTIONS=false
SHOW_FUNCTIONS_OUTPUT=false
API_BASE_URL=default
PRETTIFY_MARKDOWN=true
USE_LITELLM=true
SHELL_INTERACTION=true
OS_NAME=auto
SHELL_NAME=auto
```

`DEFAULT_MODEL` here is only the static fallback `sgpt` uses if invoked directly (bypassing the `.zshrc` wrapper from Task 3); the wrapper always passes an explicit `--model` flag based on `SGPT_PROVIDER`, which takes precedence.

- [ ] **Step 2: Verify chezmoi will apply it to the right target path**

Run: `chezmoi target-path dot_config/shell_gpt/dot_sgptrc`
Expected output: `/Users/giacomolisita/.config/shell_gpt/.sgptrc`

- [ ] **Step 3: Commit**

```bash
git add dot_config/shell_gpt/dot_sgptrc
git commit -m "feat: add shell-gpt config with litellm enabled"
```

---

### Task 3: zsh wrapper function and Ctrl+L keybinding

**Files:**
- Modify: `dot_zshrc.tmpl`

**Interfaces:**
- Consumes: the `sgpt` binary from Task 1 (assumed on `$PATH`); `OPENROUTER_API_KEY`/`GEMINI_API_KEY` from `~/.config/secrets.env` (sourced at the bottom of this same file, already in place — see file content below).
- Produces: a callable `sgpt` zsh function (overrides the binary so every invocation in this shell goes through the provider-mapping logic) and a `^L`-bound zle widget `_sgpt_zsh`, both available to Task 4's verification.

Current end of file (for reference — this is the exact tail of `dot_zshrc.tmpl` before this task's edit):

```
gif() { ffmpeg -i "$1" -lavfi "fps=15,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" -y "${2:-output.gif}"; }

# Local, untracked secrets (API keys, etc.) — see ~/.config/secrets.env, never committed
[ -f "$HOME/.config/secrets.env" ] && source "$HOME/.config/secrets.env"
```

- [ ] **Step 1: Append the ShellGPT block after the secrets line**

Add this block at the very end of `dot_zshrc.tmpl`, after the `source "$HOME/.config/secrets.env"` line:

```

# ShellGPT: provider-switchable shell-command suggestions (Ctrl+L)
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

- [ ] **Step 2: Verify the template renders to valid zsh**

Run: `chezmoi execute-template < dot_zshrc.tmpl > /tmp/sgpt-zshrc-check.zsh && zsh -n /tmp/sgpt-zshrc-check.zsh && echo SYNTAX_OK`

Expected output: `SYNTAX_OK` (no zsh syntax errors). Then `rm /tmp/sgpt-zshrc-check.zsh`.

- [ ] **Step 3: Commit**

```bash
git add dot_zshrc.tmpl
git commit -m "feat: add SGPT_PROVIDER wrapper and Ctrl+L keybinding to zshrc"
```

---

### Task 4: Apply, verify on macOS and Ubuntu, update README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the bootstrap changes from Task 1, the config file from Task 2, and the `.zshrc` changes from Task 3 — this task verifies all three together end-to-end and documents them.
- Produces: nothing consumed by later tasks (final task in this plan).

- [ ] **Step 1: Apply on the local macOS machine**

Run: `chezmoi apply --force`

Expected: command exits 0. `~/.config/shell_gpt/.sgptrc` now exists with the content from Task 2. The bootstrap script re-runs (its content changed) and installs `pipx` + `sgpt` if not already present.

- [ ] **Step 2: Confirm `sgpt` is on PATH and the wrapper/keybinding load**

Run: `command -v sgpt`
Expected: a path is printed (e.g. `/Users/giacomolisita/.local/bin/sgpt`), confirming `pipx install` succeeded.

Run: `zsh -ic 'type sgpt; echo done'`
Expected output ends with `done` and `sgpt is a shell function`, confirming the `.zshrc` wrapper function (not the raw binary) is what gets invoked interactively.

- [ ] **Step 3: Confirm default-provider and override behavior**

Run: `zsh -ic 'echo $SGPT_PROVIDER'`
Expected: `openrouter` (the default, since `SGPT_PROVIDER` is unset in this shell).

Run: `zsh -ic 'export SGPT_PROVIDER=gemini; echo $SGPT_PROVIDER'`
Expected: `gemini`.

- [ ] **Step 4: Verify on a fresh Ubuntu container**

Run (from the chezmoi source directory):

```bash
docker run --rm -v "$(pwd):/source:ro" -it ubuntu:24.04 bash -c '
set -e
apt-get update && apt-get install -y curl sudo
useradd -m -s /bin/bash tester
echo "tester ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
su - tester -c "sh -c \"\$(curl -fsLS get.chezmoi.io)\" -- -o /home/tester/bin/chezmoi"
su - tester -c "/home/tester/bin/chezmoi apply --source /source --force"
su - tester -c "command -v sgpt && zsh -ic \"type sgpt\""
'
```

Expected: the script completes without error, `command -v sgpt` prints a path, and `type sgpt` reports it as a shell function (not just an external command) — confirming both the Ubuntu install path (`apt-get install pipx`) and the `.zshrc` wrapper work identically to macOS.

- [ ] **Step 5: Update README**

In `README.md`, add a new bullet under the existing `## Features` list, immediately after the "Secrets never committed" bullet:

```markdown
- **ShellGPT suggestions.** `Ctrl+L` turns the current command-line buffer
  into a shell-command suggestion via `sgpt --shell`. The active provider is
  controlled by `SGPT_PROVIDER` (`openrouter` or `gemini`), defaulting to
  `openrouter` when unset. Switch for a session with
  `export SGPT_PROVIDER=gemini && exec zsh`.
```

Then, in the `### Set your secrets` section, update the heredoc example to include the two new keys:

```bash
mkdir -p ~/.config
cat > ~/.config/secrets.env <<'EOF'
export ANTHROPIC_API_KEY="your-real-key-here"
export OPENROUTER_API_KEY="your-real-key-here"
export GEMINI_API_KEY="your-real-key-here"
EOF
chmod 600 ~/.config/secrets.env
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document shellgpt suggestions and new secrets.env keys"
```

---

## Self-Review Notes

- **Spec coverage:** package install (Task 1) → config file (Task 2) → `.zshrc` wrapper + keybinding (Task 3) → secrets documentation + end-to-end verification (Task 4). All five spec components are covered.
- **Placeholder scan:** no TBD/TODO; all code blocks are complete and copy-pasteable.
- **Type/name consistency:** `SGPT_PROVIDER`, `sgpt()`, `_sgpt_zsh`, model strings (`openrouter/anthropic/claude-3.5-sonnet`, `gemini/gemini-1.5-pro`) are identical across the spec, Task 3, and Task 4's verification steps.
