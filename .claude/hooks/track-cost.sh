#!/usr/bin/env bash
# Stop hook: Track session cost and token usage.
# Appends a line to a cost log for budget visibility.

set -uo pipefail

input=$(cat)
log_dir="${CLAUDE_LOG_DIR:-/tmp/claude-cost-logs}"
log_file="$log_dir/session-costs.jsonl"
mkdir -p "$log_dir"

timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
agent_id="${PAPERCLIP_AGENT_ID:-unknown}"
run_id="${PAPERCLIP_RUN_ID:-unknown}"

# Parse and log using node
echo "$input" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    let o={};
    try { o=JSON.parse(d); } catch(e) {}
    const entry = {
      timestamp: '$timestamp',
      agent_id: '$agent_id',
      run_id: '$run_id',
      session_id: o.session_id || 'unknown',
      cost_usd: o.total_cost_usd || 0,
      input_tokens: o.total_input_tokens || 0,
      output_tokens: o.total_output_tokens || 0,
      duration_sec: o.duration_seconds || 0,
      stop_reason: o.stop_reason || 'unknown'
    };
    const fs = require('fs');
    fs.appendFileSync('$log_file', JSON.stringify(entry) + '\n');
    console.log('Session cost logged: \$' + entry.cost_usd + ' | ' + entry.input_tokens + 'in/' + entry.output_tokens + 'out tokens | ' + entry.duration_sec + 's');
  });
"
