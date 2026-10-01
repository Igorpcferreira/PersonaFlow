#!/usr/bin/env bash
set -euo pipefail

env_file="$HOME/.config/personaflow/personaflow.env"
expected_comment="${1:?Informe o ID do comentario autorizado}"
[[ "$expected_comment" =~ ^[1-9][0-9]*$ ]] || exit 2
grep -qx 'PERSONAFLOW_SEND_MODE=disabled' "$env_file"
grep -qx "META_INSTAGRAM_TEST_COMMENT_ID=$expected_comment" "$env_file"

restore() {
  sed -i 's/^PERSONAFLOW_SEND_MODE=.*/PERSONAFLOW_SEND_MODE=disabled/' "$env_file"
  systemctl --user restart personaflow-worker
}
trap restore EXIT HUP INT TERM
sed -i 's/^PERSONAFLOW_SEND_MODE=.*/PERSONAFLOW_SEND_MODE=meta-private-reply/' "$env_file"
systemctl --user restart personaflow-worker
sleep 8
