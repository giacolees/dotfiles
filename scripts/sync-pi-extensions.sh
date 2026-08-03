#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${HOME}/.pi/agent"
target_dir="${repo_root}/dot_pi/agent"

if [[ ! -d "${source_dir}" ]]; then
	printf 'Pi agent directory does not exist: %s\n' "${source_dir}" >&2
	exit 1
fi

mkdir -p "${target_dir}/extensions" "${target_dir}/npm"
cp "${source_dir}/settings.json" "${target_dir}/settings.json"
cp "${source_dir}/npm/package.json" "${target_dir}/npm/package.json"
cp "${source_dir}/npm/package-lock.json" "${target_dir}/npm/package-lock.json"
rm -f "${target_dir}/extensions/herdr-agent-state.ts"
rsync -a --delete --exclude='herdr-agent-state.ts' --include='*/' --include='*.ts' --include='*.js' \
	--exclude='*' "${source_dir}/extensions/" "${target_dir}/extensions/"

printf 'Synchronized Pi extension configuration into %s\n' "${target_dir}"
