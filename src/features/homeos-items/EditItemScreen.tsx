import DictationTextInput from '@/components/input/DictationTextInput';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import { buildAreaRow } from '../../lib/areaTemplates';
import {
    HOME_ITEM_CUSTOM_LOCATION_VALUE,
    buildHomeItemEditLocationChoices,
    getHomeItemEditLocationChoiceValue,
    resolveHomeItemEditLocationChoice,
    type HomeItemEditLocationChoice,
} from '../../lib/home-item-edit-locations';
import { homeSystemOptions } from '../../lib/homeSystems';
import {
    ACTIVATED_ITEM_INSTALL_STATE,
    ACTIVATED_ITEM_STATUS,
    isStarterHomeItemShell,
} from '../../lib/starterHomeSetup';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

const locations = [
    'Kitchen',
    'Master Bathroom',
    'Bathroom 2',
    'Laundry',
    'Garage',
    'Exterior',
    'Water Heater Area',
    'Main Shutoff Area',
    'Custom',
];

type AreaLocation = {
    name: string | null;
    system: string | null;
    parent_area: string | null;
};

const installStates = [
    'Unknown',
    'Installed',
    'Missing',
    'Not Applicable',
];

const statuses = [
    'Missing Information',
    'Not Inspected',
    'Good',
    'Needs Attention',
    'Emergency',
];

