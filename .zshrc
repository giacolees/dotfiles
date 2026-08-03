export ZSH="$HOME/.oh-my-zsh"

ZSH_THEME="robbyrussell"

export PATH="/opt/homebrew/bin:$PATH"
export PATH="/usr/local/bin:$PATH"
# export PATH="/opt/miniconda3/bin:$PATH"  # commented out by conda initialize
export XDG_CONFIG_HOME="$HOME/.config"

plugins=(git
        zsh-autosuggestions
        zsh-syntax-highlighting
        zsh-bat
        conda
        )

source $ZSH/oh-my-zsh.sh


if command -v conda >/dev/null 2>&1; then
    __conda_setup="$(conda shell.zsh hook 2> /dev/null)"
    if [ $? -eq 0 ]; then
        eval "$__conda_setup"
    fi
    unset __conda_setup
fi

if [ -d "$HOME/.lmstudio/bin" ]; then
    export PATH="$PATH:$HOME/.lmstudio/bin"
fi

if [ -f "$HOME/.local/bin/env" ]; then
    . "$HOME/.local/bin/env"
fi

if [ -d "$HOME/.antigravity/antigravity/bin" ]; then
    export PATH="$HOME/.antigravity/antigravity/bin:$PATH"
fi

if [ -d "/opt/homebrew/opt/node@22/bin" ]; then
    export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
fi

gif() { ffmpeg -i "$1" -lavfi "fps=15,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" -y "${2:-output.gif}"; }

# Keep credentials in an untracked, per-machine file.
[ -f "$HOME/.config/secrets.env" ] && source "$HOME/.config/secrets.env"

if [ -d "$HOME/.antigravity-ide/antigravity-ide/bin" ]; then
    export PATH="$HOME/.antigravity-ide/antigravity-ide/bin:$PATH"
fi
