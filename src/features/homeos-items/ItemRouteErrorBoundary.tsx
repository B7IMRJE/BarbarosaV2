import { router, type ErrorBoundaryProps } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';

export default function ItemRouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
    const { theme } = useTheme();
    const message = error instanceof Error && error.message
        ? error.message
        : 'The item page could not be opened.';

    return (
        <View style={[containerStyle, { backgroundColor: theme.colors.background }]}>
            <View style={[cardStyle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text style={[titleStyle, { color: theme.colors.text }]}>Item page needs attention</Text>
                <Text style={[bodyStyle, { color: theme.colors.mutedText }]}>The item is still saved. Try opening it again, or return to the previous HomeOS screen.</Text>
                <Text selectable style={[errorStyle, { color: theme.colors.text, borderColor: theme.colors.border }]}>{message}</Text>
                <View style={actionsStyle}>
                    <TouchableOpacity accessibilityRole="button" onPress={retry} style={[buttonStyle, { backgroundColor: theme.colors.primary }]}>
                        <Text style={primaryButtonTextStyle}>Try Again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={[buttonStyle, secondaryButtonStyle, { borderColor: theme.colors.border }]}>
                        <Text style={[secondaryButtonTextStyle, { color: theme.colors.text }]}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const containerStyle = { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 20 };
const cardStyle = { width: '100%' as const, maxWidth: 560, borderWidth: 1, borderRadius: 18, padding: 22 };
const titleStyle = { fontSize: 22, lineHeight: 28, fontWeight: '900' as const };
const bodyStyle = { fontSize: 15, lineHeight: 22, marginTop: 8 };
const errorStyle = { fontSize: 13, lineHeight: 19, marginTop: 16, padding: 12, borderWidth: 1, borderRadius: 10 };
const actionsStyle = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10, marginTop: 18 };
const buttonStyle = { minWidth: 120, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' as const };
const secondaryButtonStyle = { backgroundColor: 'transparent', borderWidth: 1 };
const primaryButtonTextStyle = { color: '#FFFFFF', fontSize: 14, fontWeight: '900' as const };
const secondaryButtonTextStyle = { fontSize: 14, fontWeight: '900' as const };
