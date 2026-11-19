#!/usr/bin/env bash
set -euo pipefail

package_script="$(cd "$(dirname "$0")" && pwd)/publish-package.sh"
phase=$1
manifest=${2:-}
version_level=${PACKAGE_VERSION_LEVEL:-none}
public_repo="${PUBLIC_RELEASE_OWNER:-}/${PUBLIC_RELEASE_REPOSITORY:-}"

validate_destination() {
  if [[ ! "$public_repo" =~ ^[A-Za-z0-9-]+/[A-Za-z0-9_.-]+$ ]]; then
    echo 'Set PUBLIC_RELEASE_OWNER and PUBLIC_RELEASE_REPOSITORY to the publishing repository.' >&2
    return 1
  fi
  local destination current
  destination=$(printf '%s' "$public_repo" | tr '[:upper:]' '[:lower:]')
  current=$(printf '%s' "$GITHUB_REPOSITORY" | tr '[:upper:]' '[:lower:]')
  [[ "$destination" != "$current" ]]
}

validate_version_level() {
  case "$version_level" in
    none|prerelease|patch|minor|major) ;;
    *) echo "Unsupported npm version bump: $version_level" >&2; return 1 ;;
  esac
}

validate_destination

if [[ "$phase" == prepare ]]; then
  validate_version_level
  candidate_sha=$(git rev-parse HEAD)
  echo "Preparing publication of commit $candidate_sha"
  git fetch --no-tags "https://github.com/$public_repo.git" main
  public_sha=$(git rev-parse FETCH_HEAD)
  git merge-base --is-ancestor "$public_sha" "$candidate_sha"
  mkdir -p "$(dirname "$manifest")"
  jq -n --arg candidate "$candidate_sha" --arg base "$public_sha" \
    --arg versionLevel "$version_level" --arg publicRepository "$public_repo" \
    '{candidate: $candidate, base: $base, versionLevel: $versionLevel, publicRepository: $publicRepository}' > "$manifest"
  patch="$(dirname "$manifest")/release.patch"
  git diff --binary --no-renames "$public_sha" "$candidate_sha" > "$patch"
  workflow_changes=false
  if [[ -s "$patch" ]]; then
    workflow_diff=$(git apply --numstat --include='.github/workflows/*' "$patch")
    if [[ -n "$workflow_diff" ]]; then workflow_changes=true; fi
  fi
  printf 'workflow_changes=%s\n' "$workflow_changes" >> "$GITHUB_OUTPUT"
  exit
fi

[[ "$phase" == publish ]]
cd "$(dirname "$manifest")"
base=$(jq -er .base release.json)
version_level=$(jq -er .versionLevel release.json)
validate_version_level
[[ "$base" =~ ^[0-9a-f]{40}$ ]]
[[ "$(jq -er .publicRepository release.json)" == "$public_repo" ]]
branch="publish/release-$PUBLIC_PR_RUN_ID"
export GH_REPO=$public_repo
gh auth setup-git --hostname github.com
git clone --branch main --single-branch "https://github.com/$public_repo.git" public
cd public

existing=$(gh pr list --state all --head "$branch" --base main --json url,state --jq '.[0] | if .state == "OPEN" or .state == "MERGED" then .url else empty end')
if [[ -n "$existing" ]]; then
  printf 'Public PR: %s\n' "$existing"
  exit
fi
[[ "$(git rev-parse HEAD)" == "$base" ]] || { echo "Public main moved after deployment preparation"; exit 1; }
git switch -c "$branch"

if [[ -s ../release.patch ]]; then
  git apply --index ../release.patch
fi

if [[ "$version_level" == none ]]; then
  if git diff --cached --quiet; then
    echo 'No changes to publish.'
    exit 0
  fi
else
  version_args=(--no-git-tag-version --ignore-scripts)
  if [[ "$version_level" == prerelease ]]; then version_args+=(--preid beta); fi
  npm version "$version_level" "${version_args[@]}"
  git add package.json package-lock.json
fi

previous_version=$(git show "$base:package.json" | jq -er .version)
bash "$package_script" validate "$previous_version"

body="$RUNNER_TEMP/public-pr.md"
{
  echo 'Publishes the complete diff from the approved mirror commit.'
  if [[ "$version_level" != none ]]; then
    printf '\nPackage version: `%s`\n' "$(jq -er .version package.json)"
  fi

} > "$body"

git diff --cached --check
git diff --cached --name-status
git -c user.name='SF Machine User[bot]' \
  -c user.email="${MACHINE_USER_APP_ID}+sf-machine-user[bot]@users.noreply.github.com" \
  commit -m 'chore: publish release changes'
# A push can succeed before PR creation fails. Reuse an identical branch on retry.
remote=$(git ls-remote --heads origin "refs/heads/$branch")
if [[ -n "$remote" ]]; then
  git fetch origin "$branch"
  [[ "$(git rev-parse 'HEAD^{tree}')" == "$(git rev-parse 'FETCH_HEAD^{tree}')" ]] || {
    echo "Existing public branch has different content"; exit 1;
  }
else
  git push origin "HEAD:refs/heads/$branch"
fi

gh pr create --base main --head "$branch" \
  --title 'Publish release changes' --body-file "$body"