function normalizeLocationText(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sameLocationText(a?: string | null, b?: string | null) {
    return normalizeLocationText(a) === normalizeLocationText(b);
}

export default function EditItemScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();

    function scaleStyle<T extends Record<string, any>>(style: T): T {
        const fontKeys = new Set(['fontSize', 'lineHeight']);
        const iconKeys = new Set([
            'padding',
            'paddingTop',
            'paddingBottom',
            'paddingVertical',
            'paddingHorizontal',
            'marginTop',
            'marginBottom',
            'marginVertical',
            'marginHorizontal',
            'gap',
            'rowGap',
            'columnGap',
            'width',
            'height',
            'minWidth',
            'minHeight',
            'borderRadius',
        ]);

        const scaledStyle: Record<string, any> = { ...style };

        Object.entries(style).forEach(([key, value]) => {
            if (typeof value !== 'number') return;

            if (fontKeys.has(key)) {
                scaledStyle[key] = scaleFont(value);
            }

            if (iconKeys.has(key)) {
                scaledStyle[key] = scaleIcon(value);
            }
        });

        return scaledStyle as T;
    }
    const routeParams = useLocalSearchParams<{
        slug?: string | string[];
        activate?: string | string[];
        returnTo?: string | string[];
    }>();
    const slug = firstParam(routeParams.slug);
    const activationMode = firstParam(routeParams.activate) === '1';
    const requestedReturnTo = firstParam(routeParams.returnTo);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [name, setName] = useState('');
    const [about, setAbout] = useState('');
    const [system, setSystem] = useState('Plumbing');

    const [locationChoice, setLocationChoice] = useState('');
    const [customLocation, setCustomLocation] = useState('');
    const [areaLocations, setAreaLocations] = useState<AreaLocation[]>([]);
    const [originalLocation, setOriginalLocation] = useState('');
    const [originalParentArea, setOriginalParentArea] = useState('');
    const [homeItemId, setHomeItemId] = useState('');
    const [isLinkedComponent, setIsLinkedComponent] = useState(false);
    const [placementLabel, setPlacementLabel] = useState('');

    const [brand, setBrand] = useState('');
    const [model, setModel] = useState('');
    const [serial, setSerial] = useState('');
    const [installState, setInstallState] = useState('Unknown');
    const [status, setStatus] = useState('Missing Information');
    const loadItemEvent = useEffectEvent(loadItem);

    useEffect(() => {
        void loadItemEvent();
    }, [activationMode, slug]);

    const locationOptions = useMemo(
        () => buildHomeItemEditLocationChoices(locations, areaLocations),
        [areaLocations]
    );

    function finalLocation() {
        if (locationChoice === HOME_ITEM_CUSTOM_LOCATION_VALUE) {
            return customLocation.trim();
        }

        return resolveHomeItemEditLocationChoice(locationChoice, locationOptions)?.location || originalLocation;
    }

    function finalParentArea(nextLocation: string) {
        if (sameLocationText(nextLocation, originalLocation)) {
            return originalParentArea;
        }

        const selectedArea = resolveHomeItemEditLocationChoice(locationChoice, locationOptions);
        if (selectedArea) return selectedArea.parentArea;

        const systemMatches = areaLocations.filter(
            (area) => sameLocationText(area.name, nextLocation) && sameLocationText(area.system, system)
        );
        const matchingAreas = systemMatches.length > 0 ? systemMatches : areaLocations.filter(
            (area) => sameLocationText(area.name, nextLocation)
        );
        const parentAreas = matchingAreas.filter((area, index, rows) =>
            rows.findIndex((candidate) => sameLocationText(candidate.parent_area, area.parent_area)) === index
        );

        return parentAreas.length === 1 ? parentAreas[0]?.parent_area?.trim() || '' : '';
    }

    async function loadItem() {
        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const { data, error } = await supabase
            .from('home_items')
            .select('*')
            .eq('item_slug', String(slug))
            .eq('property_id', activeProperty.propertyId)
            .order('archived', { ascending: true, nullsFirst: true })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !data) {
            setLoading(false);
            return;
        }

        const savedLocation = data.location || data.parent_area || '';
        const savedParentArea = data.parent_area || '';

        setName(data.name || '');
        setAbout(data.about || '');
        setSystem(data.system || 'Plumbing');

        setOriginalLocation(savedLocation);
        setOriginalParentArea(savedParentArea);
        setHomeItemId(String(data.id || ''));
        setIsLinkedComponent(Boolean(data.parent_home_item_id));
        setPlacementLabel(data.placement_label || '');

        setBrand(data.brand || '');
        setModel(data.model || '');
        setSerial(data.serial || '');
        setInstallState(data.install_state || 'Unknown');
        setStatus(data.status || 'Missing Information');

        if (activationMode && isStarterHomeItemShell(data)) {
            setInstallState(ACTIVATED_ITEM_INSTALL_STATE);
            setStatus(ACTIVATED_ITEM_STATUS);
        }

        const { data: areaRows } = await supabase
            .from('home_items')
            .select('name, system, parent_area')
            .eq('property_id', activeProperty.propertyId)
            .eq('category', 'Area')
            .or('archived.eq.false,archived.is.null');

        const nextAreaLocations = (areaRows || []) as AreaLocation[];
        const nextLocationOptions = buildHomeItemEditLocationChoices(locations, nextAreaLocations);
        const nextLocationChoice = getHomeItemEditLocationChoiceValue(
            savedLocation,
            savedParentArea,
            data.system || '',
            nextLocationOptions
        );

        setAreaLocations(nextAreaLocations);
        setLocationChoice(nextLocationChoice);
        setCustomLocation(nextLocationChoice === HOME_ITEM_CUSTOM_LOCATION_VALUE ? savedLocation : '');

        setLoading(false);
    }

    async function saveItem() {
        if (!name.trim()) {
            alert('Name is required.');
            return;
        }

        if (!isLinkedComponent && locationChoice === HOME_ITEM_CUSTOM_LOCATION_VALUE && !customLocation.trim()) {
            alert('Enter a custom location or select an existing one.');
            return;
        }

        const nextLocation = isLinkedComponent ? originalLocation : finalLocation();

        setSaving(true);

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setSaving(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            alert(error instanceof Error ? error.message : 'Could not confirm your active home.');
            return;
        }

        const updatePayload = {
            name: name.trim(),
            about: about.trim(),
            placement_label: placementLabel.trim() || null,
            brand: brand.trim() || 'Unknown',
            model: model.trim() || 'Unknown',
            serial: serial.trim() || 'Unknown',
            system,
            install_state: installState,
            status,
            ...(!isLinkedComponent
                ? {
                    location: nextLocation,
                    parent_area: finalParentArea(nextLocation),
                }
                : {}),
        };

        if (!homeItemId) {
            setSaving(false);
            alert('This HomeOS item could not be identified. Reopen it and try again.');
            return;
        }

        const { error } = await supabase
            .from('home_items')
            .update(updatePayload)
            .eq('id', homeItemId)
            .eq('property_id', activeProperty.propertyId);

        setSaving(false);

        if (error) {
            alert(error.message);
            return;
        }

        if (activationMode && !isLinkedComponent) {
            await activateParentArea({
                userId: activeProperty.userId,
                propertyId: activeProperty.propertyId,
                areaName: nextLocation,
                system,
                parentArea: finalParentArea(nextLocation),
            });
            router.replace(`/item/${String(slug)}` as any);
            return;
        }

        if (requestedReturnTo) {
            const returnTo = !isLinkedComponent && requestedReturnTo.startsWith('/home/area/')
                ? `/home/area/${encodeURIComponent(nextLocation)}${finalParentArea(nextLocation) ? `?parentArea=${encodeURIComponent(finalParentArea(nextLocation))}` : ''}`
                : requestedReturnTo;

            router.dismissTo(returnTo as any);
            return;
        }

        router.back();
    }

    if (loading) {
        return (
            <View style={[scaleStyle(centerStyle), { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.text} />
            </View>
        );
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <HomeHeader />

                <Text style={[scaleStyle(titleStyle), { color: theme.colors.text }]}>
                    {activationMode ? 'Activate Item' : 'Edit Item'}
                </Text>

                {activationMode && (
                    <Text style={{ color: theme.colors.mutedText, marginBottom: scaleIcon(14), fontSize: scaleFont(15), fontWeight: '800' }}>
                        Confirm the item condition and add any manufacturer details you know. You can update the rest later.
                    </Text>
                )}

                <ThemedCard style={scaleStyle(formCardStyle)}>
                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Item Details</Text>

                    <ThemedInput
                        placeholder="Name"
                        value={name}
                        onChangeText={setName}
                    />

                    <ThemedInput
                        placeholder="About"
                        value={about}
                        onChangeText={setAbout}
                        minHeight={scaleIcon(100)}
                        multiline
                    />
                </ThemedCard>

                <ThemedCard style={scaleStyle(formCardStyle)}>
                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Location</Text>
                    {isLinkedComponent ? (
                        <Text style={{ color: theme.colors.mutedText, marginBottom: scaleIcon(12), fontSize: scaleFont(14) }}>
                            This component stays with its equipment or fixture. Its location changes when the parent item moves.
                        </Text>
                    ) : (
                        <>
                            <OptionRow
                                options={locationOptions}
                                value={locationChoice}
                                onChange={setLocationChoice}
                            />

                            {locationChoice === HOME_ITEM_CUSTOM_LOCATION_VALUE && (
                                <ThemedInput
                                    placeholder="Custom Location"
                                    value={customLocation}
                                    onChangeText={setCustomLocation}
                                />
                            )}
                        </>
                    )}

                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Placement Label</Text>
                    <Text style={{ color: theme.colors.mutedText, marginBottom: scaleIcon(10), fontSize: scaleFont(14) }}>
                        Optional. Use a landmark such as Left wall, Near shower, or Water-closet alcove.
                    </Text>
                    <ThemedInput
                        placeholder="Placement label, for example Left wall"
                        value={placementLabel}
                        onChangeText={setPlacementLabel}
                    />

                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>System</Text>
                    <SystemOptionRow value={system} onChange={setSystem} />
                </ThemedCard>

                <ThemedCard style={scaleStyle(formCardStyle)}>
                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Information</Text>

                    <View style={scaleStyle(rowStyle)}>
                        <View
                            style={[
                                smallFieldStyle,
                                {
                                    backgroundColor: theme.colors.surfaceAlt,
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.button,
                                },
                            ]}
                        >
                            <Text style={[scaleStyle(smallLabelStyle), { color: theme.colors.mutedText }]}>Brand</Text>
                            <DictationTextInput
                                style={[scaleStyle(smallInputStyle), { color: theme.colors.text }]}
                                placeholder="Brand"
                                placeholderTextColor={theme.colors.mutedText}
                                value={brand}
                                onChangeText={setBrand}
                            />
                        </View>

                        <View
                            style={[
                                smallFieldStyle,
                                {
                                    backgroundColor: theme.colors.surfaceAlt,
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.button,
                                },
                            ]}
                        >
                            <Text style={[scaleStyle(smallLabelStyle), { color: theme.colors.mutedText }]}>Model</Text>
                            <DictationTextInput
                                style={[scaleStyle(smallInputStyle), { color: theme.colors.text }]}
                                placeholder="Model"
                                placeholderTextColor={theme.colors.mutedText}
                                value={model}
                                onChangeText={setModel}
                            />
                        </View>

                        <View
                            style={[
                                smallFieldStyle,
                                {
                                    backgroundColor: theme.colors.surfaceAlt,
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.button,
                                },
                            ]}
                        >
                            <Text style={[scaleStyle(smallLabelStyle), { color: theme.colors.mutedText }]}>Serial</Text>
                            <DictationTextInput
                                style={[scaleStyle(smallInputStyle), { color: theme.colors.text }]}
                                placeholder="Serial"
                                placeholderTextColor={theme.colors.mutedText}
                                value={serial}
                                onChangeText={setSerial}
                            />
                        </View>
                    </View>

                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Condition</Text>

                    <OptionRow
                        options={installStates}
                        value={installState}
                        onChange={setInstallState}
                    />

                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Status</Text>

                    <OptionRow
                        options={statuses}
                        value={status}
                        onChange={setStatus}
                    />
                </ThemedCard>

                <ThemedButton
                    title={saving ? 'Saving...' : activationMode ? 'Save & Activate' : 'Save Changes'}
                    onPress={saveItem}
                    disabled={saving}
                    style={{ marginTop: scaleIcon(20), marginBottom: 20 }}
                />
            </View>
        </ScrollView>
    );
}

async function activateParentArea({
    userId,
    propertyId,
    areaName,
    system,
    parentArea,
}: {
    userId: string;
    propertyId: string;
    areaName: string;
    system: string;
    parentArea: string;
}) {
    if (!areaName || areaName === 'Whole Home') return;

    const { data } = await supabase
        .from('home_items')
        .select('id')
        .eq('property_id', propertyId)
        .eq('category', 'Area')
        .eq('system', system)
        .eq('location', areaName)
        .eq('parent_area', parentArea)
        .limit(1);

    if ((data || []).length > 0) return;

    await supabase
        .from('home_items')
        .insert(buildAreaRow(userId, propertyId, areaName, system, parentArea));
}

function firstParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function ThemedInput({
    value,
    onChangeText,
    placeholder,
    multiline,
    minHeight,
}: {
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    multiline?: boolean;
    minHeight?: number;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <DictationTextInput
            style={{
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radii.button,
                padding: scaleIcon(16),
                marginBottom: scaleIcon(12),
                borderWidth: 1,
                borderColor: theme.colors.border,
                color: theme.colors.text,
                fontSize: scaleFont(16),
                minHeight,
                textAlignVertical: multiline ? 'top' : 'auto',
            }}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.mutedText}
            value={value}
            onChangeText={onChangeText}
            multiline={multiline}
        />
    );
}

