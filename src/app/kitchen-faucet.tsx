import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import EquipmentDetailTemplate from '../components/templates/EquipmentDetailTemplate';
import { STATUS } from '../constants/status';

function openPlumbingItem(itemId: string) {
    router.push(`/item/${itemId}` as any);
}

export default function KitchenFaucetScreen() {
    return (
        <View style={{ flex: 1 }}>
            <Pressable
                onPress={() => router.push('/system/plumbing/areas' as any)}
                style={{
                    padding: 20,
                    backgroundColor: '#F6F8FB',
                }}
            >
                <Text
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: '#071B33',
                    }}
                >
                    ← Back
                </Text>
            </Pressable>

            <EquipmentDetailTemplate
                name="Kitchen Sink Area"
                backRoute="/system/plumbing/areas"
                status={STATUS.MISSING}
                statusReason="This area has not been fully documented or inspected yet."
                priority="Fixture Related"
                manufacturer="Unknown"
                model="Unknown"
                serial="N/A"
                installDate="Unknown"
                warranty="Unknown"
                aboutEquipment="The Kitchen Sink Area is a parent fixture area that includes the faucet, angle stops, supply lines, sink drain assembly, garbage disposal, dishwasher connections, air gap, and optional accessories such as a reverse osmosis system, instant hot system, or refrigerator water line."
                whyThisEquipmentMatters="The kitchen sink is one of the most frequently used plumbing areas in the home. Small leaks, worn supply lines, loose drain connections, failed disposals, or damaged dishwasher connections can lead to water damage inside cabinets, flooring, walls, and nearby equipment. Keeping this area documented helps homeowners and technicians identify problems before they become major repairs."
                commonProblems={[
                    'Leaking angle stops.',
                    'Failed supply lines.',
                    'Leaking faucet cartridge.',
                    'Loose drain assembly connections.',
                    'Failed garbage disposal.',
                    'Dishwasher drain hose leaks.',
                    'Blocked or improperly connected air gap.',
                    'Corroded basket strainer.',
                    'Slow drainage due to buildup.',
                ]}
                recommendedMaintenance={[
                    {
                        title: 'Under-Sink Inspection',
                        description:
                            'Inspect all valves, supply lines, drains, disposal connections, and hoses for leaks, corrosion, staining, or moisture.',
                    },
                    {
                        title: 'Exercise Angle Stops',
                        description:
                            'Operate hot and cold angle stops periodically to help prevent them from becoming stuck during an emergency shutoff situation.',
                    },
                    {
                        title: 'Inspect Garbage Disposal',
                        description:
                            'Check for vibration, unusual noise, leakage, corrosion, or signs of wear around the disposal body and connections.',
                    },
                    {
                        title: 'Inspect Dishwasher Connections',
                        description:
                            'Verify drain and supply connections remain secure and free of leakage.',
                    },
                    {
                        title: 'Inspect Drain Assembly',
                        description:
                            'Check the basket strainer, trap, waste arm, and drain fittings for leaks or deterioration.',
                    },
                ]}
                recommendations={[
                    'Document the kitchen faucet brand and model.',
                    'Document hot and cold angle stops.',
                    'Inspect supply lines for corrosion or wear.',
                    'Inspect garbage disposal for leaks and vibration.',
                    'Inspect P-trap and drain connections.',
                    'Check dishwasher air gap and drain hose.',
                    'Verify refrigerator or ice maker line if present.',
                ]}
                specifications={[
                    'Kitchen Faucet',
                    'Hot and Cold Angle Stops',
                    'Hot and Cold Supply Lines',
                    'Sink Drain Assembly',
                    'P-Trap',
                    'Garbage Disposal',
                    'Dishwasher Air Gap',
                    'Dishwasher Drain Hose',
                    'Dishwasher Supply Line',
                    'Optional RO System',
                    'Optional InstaHot',
                    'Optional Refrigerator / Ice Maker Line',
                ]}
                history={[
                    'Kitchen sink area added to HomeOS',
                    'Inspection details not completed yet',
                ]}
                components={[
                    {
                        name: 'Kitchen Faucet',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('kitchen-faucet'),
                    },
                    {
                        name: 'Hot Angle Stop',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('hot-angle-stop'),
                    },
                    {
                        name: 'Cold Angle Stop',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('cold-angle-stop'),
                    },
                    {
                        name: 'Hot Supply Line',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('hot-supply-line'),
                    },
                    {
                        name: 'Cold Supply Line',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('cold-supply-line'),
                    },
                    {
                        name: 'Faucet Cartridge',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('faucet-cartridge'),
                    },
                    {
                        name: 'Sprayer Hose',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('sprayer-hose'),
                    },
                    {
                        name: 'Sink Drain Assembly',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('sink-drain-assembly'),
                    },
                    {
                        name: 'Basket Strainer',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('basket-strainer'),
                    },
                    {
                        name: 'P-Trap',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('p-trap'),
                    },
                    {
                        name: 'Waste Arm',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('waste-arm'),
                    },
                    {
                        name: 'Garbage Disposal',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('garbage-disposal'),
                    },
                    {
                        name: 'Disposal Power Connection',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('disposal-power-connection'),
                    },
                    {
                        name: 'Dishwasher Air Gap',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('dishwasher-air-gap'),
                    },
                    {
                        name: 'Dishwasher Drain Hose',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('dishwasher-drain-hose'),
                    },
                    {
                        name: 'Dishwasher Supply Line',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('dishwasher-supply-line'),
                    },
                    {
                        name: 'RO System',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('ro-system'),
                    },
                    {
                        name: 'InstaHot',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('instahot'),
                    },
                    {
                        name: 'Refrigerator / Ice Maker Line',
                        status: STATUS.NOT_INSPECTED,
                        onPress: () => openPlumbingItem('refrigerator-ice-maker-line'),
                    },
                ]}
                notes="Kitchen Sink Area is a parent fixture area. It includes faucet, angle stops, supply lines, drain assembly, garbage disposal, dishwasher connections, air gap, and optional RO, InstaHot, or ice maker connections. Future versions will allow technicians to add, remove, edit, and document components individually."
            />
        </View>
    );
}