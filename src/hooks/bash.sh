# devbuddy shell hook for bash
# Sends command and exit-code events to the devbuddy daemon

__devbuddy_preexec() {
  export __DEVBUDDY_CMD="$BASH_COMMAND"
}

__devbuddy_precmd() {
  local exit_code=$?
  local sock="$HOME/.devbuddy/devbuddy.sock"

  if [ -n "$__DEVBUDDY_CMD" ] && [ -S "$sock" ]; then
    local cmd
    cmd=$(printf '%s' "$__DEVBUDDY_CMD" | head -c 500 | sed 's/"/\\"/g')
    local cwd
    cwd=$(printf '%s' "$PWD" | sed 's/"/\\"/g')

    printf '{"type":"cmd","cmd":"%s","exit":%d,"cwd":"%s"}\n' \
      "$cmd" "$exit_code" "$cwd" \
      | (command -v socat >/dev/null 2>&1 \
        && socat - UNIX-CONNECT:"$sock" \
        || (exec 3<>"/dev/tcp/localhost/0" 2>/dev/null && echo >&3 || true)) \
      2>/dev/null &
    disown 2>/dev/null
  fi

  unset __DEVBUDDY_CMD
}

if [[ ! "$PROMPT_COMMAND" == *"__devbuddy_precmd"* ]]; then
  PROMPT_COMMAND="__devbuddy_precmd;${PROMPT_COMMAND:-}"
fi

if ! trap -p DEBUG | grep -q __devbuddy_preexec 2>/dev/null; then
  trap '__devbuddy_preexec' DEBUG
fi
