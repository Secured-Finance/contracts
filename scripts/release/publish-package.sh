#!/usr/bin/env bash
set -euo pipefail

select_release() {
  [[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]]
  git merge-base --is-ancestor "$RELEASE_SHA" origin/main
  git switch --detach "$RELEASE_SHA"
  version=$(jq -er .version package.json)
  [[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-beta\.(0|[1-9][0-9]*))?$ ]]
  previous=${PREVIOUS_SHA:-"$RELEASE_SHA^"}
  previous_version=$(git show "$previous:package.json" | jq -er .version)
  if [[ "$version" == "$previous_version" ]]; then
    echo 'No package version change.'
    return 0
  fi
  jq -en --arg next "$version" --arg previous "$previous_version" '
    def order: capture("^(?<major>[0-9]+)\\.(?<minor>[0-9]+)\\.(?<patch>[0-9]+)(-beta\\.(?<beta>[0-9]+))?$") |
      [(.major|tonumber), (.minor|tonumber), (.patch|tonumber), (.beta == null), (.beta // "-1" | tonumber)];
    ($next | order) > ($previous | order)
  ' > /dev/null
  [[ "$(jq -er .version package-lock.json)" == "$version" ]]
  tag=latest
  if [[ "$version" == *-beta.* ]]; then tag=beta; fi
  echo "version=$version" >> "$GITHUB_OUTPUT"
  echo "tag=$tag" >> "$GITHUB_OUTPUT"
  package=$(jq -er '.name | select(test("^@[a-z0-9_-]+/[a-z0-9_.-]+$"))' package.json)
  echo "scope=${package%%/*}" >> "$GITHUB_OUTPUT"
}

publish_release() {
  tag="v$VERSION"
  remote_tag=$(git ls-remote --tags origin "refs/tags/$tag" "refs/tags/$tag^{}")
  if [[ -n "$remote_tag" ]]; then
    tag_sha=$(awk 'END { print $1 }' <<< "$remote_tag")
    [[ "$tag_sha" == "$(git rev-parse HEAD)" ]] || { echo "$tag already points to another commit"; exit 1; }
  fi
  tarball=$(jq -er '.[0].filename' "$RUNNER_TEMP/npm-pack.json")
  integrity=$(jq -er '.[0].integrity' "$RUNNER_TEMP/npm-pack.json")
  registry=https://npm.pkg.github.com
  package=$(jq -er .name package.json)
  if npm view "$package@$VERSION" dist.integrity --registry "$registry" --json > "$RUNNER_TEMP/npm-view.json"; then
    [[ "$(jq -er . "$RUNNER_TEMP/npm-view.json")" == "$integrity" ]] || {
      echo 'Version is already published with different package contents'; exit 1;
    }
  else
    [[ "$(jq -er .error.code "$RUNNER_TEMP/npm-view.json")" == E404 ]]
    active_version=$(git show origin/main:package.json | jq -er .version)
    [[ "$active_version" == "$VERSION" ]] || {
      echo 'Public main has moved to another package version'; exit 1;
    }
    npm publish "$RUNNER_TEMP/$tarball" --registry "$registry" --tag "$DIST_TAG" --ignore-scripts
  fi
  if [[ -z "$remote_tag" ]]; then
    git tag "$tag"
    git push origin "refs/tags/$tag"
  fi
}

case "${1:-}" in
  select) select_release ;;
  publish) publish_release ;;
  *) echo "Usage: $0 {select|publish}" >&2; exit 2 ;;
esac
