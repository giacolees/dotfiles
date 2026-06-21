# Cross-platform dotfiles via chezmoi

## Goal
Migrate the existing `giacolees/ShellConfig` dotfiles repo from a manually-symlinked
setup to a [chezmoi](https://www.chezmoi.io/)-managed source directory, so the same
repo can be applied on macOS and Ubuntu with OS-specific differences handled by
templates instead of duplicated files.

## Current state
- Repo `github.com/giacolees/ShellConfig`, cloned at `~/dotfiles`, tracked with plain git.
- `~/.zshrc` is a manual symlink to `~/dotfiles/.zshrc`.
- `~/.config/nvim` is a manual symlink to `~/dotfiles/nvim`.
- Repo content (`.zshrc`, `nvim/`, `ghostty/config`, `oh-my-zsh-custom/`) has drifted
  out of sync with the live files in `~/` and `~/.config`.
- `~/.zprofile`, `~/.gitconfig`, `~/.config/git/ignore`, `~/.config/gh/config.yml` are
  not tracked at all.

## Scope

### Managed by chezmoi
- `~/.zshrc`
- `~/.zprofile` (contains Homebrew PATH setup — needs per-OS templating)
- `~/.config/oh-my-zsh-custom/` (themes/plugins) — *current path is the repo's
  `oh-my-zsh-custom/`; confirm at migration time whether oh-my-zsh expects this under
  `~/.oh-my-zsh/custom` or a custom `ZSH_CUSTOM` path, and template that path if it
  differs across machines.*
- `~/.config/nvim/` (replacing the manual symlink)
- `~/.config/ghostty/` (macOS only)
- `~/.gitconfig`
- `~/.config/git/ignore`
- `~/.config/gh/config.yml`

### Explicitly out of scope
`colima`, `mole`, `browseruse`, `swiftpm`, `xbuild`, `flutter`, `NuGet`, `stetic`,
`steinberg-download-assistant`, `zotero-mcp`, and any other `~/.config` entries not
listed above. These stay untracked and untouched.

### Secrets
- `~/.config/gh/hosts.yml` is **not** tracked. It contains only the github.com
  username in plaintext on this machine; the OAuth token itself is stored in the
  macOS keychain, not the file. Since secret storage backend differs between gh's
  keychain integration (macOS) and its file/keyring fallback (Linux), this file is
  excluded from the repo entirely and left for `gh auth login` to recreate per machine.
- **`~/.zshrc` contains a live `ANTHROPIC_API_KEY` hardcoded in plaintext, and it is
  already committed to the `ShellConfig` repo's git history on GitHub.** The leaked
  key has been revoked/rotated by the user (confirmed 2026-06-21) before this
  migration proceeds. The migration must:
  1. Remove the `export ANTHROPIC_API_KEY=...` line from the chezmoi-managed
     `.zshrc` template entirely — it must not be committed again, on this machine
     or any other.
  2. Replace it with a `source`/load from an **untracked** local file, e.g.
     `~/.config/secrets.env` (added to global gitignore, never added to the repo),
     containing `export ANTHROPIC_API_KEY="..."`. The `.zshrc` template sources it
     conditionally (`[ -f "$HOME/.config/secrets.env" ] && source "$HOME/.config/secrets.env"`)
     so machines without that file don't error.
  3. Purge the secret from the repo's git history (`git filter-repo` or BFG
     Repo-Cleaner) and force-push the cleaned history, since simply removing it in a
     new commit leaves it recoverable from history.
  4. The new (rotated) key value is never written into any file the migration adds
     to git — it only ever lives in the untracked `secrets.env` on each machine,
     set up manually per machine.
- No other in-scope file contains credentials as of this writing. If that changes,
  the new file must be excluded the same way, not committed.

## Structure

chezmoi source directory (this repo) lives at `~/.local/share/chezmoi`, replacing
the current manual checkout at `~/dotfiles`.

- Files needing no OS branching are plain chezmoi-managed files (`dot_gitconfig`,
  `dot_config/git/ignore`, `dot_config/gh/config.yml`, `dot_config/nvim/...`,
  `oh-my-zsh-custom/...`).
- Files needing OS branching (`dot_zshrc.tmpl`, `dot_zprofile.tmpl`) use chezmoi's Go
  templating with `.chezmoi.os` (`darwin` vs `linux`) to switch Homebrew paths
  (`/opt/homebrew` vs `/home/linuxbrew/.linuxbrew`).
- macOS-only configs (`dot_config/ghostty/...`) are included unconditionally in the
  source tree but their installation/use is naturally a no-op on Linux (ghostty isn't
  installed there); no template gating is needed for static config files — only the
  install script needs to skip them on Linux.
- A single `.chezmoi.toml.tmpl` is not required initially since no prompted variables
  are needed yet (no per-machine secrets or names to template) — `.chezmoi.os` is
  available built-in.
- `run_onchange_install-packages.sh.tmpl`: a templated script that installs the
  packages each config needs (oh-my-zsh, neovim, gh, ghostty-on-macOS-only) via
  `brew` on macOS and `apt`/Linuxbrew on Ubuntu. Runs automatically on `chezmoi apply`
  when its content changes (chezmoi's `run_onchange_` convention).

## Migration steps
1. `chezmoi init` against the existing `ShellConfig` repo (or re-init the repo at the
   chezmoi source path) and re-add each in-scope file via `chezmoi add <path>`, which
   converts it to the `dot_`-prefixed naming convention and copies current live
   content (resolving the drift between repo and live files in favor of live files,
   since live files are what's actually in use day to day).
2. Convert `.zshrc`/`.zprofile` to `.tmpl` files with `{{ if eq .chezmoi.os "darwin" }}`
   branches for Homebrew path differences.
3. Remove the manual `~/.config/nvim` symlink and the manual `~/.zshrc` symlink;
   let chezmoi own those paths going forward.
4. Write `run_onchange_install-packages.sh.tmpl` covering package installation for
   both OSes.
5. Commit and push the restructured repo.

## Verification
1. Re-apply with `chezmoi apply` on this Mac and diff the result against the
   previous live files to confirm no unintended changes (idempotency check).
2. Spin up a throwaway Ubuntu Docker container, install chezmoi, run
   `chezmoi init --apply giacolees/ShellConfig`, and confirm:
   - the shell loads without errors,
   - Homebrew/Linuxbrew paths resolve correctly,
   - ghostty-related config is absent/skipped without error,
   - gh and git configs apply cleanly.
3. Only after container verification passes should this be tried on a real Ubuntu
   machine.

## Out of scope / explicit non-goals
- No new secrets manager / chezmoi `age` encryption integration — not needed since
  no secrets are being tracked.
- No `.chezmoi.toml.tmpl` prompts (machine nickname, email switching, etc.) — single
  identity (`giacolees` / `giacomolisita01@gmail.com`) is used everywhere today.
- No migration of out-of-scope `~/.config` tools.
