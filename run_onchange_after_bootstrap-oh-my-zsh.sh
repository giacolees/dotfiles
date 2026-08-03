#!/usr/bin/env bash
set -euo pipefail

omz_dir="${ZSH:-$HOME/.oh-my-zsh}"
plugin_dir="$omz_dir/custom/plugins"

if ! command -v git >/dev/null 2>&1; then
	printf 'git is required to install Oh My Zsh and its plugins.\n' >&2
	exit 1
fi

if [[ ! -d "$omz_dir" ]]; then
	git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git "$omz_dir"
fi

install_plugin() {
	local name="$1"
	local repository="$2"
	local destination="$plugin_dir/$name"

	if [[ ! -d "$destination/.git" ]]; then
		git clone --depth=1 "$repository" "$destination"
	fi
}

mkdir -p "$plugin_dir"
install_plugin zsh-autosuggestions https://github.com/zsh-users/zsh-autosuggestions.git
install_plugin zsh-syntax-highlighting https://github.com/zsh-users/zsh-syntax-highlighting.git
install_plugin zsh-bat https://github.com/fdellwing/zsh-bat.git

printf 'Oh My Zsh and configured plugins are ready in %s\n' "$omz_dir"
