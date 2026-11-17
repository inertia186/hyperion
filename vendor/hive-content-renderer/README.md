# Hive Content Renderer

Vendored Hyperion copy of `steem-content-renderer@2.1.1`.

The original package name refers to the legacy blockchain; this vendored package
uses Hive-facing names for imports, package metadata, and browser globals while
preserving the renderer behavior Hyperion already depended on.

This package is an npm workspace of the root project. Keep it listed in the root
`workspaces` array as well as the `file:` dependency: Dependabot treats a plain
path dependency's manifest as a support file and excludes its dependencies from
updates. Workspace membership makes this manifest eligible for updates, including
`sanitize-html`, while retaining the local package and shared root lockfile.

Install and update dependencies from the repository root. If renderer dependencies
change, run `npm run build:hive-content-renderer` to regenerate both checked-in
browser bundles, then verify the SPA and legacy post previews.
