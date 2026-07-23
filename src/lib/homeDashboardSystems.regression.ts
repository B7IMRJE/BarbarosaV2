import { buildHomeDashboardSystemTiles } from './homeDashboardSystems';

export function runHomeDashboardSystemsRegressions() {
  canonicalSystemsDoNotBecomeDuplicateRootTiles();
}

function canonicalSystemsDoNotBecomeDuplicateRootTiles() {
  const tiles = buildHomeDashboardSystemTiles([
    {
      name: 'Plumbing',
      system: 'plumbing',
      category: 'Area',
      location: 'Plumbing',
      parent_area: '',
    },
    {
      name: 'HVAC',
      system: 'hvac',
      category: 'Area',
      location: 'HVAC',
      parent_area: '',
    },
  ]);

  assert(
    tiles.filter((tile) => tile.key === 'Plumbing').length === 1,
    'Plumbing records must resolve to the single Water Service dashboard card.',
  );
  assert(
    tiles.filter((tile) => tile.key === 'HVAC').length === 1,
    'HVAC records must resolve to the single AC Service dashboard card.',
  );
  assert(!tiles.some((tile) => tile.label === 'Plumbing'), 'A duplicate Plumbing card must not be added.');
  assert(!tiles.some((tile) => tile.label === 'HVAC'), 'A duplicate HVAC card must not be added.');
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Home dashboard systems regression failed: ${message}`);
  }
}

runHomeDashboardSystemsRegressions();
