import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import {
    buildAreaRow,
    duplicateKey,
    existingDuplicateKeys,
    type ExistingAreaItem,
    type HomeItemInsert,
} from '../../lib/areaTemplates';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type BathroomCount = '1' | '2' | '3' | '4+';
type YesNo = 'yes' | 'no';
type YesNoNotSure = 'yes' | 'no' | 'not_sure';

type StarterArea = {
    name: string;
    system: string;
};

const bathroomOptions: BathroomCount[] = ['1', '2', '3', '4+'];
const yesNoOptions: { value: YesNo; label: string }[] = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
];
const yesNoNotSureOptions: { value: YesNoNotSure; label: string }[] = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'not_sure', label: 'Not sure' },
];

export default function BaseHomeWizardScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [bathrooms, setBathrooms] = useState<BathroomCount>('2');
    const [hasKitchen, setHasKitchen] = useState<YesNo>('yes');
    const [hasLaundry, setHasLaundry] = useState<YesNo>('yes');
    const [hasGarage, setHasGarage] = useState<YesNo>('yes');
    const [hasWaterHeater, setHasWaterHeater] = useState<YesNoNotSure>('not_sure');
    const [hasHvac, setHasHvac] = useState<YesNoNotSure>('not_sure');
    const [hasFrontYard, setHasFrontYard] = useState<YesNo>('yes');
    const [hasBackYard, setHasBackYard] = useState<YesNo>('yes');
    const [hasPool, setHasPool] = useState<YesNo>('no');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    const starterAreas = useMemo(
        () =>
            buildStarterAreaPlan({
                bathrooms,
                hasKitchen,
                hasLaundry,
                hasGarage,
                hasWaterHeater,
                hasHvac,
                hasFrontYard,
                hasBackYard,
                hasPool,
            }),
        [bathrooms, hasKitchen, hasLaundry, hasGarage, hasWaterHeater, hasHvac, hasFrontYard, hasBackYard, hasPool]
    );

    async function createStarterHomeProfile() {
        if (saving) return;

        setSaving(true);
        setMessage('Creating starter home profile...');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setSaving(false);
            setMessage(activePropertyErrorMessage(error));

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as never);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as never);
            }

            return;
        }

        const { data: existingRows, error: existingError } = await supabase
            .from('home_items')
            .select('name, system, category, location, parent_area')
            .eq('property_id', activeProperty.propertyId)
            .or('archived.eq.false,archived.is.null');

        if (existingError) {
            setSaving(false);
            setMessage(`Could not check existing home profile: ${existingError.message}`);
            return;
        }

        const existingItems = (existingRows || []) as ExistingAreaItem[];
        const existingKeys = existingDuplicateKeys(existingItems);
        const rowsToInsert: HomeItemInsert[] = [];

        for (const area of starterAreas) {
            const areaRow = buildAreaRow(activeProperty.userId, activeProperty.propertyId, area.name, area.system);
            const areaKey = duplicateKey(areaRow.system, area.name, area.name);

            if (!existingKeys.has(areaKey)) {
                rowsToInsert.push(areaRow);
                existingKeys.add(areaKey);
            }
        }

        if (rowsToInsert.length > 0) {
            const { error: insertError } = await supabase.from('home_items').insert(rowsToInsert);

            if (insertError) {
                setSaving(false);
                setMessage(`Starter profile could not be created: ${insertError.message}`);
                return;
            }
        }

        setSaving(false);
        setMessage(
            rowsToInsert.length > 0
                ? `Created ${rowsToInsert.length} starter area${rowsToInsert.length === 1 ? '' : 's'} marked Missing Information.`
                : 'Your starter areas already exist. Nothing new was created.'
        );
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 920 }}>
                <Text style={{ color: theme.colors.text, fontSize: scaleFont(34), fontWeight: '900' }}>
                    Set Up Your Home Profile
                </Text>
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        fontSize: scaleFont(16),
                        lineHeight: scaleFont(22),
                        marginTop: scaleIcon(8),
                        marginBottom: scaleIcon(18),
                    }}
                >
                    Answer a few simple questions. HomeOS will create starter areas as Missing Information so you can confirm details later.
                </Text>

                <ThemedCard style={{ marginBottom: scaleIcon(14) }}>
                    <QuestionBlock title="How many bathrooms?">
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
                            {bathroomOptions.map((option) => (
                                <ChoiceChip
                                    key={option}
                                    label={option}
                                    selected={bathrooms === option}
                                    onPress={() => setBathrooms(option)}
                                />
                            ))}
                        </View>
                    </QuestionBlock>

                    <QuestionBlock title="Kitchen?">
                        <ChoiceRow options={yesNoOptions} value={hasKitchen} onChange={setHasKitchen} />
                    </QuestionBlock>

                    <QuestionBlock title="Laundry?">
                        <ChoiceRow options={yesNoOptions} value={hasLaundry} onChange={setHasLaundry} />
                    </QuestionBlock>

                    <QuestionBlock title="Garage?">
                        <ChoiceRow options={yesNoOptions} value={hasGarage} onChange={setHasGarage} />
                    </QuestionBlock>

                    <QuestionBlock title="Water heater?">
                        <ChoiceRow options={yesNoNotSureOptions} value={hasWaterHeater} onChange={setHasWaterHeater} />
                    </QuestionBlock>

                    <QuestionBlock title="HVAC?">
                        <ChoiceRow options={yesNoNotSureOptions} value={hasHvac} onChange={setHasHvac} />
                    </QuestionBlock>

                    <QuestionBlock title="Front yard?">
                        <ChoiceRow options={yesNoOptions} value={hasFrontYard} onChange={setHasFrontYard} />
                    </QuestionBlock>

                    <QuestionBlock title="Back yard?">
                        <ChoiceRow options={yesNoOptions} value={hasBackYard} onChange={setHasBackYard} />
                    </QuestionBlock>

                    <QuestionBlock title="Pool?">
                        <ChoiceRow options={yesNoOptions} value={hasPool} onChange={setHasPool} />
                    </QuestionBlock>
                </ThemedCard>

                <ThemedCard style={{ marginBottom: scaleIcon(14) }}>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>
                        Starter areas to create
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, marginTop: scaleIcon(8), lineHeight: scaleFont(20) }}>
                        These are area cards only. No photos, documents, or confirmed equipment details will be generated.
                    </Text>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), marginTop: scaleIcon(12) }}>
                        {starterAreas.map((area) => (
                            <Text
                                key={`${area.system}-${area.name}`}
                                style={{
                                    backgroundColor: theme.colors.surfaceAlt,
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.pill,
                                    borderWidth: 1,
                                    color: theme.colors.text,
                                    fontWeight: '900',
                                    paddingHorizontal: scaleIcon(12),
                                    paddingVertical: scaleIcon(8),
                                }}
                            >
                                {area.name}
                            </Text>
                        ))}
                    </View>
                </ThemedCard>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10), marginBottom: scaleIcon(14) }}>
                    <ThemedButton
                        title={saving ? 'Creating...' : 'Create Starter Home Profile'}
                        disabled={saving}
                        onPress={createStarterHomeProfile}
                    />
                    <ThemedButton
                        title="Skip for Now"
                        variant="secondary"
                        disabled={saving}
                        onPress={() => router.replace('/' as never)}
                    />
                </View>

                {saving && (
                    <View style={{ alignItems: 'flex-start', paddingVertical: scaleIcon(8) }}>
                        <ActivityIndicator />
                    </View>
                )}

                {!!message && (
                    <ThemedCard>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900', lineHeight: scaleFont(20) }}>
                            {message}
                        </Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

function QuestionBlock({ title, children }: { title: string; children: React.ReactNode }) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View style={{ marginBottom: scaleIcon(18) }}>
            <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900', marginBottom: scaleIcon(10) }}>
                {title}
            </Text>
            {children}
        </View>
    );
}

