import DictationTextInput from '@/components/input/DictationTextInput';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    areaTemplates,
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
import {
    getHomeAreaCreationErrorMessage,
    pickHomeAreaRecordOwnerUserId,
    planHomeAreaCreation,
    withHomeAreaCreationTimeout,
} from '../../lib/homeAreaCreation';
import { getSystemDefinition, getSystemLabel } from '../../lib/homeSystems';
import { providerModeQueryParams, readProviderModeParams } from '../../lib/providerMode';
import {
    buildProviderHomeItemCreateRpcArgs,
    buildProviderHomeItemsRpcArgs,
    getProviderHomeItemsReadStrategy,
    getProviderHomeItemsRpcName,
    getProviderHomeItemsWriteStrategy,
    usesProviderHomeItemsRpc,
} from '../../lib/providerHomeItems';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

export default function CreateAreaScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const params = useLocalSearchParams<{
        system?: string;
        parentArea?: string;
        areaName?: string;
        templateId?: string;
        fillExisting?: string;
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
    const initialTemplateId = decodeParam(params.templateId).trim();
    const canonicalSystem = system ? getSystemDefinition(system)?.key || system : 'Plumbing';
    const systemLabel = getSystemLabel(canonicalSystem);
    const customAreaTemplate = areaTemplates.find((template) => template.id === 'custom-area') || null;
    const availableAreaTemplates = parentAreaName && customAreaTemplate ? [customAreaTemplate] : areaTemplates;
    const initialTemplate = areaTemplates.find((template) => template.id === initialTemplateId) || null;
    const [selectedTemplate, setSelectedTemplate] = useState<AreaTemplate | null>(
        initialTemplate || (initialAreaName ? customAreaTemplate : null)
    );
    const [customAreaName, setCustomAreaName] = useState(initialAreaName);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [retryIncludeStarterItems, setRetryIncludeStarterItems] = useState<boolean | null>(null);
    const submissionInFlightRef = useRef(false);

    const areaName = customAreaName.trim() || selectedTemplate?.name || '';
    const starterItemCount = useMemo(
        () => selectedTemplate ? getStarterItems(selectedTemplate).length : 0,
        [selectedTemplate]
    );

    async function createArea(includeStarterItems: boolean) {
        if (submissionInFlightRef.current) return;

        if (!selectedTemplate) {
            setMessage('Choose an area template first.');
            return;
        }

        if (!areaName) {
            setMessage('Enter a custom area name.');
            return;
        }

        submissionInFlightRef.current = true;
        setSaving(true);
        setRetryIncludeStarterItems(null);
        setMessage('Confirming company and home access...');

        try {
            let activeProperty;

            try {
                activeProperty = await withHomeAreaCreationTimeout(
                    requireActivePropertyMembership({
                        propertyIdOverride: providerModeContext?.propertyId,
                        companyId: providerModeContext?.companyId,
                    }),
                    'access'
                );
            } catch (error) {
                if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                    router.replace('/auth/login' as any);
                } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                    router.replace('/onboarding/create-home' as any);
                }

                throw error;
            }

            const readStrategy = providerModeContext
                ? getProviderHomeItemsReadStrategy(providerModeContext, activeProperty.membershipRole)
                : null;
            const writeStrategy = providerModeContext
                ? getProviderHomeItemsWriteStrategy(providerModeContext, activeProperty.membershipRole)
                : null;

            if (readStrategy === 'denied' || writeStrategy === 'denied') {
                throw new Error('This provider account cannot add HomeOS areas without an assigned request, visit, or job. Sales Tech access remains read-only.');
            }

            setMessage('Checking existing areas so retries stay duplicate-free...');

            const existingResult = await withHomeAreaCreationTimeout(
                providerModeContext && readStrategy && usesProviderHomeItemsRpc(readStrategy)
                    ? supabase.rpc(
                        getProviderHomeItemsRpcName(readStrategy),
                        buildProviderHomeItemsRpcArgs(providerModeContext)
                    )
                    : supabase
                        .from('home_items')
                        .select('name, system, category, location, parent_area')
                        .eq('property_id', activeProperty.propertyId)
                        .or('archived.eq.false,archived.is.null'),
                'existing_items'
            );

            if (existingResult.error) {
                throw new Error(`Could not check existing HomeOS areas: ${existingResult.error.message}`);
            }

            let recordOwnerUserId = activeProperty.userId;

            if (writeStrategy === 'platform_admin_direct') {
                const membershipResult = await withHomeAreaCreationTimeout(
                    supabase
                        .from('property_memberships')
                        .select('id, user_id, role, created_at')
                        .eq('property_id', activeProperty.propertyId)
                        .eq('status', 'active')
                        .order('created_at', { ascending: true })
                        .order('id', { ascending: true }),
                    'existing_items'
                );

                if (membershipResult.error) {
                    throw new Error(`Could not confirm the homeowner record owner: ${membershipResult.error.message}`);
                }

                recordOwnerUserId = pickHomeAreaRecordOwnerUserId(membershipResult.data || []);

                if (!recordOwnerUserId) {
                    throw new Error('Could not find an active homeowner membership for this property. No HomeOS records were changed.');
                }
            }

            const plan = planHomeAreaCreation({
                userId: recordOwnerUserId,
                propertyId: activeProperty.propertyId,
                areaName,
                system: canonicalSystem,
                parentArea: parentAreaName,
                template: selectedTemplate,
                includeStarterItems,
                existingRows: (existingResult.data || []) as ExistingAreaItem[],
            });

            setMessage(plan.duplicateAreaExists
                ? 'Area already exists. Safely filling only missing records...'
                : includeStarterItems
                    ? 'Creating area and starter items...'
                    : 'Creating area...'
            );

            if (plan.rowsToInsert.length > 0) {
                const insertError = await withHomeAreaCreationTimeout(
                    providerModeContext && writeStrategy === 'assigned_rpc'
                        ? createProviderRows(providerModeContext, plan.rowsToInsert)
                        : insertDirectRows(plan.rowsToInsert),
                    'create',
                    30_000
                );

                if (insertError) {
                    throw new Error(`Create failed: ${getSupabaseErrorMessage(insertError)}`);
                }
            }

            setMessage(plan.rowsToInsert.length > 0
                ? `Created ${plan.rowsToInsert.length} new item${plan.rowsToInsert.length === 1 ? '' : 's'}.`
                : 'This area already exists. Opening it now.'
            );
            router.replace({
                pathname: '/system/[system]/area/[area]',
                params: {
                    system: canonicalSystem,
                    area: areaName,
                    ...(parentAreaName ? { parentArea: parentAreaName } : {}),
                    ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
                },
            } as any);
        } catch (error) {
            setRetryIncludeStarterItems(includeStarterItems);
            setMessage(isActivePropertyResolutionError(error)
                ? activePropertyErrorMessage(error)
                : getHomeAreaCreationErrorMessage(error)
            );
        } finally {
            submissionInFlightRef.current = false;
            setSaving(false);
        }
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
                                        : template.id === 'whole-home'
                                            ? 'Location-neutral placement for main services and whole-home systems.'
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

                        {(selectedTemplate.id === 'custom-area' || !!initialAreaName) && (
                            <DictationTextInput
                                value={customAreaName}
                                onChangeText={setCustomAreaName}
                                placeholder="Bathroom 3, Closet, Cabinet..."
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

                            {!parentAreaName && starterItemCount > 0 && (
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
                        {retryIncludeStarterItems !== null && !saving && (
                            <ThemedButton
                                title="Try Again"
                                onPress={() => createArea(retryIncludeStarterItems)}
                                style={{ marginTop: scaleIcon(12), minHeight: scaleIcon(48) }}
                            />
                        )}
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
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

async function insertDirectRows(rowsToInsert: HomeItemInsert[]) {
    return (await supabase.from('home_items').insert(rowsToInsert)).error;
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
