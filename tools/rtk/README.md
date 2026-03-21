# RTK Integration for Paperclip Agents

[RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk) compresses CLI output before it reaches the LLM context, reducing token consumption by 60-90%.

## Installation

### 1. Install RTK binary

```bash
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
```

### 2. Install jq (required by the hook)

```bash
apt-get install -y jq
```

### 3. Verify

```bash
rtk --version   # Should show rtk 0.31.0+
rtk gain        # Should show token savings stats
```

### 4. Add hook to settings.json

Add this entry to the `PreToolUse` hooks array in `.claude/settings.json`:

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "bash tools/rtk/rtk-rewrite.sh"
    }
  ]
}
```

### 5. Restart Claude Code

The hook takes effect on restart. All Bash commands will be transparently rewritten through RTK.

## How it works

The hook intercepts `PreToolUse` events for Bash commands, passes them to `rtk rewrite`, and returns the compressed version. The agent never sees the rewrite — it just gets smaller output.

## Measuring impact

```bash
rtk gain              # Show cumulative token savings
rtk gain --history    # Show per-command savings history
rtk discover          # Find missed optimization opportunities
```
