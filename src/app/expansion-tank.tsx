import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import EquipmentDetailTemplate from '../components/templates/EquipmentDetailTemplate';
import { STATUS } from '../constants/status';

export default function ExpansionTankScreen() {
    return (
        <View style={{ flex: 1 }}>
            <Pressable
                onPress={() => router.push('/water-heater')}
                style={{
                    padding: 20,
                    backgroundColor: '#F6F8FB',
                }}
            />

            <EquipmentDetailTemplate
                name="Expansion Tank"
                status={STATUS.GOOD}
                statusReason="Expansion tank is present and no visible leak or corrosion has been documented."
                priority="Protection Related"
                manufacturer="NeoLogic"
                model="NTX-2"
                serial="123456"
                installDate="2024"
                warranty="5 Years"
                aboutEquipment="An expansion tank is a pressure-control device usually installed near the water heater. When water heats up, it expands. If the plumbing system is closed by a PRV, check valve, or backflow device, that expanding water needs somewhere to go. The expansion tank helps absorb that pressure change."
                whyThisEquipmentMatters="The expansion tank helps protect the water heater and plumbing system from thermal expansion pressure. Without proper expansion control, pressure can stress the water heater, supply lines, valves, cartridges, toilet fill valves, and other plumbing parts. A failed or missing expansion tank may not always create an immediate visible problem, but over time it can contribute to nuisance leaks, relief valve discharge, and premature wear."
                commonProblems={[
                    'Failed internal bladder.',
                    'Incorrect air precharge.',
                    'Undersized tank.',
                    'Visible rust or corrosion.',
                    'Waterlogged expansion tank.',
                    'Improper support or installation.',
                    'T&P valve discharge caused by thermal expansion pressure.',
                ]}
                recommendedMaintenance={[
                    {
                        title: 'Annual Visual Inspection',
                        description:
                            'Inspect the expansion tank and connection for rust, leaks, corrosion, moisture, or signs of stress.',
                    },
                    {
                        title: 'Pressure / Precharge Check',
                        description:
                            'The expansion tank air charge should be checked when the system is depressurized. The precharge should generally match the home water pressure.',
                    },
                    {
                        title: 'Replace If Failed',
                        description:
                            'If the bladder fails, the tank becomes waterlogged and can no longer absorb expansion pressure properly.',
                    },
                ]}
                recommendations={[
                    'Inspect annually.',
                    'Replace if leaking, rusted, corroded, or waterlogged.',
                    'Check precharge pressure during service.',
                    'Match precharge to home water pressure.',
                    'Confirm tank size is appropriate for the water heater and system conditions.',
                ]}
                specifications={[
                    'Size: 2 Gallon',
                    'Maximum Pressure: 150 PSI',
                    'Maximum Temperature: 200°F',
                    'Factory Precharge: 40 PSI',
                ]}
                history={[
                    'Installed 2024',
                    'Pressure check documented 2026',
                ]}
                components={[
                    {
                        name: 'Tank Body',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Air Valve',
                        status: STATUS.NOT_INSPECTED,
                    },
                    {
                        name: 'Connection Fitting',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Support / Mounting',
                        status: STATUS.NEEDS_ATTENTION,
                    },
                ]}
                notes="Expansion tank is operating normally based on current records. Future service should verify precharge pressure and tank condition."
            />
        </View>
    );
}