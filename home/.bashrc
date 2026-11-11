# If not running interactively, don't do anything (leave this at the top of this file)
[[ $- != *i* ]] && return
# All the default Omarchy aliases and functions
# (don't mess with these directly, just overwrite them here!)
# /etc/omarchy.conf is written by omarchy-dev-link. When absent, force the
# package default instead of preserving a stale inherited dev-link value before
# we decide which rc file to source.
if [[ -f /etc/omarchy.conf ]]; then
  source /etc/omarchy.conf
  export OMARCHY_PATH="${OMARCHY_PATH:-/usr/share/omarchy}"
else
  export OMARCHY_PATH=/usr/share/omarchy
fi
source "$OMARCHY_PATH/default/bash/rc"
# Add your own exports, aliases, and functions here.
#
# Make an alias for invoking commands you use constantly
# alias p='python'
if [[ ${OMARCHY_START_IN_HOME:-} == 1 ]]; then
  builtin cd -- "$HOME"
  unset OMARCHY_START_IN_HOME
fi

# opencode
export PATH=/home/jigark0/.opencode/bin:$PATH

# >>> Codex installer >>>
export PATH="/home/jigark0/.local/bin:$PATH"
# <<< Codex installer <<<

# Long-lived Claude Code token (from `claude setup-token`) so concurrent sessions never race on OAuth refresh.
# Skipped inside T3 Code: this token has inference-only scope, so Claude can't report subscription limits with it.
if [[ -s ~/.claude/oauth-token && $APPIMAGE != *T3-Code* ]]; then
  export CLAUDE_CODE_OAUTH_TOKEN="$(< ~/.claude/oauth-token)"
fi
