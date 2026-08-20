import DictationTextInput from '@/components/input/DictationTextInput';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { resolveHomeOSEquipmentFallbackIcon } from '../../components/homeos/homeos-visual-assets';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import CompactHomeOSCard from './compact-homeos-card';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import { getSystemDefinition, getSystemLabel, homeSystemOptions } from '../../lib/homeSystems';
import {
    createItemCategories,
    getGenericItemSuggestions,
    getItemSuggestions,
} from '../../lib/itemSuggestions';
import { getSystemDefaults, normalizeAreaName } from '../../lib/systemDefaults';
import {
    providerModeItemPath,
    providerModeQueryParams,
    readProviderModeParams,
} from '../../lib/providerMode';
import {
    buildProviderHomeItemCreateRpcArgs,
    buildProviderHomeItemsRpcArgs,
    createProviderHomeOSStarterItemFromDeck,
    getProviderHomeItemCreateRpcName,
    getProviderHomeItemCreateStrategy,
    getProviderHomeItemsReadStrategy,
    getProviderHomeItemsRpcName,
    type ProviderHomeItemRpcRow,
} from '../../lib/providerHomeItems';
import {
    loadHomeOSStarterCardChoices,
    type HomeOSStarterCardChoice,
} from '../../lib/homeosStarterCatalog';
import {
    filterHomeOSStarterCardChoices,
    homeOSStarterCardGroupLabel,
    homeOSStarterCardGroups,
} from '../../lib/homeosStarterCardPickerCore';
import {
    filterHomeOSContainerStarterCardChoices,
    propertyAreaRoutePath,
} from '../../lib/propertyAreaContainerDeck';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

const categories = createItemCategories;
const OTHER_HOME_SYSTEM = 'Other / Home';
const CUSTOM_SYSTEM_CHOICE = '__custom_system__';
const CUSTOM_CATEGORY_LABEL = 'Other / Custom';
const CUSTOM_CATEGORY_CHOICE = '__custom_category__';
const extraCategories = ['Storage', 'Safety'];
const installStates = ['Unknown', 'Installed', 'Missing', 'Not Applicable'];
const statuses = ['Missing Information', 'Not Inspected', 'Good', 'Needs Attention', 'Emergency'];
const placementLabelSuggestions = [
    'Left wall',
    'Right wall',
    'Center',
    'Near tub',
    'Near shower',
    'Near entry',
    'Water-closet alcove',
    'Custom',
];

declare const __DEV__: boolean;

type Choice = {
    value: string;
    label: string;
};

type ExistingHomeItem = {
    name: string | null;
    system: string | null;
    category: string | null;
    location: string | null;
    parent_area: string | null;
};

const categoryOptionValues = uniqueOptions([...categories, ...extraCategories], CUSTOM_CATEGORY_LABEL);

