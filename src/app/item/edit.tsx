import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TextInput,
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
import { homeSystemOptions } from '../../lib/homeSystems';
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

function getPickerValue(value: string, options: string[]) {
    if (!value) return options[0];
    if (options.includes(value)) return value;
    return 'Custom';
}

function normalizeLocationText(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sameLocationText(a?: string | null, b?: string | null) {
    return normalizeLocationText(a) === normalizeLocationText(b);
}

function uniqueOptions(options: string[]) {
    return options.filter((option, index, self) => option && self.indexOf(option) === index);
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
    const { slug } = useLocalSearchParams();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [name, setName] = useState('');
    const [about, setAbout] = useState('');
    const [system, setSystem] = useState('Plumbing');

    const [locationChoice, setLocationChoice] = useState('Garage');
    const [customLocation, setCustomLocation] = useState('');
    const [areaLocations, setAreaLocations] = useState<AreaLocation[]>([]);
    const [originalLocation, setOriginalLocation] = useState('');
    const [originalParentArea, setOriginalParentArea] = useState('');

    const [brand, setBrand] = useState('');
    const [model, setModel] = useState('');
    const [serial, setSerial] = useState('');
    const [installState, setInstallState] = useState('Unknown');
    const [status, setStatus] = useState('Missing Information');

    useEffect(() => {
        loadItem();
    }, [slug]);

    function finalLocation() {
        if (locationChoice === 'Custom') {
            return customLocation.trim();
        }

        return locationChoice;
    }

    function finalParentArea(nextLocation: string) {
        if (sameLocationText(nextLocation, originalLocation)) {
            return originalParentArea;
        }

        const matchingArea = areaLocations.find(
            (area) => sameLocationText(area.name, nextLocation) && sameLocationText(area.system, system)
        ) || areaLocations.find(
            (area) => sameLocationText(area.name, nextLocation)
        );

        return matchingArea?.parent_area?.trim() || '';
    }

    const locationOptions = uniqueOptions([
        ...locations.filter((location) => location !== 'Custom'),
        ...areaLocations.map((area) => area.name || '').filter(Boolean),
        originalLocation,
        'Custom',
    ]);

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
            .maybeSingle();

        if (error || !data) {
            setLoading(false);
            return;
        }

        const savedLocation = data.location || data.parent_area || '';
        const savedParentArea = data.parent_area || '';

        const nextLocationChoice = getPickerValue(savedLocation, locations);

        setName(data.name || '');
        setAbout(data.about || '');
        setSystem(data.system || 'Plumbing');

        setLocationChoice(nextLocationChoice);
        setCustomLocation(nextLocationChoice === 'Custom' ? savedLocation : '');
        setOriginalLocation(savedLocation);
        setOriginalParentArea(savedParentArea);

        setBrand(data.brand || '');
        setModel(data.model || '');
        setSerial(data.serial || '');
        setInstallState(data.install_state || 'Unknown');
        setStatus(data.status || 'Missing Information');

        const { data: areaRows } = await supabase
            .from('home_items')
            .select('name, system, parent_area')
            .eq('property_id', activeProperty.propertyId)
            .eq('category', 'Area')
            .or('archived.eq.false,archived.is.null');

        setAreaLocations((areaRows || []) as AreaLocation[]);

        setLoading(false);
    }

    async function saveItem() {
        if (!name.trim()) {
            alert('Name is required.');
            return;
        }

        if (locationChoice === 'Custom' && !customLocation.trim()) {
            alert('Enter a custom location or select an existing one.');
            return;
        }

        const nextLocation = finalLocation();

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

        const { error } = await supabase
            .from('home_items')
            .update({
                name: name.trim(),
                about: about.trim(),
                location: nextLocation,
                parent_area: finalParentArea(nextLocation),
                brand: brand.trim() || 'Unknown',
                model: model.trim() || 'Unknown',
                serial: serial.trim() || 'Unknown',
                system,
                install_state: installState,
                status,
            })
            .eq('item_slug', String(slug))
            .eq('property_id', activeProperty.propertyId);

        setSaving(false);

        if (error) {
            alert(error.message);
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

                <Text style={[scaleStyle(titleStyle), { color: theme.colors.text }]}>Edit Item</Text>

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
                    <OptionRow
                        options={locationOptions}
                        value={locationChoice}
                        onChange={setLocationChoice}
                    />

                    {locationChoice === 'Custom' && (
                        <ThemedInput
                            placeholder="Custom Location"
                            value={customLocation}
                            onChangeText={setCustomLocation}
                        />
                    )}

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
                            <TextInput
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
                            <TextInput
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
                            <TextInput
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
                    title={saving ? 'Saving...' : 'Save Changes'}
                    onPress={saveItem}
                    disabled={saving}
                    style={{ marginTop: scaleIcon(20), marginBottom: 20 }}
                />
            </View>
        </ScrollView>
    );
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
    const { theme } = useTheme();

    return (
        <TextInput
            style={{
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radii.button,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                color: theme.colors.text,
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
    options: string[];
    value: string;
    onChange: (value: string) => void;
}) {
    const { theme } = useTheme();

    return (
        <View style={optionRowStyle}>
            {options.map((option) => {
                const selected = value === option;

                return (
                    <TouchableOpacity
                        key={option}
                        onPress={() => onChange(option)}
                        style={{
                            backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                            borderRadius: theme.radii.pill,
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderWidth: 1,
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                        }}
                    >
                        <Text
                            style={{
                                color: selected ? theme.colors.primaryText : theme.colors.mutedText,
                                fontWeight: '900',
                            }}
                        >
                            {option}
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
    const { theme } = useTheme();

    return (
        <View style={optionRowStyle}>
            {homeSystemOptions.map((option) => {
                const selected = value === option.key;

                return (
                    <TouchableOpacity
                        key={option.key}
                        onPress={() => onChange(option.key)}
                        style={{
                            backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                            borderRadius: theme.radii.pill,
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderWidth: 1,
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                        }}
                    >
                        <Text
                            style={{
                                color: selected ? theme.colors.primaryText : theme.colors.mutedText,
                                fontWeight: '900',
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

const optionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 12,
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
