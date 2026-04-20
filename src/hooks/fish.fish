# devbuddy shell hook for fish
# Sends command and exit-code events to the devbuddy daemon

function __devbuddy_postexec --on-event fish_postexec
  set -l exit_code $status
  set -l sock "$HOME/.devbuddy/devbuddy.sock"
  set -l cmd (string sub -l 500 -- "$argv")
  set -l cmd (string replace -a '"' '\\"' -- "$cmd")
  set -l cwd (string replace -a '"' '\\"' -- "$PWD")

  if test -S "$sock"
    printf '{"type":"cmd","cmd":"%s","exit":%d,"cwd":"%s"}\n' \
      "$cmd" "$exit_code" "$cwd" \
      | socat - UNIX-CONNECT:"$sock" 2>/dev/null &
    disown 2>/dev/null
  end
end
