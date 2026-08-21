import type { ReactNode } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import {
    EquipmentContainer,
    EquipmentDetailHeader,
} from '../../components/homeos/HomeOSVisualFoundation';
import { resolveHomeOSEquipmentVisual } from '../../components/homeos/homeos-visual-assets';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import type { HomeItemHierarchyRecord } from '../../lib/homeItemHierarchy';
import { resolveHomeItemCardDetails, resolveHomeItemDisplay } from '../../lib/homeItemDisplay';
import type { HomeOSStarterCardChoice } from '../../lib/homeosStarterCatalog';
import {
    resolveHomeItemHealthCardPresentation,
    resolveHomeItemHealthCardStyle,
} from '../../lib/homeItemHealthPresentation';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

export default function HomeItemAssemblyView({
    item,
    components,
    availableComponents,
    onOpenComponent,
    onAddComponent,
    manageControl,
    message,
}: {
    item: HomeItemHierarchyRecord;
    components: HomeItemHierarchyRecord[];
    availableComponents: HomeOSStarterCardChoice[];
    onOpenComponent: (component: HomeItemHierarchyRecord) => void;
    onAddComponent: (component: HomeOSStarterCardChoice) => void;
    manageControl?: ReactNode;
    message?: string;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const { width: viewportWidth } = useWindowDimensions();
    const contentWidth = Math.min(Math.max(viewportWidth - foundation.spacing.comfortable * 2, 0), 960);
    const gridGap = foundation.grid.gap;
    const minimumWidth = foundation.grid.equipmentMinimumWidth;
    const columns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth: minimumWidth,
        gap: gridGap,
    });
    const cardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns,
        gap: gridGap,
        minimumItemWidth: minimumWidth,
        maximumItemWidth: scaleIcon(220),
    });
    const itemDisplay = resolveHomeItemDisplay(item);
    const itemName = itemDisplay.title || 'Equipment';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
                padding: foundation.spacing.comfortable,
                paddingBottom: scaleIcon(42),
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 960, gap: foundation.spacing.comfortable }}>
                <HomeHeader />

                <EquipmentDetailHeader
                    title={itemName}
                    semanticIdentity={cleanText(item.starter_template_key) || undefined}
                    type={itemDisplay.placementLabel || undefined}
                    details={resolveHomeItemCardDetails(item)}
                    visual={resolveHomeOSEquipmentVisual(item.photo_url)}
                />

                {manageControl ? (
                    <View style={{ alignItems: 'flex-start' }}>{manageControl}</View>
                ) : null}

                <View style={{ gap: foundation.spacing.regular }}>
                    <Text
                        selectable
                        accessibilityRole="header"
                        style={foundation.typography.destinationTitle}
                    >
                        Components
                    </Text>

                    {components.length > 0 ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
                            {components.map((component) => {
                                const componentDisplay = resolveHomeItemDisplay(component);
                                const componentName = componentDisplay.title;
                                const itemSlug = cleanText(component.item_slug);
                                const health = resolveHomeItemHealthCardPresentation(component);

                                return (
                                    <EquipmentContainer
                                        key={cleanText(component.id) || itemSlug || componentName}
                                        title={componentName}
                                        semanticIdentity={cleanText(component.starter_template_key) || undefined}
                                        detail={[
                                            `Status: ${health.label}`,
                                            componentDisplay.placementLabel,
                                        ].filter(Boolean).join(' · ')}
                                        visual={resolveHomeOSEquipmentVisual(component.photo_url)}
                                        accessibilityLabel={itemSlug
                                            ? `Open ${componentName} details. Status: ${health.label}`
                                            : `${componentName} details unavailable. Status: ${health.label}`}
                                        disabled={!itemSlug}
                                        onPress={itemSlug ? () => onOpenComponent(component) : undefined}
                                        style={[
                                            resolveHomeItemHealthCardStyle(health.tone, theme),
                                            { width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth },
                                        ]}
                                    />
                                );
                            })}
                        </View>
                    ) : (
                        <View style={[foundation.surface, { padding: foundation.spacing.comfortable }]}>
                            <Text selectable style={foundation.typography.body}>
                                No Component Cards have been added to this {itemName} yet. Choose an applicable master card below when the part is observed.
                            </Text>
                        </View>
                    )}

                    {availableComponents.length > 0 ? (
                        <View style={{ gap: foundation.spacing.regular }}>
                            <View style={{ gap: foundation.spacing.compact }}>
                                <Text selectable style={foundation.typography.containerTitle}>Available from Card Deck</Text>
                                <Text selectable style={foundation.typography.body}>
                                    These are compatible Super Admin master cards. Opening one adds its own HomeOS instance; it does not claim the part is already installed.
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
                                {availableComponents.map((component) => (
                                    <EquipmentContainer
                                        key={component.templateKey}
                                        title={component.name}
                                        semanticIdentity={component.templateKey}
                                        detail="Master Component Card · Not added"
                                        accessibilityLabel={`Add ${component.name} from the HomeOS Card Deck`}
                                        onPress={() => onAddComponent(component)}
                                        style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
                                    />
                                ))}
                            </View>
                        </View>
                    ) : null}
                </View>

                {message ? (
                    <Text selectable accessibilityLiveRegion="polite" style={{ color: theme.colors.danger, fontSize: scaleFont(15) }}>
                        {message}
                    </Text>
                ) : null}
            </View>
        </ScrollView>
    );
}

function cleanText(value: unknown) {
    return String(value || '').trim();
}
