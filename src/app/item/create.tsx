import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { getSystemLabel, homeSystemOptions } from '../../lib/homeSystems';
import { getSystemDefaults } from '../../lib/systemDefaults';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

const categories = ['Area', 'Fixture', 'Equipment', 'Component'];
const installStates = ['Unknown', 'Installed', 'Missing', 'Not Applicable'];
const statuses = ['Missing Information', 'Not Inspected', 'Good', 'Needs Attention', 'Emergency'];

function makeSlug(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

export default function CreateItemScreen() {
    const { theme } = useTheme();
    const params = useLocalSearchParams<{
        system?: string;
        area?: string;
        category?: string;
        name?: string;
    }>();
    const initialSystem = typeof params.system === 'string' ? params.system : 'Plumbing';
    const initialArea = typeof params.area === 'string' ? params.area : '';
    const hasAreaContext = !!initialSystem && !!initialArea;
    const initialCategory = typeof params.category === 'string' && categories.includes(params.category)
        ? params.category
        : 'Equipment';
    const initialName = typeof params.name === 'string' ? params.name : '';

    const [name, setName] = useState(initialName);
    const [system, setSystem] = useState(initialSystem);
    const [category, setCategory] = useState(initialCategory);

    const [locationChoice, setLocationChoice] = useState(initialArea || 'Garage');
    const [customLocation, setCustomLocation] = useState('');

    const [installState, setInstallState] = useState('Unknown');
    const [status, setStatus] = useState('Missing Information');
    const [about, setAbout] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const systemDefaults = useMemo(() => getSystemDefaults(system), [system]);
    const areaOptions = useMemo(
        () => uniqueOptions([...systemDefaults.areas, initialArea].filter(Boolean), 'Custom'),
        [systemDefaults.areas, initialArea]
    );
    const itemSuggestions = category === 'Fixture'
        ? systemDefaults.fixtures
        : category === 'Equipment' || category === 'Component'
            ? systemDefaults.equipment
            : systemDefaults.areas;

    function chooseSystem(nextSystem: string) {
        const nextDefaults = getSystemDefaults(nextSystem);
        const nextArea = nextDefaults.areas[0] || 'Custom';

        setSystem(nextSystem);
        setLocationChoice(nextArea);
        setCustomLocation('');
    }

    function finalLocation() {
        if (locationChoice === 'Custom') return customLocation.trim();
        return locationChoice;
    }

    async function saveItem() {
        if (!name.trim()) {
            setMessage('Enter item name.');
            return;
        }

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setMessage('You must be logged in to create an item.');
            router.replace('/auth/login' as any);
            return;
        }

        if (locationChoice === 'Custom' && !customLocation.trim()) {
            setMessage('Enter custom location or choose an existing one.');
            return;
        }

        const slug = makeSlug(name);

        setSaving(true);
        setMessage('Saving item...');

        const { error } = await supabase.from('home_items').insert({
            user_id: user.id,
            item_slug: slug,
            name: name.trim(),
            system,
            category,
            parent_area: '',
            install_state: installState,
            status,
            location: finalLocation(),
            about: about.trim(),
            brand: 'Unknown',
            model: 'Unknown',
            serial: 'Unknown',
            archived: false,
        });

        setSaving(false);

        if (error) {
            setMessage(`Save failed: ${error.message}`);
            return;
        }

        if (hasAreaContext) {
            router.replace({
                pathname: '/system/[system]/area/[area]',
                params: {
                    system: initialSystem,
                    area: initialArea,
                },
            } as any);
            return;
        }

        router.replace(`/item/${slug}` as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={[titleStyle, { color: theme.colors.text }]}>Create Item</Text>

                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Add real items only. Do not guess. Use Unknown until verified.
                </Text>

                {hasAreaContext && (
                    <ThemedCard style={{ marginBottom: 16 }}>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900', marginBottom: 6 }}>
                            Adding item to:
                        </Text>
                        <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>
                            {initialArea}
                        </Text>
                        <Text style={{ color: theme.colors.mutedText, marginTop: 8, fontWeight: '900' }}>
                            System: {getSystemLabel(initialSystem)}
                        </Text>
                    </ThemedCard>
                )}

                <ThemedInput
                    placeholder="Item Name"
                    value={name}
                    onChangeText={setName}
                />

                <ThemedInput
                    placeholder="About"
                    value={about}
                    onChangeText={setAbout}
                    minHeight={100}
                    multiline
                />

                {!hasAreaContext && (
                    <>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Location</Text>
                        <OptionRow options={areaOptions} value={locationChoice} onChange={setLocationChoice} />

                        {locationChoice === 'Custom' && (
                            <ThemedInput
                                placeholder="Custom Location"
                                value={customLocation}
                                onChangeText={setCustomLocation}
                            />
                        )}
                    </>
                )}

                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>System</Text>
                <SystemOptionRow value={system} onChange={chooseSystem} />

                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Category</Text>
                <OptionRow options={categories} value={category} onChange={setCategory} />

                {itemSuggestions.length > 0 && (
                    <>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Suggested {category}</Text>
                        <OptionRow options={itemSuggestions} value={name} onChange={setName} />
                    </>
                )}

                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Condition</Text>
                <OptionRow options={installStates} value={installState} onChange={setInstallState} />

                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Status</Text>
                <OptionRow options={statuses} value={status} onChange={setStatus} />

                <ThemedButton
                    title={saving ? 'Saving...' : 'Save Item'}
                    onPress={saveItem}
                    disabled={saving}
                    style={{ marginTop: 20, marginBottom: 12 }}
                />

                {!!message && (
                    <ThemedCard style={{ marginTop: 8 }}>
                        <Text style={[messageTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

function uniqueOptions(options: string[], finalOption: string) {
    const unique = options.filter((option, index, self) => option && self.indexOf(option) === index);

    return unique.includes(finalOption) ? unique : [...unique, finalOption];
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
            placeholder={placeholder}
            placeholderTextColor={theme.colors.mutedText}
            value={value}
            onChangeText={onChangeText}
            multiline={multiline}
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

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    marginTop: 8,
    marginBottom: 24,
    fontSize: 16,
    lineHeight: 22,
};

const sectionTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginTop: 14,
    marginBottom: 10,
};

const optionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 12,
};

const messageTextStyle = {
    fontSize: 14,
    lineHeight: 20,
};
