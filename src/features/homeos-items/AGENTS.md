# HomeOS Items Feature

This area owns a homeowner's individual home item: its details, photos, files,
maintenance, and the create/edit flow.

Start here:

- `ItemDetailScreen.tsx` for an existing item.
- `CreateItemScreen.tsx` and `EditItemScreen.tsx` for item setup.
- `../../lib/activeProperty.ts`, `../../lib/homeSystems.ts`, and
  `../../lib/itemPhotoGallery.ts` for the shared item boundary.

Boundaries:

- Keep active-property ownership checks in this feature.
- Home dashboard and system overview changes belong in `src/app/index.tsx` or
  `src/app/system` until they receive their own feature folder.
- Provider staging belongs in its shared helper; do not duplicate it here.
- Estimate and job creation may link out from an item, but pricing and job
  workflow rules remain in their respective features.

Before publishing, run the project's TypeScript check, lint, web build, and
`git diff --check`.
