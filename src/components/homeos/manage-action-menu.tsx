import { useState } from 'react';
import {
    AccessibilityInfo,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
    useWindowDimensions,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isHomeOSPhoneLayout } from '../../lib/homeos-responsive-layout';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

export const homeOSManageActionKeys = {
    edit: 'edit',
    addComponent: 'add-component',
    addAnother: 'add-another',
    move: 'move',
    archive: 'archive',
    delete: 'delete',
} as const;

export type HomeOSManageAction = {
    key: string;
    title: string;
    description?: string;
    onPress: () => void;
    destructive?: boolean;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    testID?: string;
};

export type ManageActionMenuProps = {
    actions: readonly HomeOSManageAction[];
    buttonTitle?: string;
    panelTitle?: string;
    panelDescription?: string;
    disabled?: boolean;
    accessibilityLabel?: string;
    testID?: string;
    style?: StyleProp<ViewStyle>;
    buttonStyle?: StyleProp<ViewStyle>;
    onOpenChange?: (open: boolean) => void;
};

/**
 * Presentation-only HomeOS management menu. Callers own authorization,
 * confirmation, persistence, navigation, and every action callback.
 */
export function ManageActionMenu({
    actions,
    buttonTitle = 'Manage',
    panelTitle = 'Manage item',
    panelDescription,
    disabled = false,
    accessibilityLabel,
    testID = 'homeos-manage-action-menu',
    style,
    buttonStyle,
    onOpenChange,
}: ManageActionMenuProps) {
    const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const [open, setOpen] = useState(false);
    const phone = isHomeOSPhoneLayout(viewportWidth);
    const menuDisabled = disabled || actions.length === 0;
    const panelWidth = phone
        ? viewportWidth
        : Math.min(
            Math.max(0, viewportWidth - foundation.spacing.spacious * 2),
            scaleIcon(560)
        );
    const panelMaxHeight = Math.max(
        0,
        Math.min(
            scaleIcon(720),
            viewportHeight - insets.top - insets.bottom - foundation.spacing.spacious * 2
        )
    );

    function setMenuOpen(nextOpen: boolean) {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    }

    function handleAction(action: HomeOSManageAction) {
        if (action.disabled) return;
        setMenuOpen(false);
        action.onPress();
    }

    return (
        <View style={style}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel || buttonTitle}
                accessibilityHint={menuDisabled
                    ? 'No management actions are available'
                    : 'Opens a list of management actions'}
                accessibilityState={{ disabled: menuDisabled, expanded: open }}
                disabled={menuDisabled}
                onPress={() => setMenuOpen(true)}
                testID={`${testID}-button`}
                style={({ pressed }) => [
                    {
                        minHeight: scaleIcon(52),
                        minWidth: scaleIcon(132),
                        maxWidth: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: foundation.spacing.compact,
                        paddingHorizontal: foundation.spacing.comfortable,
                        paddingVertical: foundation.spacing.compact,
                        borderWidth: 2,
                        borderColor: theme.colors.primary,
                        borderRadius: theme.radii.pill,
                        backgroundColor: theme.colors.primary,
                        boxShadow: foundation.shadows.card,
                        opacity: menuDisabled ? 0.48 : pressed ? 0.8 : 1,
                        transform: [{ scale: pressed && !menuDisabled ? 0.98 : 1 }],
                    },
                    buttonStyle,
                ]}
            >
                <StartGridMark color={theme.colors.primaryText} size={scaleIcon(16)} />
                <Text
                    numberOfLines={1}
                    style={{
                        color: theme.colors.primaryText,
                        flexShrink: 1,
                        fontSize: scaleFont(16),
                        fontWeight: '900',
                        lineHeight: scaleFont(21),
                        textAlign: 'center',
                    }}
                >
                    {buttonTitle}
                </Text>
            </Pressable>

            <Modal
                animationType="fade"
                hardwareAccelerated
                onRequestClose={() => setMenuOpen(false)}
                onShow={() => AccessibilityInfo.announceForAccessibility(`${panelTitle} opened`)}
                statusBarTranslucent
                transparent
                visible={open}
            >
                <View
                    style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: phone ? 'flex-end' : 'center',
                        paddingHorizontal: phone ? 0 : foundation.spacing.spacious,
                        paddingVertical: phone ? 0 : foundation.spacing.spacious,
                    }}
                >
                    <Pressable
                        accessible={false}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        onPress={() => setMenuOpen(false)}
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            bottom: 0,
                            left: 0,
                            backgroundColor: theme.colors.overlay,
                            opacity: 0.58,
                        }}
                    />

                    <View
                        accessibilityViewIsModal
                        importantForAccessibility="yes"
                        testID={`${testID}-panel`}
                        style={[
                            foundation.surface,
                            {
                                width: panelWidth,
                                maxHeight: panelMaxHeight,
                                overflow: 'hidden',
                                borderTopLeftRadius: theme.radii.card,
                                borderTopRightRadius: theme.radii.card,
                                borderBottomLeftRadius: phone ? 0 : theme.radii.card,
                                borderBottomRightRadius: phone ? 0 : theme.radii.card,
                                boxShadow: foundation.shadows.raised,
                            },
                        ]}
                    >
                        <View
                            style={{
                                paddingTop: foundation.spacing.comfortable,
                                paddingHorizontal: foundation.spacing.comfortable,
                                paddingBottom: foundation.spacing.regular,
                                borderBottomWidth: 1,
                                borderBottomColor: theme.colors.border,
                                gap: foundation.spacing.compact,
                            }}
                        >
                            <View
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: foundation.spacing.regular,
                                }}
                            >
                                <Text
                                    accessibilityRole="header"
                                    selectable
                                    style={[
                                        foundation.typography.destinationTitle,
                                        { flex: 1, minWidth: 0 },
                                    ]}
                                >
                                    {panelTitle}
                                </Text>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Close ${panelTitle}`}
                                    onPress={() => setMenuOpen(false)}
                                    hitSlop={foundation.spacing.compact}
                                    style={({ pressed }) => ({
                                        minWidth: scaleIcon(48),
                                        minHeight: scaleIcon(48),
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderWidth: 1,
                                        borderColor: theme.colors.border,
                                        borderRadius: theme.radii.pill,
                                        backgroundColor: pressed
                                            ? theme.colors.secondaryButton
                                            : theme.colors.surfaceAlt,
                                        opacity: pressed ? 0.78 : 1,
                                    })}
                                >
                                    <Text
                                        accessibilityElementsHidden
                                        importantForAccessibility="no"
                                        style={{
                                            color: theme.colors.text,
                                            fontSize: scaleFont(15),
                                            fontWeight: '900',
                                        }}
                                    >
                                        Close
                                    </Text>
                                </Pressable>
                            </View>
                            {panelDescription ? (
                                <Text selectable style={foundation.typography.body}>
                                    {panelDescription}
                                </Text>
                            ) : null}
                        </View>

                        <ScrollView
                            contentInsetAdjustmentBehavior="automatic"
                            keyboardShouldPersistTaps="handled"
                            style={{ flexShrink: 1 }}
                            contentContainerStyle={{
                                paddingTop: foundation.spacing.regular,
                                paddingHorizontal: foundation.spacing.comfortable,
                                paddingBottom: Math.max(
                                    foundation.spacing.comfortable,
                                    phone ? insets.bottom + foundation.spacing.regular : 0
                                ),
                                gap: foundation.spacing.compact,
                            }}
                        >
                            {actions.map((action) => (
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={action.accessibilityLabel || action.title}
                                    accessibilityHint={action.accessibilityHint || action.description}
                                    accessibilityState={{ disabled: Boolean(action.disabled) }}
                                    disabled={action.disabled}
                                    key={action.key}
                                    onPress={() => handleAction(action)}
                                    testID={action.testID || `${testID}-action-${action.key}`}
                                    style={({ pressed }) => [
                                        {
                                            width: '100%',
                                            minHeight: scaleIcon(64),
                                            justifyContent: 'center',
                                            paddingHorizontal: foundation.spacing.comfortable,
                                            paddingVertical: foundation.spacing.regular,
                                            borderWidth: action.destructive ? 2 : 1,
                                            borderColor: action.destructive
                                                ? theme.colors.danger
                                                : theme.colors.border,
                                            borderCurve: 'continuous',
                                            borderRadius: Math.min(theme.radii.card, scaleIcon(16)),
                                            backgroundColor: action.destructive
                                                ? theme.colors.dangerBackground
                                                : pressed
                                                    ? theme.colors.secondaryButton
                                                    : theme.colors.surfaceAlt,
                                            opacity: action.disabled ? 0.46 : pressed ? 0.8 : 1,
                                            transform: [{ scale: pressed && !action.disabled ? 0.99 : 1 }],
                                            gap: foundation.spacing.compact,
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            foundation.typography.containerTitle,
                                            { color: action.destructive ? theme.colors.danger : theme.colors.text },
                                        ]}
                                    >
                                        {action.title}
                                    </Text>
                                    {action.description ? (
                                        <Text
                                            style={[
                                                foundation.typography.body,
                                                action.destructive ? { color: theme.colors.danger } : null,
                                            ]}
                                        >
                                            {action.description}
                                        </Text>
                                    ) : null}
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function StartGridMark({ color, size }: { color: string; size: number }) {
    const squareSize = Math.max(3, Math.floor((size - 3) / 2));

    return (
        <View
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
                width: size,
                height: size,
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignContent: 'center',
                justifyContent: 'center',
                gap: 3,
            }}
        >
            {[0, 1, 2, 3].map((cell) => (
                <View
                    key={cell}
                    style={{
                        width: squareSize,
                        height: squareSize,
                        borderRadius: 1,
                        backgroundColor: color,
                    }}
                />
            ))}
        </View>
    );
}

export default ManageActionMenu;
