#!/usr/bin/env bash
set -euo pipefail

# Every dependency and diagnostic log stays outside the workspace.
source_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
experiment_dir="$(mktemp -d "${TMPDIR:-/tmp}/hexwardens-effect-machine.XXXXXX")"
printf 'Evidence directory: %s\n' "$experiment_dir"
node --version > "$experiment_dir/versions.txt"
npm --version >> "$experiment_dir/versions.txt"
npm view @typeonce/effect-machine version peerDependencies dist-tags --json > "$experiment_dir/release.json"

for fixture in supported current strict-peer; do
  mkdir -p "$experiment_dir/$fixture"
  printf '{"private":true,"type":"module"}\n' > "$experiment_dir/$fixture/package.json"
done

npm install --prefix "$experiment_dir/supported" --ignore-scripts --no-audit --no-fund --strict-peer-deps \
  @typeonce/effect-machine@0.39.0 effect@4.0.0-rc.117 typescript@7.0.2 @types/node@24.10.13 \
  > "$experiment_dir/supported-install.log" 2>&1

# A normal install must reject the unsupported pair. Do not override peers.
if npm install --prefix "$experiment_dir/strict-peer" --ignore-scripts --no-audit --no-fund --strict-peer-deps \
  @typeonce/effect-machine@0.39.0 effect@4.0.0-rc.118 \
  > "$experiment_dir/strict-peer.log" 2>&1; then
  printf 'Unexpected peer acceptance; reassess compatibility.\n' >&2
  exit 1
fi
grep -q 'ERESOLVE' "$experiment_dir/strict-peer.log"

# Diagnostic only: unpack the unmodified published tarball beside one rc.118
# runtime. This is not an installation workaround for the application.
npm install --prefix "$experiment_dir/current" --ignore-scripts --no-audit --no-fund --strict-peer-deps \
  effect@4.0.0-rc.118 typescript@7.0.2 @types/node@24.10.13 \
  > "$experiment_dir/current-install.log" 2>&1
npm pack @typeonce/effect-machine@0.39.0 --pack-destination "$experiment_dir" --json > "$experiment_dir/tarball.json"
mkdir -p "$experiment_dir/current/node_modules/@typeonce/effect-machine"
tar -xzf "$experiment_dir/typeonce-effect-machine-0.39.0.tgz" \
  -C "$experiment_dir/current/node_modules/@typeonce/effect-machine" --strip-components=1

for fixture in supported current; do
  cp "$source_dir/planner.ts" "$source_dir/planner.test.ts" "$source_dir/tsconfig.json" "$experiment_dir/$fixture/"
  (
    cd "$experiment_dir/$fixture"
    ./node_modules/.bin/tsc -p tsconfig.json > ../"$fixture-types.log" 2>&1
    node --test planner.test.ts > ../"$fixture-tests.log" 2>&1
  )
  printf '%s: strict compilation and planner tests passed\n' "$fixture"
done

(cd "$experiment_dir/supported" && node --input-type=module -e "await import('@typeonce/effect-machine/reactivity')") \
  > "$experiment_dir/supported-reactivity.log" 2>&1
if (cd "$experiment_dir/current" && node --input-type=module -e "await import('@typeonce/effect-machine/reactivity')") \
  > "$experiment_dir/current-reactivity.log" 2>&1; then
  printf 'Unexpected adapter success; reassess the documented blocker.\n' >&2
  exit 1
fi
grep -q 'ERR_MODULE_NOT_FOUND' "$experiment_dir/current-reactivity.log"
grep -q './unstable/reactivity' "$experiment_dir/current-reactivity.log"
printf 'Confirmed: rc.118 strict peer rejection; core passes; optional reactivity fails.\n'
printf 'Retained evidence: %s\n' "$experiment_dir"
