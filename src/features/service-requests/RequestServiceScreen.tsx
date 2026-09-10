import ServiceRequestMediaGallery from '@/components/serviceRequests/ServiceRequestMediaGallery';
import ServiceRequestThread from '@/components/serviceRequests/ServiceRequestThread';
import { loadCustomerIntake, saveCustomerIntake, submitCustomerIntake, intakeReasonLabel, type CustomerIntake } from '@/lib/customerCallIntake';
import type { CreatedServiceRequestReceipt } from '@/lib/homeServiceRequests';
import DictationTextInput from '@/components/input/DictationTextInput';
import HomeHeader from '@/components/HomeHeader';
import {
    AreaContainer,
    EquipmentContainer,
    MainDestinationCard,
} from '@/components/homeos/HomeOSVisualFoundation';
import { resolveHomeOSEquipmentVisual } from '@/components/homeos/homeos-visual-assets';
import ServiceRequestMediaPicker from '@/components/serviceRequests/ServiceRequestMediaPicker';
import ThemedButton from '@/components/theme/ThemedButton';
import ThemedCard from '@/components/theme/ThemedCard';
import { activePropertyErrorMessage, selectActiveProperty } from '@/lib/activeProperty';
import {
    createHomeownerServiceRequest,
    ensureHomeEmergencyForServiceRequest,
    formatServiceRequestReference,
} from '@/lib/homeServiceRequests';
import {
    loadHomePropertyCollection,
    type HomePropertySummary,
} from '@/lib/homePropertyCollection';
import {
    classifyPropertyArea,
    isDirectPropertyAreaItem,
    normalizePropertyAreaName,
    visibleRootAreasForScope,
} from '@/lib/propertyAreas';
import { loadPreferredProviderForProperty, type PreferredProvider } from '@/lib/preferredProviders';
import {
    hasUnresolvedServiceRequestMedia,
    loadServiceRequestAttachments,
    uploadPendingServiceRequestMedia,
    type ServiceRequestMediaDraft,
} from '@/lib/serviceRequestMedia';
import {
    createServiceRequestPhoneHandoff,
    finishServiceRequestPhoneHandoff,
    loadPhoneHandoffMediaAsDrafts,
    loadOwnedPhoneHandoffDrafts,
    mergePhoneHandoffDrafts,
    type ServiceRequestPhoneHandoff,
} from '@/lib/serviceRequestPhoneHandoff';
import {
    broadcastServiceRequestRefresh,
    companyServiceRequestTopic,
} from '@/lib/serviceRequestRealtime';
import { supabase } from '@/lib/supabase';
import { getHomeOSVisualFoundation } from '@/theme/homeos-visual-foundation';
import { useTheme } from '@/theme/useTheme';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

type SelectionStep = 'property' | 'scope' | 'area' | 'item' | 'details';
type AreaScope = 'interior' | 'exterior';

type RequestHomeItem = {
    id: string;
    property_id: string;
    item_slug: string | null;
    name: string | null;
    category: string | null;
    system: string | null;
    location: string | null;
    parent_area: string | null;
    parent_home_item_id: string | null;
    area_scope: string | null;
    area_placement_state: string | null;
    archived: boolean | null;
    status: string | null;
    condition: string | null;
    brand: string | null;
    model: string | null;
    serial: string | null;
    part_number: string | null;
    install_date: string | null;
    starter_template_key: string | null;
    placement_label: string | null;
    photo_url: string | null;
};

const itemSelect = 'id, property_id, item_slug, name, category, system, location, parent_area, parent_home_item_id, area_scope, area_placement_state, archived, status, condition, brand, model, serial, part_number, install_date, starter_template_key, placement_label, photo_url';

