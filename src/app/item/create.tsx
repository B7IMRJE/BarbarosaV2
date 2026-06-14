import { router } from 'expo-router';
import { useState } from 'react';
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
import { homeSystemOptions } from '../../lib/homeSystems';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

const categories = ['Area', 'Fixture', 'Equipment', 'Component'];
const installStates = ['Unknown', 'Installed', 'Missing', 'Not Applicable'];
const statuses = ['Missing Information', 'Not Inspected', 'Good', 'Needs Attention', 'Emergency'];

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

const parentAreas = [
    'Kitchen Sink Area',
    'Water Heater Area',
    'Main Shutoff Area',
    'Laundry Area',
    'Garage',
    'Exterior',
    'None',
    'Custom',
];

function makeSlug(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

export default function CreateItemScreen() {
    const { theme } = useTheme();
    const [name, setName] = useState('');
    const [system, setSystem] = useState('Plumbing');
    const [category, setCategory] = useState('Equipment');

    const [locationChoice, setLocationChoice] = useState('Garage');
    const [customLocation, setCustomLocation] = useState('');

    const [parentAreaChoice, setParentAreaChoice] = useState('Main Shutoff Area');
    const [customParentArea, setCustomParentArea] = useState('');

    const [installState, setInstallState] = useState('Unknown');
    const [status, setStatus] = useState('Missing Information');
    const [about, setAbout] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    function finalLocation() {
        if (locationChoice === 'Custom') return customLocation.trim();
        return locationChoice;
    }

    function finalParentArea() {
        if (parentAreaChoice === 'Custom') return customParentArea.trim();
        if (parentAreaChoice === 'None') return '';
        return parentAreaChoice;
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

        if (parentAreaChoice === 'Custom' && !customParentArea.trim()) {
            setMessage('Enter custom parent area or choose an existing one.');
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
            parent_area: finalParentArea(),
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

                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Location</Text>
                <OptionRow options={locations} value={locationChoice} onChange={setLocationChoice} />

                {locationChoice === 'Custom' && (
                    <ThemedInput
                        placeholder="Custom Location"
                        value={customLocation}
                        onChangeText={setCustomLocation}
                    />
                )}

                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Parent Area</Text>
                <OptionRow options={parentAreas} value={parentAreaChoice} onChange={setParentAreaChoice} />

                {parentAreaChoice === 'Custom' && (
                    <ThemedInput
                        placeholder="Custom Parent Area"
                        value={customParentArea}
                        onChangeText={setCustomParentArea}
                    />
                )}

                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>System</Text>
                <SystemOptionRow value={system} onChange={setSystem} />

                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Category</Text>
                <OptionRow options={categories} value={category} onChange={setCategory} />

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
