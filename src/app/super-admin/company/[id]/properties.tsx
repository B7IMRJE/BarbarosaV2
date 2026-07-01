import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';
import { supabase } from '../../../../lib/supabase';

type Property = {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
};

export default function PropertiesScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();

    const [properties, setProperties] = useState<Property[]>([]);
    const [propertyName, setPropertyName] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [stateName, setStateName] = useState('');
    const [zip, setZip] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadProperties();
    }, [id]);

    async function loadProperties() {
        if (!id) {
            setMessage('Missing company id.');
            return;
        }

        const { data, error } = await supabase
            .from('properties')
            .select('id, name, address, city, state, zip')
            .eq('company_id', String(id))
            .order('created_at', { ascending: false });

        if (error) {
            setMessage(`Load properties failed: ${error.message}`);
            return;
        }

        setProperties(data || []);
    }

    async function addProperty() {
        if (!id) {
            setMessage('Missing company id.');
            return;
        }

        if (!propertyName.trim()) {
            setMessage('Enter property name.');
            return;
        }

        setLoading(true);
        setMessage('Adding property...');

        const { error } = await supabase.from('properties').insert({
            company_id: String(id),
            homeowner_id: '00000000-0000-0000-0000-000000000000',
            owner_id: null,
            name: propertyName.trim(),
            address: address.trim(),
            city: city.trim(),
            state: stateName.trim(),
            zip: zip.trim(),
            property_type: 'Residential',
        });

        setLoading(false);

        if (error) {
            setMessage(`Add property failed: ${error.message}`);
            return;
        }

        setPropertyName('');
        setAddress('');
        setCity('');
        setStateName('');
        setZip('');
        setMessage('Property added.');

        loadProperties();
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900, minWidth: 0 }}>
                <AdminNavBar
                    companyId={String(id || '')}
                    backFallback={`/super-admin/company/${id}` as Href}
                />

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: '#071B33',
                    }}
                >
                    Properties
                </Text>

                <Text
                    style={{
                        color: '#637083',
                        marginTop: 8,
                        marginBottom: 24,
                    }}
                >
                    Add and manage properties.
                </Text>

                <View
                    style={{
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: '#E3E8EF',
                        marginBottom: 20,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 20,
                            fontWeight: '900',
                            color: '#071B33',
                            marginBottom: 12,
                        }}
                    >
                        + Add Property
                    </Text>

                    <TextInput
                        placeholder="Property Name"
                        value={propertyName}
                        onChangeText={setPropertyName}
                        style={inputStyle}
                    />

                    <TextInput
                        placeholder="Address"
                        value={address}
                        onChangeText={setAddress}
                        style={inputStyle}
                    />

                    <TextInput
                        placeholder="City"
                        value={city}
                        onChangeText={setCity}
                        style={inputStyle}
                    />

                    <TextInput
                        placeholder="State"
                        value={stateName}
                        onChangeText={setStateName}
                        style={inputStyle}
                    />

                    <TextInput
                        placeholder="ZIP"
                        value={zip}
                        onChangeText={setZip}
                        style={inputStyle}
                    />

                    <TouchableOpacity
                        onPress={addProperty}
                        disabled={loading}
                        style={buttonStyle}
                    >
                        <Text style={buttonTextStyle}>
                            {loading ? 'Adding...' : 'Add Property'}
                        </Text>
                    </TouchableOpacity>

                    {!!message && (
                        <Text
                            style={{
                                marginTop: 12,
                                color: '#637083',
                            }}
                        >
                            {message}
                        </Text>
                    )}
                </View>

                <Text
                    style={{
                        fontSize: 22,
                        fontWeight: '900',
                        color: '#071B33',
                        marginBottom: 14,
                    }}
                >
                    Property List
                </Text>

                <View style={{ width: '100%', maxWidth: '100%', minWidth: 0, gap: 12 }}>
                    {properties.map((property) => (
                        <TouchableOpacity
                            key={property.id}
                            onPress={() =>
                                router.push(
                                    `/super-admin/property/${property.id}` as any
                                )
                            }
                            style={{
                                width: '100%',
                                maxWidth: '100%',
                                minWidth: 0,
                                backgroundColor: '#FFFFFF',
                                borderRadius: 20,
                                padding: 18,
                                borderWidth: 1,
                                borderColor: '#E3E8EF',
                            }}
                        >
                            <Text
                                style={{
                                    fontSize: 19,
                                    fontWeight: '900',
                                    color: '#071B33',
                                    flexShrink: 1,
                                }}
                            >
                                {property.name}
                            </Text>

                            <Text style={{ color: '#637083', marginTop: 6, flexShrink: 1 }}>
                                {property.address || 'No address'}
                            </Text>

                            <Text style={{ color: '#637083', flexShrink: 1 }}>
                                {property.city || 'No city'}
                                {property.state ? `, ${property.state}` : ''}{' '}
                                {property.zip || ''}
                            </Text>

                            <Text
                                style={{
                                    color: '#0B5FFF',
                                    marginTop: 10,
                                    fontWeight: '900',
                                }}
                            >
                                Open Property →
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}

const inputStyle = {
    backgroundColor: '#F3F6FA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    minWidth: 0,
};

const buttonStyle = {
    backgroundColor: '#071B33',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center' as const,
};

const buttonTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};
