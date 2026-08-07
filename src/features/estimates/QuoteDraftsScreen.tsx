import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { BUILD_DISPLAY } from '../../lib/appVersion';
import {
    archiveCompanyEstimateDraft,
    formatEstimateBuilderStep,
    listCompanyEstimateDrafts,
    type CompanyEstimateDraftSummary,
} from '../../lib/estimateBuilderDraft';
import {
    canUseCompanyEstimateWorkflow,
    loadCurrentCompanyEstimateAccess,
    type CompanyPermissionAccess,
} from '../../lib/companyPermissions';

export default function QuoteDraftsScreen() {
    const params = useLocalSearchParams<{
        companyId?: string | string[];
        propertyId?: string | string[];
        providerMode?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
        mode?: string | string[];
    }>();
    const requestedCompanyId = firstParam(params.companyId);
    const requestedPropertyId = firstParam(params.propertyId);
    const [access, setAccess] = useState<CompanyPermissionAccess | null>(null);
    const [drafts, setDrafts] = useState<CompanyEstimateDraftSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState('');
    const [message, setMessage] = useState('Loading quote drafts...');
    const routeParams = useMemo(() => compactParams(params as Record<string, unknown>), [params]);
    const loadDraftsEvent = useEffectEvent(loadDrafts);

    useEffect(() => {
        void loadDraftsEvent();
    }, [requestedCompanyId]);

    async function loadDrafts() {
        setLoading(true);

        const permission = await loadCurrentCompanyEstimateAccess({ companyId: requestedCompanyId || null });

        if (!permission.access || !canUseCompanyEstimateWorkflow(permission.access)) {
            setAccess(null);
            setDrafts([]);
            setMessage(permission.error || 'This work account is not authorized to create quotes.');
            setLoading(false);
            return;
        }

        setAccess(permission.access);

        try {
            const nextDrafts = await listCompanyEstimateDrafts(permission.access.companyId);
            setDrafts(nextDrafts);
            setMessage(nextDrafts.length > 0
                ? `${nextDrafts.length} retrievable quote draft${nextDrafts.length === 1 ? '' : 's'}.`
                : 'No saved quote drafts yet.'
            );
        } catch (error) {
            setDrafts([]);
            setMessage(`Quote drafts could not be loaded: ${readError(error)}`);
        } finally {
            setLoading(false);
        }
    }

    function openDraft(draft: CompanyEstimateDraftSummary) {
        router.push({
            pathname: '/estimate/workspace',
            params: compactParams({
                ...routeParams,
                estimateSessionId: draft.id,
                companyId: draft.companyId,
                propertyId: draft.propertyId,
                serviceRequestId: draft.serviceRequestId,
                scheduleSlotId: draft.scheduleSlotId,
                jobId: draft.jobId,
                providerMode: draft.source === 'provider_mode' ? '1' : null,
                mode: draft.source === 'techos' ? 'techos' : draft.source === 'management' ? 'management' : null,
                step: draft.currentBuilderStep,
            }),
        } as any);
    }

    function startQuote() {
        if (!access) return;

        if (requestedPropertyId) {
            router.push({
                pathname: '/estimate/workspace',
                params: compactParams({
                    ...routeParams,
                    companyId: access.companyId,
                    propertyId: requestedPropertyId,
                    step: 'work',
                }),
            } as any);
            return;
        }

        if (access.permissions.can_view_customers && access.permissions.can_manage_company_profile) {
            router.push(`/super-admin/company/${encodeURIComponent(access.companyId)}/clients` as any);
            return;
        }

        router.push({
            pathname: '/techos',
            params: { companyId: access.companyId },
        } as any);
    }

    function confirmDelete(draft: CompanyEstimateDraftSummary) {
        Alert.alert(
            `Delete ${draft.quoteNumber}?`,
            'This removes the draft from the active list. Finished and signed quotes are not affected.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete Draft',
                    style: 'destructive',
                    onPress: () => void deleteDraft(draft),
                },
            ]
        );
    }

    async function deleteDraft(draft: CompanyEstimateDraftSummary) {
        setDeletingId(draft.id);
        setMessage(`Deleting ${draft.quoteNumber}...`);

        try {
            await archiveCompanyEstimateDraft(draft.id);
            setDrafts((current) => current.filter((candidate) => candidate.id !== draft.id));
            setMessage(`${draft.quoteNumber} was removed from active drafts.`);
        } catch (error) {
            setMessage(`Draft could not be deleted: ${readError(error)}`);
        } finally {
            setDeletingId('');
        }
    }

    return (
        <ScrollView style={screenStyle} contentContainerStyle={contentStyle} contentInsetAdjustmentBehavior="automatic">
            <View style={shellStyle}>
                <HomeHeader />

                <View style={topRowStyle}>
                    <TouchableOpacity onPress={() => router.back()} style={secondaryButtonStyle}>
                        <Text style={secondaryButtonTextStyle}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={!access} onPress={startQuote} style={access ? primaryButtonStyle : mutedButtonStyle}>
                        <Text style={primaryButtonTextStyle}>{requestedPropertyId ? 'Create New Quote' : 'Choose Job / Customer'}</Text>
                    </TouchableOpacity>
                </View>

                <View style={heroStyle}>
                    <Text style={eyebrowStyle}>QUOTES & ESTIMATES</Text>
                    <Text style={titleStyle}>Saved quote drafts</Text>
                    <Text style={subtitleStyle}>
                        Every quote step is saved to the company workspace. Resume a draft on another visit or delete one you no longer need.
                    </Text>
                    <Text style={buildStyle}>{BUILD_DISPLAY}</Text>
                </View>

                <View style={messageStyle}>
                    <Text style={messageTextStyle}>{loading ? 'Loading quote drafts...' : message}</Text>
                </View>

                {!loading && access && drafts.length === 0 && (
                    <View style={emptyStyle}>
                        <Text style={emptyTitleStyle}>No quote drafts</Text>
                        <Text style={emptyTextStyle}>Open a TechOS job or customer home, then choose Create Estimate / Quote.</Text>
                        <TouchableOpacity onPress={startQuote} style={primaryButtonStyle}>
                            <Text style={primaryButtonTextStyle}>{requestedPropertyId ? 'Create New Quote' : 'Choose Job / Customer'}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={draftListStyle}>
                    {drafts.map((draft) => (
                        <View key={draft.id} style={draftCardStyle}>
                            <View style={draftHeaderStyle}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={quoteNumberStyle}>{draft.quoteNumber}</Text>
                                    <Text style={customerStyle} numberOfLines={2}>{draft.customerName}</Text>
                                </View>
                                <Text style={stepBadgeStyle}>{formatEstimateBuilderStep(draft.currentBuilderStep)}</Text>
                            </View>
                            {!!draft.customerAddress && <Text style={metaStyle}>{draft.customerAddress}</Text>}
                            {!!draft.issueSummary && <Text style={summaryStyle} numberOfLines={3}>{draft.issueSummary}</Text>}
                            <Text style={updatedStyle}>Saved {formatSavedTime(draft.updatedAt)}</Text>
                            <View style={actionRowStyle}>
                                <TouchableOpacity onPress={() => openDraft(draft)} style={primaryButtonStyle}>
                                    <Text style={primaryButtonTextStyle}>Resume Draft</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    disabled={deletingId === draft.id}
                                    onPress={() => confirmDelete(draft)}
                                    style={deleteButtonStyle}
                                >
                                    <Text style={deleteButtonTextStyle}>{deletingId === draft.id ? 'Deleting...' : 'Delete Draft'}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}

function compactParams(values: Record<string, unknown>) {
    return Object.entries(values).reduce<Record<string, string>>((result, [key, value]) => {
        const text = firstParam(value as string | string[] | undefined);
        if (text) result[key] = text;
        return result;
    }, {});
}

function firstParam(value?: string | string[]) {
    return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function formatSavedTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'recently';

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function readError(error: unknown) {
    return error instanceof Error ? error.message : 'HomeOS services are unavailable.';
}

const screenStyle = { flex: 1, backgroundColor: '#F3F6FA' } as const;
const contentStyle = { padding: 20, paddingBottom: 56, alignItems: 'center' as const };
const shellStyle = { width: '100%' as const, maxWidth: 920, gap: 18 };
const topRowStyle = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'space-between' as const, gap: 12 };
const heroStyle = { borderRadius: 24, backgroundColor: '#08263A', padding: 24, gap: 8 };
const eyebrowStyle = { color: '#67E8F9', fontSize: 13, fontWeight: '900' as const, letterSpacing: 1.1 };
const titleStyle = { color: '#FFFFFF', fontSize: 34, lineHeight: 39, fontWeight: '900' as const };
const subtitleStyle = { color: '#D6E8F1', fontSize: 17, lineHeight: 25, fontWeight: '600' as const };
const buildStyle = { color: '#8FB5C7', fontSize: 12, fontWeight: '700' as const };
const messageStyle = { borderRadius: 16, backgroundColor: '#E7F5FB', borderWidth: 1, borderColor: '#A8D5E5', padding: 14 };
const messageTextStyle = { color: '#244C5E', fontSize: 15, lineHeight: 21, fontWeight: '700' as const };
const emptyStyle = { borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7E0E7', padding: 24, gap: 12 };
const emptyTitleStyle = { color: '#102A3A', fontSize: 24, fontWeight: '900' as const };
const emptyTextStyle = { color: '#526B78', fontSize: 16, lineHeight: 23, fontWeight: '600' as const };
const draftListStyle = { gap: 14 };
const draftCardStyle = { borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD9E1', padding: 18, gap: 10 };
const draftHeaderStyle = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'flex-start' as const, gap: 10 };
const quoteNumberStyle = { color: '#08718A', fontSize: 16, lineHeight: 21, fontWeight: '900' as const, letterSpacing: 0.5 };
const customerStyle = { color: '#102A3A', fontSize: 23, lineHeight: 29, fontWeight: '900' as const };
const stepBadgeStyle = { color: '#2D5568', backgroundColor: '#E8F3F7', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, fontSize: 12, fontWeight: '900' as const };
const metaStyle = { color: '#536D7A', fontSize: 14, lineHeight: 20, fontWeight: '600' as const };
const summaryStyle = { color: '#294A59', fontSize: 15, lineHeight: 22, fontWeight: '700' as const };
const updatedStyle = { color: '#718793', fontSize: 12, fontWeight: '700' as const };
const actionRowStyle = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10, marginTop: 4 };
const primaryButtonStyle = { minHeight: 48, borderRadius: 14, backgroundColor: '#08718A', paddingHorizontal: 18, paddingVertical: 13, justifyContent: 'center' as const, alignItems: 'center' as const };
const mutedButtonStyle = { ...primaryButtonStyle, backgroundColor: '#98AAB3' };
const primaryButtonTextStyle = { color: '#FFFFFF', fontSize: 15, fontWeight: '900' as const };
const secondaryButtonStyle = { minHeight: 48, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#9AB0BC', paddingHorizontal: 18, paddingVertical: 13, justifyContent: 'center' as const, alignItems: 'center' as const };
const secondaryButtonTextStyle = { color: '#163C4E', fontSize: 15, fontWeight: '900' as const };
const deleteButtonStyle = { ...secondaryButtonStyle, borderColor: '#E5A5A5', backgroundColor: '#FFF2F2' };
const deleteButtonTextStyle = { color: '#A32929', fontSize: 15, fontWeight: '900' as const };
