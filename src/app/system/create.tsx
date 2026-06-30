import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import { getSystemDefinition } from '../../lib/homeSystems';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type ExistingServiceRow = {
    system: string | null;
};

const suggestedServiceNames = [
    'Inventory / Storage',
    'Roofing',
    'Painting',
    'Siding',
    'Custom',
];

export default function CreateSystemScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [serviceName, setServiceName] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    async function createService() {
        const trimmedServiceName = serviceName.trim();
        const trimmedDescription = description.trim();

        if (!trimmedServiceName || sameText(trimmedServiceName, 'Custom')) {
            setMessage('Enter a service name.');
            return;
        }

        if (getSystemDefinition(trimmedServiceName)) {
            setMessage('That service already exists on the dashboard. Open it from Health Breakdown.');
            return;
        }

        setSaving(true);
        setMessage('Creating service...');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setSaving(false);
            setMessage(activePropertyErrorMessage(error));

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login');
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home');
            }

            return;
        }

        const { data: existingRows, error: existingError } = await supabase
            .from('home_items')
            .select('system')
            .eq('property_id', activeProperty.propertyId)
            .or('archived.eq.false,archived.is.null');

        if (existingError) {
            setSaving(false);
            setMessage(`Could not check existing services: ${existingError.message}`);
            return;
        }

        const existingService = ((existingRows || []) as ExistingServiceRow[]).some((row) =>
            sameText(row.system, trimmedServiceName)
        );

        if (existingService) {
            setSaving(false);
            setMessage('That service already exists for this home.');
            router.replace({
                pathname: '/system/[system]',
                params: { system: trimmedServiceName },
            });
            return;
        }

        const { error: insertError } = await supabase
            .from('home_items')
            .insert({
                user_id: activeProperty.userId,
                property_id: activeProperty.propertyId,
                item_slug: makeServiceSlug(activeProperty.propertyId, trimmedServiceName),
                name: 'Whole Home',
                system: trimmedServiceName,
                category: 'Area',
                location: 'Whole Home',
                parent_area: '',
                status: 'Missing Information',
                install_state: 'Unknown',
                about: trimmedDescription,
                archived: false,
            });

        setSaving(false);

        if (insertError) {
            setMessage(`Service could not be created: ${insertError.message}`);
            return;
        }

        setMessage('Service created.');
        router.replace({
            pathname: '/system/[system]',
            params: { system: trimmedServiceName },
        });
    }

    function chooseSuggestion(name: string) {
        setServiceName(sameText(name, 'Custom') ? '' : name);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center', paddingBottom: scaleIcon(40) }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: scaleFont(34), fontWeight: '900' }}>
                    Add Service
                </Text>
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        fontSize: scaleFont(16),
                        lineHeight: scaleFont(23),
                        marginTop: scaleIcon(8),
                        marginBottom: scaleIcon(22),
                    }}
                >
                    Create a HomeOS service for areas and items that do not fit the built-in systems.
                </Text>

                <ThemedCard>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(22), fontWeight: '900' }}>
                        Service name
                    </Text>
                    <Text
                        style={{
                            color: theme.colors.mutedText,
                            fontSize: scaleFont(14),
                            lineHeight: scaleFont(20),
                            marginTop: scaleIcon(6),
                            marginBottom: scaleIcon(14),
                        }}
                    >
                        Examples: Inventory / Storage, Roofing, Painting, Siding.
                    </Text>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), marginBottom: scaleIcon(14) }}>
                        {suggestedServiceNames.map((name) => {
                            const selected = sameText(serviceName, name);

                            return (
                                <TouchableOpacity
                                    key={name}
                                    onPress={() => chooseSuggestion(name)}
                                    activeOpacity={0.82}
                                    style={{
                                        backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt,
                                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                                        borderRadius: theme.radii.pill,
                                        borderWidth: 1,
                                        paddingVertical: scaleIcon(10),
                                        paddingHorizontal: scaleIcon(14),
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: selected ? theme.colors.primaryText : theme.colors.mutedText,
                                            fontSize: scaleFont(14),
                                            fontWeight: '900',
                                        }}
                                    >
                                        {name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <TextInput
                        value={serviceName}
                        onChangeText={setServiceName}
                        placeholder="Inventory / Storage"
                        placeholderTextColor={theme.colors.mutedText}
                        style={{
                            backgroundColor: theme.colors.surfaceAlt,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radii.button,
                            borderWidth: 1,
                            color: theme.colors.text,
                            fontSize: scaleFont(16),
                            fontWeight: '800',
                            padding: scaleIcon(16),
                            marginBottom: scaleIcon(12),
                        }}
                    />

                    <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Optional description"
                        placeholderTextColor={theme.colors.mutedText}
                        multiline
                        textAlignVertical="top"
                        style={{
                            backgroundColor: theme.colors.surfaceAlt,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radii.button,
                            borderWidth: 1,
                            color: theme.colors.text,
                            fontSize: scaleFont(16),
                            lineHeight: scaleFont(22),
                            minHeight: scaleIcon(100),
                            padding: scaleIcon(16),
                        }}
                    />

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10), marginTop: scaleIcon(18) }}>
                        <ThemedButton
                            title={saving ? 'Creating...' : 'Create Service'}
                            onPress={createService}
                            disabled={saving}
                            style={{ flexGrow: 1, minWidth: scaleIcon(180) }}
                        />
                        <ThemedButton
                            title="Cancel"
                            variant="secondary"
                            onPress={() => router.back()}
                            disabled={saving}
                            style={{ flexGrow: 1, minWidth: scaleIcon(140) }}
                        />
                    </View>
                </ThemedCard>

                {!!message && (
                    <ThemedCard style={{ marginTop: scaleIcon(16) }}>
                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), fontWeight: '900' }}>
                            {message}
                        </Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

function makeServiceSlug(propertyId: string, serviceName: string) {
    return makeSlug(`${propertyId}-service-${serviceName}-whole-home`);
}

function makeSlug(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function sameText(a?: string | null, b?: string | null) {
    return normalizeText(a) === normalizeText(b);
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
