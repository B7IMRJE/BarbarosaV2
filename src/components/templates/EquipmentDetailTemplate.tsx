import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { getStatusColor, STATUS, type EquipmentStatus } from '../../constants/status';
import ComponentCard from '../cards/ComponentCard';

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
    const statusColor = getStatusColor(status);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F6F8FB' }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
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
                    <Text style={{ fontSize: 18, color: '#071B33', fontWeight: 'bold' }}>
                        ← Back
                    </Text>
                </Pressable>

                <Text style={{ fontSize: 42, fontWeight: 'bold', color: '#071B33', marginBottom: 24 }}>
                    {name}
                </Text>

                <View style={{ backgroundColor: statusColor, padding: 24, borderRadius: 18, marginBottom: 20 }}>
                    <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>
                        Current Status
                    </Text>

                    <Text style={{ color: 'white', fontSize: 36, fontWeight: 'bold', marginBottom: 12 }}>
                        {status}
                    </Text>

                    <Text style={{ color: 'white', fontSize: 16, lineHeight: 24 }}>
                        Reason: {statusReason}
                    </Text>

                    <Text style={{ color: 'white', fontSize: 16, marginTop: 8 }}>
                        Priority: {priority}
                    </Text>
                </View>

                <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 20 }}>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Equipment Photo</Text>

                    <View
                        style={{
                            height: 220,
                            backgroundColor: '#E5E7EB',
                            borderRadius: 14,
                            justifyContent: 'center',
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{ color: '#6B7280', fontSize: 18 }}>Photo Placeholder</Text>
                    </View>
                </View>

                <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 20 }}>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Quick Actions</Text>

                    {['Add Service Record', 'Upload Photo', 'Upload Invoice', 'Request Service', 'Add Component', 'Edit', 'Remove'].map(
                        (button) => (
                            <Pressable
                                key={button}
                                style={{
                                    backgroundColor: '#071B33',
                                    paddingVertical: 18,
                                    borderRadius: 12,
                                    marginBottom: 12,
                                    alignItems: 'center',
                                }}
                            >
                                <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>{button}</Text>
                            </Pressable>
                        )
                    )}
                </View>

                <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 20 }}>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Equipment Information</Text>

                    <Text style={{ fontSize: 16, marginBottom: 8 }}>Manufacturer: {manufacturer}</Text>
                    <Text style={{ fontSize: 16, marginBottom: 8 }}>Model: {model}</Text>
                    <Text style={{ fontSize: 16, marginBottom: 8 }}>Serial: {serial}</Text>
                    <Text style={{ fontSize: 16, marginBottom: 8 }}>Installed: {installDate}</Text>
                    <Text style={{ fontSize: 16 }}>Warranty: {warranty}</Text>
                </View>

                {aboutEquipment && (
                    <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 20 }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>About This Equipment</Text>
                        <Text style={{ fontSize: 16, lineHeight: 24 }}>{aboutEquipment}</Text>
                    </View>
                )}

                {whyThisEquipmentMatters && (
                    <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 20 }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>
                            Why This Equipment Matters
                        </Text>
                        <Text style={{ fontSize: 16, lineHeight: 24 }}>{whyThisEquipmentMatters}</Text>
                    </View>
                )}

                {commonProblems.length > 0 && (
                    <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 20 }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>
                            Common Problems With This Equipment
                        </Text>

                        {commonProblems.map((item) => (
                            <Text key={item} style={{ fontSize: 16, marginBottom: 10 }}>
                                • {item}
                            </Text>
                        ))}
                    </View>
                )}

                {recommendedMaintenance.length > 0 && (
                    <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 20 }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>
                            Recommended Maintenance For This Equipment
                        </Text>

                        {recommendedMaintenance.map((item) => (
                            <View key={item.title} style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 17, fontWeight: 'bold', marginBottom: 6 }}>{item.title}</Text>
                                <Text style={{ fontSize: 16, lineHeight: 24 }}>{item.description}</Text>
                            </View>
                        ))}
                    </View>
                )}

                <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 20 }}>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Manufacturer Recommendations</Text>

                    {recommendations.map((item) => (
                        <Text key={item} style={{ fontSize: 16, marginBottom: 10 }}>
                            • {item}
                        </Text>
                    ))}
                </View>

                <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 20 }}>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Specifications</Text>

                    {specifications.map((item) => (
                        <Text key={item} style={{ fontSize: 16, marginBottom: 10 }}>
                            • {item}
                        </Text>
                    ))}
                </View>

                <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 20 }}>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Service History</Text>

                    {history.map((item) => (
                        <Text key={item} style={{ fontSize: 16, marginBottom: 10 }}>
                            • {item}
                        </Text>
                    ))}
                </View>

                {components.length > 0 && (
                    <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 20 }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Connected Components</Text>

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

                <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 18, marginBottom: 50 }}>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Notes</Text>
                    <Text style={{ fontSize: 16, lineHeight: 24 }}>{notes}</Text>
                </View>
            </View>
        </ScrollView>
    );
}