function ChoiceRow<TValue extends string>({
    options,
    value,
    onChange,
}: {
    options: { value: TValue; label: string }[];
    value: TValue;
    onChange: (value: TValue) => void;
}) {
    const { scaleIcon } = useTheme();

    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
            {options.map((option) => (
                <ChoiceChip
                    key={option.value}
                    label={option.label}
                    selected={value === option.value}
                    onPress={() => onChange(option.value)}
                />
            ))}
        </View>
    );
}

function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <TouchableOpacity
            activeOpacity={0.82}
            onPress={onPress}
            style={{
                backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                borderRadius: theme.radii.pill,
                borderWidth: 1,
                minWidth: scaleIcon(74),
                paddingHorizontal: scaleIcon(14),
                paddingVertical: scaleIcon(10),
            }}
        >
            <Text
                style={{
                    color: selected ? theme.colors.primaryText : theme.colors.text,
                    fontSize: scaleFont(15),
                    fontWeight: '900',
                    textAlign: 'center',
                }}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
}

function buildStarterAreaPlan({
    bathrooms,
    hasKitchen,
    hasLaundry,
    hasGarage,
    hasWaterHeater,
    hasHvac,
    hasFrontYard,
    hasBackYard,
    hasPool,
}: {
    bathrooms: BathroomCount;
    hasKitchen: YesNo;
    hasLaundry: YesNo;
    hasGarage: YesNo;
    hasWaterHeater: YesNoNotSure;
    hasHvac: YesNoNotSure;
    hasFrontYard: YesNo;
    hasBackYard: YesNo;
    hasPool: YesNo;
}) {
    const areas: StarterArea[] = [];

    if (hasKitchen === 'yes') areas.push({ name: 'Kitchen', system: 'Plumbing' });

    for (let index = 1; index <= bathroomCountToNumber(bathrooms); index += 1) {
        areas.push({ name: index === 1 ? 'Bathroom 1' : `Bathroom ${index}`, system: 'Plumbing' });
    }

    if (hasLaundry === 'yes') areas.push({ name: 'Laundry', system: 'Plumbing' });
    if (hasGarage === 'yes') areas.push({ name: 'Garage', system: 'Plumbing' });

    if (hasWaterHeater !== 'no' || hasHvac !== 'no') {
        areas.push({ name: 'Mechanical Area', system: hasHvac !== 'no' ? 'HVAC' : 'Plumbing' });
    }

    if (hasFrontYard === 'yes') areas.push({ name: 'Front Yard', system: 'Exterior' });
    if (hasBackYard === 'yes') areas.push({ name: 'Back Yard', system: 'Exterior' });
    if (hasPool === 'yes') areas.push({ name: 'Pool Area', system: 'Pool' });

    return areas;
}

function bathroomCountToNumber(value: BathroomCount) {
    if (value === '4+') return 4;
    return Number(value);
}