export default function RequestServiceScreen() {
    const routeParams = useLocalSearchParams<{
        propertyId?: string | string[];
        itemId?: string | string[];
        intakeId?: string | string[];
    }>();
    const requestedIntakeId = firstParam(routeParams.intakeId);
    const [intake, setIntake] = useState<CustomerIntake | null>(null);
    const [createdRequest, setCreatedRequest] = useState<CreatedServiceRequestReceipt | null>(null);
    const createdRequestRef = useRef<CreatedServiceRequestReceipt | null>(null);
    const sendInFlight = useRef(false);
    const [submitted, setSubmitted] = useState(false);
    const [locationDescription, setLocationDescription] = useState('');
    const [installHelp, setInstallHelp] = useState(false);
    const [draftSaved, setDraftSaved] = useState(false);
    const requestedPropertyId = firstParam(routeParams.propertyId);
    const requestedItemId = firstParam(routeParams.itemId);
    const { scaleFont, scaleIcon, theme } = useTheme();
    const { width: viewportWidth } = useWindowDimensions();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const contentWidth = Math.min(Math.max(viewportWidth - foundation.spacing.comfortable * 2, 0), 960);
    const cardGap = foundation.grid.gap;
    const wideCardWidth = viewportWidth < 720 ? contentWidth : Math.min(460, (contentWidth - cardGap) / 2);
    const compactCardWidth = viewportWidth < 620 ? contentWidth : Math.min(280, (contentWidth - cardGap * 2) / 3);
    const [step, setStep] = useState<SelectionStep>('property');
    const [properties, setProperties] = useState<HomePropertySummary[]>([]);
    const [selectedProperty, setSelectedProperty] = useState<HomePropertySummary | null>(null);
    const [propertyId, setPropertyId] = useState('');
    const [provider, setProvider] = useState<PreferredProvider | null>(null);
    const [refreshingProvider, setRefreshingProvider] = useState(false);
    const providerRefreshVersion = useRef(0);
    const [items, setItems] = useState<RequestHomeItem[]>([]);
    const [scope, setScope] = useState<AreaScope | null>(null);
    const [selectedArea, setSelectedArea] = useState<RequestHomeItem | null>(null);
    const [selectedItem, setSelectedItem] = useState<RequestHomeItem | null>(null);
    const [directItemEntry, setDirectItemEntry] = useState(false);
    const [requestType, setRequestType] = useState<'regular' | 'emergency'>('regular');
    const [issue, setIssue] = useState('');
    const [accessInstructions, setAccessInstructions] = useState('');
    const [media, setMedia] = useState<ServiceRequestMediaDraft[]>([]);
    const [phoneHandoff, setPhoneHandoff] = useState<ServiceRequestPhoneHandoff | null>(null);
    const [startingPhoneHandoff, setStartingPhoneHandoff] = useState(false);
    const [loading, setLoading] = useState(true);
    const [openingPropertyId, setOpeningPropertyId] = useState('');
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState('');
    const openPropertyEvent = useEffectEvent(openProperty);

    useEffect(() => {
        let current = true;

        async function load() {
            setLoading(true);
            setIntake(null); setCreatedRequest(null); createdRequestRef.current = null; setSubmitted(false);
            try {
                const collection = await loadHomePropertyCollection();
                if (!current) return;
                setProperties(collection.properties);
                if (requestedIntakeId) {
                    const call = await loadCustomerIntake({ intakeId: requestedIntakeId });
                    if (!current) return;
                    if (!call || !call.property_id || !call.contact_confirmed_at) throw new Error('Open the company invitation to confirm your information and address.');
                    const home = collection.properties.find(property => property.propertyId === call.property_id);
                    if (!home) throw new Error('The service address is not available in this account.');
                    await selectActiveProperty(home.propertyId);
                    if (!current) return;
                    setIntake(call); setSelectedProperty(home); setPropertyId(home.propertyId);
                    setProvider({ companyId: call.company_id, companyName: call.company_name });
                    setIssue(call.customer_draft.issue || call.customer_summary);
                    setAccessInstructions(call.customer_draft.accessInstructions || '');
                    setLocationDescription(call.customer_draft.location || '');
                    setRequestType(call.urgency === 'emergency' ? 'emergency' : call.customer_draft.requestType || call.urgency);
                    setStep('details');
                    let savedPhotoIds = new Set<string>();
                    if (call.service_request_id) {
                        const receipt = await submitCustomerIntake(call.id, '', call.urgency, '');
                        if (!current) return;
                        createdRequestRef.current = receipt; setCreatedRequest(receipt); setSubmitted(Boolean(call.media_completed_at));
                        if (!call.media_completed_at) {
                            const savedPhotos = await loadServiceRequestAttachments(receipt.id);
                            savedPhotoIds = new Set(savedPhotos.map(photo => photo.id));
                        }
                    }
                    if (!call.media_completed_at && call.phone_handoff_ids?.length) {
                        const restored = await loadOwnedPhoneHandoffDrafts(call.phone_handoff_ids);
                        if (current) setMedia(restored.filter(photo => !savedPhotoIds.has(photo.localId.replace(/^phone-/, ''))));
                    }
                    return;
                }


                if (requestedPropertyId && requestedItemId) {
                    const requestedProperty = collection.properties.find((property) => property.propertyId === requestedPropertyId);
                    if (requestedProperty) {
                        await openPropertyEvent(requestedProperty, requestedItemId, current);
                    } else {
                        setMessage('That item is not part of an available property. Choose a home to continue.');
                    }
                }
            } catch (error) {
                if (current) setMessage(activePropertyErrorMessage(error));
            } finally {
                if (current) setLoading(false);
            }
        }

        void load();
        return () => { current = false; };
    }, [requestedItemId, requestedPropertyId, requestedIntakeId]);

    useEffect(() => {
        if (!intake || submitted) return;
        let current = true;
        setDraftSaved(false);
        const timeout = setTimeout(() => {
            void saveCustomerIntake(intake.id, { draft: { issue, accessInstructions, location: locationDescription, requestType } })
                .then(() => { if (current) setDraftSaved(true); })
                .catch(() => { if (current) setMessage('Your latest draft could not be saved. Keep this page open and retry when connected.'); });
        }, 800);
        return () => { current = false; clearTimeout(timeout); };
    }, [intake, issue, accessInstructions, locationDescription, requestType, submitted]);

    const areas = useMemo(() => {
        if (!scope) return [];
        return visibleRootAreasForScope(
            items.filter((item) => normalizePropertyAreaName(item.category) === 'area'),
            scope,
        ) as RequestHomeItem[];
    }, [items, scope]);

    const areaItems = useMemo(() => {
        if (!selectedArea) return [];
        return items.filter((item) => (
            !item.archived
            && isDirectPropertyAreaItem(item, selectedArea.name || '', selectedArea.parent_area || '')
        ));
    }, [items, selectedArea]);

    const itemInformation = useMemo(() => equipmentInformation(selectedItem), [selectedItem]);
    const phoneHandoffUrl = useMemo(() => phoneHandoff
        ? buildPhoneHandoffUrl(phoneHandoff)
        : '', [phoneHandoff]);

    useEffect(() => {
        if (!phoneHandoff) return;
        let current = true;
        async function refresh() {
            try {
                const phoneItems = await loadPhoneHandoffMediaAsDrafts(phoneHandoff!);
                if (!current) return;
                setMedia(existing => mergePhoneHandoffDrafts(existing, phoneItems));
            } catch (error) {
                if (current) setMessage(error instanceof Error ? error.message : 'Phone media could not be refreshed.');
            }
        }
        void refresh();
        const interval = setInterval(() => void refresh(), 2500);
        return () => { current = false; clearInterval(interval); };
    }, [phoneHandoff]);

    async function openProperty(property: HomePropertySummary, directItemId = '', current = true) {
        if (openingPropertyId) return;
        providerRefreshVersion.current += 1;
        setRefreshingProvider(false);
        setOpeningPropertyId(property.propertyId);
        setMessage('');

        try {
            const [, preferred, itemResult] = await Promise.all([
                selectActiveProperty(property.propertyId),
                loadPreferredProviderForProperty(property.propertyId),
                supabase
                    .from('home_items')
                    .select(itemSelect)
                    .eq('property_id', property.propertyId)
                    .or('archived.eq.false,archived.is.null')
                    .order('name'),
            ]);
            if (itemResult.error) throw itemResult.error;
            if (!current) return;

            const nextItems = (itemResult.data || []) as RequestHomeItem[];
            setSelectedProperty(property);
            setPropertyId(property.propertyId);
            setProvider(preferred);
            setItems(nextItems);
            setScope(null);
            setSelectedArea(null);
            setSelectedItem(null);

            if (directItemId) {
                const directItem = nextItems.find((item) => item.id === directItemId);
                if (directItem) {
                    const directArea = findItemArea(nextItems, directItem);
                    setSelectedItem(directItem);
                    setSelectedArea(directArea);
                    setScope(directArea && classifyPropertyArea(directArea) === 'exterior' ? 'exterior' : 'interior');
                    setDirectItemEntry(true);
                    setStep('details');
                    return;
                }
                setMessage('The selected item could not be found. Choose its location below.');
            }

            setDirectItemEntry(false);
            setStep('scope');
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
        } finally {
            if (current) setOpeningPropertyId('');
        }
    }

    function chooseScope(nextScope: AreaScope) {
        setScope(nextScope);
        setSelectedArea(null);
        setSelectedItem(null);
        setMessage('');
        setStep('area');
    }

    function chooseArea(area: RequestHomeItem) {
        setSelectedArea(area);
        setSelectedItem(null);
        setMessage('');
        setStep('item');
    }

    function chooseItem(item: RequestHomeItem) {
        setSelectedItem(item);
        setDirectItemEntry(false);
        setMessage('');
        setStep('details');
    }

    function goBack() {
        setMessage('');
        if (intake) return router.replace(`/customer-invite?code=${encodeURIComponent(intake.invite_code)}` as never);
        if (step === 'details' && directItemEntry) return router.back();
        if (step === 'details') return setStep('item');
        if (step === 'item') return setStep('area');
        if (step === 'area') return setStep('scope');
        if (step === 'scope') return setStep('property');
        router.back();
    }

    async function startPhoneHandoff() {
        if (!propertyId || startingPhoneHandoff) return;
        setStartingPhoneHandoff(true);
        setMessage('');
        try {
            const context = [selectedProperty?.name, selectedArea?.name, selectedItem?.name].filter(Boolean).join(' › ') || 'Service request';
            const handoff = await createServiceRequestPhoneHandoff(propertyId, context);
            if (intake) {
                const result = await supabase.rpc('link_my_customer_intake_phone', { p_intake_id: intake.id, p_handoff_id: handoff.id });
                if (result.error) throw result.error;
            }
            setPhoneHandoff(handoff);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not start phone photo capture.');
        } finally {
            setStartingPhoneHandoff(false);
        }
    }

    async function send() {
        if (sendInFlight.current || submitted) return;
        const summary = issue.trim();
        if (!provider || !propertyId) return setMessage('Choose a service provider before sending a request.');
        if (!summary) return setMessage('Briefly describe the issue before continuing.');
        if (hasUnresolvedServiceRequestMedia(media)) return setMessage('Wait for the current photo or video action to finish.');
        sendInFlight.current = true;
        setSending(true);
        setMessage('Sending service request...');

        try {
            const location = [selectedProperty?.name, scope ? titleCase(scope) : '', selectedArea?.name, selectedItem?.name]
                .filter(Boolean)
                .join(' > ');
            const equipmentContext = selectedItem
                ? ` Item information: ${itemInformation.length ? itemInformation.map((field) => `${field.label}: ${field.value}`).join('; ') : 'No information yet.'}`
                : '';
            const request = createdRequestRef.current || (intake
                ? await submitCustomerIntake(intake.id, [locationDescription, summary].filter(Boolean).join(': '), requestType, accessInstructions)
                : await createHomeownerServiceRequest({
                propertyId,
                companyId: provider.companyId,
                requestType,
                priority: requestType === 'emergency' ? 'emergency' : 'normal',
                issueSummary: `${location ? `${location}: ` : ''}${summary}${equipmentContext}`,
                accessInstructions,
            }));
            createdRequestRef.current = request;
            setCreatedRequest(request);
            if (requestType === 'emergency') await ensureHomeEmergencyForServiceRequest(request.id);
            if (media.length) {
                await uploadPendingServiceRequestMedia({
                    companyId: request.companyId,
                    propertyId: request.propertyId,
                    serviceRequestId: request.id,
                    items: media,
                    onItemChange: (localId, updates) => setMedia((current) => current.map((item) => (
                        item.localId === localId ? { ...item, ...updates } : item
                    ))),
                });
            }
            if (phoneHandoff) {
                await finishServiceRequestPhoneHandoff(phoneHandoff, media);
                setPhoneHandoff(null);
            }
            void broadcastServiceRequestRefresh(companyServiceRequestTopic(request.companyId), {
                reason: 'homeowner_request_created',
                serviceRequestId: request.id,
            });
            if (intake) {
                const result = await supabase.rpc('finish_my_customer_intake', { p_intake_id: intake.id });
                if (result.error) throw result.error;
            }
            setSubmitted(true);
            setMessage(`Service request sent. ${formatServiceRequestReference(request)}.`);
        } catch (error) {
            setMessage(createdRequestRef.current
                ? `Your request is saved. Some photos or finishing steps need a retry: ${error instanceof Error ? error.message : 'Please retry.'}`
                : error instanceof Error ? `Could not send service request: ${error.message}` : 'Could not send service request.');
        } finally {
            sendInFlight.current = false;
            setSending(false);
        }
    }

    async function refreshProvider() {
        if (!propertyId || refreshingProvider) return;
        const version = ++providerRefreshVersion.current;
        setRefreshingProvider(true);
        try {
            const connectedProvider = await loadPreferredProviderForProperty(propertyId);
            if (version !== providerRefreshVersion.current) return;
            setProvider(connectedProvider);
            setMessage(connectedProvider
                ? `Your request will be sent to ${connectedProvider.companyName}.`
                : 'The inviting company is not connected to this home yet. Finish the company invitation, then refresh the provider here. Your description and photos will stay on this form.');
        } catch (error) {
            if (version === providerRefreshVersion.current) setMessage(error instanceof Error ? error.message : 'Could not refresh the provider. Please retry.');
        } finally {
            if (version === providerRefreshVersion.current) setRefreshingProvider(false);
        }
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
                padding: foundation.spacing.comfortable,
                paddingBottom: scaleIcon(42),
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 960, gap: foundation.spacing.regular }}>
                {!intake && <HomeHeader />}
                <ThemedButton
                    title={step === 'property' ? '‹ Back to HomeOS' : '‹ Back'}
                    variant="secondary"
                    onPress={goBack}
                    style={{ alignSelf: 'flex-start' }}
                />
                <View style={{ gap: foundation.spacing.compact }}>
                    <Text selectable style={[foundation.typography.label, { color: theme.colors.primary, textTransform: 'uppercase' }]}>Request Service</Text>
                    <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30), lineHeight: scaleFont(36) }]}>{submitted ? 'Your request is sent' : intake ? 'Tell us what needs service' : 'Where is the issue?'}</Text>
                    <Text selectable style={foundation.typography.body}>{stepDescription(step, selectedProperty, selectedArea)}</Text>
                </View>

                {step === 'property' ? (
                    loading ? (
                        <ThemedCard style={{ alignItems: 'center', gap: foundation.spacing.compact, padding: foundation.spacing.comfortable }}>
                            <ActivityIndicator color={theme.colors.primary} />
                            <Text style={foundation.typography.body}>Loading your properties...</Text>
                        </ThemedCard>
                    ) : (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: cardGap }}>
                            {properties.map((property) => (
                                <MainDestinationCard
                                    key={property.propertyId}
                                    title={property.name}
                                    description={property.address || 'HomeOS property'}
                                    visual={{ source: require('../../../assets/homeos/destinations/home.png') }}
                                    fallbackIcon="🏠"
                                    visualContentFit="contain"
                                    actionLabel={openingPropertyId === property.propertyId ? 'Opening...' : 'Choose this home'}
                                    disabled={Boolean(openingPropertyId)}
                                    onPress={() => void openProperty(property)}
                                    accessibilityLabel={`Choose ${property.name}`}
                                    style={{ width: wideCardWidth, minWidth: wideCardWidth, maxWidth: wideCardWidth }}
                                />
                            ))}
                            {properties.length === 0 ? (
                                <ThemedCard style={{ width: '100%', gap: foundation.spacing.compact }}>
                                    <Text style={foundation.typography.containerTitle}>No properties available</Text>
                                    <Text style={foundation.typography.body}>Add a property to HomeOS before requesting service.</Text>
                                </ThemedCard>
                            ) : null}
                        </View>
                    )
                ) : null}

                {step === 'scope' ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: cardGap }}>
                        <MainDestinationCard
                            title="Interior"
                            description="Rooms and areas inside this home."
                            actionLabel="Choose Interior"
                            onPress={() => chooseScope('interior')}
                            style={{ width: wideCardWidth, minWidth: wideCardWidth, maxWidth: wideCardWidth }}
                        />
                        <MainDestinationCard
                            title="Exterior"
                            description="Yards, roof, pool, and outdoor areas."
                            actionLabel="Choose Exterior"
                            onPress={() => chooseScope('exterior')}
                            style={{ width: wideCardWidth, minWidth: wideCardWidth, maxWidth: wideCardWidth }}
                        />
                    </View>
                ) : null}

                {step === 'area' ? (
                    areas.length ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: cardGap }}>
                            {areas.map((area) => (
                                <AreaContainer
                                    key={area.id}
                                    title={area.name || 'Area'}
                                    subtitle={area.parent_area ? `Located in ${area.parent_area}` : undefined}
                                    onPress={() => chooseArea(area)}
                                    accessibilityLabel={`Choose ${area.name || 'area'}`}
                                    style={{ width: compactCardWidth, minWidth: compactCardWidth, maxWidth: compactCardWidth }}
                                />
                            ))}
                        </View>
                    ) : (
                        <ThemedCard style={{ gap: foundation.spacing.compact }}>
                            <Text style={foundation.typography.containerTitle}>No {scope} areas yet</Text>
                            <Text style={foundation.typography.body}>Add the area to HomeOS first, or continue without choosing an item.</Text>
                            <ThemedButton title="Continue without an item" onPress={() => setStep('details')} />
                        </ThemedCard>
                    )
                ) : null}

                {step === 'item' ? (
                    <View style={{ gap: foundation.spacing.regular }}>
                        {areaItems.length ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: cardGap }}>
                                {areaItems.map((item) => (
                                    <EquipmentContainer
                                        key={item.id}
                                        title={item.name || 'Home item'}
                                        semanticIdentity={item.starter_template_key || undefined}
                                        detail={[item.category, item.status].filter(Boolean).join(' · ') || 'No information yet'}
                                        visual={resolveHomeOSEquipmentVisual(item.photo_url)}
                                        onPress={() => chooseItem(item)}
                                        accessibilityLabel={`Request service for ${item.name || 'home item'}`}
                                        style={{ width: compactCardWidth, minWidth: compactCardWidth, maxWidth: compactCardWidth }}
                                    />
                                ))}
                            </View>
                        ) : (
                            <ThemedCard style={{ gap: foundation.spacing.compact }}>
                                <Text style={foundation.typography.containerTitle}>No fixtures or equipment stored here yet</Text>
                                <Text style={foundation.typography.body}>You can still describe the issue for this area.</Text>
                            </ThemedCard>
                        )}
                        <ThemedButton
                            title="I don’t see the item"
                            variant="secondary"
                            onPress={() => { setSelectedItem(null); setStep('details'); }}
                            style={{ alignSelf: 'flex-start' }}
                        />
                    </View>
                ) : null}

                {step === 'details' && !submitted ? (
                    <ThemedCard style={{ gap: foundation.spacing.regular }}>
                        <Text style={foundation.typography.containerTitle}>
                            {[selectedProperty?.name, selectedArea?.name, selectedItem?.name].filter(Boolean).join(' › ') || 'Service request'}
                        </Text>
                        {intake ? <Text style={foundation.typography.label}>{intakeReasonLabel(intake.service_reason)} · {intake.company_name}</Text> : null}
                        {selectedItem ? (
                            <View style={{ gap: foundation.spacing.compact }}>
                                <Text style={[foundation.typography.label, { color: theme.colors.primary }]}>ITEM INFORMATION SENT WITH THIS REQUEST</Text>
                                {itemInformation.length ? itemInformation.map((field) => (
                                    <Text key={field.label} style={foundation.typography.body}>{field.label}: {field.value}</Text>
                                )) : (
                                    <Text style={foundation.typography.body}>No information yet.</Text>
                                )}
                            </View>
                        ) : null}
                        <Text style={foundation.typography.label}>Provider: {provider?.companyName || 'Not selected'}</Text>
                        {!provider ? (
                            <View style={{ gap: foundation.spacing.compact }}>
                                <Text style={foundation.typography.body}>The company connection must finish before this request can be sent.</Text>
                                <ThemedButton title={refreshingProvider ? 'Checking connection...' : 'Refresh provider'} variant="secondary" disabled={refreshingProvider || sending} onPress={() => void refreshProvider()} />
                            </View>
                        ) : null}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: cardGap }}>
                            <ThemedButton title="Regular" variant={requestType === 'regular' ? 'primary' : 'secondary'} disabled={sending || intake?.urgency === 'emergency'} onPress={() => setRequestType('regular')} />
                            <ThemedButton title="Emergency" variant={requestType === 'emergency' ? 'primary' : 'secondary'} onPress={() => setRequestType('emergency')} />
                        </View>
                        {intake ? <DictationTextInput value={locationDescription} onChangeText={setLocationDescription} placeholder="Where is the problem? (for example: upstairs bathroom)" style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, color: theme.colors.text }} /> : null}
                        <DictationTextInput
                            value={issue}
                            onChangeText={setIssue}
                            multiline
                            placeholder="What is happening, and when did it start?"
                            placeholderTextColor={theme.colors.mutedText}
                            style={{ minHeight: 96, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.card, padding: 12, color: theme.colors.text, textAlignVertical: 'top' }}
                        />
                        <DictationTextInput
                            dictationEnabled={false}
                            value={accessInstructions}
                            onChangeText={(value) => setAccessInstructions(value.slice(0, 1000))}
                            secureTextEntry
                            placeholder="Gate code, parking, pets or access instructions (optional)"
                            placeholderTextColor={theme.colors.mutedText}
                            style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.card, padding: 12, color: theme.colors.text }}
                        />
                        {intake && <Text style={foundation.typography.body}>{draftSaved ? 'Draft saved. You can return through your invitation.' : 'Saving your draft...'}</Text>}
                        {requestType === 'emergency' && <Text style={foundation.typography.body}>For immediate danger, move to safety and contact emergency services. Do not wait for an app reply.</Text>}
                        <ServiceRequestMediaPicker items={media} disabled={sending} onChange={setMedia} onMessage={setMessage} />
                        <ThemedCard style={{ gap: foundation.spacing.compact, backgroundColor: theme.colors.surfaceAlt }}>
                            <Text style={foundation.typography.containerTitle}>Using another device?</Text>
                            <Text style={foundation.typography.body}>Take photos on your phone and they will appear here automatically. No app download is required.</Text>
                            {!phoneHandoff ? (
                                <ThemedButton
                                    title={startingPhoneHandoff ? 'Starting...' : 'Use my phone'}
                                    variant="secondary"
                                    disabled={sending || startingPhoneHandoff}
                                    onPress={() => void startPhoneHandoff()}
                                    style={{ alignSelf: 'flex-start' }}
                                />
                            ) : (
                                <View style={{ flexDirection: viewportWidth < 620 ? 'column' : 'row', gap: foundation.spacing.regular, alignItems: 'center' }}>
                                    <View style={{ padding: scaleIcon(12), backgroundColor: '#FFFFFF', borderRadius: theme.radii.card }}>
                                        <QRCode value={phoneHandoffUrl} size={Math.min(scaleIcon(184), 184)} backgroundColor="#FFFFFF" color="#071E33" />
                                    </View>
                                    <View style={{ flex: 1, gap: foundation.spacing.compact }}>
                                        <Text style={foundation.typography.body}>Scan this code with your phone camera. This private link expires in 15 minutes.</Text>
                                        <ThemedButton title="Open phone page on this device" variant="secondary" onPress={() => void Linking.openURL(phoneHandoffUrl)} />
                                        <ThemedButton title="Start a new phone link" variant="secondary" onPress={() => void startPhoneHandoff()} />
                                    </View>
                                </View>
                            )}
                        </ThemedCard>
                        {!provider ? <Text style={foundation.typography.body}>Waiting for your company connection. Use Refresh provider above after the invitation is connected.</Text> : null}
                        <ThemedButton
                            title={sending ? 'Sending...' : createdRequest ? 'Retry remaining photos / videos' : requestType === 'emergency' ? 'Request Emergency Service' : 'Request Service'}
                            disabled={sending || !provider || !issue.trim() || hasUnresolvedServiceRequestMedia(media)}
                            onPress={() => void send()}
                        />
                    </ThemedCard>
                ) : null}

                {submitted && createdRequest ? <ThemedCard style={{ gap: 14 }}>
                    <Text style={foundation.typography.containerTitle}>{formatServiceRequestReference(createdRequest)} sent</Text>
                    <Text style={foundation.typography.body}>The office has received your request. Keep this page for messages and updates. Sending a request does not confirm an arrival time.</Text>
                    <ServiceRequestMediaGallery serviceRequestId={createdRequest.id} />
                    <ServiceRequestThread companyId={createdRequest.companyId} serviceRequestId={createdRequest.id} viewer="homeowner" title="Messages with your service team" />
                    {intake && <ThemedButton title="Set up my password" variant="secondary" onPress={() => router.push({ pathname: '/profile/change-password', params: { first: '1', next: `/request-service?propertyId=${propertyId}&intakeId=${intake.id}` } } as never)} />}
                    <ThemedButton title="Add HomeOS to this device (optional)" variant="secondary" onPress={() => setInstallHelp(value => !value)} />
                    {installHelp && <Text style={foundation.typography.body}>Use your browser menu to look for Install app or Add to Home Screen. You can also bookmark HomeOS and continue using it here.</Text>}
                    <ThemedButton title="Continue to HomeOS" variant="secondary" onPress={() => router.replace('/' as never)} />
                    <Text style={foundation.typography.body}>You can keep using your browser and finish your home setup later.</Text>
                </ThemedCard> : null}

                {!!message ? (
                    <ThemedCard>
                        <Text style={{ color: message.startsWith('Could not') ? theme.colors.danger : theme.colors.mutedText, lineHeight: 20 }}>{message}</Text>
                    </ThemedCard>
                ) : null}
            </View>
        </ScrollView>
    );
}

