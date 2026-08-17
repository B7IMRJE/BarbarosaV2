import DictationTextInput from '@/components/input/DictationTextInput';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import {
    getAreaTemplate,
    getAreaTemplateByName,
    type ExistingAreaItem,
    type HomeItemInsert,
} from '../../lib/areaTemplates';
import {
    canonicalAreaTemplateForTrades,
    homeAreaCardActionPreviewNames,
    planAddMissingAreaCards,
    planDuplicateAreaStructure,
    suggestDuplicateAreaName,
    type HomeAreaCardActionPlan,
} from '../../lib/homeAreaCardActions';
import {
    formatHomeAreaCreationSummary,
    getHomeAreaCreationErrorMessage,
    isHomeAreaDuplicateWriteError,
    orderHomeAreaCreationRows,
    pickHomeAreaRecordOwnerUserId,
    withHomeAreaCreationTimeout,
    type HomeAreaCreationWriteSummary,
} from '../../lib/homeAreaCreation';
import { loadHomeOSTradeContext } from '../../lib/homeosTradeCapabilities';
import { getSystemDefinition, getSystemLabel } from '../../lib/homeSystems';
import { providerModeQueryParams, readProviderModeParams } from '../../lib/providerMode';
import {
    buildProviderHomeItemCreateRpcArgs,
    buildProviderHomeItemsRpcArgs,
    createProviderHomeOSStarterItemFromDeck,
    getProviderHomeItemsReadStrategy,
    getProviderHomeItemsRpcName,
    getProviderHomeItemsWriteStrategy,
    usesProviderHomeItemsRpc,
    type ProviderHomeItemsWriteStrategy,
} from '../../lib/providerHomeItems';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

export type AreaStructureActionMode = 'add_missing' | 'duplicate';

type LoadedActionContext = {
    existingRows: ExistingAreaItem[];
    propertyId: string;
    recordOwnerUserId: string;
    template: NonNullable<ReturnType<typeof getAreaTemplate>>;
    writeStrategy: ProviderHomeItemsWriteStrategy | null;
};

