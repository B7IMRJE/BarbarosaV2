import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
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
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

const categories = createItemCategories;
const installStates = ['Unknown', 'Installed', 'Missing', 'Not Applicable'];
const statuses = ['Missing Information', 'Not Inspected', 'Good', 'Needs Attention', 'Emergency'];

declare const __DEV__: boolean;

type Choice = {
    value: string;
    label: string;
};

type ExistingHomeItem = {
    name: string | null;
    category: string | null;
    location: string | null;
    parent_area: string | null;
};

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
        category?: string;
        name?: string;
    }>();
    const initialSystem = typeof params.system === 'string' ? params.system : 'Plumbing';
    const initialArea = typeof params.area === 'string' ? params.area : '';
    const initialParentArea = typeof params.parentArea === 'string' ? params.parentArea.trim() : '';
    const hasAreaContext = !!initialSystem && !!initialArea;
    const initialCategory = typeof params.category === 'string' && categories.includes(params.category)
        ? params.category
        : 'Equipment';
    const initialName = typeof params.name === 'string' ? params.name : '';
    const hasInitialSystemSelection = typeof params.system === 'string' && !!params.system;
    const hasInitialCategorySelection = typeof params.category === 'string' && categories.includes(params.category);

    const [name, setName] = useState(initialName);
    const [system, setSystem] = useState(initialSystem);
    const [category, setCategory] = useState(initialCategory);
    const [isSystemSelected, setIsSystemSelected] = useState(hasInitialSystemSelection || hasAreaContext);
    const [isCategorySelected, setIsCategorySelected] = useState(hasInitialCategorySelection);
    const [isSystemOpen, setIsSystemOpen] = useState(!hasInitialSystemSelection && !hasAreaContext);
    const [isCategoryOpen, setIsCategoryOpen] = useState(
        (hasInitialSystemSelection || hasAreaContext) && !hasInitialCategorySelection
    );

    const [locationChoice, setLocationChoice] = useState(initialArea || 'Garage');
    const [customLocation, setCustomLocation] = useState('');

    const [installState, setInstallState] = useState('Unknown');
    const [status, setStatus] = useState('Missing Information');
    const [about, setAbout] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const systemDefaults = useMemo(() => getSystemDefaults(system), [system]);
    const areaOptions = useMemo(
        () => uniqueOptions([...systemDefaults.areas, initialArea].filter(Boolean), 'Custom'),
        [systemDefaults.areas, initialArea]
    );
    const genericItemSuggestions = getGenericItemSuggestions(systemDefaults, category);
    const itemSuggestions = getItemSuggestions({
        area: initialArea || locationChoice,
        system,
        category,
        fallbackSuggestions: genericItemSuggestions,
    });
    const selectedSystemLabel = getSystemLabel(system);
    const systemChoices = homeSystemOptions.map((option) => ({
        value: option.key,
        label: option.label,
    }));
    const categoryChoices = categories.map((option) => ({ value: option, label: option }));
    const locationChoices = areaOptions.map((option) => ({ value: option, label: option }));
    const suggestionChoices = itemSuggestions.map((option) => ({ value: option, label: option }));
    const installStateChoices = installStates.map((option) => ({ value: option, label: option }));
    const statusChoices = statuses.map((option) => ({ value: option, label: option }));
    const showCategoryStep = isSystemSelected;
    const showItemSections = isCategorySelected;
    const showOptionalDetails = showItemSections && !!name.trim();

    function chooseSystem(nextSystem: string) {
        const nextDefaults = getSystemDefaults(nextSystem);
        const nextArea = nextDefaults.areas[0] || 'Custom';

        setSystem(nextSystem);
        setLocationChoice(nextArea);
        setCustomLocation('');
        setIsSystemSelected(true);
        setIsSystemOpen(false);
        setIsCategorySelected(false);
        setIsCategoryOpen(true);
    }

    function chooseCategory(nextCategory: string) {
        setCategory(nextCategory);
        setIsCategorySelected(true);
        setIsCategoryOpen(false);
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

    async function saveItem() {
        if (!name.trim()) {
            setMessage('Enter item name.');
            return;
        }

        if (!hasAreaContext && locationChoice === 'Custom' && !customLocation.trim()) {
            setMessage('Enter custom location or choose an existing one.');
            return;
        }

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
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
        const canonicalSystem = getSystemDefinition(system)?.key || system;
        const slug = makeManualItemSlug(savedLocation, canonicalSystem, itemName);
        const insertPayload = {
            user_id: activeProperty.userId,
            property_id: activeProperty.propertyId,
            item_slug: slug,
            name: itemName,
            system: canonicalSystem,
            category,
            parent_area: savedParentArea,
            install_state: installState,
            status,
            location: savedLocation,
            about: about.trim(),
            brand: 'Unknown',
            model: 'Unknown',
            serial: 'Unknown',
            archived: false,
        };

        setSaving(true);
        setMessage('Saving item...');

        const { data: existingItems, error: duplicateCheckError } = await supabase
            .from('home_items')
            .select('name, category, location, parent_area')
            .eq('property_id', activeProperty.propertyId)
            .or('archived.eq.false,archived.is.null');

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
            isDuplicateItemInArea(item, savedLocation, savedParentArea, itemName)
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

        const { error } = await supabase.from('home_items').insert(insertPayload);

        logCreateItemDebug('insert result', {
            ok: !error,
            errorCode: getPostgresErrorCode(error),
        });

        setSaving(false);

        if (error) {
            setMessage(getCreateItemErrorMessage(error, itemName));
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
                },
            } as any);
            return;
        }

        router.replace(`/item/${slug}` as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <HomeHeader />

                <Text style={[scaleStyle(titleStyle), { color: theme.colors.text }]}>Create Item</Text>

                <Text style={[scaleStyle(subtitleStyle), { color: theme.colors.mutedText }]}>
                    Add one home item at a time. Choose where it belongs, then fill in only what you know.
                </Text>

                {hasAreaContext && (
                    <ThemedCard style={scaleStyle(contextCardStyle)}>
                        <Text style={[scaleStyle(eyebrowStyle), { color: theme.colors.mutedText }]}>Adding to</Text>
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
                                choices={systemChoices}
                                value={isSystemSelected ? system : ''}
                                onChange={chooseSystem}
                            />
                        </>
                    )}
                </StepCard>

                {showCategoryStep && (
                    <StepCard
                        step="2"
                        title="Category"
                        summary={isCategorySelected && !isCategoryOpen ? category : undefined}
                        onEdit={() => setIsCategoryOpen(true)}
                    >
                        {isCategoryOpen && (
                            <>
                                <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>
                                    Choose the kind of item you are adding.
                                </Text>
                                <ChoiceCardGrid
                                    choices={categoryChoices}
                                    value={isCategorySelected ? category : ''}
                                    onChange={chooseCategory}
                                />
                            </>
                        )}
                    </StepCard>
                )}

                {showItemSections && itemSuggestions.length > 0 && (
                    <ThemedCard style={scaleStyle(formCardStyle)}>
                        <Text style={[scaleStyle(eyebrowStyle), { color: theme.colors.mutedText }]}>Suggested {category}</Text>
                        <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Common items</Text>
                        <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>
                            Tap one to fill the item name, or type your own below.
                        </Text>
                        <CustomItemChoice onPress={() => setName('')} />
                        <ChoiceCardGrid choices={suggestionChoices} value={name} onChange={setName} />
                    </ThemedCard>
                )}

                {showItemSections && (
                    <ThemedCard style={scaleStyle(formCardStyle)}>
                        <Text style={[scaleStyle(eyebrowStyle), { color: theme.colors.mutedText }]}>Item Info</Text>
                        <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Name and notes</Text>

                        <ThemedInput
                            label="Item Name"
                            placeholder="Kitchen Faucet"
                            value={name}
                            onChangeText={setName}
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
                                <ChoiceCardGrid choices={locationChoices} value={locationChoice} onChange={setLocationChoice} />

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
                        <ChoiceCardGrid choices={installStateChoices} value={installState} onChange={setInstallState} />

                        <Text style={[scaleStyle(fieldLabelStyle), { color: theme.colors.text }]}>Status</Text>
                        <ChoiceCardGrid choices={statusChoices} value={status} onChange={setStatus} />
                    </ThemedCard>
                )}

                {showItemSections ? (
                    <ThemedButton
                        title={saving ? 'Saving...' : 'Save Item'}
                        onPress={saveItem}
                        disabled={saving}
                        style={scaleStyle(saveButtonStyle)}
                    />
                ) : (
                    <ThemedCard style={scaleStyle(nextStepCardStyle)}>
                        <Text style={[scaleStyle(helperTextStyle), { color: theme.colors.mutedText }]}>
                            Choose a system and category to continue.
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

function makeManualItemSlug(area: string, system: string, itemName: string) {
    return makeSlug([area, system, itemName].map((part) => part.trim()).filter(Boolean).join('-'));
}

function sameItemText(a?: string | null, b?: string | null) {
    return normalizeAreaName(a) === normalizeAreaName(b);
}

function isDuplicateItemInArea(item: ExistingHomeItem, areaName: string, parentArea: string, itemName: string) {
    if (sameItemText(item.category, 'Area') || !sameItemText(item.name, itemName)) return false;

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
            <TextInput
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
    const { scaleFont, scaleIcon, theme } = useTheme();
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
    const { scaleFont, scaleIcon, theme } = useTheme();

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
    choices,
    value,
    onChange,
}: {
    choices: Choice[];
    value: string;
    onChange: (value: string) => void;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(12) }}>
            {choices.map((choice) => {
                const selected = value === choice.value;

                return (
                    <TouchableOpacity
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

const choiceGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
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

const inputGroupStyle = {
    marginTop: 10,
    marginBottom: 16,
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
