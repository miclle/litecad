#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${LITECAD_SMOKE_BASE_URL:-http://127.0.0.1:46280}"
PROMPT="${LITECAD_SMOKE_PROMPT:-创建一个直径 30mm 的球体，xyz 轴每根轴线上都有一个直径 5mm 的通孔}"
EMAIL="${LITECAD_SMOKE_EMAIL:-litecad-smoke-$(date +%s)@example.invalid}"
PASSWORD="${LITECAD_SMOKE_PASSWORD:-litecad-smoke-password}"
PROJECT_NAME="${LITECAD_SMOKE_PROJECT_NAME:-AI provider smoke $(date +%s)}"
ATTEMPTS="${LITECAD_SMOKE_ATTEMPTS:-2}"
if ! [[ "$ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "LITECAD_SMOKE_ATTEMPTS must be a positive integer." >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
cookie_jar="$tmpdir/cookies.txt"
cleanup_project_id=""

cleanup() {
  if [[ -n "$cleanup_project_id" ]]; then
    curl -fsS -b "$cookie_jar" -X DELETE "$BASE_URL/api/v1/projects/$cleanup_project_id" >/dev/null 2>&1 || true
  fi
  rm -rf "$tmpdir"
}
trap cleanup EXIT

json_get() {
  local path="$1"
  node -e '
const fs = require("fs");
const path = process.argv[1].split(".");
let value = JSON.parse(fs.readFileSync(0, "utf8"));
for (const key of path) value = value == null ? undefined : value[key];
if (value == null) process.exit(1);
process.stdout.write(String(value));
' "$path"
}

json_has_artifact() {
  node -e '
const fs = require("fs");
const value = JSON.parse(fs.readFileSync(0, "utf8"));
if (!value.artifact || !value.artifact.id || !value.artifact.source_kind) process.exit(1);
process.stdout.write(`${value.artifact.id}\t${value.artifact.source_kind}\t${value.artifact.title || ""}`);
'
}

post_json_status() {
  local url="$1"
  local body="$2"
  local output="$3"
  curl -sS -b "$cookie_jar" -c "$cookie_jar" \
    -H "Content-Type: application/json" \
    -o "$output" \
    -w "%{http_code}" \
    -X POST \
    --data "$body" \
    "$url"
}

post_json() {
  local url="$1"
  local body="$2"
  local output="$3"
  local status
  status="$(post_json_status "$url" "$body" "$output")"
  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "request failed: POST $url returned HTTP $status" >&2
    sed -E 's/("api_key"[[:space:]]*:[[:space:]]*)"[^"]+"/\1"[redacted]"/g' "$output" >&2 || true
    exit 1
  fi
}

echo "LiteCAD AI provider smoke"
echo "Base URL: $BASE_URL"
echo "Prompt: $PROMPT"
echo

register_json="$tmpdir/register.json"
post_json "$BASE_URL/api/v1/auth/register" \
  "$(node -e 'process.stdout.write(JSON.stringify({name:"LiteCAD Smoke", email:process.argv[1], password:process.argv[2]}))' "$EMAIL" "$PASSWORD")" \
  "$register_json"

project_json="$tmpdir/project.json"
post_json "$BASE_URL/api/v1/projects" \
  "$(node -e 'process.stdout.write(JSON.stringify({name:process.argv[1], description:"Temporary live AI provider smoke project."}))' "$PROJECT_NAME")" \
  "$project_json"
project_id="$(json_get project.id < "$project_json")"
cleanup_project_id="$project_id"

run_json="$tmpdir/parametric-run.json"
conversation_id=""
last_status=""
for ((attempt = 1; attempt <= ATTEMPTS; attempt++)); do
  echo "Attempt $attempt/$ATTEMPTS"
  conversation_json="$tmpdir/conversation-$attempt.json"
  post_json "$BASE_URL/api/v1/projects/$project_id/agent/conversations" \
    "$(node -e 'process.stdout.write(JSON.stringify({title:`AI provider smoke ${process.argv[1]}`}))' "$attempt")" \
    "$conversation_json"
  conversation_id="$(json_get conversation.id < "$conversation_json")"

  run_json="$tmpdir/parametric-run-$attempt.json"
  last_status="$(post_json_status "$BASE_URL/api/v1/projects/$project_id/agent/conversations/$conversation_id/parametric-runs" \
    "$(node -e 'process.stdout.write(JSON.stringify({message:process.argv[1]}))' "$PROMPT")" \
    "$run_json")"
  if [[ "$last_status" -ge 200 && "$last_status" -lt 300 ]] && json_has_artifact < "$run_json" >/dev/null; then
    break
  fi
  sed -E 's/("api_key"[[:space:]]*:[[:space:]]*)"[^"]+"/\1"[redacted]"/g' "$run_json" >&2 || true
  if [[ "$attempt" -lt "$ATTEMPTS" ]]; then
    echo "Retrying live provider smoke after HTTP $last_status." >&2
  fi
done

if [[ "$last_status" -lt 200 || "$last_status" -ge 300 ]]; then
  echo "request failed: parametric run returned HTTP $last_status after $ATTEMPTS attempt(s)" >&2
  exit 1
fi

artifact_summary="$(json_has_artifact < "$run_json")"
artifact_id="$(printf '%s' "$artifact_summary" | cut -f1)"
source_kind="$(printf '%s' "$artifact_summary" | cut -f2)"
title="$(printf '%s' "$artifact_summary" | cut -f3-)"

case "$source_kind" in
  litecad-feature-dsl|openscad) ;;
  *)
    echo "unexpected generated source kind: $source_kind" >&2
    exit 1
    ;;
esac

echo "Provider smoke passed."
echo "Project: $project_id"
echo "Conversation: $conversation_id"
echo "Artifact: $artifact_id"
echo "Source kind: $source_kind"
echo "Title: $title"
echo
echo "This script proves the running server can reach the configured provider and create an artifact."
echo "Run task test-browser for deterministic browser compile/save/canvas coverage."
