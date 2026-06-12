import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import EquipmentDetailTemplate from '../components/templates/EquipmentDetailTemplate';
import { STATUS } from '../constants/status';

export default function Halo5Screen() {
    return (
        <View style={{ flex: 1 }}>
            <Pressable
                onPress={() => router.push('/equipment')}
                style={{
                    padding: 20,
                    backgroundColor: '#F6F8FB',
                }}
            />

            <EquipmentDetailTemplate
                name="Halo 5 Water System"
                status={STATUS.GOOD}
                statusReason="System is installed and no active water quality or flow issue has been reported."
                priority="Water Quality / Scale Protection"
                manufacturer="Halo Water Systems"
                model="Halo 5"
                serial="HW-2025-001"
                installDate="2025"
                warranty="Lifetime"
                aboutEquipment="The Halo 5 is a whole-house water conditioning system. It is designed to treat incoming water before it reaches fixtures, appliances, water heaters, faucets, showers, and other plumbing components."
                whyThisEquipmentMatters="A whole-house water treatment system can help improve water quality and reduce scale-related problems depending on local water conditions. It may help protect fixtures, cartridges, water heaters, shower heads, faucets, appliances, and other plumbing components from buildup. Unlike required safety equipment, this type of system is usually considered a water quality and protection upgrade, not a required code item."
                commonProblems={[
                    'Bypass valve left in the wrong position.',
                    'Reduced flow caused by restriction or clogged pre-filter if installed.',
                    'Leaks at fittings, unions, adapters, or drain connections.',
                    'Homeowner does not know whether the system is active or bypassed.',
                    'System not documented with model, serial, warranty, or install date.',
                    'Nearby drain or discharge piping not clearly identified.',
                ]}
                recommendedMaintenance={[
                    {
                        title: 'Annual Visual Inspection',
                        description:
                            'Inspect the system body, bypass valve, fittings, adapters, and nearby drain connections for leaks, staining, corrosion, or signs of movement.',
                    },
                    {
                        title: 'Bypass Valve Check',
                        description:
                            'Verify the bypass valve is in the correct position. A system left in bypass may not treat water going into the home.',
                    },
                    {
                        title: 'Flow Check',
                        description:
                            'Monitor for unusual pressure loss or reduced flow. Reduced flow may indicate a restriction, clogged pre-filter, or another issue in the water service or treatment area.',
                    },
                    {
                        title: 'Document Warranty And Install Information',
                        description:
                            'Record model number, serial number, installation date, installer, warranty information, and photos so future homeowners and technicians can identify the system correctly.',
                    },
                ]}
                recommendations={[
                    'Inspect system annually.',
                    'Check bypass valves.',
                    'Inspect drain connections.',
                    'Verify flow rate remains normal.',
                    'Monitor for unusual pressure loss.',
                ]}
                specifications={[
                    'Whole House Conditioning',
                    'Salt-Free Technology',
                    'Scale Prevention',
                    'Low Maintenance Design',
                ]}
                history={[
                    'Installed 2025',
                    'Initial inspection passed',
                ]}
                components={[
                    {
                        name: 'Pre Filter',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Halo Conditioning Tank',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Bypass Valve',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Drain Assembly',
                        status: STATUS.NOT_INSPECTED,
                    },
                ]}
                notes="Halo 5 system is operating normally based on current records. This item should be treated as a water quality and plumbing protection upgrade, not a required safety item."
            />
        </View>
    );
}