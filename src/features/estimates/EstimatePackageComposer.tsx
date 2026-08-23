import DictationTextInput from '@/components/input/DictationTextInput';
import { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { estimatePackagePreviewTotal } from '../../lib/estimateOptionPackages';
import { formatMoney, type EstimateChoice } from '../../lib/estimateOptions';

export type EstimatePackageComposerInput = {
    sourceChoiceIds: string[];
    title: string;
    discountPercentage: number;
    discountLabel: string;
};

export default function EstimatePackageComposer({
    choices,
    saving,
    onCreate,
}: {
    choices: EstimateChoice[];
    saving: boolean;
    onCreate: (input: EstimatePackageComposerInput) => Promise<boolean>;
}) {
    const [open, setOpen] = useState(false);
    const [selectedChoiceIds, setSelectedChoiceIds] = useState<string[]>([]);
    const [title, setTitle] = useState('');
    const [discountDraft, setDiscountDraft] = useState('');
    const [discountLabel, setDiscountLabel] = useState('Package Savings');
    const discountPercentage = normalizeDiscountDraft(discountDraft);
    const preview = useMemo(
        () => estimatePackagePreviewTotal(choices, selectedChoiceIds, discountPercentage),
        [choices, discountPercentage, selectedChoiceIds],
    );
    const canCreate = selectedChoiceIds.length >= 2 && title.trim().length > 0 && !saving;

    function toggleChoice(choiceId: string) {
        setSelectedChoiceIds((current) => current.includes(choiceId)
            ? current.filter((id) => id !== choiceId)
            : [...current, choiceId]);
    }

    async function createPackage() {
        if (!canCreate) return;

        const saved = await onCreate({
            sourceChoiceIds: selectedChoiceIds,
            title: title.trim(),
            discountPercentage,
            discountLabel: discountPercentage > 0 ? discountLabel.trim() : '',
        });

        if (!saved) return;

        setOpen(false);
        setSelectedChoiceIds([]);
        setTitle('');
        setDiscountDraft('');
        setDiscountLabel('Package Savings');
    }

    if (!open) {
        return (
            <View style={shellStyle}>
                <View style={introStyle}>
                    <Text style={eyebrowStyle}>PACKAGE BUILDER</Text>
                    <Text style={titleStyle}>Combine options into one package</Text>
                    <Text style={descriptionStyle}>
                        Keep every original option, then group the work the homeowner wants into a new selectable package.
                    </Text>
                </View>
                <TouchableOpacity
                    accessibilityLabel="Combine estimate options into a package"
                    accessibilityRole="button"
                    disabled={choices.length < 2}
                    onPress={() => setOpen(true)}
                    style={choices.length >= 2 ? primaryButtonStyle : disabledButtonStyle}
                >
                    <Text style={primaryButtonTextStyle}>{choices.length >= 2 ? 'Combine into package' : 'Add two options first'}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={shellStyle}>
            <View style={introStyle}>
                <Text style={eyebrowStyle}>PACKAGE BUILDER</Text>
                <Text style={titleStyle}>Choose the options to combine</Text>
                <Text style={descriptionStyle}>The source options remain available separately.</Text>
            </View>

            <View style={choiceListStyle}>
                {choices.map((choice, index) => {
                    const selected = selectedChoiceIds.includes(choice.id);

                    return (
                        <TouchableOpacity
                            accessibilityLabel={`${selected ? 'Remove' : 'Add'} Option ${index + 1}, ${choice.title}, ${selected ? 'from' : 'to'} package`}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            key={choice.id}
                            onPress={() => toggleChoice(choice.id)}
                            style={selected ? choiceSelectedStyle : choiceStyle}
                        >
                            <View style={selected ? checkSelectedStyle : checkStyle}>
                                <Text style={selected ? checkSelectedTextStyle : checkTextStyle}>{selected ? '✓' : ''}</Text>
                            </View>
                            <View style={choiceContentStyle}>
                                <Text style={choiceKindStyle}>{choice.kind === 'package' ? 'PACKAGE' : `OPTION ${index + 1}`}</Text>
                                <Text style={choiceTitleStyle}>{choice.title}</Text>
                            </View>
                            <Text style={choicePriceStyle}>{formatMoney(choice.pricingResult.totalAmount)}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <View style={fieldGroupStyle}>
                <Text style={fieldLabelStyle}>Package name</Text>
                <DictationTextInput
                    onChangeText={setTitle}
                    placeholder="Example: Complete Home Package"
                    style={inputStyle}
                    value={title}
                />
            </View>

            <View style={fieldGroupStyle}>
                <Text style={fieldLabelStyle}>Optional package savings</Text>
                <View style={discountRowStyle}>
                    <DictationTextInput
                        inputMode="decimal"
                        keyboardType="decimal-pad"
                        onChangeText={setDiscountDraft}
                        placeholder="0"
                        style={discountInputStyle}
                        value={discountDraft}
                    />
                    <Text style={discountUnitStyle}>%</Text>
                </View>
                {discountPercentage > 0 && (
                    <DictationTextInput
                        onChangeText={setDiscountLabel}
                        placeholder="Package Savings"
                        style={inputStyle}
                        value={discountLabel}
                    />
                )}
            </View>

            <View style={summaryStyle}>
                <View>
                    <Text style={summaryLabelStyle}>{selectedChoiceIds.length} selected</Text>
                    <Text style={summaryMetaStyle}>Before savings {formatMoney(preview.subtotal)}</Text>
                </View>
                <View style={summaryTotalColumnStyle}>
                    <Text style={summaryLabelStyle}>Package total</Text>
                    <Text style={summaryTotalStyle}>{formatMoney(preview.total)}</Text>
                </View>
            </View>

            <View style={actionRowStyle}>
                <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setOpen(false)}
                    style={secondaryButtonStyle}
                >
                    <Text style={secondaryButtonTextStyle}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    accessibilityRole="button"
                    disabled={!canCreate}
                    onPress={() => void createPackage()}
                    style={canCreate ? primaryButtonStyle : disabledButtonStyle}
                >
                    <Text style={primaryButtonTextStyle}>{saving ? 'Saving package…' : 'Create package'}</Text>
                </TouchableOpacity>
            </View>
            {selectedChoiceIds.length < 2 && <Text style={helpStyle}>Select at least two options.</Text>}
            {!title.trim() && selectedChoiceIds.length >= 2 && <Text style={helpStyle}>Give the package a customer-facing name.</Text>}
        </View>
    );
}

function normalizeDiscountDraft(value: string) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) return 0;

    return Math.min(100, Math.max(0, parsed));
}

const shellStyle = {
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#8BBCC5',
    backgroundColor: '#F4FAFB',
};

const introStyle = { gap: 5 };
const eyebrowStyle = { color: '#087083', fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.7 };
const titleStyle = { color: '#09243C', fontSize: 20, lineHeight: 25, fontWeight: '900' as const };
const descriptionStyle = { color: '#526877', fontSize: 14, lineHeight: 20 };
const choiceListStyle = { gap: 9 };
const choiceStyle = {
    minHeight: 72,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 11,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CAD8E1',
    backgroundColor: '#FFFFFF',
};
const choiceSelectedStyle = { ...choiceStyle, borderColor: '#087083', borderWidth: 2, backgroundColor: '#EAF8FA' };
const checkStyle = {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#8DA1AE',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#FFFFFF',
};
const checkSelectedStyle = { ...checkStyle, borderColor: '#087083', backgroundColor: '#087083' };
const checkTextStyle = { color: '#8DA1AE', fontSize: 16, fontWeight: '900' as const };
const checkSelectedTextStyle = { ...checkTextStyle, color: '#FFFFFF' };
const choiceContentStyle = { flex: 1, minWidth: 0 };
const choiceKindStyle = { color: '#687D8B', fontSize: 10, fontWeight: '900' as const };
const choiceTitleStyle = { color: '#09243C', fontSize: 15, lineHeight: 19, fontWeight: '800' as const, marginTop: 2 };
const choicePriceStyle = { color: '#08735B', fontSize: 15, fontWeight: '900' as const };
const fieldGroupStyle = { gap: 7 };
const fieldLabelStyle = { color: '#29465A', fontSize: 13, fontWeight: '900' as const };
const inputStyle = {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#A9BDC8',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    color: '#09243C',
    fontSize: 15,
    backgroundColor: '#FFFFFF',
};
const discountRowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9 };
const discountInputStyle = { ...inputStyle, flex: 1 };
const discountUnitStyle = { color: '#29465A', fontSize: 18, fontWeight: '900' as const };
const summaryStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    padding: 13,
    borderRadius: 13,
    backgroundColor: '#EAF6F8',
};
const summaryTotalColumnStyle = { alignItems: 'flex-end' as const };
const summaryLabelStyle = { color: '#526877', fontSize: 12, fontWeight: '800' as const };
const summaryMetaStyle = { color: '#29465A', fontSize: 13, marginTop: 3 };
const summaryTotalStyle = { color: '#08735B', fontSize: 20, fontWeight: '900' as const, marginTop: 2 };
const actionRowStyle = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 };
const primaryButtonStyle = {
    minHeight: 46,
    flexGrow: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: '#087083',
};
const disabledButtonStyle = { ...primaryButtonStyle, backgroundColor: '#9DB0BA' };
const primaryButtonTextStyle = { color: '#FFFFFF', fontSize: 14, fontWeight: '900' as const };
const secondaryButtonStyle = {
    minHeight: 46,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#8BBCC5',
    backgroundColor: '#FFFFFF',
};
const secondaryButtonTextStyle = { color: '#087083', fontSize: 14, fontWeight: '900' as const };
const helpStyle = { color: '#8B5D16', fontSize: 12, lineHeight: 17 };
