# Publishing mirror changes

Open Public PR copies the complete diff between Public `main` and an approved Private release branch commit into a new public branch and opens a PR. A package version change merged into Public `main` also starts Publish.

## Repository setup

| Location                              | Configuration                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private repository, Actions variables | Set `IS_MIRROR_REPOSITORY` to `true`. Leave it unset in the public repository. Set `PUBLIC_RELEASE_OWNER` and `PUBLIC_RELEASE_REPOSITORY` to the public repository's owner and name.                                                                                                                                                                                                                                  |
| Private repository, Actions secrets   | Set the existing `MACHINE_USER_APP_ID` and `MACHINE_USER_PRIVATE_KEY`. The App installation must include the public repository with Contents and Pull requests write permissions and the Private repository with Contents and Workflows write permissions for synchronization. Workflow changes also require Workflows write permission. Public branch rules must allow the App to push `publish/release-*` branches. |
| Public repository                     | Allow its Actions token to publish the existing npm package to GitHub Packages and create `v*` tags.                                                                                                                                                                                                                                                                                                                  |

Make `.github/workflows/open-public-pr.yml` and `scripts/release/promote-release.sh` available on Private `main`, and make the workflow available on the default branch for manual dispatch. In Public, install `.github/workflows/publish.yml`, `scripts/release/publish-package.sh`, and the pull request CI condition from `.github/workflows/build-smart-contracts.yml` through a setup PR. That condition allows PRs created by the Machine User App to run the usual checks.

## Branch setup

Set `main` as the default branch in both repositories. Before deleting `develop`, move active PRs and any unpublished changes to their intended release or feature branches. Work PRs target the release branch. The CI push filters cover `main`, `release/**`, and `feature/**`; PR checks run for every base branch.

## Deployment and publication

1. Keep Private `main` at the same commit as Public `main`. Create a release branch from Private `main` and merge reviewed work into that branch through Private PRs.
2. For contract upgrades, run **Update smart contracts** separately for each network and set its `branch` input. During development, specify a feature branch such as `feature/xxx-fix`; for a release, specify the release branch. Both fork testing and deployment read that branch. Deployment records and generated documentation are committed back to the same branch. The Machine User App needs permission to push to the selected branch. All Update and Reset executions in the repository are serialized, and deployment stops if the branch moved after a successful fork test.
   For development network resets, use **Reset smart contracts** with the intended `branch`. It saves deployment records and generated documentation to that branch.

3. Complete the applicable deployment checks before publication. For Safe-managed updates, proposal creation and execution are separate operations.
4. Run **Open Public PR** from Private `main`. Enter the full 40-character `candidate_sha` of the approved release branch commit, including deployment records. The commit must be available in the Private repository and must include the current Public `main` in its history. Review the complete diff, since every added, modified, and deleted file is published.
5. Choose `none`, `prerelease`, `patch`, `minor`, or `major` in `version_level`. `none` keeps the candidate's package version. Other choices run `npm version` against the candidate contents and include the resulting package and lockfile updates in the PR. `prerelease` uses the `beta` identifier. Even with `none`, a version change already present in the candidate can trigger Publish after merging.
6. Review and merge the public PR. A Public `main` push that changes `package.json` starts **Publish**. The workflow publishes only when the package version increased and matches the root version in `package-lock.json`. Supported versions are stable `X.Y.Z` and `X.Y.Z-beta.N`. It builds from the published commit, publishes to `https://npm.pkg.github.com`, and creates `v<version>`. Beta versions use the `beta` dist-tag; stable versions use `latest`.
7. After the Public PR merges, run **Sync Public main** from Private `main`. It fetches Public `main` and fast-forwards Private `main` to exactly that SHA. Independent Private commits or a concurrently advanced Private `main` cause the run to fail rather than overwrite history. Create the next release branch from the synchronized `main`. To reuse a release branch, merge the synchronized `main` into it before preparing the next candidate.

## Recovery

If deployment fails, inspect its logs and on-chain receipts before rerunning, since transactions may already have been broadcast.

For publication failures, rerun the failed job after resolving the cause. The same run reuses an existing open or merged PR, or an identical branch pushed before PR creation failed. A new workflow run uses a new branch name. Public `main` must still match the commit recorded during preparation when creating a PR. If it moved, sync and review the new baseline, then start a new run. An empty combined diff finishes successfully without creating a PR; a selected version bump can still produce a diff when the candidate files otherwise match.

For Publish failures, rerun the failed job or dispatch **Publish** from Public `main` with the original version-changing `release_sha`. That commit must be contained in Public `main`. An existing package version is accepted only when its integrity matches the newly built package, and an existing version tag must point to the same commit. Publishing a missing version also requires the version in the checkout's `origin/main` to match the requested version.
