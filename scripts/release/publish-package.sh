#!/usr/bin/env bash
set -euo pipefail

validate_version() {
  previous_version=$1
  version=$(jq -er .version package.json)
  [[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-beta\.(0|[1-9][0-9]*))?$ ]]
  [[ "$(jq -er .version package-lock.json)" == "$version" ]] || {
    echo 'Package and lockfile versions must match.' >&2; exit 1;
  }
  if [[ "$version" == "$previous_version" ]]; then return 0; fi
  jq -en --arg next "$version" --arg previous "$previous_version" '
    def order: capture("^(?<major>[0-9]+)\\.(?<minor>[0-9]+)\\.(?<patch>[0-9]+)(-beta\\.(?<beta>[0-9]+))?$") |
      [(.major|tonumber), (.minor|tonumber), (.patch|tonumber), (.beta == null), (.beta // "-1" | tonumber)];
    ($next | order) > ($previous | order)
  ' > /dev/null || {
    echo 'The package version must increase from Public main.' >&2; exit 1;
  }
}

select_release() {
  [[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]]
  git merge-base --is-ancestor "$RELEASE_SHA" origin/main
  git switch --detach "$RELEASE_SHA"
  previous=${PREVIOUS_SHA:-"$RELEASE_SHA^"}
  previous_version=$(git show "$previous:package.json" | jq -er .version)
  validate_version "$previous_version"
  if [[ "$version" == "$previous_version" ]]; then
    echo 'No package version change.'
    return 0
  fi
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
  if ! npm view "$package" versions --registry "$registry" --json --loglevel=silent \
    > "$RUNNER_TEMP/npm-versions.json" 2> "$RUNNER_TEMP/npm-error.json"; then
    if ! jq -se 'any(.[]; .error.code == "E404")' \
      "$RUNNER_TEMP/npm-versions.json" "$RUNNER_TEMP/npm-error.json" > /dev/null; then
      echo 'Could not read package versions from the registry.' >&2
      exit 1
    fi
    echo '[]' > "$RUNNER_TEMP/npm-versions.json"
  fi
  if jq -e --arg version "$VERSION" '
    if type == "array" then index($version) != null else . == $version end
  ' "$RUNNER_TEMP/npm-versions.json" > /dev/null; then
    published_integrity=$(npm view "$package@$VERSION" dist.integrity --registry "$registry" --json | jq -er .)
    [[ "$published_integrity" == "$integrity" ]] || {
      echo 'Version is already published with different package contents'; exit 1;
    }
  else
    git fetch --no-tags origin refs/heads/main
    active_version=$(git show FETCH_HEAD:package.json | jq -er .version)
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
  validate) validate_version "$2" ;;
  select) select_release ;;
  publish) publish_release ;;
  *) echo "Usage: $0 {validate <previous-version>|select|publish}" >&2; exit 2 ;;
esac
