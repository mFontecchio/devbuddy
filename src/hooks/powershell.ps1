# devbuddy shell hook for PowerShell
# Sends command, exit-code, and recent output to the devbuddy daemon

$__devbuddy_original_prompt = $function:prompt
$__devbuddy_last_history_id = -1

function prompt {
    $exitCode = if ($?) { 0 } else { 1 }
    $lastCmd = (Get-History -Count 1 -ErrorAction SilentlyContinue)

    if ($lastCmd -and $lastCmd.Id -ne $__devbuddy_last_history_id) {
        $script:__devbuddy_last_history_id = $lastCmd.Id
        $cmd = $lastCmd.CommandLine
        if ($cmd.Length -gt 500) { $cmd = $cmd.Substring(0, 500) }
        $cmd = $cmd -replace '\\', '\\\\'
        $cmd = $cmd -replace '"', '\"'
        $cwd = ($PWD.Path) -replace '\\', '/'
        $cwd = $cwd -replace '"', '\"'

        # Capture recent output by re-running via Out-String on the history
        # PowerShell doesn't expose prior command output directly, so we
        # send the command and exit code. For richer output capture, the
        # user can pipe through devbuddy or use Start-Transcript integration.
        $pipeName = "devbuddy"
        $msg = "{`"type`":`"cmd`",`"cmd`":`"$cmd`",`"exit`":$exitCode,`"cwd`":`"$cwd`"}`n"

        try {
            $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(
                ".", $pipeName, [System.IO.Pipes.PipeDirection]::InOut,
                [System.IO.Pipes.PipeOptions]::Asynchronous
            )
            $pipe.Connect(500)
            $writer = New-Object System.IO.StreamWriter($pipe)
            $writer.Write($msg)
            $writer.Flush()
            $writer.Dispose()
            $pipe.Dispose()
        } catch {
            # Daemon not running, silently ignore
        }
    }

    & $__devbuddy_original_prompt
}
