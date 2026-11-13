# Release versions

Use 0–9 for the minor and patch components. After 1.4.9 comes 1.5.0; after 1.9.9 comes 2.0.0.
Use `node scripts/release-version.cjs --dry-run` to preview the next version, then `node scripts/release-version.cjs` to update package.json and the app footer together. Run it once per release, before the release commit.
Run `node scripts/release-version.cjs --check` before publishing. Keep the Git release tag equal to `v` plus the package version. Do not rename existing historical releases.