export default function AreaStructureActionScreen({ mode }: { mode: AreaStructureActionMode }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const params = useLocalSearchParams<{
        system?: string | string[];
        sourceArea?: string | string[];
        parentArea?: string | string[];
        templateId?: string | string[];
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const providerModeContext = useMemo(() => readProviderModeParams(params), [params]);
    const sourceAreaName = decodeParam(params.sourceArea);
    const sourceParentArea = decodeParam(params.parentArea);
    const requestedSystem = decodeParam(params.system) || 'Plumbing';
    const canonicalSystem = getSystemDefinition(requestedSystem)?.key || requestedSystem;
    const systemLabel = getSystemLabel(canonicalSystem);
    const templateId = decodeParam(params.templateId);
    const [loadedContext, setLoadedContext] = useState<LoadedActionContext | null>(null);
    const [plan, setPlan] = useState<HomeAreaCardActionPlan | null>(null);
    const [targetAreaName, setTargetAreaName] = useState('');
    const [targetParentArea, setTargetParentArea] = useState(sourceParentArea);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [completedAreaName, setCompletedAreaName] = useState('');
    const [completedParentArea, setCompletedParentArea] = useState('');
    const submissionInFlightRef = useRef(false);
    const targetNameInitializedRef = useRef(false);
    const previewNames = plan ? homeAreaCardActionPreviewNames(plan) : [];

    useEffect(() => {
        void loadPreview();
        // Route values, rather than the params object identity, define this load.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canonicalSystem, mode, sourceAreaName, sourceParentArea, templateId]);

    useEffect(() => {
        if (mode !== 'duplicate' || !loadedContext || !targetAreaName.trim()) return;

        setPlan(planDuplicateAreaStructure({
            userId: loadedContext.recordOwnerUserId,
            propertyId: loadedContext.propertyId,
            sourceAreaName,
            targetAreaName,
            system: canonicalSystem,
            sourceParentArea,
            targetParentArea,
            template: loadedContext.template,
            existingRows: loadedContext.existingRows,
        }));
    }, [canonicalSystem, loadedContext, mode, sourceAreaName, sourceParentArea, targetAreaName, targetParentArea]);

    async function loadPreview(options: { preserveTarget?: boolean } = {}) {
        setLoading(true);
        setCompletedAreaName('');
        if (!options.preserveTarget) setMessage('Confirming home and company access...');

        try {
            const context = await loadActionContext();
            const sourceExists = context.existingRows.some((row) => (
                normalize(row.category) === 'area'
                && normalize(row.system) === normalize(canonicalSystem)
                && normalize(row.name) === normalize(sourceAreaName)
                && normalize(row.parent_area) === normalize(sourceParentArea)
            ));

            if (!sourceExists) {
                throw new Error(`${sourceAreaName || 'This area'} could not be found. Return to HomeOS and reopen the action.`);
            }

            if (mode === 'duplicate' && !options.preserveTarget && !targetNameInitializedRef.current) {
                const areaNames = context.existingRows
                    .filter((row) => normalize(row.category) === 'area' && normalize(row.parent_area) === normalize(sourceParentArea))
                    .map((row) => String(row.name || ''));
                setTargetAreaName(suggestDuplicateAreaName(sourceAreaName, areaNames));
                setTargetParentArea(sourceParentArea);
                targetNameInitializedRef.current = true;
            }

            const nextPlan = mode === 'add_missing'
                ? planAddMissingAreaCards({
                    userId: context.recordOwnerUserId,
                    propertyId: context.propertyId,
                    areaName: sourceAreaName,
                    system: canonicalSystem,
                    parentArea: sourceParentArea,
                    template: context.template,
                    existingRows: context.existingRows,
                })
                : planDuplicateAreaStructure({
                    userId: context.recordOwnerUserId,
                    propertyId: context.propertyId,
                    sourceAreaName,
                    targetAreaName: targetAreaName || suggestDuplicateAreaName(sourceAreaName, []),
                    system: canonicalSystem,
                    sourceParentArea,
                    targetParentArea,
                    template: context.template,
                    existingRows: context.existingRows,
                });

            setLoadedContext(context);
            setPlan(nextPlan);
            setMessage('');
        } catch (error) {
            setLoadedContext(null);
            setPlan(null);
            setMessage(isActivePropertyResolutionError(error)
                ? activePropertyErrorMessage(error)
                : getHomeAreaCreationErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }

    async function loadActionContext(): Promise<LoadedActionContext> {
        let activeProperty;

        try {
            activeProperty = await withHomeAreaCreationTimeout(
                requireActivePropertyMembership({
                    propertyIdOverride: providerModeContext?.propertyId,
                    companyId: providerModeContext?.companyId,
                }),
                'access',
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

        if (providerModeContext && (readStrategy === 'denied' || writeStrategy === 'denied')) {
            throw new Error('This account cannot change HomeOS area structure for this home. Confirm an assigned technician visit or use an authorized homeowner or management account.');
        }

        const existingResult = await withHomeAreaCreationTimeout(
            providerModeContext && readStrategy && usesProviderHomeItemsRpc(readStrategy)
                ? supabase.rpc(getProviderHomeItemsRpcName(readStrategy), buildProviderHomeItemsRpcArgs(providerModeContext))
                : supabase
                    .from('home_items')
                    .select('id, name, system, category, location, parent_area, item_slug, starter_template_key, archived')
                    .eq('property_id', activeProperty.propertyId)
                    .or('archived.eq.false,archived.is.null'),
            'existing_items',
        );

        if (existingResult.error) {
            throw new Error(`Could not check the existing HomeOS area: ${existingResult.error.message}`);
        }

        const tradeContext = await withHomeAreaCreationTimeout(
            loadHomeOSTradeContext({
                companyId: providerModeContext?.companyId,
                propertyId: activeProperty.propertyId,
                serviceRequestId: providerModeContext?.serviceRequestId,
                scheduleSlotId: providerModeContext?.scheduleSlotId,
                jobId: providerModeContext?.jobId,
            }),
            'access',
        );
        const baseTemplate = getAreaTemplate(templateId) || getAreaTemplateByName(sourceAreaName);

        if (!baseTemplate || baseTemplate.id === 'custom-area') {
            throw new Error('This area does not have a reusable canonical starter-card template to copy.');
        }

        const template = canonicalAreaTemplateForTrades(baseTemplate, tradeContext.enabledTradeKeys);
        if (Object.values(template.starterItems).flat().length === 0) {
            throw new Error(`No canonical ${systemLabel} starter cards are enabled for this company or home.`);
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
                'existing_items',
            );

            if (membershipResult.error) throw membershipResult.error;
            recordOwnerUserId = pickHomeAreaRecordOwnerUserId(membershipResult.data || []);
            if (!recordOwnerUserId) throw new Error('No active homeowner record owner was found. Nothing was changed.');
        }

        return {
            existingRows: (existingResult.data || []) as ExistingAreaItem[],
            propertyId: activeProperty.propertyId,
            recordOwnerUserId,
            template,
            writeStrategy,
        };
    }

    async function saveAction() {
        if (submissionInFlightRef.current || saving) return;
        const destinationName = mode === 'add_missing' ? sourceAreaName : targetAreaName.trim();
        const destinationParent = mode === 'add_missing' ? sourceParentArea : targetParentArea.trim();

        if (!destinationName) {
            setMessage('Enter a unique name for the new area.');
            return;
        }
        if (mode === 'duplicate' && normalize(destinationName) === normalize(sourceAreaName) && normalize(destinationParent) === normalize(sourceParentArea)) {
            setMessage('Choose a different area name or placement for the copy.');
            return;
        }

        submissionInFlightRef.current = true;
        setSaving(true);
        setMessage(mode === 'add_missing' ? 'Rechecking missing cards...' : 'Rechecking the destination area...');

        try {
            const context = await loadActionContext();
            const currentPlan = mode === 'add_missing'
                ? planAddMissingAreaCards({
                    userId: context.recordOwnerUserId,
                    propertyId: context.propertyId,
                    areaName: sourceAreaName,
                    system: canonicalSystem,
                    parentArea: sourceParentArea,
                    template: context.template,
                    existingRows: context.existingRows,
                })
                : planDuplicateAreaStructure({
                    userId: context.recordOwnerUserId,
                    propertyId: context.propertyId,
                    sourceAreaName,
                    targetAreaName: destinationName,
                    system: canonicalSystem,
                    sourceParentArea,
                    targetParentArea: destinationParent,
                    template: context.template,
                    existingRows: context.existingRows,
                });

            if (!currentPlan.areaExists) throw new Error('The source area no longer exists. No cards were changed.');
            if ('targetAlreadyExists' in currentPlan && currentPlan.targetAlreadyExists) {
                throw new Error('That area name already exists in the selected placement. Choose another name.');
            }

            const summary = await writeRows(
                currentPlan.rowsToInsert,
                context.writeStrategy,
            );
            const resultMessage = currentPlan.rowsToInsert.length === 0
                ? `All ${currentPlan.canonicalStarterCount} canonical starter cards are already present. Nothing was changed.`
                : formatHomeAreaCreationSummary(summary);

            setLoadedContext(context);
            setPlan(currentPlan);
            setMessage(mode === 'duplicate'
                ? `${resultMessage} The copy contains starter structure only—no installed facts, photos, history, products, pricing, approvals, or observations were copied.`
                : resultMessage,
            );
            setCompletedAreaName(destinationName);
            setCompletedParentArea(destinationParent);
        } catch (error) {
            setMessage(getHomeAreaCreationErrorMessage(error));
        } finally {
            submissionInFlightRef.current = false;
            setSaving(false);
        }
    }

    async function writeRows(rows: HomeItemInsert[], writeStrategy: ProviderHomeItemsWriteStrategy | null) {
        const summary: HomeAreaCreationWriteSummary = { created: 0, skipped: 0 };

        for (const row of orderHomeAreaCreationRows(rows)) {
            try {
                if (providerModeContext && writeStrategy === 'assigned_rpc') {
                    if (row.category !== 'Area' && row.starter_template_key) {
                        await withHomeAreaCreationTimeout(
                            createProviderHomeOSStarterItemFromDeck(providerModeContext, {
                                templateKey: row.starter_template_key,
                                location: row.location,
                                parentArea: row.parent_area,
                            }),
                            'create',
                        );
                    } else {
                        const { error } = await withHomeAreaCreationTimeout(
                            supabase.rpc(
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
                                }),
                            ),
                            'create',
                        );
                        if (error) throw error;
                    }
                } else {
                    const { error } = await withHomeAreaCreationTimeout(
                        supabase.from('home_items').insert(row),
                        'create',
                    );
                    if (error) throw error;
                }

                summary.created += 1;
            } catch (error) {
                if (isHomeAreaDuplicateWriteError(error)) {
                    summary.skipped += 1;
                    continue;
                }
                throw error;
            }
        }

        return summary;
    }

    function openCompletedArea() {
        const destination = completedAreaName || sourceAreaName;
        const destinationParent = completedAreaName ? completedParentArea : sourceParentArea;

        router.replace({
            pathname: '/system/[system]/area/[area]',
            params: {
                system: canonicalSystem,
                area: destination,
                ...(destinationParent ? { parentArea: destinationParent } : {}),
                ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
                refresh: String(Date.now()),
            },
        } as any);
    }

    const title = mode === 'add_missing' ? `Add Missing Cards to ${sourceAreaName}` : `Duplicate ${sourceAreaName}`;
    const actionTitle = mode === 'add_missing' ? 'Add Missing Cards' : 'Create Structure-Only Copy';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center', paddingBottom: scaleIcon(44) }}
        >
            <View style={{ width: '100%', maxWidth: 960 }}>
                <HomeHeader />
                <Text accessibilityRole="header" style={{ color: theme.colors.text, fontSize: scaleFont(30), fontWeight: '900', marginTop: scaleIcon(12) }}>
                    {title}
                </Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(16), lineHeight: scaleFont(23), marginTop: scaleIcon(8) }}>
                    {mode === 'add_missing'
                        ? `Review the canonical ${systemLabel} starter cards that are missing from this existing area. Existing cards and their history are never overwritten.`
                        : 'Create a new area from the reusable starter-card structure. Installed details, product choices, media, service and maintenance history, pricing, approvals, and observations stay with the original.'}
                </Text>

                {mode === 'duplicate' && (
                    <ThemedCard style={{ marginTop: scaleIcon(18) }}>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900' }}>New area identity</Text>
                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(18), marginTop: scaleIcon(6) }}>
                            Source: {sourceAreaName} · {sourceParentArea ? `Inside ${sourceParentArea}` : 'Top-level placement'}
                        </Text>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900', marginTop: scaleIcon(16) }}>Unique new area name</Text>
                        <DictationTextInput
                            accessibilityLabel="Unique new area name"
                            value={targetAreaName}
                            onChangeText={setTargetAreaName}
                            placeholder="Bathroom 2"
                            placeholderTextColor={theme.colors.mutedText}
                            style={{
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                                borderRadius: theme.radii.button,
                                borderWidth: 1,
                                color: theme.colors.text,
                                fontSize: scaleFont(17),
                                marginTop: scaleIcon(8),
                                minHeight: scaleIcon(52),
                                padding: scaleIcon(14),
                            }}
                        />
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900', marginTop: scaleIcon(16) }}>Placement / parent area</Text>
                        <DictationTextInput
                            accessibilityLabel="Placement or parent area"
                            value={targetParentArea}
                            onChangeText={setTargetParentArea}
                            placeholder="Leave blank for top level"
                            placeholderTextColor={theme.colors.mutedText}
                            style={{
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                                borderRadius: theme.radii.button,
                                borderWidth: 1,
                                color: theme.colors.text,
                                fontSize: scaleFont(17),
                                marginTop: scaleIcon(8),
                                minHeight: scaleIcon(52),
                                padding: scaleIcon(14),
                            }}
                        />
                    </ThemedCard>
                )}

                <ThemedCard style={{ marginTop: scaleIcon(18) }}>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>
                        {loading ? 'Checking this area…' : mode === 'add_missing' ? 'Missing-card preview' : 'Structure preview'}
                    </Text>
                    {!loading && plan && (
                        <>
                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(20), marginTop: scaleIcon(8) }}>
                                {mode === 'add_missing'
                                    ? `${previewNames.length} missing · ${plan.alreadyPresent} already present and safely skipped`
                                    : `${plan.canonicalStarterCount} reusable canonical card${plan.canonicalStarterCount === 1 ? '' : 's'} · all start unconfirmed`}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(9), marginTop: scaleIcon(14) }}>
                                {(mode === 'add_missing' ? previewNames : homeAreaCardActionPreviewNames(plan)).map((name) => (
                                    <View
                                        key={name}
                                        style={{
                                            backgroundColor: theme.colors.surfaceAlt,
                                            borderColor: theme.colors.border,
                                            borderRadius: theme.radii.button,
                                            borderWidth: 1,
                                            minHeight: scaleIcon(44),
                                            paddingHorizontal: scaleIcon(12),
                                            paddingVertical: scaleIcon(10),
                                            justifyContent: 'center',
                                            width: '48%',
                                            minWidth: scaleIcon(190),
                                            flexGrow: 1,
                                        }}
                                    >
                                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '800' }}>{name}</Text>
                                    </View>
                                ))}
                            </View>
                            {mode === 'add_missing' && previewNames.length === 0 && (
                                <Text accessibilityRole="alert" style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '800', marginTop: scaleIcon(14) }}>
                                    This area already has every enabled canonical starter card.
                                </Text>
                            )}
                        </>
                    )}
                </ThemedCard>

                {!!message && (
                    <ThemedCard style={{ marginTop: scaleIcon(14), borderColor: completedAreaName ? theme.colors.primary : theme.colors.border }}>
                        <Text accessibilityRole="alert" style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '800', lineHeight: scaleFont(20) }}>{message}</Text>
                    </ThemedCard>
                )}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10), marginTop: scaleIcon(18) }}>
                    <ThemedButton
                        title="Cancel"
                        variant="secondary"
                        disabled={saving}
                        onPress={() => router.back()}
                        style={{ flexGrow: 1, minWidth: scaleIcon(150), minHeight: scaleIcon(50) }}
                    />
                    {completedAreaName ? (
                        <ThemedButton
                            title="Open Area"
                            onPress={openCompletedArea}
                            style={{ flexGrow: 1, minWidth: scaleIcon(190), minHeight: scaleIcon(50) }}
                        />
                    ) : loading || !loadedContext || !plan ? (
                        <ThemedButton
                            title={loading ? 'Checking…' : 'Try Again'}
                            disabled={loading}
                            onPress={() => void loadPreview({ preserveTarget: true })}
                            style={{ flexGrow: 1, minWidth: scaleIcon(190), minHeight: scaleIcon(50) }}
                        />
                    ) : (
                        <ThemedButton
                            title={saving ? 'Saving…' : actionTitle}
                            disabled={saving || (mode === 'add_missing' && previewNames.length === 0)}
                            onPress={() => void saveAction()}
                            style={{ flexGrow: 1, minWidth: scaleIcon(220), minHeight: scaleIcon(50) }}
                        />
                    )}
                </View>
            </View>
        </ScrollView>
    );
}

function decodeParam(value?: string | string[] | null) {
    const raw = Array.isArray(value) ? value[0] : value;
    const text = String(raw || '').trim();
    if (!text) return '';
    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
}

function normalize(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
