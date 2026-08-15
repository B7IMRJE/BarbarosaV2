import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import {
    getPlumbingCatalogSuggestions,
    type PlumbingSpecificationSuggestion,
} from '../../lib/plumbingCatalogSuggestions';
import { useTheme } from '../../theme/useTheme';

export type PlumbingSuggestionDraft = {
    productName: string;
    category: string;
    brand: string;
    model: string;
    specifications: Record<string, string>;
    compatibleApplications: string[];
    installationRequirements: string[];
};

export default function PlumbingCatalogSuggestionsPanel({
    draft,
    onChange,
}: {
    draft: PlumbingSuggestionDraft;
    onChange: (patch: Pick<PlumbingSuggestionDraft, 'specifications' | 'compatibleApplications' | 'installationRequirements'>) => void;
}) {
    const { scaleFont, theme } = useTheme();
    const [expanded, setExpanded] = useState(false);
    const suggestions = getPlumbingCatalogSuggestions(draft);

    function toggleSpecification(option: PlumbingSpecificationSuggestion) {
        const currentValue = draft.specifications[option.key];
        const next = { ...draft.specifications };
        if (currentValue?.toLowerCase() === option.value.toLowerCase()) delete next[option.key];
        else next[option.key] = option.value;
        onChange({
            specifications: next,
            compatibleApplications: draft.compatibleApplications,
            installationRequirements: draft.installationRequirements,
        });
    }

    function toggleList(field: 'compatibleApplications' | 'installationRequirements', value: string) {
        const current = draft[field];
        const selected = includesValue(current, value);
        const next = selected ? current.filter((item) => item.toLowerCase() !== value.toLowerCase()) : [...current, value];
        onChange({
            specifications: draft.specifications,
            compatibleApplications: field === 'compatibleApplications' ? next : draft.compatibleApplications,
            installationRequirements: field === 'installationRequirements' ? next : draft.installationRequirements,
        });
    }

    return (
        <View style={{ gap: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, padding: 13, backgroundColor: theme.colors.surface }}>
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setExpanded((current) => !current)}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
            >
                <View style={{ flex: 1, gap: 3 }}>
                    <Text selectable style={{ color: theme.colors.text, fontWeight: '900', fontSize: scaleFont(18) }}>
                        Add common plumbing details
                    </Text>
                    <Text selectable style={{ color: theme.colors.mutedText }}>
                        {suggestions.profileLabel} options · tap to add or remove
                    </Text>
                </View>
                <Text style={{ color: theme.colors.primary, fontSize: scaleFont(22), fontWeight: '900' }}>{expanded ? '−' : '+'}</Text>
            </TouchableOpacity>

            {expanded && (
                <View style={{ gap: 16 }}>
                    <Text selectable style={{ color: theme.colors.mutedText, lineHeight: scaleFont(20) }}>
                        These are field shortcuts, not verified product claims. Choose only what matches the actual product and job, then confirm manufacturer instructions and local requirements.
                    </Text>
                    <SuggestionGroup title="Specifications">
                        {suggestions.specifications.map((option) => (
                            <SuggestionChip
                                key={`${option.key}-${option.value}`}
                                label={`${option.key}: ${option.value}`}
                                selected={draft.specifications[option.key]?.toLowerCase() === option.value.toLowerCase()}
                                onPress={() => toggleSpecification(option)}
                            />
                        ))}
                    </SuggestionGroup>
                    <SuggestionGroup title="Compatible applications">
                        {suggestions.compatibleApplications.map((value) => (
                            <SuggestionChip key={value} label={value} selected={includesValue(draft.compatibleApplications, value)} onPress={() => toggleList('compatibleApplications', value)} />
                        ))}
                    </SuggestionGroup>
                    <SuggestionGroup title="Installation requirements">
                        {suggestions.installationRequirements.map((value) => (
                            <SuggestionChip key={value} label={value} selected={includesValue(draft.installationRequirements, value)} onPress={() => toggleList('installationRequirements', value)} />
                        ))}
                    </SuggestionGroup>
                </View>
            )}
        </View>
    );
}

function SuggestionGroup({ title, children }: { title: string; children: React.ReactNode }) {
    const { theme } = useTheme();
    return (
        <View style={{ gap: 8 }}>
            <Text selectable style={{ color: theme.colors.text, fontWeight: '900' }}>{title}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
        </View>
    );
}

function SuggestionChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
    const { theme } = useTheme();
    return (
        <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            onPress={onPress}
            style={{
                maxWidth: '100%',
                minHeight: 42,
                justifyContent: 'center',
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
            }}
        >
            <Text style={{ color: selected ? theme.colors.primaryText : theme.colors.text, fontWeight: '800', flexShrink: 1 }}>
                {selected ? '✓ ' : '+ '}{label}
            </Text>
        </TouchableOpacity>
    );
}

function includesValue(values: string[], candidate: string) {
    return values.some((value) => value.toLowerCase() === candidate.toLowerCase());
}
