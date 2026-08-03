#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_home="$(mktemp -d)"
trap 'rm -rf "$target_home"' EXIT

require_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		printf 'Required command not found: %s\n' "$1" >&2
		exit 1
	fi
}

require_command chezmoi
require_command zsh

# Render and parse the OS-specific shell configuration first.
chezmoi execute-template <"$repo_root/dot_zshrc.tmpl" >"$target_home/.zshrc"
zsh -n "$target_home/.zshrc"

# Apply into an isolated temporary home; bootstrap scripts stay excluded so this has no network side effects.
chezmoi apply --force --exclude=scripts \
	--source "$repo_root" --destination "$target_home"

for target in \
	.zshrc \
	.config/ghostty/config \
	.config/nvim/init.lua \
	.config/nvim/.neoconf.json \
	.pi/agent/settings.json \
	.pi/agent/.gitignore; do
	if [[ ! -e "$target_home/$target" ]]; then
		printf 'Expected chezmoi target was not planned: %s\n' "$target" >&2
		exit 1
	fi
done

printf 'Dotfiles render and isolated apply succeeded for %s.\n' "$(uname -s)"
