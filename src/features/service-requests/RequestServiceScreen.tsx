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
    uploadPendingServiceRequestMedia,
    type ServiceRequestMediaDraft,
} from '@/lib/serviceRequestMedia';
import {
    broadcastServiceRequestRefresh,
    companyServiceRequestTopic,
} from '@/lib/serviceRequestRealtime';
import { supabase } from '@/lib/supabase';
import { getHomeOSVisualFoundation } from '@/theme/homeos-visual-foundation';
import { useTheme } from '@/theme/useTheme';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';

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
    }>();
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
    const [items, setItems] = useState<RequestHomeItem[]>([]);
    const [scope, setScope] = useState<AreaScope | null>(null);
    const [selectedArea, setSelectedArea] = useState<RequestHomeItem | null>(null);
    const [selectedItem, setSelectedItem] = useState<RequestHomeItem | null>(null);
    const [directItemEntry, setDirectItemEntry] = useState(false);
    const [requestType, setRequestType] = useState<'regular' | 'emergency'>('regular');
    const [issue, setIssue] = useState('');
    const [accessInstructions, setAccessInstructions] = useState('');
    const [media, setMedia] = useState<ServiceRequestMediaDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [openingPropertyId, setOpeningPropertyId] = useState('');
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState('');
    const openPropertyEvent = useEffectEvent(openProperty);

    useEffect(() => {
        let current = true;

        async function load() {
            setLoading(true);
            try {
                const collection = await loadHomePropertyCollection();
                if (!current) return;
                setProperties(collection.properties);

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
    }, [requestedItemId, requestedPropertyId]);

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

    async function openProperty(property: HomePropertySummary, directItemId = '', current = true) {
        if (openingPropertyId) return;
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
        if (step === 'details' && directItemEntry) return router.back();
        if (step === 'details') return setStep('item');
        if (step === 'item') return setStep('area');
        if (step === 'area') return setStep('scope');
        if (step === 'scope') return setStep('property');
        router.back();
    }

    async function send() {
        const summary = issue.trim();
        if (!provider || !propertyId) return setMessage('Choose a service provider before sending a request.');
        if (!summary) return setMessage('Briefly describe the issue before continuing.');
        if (hasUnresolvedServiceRequestMedia(media)) return setMessage('Wait for the current photo or video action to finish.');
        setSending(true);
        setMessage('Sending service request...');

        try {
            const location = [selectedProperty?.name, scope ? titleCase(scope) : '', selectedArea?.name, selectedItem?.name]
                .filter(Boolean)
                .join(' > ');
            const equipmentContext = selectedItem
                ? ` Item information: ${itemInformation.length ? itemInformation.map((field) => `${field.label}: ${field.value}`).join('; ') : 'No information yet.'}`
                : '';
            const request = await createHomeownerServiceRequest({
                propertyId,
                companyId: provider.companyId,
                requestType,
                priority: requestType === 'emergency' ? 'emergency' : 'normal',
                issueSummary: `${location ? `${location}: ` : ''}${summary}${equipmentContext}`,
                accessInstructions,
            });
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
            void broadcastServiceRequestRefresh(companyServiceRequestTopic(request.companyId), {
                reason: 'homeowner_request_created',
                serviceRequestId: request.id,
            });
            setMessage(`Service request sent. ${formatServiceRequestReference(request)}.`);
        } catch (error) {
            setMessage(error instanceof Error ? `Could not send service request: ${error.message}` : 'Could not send service request.');
        } finally {
            setSending(false);
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
                <HomeHeader />
                <ThemedButton
                    title={step === 'property' ? '‹ Back to HomeOS' : '‹ Back'}
                    variant="secondary"
                    onPress={goBack}
                    style={{ alignSelf: 'flex-start' }}
                />
                <View style={{ gap: foundation.spacing.compact }}>
                    <Text selectable style={[foundation.typography.label, { color: theme.colors.primary, textTransform: 'uppercase' }]}>Request Service</Text>
                    <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30), lineHeight: scaleFont(36) }]}>Where is the issue?</Text>
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

                {step === 'details' ? (
                    <ThemedCard style={{ gap: foundation.spacing.regular }}>
                        <Text style={foundation.typography.containerTitle}>
                            {[selectedProperty?.name, selectedArea?.name, selectedItem?.name].filter(Boolean).join(' › ') || 'Service request'}
                        </Text>
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
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: cardGap }}>
                            <ThemedButton title="Regular" variant={requestType === 'regular' ? 'primary' : 'secondary'} onPress={() => setRequestType('regular')} />
                            <ThemedButton title="Emergency" variant={requestType === 'emergency' ? 'primary' : 'secondary'} onPress={() => setRequestType('emergency')} />
                        </View>
                        <DictationTextInput
                            value={issue}
                            onChangeText={setIssue}
                            multiline
                            placeholder="What is happening?"
                            placeholderTextColor={theme.colors.mutedText}
                            style={{ minHeight: 96, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.card, padding: 12, color: theme.colors.text, textAlignVertical: 'top' }}
                        />
                        <DictationTextInput
                            dictationEnabled={false}
                            value={accessInstructions}
                            onChangeText={(value) => setAccessInstructions(value.slice(0, 1000))}
                            secureTextEntry
                            placeholder="Gate code or access instructions (optional)"
                            placeholderTextColor={theme.colors.mutedText}
                            style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.card, padding: 12, color: theme.colors.text }}
                        />
                        <ServiceRequestMediaPicker items={media} disabled={sending} onChange={setMedia} onMessage={setMessage} />
                        <ThemedButton
                            title={sending ? 'Sending...' : requestType === 'emergency' ? 'Request Emergency Service' : 'Request Service'}
                            disabled={sending || !provider || hasUnresolvedServiceRequestMedia(media)}
                            onPress={() => void send()}
                        />
                    </ThemedCard>
                ) : null}

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
