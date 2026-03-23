# RTK Integration for Paperclip Agents

[RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk) compresses CLI output before it reaches the LLM context, reducing token consumption by 60-90%.

## Installation

### 1. Install RTK binary (pinned to v0.31.0)

```bash
# Debian/Ubuntu (preferred — pinned release, no remote scripts)
curl -fsSL -o /tmp/rtk_0.31.0-1_amd64.deb \
  https://github.com/rtk-ai/rtk/releases/download/v0.31.0/rtk_0.31.0-1_amd64.deb
sudo dpkg -i /tmp/rtk_0.31.0-1_amd64.deb
rm /tmp/rtk_0.31.0-1_amd64.deb

# macOS (Homebrew)
brew install rtk
```

> **Security note:** Always install from a pinned release. Never use `curl | sh` from master.

### 2. Install jq (required by the hook)

```bash
# Ubuntu/Debian
apt-get install -y jq

# macOS
brew install jq
```

### 3. Verify installation

```bash
rtk --version   # Should show rtk 0.31.0+
rtk gain        # Should show token savings stats
```

### 4. Add hook to Claude Code settings

Add this entry to the `PreToolUse` hooks array in `.claude/settings.json`:

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "bash /path/to/tools/rtk/rtk-rewrite.sh"
    }
  ]
}
```

Replace `/path/to` with the actual path to your Paperclip installation.

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
