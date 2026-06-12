import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import EquipmentDetailTemplate from '../components/templates/EquipmentDetailTemplate';
import { STATUS } from '../constants/status';

export default function WaterHeaterScreen() {
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
                name="Water Heater"
                status={STATUS.NEEDS_ATTENTION}
                statusReason="Maintenance items are due and the drain pan is missing."
                priority="Maintenance Related / Protection Related"
                manufacturer="Rheem"
                model="50 Gallon Tank"
                serial="WH-123456"
                installDate="2022"
                warranty="8 Years Remaining"
                aboutEquipment="A water heater heats and stores domestic hot water for the home. This system supplies hot water to showers, tubs, lavatory faucets, kitchen faucets, laundry fixtures, and appliances that require hot water. A tank-style water heater also includes safety and protection components such as a T&P valve, gas control system, venting system, drain valve, earthquake straps, and often an expansion tank depending on the plumbing system design."
                whyThisEquipmentMatters="The water heater is one of the most important plumbing appliances in the home because it provides daily hot water and stores a large volume of pressurized heated water. Proper maintenance helps maximize life expectancy, reduce failures, and protect nearby property from water damage. This record exists to track condition, maintenance history, warranty information, and connected components."
                commonProblems={[
                    'Sediment buildup inside the tank.',
                    'Leaking tank or leaking water connections.',
                    'Failed or missing expansion tank.',
                    'Missing drain pan.',
                    'Loose or missing earthquake straps.',
                    'Improper venting.',
                    'Corrosion at fittings or connectors.',
                    'Water temperature set too high.',
                    'Failed gas control or burner components.',
                ]}
                recommendedMaintenance={[
                    {
                        title: 'Annual Water Heater Flush',
                        description:
                            'A flush helps remove sediment from the tank and may improve efficiency and longevity.',
                    },
                    {
                        title: 'Visual Leak Inspection',
                        description:
                            'Inspect all water, gas, venting, and safety connections for leaks or deterioration.',
                    },
                    {
                        title: 'Expansion Tank Inspection',
                        description:
                            'Verify the expansion tank is present when required and operating properly.',
                    },
                    {
                        title: 'T&P Valve Inspection',
                        description:
                            'Inspect the temperature and pressure relief valve and discharge piping.',
                    },
                    {
                        title: 'Earthquake Strap Inspection',
                        description:
                            'Verify straps remain secure and properly installed.',
                    },
                ]}
                recommendations={[
                    'Flush annually.',
                    'Inspect T&P valve and discharge piping.',
                    'Inspect for leaks and corrosion.',
                    'Verify expansion tank condition.',
                    'Verify earthquake straps are secure.',
                ]}
                specifications={[
                    'Tank Type: Standard Storage Tank',
                    'Capacity: 50 Gallons',
                    'Fuel Type: Gas',
                    'Expected Life: 8–12 Years',
                ]}
                history={[
                    'Installed 2022',
                    'Inspected 2026',
                    'Expansion tank inspected',
                    'Drain pan missing',
                ]}
                components={[
                    {
                        name: 'Expansion Tank',
                        status: STATUS.GOOD,
                        onPress: () => router.push('/expansion-tank'),
                    },
                    {
                        name: 'T&P Valve',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'T&P Discharge Line',
                        status: STATUS.NOT_INSPECTED,
                    },
                    {
                        name: 'Drain Pan',
                        status: STATUS.MISSING,
                    },
                    {
                        name: 'Earthquake Straps',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Gas Valve',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Burner Assembly',
                        status: STATUS.NOT_INSPECTED,
                    },
                ]}
                notes="The water heater is operating normally, but the missing drain pan and overdue maintenance items should be addressed to improve protection and long-term reliability."
            />
        </View>
    );
}