function findItemArea(items: RequestHomeItem[], item: RequestHomeItem) {
    const areaNames = [item.parent_area, item.location].map(normalizePropertyAreaName).filter(Boolean);

    return items.find((candidate) => (
        normalizePropertyAreaName(candidate.category) === 'area'
        && areaNames.includes(normalizePropertyAreaName(candidate.name))
    )) || null;
}

function equipmentInformation(item: RequestHomeItem | null) {
    if (!item) return [];

    return [
        { label: 'Type', value: cleanInformation(item.category) },
        { label: 'System', value: cleanInformation(item.system) },
        { label: 'Location', value: cleanInformation(item.placement_label || item.location || item.parent_area) },
        { label: 'Brand', value: cleanInformation(item.brand) },
        { label: 'Model', value: cleanInformation(item.model) },
        { label: 'Serial', value: cleanInformation(item.serial) },
        { label: 'Part number', value: cleanInformation(item.part_number) },
        { label: 'Status', value: cleanInformation(item.status || item.condition) },
        { label: 'Install date', value: cleanInformation(item.install_date) },
    ].filter((field): field is { label: string; value: string } => Boolean(field.value));
}

function cleanInformation(value?: string | null) {
    const clean = String(value || '').trim();
    return clean && !['unknown', 'missing information'].includes(clean.toLowerCase()) ? clean : '';
}

function stepDescription(step: SelectionStep, property: HomePropertySummary | null, area: RequestHomeItem | null) {
    if (step === 'property') return 'Choose the property that needs service.';
    if (step === 'scope') return `Choose whether the issue is inside or outside ${property?.name || 'this home'}.`;
    if (step === 'area') return 'Choose the actual area stored in this HomeOS.';
    if (step === 'item') return `Choose the actual fixture or equipment in ${area?.name || 'this area'}.`;
    return 'Describe the problem and send the selected HomeOS information to your service provider.';
}

function firstParam(value?: string | string[]) {
    return String(Array.isArray(value) ? value[0] || '' : value || '').trim();
}

function titleCase(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildPhoneHandoffUrl(handoff: ServiceRequestPhoneHandoff) {
    const path = `/request-service-phone?id=${encodeURIComponent(handoff.id)}&token=${encodeURIComponent(handoff.token)}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}${path}`;
    const publicAppUrl = String(process.env.EXPO_PUBLIC_APP_URL || 'https://barbarosa-v2.vercel.app').replace(/\/+$/, '');
    return `${publicAppUrl}${path}`;
}
