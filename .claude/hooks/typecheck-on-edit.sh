#!/usr/bin/env bash
# PostToolUse hook: Run typecheck after TypeScript file edits.
# Only triggers for .ts/.tsx file modifications to avoid unnecessary runs.

set -uo pipefail

input=$(cat)

# Extract file_path using node
file_path=$(echo "$input" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try {
      const o=JSON.parse(d);
      console.log(o.tool_input?.file_path || o.tool_input?.notebook_path || '');
    } catch(e) { console.log(''); }
  });
")

if [ -z "$file_path" ]; then
  exit 0
fi

# Only typecheck TypeScript files
case "$file_path" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Find the nearest package.json with a typecheck script
dir=$(dirname "$file_path")
pkg_dir=""
while [ "$dir" != "/" ]; do
  if [ -f "$dir/package.json" ] && grep -q '"typecheck"' "$dir/package.json" 2>/dev/null; then
    pkg_dir="$dir"
    break
  fi
  dir=$(dirname "$dir")
done

if [ -z "$pkg_dir" ]; then
  exit 0
fi

# Debounce: skip if last typecheck was < 30s ago
stamp_file="/tmp/.claude-typecheck-stamp"
now=$(date +%s)
if [ -f "$stamp_file" ]; then
  last=$(cat "$stamp_file")
  if [ $((now - last)) -lt 30 ]; then
    exit 0
  fi
fi
echo "$now" > "$stamp_file"

echo "Running typecheck in $(basename "$pkg_dir")..."
cd "$pkg_dir"
if ! pnpm typecheck 2>&1 | tail -30; then
  echo "Typecheck failed - please fix before continuing."
fi

exit 0