function makeSlug(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

export default function CreateItemScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();

    function scaleStyle<T extends Record<string, any>>(style: T): T {
        const fontKeys = new Set(['fontSize', 'lineHeight']);
        const iconKeys = new Set([
            'padding',
            'paddingTop',
            'paddingBottom',
            'paddingVertical',
            'paddingHorizontal',
            'marginTop',
            'marginBottom',
            'marginVertical',
            'marginHorizontal',
            'gap',
            'rowGap',
            'columnGap',
            'width',
            'height',
            'minWidth',
            'minHeight',
            'borderRadius',
        ]);

        const scaledStyle: Record<string, any> = { ...style };

        Object.entries(style).forEach(([key, value]) => {
            if (typeof value !== 'number') return;

            if (fontKeys.has(key)) {
                scaledStyle[key] = scaleFont(value);
            }

            if (iconKeys.has(key)) {
                scaledStyle[key] = scaleIcon(value);
            }
        });

        return scaledStyle as T;
    }
    const params = useLocalSearchParams<{
        system?: string;
        area?: string;
        parentArea?: string;
        parentItemId?: string;
        parentItemSlug?: string;
        templateKey?: string;
        additionalInstance?: string;
        areaReturnTo?: string;
        category?: string;
        name?: string;
        rootItem?: string;
        deckPicker?: string;
        containerMode?: string | string[];
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const providerModeContext = readProviderModeParams(params);
    const initialSystem = decodeParam(params.system) || 'Plumbing';
    const initialArea = decodeParam(params.area);
    const initialParentArea = decodeParam(params.parentArea).trim();
    const initialParentItemId = decodeParam(params.parentItemId).trim();
    const initialParentItemSlug = decodeParam(params.parentItemSlug).trim();
    const initialTemplateKey = decodeParam(params.templateKey).trim();
    const isAdditionalInstance = sameItemText(decodeParam(params.additionalInstance), '1');
    const areaReturnTo = decodeParam(params.areaReturnTo).trim();
    const isRootSystemItem = sameItemText(decodeParam(params.rootItem), 'true');
    const isContainerMode = sameItemText(decodeParam(params.containerMode), 'true');
    const openDeckPickerInitially = isContainerMode || sameItemText(decodeParam(params.deckPicker), 'true');
    const hasAreaContext = !!initialSystem && !!initialArea;
    const initialCategoryParam = typeof params.category === 'string' ? params.category.trim() : '';
    const initialCategory = initialCategoryParam
        ? categoryOptionValues.includes(initialCategoryParam)
            ? initialCategoryParam === CUSTOM_CATEGORY_LABEL
                ? CUSTOM_CATEGORY_CHOICE
                : initialCategoryParam
            : CUSTOM_CATEGORY_CHOICE
        : 'Equipment';
    const initialCustomCategory = initialCategory === CUSTOM_CATEGORY_CHOICE && initialCategoryParam !== CUSTOM_CATEGORY_LABEL
        ? initialCategoryParam
        : '';
    const initialName = decodeParam(params.name);
    const hasInitialSystemSelection = typeof params.system === 'string' && !!params.system;
    const hasInitialCategorySelection = !!initialCategoryParam;

    const [name, setName] = useState(initialName);
    const [system, setSystem] = useState(initialSystem);
    const [category, setCategory] = useState(initialCategory);
    const [customSystem, setCustomSystem] = useState('');
    const [customCategory, setCustomCategory] = useState(initialCustomCategory);
    const [isSystemSelected, setIsSystemSelected] = useState(hasInitialSystemSelection || hasAreaContext);
    const [isCategorySelected, setIsCategorySelected] = useState(hasInitialCategorySelection);
    const [isSystemOpen, setIsSystemOpen] = useState(!hasInitialSystemSelection && !hasAreaContext);
    const [isCategoryOpen, setIsCategoryOpen] = useState(
        (hasInitialSystemSelection || hasAreaContext) && !hasInitialCategorySelection
    );

    const [locationChoice, setLocationChoice] = useState(initialArea || '');
    const [customLocation, setCustomLocation] = useState('');

    const [installState, setInstallState] = useState('Unknown');
    const [status, setStatus] = useState('Missing Information');
    const [about, setAbout] = useState('');
    const [placementLabelChoice, setPlacementLabelChoice] = useState('');
    const [customPlacementLabel, setCustomPlacementLabel] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [deckCards, setDeckCards] = useState<HomeOSStarterCardChoice[]>([]);
    const [deckLoading, setDeckLoading] = useState(true);
    const [deckMessage, setDeckMessage] = useState('');
    const [deckPickerOpen, setDeckPickerOpen] = useState(openDeckPickerInitially);
    const [deckQuery, setDeckQuery] = useState('');
    const [deckGroup, setDeckGroup] = useState('all');
    const [selectedDeckCard, setSelectedDeckCard] = useState<HomeOSStarterCardChoice | null>(null);
    const [deckReloadKey, setDeckReloadKey] = useState(0);

    useEffect(() => {
        if (initialName && !name.trim()) {
            setName(initialName);
        }
    }, [initialName, name]);
    useEffect(() => {
        let current = true;
        setDeckLoading(true);
        void requireActivePropertyMembership({
            propertyIdOverride: providerModeContext?.propertyId,
            companyId: providerModeContext?.companyId,
        })
            .then((activeProperty) => loadHomeOSStarterCardChoices({
                companyId: providerModeContext?.companyId,
                propertyId: activeProperty.propertyId,
                serviceRequestId: providerModeContext?.serviceRequestId,
                scheduleSlotId: providerModeContext?.scheduleSlotId,
                jobId: providerModeContext?.jobId,
            }))
            .then((cards) => {
                if (!current) return;
                setDeckCards(cards);
                setDeckMessage('');
            })
            .catch((error) => {
                if (!current) return;
                setDeckCards([]);
                setDeckMessage(`Could not load the HomeOS Deck: ${unknownErrorMessage(error)}`);
            })
            .finally(() => {
                if (current) setDeckLoading(false);
            });
        return () => { current = false; };
    }, [
        deckReloadKey,
        providerModeContext?.companyId,
        providerModeContext?.jobId,
        providerModeContext?.propertyId,
        providerModeContext?.scheduleSlotId,
        providerModeContext?.serviceRequestId,
    ]);
    const selectedSystemValue = system === CUSTOM_SYSTEM_CHOICE
        ? customSystem.trim() || OTHER_HOME_SYSTEM
        : system;
    const selectedCategoryValue = category === CUSTOM_CATEGORY_CHOICE
        ? customCategory.trim() || CUSTOM_CATEGORY_LABEL
        : category;
    const systemDefaults = useMemo(() => getSystemDefaults(selectedSystemValue), [selectedSystemValue]);
    const areaOptions = useMemo(
        () => uniqueOptions([...systemDefaults.areas, initialArea].filter(Boolean), 'Custom'),
        [systemDefaults.areas, initialArea]
    );
    const genericItemSuggestions = getGenericItemSuggestions(systemDefaults, selectedCategoryValue);
    const itemSuggestions = getItemSuggestions({
        area: initialArea || locationChoice,
        system: selectedSystemValue,
        category: selectedCategoryValue,
        fallbackSuggestions: genericItemSuggestions,
    });
    const selectedSystemLabel = system === CUSTOM_SYSTEM_CHOICE
        ? customSystem.trim() || 'Custom'
        : getSystemLabel(system);
    const selectedCategoryLabel = category === CUSTOM_CATEGORY_CHOICE
        ? customCategory.trim() || CUSTOM_CATEGORY_LABEL
        : category;
    const systemChoices = uniqueChoiceOptions([
        ...homeSystemOptions.map((option) => ({
            value: option.key,
            label: option.label,
        })),
        { value: OTHER_HOME_SYSTEM, label: OTHER_HOME_SYSTEM },
        { value: CUSTOM_SYSTEM_CHOICE, label: 'Custom' },
    ]);
    const categoryChoices = categoryOptionValues.map((option) => ({
        value: option === CUSTOM_CATEGORY_LABEL ? CUSTOM_CATEGORY_CHOICE : option,
        label: option,
    }));
    const locationChoices = areaOptions.map((option) => ({ value: option, label: option }));
    const suggestionChoices = itemSuggestions.map((option) => ({ value: option, label: option }));
    const installStateChoices = installStates.map((option) => ({ value: option, label: option }));
    const statusChoices = statuses.map((option) => ({ value: option, label: option }));
    const showCategoryStep = isSystemSelected;
    const showItemSections = isCategorySelected;
    const showOptionalDetails = showItemSections && !!name.trim();
    const availableDeckCards = useMemo(
        () => isContainerMode
            ? filterHomeOSContainerStarterCardChoices(deckCards, {
                areaName: initialArea,
                parentAreaName: initialParentArea,
            })
            : deckCards,
        [deckCards, initialArea, initialParentArea, isContainerMode]
    );
    const deckGroups = homeOSStarterCardGroups(availableDeckCards);
    const visibleDeckCards = filterHomeOSStarterCardChoices(availableDeckCards, deckQuery, deckGroup);

    function chooseSystem(nextSystem: string) {
        const isCustomSystem = nextSystem === CUSTOM_SYSTEM_CHOICE;
        setSystem(nextSystem);
        setSelectedDeckCard(null);
        setLocationChoice(hasAreaContext ? initialArea : '');
        setCustomLocation('');
        if (!isCustomSystem) {
            setCustomSystem('');
        }
        setIsSystemSelected(true);
        setIsSystemOpen(isCustomSystem);
        setIsCategorySelected(false);
        setIsCategoryOpen(true);
    }

    function chooseCategory(nextCategory: string) {
        setSelectedDeckCard(null);
        if (nextCategory !== CUSTOM_CATEGORY_CHOICE) {
            setCustomCategory('');
        }
        setCategory(nextCategory);
        setIsCategorySelected(true);
        setIsCategoryOpen(nextCategory === CUSTOM_CATEGORY_CHOICE);
    }

    function chooseDeckCard(card: HomeOSStarterCardChoice) {
        const nextSystem = getSystemDefinition(card.system)?.key || card.system;
        const nextCategory = categoryOptionValues.includes(card.category) ? card.category : CUSTOM_CATEGORY_CHOICE;

        setSelectedDeckCard(card);
        setName(card.name);
        setSystem(nextSystem);
        setCustomSystem('');
        setIsSystemSelected(true);
        setIsSystemOpen(false);
        setCategory(nextCategory);
        setCustomCategory(nextCategory === CUSTOM_CATEGORY_CHOICE ? card.category : '');
        setIsCategorySelected(true);
        setIsCategoryOpen(false);
        setInstallState('Unknown');
        setStatus('Missing Information');
        setAbout('');
        setDeckPickerOpen(false);
        setMessage(`${card.name} will be added to ${initialArea || finalLocation()}. No installed product facts or physical location beyond this selected container are assumed.`);
    }

    function finalSystem() {
        if (system === CUSTOM_SYSTEM_CHOICE) return customSystem.trim();
        return system.trim();
    }

    function finalCategory() {
        if (category === CUSTOM_CATEGORY_CHOICE) return customCategory.trim();
        return category.trim();
    }

    function finalLocation() {
        if (locationChoice === 'Custom') return customLocation.trim();
        return locationChoice;
    }

    function finalAreaLocation() {
        if (hasAreaContext) return initialArea;
        return finalLocation();
    }

    function finalParentArea() {
        if (hasAreaContext) return initialParentArea;
        return '';
    }

    function finalPlacementLabel() {
        if (placementLabelChoice === 'Custom') return customPlacementLabel.trim();
        return placementLabelChoice.trim();
    }

    async function saveItem() {
        if (isContainerMode && !selectedDeckCard) {
            setMessage('Choose an existing top-level container from the HomeOS Deck. New container archetypes require a separate catalog release.');
            return;
        }

        if (!name.trim()) {
            setMessage('Enter item name.');
            return;
        }

        if (!finalSystem()) {
            setMessage('Enter a custom system name or choose a system.');
            return;
        }

        if (!finalCategory()) {
            setMessage('Enter a custom category name or choose a category.');
            return;
        }

        if (!hasAreaContext && !finalLocation()) {
            setMessage('Choose the item’s observed location. Use Custom if the location is not listed.');
            return;
        }

        if (isAdditionalInstance && !finalPlacementLabel()) {
            setMessage('Choose a short placement label so this item is easy to recognize.');
            return;
        }

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership({
                propertyIdOverride: providerModeContext?.propertyId,
                companyId: providerModeContext?.companyId,
            });
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const itemName = name.trim();
        const savedLocation = finalAreaLocation();
        const savedParentArea = finalParentArea();
        const savedSystem = finalSystem();
        const savedCategory = finalCategory();
        const canonicalSystem = getSystemDefinition(savedSystem)?.key || savedSystem;
        const slug = makeManualItemSlug(savedLocation, canonicalSystem, itemName, savedParentArea);
        const insertPayload = {
            user_id: activeProperty.userId,
            property_id: activeProperty.propertyId,
            item_slug: slug,
            name: itemName,
            system: canonicalSystem,
            category: savedCategory,
            parent_area: savedParentArea,
            install_state: installState,
            status,
            location: savedLocation,
            about: about.trim(),
            brand: selectedDeckCard ? null : 'Unknown',
            model: selectedDeckCard ? null : 'Unknown',
            serial: selectedDeckCard ? null : 'Unknown',
            starter_template_key: selectedDeckCard?.templateKey || initialTemplateKey || null,
            parent_home_item_id: initialParentItemId || null,
            placement_label: finalPlacementLabel() || null,
            archived: false,
        };

        const providerReadStrategy = providerModeContext
            ? getProviderHomeItemsReadStrategy(providerModeContext, activeProperty.membershipRole)
            : null;
        const providerCreateStrategy = providerModeContext
            ? getProviderHomeItemCreateStrategy(providerModeContext, activeProperty.membershipRole)
            : null;

        if (providerModeContext && (providerReadStrategy === 'denied' || providerCreateStrategy === 'denied')) {
            setMessage('This company account can add a HomeOS card only from an assigned request, visit, or job.');
            return;
        }

        setSaving(true);
        setMessage('Saving item...');

        const duplicateCheckResult = providerModeContext
            ? await supabase.rpc(
                getProviderHomeItemsRpcName(providerReadStrategy!),
                buildProviderHomeItemsRpcArgs(providerModeContext)
            )
            : await supabase
                .from('home_items')
                .select('name, system, category, location, parent_area')
                .eq('property_id', activeProperty.propertyId)
                .or('archived.eq.false,archived.is.null');
        const existingItems = duplicateCheckResult.data;
        const duplicateCheckError = duplicateCheckResult.error;

        if (duplicateCheckError) {
            console.error('Duplicate check failed', {
                message: duplicateCheckError.message,
                code: duplicateCheckError.code,
                details: duplicateCheckError.details,
                hint: duplicateCheckError.hint,
                propertyId: activeProperty.propertyId,
            });

            setSaving(false);
            setMessage(`Could not check existing items: ${duplicateCheckError.message}`);
            return;
        }

        const matchingAreaItem = ((existingItems || []) as ExistingHomeItem[]).some((item) =>
            isDuplicateItemInArea(item, canonicalSystem, savedLocation, savedParentArea, itemName)
        );

        if (matchingAreaItem) {
            setSaving(false);
            setMessage(getSameAreaDuplicateMessage(itemName));
            return;
        }

        logCreateItemDebug('insert payload', {
            category: insertPayload.category,
            hasAreaContext,
            system: insertPayload.system,
        });

        let error: unknown = null;
        let savedSlug = slug;

        if (providerModeContext && selectedDeckCard) {
            try {
                const created = await createProviderHomeOSStarterItemFromDeck(providerModeContext, {
                    templateKey: selectedDeckCard.templateKey,
                    location: insertPayload.location,
                    parentArea: insertPayload.parent_area,
                    parentHomeItemId: insertPayload.parent_home_item_id,
                    placementLabel: insertPayload.placement_label,
                }, providerCreateStrategy!);
                savedSlug = created.itemSlug || slug;
            } catch (createError) {
                error = createError;
            }
        } else if (providerModeContext) {
            const providerCreateResult = await supabase.rpc(
                getProviderHomeItemCreateRpcName(providerCreateStrategy!),
                buildProviderHomeItemCreateRpcArgs(providerModeContext, {
                    itemSlug: insertPayload.item_slug,
                    name: insertPayload.name,
                    system: insertPayload.system,
                    category: insertPayload.category,
                    location: insertPayload.location,
                    parentArea: insertPayload.parent_area,
                    status: insertPayload.status,
                    installState: insertPayload.install_state,
                    about: insertPayload.about,
                    brand: insertPayload.brand,
                    model: insertPayload.model,
                    serial: insertPayload.serial,
                    parentHomeItemId: insertPayload.parent_home_item_id,
                    placementLabel: insertPayload.placement_label,
                })
            );
            error = providerCreateResult.error;
            const createdProviderItem = ((providerCreateResult.data || []) as ProviderHomeItemRpcRow[])[0] || null;
            savedSlug = createdProviderItem?.item_slug || slug;
        } else {
            const insertResult = await supabase.from('home_items').insert(insertPayload);
            error = insertResult.error;
        }

        logCreateItemDebug('insert result', {
            ok: !error,
            errorCode: getPostgresErrorCode(error),
        });

        setSaving(false);

        if (error) {
            setMessage(selectedDeckCard
                ? `Could not add ${selectedDeckCard.name} from the HomeOS Deck: ${unknownErrorMessage(error)}`
                : getCreateItemErrorMessage(error, itemName));
            return;
        }

        if (initialParentItemSlug) {
            router.dismissTo({
                pathname: '/item/[slug]',
                params: {
                    slug: initialParentItemSlug,
                    presentation: 'assembly',
                    refresh: String(Date.now()),
                },
            } as any);
            return;
        }

        if (isContainerMode && hasAreaContext) {
            router.dismissTo(propertyAreaRoutePath({
                areaName: initialArea,
                parentAreaName: initialParentArea,
            }) as any);
            return;
        }

        if (isAdditionalInstance && areaReturnTo) {
            router.dismissTo(areaReturnTo as any);
            return;
        }

        if (isRootSystemItem) {
            router.replace({
                pathname: '/system/[system]',
                params: {
                    system: initialSystem,
                    ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
                },
            } as any);
            return;
        }

        if (hasAreaContext) {
            router.replace({
                pathname: '/system/[system]/area/[area]',
                params: {
                    system: initialSystem,
                    area: initialArea,
                    ...(initialParentArea ? { parentArea: initialParentArea } : {}),
                    refresh: String(Date.now()),
                    ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
                },
            } as any);
            return;
        }

        router.replace(providerModeContext ? providerModeItemPath(savedSlug, providerModeContext) : `/item/${savedSlug}` as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <HomeHeader />

                <Text style={[scaleStyle(titleStyle), { color: theme.colors.text }]}>
                    {isContainerMode ? 'Add Container' : 'Create Item'}
                </Text>

                <Text style={[scaleStyle(subtitleStyle), { color: theme.colors.mutedText }]}>
                    {isContainerMode
                        ? 'Choose one existing top-level HomeOS container for this exact area.'
                        : 'Add one home item at a time. Choose where it belongs, then fill in only what you know.'}
                </Text>

                {hasAreaContext && (
                    <ThemedCard style={scaleStyle(contextCardStyle)}>
                        <Text style={[scaleStyle(eyebrowStyle), { color: theme.colors.mutedText }]}>
                            {isContainerMode ? 'Adding container to' : 'Adding to'}
                        </Text>
                        <Text style={[scaleStyle(contextTitleStyle), { color: theme.colors.text }]}>
                            {initialArea}
                        </Text>
                        <Text style={[scaleStyle(contextMetaStyle), { color: theme.colors.mutedText }]}>
                            {initialParentArea
                                ? `${getSystemLabel(initialSystem)} / ${initialParentArea}`
                                : getSystemLabel(initialSystem)}
                        </Text>
                    </ThemedCard>
                )}

                {isAdditionalInstance && (
                    <ThemedCard style={scaleStyle(formCardStyle)}>
                        <Text style={[scaleStyle(eyebrowStyle), { color: theme.colors.mutedText }]}>RECOGNIZE THIS ONE</Text>
                        <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Where is this item in the area?</Text>
                        <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>Choose a short placement label. For Left or Right, stand at the room entry and look in.</Text>
                        <ChoiceCardGrid
                            accessibilityLabel="Placement label"
                            choices={placementLabelSuggestions.map((label) => ({ value: label, label }))}
                            value={placementLabelChoice}
                            onChange={setPlacementLabelChoice}
                        />
                        {placementLabelChoice === 'Custom' && (
                            <ThemedInput
                                label="Custom Placement Label"
                                placeholder="Near the makeup counter"
                                value={customPlacementLabel}
                                onChangeText={setCustomPlacementLabel}
                            />
                        )}
                    </ThemedCard>
                )}

                <ThemedCard style={scaleStyle(formCardStyle)}>
                    <Text style={[scaleStyle(eyebrowStyle), { color: theme.colors.mutedText }]}>HomeOS Deck</Text>
                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>
                        {isContainerMode ? 'Containers' : 'Add a standard HomeOS card'}
                    </Text>
                    <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>
                        {isContainerMode
                            ? 'This area’s Deck shows existing top-level container choices only. It excludes component, Electrical, and Safety cards and adds no installed product facts.'
                            : 'Search the master Deck and add one generic card directly to this area or container. This adds no catalog product, installed brand/model, service history, or unverified location.'}
                    </Text>
                    {selectedDeckCard && !deckPickerOpen ? (
                        <View style={{ gap: scaleIcon(10), marginTop: scaleIcon(12) }}>
                            <CompactHomeOSCard
                                title={selectedDeckCard.name}
                                subtitle={[selectedDeckCard.shortCode, selectedDeckCard.system, selectedDeckCard.category].filter(Boolean).join(' · ')}
                                icon={resolveHomeOSEquipmentFallbackIcon(selectedDeckCard.name)}
                                onOpen={() => setDeckPickerOpen(true)}
                                actionTitle="Change Deck Card"
                                onAction={() => setDeckPickerOpen(true)}
                                style={{ width: '100%', maxWidth: scaleIcon(250), alignSelf: 'flex-start' }}
                            />
                            <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>Placement selected here: {initialArea || finalLocation()}{initialParentArea ? ` inside ${initialParentArea}` : ''}.</Text>
                        </View>
                    ) : (
                        <ThemedButton
                            title={deckPickerOpen
                                ? `Hide ${isContainerMode ? 'Container' : 'HomeOS'} Deck`
                                : deckLoading
                                    ? 'Loading HomeOS Deck...'
                                    : isContainerMode
                                        ? 'Choose a Container'
                                        : 'Search HomeOS Deck'}
                            variant="secondary"
                            disabled={deckLoading}
                            onPress={() => setDeckPickerOpen((current) => !current)}
                            style={{ marginTop: scaleIcon(12), alignSelf: 'flex-start' }}
                        />
                    )}
                    {!!deckMessage && (
                        <View style={{ gap: scaleIcon(8), alignItems: 'flex-start', marginTop: scaleIcon(10) }}>
                            <Text accessibilityRole="alert" style={[scaleStyle(messageTextStyle), { color: theme.colors.mutedText }]}>{deckMessage}</Text>
                            <ThemedButton
                                title="Retry HomeOS Deck"
                                variant="secondary"
                                onPress={() => setDeckReloadKey((current) => current + 1)}
                            />
                        </View>
                    )}
                    {deckPickerOpen && !deckLoading && (
                        <View style={{ gap: scaleIcon(12), marginTop: scaleIcon(14) }}>
                            <ThemedInput
                                label={isContainerMode ? 'Search Containers' : 'Search HomeOS Deck'}
                                placeholder={isContainerMode
                                    ? 'Vanity, sink, dishwasher, water heater...'
                                    : 'Smart water, shower valve, faucet, S01...'}
                                value={deckQuery}
                                onChangeText={setDeckQuery}
                            />
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8) }}>
                                <DeckGroupChip label={isContainerMode ? 'All Containers' : 'All Deck Cards'} selected={deckGroup === 'all'} onPress={() => setDeckGroup('all')} />
                                {deckGroups.map((group) => <DeckGroupChip key={group.key} label={`${group.label} (${group.count})`} selected={deckGroup === group.key} onPress={() => setDeckGroup(group.key)} />)}
                            </View>
                            <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>Deck groups describe the archetype’s master taxonomy only. You choose its actual home location here.</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10), alignItems: 'stretch' }}>
                                {visibleDeckCards.slice(0, 80).map((card) => (
                                    <CompactHomeOSCard
                                        key={card.templateKey}
                                        title={card.name}
                                        subtitle={[card.shortCode, homeOSStarterCardGroupLabel(card.roomKind)].filter(Boolean).join(' · ')}
                                        icon={resolveHomeOSEquipmentFallbackIcon(card.name)}
                                        onOpen={() => chooseDeckCard(card)}
                                        actionTitle="Add This Card"
                                        onAction={() => chooseDeckCard(card)}
                                    />
                                ))}
                            </View>
                            {!visibleDeckCards.length && (
                                <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>
                                    {isContainerMode
                                        ? 'No existing top-level HomeOS Deck containers match this area or search. New container archetypes require a separate additive catalog release.'
                                        : 'No HomeOS Deck cards match this search.'}
                                </Text>
                            )}
                        </View>
                    )}
                </ThemedCard>

                {!isContainerMode && (
                    <StepCard
                        step="1"
                        title="System"
                        summary={isSystemSelected && !isSystemOpen ? selectedSystemLabel : undefined}
                        onEdit={() => setIsSystemOpen(true)}
                    >
                        {isSystemOpen && (
                            <>
                                <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>
                                    Pick the home system this item belongs to.
                                </Text>
                                <ChoiceCardGrid
                                    accessibilityLabel="Home system"
                                    choices={systemChoices}
                                    value={isSystemSelected ? system : ''}
                                    onChange={chooseSystem}
                                />
                                {system === CUSTOM_SYSTEM_CHOICE && (
                                    <>
                                        <ThemedInput
                                            label="Custom System Name"
                                            placeholder="Home Storage"
                                            value={customSystem}
                                            onChangeText={setCustomSystem}
                                        />
                                        <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>
                                            Use Add Service first if this should appear on Home. Custom item systems stay inside the item unless a service exists.
                                        </Text>
                                    </>
                                )}
                            </>
                        )}
                    </StepCard>
                )}

                {!isContainerMode && showCategoryStep && (
                    <StepCard
                        step="2"
                        title="Category"
                        summary={isCategorySelected && !isCategoryOpen ? selectedCategoryLabel : undefined}
                        onEdit={() => setIsCategoryOpen(true)}
                    >
                        {isCategoryOpen && (
                            <>
                                <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>
                                    Choose the kind of item you are adding.
                                </Text>
                                <ChoiceCardGrid
                                    accessibilityLabel="Item category"
                                    choices={categoryChoices}
                                    value={isCategorySelected ? category : ''}
                                    onChange={chooseCategory}
                                />
                                {category === CUSTOM_CATEGORY_CHOICE && (
                                    <ThemedInput
                                        label="Custom Category Name"
                                        placeholder="Storage"
                                        value={customCategory}
                                        onChangeText={setCustomCategory}
                                    />
                                )}
                            </>
                        )}
                    </StepCard>
                )}

                {!isContainerMode && showItemSections && itemSuggestions.length > 0 && (
                    <ThemedCard style={scaleStyle(formCardStyle)}>
                        <Text style={[scaleStyle(eyebrowStyle), { color: theme.colors.mutedText }]}>Suggested {selectedCategoryLabel}</Text>
                        <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Common items</Text>
                        <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>
                            Tap one to fill the item name, or type your own below.
                        </Text>
                        <CustomItemChoice onPress={() => { setSelectedDeckCard(null); setName(''); }} />
                        <ChoiceCardGrid accessibilityLabel="Common item" choices={suggestionChoices} value={name} onChange={(nextName) => { setSelectedDeckCard(null); setName(nextName); }} />
                    </ThemedCard>
                )}

                {!isContainerMode && showItemSections && (
                    <ThemedCard style={scaleStyle(formCardStyle)}>
                        <Text style={[scaleStyle(eyebrowStyle), { color: theme.colors.mutedText }]}>Item Info</Text>
                        <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Name and notes</Text>

                        <ThemedInput
                            label="Item Name"
                            placeholder="Kitchen Faucet"
                            value={name}
                            onChangeText={(nextName) => { setSelectedDeckCard(null); setName(nextName); }}
                        />

                        <ThemedInput
                            label="About"
                            placeholder="Optional notes for the homeowner"
                            value={about}
                            onChangeText={setAbout}
                            minHeight={scaleIcon(116)}
                            multiline
                        />
                    </ThemedCard>
                )}

                {showOptionalDetails && (
                    <ThemedCard style={scaleStyle(formCardStyle)}>
                        <Text style={[scaleStyle(eyebrowStyle), { color: theme.colors.mutedText }]}>Optional Details</Text>
                        <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Condition and status</Text>

                        {!hasAreaContext && (
                            <>
                                <Text style={[scaleStyle(fieldLabelStyle), { color: theme.colors.text }]}>Location</Text>
                                <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>Choose the actual observed placement. HomeOS will not assume Garage, Front Yard, or another location.</Text>
                                <ChoiceCardGrid accessibilityLabel="Item location" choices={locationChoices} value={locationChoice} onChange={setLocationChoice} />

                                {locationChoice === 'Custom' && (
                                    <ThemedInput
                                        label="Custom Location"
                                        placeholder="Where is it?"
                                        value={customLocation}
                                        onChangeText={setCustomLocation}
                                    />
                                )}
                            </>
                        )}

                        <Text style={[scaleStyle(fieldLabelStyle), { color: theme.colors.text }]}>Condition</Text>
                        <ChoiceCardGrid accessibilityLabel="Item condition" choices={installStateChoices} value={installState} onChange={setInstallState} />

                        <Text style={[scaleStyle(fieldLabelStyle), { color: theme.colors.text }]}>Status</Text>
                        <ChoiceCardGrid accessibilityLabel="Item status" choices={statusChoices} value={status} onChange={setStatus} />
                    </ThemedCard>
                )}

                {showItemSections ? (
                    <ThemedButton
                        title={saving
                            ? 'Saving...'
                            : selectedDeckCard
                                ? `Add ${selectedDeckCard.name}`
                                : isContainerMode
                                    ? 'Save Container'
                                    : 'Save Item'}
                        onPress={saveItem}
                        disabled={saving}
                        style={scaleStyle(saveButtonStyle)}
                    />
                ) : (
                    <ThemedCard style={scaleStyle(nextStepCardStyle)}>
                        <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>
                            {isContainerMode
                                ? 'Choose one of the available containers from the HomeOS Deck to continue.'
                                : 'Choose a system and category to continue.'}
                        </Text>
                    </ThemedCard>
                )}

                {!!message && (
                    <ThemedCard style={{ marginTop: 8 }}>
                        <Text style={[scaleStyle(messageTextStyle), { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

function logCreateItemDebug(label: string, details: unknown) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.info(`[CreateItem] ${label}`, details);
    }
}

function unknownErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error) return String(error.message || 'Try again.');
    return String(error || 'Try again.');
}

function DeckGroupChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: scaleIcon(44), justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt, paddingHorizontal: scaleIcon(14), paddingVertical: scaleIcon(8) }}>
            <Text style={{ color: selected ? theme.colors.primaryText : theme.colors.text, fontSize: scaleFont(13), fontWeight: '900' }}>{label}</Text>
        </TouchableOpacity>
    );
}

