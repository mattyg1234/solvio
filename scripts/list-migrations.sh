#!/usr/bin/env bash
# Print Solvio migrations in apply order (for Supabase db push or manual SQL Editor).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
count=0
while IFS= read -r f; do
  count=$((count + 1))
  printf '%2d. %s\n' "$count" "$(basename "$f")"
done < <(find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' | sort)
echo ""
echo "Total: $count migration files"
echo "Apply: supabase link --project-ref YOUR_REF && supabase db push"
