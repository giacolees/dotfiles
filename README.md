# Dotfiles

This repository is a [chezmoi](https://www.chezmoi.io/) source directory for macOS
and Ubuntu. It manages Zsh, Neovim, Ghostty, and Pi configuration without storing
machine credentials.

## Install on a new machine

Install `git`, `zsh`, and [chezmoi](https://www.chezmoi.io/install/), then clone
and apply the source directory:

```sh
git clone https://github.com/giacolees/dotfiles.git ~/.local/share/chezmoi
chezmoi apply
```

The first apply clones Oh My Zsh and the required Zsh plugins. Install optional
programs such as Neovim, Ghostty, `ffmpeg`, Conda, and Node separately using
your OS package manager. macOS-specific Homebrew paths are rendered only on
macOS; Ubuntu renders a Linuxbrew path only when it exists.

Pi extension packages are restored after apply with:

```sh
(cd ~/.pi/agent/npm && npm ci --omit=dev)
```

## Secrets

Never put secrets in this repository. Store per-device credentials in
`~/.config/secrets.env` with restrictive permissions:

```sh
mkdir -p ~/.config
chmod 700 ~/.config
cat > ~/.config/secrets.env <<'EOF'
export EXAMPLE_API_KEY='replace-me'
EOF
chmod 600 ~/.config/secrets.env
```

`.zshrc` loads that file only when it exists. It is excluded from Git and chezmoi.
If a secret was committed previously, revoke/rotate it and remove it from Git history
separately; the repository workflow deliberately scans the checked-out source, not
historical commits, so a history rewrite is an explicit, reviewed operation.

## Validate

Run the local cross-platform-safe check before committing:

```sh
./scripts/check-dotfiles.sh
```

GitHub Actions runs the same render/apply validation on macOS and Ubuntu and runs
Gitleaks against the checked-out source on pushes and pull requests. Use **Run
workflow** and select a target OS to validate one platform on demand.

## Layout

Chezmoi source names map to home-directory targets:

- `dot_zshrc.tmpl` → `~/.zshrc`
- `dot_config/` → `~/.config/`
- `dot_pi/` → `~/.pi/`
- `run_onchange_after_bootstrap-oh-my-zsh.sh` bootstraps Oh My Zsh plugins

Use `chezmoi edit ~/.zshrc`, `chezmoi diff`, and `chezmoi apply` to manage changes.
