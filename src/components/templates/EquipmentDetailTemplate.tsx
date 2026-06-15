import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { STATUS, type EquipmentStatus } from '../../constants/status';
import { isStaffRole, loadCurrentUserRole } from '../../lib/roles';
import { useTheme } from '../../theme/useTheme';
import ComponentCard from '../cards/ComponentCard';
import { getStatusCardStyle } from '../cards/SystemStatusCard';
import ThemedButton from '../theme/ThemedButton';
import ThemedCard from '../theme/ThemedCard';

type MaintenanceItem = {
    title: string;
    description: string;
    route?: string;
};

type EquipmentDetailTemplateProps = {
    name: string;
    backRoute?: string;
    healthScore?: number;
    status?: EquipmentStatus;
    statusReason?: string;
    priority?: string;
    manufacturer?: string;
    model?: string;
    serial?: string;
    installDate?: string;
    warranty?: string;
    aboutEquipment?: string;
    whyThisEquipmentMatters?: string;
    commonProblems?: string[];
    recommendedMaintenance?: MaintenanceItem[];
    recommendations?: string[];
    specifications?: string[];
    history?: string[];
    notes?: string;
    components?: {
        name: string;
        status: EquipmentStatus;
        onPress?: () => void;
    }[];
};

export default function EquipmentDetailTemplate({
    name,
    backRoute = '/equipment',
    status = STATUS.GOOD,
    statusReason = 'No active issues reported.',
    priority = 'Normal',
    manufacturer,
    model,
    serial,
    installDate,
    warranty,
    aboutEquipment,
    whyThisEquipmentMatters,
    commonProblems = [],
    recommendedMaintenance = [],
    recommendations = [],
    specifications = [],
    history = [],
    notes,
    components = [],
}: EquipmentDetailTemplateProps) {
    const { theme } = useTheme();
    const statusPanelStyle = getStatusCardStyle(status, theme);
    const [canUseStaffTools, setCanUseStaffTools] = useState(false);
    const homeownerActions = ['Upload Photo', 'Request Service', 'Report Emergency'];
    const staffActions = ['Add Service Record', 'Upload Invoice', 'Add Component', 'Edit', 'Remove'];
    const quickActions = canUseStaffTools
        ? [...homeownerActions, ...staffActions]
        : homeownerActions;

    useEffect(() => {
        loadRole();
    }, []);

    async function loadRole() {
        const role = await loadCurrentUserRole();

        setCanUseStaffTools(isStaffRole(role));
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1100 }}>
                <Pressable
                    onPress={() => router.push(backRoute as any)}
                    style={{
                        marginTop: 10,
                        marginBottom: 20,
                        alignSelf: 'flex-start',
                    }}
                >
                    <Text style={{ fontSize: 18, color: theme.colors.text, fontWeight: '900' }}>
                        Back
                    </Text>
                </Pressable>

                <Text style={{ fontSize: 34, fontWeight: '900', color: theme.colors.text, marginBottom: 24 }}>
                    {name}
                </Text>

                <View
                    style={[
                        statusCardStyle,
                        statusPanelStyle,
                        { borderRadius: theme.radii.card },
                    ]}
                >
                    <Text style={{ color: theme.colors.mutedText, fontSize: 14, fontWeight: '900', marginBottom: 8 }}>
                        Current Status
                    </Text>

                    <Text style={{ color: theme.colors.text, fontSize: 30, fontWeight: '900', marginBottom: 12 }}>
                        {status}
                    </Text>

                    <Text style={{ color: theme.colors.mutedText, fontSize: 16, lineHeight: 24, fontWeight: '800' }}>
                        Reason: {statusReason}
                    </Text>

                    <Text style={{ color: theme.colors.mutedText, fontSize: 16, marginTop: 8, fontWeight: '800' }}>
                        Priority: {priority}
                    </Text>
                </View>

                <ThemedCard style={sectionCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Equipment Photo</Text>

                    <View
                        style={{
                            height: 220,
                            backgroundColor: theme.colors.surfaceAlt,
                            borderRadius: theme.radii.button,
                            justifyContent: 'center',
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{ color: theme.colors.mutedText, fontSize: 18, fontWeight: '900' }}>Photo Placeholder</Text>
                    </View>
                </ThemedCard>

                <ThemedCard style={sectionCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Quick Actions</Text>

                    {quickActions.map((button) => (
                        <ThemedButton
                            key={button}
                            title={button}
                            style={{ marginBottom: 12 }}
                        />
                    ))}
                </ThemedCard>

                <ThemedCard style={sectionCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Equipment Information</Text>

                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Manufacturer: {manufacturer}</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Model: {model}</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Serial: {serial}</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Installed: {installDate}</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Warranty: {warranty}</Text>
                </ThemedCard>

                {aboutEquipment && (
                    <ThemedCard style={sectionCardStyle}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>About This Equipment</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{aboutEquipment}</Text>
                    </ThemedCard>
                )}

                {whyThisEquipmentMatters && (
                    <ThemedCard style={sectionCardStyle}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                            Why This Equipment Matters
                        </Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{whyThisEquipmentMatters}</Text>
                    </ThemedCard>
                )}

                {commonProblems.length > 0 && (
                    <ThemedCard style={sectionCardStyle}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                            Common Problems With This Equipment
                        </Text>

                        {commonProblems.map((item) => (
                            <Text key={item} style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                {item}
                            </Text>
                        ))}
                    </ThemedCard>
                )}

                {recommendedMaintenance.length > 0 && (
                    <ThemedCard style={sectionCardStyle}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                            Recommended Maintenance For This Equipment
                        </Text>

                        {recommendedMaintenance.map((item) => (
                            <View key={item.title} style={{ marginBottom: 16 }}>
                                <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900', marginBottom: 6 }}>{item.title}</Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{item.description}</Text>
                            </View>
                        ))}
                    </ThemedCard>
                )}

                <ThemedCard style={sectionCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Manufacturer Recommendations</Text>

                    {recommendations.map((item) => (
                        <Text key={item} style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            {item}
                        </Text>
                    ))}
                </ThemedCard>

                <ThemedCard style={sectionCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Specifications</Text>

                    {specifications.map((item) => (
                        <Text key={item} style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            {item}
                        </Text>
                    ))}
                </ThemedCard>

                <ThemedCard style={sectionCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Service History</Text>

                    {history.map((item) => (
                        <Text key={item} style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            {item}
                        </Text>
                    ))}
                </ThemedCard>

                {components.length > 0 && (
                    <View style={sectionCardStyle}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Related Parts</Text>

                        {components.map((component) => (
                            <ComponentCard
                                key={component.name}
                                name={component.name}
                                status={component.status}
                                onPress={component.onPress}
                            />
                        ))}
                    </View>
                )}

                <ThemedCard style={{ marginBottom: 50 }}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Notes</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{notes}</Text>
                </ThemedCard>
            </View>
        </ScrollView>
    );
}

const statusCardStyle = {
    padding: 24,
    borderWidth: 1,
    marginBottom: 20,
};

const sectionCardStyle = {
    marginBottom: 20,
};

const sectionTitleStyle = {
    fontSize: 20,
    fontWeight: '900' as const,
    marginBottom: 16,
};

const bodyTextStyle = {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
};
