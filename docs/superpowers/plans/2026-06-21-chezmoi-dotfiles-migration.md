# Chezmoi Dotfiles Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `giacolees/ShellConfig` from a manually-symlinked dotfiles repo into a chezmoi-managed source directory that applies cleanly on both macOS and Ubuntu, while removing a leaked API key from git history.

**Architecture:** chezmoi source directory at `~/.local/share/chezmoi` (the existing `ShellConfig` repo, restructured in place using `chezmoi`'s `dot_`/`.tmpl` naming convention). OS differences are handled via Go templates keyed on `.chezmoi.os` rather than separate file trees. Third-party oh-my-zsh plugins and packages are installed by a `run_onchange_` bootstrap script, never vendored as files.

**Tech Stack:** chezmoi, zsh/oh-my-zsh, Homebrew (macOS) / apt + Linuxbrew (Ubuntu), git, Docker (for Ubuntu verification), `git filter-repo` (history purge).

## Global Constraints

- No secrets committed to the repo, ever — `ANTHROPIC_API_KEY` and any future secret values live only in untracked `~/.config/secrets.env` on each machine.
- `~/.config/gh/hosts.yml` is never tracked.
- Out-of-scope `~/.config` tools (colima, mole, browseruse, swiftpm, xbuild, flutter, NuGet, stetic, steinberg-download-assistant, zotero-mcp) are not touched.
- oh-my-zsh plugins (`zsh-autosuggestions`, `zsh-syntax-highlighting`, `zsh-bat`, `you-should-use`) are cloned by the bootstrap script from their upstream URLs, not vendored as files.
- Any step that force-pushes or rewrites the remote `ShellConfig` history must be confirmed with the user before running, since it's a hard-to-reverse action affecting the shared GitHub repo.

---

### Task 1: Install chezmoi and restructure the source directory

**Files:**

- Modify (rename in place): `~/dotfiles/.zshrc` → will become `dot_zshrc.tmpl` (Task 4)
- Modify (rename in place): `~/dotfiles/ghostty/config` → `dot_config/ghostty/config`
- Modify (rename in place): `~/dotfiles/nvim/` → `dot_config/nvim/`
- Delete: `~/dotfiles/oh-my-zsh-custom/` (superseded by bootstrap script, Task 6)
- Delete: `~/dotfiles/.DS_Store`, `~/dotfiles/oh-my-zsh-custom/.DS_Store`

**Interfaces:**

- Produces: chezmoi source directory at `~/.local/share/chezmoi`, a git repo with remote `origin` pointing at `https://github.com/giacolees/ShellConfig`, on branch `main`.

- [ ] **Step 1: Install chezmoi via Homebrew**

```bash
brew install chezmoi
```

Expected: `chezmoi` binary installed; verify with:

```bash
chezmoi --version
```

Expected: prints a version string (e.g. `chezmoi version v2.x.x`).

- [ ] **Step 2: Point chezmoi's source dir at the existing repo**

```bash
chezmoi init https://github.com/giacolees/ShellConfig.git
```

Expected: clones the repo into `~/.local/share/chezmoi`. Verify:

```bash
ls ~/.local/share/chezmoi
cd ~/.local/share/chezmoi && git remote -v
```

Expected: shows `.zshrc`, `ghostty/`, `nvim/`, `oh-my-zsh-custom/`, `docs/`; remote shows `giacolees/ShellConfig`.

- [ ] **Step 3: Remove the stray `.DS_Store` files and untrack them**

```bash
cd ~/.local/share/chezmoi
git rm --cached .DS_Store oh-my-zsh-custom/.DS_Store 2>/dev/null
rm -f .DS_Store oh-my-zsh-custom/.DS_Store
printf '.DS_Store\n' >> .gitignore
git add .gitignore
git commit -m "chore: ignore .DS_Store"
```

Expected: commit succeeds; `git status` is clean.

- [ ] **Step 4: Drop the unused oh-my-zsh scaffolding directory**

```bash
cd ~/.local/share/chezmoi
git rm -r oh-my-zsh-custom
git commit -m "chore: drop unused oh-my-zsh example scaffolding (plugins are cloned by bootstrap script instead)"
```

Expected: commit succeeds; `oh-my-zsh-custom/` no longer present in the source dir.

---

### Task 2: Add static (non-templated) managed files

**Files:**

- Create: `~/.local/share/chezmoi/dot_gitconfig`
- Create: `~/.local/share/chezmoi/dot_config/git/ignore`
- Create: `~/.local/share/chezmoi/dot_config/gh/config.yml`

**Interfaces:**

- Consumes: live files `~/.gitconfig`, `~/.config/git/ignore`, `~/.config/gh/config.yml` (read-only source of content).
- Produces: chezmoi-tracked equivalents that `chezmoi apply` will symlink/copy into place.

- [ ] **Step 1: Add `.gitconfig`**

```bash
chezmoi add ~/.gitconfig
```

Expected: creates `~/.local/share/chezmoi/dot_gitconfig` with current file content. Verify:

```bash
cat ~/.local/share/chezmoi/dot_gitconfig
```

Expected output matches:

```
[filter "lfs"]
 clean = git-lfs clean -- %f
 smudge = git-lfs smudge -- %f
 process = git-lfs filter-process
 required = true
[user]
 name = giacolees
 email = giacomolisita01@gmail.com
```

- [ ] **Step 2: Add `~/.config/git/ignore`**

```bash
chezmoi add ~/.config/git/ignore
```

Expected: creates `~/.local/share/chezmoi/dot_config/git/ignore` containing `**/.claude/settings.local.json`.

- [ ] **Step 3: Add `~/.config/gh/config.yml`** (no secrets in this file — verified earlier; `hosts.yml` is intentionally excluded)

```bash
chezmoi add ~/.config/gh/config.yml
```

Expected: creates `~/.local/share/chezmoi/dot_config/gh/config.yml`.

- [ ] **Step 4: Confirm `hosts.yml` was not picked up**

```bash
find ~/.local/share/chezmoi/dot_config/gh -type f
```

Expected: only `config.yml` is listed — no `hosts.yml`, no `private_*` file for it.

- [ ] **Step 5: Commit**

```bash
cd ~/.local/share/chezmoi
git add dot_gitconfig dot_config/git/ignore dot_config/gh/config.yml
git commit -m "feat: track gitconfig, git ignore, and gh config via chezmoi"
```

---

### Task 3: Add nvim and ghostty configs

**Files:**

- Create: `~/.local/share/chezmoi/dot_config/nvim/` (full directory tree from current live `~/.config/nvim`)
- Create: `~/.local/share/chezmoi/dot_config/ghostty/config`
- Delete (after apply, Task 7): the manual symlink `~/.config/nvim` → `~/dotfiles/nvim`

**Interfaces:**

- Consumes: live `~/.config/nvim/**`, `~/.config/ghostty/config`.
- Produces: chezmoi-tracked nvim and ghostty config trees.

- [ ] **Step 1: Add the nvim config tree**

```bash
chezmoi add --recursive ~/.config/nvim
```

Expected: creates `~/.local/share/chezmoi/dot_config/nvim/` mirroring the live tree (`init.lua`, `lua/`, `stylua.toml`, `.neoconf.json`, `.gitignore`). Verify:

```bash
diff -r ~/.config/nvim ~/.local/share/chezmoi/dot_config/nvim
```

Expected: no output (identical), since `~/.config/nvim` is currently a symlink into the old repo's `nvim/` whose content `chezmoi add` just copied.

- [ ] **Step 2: Add ghostty config**

```bash
chezmoi add ~/.config/ghostty/config
```

Expected: creates `~/.local/share/chezmoi/dot_config/ghostty/config` containing:

```
theme = dark:Catppuccin Mocha,light:Flexoki Light
```

- [ ] **Step 3: Commit**

```bash
cd ~/.local/share/chezmoi
git add dot_config/nvim dot_config/ghostty
git commit -m "feat: track nvim and ghostty configs via chezmoi"
```

---

### Task 4: Scrub the leaked API key and set up the untracked secrets convention

**Context:** The leaked `ANTHROPIC_API_KEY` has already been revoked and rotated by the user (confirmed before this plan was written). This task ensures the new value is never committed, and removes the old line from the file chezmoi will manage going forward. The git-history purge of the *old* commits containing the key is handled separately in Task 8.

**Files:**

- Create: `~/.config/secrets.env` (untracked, machine-local, NOT added to chezmoi)
- Modify: global `~/.gitignore` (create if absent) to ignore `secrets.env` defensively, even though it's outside any repo chezmoi manages — this guards against someone later `chezmoi add`-ing it by mistake)
- Create: `~/.local/share/chezmoi/.chezmoiignore` entry for `.config/secrets.env`

**Interfaces:**

- Produces: a file `~/.config/secrets.env` with `export ANTHROPIC_API_KEY="..."`, sourced by `.zshrc` (Task 5) but never tracked by chezmoi or git.

- [ ] **Step 1: Create the untracked secrets file with the rotated key**

```bash
cat > ~/.config/secrets.env <<'EOF'
export ANTHROPIC_API_KEY="<paste-the-new-rotated-key-here>"
EOF
chmod 600 ~/.config/secrets.env
```

Expected: file created, readable only by the user (`-rw-------`). Verify:

```bash
ls -l ~/.config/secrets.env
```

- [ ] **Step 2: Add a chezmoiignore entry so `secrets.env` is never picked up by `chezmoi add`**

```bash
cd ~/.local/share/chezmoi
cat > .chezmoiignore <<'EOF'
.config/secrets.env
EOF
git add .chezmoiignore
git commit -m "chore: ensure secrets.env is never managed by chezmoi"
```

Expected: commit succeeds. Verify the ignore takes effect:

```bash
chezmoi add ~/.config/secrets.env
```

Expected: chezmoi reports the path is ignored (no file created under the source dir for it). Confirm:

```bash
find ~/.local/share/chezmoi -iname '*secrets*'
```

Expected: no output.

---

### Task 5: Templatize `.zshrc` and `.zprofile` for OS differences and secrets loading

**Files:**

- Create: `~/.local/share/chezmoi/dot_zshrc.tmpl`
- Create: `~/.local/share/chezmoi/dot_zprofile.tmpl`

**Interfaces:**

- Consumes: `.chezmoi.os` (built-in chezmoi template variable, `"darwin"` or `"linux"`).
- Produces: rendered `~/.zshrc` and `~/.zprofile` on `chezmoi apply`.

- [ ] **Step 1: Add `.zshrc` as a template**

```bash
chezmoi add --template ~/.zshrc
```

Expected: creates `~/.local/share/chezmoi/dot_zshrc.tmpl` with the current file content (including the `ANTHROPIC_API_KEY` line and the conda/LM-Studio/Antigravity blocks).

- [ ] **Step 2: Edit `dot_zshrc.tmpl`** — remove the hardcoded key, template the Homebrew path, and source the untracked secrets file

```bash
chezmoi edit ~/.zshrc
```

Replace the entire file content with:

```
export ZSH="$HOME/.oh-my-zsh"

ZSH_THEME="robbyrussell"

{{ if eq .chezmoi.os "darwin" -}}
export PATH="/opt/homebrew/bin:$PATH"
export PATH="/usr/local/bin:$PATH"
{{- else -}}
export PATH="/home/linuxbrew/.linuxbrew/bin:$PATH"
{{- end }}
export XDG_CONFIG_HOME="$HOME/.config"

plugins=(git
        zsh-autosuggestions
        zsh-syntax-highlighting
        zsh-bat
        conda
        )

source $ZSH/oh-my-zsh.sh

{{ if eq .chezmoi.os "darwin" -}}
# >>> conda initialize >>>
__conda_setup="$('/opt/miniconda3/bin/conda' 'shell.zsh' 'hook' 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__conda_setup"
else
    if [ -f "/opt/miniconda3/etc/profile.d/conda.sh" ]; then
        . "/opt/miniconda3/etc/profile.d/conda.sh"
    else
        export PATH="/opt/miniconda3/bin:$PATH"
    fi
fi
unset __conda_setup
# <<< conda initialize <<<


# Added by LM Studio CLI (lms)
export PATH="$PATH:$HOME/.lmstudio/bin"
# End of LM Studio CLI section


. "$HOME/.local/bin/env"

# Added by Antigravity
export PATH="$HOME/.antigravity/antigravity/bin:$PATH"

# Node 22 (required for VoxRead)
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

# Added by Antigravity IDE
export PATH="$HOME/.antigravity-ide/antigravity-ide/bin:$PATH"
{{- end }}

gif() { ffmpeg -i "$1" -lavfi "fps=15,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" -y "${2:-output.gif}"; }

# Local, untracked secrets (API keys, etc.) — see ~/.config/secrets.env, never committed
[ -f "$HOME/.config/secrets.env" ] && source "$HOME/.config/secrets.env"
```

Expected: the `export ANTHROPIC_API_KEY=...` line is gone from this file entirely. Verify:

```bash
grep -i anthropic ~/.local/share/chezmoi/dot_zshrc.tmpl
```

Expected: no output.

- [ ] **Step 3: Add `.zprofile` as a template**

```bash
chezmoi add --template ~/.zprofile
```

Expected: creates `~/.local/share/chezmoi/dot_zprofile.tmpl`.

- [ ] **Step 4: Edit `dot_zprofile.tmpl`** to gate the macOS-only Python framework paths

```bash
chezmoi edit ~/.zprofile
```

Replace content with:

```
{{ if eq .chezmoi.os "darwin" -}}
# Setting PATH for Python 3.10
PATH="/Library/Frameworks/Python.framework/Versions/3.10/bin:${PATH}"
export PATH

# Setting PATH for Python 3.12
PATH="/Library/Frameworks/Python.framework/Versions/3.12/bin:${PATH}"
export PATH

# >>> JVM installed by coursier >>>
export JAVA_HOME="{{ .chezmoi.homeDir }}/Library/Caches/Coursier/arc/https/github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.26%252B4/OpenJDK11U-jdk_aarch64_mac_hotspot_11.0.26_4.tar.gz/jdk-11.0.26+4/Contents/Home"
# <<< JVM installed by coursier <<<

# >>> coursier install directory >>>
export PATH="$PATH:{{ .chezmoi.homeDir }}/Library/Application Support/Coursier/bin"
# <<< coursier install directory <<<
{{- end }}
```

- [ ] **Step 5: Verify both templates render without error**

```bash
chezmoi execute-template < ~/.local/share/chezmoi/dot_zshrc.tmpl | head -20
chezmoi execute-template < ~/.local/share/chezmoi/dot_zprofile.tmpl | head -10
```

Expected: both print rendered shell script with the `darwin` branches active (since this is run on the Mac), no template syntax errors.

- [ ] **Step 6: Commit**

```bash
cd ~/.local/share/chezmoi
git add dot_zshrc.tmpl dot_zprofile.tmpl
git commit -m "feat: templatize zshrc/zprofile for macOS/Ubuntu, remove leaked API key, load secrets from untracked file"
```

---

### Task 6: Write the package/plugin bootstrap script

**Files:**

- Create: `~/.local/share/chezmoi/run_onchange_install-packages.sh.tmpl`

**Interfaces:**

- Consumes: `.chezmoi.os`.
- Produces: installed packages and cloned oh-my-zsh plugins as a side effect of `chezmoi apply`.

- [ ] **Step 1: Create the script**

```bash
cat > ~/.local/share/chezmoi/run_onchange_install-packages.sh.tmpl <<'SCRIPT'
#!/bin/bash
set -euo pipefail

{{ if eq .chezmoi.os "darwin" -}}
brew install neovim gh ghostty
{{ else -}}
sudo apt-get update
sudo apt-get install -y neovim gh git curl zsh
if [ ! -d /home/linuxbrew/.linuxbrew ]; then
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
{{ end -}}

if [ ! -d "$HOME/.oh-my-zsh" ]; then
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
fi

ZSH_CUSTOM="$HOME/.oh-my-zsh/custom"
declare -A PLUGINS=(
  [zsh-autosuggestions]="https://github.com/zsh-users/zsh-autosuggestions"
  [zsh-syntax-highlighting]="https://github.com/zsh-users/zsh-syntax-highlighting.git"
  [zsh-bat]="https://github.com/fdellwing/zsh-bat.git"
  [you-should-use]="https://github.com/MichaelAquilina/zsh-you-should-use.git"
)
for name in "${!PLUGINS[@]}"; do
  dest="$ZSH_CUSTOM/plugins/$name"
  if [ ! -d "$dest" ]; then
    git clone --depth 1 "${PLUGINS[$name]}" "$dest"
  fi
done
SCRIPT
chmod +x ~/.local/share/chezmoi/run_onchange_install-packages.sh.tmpl
```

Expected: file created and executable.

- [ ] **Step 2: Verify the template renders for the current (darwin) machine**

```bash
chezmoi execute-template < ~/.local/share/chezmoi/run_onchange_install-packages.sh.tmpl
```

Expected: output contains `brew install neovim gh ghostty` and not the `apt-get`/Linuxbrew branch.

- [ ] **Step 3: Commit**

```bash
cd ~/.local/share/chezmoi
git add run_onchange_install-packages.sh.tmpl
git commit -m "feat: add bootstrap script to install packages and clone oh-my-zsh plugins per OS"
```

---

### Task 7: Apply on this Mac and remove the old manual symlinks

**Files:**

- Modify: `~/.zshrc` (replace manual symlink with chezmoi-managed file)
- Modify: `~/.config/nvim` (replace manual symlink with chezmoi-managed directory)

**Interfaces:**

- Consumes: all chezmoi source files from Tasks 1-6.
- Produces: live `~/.zshrc`, `~/.zprofile`, `~/.config/nvim`, `~/.config/ghostty/config`, `~/.gitconfig`, `~/.config/git/ignore`, `~/.config/gh/config.yml` managed by chezmoi instead of manual symlinks.

- [ ] **Step 1: Preview the diff chezmoi would apply**

```bash
chezmoi diff
```

Expected: shows the old `~/.zshrc` symlink being replaced by a regular file with rendered template content (no `ANTHROPIC_API_KEY` line), and `~/.config/nvim` symlink being replaced by a real directory. Read through it to confirm nothing unexpected.

- [ ] **Step 2: Remove the old manual symlinks so chezmoi can take over the paths**

```bash
rm ~/.zshrc ~/.config/nvim
```

Expected: both paths removed (they were symlinks into the old `~/dotfiles` checkout, not the only copy of the data — content is preserved in the chezmoi source dir from Tasks 3 and 5).

- [ ] **Step 3: Apply**

```bash
chezmoi apply -v
```

Expected: creates `~/.zshrc`, `~/.zprofile`, `~/.config/nvim/`, `~/.config/ghostty/config`, `~/.gitconfig`, `~/.config/git/ignore`, `~/.config/gh/config.yml`; runs `run_onchange_install-packages.sh.tmpl` (first run, since it's new) and reports brew installs.

- [ ] **Step 4: Verify idempotency**

```bash
chezmoi diff
```

Expected: no output (nothing left to apply).

```bash
chezmoi apply -v
```

Expected: no output beyond chezmoi's normal "nothing to do" behavior (the `run_onchange_` script does not re-run since its content hasn't changed).

- [ ] **Step 5: Confirm the new shell works and the key loads from the untracked file**

```bash
zsh -ic 'echo $ANTHROPIC_API_KEY' | tail -c 8
```

Expected: prints the last few characters of the rotated key (confirming it loaded from `~/.config/secrets.env`, not from any tracked file).

```bash
grep -i anthropic ~/.zshrc
```

Expected: no output.

- [ ] **Step 6: Push**

```bash
cd ~/.local/share/chezmoi
git push origin main
```

Expected: push succeeds (this only pushes commits made in Tasks 1-6, which no longer contain the key — the *old* commits with the key are still in history at this point, addressed in Task 8).

---

### Task 8: Purge the leaked key from git history

**This step rewrites published git history and force-pushes. Confirm explicitly with the user immediately before running Step 3 — do not proceed past Step 2 without that confirmation, per the global constraint on hard-to-reverse shared-repo actions.**

**Files:** none (operates on git history of `~/.local/share/chezmoi`, formerly `~/dotfiles`)

- [ ] **Step 1: Install `git filter-repo`**

```bash
brew install git-filter-repo
```

- [ ] **Step 2: Dry-run identify which commits contain the key**

```bash
cd ~/.local/share/chezmoi
git log --all -p | grep -l "ANTHROPIC_API_KEY" 2>/dev/null
git log --all --oneline -S "<leaked-key-fingerprint>"
```

Expected: lists the commit(s) (at minimum `a8b405f`, the initial commit) containing the key.

- [ ] **Step 3: STOP — confirm with the user before proceeding.** Ask: "About to rewrite `ShellConfig` git history to strip the leaked key and force-push. This rewrites published history — anyone with a clone will need to re-clone. Proceed?" Only continue after explicit yes.

- [ ] **Step 4: Run the history purge**

```bash
cd ~/.local/share/chezmoi
# Create this untracked file locally; do not write the leaked value into this repo.
# Its only line must be: <leaked-key>==>REDACTED
git filter-repo --replace-text /path/to/untracked/replacements.txt
```

Expected: `git filter-repo` rewrites all commits, replacing the literal key string with `REDACTED` everywhere it appears in history. Verify:

```bash
git log --all -S "<leaked-key-fingerprint>" --oneline
```

Expected: no output (string no longer found in any commit).

- [ ] **Step 5: Re-add the remote (filter-repo removes it by default as a safety measure) and force-push**

```bash
git remote add origin https://github.com/giacolees/ShellConfig.git
git push origin main --force
```

Expected: push succeeds; GitHub now serves the rewritten history with no trace of the key.

- [ ] **Step 6: Note for the user** — anyone else with a clone of this repo must re-clone rather than pull, since history was rewritten.

---

### Task 9: Verify on a throwaway Ubuntu container

**Files:** none (verification only, no repo changes expected unless a bug is found)

- [ ] **Step 1: Launch an Ubuntu container**

```bash
docker run -it --rm ubuntu:24.04 bash
```

- [ ] **Step 2: Inside the container, install prerequisites and chezmoi**

```bash
apt-get update && apt-get install -y curl git sudo zsh
sh -c "$(curl -fsLS get.chezmoi.io)"
```

Expected: `chezmoi` binary available at `~/.local/bin/chezmoi` (or similar); verify with `~/.local/bin/chezmoi --version`.

- [ ] **Step 3: Initialize and apply**

```bash
~/.local/bin/chezmoi init --apply https://github.com/giacolees/ShellConfig.git
```

Expected: clones the repo, renders templates with `.chezmoi.os == "linux"`, runs the bootstrap script's `apt-get`/Linuxbrew/oh-my-zsh-plugin-clone branch, and writes `~/.zshrc`, `~/.zprofile`, `~/.config/nvim`, `~/.gitconfig`, `~/.config/git/ignore`, `~/.config/gh/config.yml`. No `~/.config/ghostty` (correct — it's still tracked in the repo as a static file, but its absence of *use* on Linux is expected since ghostty isn't installed there; the file itself will still be written, which is harmless).

- [ ] **Step 4: Confirm no errors and no leaked key**

```bash
zsh -ic 'exit' 
echo $?
```

Expected: `0`, no errors about `ANTHROPIC_API_KEY` or missing `secrets.env` (the `.zshrc` template only sources it `if [ -f ... ]`, so its absence on this fresh container is a silent no-op).

```bash
grep -ri anthropic ~/.zshrc ~/.zprofile
```

Expected: no output.

- [ ] **Step 5: Confirm Homebrew path branch took the Linux path**

```bash
grep linuxbrew ~/.zshrc
```

Expected: one matching line (the `darwin` branch's `/opt/homebrew` lines are absent).

- [ ] **Step 6: Exit and discard the container**

```bash
exit
```

(Container is `--rm`, so it's discarded automatically — no cleanup needed.)

## Self-Review Notes

- Spec coverage: all in-scope files (gitconfig, git/ignore, gh config, nvim, ghostty, zshrc, zprofile), OS templating, oh-my-zsh plugin handling, secrets handling, and the key purge are each covered by a task.
- The leaked-key requirement added to the spec mid-session is fully covered by Tasks 4, 5, and 8.
- Task 8's force-push is explicitly gated behind a user confirmation step, consistent with the global constraint on shared/hard-to-reverse actions.
