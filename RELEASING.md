# Releasing

Releases are published to npm as [`@itinerisltd/composify`](https://www.npmjs.com/package/@itinerisltd/composify) and listed on [GitHub Releases](https://github.com/ItinerisLtd/composify/releases).

## Prerequisites

- An npm login with publish rights to `@itinerisltd/composify` (check with `npm whoami`).
  Have a one-time password ready if your npm account uses 2FA.
- The GitHub CLI (`gh`), authenticated.
- Git signing set up for commits and tags.
  `master` only accepts signed commits, and release tags are signed too.

## Choosing the version

Review the changes since the last release, where `vPREVIOUS` is the latest existing tag:

```sh
git log --oneline vPREVIOUS..master
```

While the project is below 1.0.0, bump the minor version for new features and breaking changes, and the patch version for fixes and dependency updates.

## 1. Bump the version on a branch

```sh
git checkout master && git pull
git checkout -b chore/release-X.Y.Z
npm ci
npm run build
npm version X.Y.Z -m 'chore(release): %s' --sign-git-commit --sign-git-tag
git push --no-follow-tags -u origin chore/release-X.Y.Z
```

`npm version` updates `package.json` and `package-lock.json`, runs the `version` script (`oclif readme`), then creates a signed commit and a signed `vX.Y.Z` tag.

`oclif readme` loads the compiled commands, so `dist/` must be built first.
`npm version` stops if the working tree has uncommitted changes.
Push only the branch for now, not the tag.

## 2. Open and merge a pull request

Open a pull request for the branch.
Once the `Node` check passes and the PR is approved, merge it with **Create a merge commit**.

Squash and rebase merges rewrite the release commit, which leaves the tag pointing at a commit that is not on `master`.
If GitHub asks you to update the branch, use the merge option rather than rebase.
Any push after approval needs a fresh approval.

## 3. Push the tag

```sh
git checkout master && git pull
git push origin vX.Y.Z
```

If the branch was updated or the release commit changed after `npm version` ran, re-create the tag on `master` before pushing it.
Do this before publishing, since the published package and the tag should match:

```sh
git tag -d vX.Y.Z
git tag -s vX.Y.Z -m 'chore(release): X.Y.Z' master
```

## 4. Publish to npm

From `master`:

```sh
npm run build
npm publish
```

`prepack` generates `oclif.manifest.json` from `dist/`, and `postpack` removes it afterwards.

## 5. Create the GitHub release

```sh
gh release create vX.Y.Z --generate-notes --verify-tag
```

Then check that npm shows the new version:

```sh
npm view @itinerisltd/composify version
```
