

import HomeHeader from '../../components/HomeHeader';


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
import { supabase } from '../../lib/supabase';

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

export default function EditItemScreen() {
    const { slug } = useLocalSearchParams();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [name, setName] = useState('');
    const [about, setAbout] = useState('');

    const [locationChoice, setLocationChoice] = useState('Garage');
    const [customLocation, setCustomLocation] = useState('');

    const [parentAreaChoice, setParentAreaChoice] = useState('None');
    const [customParentArea, setCustomParentArea] = useState('');

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

    function finalParentArea() {
        if (parentAreaChoice === 'Custom') {
            return customParentArea.trim();
        }

        if (parentAreaChoice === 'None') {
            return '';
        }

        return parentAreaChoice;
    }

    async function loadItem() {
        const { data, error } = await supabase
            .from('home_items')
            .select('*')
            .eq('item_slug', String(slug))
            .maybeSingle();

        if (error || !data) {
            setLoading(false);
            return;
        }

        const savedLocation = data.location || '';
        const savedParentArea = data.parent_area || '';

        const nextLocationChoice = getPickerValue(savedLocation, locations);
        const nextParentAreaChoice = getPickerValue(
            savedParentArea || 'None',
            parentAreas
        );

        setName(data.name || '');
        setAbout(data.about || '');

        setLocationChoice(nextLocationChoice);
        setCustomLocation(nextLocationChoice === 'Custom' ? savedLocation : '');

        setParentAreaChoice(nextParentAreaChoice);
        setCustomParentArea(
            nextParentAreaChoice === 'Custom' ? savedParentArea : ''
        );

        setBrand(data.brand || '');
        setModel(data.model || '');
        setSerial(data.serial || '');
        setInstallState(data.install_state || 'Unknown');
        setStatus(data.status || 'Missing Information');

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

        if (parentAreaChoice === 'Custom' && !customParentArea.trim()) {
            alert('Enter a custom parent area or select an existing one.');
            return;
        }

        setSaving(true);

        const { error } = await supabase
            .from('home_items')
            .update({
                name: name.trim(),
                about: about.trim(),
                location: finalLocation(),
                parent_area: finalParentArea(),
                brand: brand.trim() || 'Unknown',
                model: model.trim() || 'Unknown',
                serial: serial.trim() || 'Unknown',
                install_state: installState,
                status,
            })
            .eq('item_slug', String(slug));

        setSaving(false);

        if (error) {
            alert(error.message);
            return;
        }

        router.back();
    }

    if (loading) {
        return (
            <View style={centerStyle}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <Text onPress={() => router.back()} style={backStyle}>
                    ← Back
                </Text>

                <Text style={titleStyle}>Edit Item</Text>

                <TextInput
                    style={inputStyle}
                    placeholder="Name"
                    value={name}
                    onChangeText={setName}
                />

                <TextInput
                    style={[inputStyle, { minHeight: 100 }]}
                    placeholder="About"
                    value={about}
                    onChangeText={setAbout}
                    multiline
                />

                <Text style={sectionTitleStyle}>Location</Text>
                <OptionRow
                    options={locations}
                    value={locationChoice}
                    onChange={setLocationChoice}
                />

                {locationChoice === 'Custom' && (
                    <TextInput
                        style={inputStyle}
                        placeholder="Custom Location"
                        value={customLocation}
                        onChangeText={setCustomLocation}
                    />
                )}

                <Text style={sectionTitleStyle}>Parent Area</Text>
                <OptionRow
                    options={parentAreas}
                    value={parentAreaChoice}
                    onChange={setParentAreaChoice}
                />

                {parentAreaChoice === 'Custom' && (
                    <TextInput
                        style={inputStyle}
                        placeholder="Custom Parent Area"
                        value={customParentArea}
                        onChangeText={setCustomParentArea}
                    />
                )}

                <View style={rowStyle}>
                    <View style={smallCardStyle}>
                        <Text style={smallLabelStyle}>Brand</Text>
                        <TextInput
                            style={smallInputStyle}
                            placeholder="Brand"
                            value={brand}
                            onChangeText={setBrand}
                        />
                    </View>

                    <View style={smallCardStyle}>
                        <Text style={smallLabelStyle}>Model</Text>
                        <TextInput
                            style={smallInputStyle}
                            placeholder="Model"
                            value={model}
                            onChangeText={setModel}
                        />
                    </View>

                    <View style={smallCardStyle}>
                        <Text style={smallLabelStyle}>Serial</Text>
                        <TextInput
                            style={smallInputStyle}
                            placeholder="Serial"
                            value={serial}
                            onChangeText={setSerial}
                        />
                    </View>
                </View>

                <Text style={sectionTitleStyle}>Condition</Text>

                <OptionRow
                    options={installStates}
                    value={installState}
                    onChange={setInstallState}
                />

                <Text style={sectionTitleStyle}>Status</Text>

                <OptionRow
                    options={statuses}
                    value={status}
                    onChange={setStatus}
                />

                <TouchableOpacity
                    onPress={saveItem}
                    disabled={saving}
                    style={saveButtonStyle}
                >
                    <Text style={saveButtonTextStyle}>
                        {saving ? 'Saving...' : 'Save Changes'}
                    </Text>
                </TouchableOpacity>

                <HomeHeader />


            </View>
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
                            value === option &&
                            optionButtonSelectedTextStyle,
                        ]}
                    >
                        {option}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const centerStyle = {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
};

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
    marginBottom: 20,
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

const rowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
};

const smallCardStyle = {
    flex: 1,
    minWidth: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const smallLabelStyle = {
    color: '#637083',
    fontSize: 13,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const smallInputStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    color: '#071B33',
};

const saveButtonStyle = {
    backgroundColor: '#071B33',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center' as const,
    marginTop: 20,
    marginBottom: 20,
};

const saveButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};
