# ShellConfig

Cross-platform dotfiles managed with [chezmoi](https://www.chezmoi.io/), applying
cleanly on both macOS and Ubuntu.

## Features

- **Cross-platform shell config.** `.zshrc` and `.zprofile` are chezmoi templates
  that branch on `.chezmoi.os` — Homebrew paths on macOS, Linuxbrew paths on
  Ubuntu, macOS-only blocks (conda, LM Studio, Antigravity, Coursier/JVM) skipped
  entirely on Linux.
- **Automatic bootstrap.** `run_onchange_install-packages.sh.tmpl` installs
  packages per OS (`brew` on macOS; `apt` + Linuxbrew on Ubuntu), installs
  oh-my-zsh if missing, and clones the oh-my-zsh plugins
  (`zsh-autosuggestions`, `zsh-syntax-highlighting`, `zsh-bat`,
  `you-should-use`) from their upstream repos. It re-runs automatically
  whenever its content changes.
- **Tracked configs:** `~/.zshrc`, `~/.zprofile`, `~/.gitconfig`,
  `~/.config/git/ignore`, `~/.config/gh/config.yml`, `~/.config/nvim/`,
  `~/.config/ghostty/config`.
- **Secrets never committed.** API keys and other secrets live in an untracked
  `~/.config/secrets.env`, sourced by `.zshrc` if present. `.chezmoiignore`
  ensures chezmoi will never pick this file up even by accident.
- **gh auth is never tracked.** `~/.config/gh/hosts.yml` is excluded — re-run
  `gh auth login` on each machine.
- **ShellGPT suggestions.** `Ctrl+L` turns the current command-line buffer
  into a shell-command suggestion via `sgpt --shell`. The active provider is
  controlled by `SGPT_PROVIDER` (`openrouter` or `gemini`), defaulting to
  `openrouter` when unset. Switch for a session with
  `export SGPT_PROVIDER=gemini && exec zsh`.

## First-time setup on a new machine

```bash
# Install chezmoi
sh -c "$(curl -fsLS get.chezmoi.io)"

# Authenticate to GitHub (repo is private)
gh auth login

# Clone and apply
chezmoi init --apply giacolees/ShellConfig
```

This runs the bootstrap script automatically — packages, oh-my-zsh, and
plugins all get installed on first apply.

### Set your secrets

chezmoi will never create or manage this file. Create it yourself on each
machine:

```bash
mkdir -p ~/.config
cat > ~/.config/secrets.env <<'EOF'
export ANTHROPIC_API_KEY="your-real-key-here"
export OPENROUTER_API_KEY="your-real-key-here"
export GEMINI_API_KEY="your-real-key-here"
EOF
chmod 600 ~/.config/secrets.env
```

## Testing changes before merging to `main`

While a change is still on a feature branch and not yet merged:

```bash
chezmoi init --apply --branch <branch-name> https://github.com/giacolees/ShellConfig.git
```

Once merged, drop `--branch <branch-name>` to track `main`.

## Useful commands

```bash
chezmoi diff        # preview pending changes
chezmoi apply -v     # apply pending changes
chezmoi edit ~/.zshrc  # edit the source template for a managed file
chezmoi cd            # cd into the source directory
```
