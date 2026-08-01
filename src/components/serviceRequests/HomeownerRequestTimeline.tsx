import { Text, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';

export type HomeownerRequestTimelineEntry = {
    id: string;
    title?: string | null;
    message: string;
    createdAt?: string | null;
};

export default function HomeownerRequestTimeline({
    entries,
    emptyMessage = 'Updates will appear here as the company works on your request.',
    title = 'Timeline',
}: {
    entries: HomeownerRequestTimelineEntry[];
    emptyMessage?: string;
    title?: string;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

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
            <Text style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>
                {title}
            </Text>
            {entries.length === 0 ? (
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '700', lineHeight: scaleFont(19), marginTop: scaleIcon(7) }}>
                    {emptyMessage}
                </Text>
            ) : (
                <View style={{ gap: scaleIcon(10), marginTop: scaleIcon(10) }}>
                    {entries.map((entry) => (
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
                            <Text style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: entry.title ? '700' : '900', lineHeight: scaleFont(18) }}>
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
