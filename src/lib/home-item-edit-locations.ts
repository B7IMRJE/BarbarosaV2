export type HomeItemEditAreaLocation = {
    name?: string | null;
    parent_area?: string | null;
    system?: string | null;
};

export type HomeItemEditLocationChoice = {
    value: string;
    label: string;
    location: string;
    parentArea: string;
    system: string;
};

export const HOME_ITEM_CUSTOM_LOCATION_VALUE = 'homeos-location:custom';

export function buildHomeItemEditLocationChoices(
    defaultLocations: readonly string[],
    areaLocations: readonly HomeItemEditAreaLocation[]
): HomeItemEditLocationChoice[] {
    const areaCandidates = areaLocations.map((area) => ({
            location: cleanLocationText(area.name),
            parentArea: cleanLocationText(area.parent_area),
            system: cleanLocationText(area.system),
        })).filter((candidate) => candidate.location);
    const candidates = [
        ...areaCandidates,
        ...defaultLocations
            .filter((location) => normalizeLocationText(location) !== 'custom')
            .map((location) => ({ location: cleanLocationText(location), parentArea: '', system: '' }))
            .filter((preset) => !areaCandidates.some((area) => sameLocationPlacement(area, preset))),
    ];
    const seen = new Set<string>();
    const uniqueCandidates = candidates.filter((candidate) => {
        const value = homeItemEditLocationValue(candidate.location, candidate.parentArea, candidate.system);

        if (seen.has(value)) return false;
        seen.add(value);
        return true;
    });
    const locationCounts = new Map<string, number>();
    const placementCounts = new Map<string, number>();

    uniqueCandidates.forEach((candidate) => {
        const location = normalizeLocationText(candidate.location);
        const placement = locationPlacementIdentity(candidate.location, candidate.parentArea);
        locationCounts.set(location, (locationCounts.get(location) || 0) + 1);
        placementCounts.set(placement, (placementCounts.get(placement) || 0) + 1);
    });

    return [
        ...uniqueCandidates.map((candidate) => {
            const placementLabel = candidate.parentArea
                ? `${candidate.location} — inside ${candidate.parentArea}`
                : (locationCounts.get(normalizeLocationText(candidate.location)) || 0) > 1
                    ? `${candidate.location} — top level`
                    : candidate.location;
            const disambiguateSystem = (placementCounts.get(
                locationPlacementIdentity(candidate.location, candidate.parentArea)
            ) || 0) > 1;

            return {
                value: homeItemEditLocationValue(candidate.location, candidate.parentArea, candidate.system),
                label: disambiguateSystem && candidate.system
                    ? `${placementLabel} · ${candidate.system}`
                    : placementLabel,
                location: candidate.location,
                parentArea: candidate.parentArea,
                system: candidate.system,
            };
        }),
        {
            value: HOME_ITEM_CUSTOM_LOCATION_VALUE,
            label: 'Custom',
            location: '',
            parentArea: '',
            system: '',
        },
    ];
}

export function getHomeItemEditLocationChoiceValue(
    location: string,
    parentArea: string,
    system: string,
    choices: readonly HomeItemEditLocationChoice[]
) {
    if (!cleanLocationText(location)) {
        return choices.find((choice) => choice.value !== HOME_ITEM_CUSTOM_LOCATION_VALUE)?.value
            || HOME_ITEM_CUSTOM_LOCATION_VALUE;
    }

    const value = homeItemEditLocationValue(location, parentArea, system);
    if (choices.some((choice) => choice.value === value)) return value;

    const placementMatches = choices.filter((choice) =>
        sameLocationPlacement(choice, { location, parentArea })
    );
    return placementMatches.length === 1
        ? placementMatches[0]?.value || HOME_ITEM_CUSTOM_LOCATION_VALUE
        : HOME_ITEM_CUSTOM_LOCATION_VALUE;
}

export function resolveHomeItemEditLocationChoice(
    value: string,
    choices: readonly HomeItemEditLocationChoice[]
) {
    if (!value || value === HOME_ITEM_CUSTOM_LOCATION_VALUE) return null;
    return choices.find((choice) => choice.value === value) || null;
}

function homeItemEditLocationValue(location: string, parentArea: string, system: string) {
    return `homeos-location:${encodeURIComponent(normalizeLocationText(location))}:${encodeURIComponent(normalizeLocationText(parentArea))}:${encodeURIComponent(normalizeLocationText(system))}`;
}

function locationPlacementIdentity(location: string, parentArea: string) {
    return `${normalizeLocationText(location)}\u0000${normalizeLocationText(parentArea)}`;
}

function sameLocationPlacement(
    first: { location: string; parentArea: string },
    second: { location: string; parentArea: string }
) {
    return locationPlacementIdentity(first.location, first.parentArea)
        === locationPlacementIdentity(second.location, second.parentArea);
}

function cleanLocationText(value?: string | null) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeLocationText(value?: string | null) {
    return cleanLocationText(value).toLowerCase();
}
