import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';

export type HomeownerRequestTimelineEntry = {
    id: string;
    title?: string | null;
    message: string;
    createdAt?: string | null;
};

export default function HomeownerRequestTimeline({
    entries,
    collapsedEntryCount = 3,
    emptyMessage = 'Updates will appear here as the company works on your request.',
    title = 'Timeline',
}: {
    entries: HomeownerRequestTimelineEntry[];
    collapsedEntryCount?: number;
    emptyMessage?: string;
    title?: string;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [expanded, setExpanded] = useState(false);
    const visibleEntryCount = Math.max(1, collapsedEntryCount);
    const hasEarlierEntries = entries.length > visibleEntryCount;
    const visibleEntries = expanded ? entries : entries.slice(-visibleEntryCount);

    return (
        <View
            style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.card,
                borderWidth: 1,
                padding: scaleIcon(12),
            }}
        >
            <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: scaleIcon(8) }}>
                <Text style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>
                    {title}
                </Text>
                {hasEarlierEntries && (
                    <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => setExpanded((current) => !current)}
                        style={{
                            borderColor: theme.colors.border,
                            borderRadius: theme.radii.button,
                            borderWidth: 1,
                            paddingHorizontal: scaleIcon(10),
                            paddingVertical: scaleIcon(6),
                        }}
                    >
                        <Text style={{ color: theme.colors.primary, fontSize: scaleFont(12), fontWeight: '900' }}>
                            {expanded ? 'Show latest' : `View full (${entries.length})`}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
            {entries.length === 0 ? (
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '700', lineHeight: scaleFont(19), marginTop: scaleIcon(7) }}>
                    {emptyMessage}
                </Text>
            ) : (
                <View style={{ gap: scaleIcon(10), marginTop: scaleIcon(10) }}>
                    {visibleEntries.map((entry) => (
                        <View
                            key={entry.id}
                            style={{
                                borderLeftColor: theme.colors.border,
                                borderLeftWidth: 3,
                                paddingLeft: scaleIcon(11),
                            }}
                        >
                            {!!entry.title && (
                                <Text style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: '900' }}>
                                    {entry.title}
                                </Text>
                            )}
                            <Text
                                numberOfLines={expanded ? undefined : 2}
                                style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: entry.title ? '700' : '900', lineHeight: scaleFont(18) }}
                            >
                                {entry.message || 'Request update'}
                            </Text>
                            {!!entry.createdAt && (
                                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '700', marginTop: scaleIcon(3) }}>
                                    {formatDateTime(entry.createdAt)}
                                </Text>
                            )}
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

function formatDateTime(value: string) {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
