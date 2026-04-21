#!/usr/bin/env bash
# PreToolUse hook: Block --no-verify flag in git commands.
# Agents must fix underlying issues instead of bypassing hooks.

set -euo pipefail

input=$(cat)

# Extract command using node (jq not available)
command=$(echo "$input" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { const o=JSON.parse(d); console.log(o.tool_input?.command||''); }
    catch(e) { console.log(''); }
  });
")

if [ -z "$command" ]; then
  exit 0
fi

if echo "$command" | grep -qE '(^|\s)--no-verify(\s|$)'; then
  echo "BLOCKED: --no-verify is not allowed. Fix the underlying hook failure instead of bypassing it."
  exit 2
fi
