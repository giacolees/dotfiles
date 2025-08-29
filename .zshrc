export ZSH="$HOME/.oh-my-zsh"

ZSH_THEME="robbyrussell"

export PATH="/opt/homebrew/bin:$PATH"
export PATH="/usr/local/bin:$PATH"
export PATH="/opt/miniconda3opt/miniconda3:$PATH"
export XDG_CONFIG_HOME="$HOME/.config"

plugins=(git
        zsh-autosuggestions
        zsh-syntax-highlighting
        zsh-bat
        )

source $ZSH/oh-my-zsh.sh