function makeManualItemSlug(area: string, system: string, itemName: string, parentArea = '') {
    return makeSlug([parentArea, area, system, itemName].map((part) => part.trim()).filter(Boolean).join('-'));
}

function sameItemText(a?: string | null, b?: string | null) {
    return normalizeAreaName(a) === normalizeAreaName(b);
}

function isDuplicateItemInArea(
    item: ExistingHomeItem,
    systemName: string,
    areaName: string,
    parentArea: string,
    itemName: string
) {
    if (
        sameItemText(item.category, 'Area') ||
        !sameItemText(item.system, systemName) ||
        !sameItemText(item.name, itemName)
    ) {
        return false;
    }

    if (parentArea) {
        return sameItemText(item.location, areaName) && sameItemText(item.parent_area, parentArea);
    }

    return (
        sameItemText(item.location, areaName) &&
        (!String(item.parent_area || '').trim() || sameItemText(item.parent_area, areaName))
    ) || (!String(item.location || '').trim() && sameItemText(item.parent_area, areaName));
}

function getSameAreaDuplicateMessage(itemName: string) {
    return `An item with this exact name already exists in this area. Try ${nextItemName(itemName)}.`;
}

function getCreateItemErrorMessage(error: unknown, itemName: string) {
    if (isPostgresUniqueViolation(error)) {
        return `An item with this name already exists. Try ${nextItemName(itemName)}.`;
    }

    return 'Save failed. Please try again.';
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

function getPostgresErrorCode(error: unknown) {
    const code = (error as { code?: unknown } | null)?.code;

    return typeof code === 'string' ? code : null;
}

function isPostgresUniqueViolation(error: unknown) {
    return getPostgresErrorCode(error) === '23505';
}

function nextItemName(itemName: string) {
    const trimmedName = itemName.trim();
    const numberedName = trimmedName.match(/^(.*?)(?:\s+)(\d+)$/);

    if (!numberedName) return `${trimmedName} 2`;

    const baseName = numberedName[1].trim();
    const nextNumber = Number(numberedName[2]) + 1;

    return `${baseName} ${nextNumber}`;
}

function uniqueOptions(options: string[], finalOption: string) {
    const unique = options.filter((option, index, self) => option && self.indexOf(option) === index);

    return unique.includes(finalOption) ? unique : [...unique, finalOption];
}

function uniqueChoiceOptions(options: Choice[]) {
    const seen = new Set<string>();

    return options.filter((option) => {
        const key = option.value.trim().toLowerCase();

        if (!key || seen.has(key)) return false;

        seen.add(key);
        return true;
    });
}

function ThemedInput({
    value,
    onChangeText,
    placeholder,
    label,
    multiline,
    minHeight,
}: {
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    label?: string;
    multiline?: boolean;
    minHeight?: number;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View style={{ marginTop: scaleIcon(10), marginBottom: scaleIcon(16) }}>
            {!!label && (
                <Text style={[{ fontSize: scaleFont(16), fontWeight: '900', marginBottom: scaleIcon(10) }, { color: theme.colors.text }]}>
                    {label}
                </Text>
            )}
            <DictationTextInput
                placeholder={placeholder}
                placeholderTextColor={theme.colors.mutedText}
                value={value}
                onChangeText={onChangeText}
                multiline={multiline}
                style={{
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: theme.radii.button,
                    paddingVertical: scaleIcon(18),
                    paddingHorizontal: scaleIcon(18),
                    color: theme.colors.text,
                    fontSize: scaleFont(17),
                    lineHeight: multiline ? scaleFont(24) : undefined,
                    minHeight,
                    textAlignVertical: multiline ? 'top' : 'auto',
                }}
            />
        </View>
    );
}

function StepCard({
    step,
    title,
    summary,
    onEdit,
    children,
}: {
    step: string;
    title: string;
    summary?: string;
    onEdit: () => void;
    children?: ReactNode;
}) {
    const { theme } = useTheme();
    const hasSummary = !!summary;

    return (
        <ThemedCard style={formCardStyle}>
            <View style={stepHeaderStyle}>
                <View style={stepTitleRowStyle}>
                    <View style={[stepBadgeStyle, { backgroundColor: theme.colors.iconBackground }]}>
                        <Text style={[stepBadgeTextStyle, { color: theme.colors.text }]}>{step}</Text>
                    </View>
                    <Text style={[stepTitleStyle, { color: theme.colors.text }]}>{title}</Text>
                </View>

                {hasSummary && (
                    <TouchableOpacity onPress={onEdit} activeOpacity={0.82} style={changeButtonStyle}>
                        <Text style={[changeButtonTextStyle, { color: theme.colors.link }]}>Change</Text>
                    </TouchableOpacity>
                )}
            </View>

            {hasSummary && (
                <Text style={[stepSummaryStyle, { color: theme.colors.mutedText }]}>
                    {summary}
                </Text>
            )}

            {children}
        </ThemedCard>
    );
}

function CustomItemChoice({ onPress }: { onPress: () => void }) {
    const { theme } = useTheme();

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.82}
            style={[
                customItemChoiceStyle,
                {
                    backgroundColor: theme.colors.surfaceAlt,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.card,
                },
            ]}
        >
            <Text style={[customItemTitleStyle, { color: theme.colors.text }]}>Custom Item</Text>
            <Text style={[customItemSubtitleStyle, { color: theme.colors.mutedText }]}>
                Clear the name field and type your own item below.
            </Text>
        </TouchableOpacity>
    );
}

