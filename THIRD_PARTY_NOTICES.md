# Third-party notices

The project's original source code is MIT licensed. Third-party material retains its own license.

## Models and animations

The visual registries and [asset decision](docs/adr/0006-adopt-kaykit-asset-suite-and-animations.md) identify the committed models and animations under `apps/web/public/models/` as the KayKit asset suite by [Kay Lousberg](https://kaylousberg.com/), distributed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The in-game `/credits` page renders any additional per-model attribution recorded in the registries.

When adding or replacing an asset, record its upstream source and license with the change. A model's availability for download does not establish redistribution rights.

## Fonts and dependencies

Cinzel and Crimson Pro are distributed through the `@fontsource-variable` packages under the SIL Open Font License. Their license files ship with those packages. JavaScript dependencies have their own license files in their installed packages; the lockfile pins the versions used by this project.
