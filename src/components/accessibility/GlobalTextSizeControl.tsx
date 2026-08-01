import { Pressable, Text, View } from 'react-native';
import {
    appearanceSizeOptions,
    type AppearanceSizeName,
} from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function GlobalTextSizeControl({ embedded = false }: { embedded?: boolean }) {
    const {
        appearance,
        isThemeLoaded,
        setFontSize,
        theme,
    } = useTheme();

    if (!isThemeLoaded) return null;

    const currentIndex = appearanceSizeOptions.findIndex(
        (option) => option.name === appearance.fontSize
    );
    const standardIndex = appearanceSizeOptions.findIndex(
        (option) => option.name === 'standard'
    );
    const safeIndex = currentIndex < 0 ? standardIndex : currentIndex;
    const currentOption = appearanceSizeOptions[safeIndex];

    function changeSize(nextIndex: number) {
        const nextOption = appearanceSizeOptions[nextIndex];
        if (!nextOption) return;

        void setFontSize(nextOption.name as AppearanceSizeName);
    }

    return (
        <View
            accessibilityLabel={`Text size: ${currentOption.label}`}
            style={[
                controlStyle,
                embedded ? embeddedControlStyle : floatingControlStyle,
                {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    boxShadow: `0 5px 16px ${theme.colors.overlay}24`,
                },
            ]}
        >
            <Pressable
                accessibilityLabel="Decrease text size"
                accessibilityRole="button"
                disabled={safeIndex === 0}
                onPress={() => changeSize(safeIndex - 1)}
                style={({ pressed }) => [
                    buttonStyle,
                    {
                        backgroundColor: pressed
                            ? theme.colors.secondaryButton
                            : 'transparent',
                        opacity: safeIndex === 0 ? 0.38 : 1,
                    },
                ]}
            >
                <Text style={[buttonTextStyle, { color: theme.colors.text }]}>A−</Text>
            </Pressable>

            <Text
                accessibilityLiveRegion="polite"
                style={[valueTextStyle, { color: theme.colors.mutedText }]}
            >
                {Math.round(currentOption.scale * 100)}%
            </Text>

            <Pressable
                accessibilityLabel="Increase text size"
                accessibilityRole="button"
                disabled={safeIndex === appearanceSizeOptions.length - 1}
                onPress={() => changeSize(safeIndex + 1)}
                style={({ pressed }) => [
                    buttonStyle,
                    {
                        backgroundColor: pressed
                            ? theme.colors.secondaryButton
                            : 'transparent',
                        opacity:
                            safeIndex === appearanceSizeOptions.length - 1 ? 0.38 : 1,
                    },
                ]}
            >
                <Text style={[buttonTextStyle, { color: theme.colors.text }]}>A+</Text>
            </Pressable>
        </View>
    );
}

const controlStyle = {
    minHeight: 38,
    padding: 3,
    borderWidth: 1,
    borderRadius: 999,
    borderCurve: 'continuous' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
};

const floatingControlStyle = {
    position: 'absolute' as const,
    right: 12,
    bottom: 76,
    zIndex: 9500,
};

const embeddedControlStyle = {
    alignSelf: 'flex-start' as const,
};

const buttonStyle = {
    minWidth: 38,
    minHeight: 32,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const buttonTextStyle = {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900' as const,
};

const valueTextStyle = {
    minWidth: 42,
    paddingHorizontal: 3,
    textAlign: 'center' as const,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800' as const,
};