function ChoiceCardGrid({
    accessibilityLabel,
    choices,
    value,
    onChange,
}: {
    accessibilityLabel: string;
    choices: Choice[];
    value: string;
    onChange: (value: string) => void;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="radiogroup"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(12) }}
        >
            {choices.map((choice) => {
                const selected = value === choice.value;

                return (
                    <TouchableOpacity
                        accessibilityLabel={choice.label}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        key={choice.value}
                        onPress={() => onChange(choice.value)}
                        activeOpacity={0.82}
                        style={{
                            ...choiceCardStyle,
                            minWidth: scaleIcon(148),
                            minHeight: scaleIcon(72),
                            paddingVertical: scaleIcon(16),
                            paddingHorizontal: scaleIcon(16),
                            backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt,
                            borderRadius: theme.radii.card,
                            borderWidth: 1,
                            borderColor: selected ? theme.colors.primary : theme.colors.surfaceAlt,
                        }}
                    >
                        <Text
                            style={{
                                color: selected ? theme.colors.primaryText : theme.colors.mutedText,
                                fontSize: scaleFont(16),
                                fontWeight: '900',
                                lineHeight: scaleFont(21),
                            }}
                            numberOfLines={2}
                        >
                            {choice.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 17,
    lineHeight: 24,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginTop: 6,
    marginBottom: 10,
};

const formCardStyle = {
    marginBottom: 22,
};

const contextCardStyle = {
    marginBottom: 22,
};

const contextTitleStyle = {
    fontSize: 26,
    fontWeight: '900' as const,
    marginTop: 6,
};

const contextMetaStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    marginTop: 8,
};

const eyebrowStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const helperTextStyle = {
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 16,
};

const stepHeaderStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 12,
};

const stepTitleRowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    flex: 1,
};

const stepBadgeStyle = {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const stepBadgeTextStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};

const stepTitleStyle = {
    fontSize: 23,
    fontWeight: '900' as const,
};

const stepSummaryStyle = {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '800' as const,
};

const changeButtonStyle = {
    paddingVertical: 10,
    paddingHorizontal: 4,
};

const changeButtonTextStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const customItemChoiceStyle = {
    borderWidth: 1,
    marginBottom: 12,
    minHeight: 86,
    justifyContent: 'center' as const,
    paddingVertical: 18,
    paddingHorizontal: 18,
};

const customItemTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const customItemSubtitleStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 6,
};

const choiceCardStyle = {
    flexGrow: 1,
    flexBasis: '31%' as const,
    minWidth: 148,
    minHeight: 72,
    justifyContent: 'center' as const,
    paddingVertical: 16,
    paddingHorizontal: 16,
};

const fieldLabelStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    marginBottom: 10,
};

const saveButtonStyle = {
    marginTop: 4,
    marginBottom: 14,
    paddingVertical: 20,
};

const nextStepCardStyle = {
    marginTop: 4,
    marginBottom: 16,
};

const messageTextStyle = {
    fontSize: 14,
    lineHeight: 20,
};
