#!/usr/bin/env bash
set -euo pipefail

root_path="${ROOT_PATH:-${SUPERCONDUCTOR_ROOT_PATH:-${CONDUCTOR_ROOT_PATH:-$(git rev-parse --show-toplevel)}}}"
workspace_path="${WORKSPACE_PATH:-${SUPERCONDUCTOR_WORKSPACE_PATH:-${CONDUCTOR_WORKSPACE_PATH:-$(pwd)}}}"

copy_env_if_present() {
	local source_path="$1"
	local target_path="$2"

	if [[ -f "$source_path" ]]; then
		if [[ "$source_path" == "$target_path" ]]; then
			return
		fi

		mkdir -p "$(dirname "$target_path")"
		cp -f "$source_path" "$target_path"
	fi
}

copy_env_if_present "$root_path/.env" "$workspace_path/.env"
copy_env_if_present "$root_path/apps/web/.env" "$workspace_path/apps/web/.env"
copy_env_if_present "$root_path/apps/game-server/.env" "$workspace_path/apps/game-server/.env"

cd "$workspace_path"

pnpm install --frozen-lockfile
CI=1 pnpm run db:migrate:local
