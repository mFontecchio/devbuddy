# devbuddy shell hook for zsh
# Sends command and exit-code events to the devbuddy daemon

__devbuddy_preexec() {
  export __DEVBUDDY_CMD="$1"
}

__devbuddy_precmd() {
  local exit_code=$?
  local sock="$HOME/.devbuddy/devbuddy.sock"

  if [[ -n "$__DEVBUDDY_CMD" ]] && [[ -S "$sock" ]]; then
    local cmd="${__DEVBUDDY_CMD:0:500}"
    cmd="${cmd//\"/\\\"}"
    local cwd="${PWD//\"/\\\"}"

    printf '{"type":"cmd","cmd":"%s","exit":%d,"cwd":"%s"}\n' \
      "$cmd" "$exit_code" "$cwd" \
      | socat - UNIX-CONNECT:"$sock" 2>/dev/null &!
  fi

  unset __DEVBUDDY_CMD
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec __devbuddy_preexec
add-zsh-hook precmd __devbuddy_precmd
