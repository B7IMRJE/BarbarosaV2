# HomeOS + TechOS Glass Interface Design Contract

This contract is the required visual architecture for new and converted HomeOS and TechOS screens.
It prevents one-off page styling and keeps the product visually unified.

## Permanent Product Rules

1. The interface material is always colored glass.
2. A palette may change the glass colors; it may not change the component structure.
3. HomeOS and TechOS use the same component family and page anatomy.
4. Pink, purple, pastel beige, and bright red are not default interface colors.
5. Red is reserved for a confirmed destructive action or a real emergency.
6. Archive controls are compact, quiet, and visually secondary.
7. Glass depth is adjustable from 1–100 without changing spacing or hierarchy.
8. Company palette and depth controls are visible only to the platform administrator.
9. A page may not introduce a new card, button, dock, badge, or empty-state recipe when an approved shared component exists.

## Required Page Anatomy

Every operational page uses this order:

1. `GlassPageShell`
2. `GlassHeader`
3. Page identity: title, subtitle, and optional status
4. `GlassActionGrid` for primary tasks
5. One or more named content sections
6. `GlassEmptyState`, `GlassLoadingState`, or glass content tiles
7. `GlassNavigationDock`

The page background, maximum width, responsive padding, and bottom safe-area spacing belong to
`GlassPageShell`; individual pages do not recreate them.

## Glass Navigation Dock

The bottom navigation is one overall glass dock containing equal-width navigation controls.

- The dock provides the background, border, reflection, depth, and safe-area spacing.
- Each destination is a smaller button inside the dock.
- The active destination has a brighter glass fill and icon.
- Labels remain short and cannot overlap.
- Mobile uses the same structure with reduced type and spacing.
- HomeOS and TechOS may have different destinations, but not different dock construction.

## Approved Glass Tones

- Emerald: creation, active work, healthy state
- Teal: customer, home, and service context
- Blue: information, documents, scheduling, and general actions
- Steel: settings, management, secondary actions, and neutral state
- Amber: late, waiting, or attention-needed state
- Red: emergency or confirmed destructive action only

Tones describe meaning. Pages must not alternate colors randomly when a semantic state is known.

## Card Rules

- Use the shared glass highlight, border, lower edge, shadow, and pressed movement.
- Titles use high-contrast text and consistent weight.
- Descriptions are shorter and lower contrast.
- Icons use the shared glass icon housing.
- Primary card actions are clear but compact.
- Archive controls use a small outlined steel-glass treatment.
- Cards in one grid have consistent minimum height.
- Interactive cards visibly depress when pressed.

## Color Ownership

The glass construction is permanent. Color values are separate data.

- The platform default is Orbital Green + Blue.
- Platform Admin may choose a preset or custom company colors.
- Company settings can supply primary, secondary, accent, and glass depth.
- HomeOS personal appearance may later select an approved palette without changing the glass components.
- Custom colors must pass contrast and valid-color checks before use.

## Responsive Rules

- Phone: one or two columns based on content width.
- Tablet: two or three columns.
- Desktop: up to four columns for item tiles.
- Navigation labels must never overlap.
- Touch targets remain accessible even when visual controls are compact.
- Text scaling must not clip titles or actions.

## Completion Checklist For Every Page

- Uses `GlassPageShell`
- Uses approved shared glass components
- Uses semantic glass tones
- Uses the shared navigation dock
- Has loading, empty, error, and disabled states
- Has no hard-coded pastel panel colors
- Has no loud archive button
- Passes phone and desktop inspection
- Passes TypeScript and production export