function OptionRow({
    options,
    value,
    onChange,
}: {
    options: readonly (string | HomeItemEditLocationChoice)[];
    value: string;
    onChange: (value: string) => void;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), marginBottom: scaleIcon(12) }}>
            {options.map((option) => {
                const optionValue = typeof option === 'string' ? option : option.value;
                const optionLabel = typeof option === 'string' ? option : option.label;
                const selected = value === optionValue;

                return (
                    <TouchableOpacity
                        key={optionValue}
                        onPress={() => onChange(optionValue)}
                        style={{
                            backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                            borderRadius: theme.radii.pill,
                            paddingVertical: scaleIcon(10),
                            paddingHorizontal: scaleIcon(14),
                            borderWidth: 1,
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                        }}
                    >
                        <Text
                            style={{
                                color: selected ? theme.colors.primaryText : theme.colors.mutedText,
                                fontWeight: '900',
                                fontSize: scaleFont(14),
                            }}
                        >
                            {optionLabel}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

function SystemOptionRow({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), marginBottom: scaleIcon(12) }}>
            {homeSystemOptions.map((option) => {
                const selected = value === option.key;

                return (
                    <TouchableOpacity
                        key={option.key}
                        onPress={() => onChange(option.key)}
                        style={{
                            backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                            borderRadius: theme.radii.pill,
                            paddingVertical: scaleIcon(10),
                            paddingHorizontal: scaleIcon(14),
                            borderWidth: 1,
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                        }}
                    >
                        <Text
                            style={{
                                color: selected ? theme.colors.primaryText : theme.colors.mutedText,
                                fontWeight: '900',
                                fontSize: scaleFont(14),
                            }}
                        >
                            {option.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const centerStyle = {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    marginBottom: 20,
};

const sectionTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginTop: 4,
    marginBottom: 10,
};

const formCardStyle = {
    marginBottom: 14,
};

const rowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
};

const smallFieldStyle = {
    flex: 1,
    minWidth: 220,
    borderWidth: 1,
    padding: 16,
};

const smallLabelStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const smallInputStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};
