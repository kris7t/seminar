# Releasing Seminar

The eight library packages and `create-seminar` share a version. The repository
root, documentation site, and example stay private. Internal dependencies use
the exact shared version.

## Run a release

In GitHub Actions, select **Release npm packages → Run workflow**, choose
`main`, and set:

- **bump**: `patch`, `minor`, or `major`.
- **mode**: `staged` (the default) or `direct`.

The workflow increments all package versions and workspace references, updates
the lockfile, runs `npm run check`, and smoke-tests the packed packages in an
isolated consumer project. It then commits the verified version changes on
`main`, pushes an annotated `v…` tag, creates a draft GitHub release with the
tarballs, and publishes those exact tarballs to npm in dependency order.
The initial version baseline is `0.0.0`; choose `minor` for the first `0.1.0`
release. No manual version commit or tag is needed.

In **staged** mode, packages wait on npm for a maintainer to approve them with
2FA. The Actions summary and GitHub release notes list each package's stage ID.
Use npm's staged-publishing interface, or `npm stage approve <stage-id>`, to
approve them in the listed dependency order. Once all nine are approved,
publish the draft GitHub release. Approval cannot be automated using OIDC.

In **direct** mode, packages become available on npm during the workflow, and
the GitHub release is published automatically after all packages succeed. This
requires direct publishing to be enabled for each npm trusted publisher.

Releases are serialized. If `main` advances while verification runs, the atomic
commit-and-tag push fails; run a new workflow from the updated `main`.
GitHub repository rules must allow the workflow token to push release commits
and tags.

## Configure publishing once

Create the `npm` GitHub environment. For each library and `create-seminar`,
configure an [npm trusted publisher](https://docs.npmjs.com/trusted-publishers/)
with:

- Organization or user: `kris7t`
- Repository: `seminar`
- Workflow filename: `release.yml`
- Environment name: `npm`
- Allowed actions: staged publishing; also enable direct publishing if needed.

Both modes use GitHub Actions OIDC and npm provenance. The workflow installs
npm 11 explicitly; [staged publishing](https://docs.npmjs.com/staged-publishing/)
requires npm 11.15.0 or newer. Builds and smoke tests run in a separate job
without publishing credentials.

New packages need a first upload before their npm trusted publisher can be
configured. Add an `NPM_TOKEN` secret in the `npm` GitHub environment with
permission to create and publish packages in the `@seminar` scope and the
unscoped `create-seminar` package, and run the workflow in staged mode.
Staging creates a public `0.0.0-stage` placeholder for
new packages, so their publisher settings become available before the actual
release is approved. Configure OIDC for all nine packages, then remove the
secret. A token used for a direct bootstrap also needs npm's 2FA bypass.

## Recover a partial release

Rerun the failed workflow jobs in the same run to retry the same version.
Starting a new workflow creates another version bump.

The workflow verifies the existing tag matches the tested version patch. It
checks npm tarball integrity before skipping an already published package.
After each successful upload it saves a receipt on the draft GitHub release;
retries reuse staged uploads instead of submitting them again. Partial
receipts are also uploaded as an Actions artifact if a later step fails. If a
receipt upload itself fails, restore that artifact's `publish-results.json` as
a GitHub release asset before retrying.

OIDC cannot inspect or approve stages. If you manually reject a stage, remove
its entry from the release's `publish-results.json` asset before retrying.
A staged version must be approved or rejected before it can be published
directly. Fixes to a published package require another version.

## Check packages locally

Use Node.js 24 or newer and npm 11.15.0 or newer.

```sh
npm ci
npm run release:version -- minor
npm run check
npm run release:pack
npm run release:smoke
```

`release:version` also accepts an explicit version, such as `0.2.0-rc.1`, and
doesn't commit or tag anything. Stable versions use npm's `latest` tag;
prerelease versions use `next`.

`release:pack` starts from clean package build directories and produces nine
tarballs plus an integrity manifest in `artifacts/npm/`. It checks public
exports, README files, licenses, and excludes tests and build metadata. Each
package's `prepack` hook also builds that package and copies the root license
when packing it directly.

`release:smoke` installs those tarballs outside the workspaces, checks Node
imports and TypeScript declarations without `skipLibCheck`, then builds a
self-contained Vite deck using the theme, elements, MathJax, Shiki, and a
dynamic formula. It also runs the packed `create-seminar` command and builds
isolated starters with a custom theme and all plugins, and the default theme
without plugins, covering both self-contained and separate-asset builds.
The smoke test checks source aliases in development and
typechecking and keeps source fixtures out of deck discovery. Generated
projects use the tested local tarballs for Seminar
dependencies. It needs registry access for external dependencies. Successful
fixtures are removed; failed fixtures are kept for inspection. Regular CI runs
the package checks too.

After packing and testing, `npm run release:publish -- staged v0.1.0` stages the
verified tarballs; replacing `staged` with `direct` publishes them immediately.
These commands upload to npm and require npm authentication.
