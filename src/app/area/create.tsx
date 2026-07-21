import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    areaTemplates,
    buildAreaRow,
    buildStarterRows,
    duplicateKey,
    existingDuplicateKeys,
    getStarterItems,
    type AreaTemplate,
    type ExistingAreaItem,
    type HomeItemInsert,
} from '../../lib/areaTemplates';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import { getSystemDefinition, getSystemLabel } from '../../lib/homeSystems';
import { providerModeQueryParams, readProviderModeParams } from '../../lib/providerMode';
import {
    buildProviderHomeItemCreateRpcArgs,
    buildProviderHomeItemsRpcArgs,
} from '../../lib/providerHomeItems';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

export default function CreateAreaScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const params = useLocalSearchParams<{
        system?: string;
        parentArea?: string;
        areaName?: string;
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const providerModeContext = readProviderModeParams(params);
    const system = decodeParam(params.system);
    const parentAreaName = decodeParam(params.parentArea).trim();
    const initialAreaName = decodeParam(params.areaName).trim();
    const canonicalSystem = system ? getSystemDefinition(system)?.key || system : 'Plumbing';
    const systemLabel = getSystemLabel(canonicalSystem);
    const customAreaTemplate = areaTemplates.find((template) => template.id === 'custom-area') || null;
    const availableAreaTemplates = parentAreaName && customAreaTemplate ? [customAreaTemplate] : areaTemplates;
    const [selectedTemplate, setSelectedTemplate] = useState<AreaTemplate | null>(
        initialAreaName ? customAreaTemplate : null
    );
    const [customAreaName, setCustomAreaName] = useState(initialAreaName);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    const areaName = selectedTemplate?.id === 'custom-area'
        ? customAreaName.trim()
        : selectedTemplate?.name || '';
    const starterItemCount = useMemo(
        () => selectedTemplate ? getStarterItems(selectedTemplate).length : 0,
        [selectedTemplate]
    );

    async function createArea(includeStarterItems: boolean) {
        if (!selectedTemplate) {
            setMessage('Choose an area template first.');
            return;
        }

        if (!areaName) {
            setMessage('Enter a custom area name.');
            return;
        }

        setSaving(true);
        setMessage(includeStarterItems ? 'Creating area and starter items...' : 'Creating area...');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership({
                propertyIdOverride: providerModeContext?.propertyId,
                companyId: providerModeContext?.companyId,
            });
        } catch (error) {
            setSaving(false);
            setMessage(activePropertyErrorMessage(error));

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const existingResult = providerModeContext
            ? await supabase.rpc('get_provider_homeos_items', buildProviderHomeItemsRpcArgs(providerModeContext))
            : await supabase
                .from('home_items')
                .select('name, system, category, location, parent_area')
                .eq('property_id', activeProperty.propertyId)
                .or('archived.eq.false,archived.is.null');
        const existingRows = existingResult.data;
        const existingError = existingResult.error;

        if (existingError) {
            setSaving(false);
            setMessage(`Could not check existing items: ${existingError.message}`);
            return;
        }

        const existingKeys = existingDuplicateKeys((existingRows || []) as ExistingAreaItem[]);
        const rowsToInsert: HomeItemInsert[] = [];
        const duplicateAreaExists = ((existingRows || []) as ExistingAreaItem[]).some(
            (row) =>
                sameAreaText(row.category, 'Area') &&
                sameAreaText(row.system, canonicalSystem) &&
                sameAreaText(row.parent_area, parentAreaName) &&
                sameAreaText(row.name, areaName)
        );

        if (duplicateAreaExists) {
            setSaving(false);
            setMessage('An area with this name already exists for this system.');
            return;
        }

        const areaRow = buildAreaRow(activeProperty.userId, activeProperty.propertyId, areaName, canonicalSystem, parentAreaName);
        const areaKey = duplicateKey(areaRow.system, areaName, areaName, parentAreaName);

        if (!existingKeys.has(areaKey)) {
            rowsToInsert.push(areaRow);
            existingKeys.add(areaKey);
        }

        if (includeStarterItems && selectedTemplate.id !== 'custom-area') {
            for (const row of buildStarterRows(activeProperty.userId, activeProperty.propertyId, areaName, selectedTemplate, parentAreaName)) {
                const key = duplicateKey(row.system, areaName, row.name, parentAreaName);

                if (!existingKeys.has(key)) {
                    rowsToInsert.push(row);
                    existingKeys.add(key);
                }
            }
        }

        if (rowsToInsert.length > 0) {
            const insertError = providerModeContext
                ? await createProviderRows(providerModeContext, rowsToInsert)
                : (await supabase.from('home_items').insert(rowsToInsert)).error;

            if (insertError) {
                setSaving(false);
                setMessage(`Create failed: ${getSupabaseErrorMessage(insertError)}`);
                return;
            }
        }

        setSaving(false);
        setMessage(`Created ${rowsToInsert.length} new item${rowsToInsert.length === 1 ? '' : 's'}.`);
        router.replace({
            pathname: '/system/[system]/area/[area]',
            params: {
                system: canonicalSystem,
                area: areaName,
                ...(parentAreaName ? { parentArea: parentAreaName } : {}),
                ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
            },
        } as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 1000 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: scaleFont(34), fontWeight: '900' }}>
                    Add Area / Container
                </Text>
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        marginTop: scaleIcon(8),
                        marginBottom: scaleIcon(22),
                        fontSize: scaleFont(16),
                        lineHeight: scaleFont(22),
                    }}
                >
                    {parentAreaName
                        ? `Create an area or container inside ${parentAreaName} for ${systemLabel}. Examples: Closet, Cabinet, Shelf, Vanity.`
                        : `Create a shared home area for ${systemLabel}. You can add starter items across multiple systems.`}
                </Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(12) }}>
                    {availableAreaTemplates.map((template) => {
                        const selected = selectedTemplate?.id === template.id;
                        const count = getStarterItems(template).length;

                        return (
                            <ThemedCard
                                key={template.id}
                                onPress={() => setSelectedTemplate(template)}
                                style={{
                                    width: '31.5%',
                                    minWidth: scaleIcon(210),
                                    flexGrow: 1,
                                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                                    borderWidth: selected ? 2 : 1,
                                }}
                            >
                                <Text style={{ fontSize: scaleFont(34), marginBottom: scaleIcon(10) }}>{template.icon}</Text>
                                <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900' }}>
                                    {template.name}
                                </Text>
                                <Text style={{ color: theme.colors.mutedText, marginTop: scaleIcon(6), lineHeight: scaleFont(20) }}>
                                    {template.id === 'custom-area'
                                        ? 'Create your own area name.'
                                        : `${count} starter item${count === 1 ? '' : 's'} available.`}
                                </Text>
                            </ThemedCard>
                        );
                    })}
                </View>

                {selectedTemplate && (
                    <ThemedCard style={{ marginTop: scaleIcon(18) }}>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(22), fontWeight: '900' }}>
                            {selectedTemplate.id === 'custom-area'
                                ? 'Create Custom Area / Container'
                                : `Create ${selectedTemplate.name} with starter items?`}
                        </Text>
                        <Text style={{ color: theme.colors.mutedText, marginTop: scaleIcon(8), lineHeight: scaleFont(22) }}>
                            {parentAreaName
                                ? 'This creates one container record under the current area. Add items after opening it.'
                                : 'Area-only creates one area record. Starter items create suggested records across systems and skip duplicates.'}
                        </Text>

                        {selectedTemplate.id === 'custom-area' && (
                            <TextInput
                                value={customAreaName}
                                onChangeText={setCustomAreaName}
                                placeholder="Closet, Cabinet, Shelf..."
                                placeholderTextColor={theme.colors.mutedText}
                                style={{
                                    backgroundColor: theme.colors.surface,
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.button,
                                    borderWidth: 1,
                                    color: theme.colors.text,
                                    fontSize: scaleFont(16),
                                    marginTop: scaleIcon(16),
                                    padding: scaleIcon(16),
                                }}
                            />
                        )}

                        {selectedTemplate.id !== 'custom-area' && (
                            <Text style={{ color: theme.colors.mutedText, marginTop: scaleIcon(12), fontWeight: '900' }}>
                                {starterItemCount} starter item{starterItemCount === 1 ? '' : 's'} will be checked for duplicates.
                            </Text>
                        )}

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10), marginTop: scaleIcon(18) }}>
                            <ThemedButton
                                title={saving ? 'Creating...' : parentAreaName ? 'Create Area / Container' : 'Create Area Only'}
                                variant="secondary"
                                disabled={saving}
                                onPress={() => createArea(false)}
                                style={{ flexGrow: 1, minWidth: scaleIcon(190) }}
                            />

                            {!parentAreaName && (
                                <ThemedButton
                                    title={saving ? 'Creating...' : 'Create Area + Starter Items'}
                                    disabled={saving || selectedTemplate.id === 'custom-area'}
                                    onPress={() => createArea(true)}
                                    style={{ flexGrow: 1, minWidth: scaleIcon(220) }}
                                />
                            )}
                        </View>
                    </ThemedCard>
                )}

                {!!message && (
                    <ThemedCard style={{ marginTop: scaleIcon(16) }}>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>{message}</Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

function normalizeAreaText(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sameAreaText(a?: string | null, b?: string | null) {
    return normalizeAreaText(a) === normalizeAreaText(b);
}

async function createProviderRows(
    providerModeContext: NonNullable<ReturnType<typeof readProviderModeParams>>,
    rowsToInsert: HomeItemInsert[]
) {
    for (const row of rowsToInsert) {
        const { error } = await supabase.rpc(
            'create_provider_homeos_item',
            buildProviderHomeItemCreateRpcArgs(providerModeContext, {
                itemSlug: row.item_slug,
                name: row.name,
                system: row.system,
                category: row.category,
                location: row.location,
                parentArea: row.parent_area,
                status: row.status,
                installState: row.install_state,
            })
        );

        if (error) return error;
    }

    return null;
}

function getSupabaseErrorMessage(error: unknown) {
    return String((error as { message?: unknown } | null)?.message || 'Please try again.');
}

function decodeParam(value?: string | string[] | null) {
    const rawValue = Array.isArray(value) ? value[0] : value;
    const text = String(rawValue || '').trim();

    if (!text) return '';

    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
}
