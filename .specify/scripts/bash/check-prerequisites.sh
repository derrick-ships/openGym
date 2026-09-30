#!/usr/bin/env bash
set -euo pipefail

json=false
require_tasks=false
include_tasks=false
for arg in "$@"; do
  case "$arg" in
    --json) json=true ;;
    --require-tasks) require_tasks=true ;;
    --include-tasks) include_tasks=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "Not inside a git repository." >&2; exit 1; }
branch=$(git -C "$repo_root" branch --show-current)
if [[ -z "$branch" ]]; then
  echo "Cannot determine feature name from a detached HEAD." >&2
  exit 1
fi
feature=${branch##*/}
feature_dir="$repo_root/.specify/specs/$feature"
if [[ ! -d "$feature_dir" ]]; then
  echo "Feature directory not found: $feature_dir" >&2
  exit 1
fi
if [[ "$require_tasks" == true && ! -f "$feature_dir/tasks.md" ]]; then
  echo "Required tasks.md not found in $feature_dir" >&2
  exit 1
fi

docs=()
for doc in spec.md plan.md data-model.md research.md quickstart.md; do
  [[ -f "$feature_dir/$doc" ]] && docs+=("$doc")
done
if [[ "$include_tasks" == true && -f "$feature_dir/tasks.md" ]]; then
  docs+=("tasks.md")
fi

if [[ "$json" == true ]]; then
  python3 - "$feature_dir" "${docs[@]}" <<'PY'
import json
import sys

print(json.dumps({"FEATURE_DIR": sys.argv[1], "AVAILABLE_DOCS": sys.argv[2:]}, ensure_ascii=False))
PY
else
  printf 'FEATURE_DIR=%s\n' "$feature_dir"
  printf 'AVAILABLE_DOCS=%s\n' "${docs[*]}"
fi
