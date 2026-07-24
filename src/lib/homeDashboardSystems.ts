import {
  getSystemDefinition,
  homeSystems,
  isCustomServiceRoot,
  type HomeSystemRecord,
} from './homeSystems';

export type DashboardSystemTile = {
  key: string;
  label: string;
  icon: string;
  route: 'documents' | 'plumbing' | 'system';
};

export function buildHomeDashboardSystemTiles(
  items: HomeSystemRecord[],
): DashboardSystemTile[] {
  const customSystemsByKey = new Map<string, string>();

  items.forEach((item) => {
    if (!isCustomServiceRoot(item)) return;

    const identityValues = [item.name, item.location, item.system];

    if (identityValues.some((value) => Boolean(getSystemDefinition(value)))) {
      return;
    }

    const systemName = firstText(item.name, item.location, item.system);
    const normalizedSystemName = normalizeText(systemName);

    if (!systemName) return;

    if (!customSystemsByKey.has(normalizedSystemName)) {
      customSystemsByKey.set(normalizedSystemName, systemName);
    }
  });

  const fixedTiles = homeSystems.map<DashboardSystemTile>((system) => ({
    key: system.key,
    label: system.label,
    icon: system.icon,
    route:
      system.key === 'Documents'
        ? 'documents'
        : system.key === 'Plumbing'
          ? 'plumbing'
          : 'system',
  }));

  const customTiles = Array.from(customSystemsByKey.values())
    .sort((a, b) => a.localeCompare(b))
    .map<DashboardSystemTile>((systemName) => ({
      key: systemName,
      label: systemName,
      icon: getCustomSystemIcon(systemName),
      route: 'system',
    }));

  return [...fixedTiles, ...customTiles];
}

function getCustomSystemIcon(systemName: string) {
  const normalizedName = normalizeText(systemName);

  if (normalizedName.includes('storage') || normalizedName.includes('inventory')) return '📦';
  if (normalizedName.includes('roof')) return '🏠';
  if (normalizedName.includes('paint')) return '🎨';
  if (normalizedName.includes('siding')) return '🏡';
  if (normalizedName.includes('landscape') || normalizedName.includes('yard')) return '🌿';

  return '🏠';
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = String(value || '').trim();

    if (text) return text;
  }

  return '';
}

function normalizeText(value?: string | null) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
