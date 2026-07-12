#!/usr/bin/env bash
# One-time GitHub admin setup for Stock Stay env separation.
# Requires admin on Ironkd/StockStay (repo owner: Ironkd).
# Safe to re-run; updates existing environments / rulesets.
set -euo pipefail

REPO="Ironkd/StockStay"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: https://cli.github.com/" >&2
  exit 1
fi

OWNER="${REPO%%/*}"
NAME="${REPO##*/}"
AUTH_LOGIN="$(gh api user -q .login)"
PERMS="$(gh api "repos/${REPO}" --jq '.permissions.admin')"
if [[ "${PERMS}" != "true" ]]; then
  echo "Logged in as ${AUTH_LOGIN}, but admin is required on ${REPO}." >&2
  echo "Ask the repo owner (Ironkd) to run this script, or grant you admin temporarily." >&2
  exit 1
fi

echo "Using ${REPO} as ${AUTH_LOGIN} (admin)…"

# --- Environments with deployment branch policies ---
create_env() {
  local env_name="$1"
  local branch="$2"
  gh api --method PUT "repos/${REPO}/environments/${env_name}" --input - <<EOF
{
  "deployment_branch_policy": {
    "protected_branches": false,
    "custom_branch_policies": true
  }
}
EOF
  # Replace any existing branch policies with the single expected branch
  local policies
  policies="$(gh api "repos/${REPO}/environments/${env_name}/deployment-branch-policies" --jq '.branch_policies[]?.id' 2>/dev/null || true)"
  for id in ${policies}; do
    gh api --method DELETE "repos/${REPO}/environments/${env_name}/deployment-branch-policies/${id}" >/dev/null
  done
  gh api --method POST "repos/${REPO}/environments/${env_name}/deployment-branch-policies" \
    -f name="${branch}" -f type=branch >/dev/null
  echo "  environment '${env_name}' → branch '${branch}'"
}

create_env staging staging
create_env production main

# --- Branch rulesets (modern replacement for classic branch protection) ---
# main: no force-push / deletion; PRs required (approvals optional for small teams)
ensure_ruleset() {
  local ruleset_name="$1"
  local target_branch="$2"
  local require_pr="$3"

  local existing_id
  existing_id="$(gh api "repos/${REPO}/rulesets" --jq ".[] | select(.name==\"${ruleset_name}\") | .id" | head -1)"

  local rules_json
  if [[ "${require_pr}" == "true" ]]; then
    rules_json='[
      {"type":"deletion"},
      {"type":"non_fast_forward"},
      {"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false}}
    ]'
  else
    rules_json='[
      {"type":"deletion"},
      {"type":"non_fast_forward"}
    ]'
  fi

  local body
  body="$(jq -n \
    --arg name "${ruleset_name}" \
    --arg branch "${target_branch}" \
    --argjson rules "${rules_json}" \
    '{
      name: $name,
      target: "branch",
      enforcement: "active",
      conditions: { ref_name: { include: ["refs/heads/\($branch)"], exclude: [] } },
      rules: $rules,
      bypass_actors: []
    }')"

  if [[ -n "${existing_id}" ]]; then
    echo "${body}" | gh api --method PUT "repos/${REPO}/rulesets/${existing_id}" --input - >/dev/null
    echo "  updated ruleset '${ruleset_name}' on '${target_branch}'"
  else
    echo "${body}" | gh api --method POST "repos/${REPO}/rulesets" --input - >/dev/null
    echo "  created ruleset '${ruleset_name}' on '${target_branch}'"
  fi
}

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for ruleset setup (brew install jq)." >&2
  exit 1
fi

ensure_ruleset "Protect main (production)" main true
ensure_ruleset "Protect staging" staging false

echo
echo "Done. Verify at:"
echo "  https://github.com/${REPO}/settings/environments"
echo "  https://github.com/${REPO}/settings/rules"
echo "  Branches: https://github.com/${REPO}/branches"
