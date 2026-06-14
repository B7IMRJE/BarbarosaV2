import HomeHeader from '../../components/HomeHeader';

import { router } from 'expo-router';
import { useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { homeSystemOptions } from '../../lib/homeSystems';
import { supabase } from '../../lib/supabase';

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
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20 }}
        >
            <Text onPress={() => router.back()} style={backStyle}>
                ← Back
            </Text>

            <Text style={titleStyle}>Create Item</Text>

            <Text style={subtitleStyle}>
                Add real items only. Do not guess. Use Unknown until verified.
            </Text>

            <TextInput
                placeholder="Item Name"
                value={name}
                onChangeText={setName}
                style={inputStyle}
            />

            <TextInput
                placeholder="About"
                value={about}
                onChangeText={setAbout}
                style={[inputStyle, { minHeight: 100 }]}
                multiline
            />

            <Text style={sectionTitleStyle}>Location</Text>
            <OptionRow options={locations} value={locationChoice} onChange={setLocationChoice} />

            {locationChoice === 'Custom' && (
                <TextInput
                    placeholder="Custom Location"
                    value={customLocation}
                    onChangeText={setCustomLocation}
                    style={inputStyle}
                />
            )}

            <Text style={sectionTitleStyle}>Parent Area</Text>
            <OptionRow options={parentAreas} value={parentAreaChoice} onChange={setParentAreaChoice} />

            {parentAreaChoice === 'Custom' && (
                <TextInput
                    placeholder="Custom Parent Area"
                    value={customParentArea}
                    onChangeText={setCustomParentArea}
                    style={inputStyle}
                />
            )}

            <Text style={sectionTitleStyle}>System</Text>
            <SystemOptionRow value={system} onChange={setSystem} />

            <Text style={sectionTitleStyle}>Category</Text>
            <OptionRow options={categories} value={category} onChange={setCategory} />

            <Text style={sectionTitleStyle}>Condition</Text>
            <OptionRow options={installStates} value={installState} onChange={setInstallState} />

            <Text style={sectionTitleStyle}>Status</Text>
            <OptionRow options={statuses} value={status} onChange={setStatus} />

            <TouchableOpacity
                onPress={saveItem}
                disabled={saving}
                style={buttonStyle}
            >
                <Text style={buttonTextStyle}>
                    {saving ? 'Saving...' : 'Save Item'}
                </Text>
            </TouchableOpacity>

            <HomeHeader />

            {!!message && (
                <View style={messageBoxStyle}>
                    <Text style={messageTextStyle}>{message}</Text>
                </View>
            )}
        </ScrollView>
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
    return (
        <View style={optionRowStyle}>
            {options.map((option) => (
                <TouchableOpacity
                    key={option}
                    onPress={() => onChange(option)}
                    style={[
                        optionButtonStyle,
                        value === option && optionButtonSelectedStyle,
                    ]}
                >
                    <Text
                        style={[
                            optionButtonTextStyle,
                            value === option && optionButtonSelectedTextStyle,
                        ]}
                    >
                        {option}
                    </Text>
                </TouchableOpacity>
            ))}
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
    return (
        <View style={optionRowStyle}>
            {homeSystemOptions.map((option) => (
                <TouchableOpacity
                    key={option.key}
                    onPress={() => onChange(option.key)}
                    style={[
                        optionButtonStyle,
                        value === option.key && optionButtonSelectedStyle,
                    ]}
                >
                    <Text
                        style={[
                            optionButtonTextStyle,
                            value === option.key && optionButtonSelectedTextStyle,
                        ]}
                    >
                        {option.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const backStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    color: '#071B33',
    marginTop: 20,
    marginBottom: 20,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    color: '#071B33',
};

const subtitleStyle = {
    color: '#637083',
    marginTop: 8,
    marginBottom: 24,
    fontSize: 16,
    lineHeight: 22,
};

const inputStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const sectionTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    color: '#071B33',
    marginTop: 14,
    marginBottom: 10,
};

const optionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 12,
};

const optionButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const optionButtonSelectedStyle = {
    backgroundColor: '#071B33',
    borderColor: '#071B33',
};

const optionButtonTextStyle = {
    color: '#637083',
    fontWeight: '900' as const,
};

const optionButtonSelectedTextStyle = {
    color: '#FFFFFF',
};

const buttonStyle = {
    backgroundColor: '#071B33',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center' as const,
    marginTop: 20,
    marginBottom: 12,
};

const buttonTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};

const messageBoxStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    marginTop: 8,
};

const messageTextStyle = {
    color: '#637083',
    fontSize: 14,
    lineHeight: 20,
};
