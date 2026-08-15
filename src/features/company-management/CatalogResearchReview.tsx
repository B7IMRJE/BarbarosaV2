import { Linking, Text, TouchableOpacity, View } from 'react-native';
import type {
    CatalogProductResearch,
    CatalogResearchApplyGroup,
} from '../../lib/catalogProductResearchCore';
import { useTheme } from '../../theme/useTheme';
import ThemedButton from '../../components/theme/ThemedButton';

export default function CatalogResearchReview({
    research,
    onApply,
    onClear,
}: {
    research: CatalogProductResearch;
    onApply: (groups: CatalogResearchApplyGroup[]) => void;
    onClear: () => void;
}) {
    const { scaleFont, theme } = useTheme();
    const confidenceLabel = `${research.confidence.charAt(0).toUpperCase()}${research.confidence.slice(1)} confidence`;
    const matchLabel = research.exactModelMatch ? 'Exact model confirmed' : 'Exact model not confirmed';

    return (
        <View
            style={{
                gap: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: research.exactModelMatch ? theme.colors.primary : '#C98A00',
                borderRadius: 14,
                backgroundColor: theme.colors.surface,
            }}
        >
            <View style={{ gap: 4 }}>
                <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>
                    Manufacturer research ready
                </Text>
                <Text selectable style={{ color: theme.colors.mutedText, lineHeight: scaleFont(20) }}>
                    {research.productName} · {matchLabel} · {confidenceLabel}
                </Text>
            </View>

            {!!research.warnings.length && (
                <View style={{ gap: 5, borderRadius: 11, backgroundColor: '#FFF4DD', padding: 11 }}>
                    <Text selectable style={{ color: '#704B00', fontWeight: '900' }}>Review before applying</Text>
                    {research.warnings.map((warning) => (
                        <Text selectable key={warning} style={{ color: '#704B00', lineHeight: scaleFont(19) }}>• {warning}</Text>
                    ))}
                </View>
            )}

            <View style={{ gap: 5 }}>
                <Text selectable style={{ color: theme.colors.text, fontWeight: '900' }}>Found details</Text>
                <Text selectable style={{ color: theme.colors.mutedText }}>
                    {research.specifications.length} specifications · {research.compatibleApplications.length} applications · {research.installationRequirements.length} requirements
                </Text>
                {!!research.manufacturerWarranty && (
                    <Text selectable style={{ color: theme.colors.mutedText }}>Warranty: {research.manufacturerWarranty}</Text>
                )}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <ApplyChip label="Identity" disabled={!research.sources.length} onPress={() => onApply(['identity'])} />
                <ApplyChip label="Description" disabled={!research.sources.length || !research.description} onPress={() => onApply(['description'])} />
                <ApplyChip label={`Specifications (${research.specifications.length})`} disabled={!research.sources.length || !research.specifications.length} onPress={() => onApply(['specifications'])} />
                <ApplyChip label={`Applications (${research.compatibleApplications.length})`} disabled={!research.sources.length || !research.compatibleApplications.length} onPress={() => onApply(['applications'])} />
                <ApplyChip label={`Requirements (${research.installationRequirements.length})`} disabled={!research.sources.length || !research.installationRequirements.length} onPress={() => onApply(['requirements'])} />
                <ApplyChip label="Warranty & reference" disabled={!research.sources.length || (!research.manufacturerWarranty && !research.manufacturerReference)} onPress={() => onApply(['warranty'])} />
            </View>

            <View style={{ gap: 7 }}>
                <Text selectable style={{ color: theme.colors.text, fontWeight: '900' }}>Research sources</Text>
                {research.sources.map((source) => (
                    <TouchableOpacity
                        key={source.url}
                        accessibilityRole="link"
                        onPress={() => void Linking.openURL(source.url)}
                        style={{ minHeight: 36, justifyContent: 'center' }}
                    >
                        <Text selectable style={{ color: theme.colors.primary, fontWeight: '800', textDecorationLine: 'underline' }}>
                            {source.title}
                        </Text>
                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12) }}>
                            {source.sourceType.replaceAll('_', ' ')}
                        </Text>
                    </TouchableOpacity>
                ))}
                {!research.sources.length && (
                    <Text selectable style={{ color: theme.colors.mutedText }}>
                        No source link was returned. Do not apply unverified manufacturer facts.
                    </Text>
                )}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
                <ThemedButton
                    title="Apply All Researched Details"
                    disabled={!research.sources.length}
                    onPress={() => onApply(['identity', 'description', 'specifications', 'applications', 'requirements', 'warranty'])}
                    style={{ flexGrow: 1 }}
                />
                <ThemedButton title="Clear Research" variant="secondary" onPress={onClear} style={{ flexGrow: 1 }} />
            </View>
        </View>
    );
}

function ApplyChip({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
    const { theme } = useTheme();
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={{
                minHeight: 40,
                justifyContent: 'center',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: disabled ? theme.colors.border : theme.colors.primary,
                backgroundColor: disabled ? theme.colors.background : theme.colors.surface,
                borderRadius: 999,
                opacity: disabled ? 0.55 : 1,
            }}
        >
            <Text style={{ color: disabled ? theme.colors.mutedText : theme.colors.primary, fontWeight: '900' }}>{label}</Text>
        </TouchableOpacity>
    );
}
