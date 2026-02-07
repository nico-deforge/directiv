#!/usr/bin/env bash
# PostToolUse hook: run relevant linters after Edit/Write operations.
# Receives tool call JSON via stdin. Output is fed back to Claude as feedback.

set -euo pipefail

file_path=$(jq -r '.tool_input.file_path')
cd "$CLAUDE_PROJECT_DIR"

errors=""

case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx)
    check_out=$(mise run check 2>&1) || errors+="$check_out"$'\n'
    ;;
  *.rs)
    check_out=$(mise run rust:check 2>&1) || errors+="$check_out"$'\n'
    ;;
esac

if [ -n "$errors" ]; then
  echo "$errors"
  exit 1
fi
