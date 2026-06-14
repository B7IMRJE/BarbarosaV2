import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import EquipmentDetailTemplate from '../components/templates/EquipmentDetailTemplate';
import { STATUS } from '../constants/status';

export default function PRVScreen() {
    return (
        <View style={{ flex: 1 }}>
            <Pressable
                onPress={() => router.push('/water-service')}
                style={{
                    padding: 20,
                    backgroundColor: '#F6F8FB',
                }}
            />

            <EquipmentDetailTemplate
                name="Pressure Regulator Valve (PRV)"
                status={STATUS.GOOD}
                statusReason="Current records show the PRV is installed and no active leak has been reported."
                priority="Pressure Protection Related"
                manufacturer="Wilkins"
                model="70XL"
                serial="PRV-987654"
                installDate="2024"
                warranty="10 Years"
                aboutEquipment="A pressure regulator valve, commonly called a PRV, controls the water pressure entering the home. It is usually installed near the main water service, water riser, garage entry point, or other service-entry area. The PRV helps reduce high incoming city water pressure to a safer pressure for the home plumbing system."
                whyThisEquipmentMatters="The PRV matters because excessive water pressure can damage plumbing components over time. High pressure can stress faucets, toilet fill valves, shower cartridges, supply lines, water heaters, angle stops, ice maker lines, washing machine hoses, and other fixtures. A properly operating PRV helps protect the entire plumbing system by keeping the pressure within a safer operating range."
                commonProblems={[
                    'Outlet pressure is too high or too low.',
                    'Pressure fluctuates or creeps up after fixtures are closed.',
                    'PRV body or nearby fittings leak.',
                    'Adjustment screw is damaged, seized, or improperly set.',
                    'Internal cartridge or diaphragm fails.',
                    'PRV is missing where high incoming pressure exists.',
                    'Home pressure and irrigation pressure are not properly separated when needed.',
                    'Nearby shutoff valves are stuck or not clearly identified.',
                ]}
                recommendedMaintenance={[
                    {
                        title: 'Annual Water Pressure Check',
                        description:
                            'Check the home water pressure at least once a year or anytime pressure-related symptoms appear. High pressure can shorten the life of fixtures, valves, appliances, and water heater components.',
                    },
                    {
                        title: 'PRV Leak Inspection',
                        description:
                            'Inspect the PRV body, unions, adapters, solder joints, threaded fittings, and nearby valves for corrosion, staining, mineral buildup, or active leakage.',
                    },
                    {
                        title: 'Verify Pressure Stability',
                        description:
                            'A PRV may appear normal at first but allow pressure creep over time. Pressure should remain stable after fixtures are closed. If pressure rises significantly, the PRV may need service or replacement.',
                    },
                    {
                        title: 'Identify Nearby Valves',
                        description:
                            'The main shutoff, irrigation shutoff, ADU branch valves, hose bibs, backflow devices, and filtration connections should be identified and documented so you or your service provider knows what each valve controls.',
                    },
                ]}
                recommendations={[
                    'Check home water pressure annually.',
                    'Verify outlet pressure remains stable.',
                    'Inspect PRV body and fittings for leaks.',
                    'Inspect nearby shutoff valves.',
                    'Confirm irrigation and home pressures are separated when applicable.',
                ]}
                specifications={[
                    'Type: Pressure Regulating Valve',
                    'Size: 3/4 Inch',
                    'Made From: Lead-Free Brass',
                    'Adjustable Pressure Range: 25-75 PSI',
                    'Current Setting: Approximately 60 PSI',
                ]}
                history={[
                    'Installed 2024',
                    'Pressure checked 2026',
                    'No active leak detected',
                ]}
                components={[
                    {
                        name: 'Main Water Shutoff Valve',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Water Main Riser',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Irrigation Shutoff Valve',
                        status: STATUS.NOT_INSPECTED,
                    },
                    {
                        name: 'Hose Bib',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Hose Bib Vacuum Breaker',
                        status: STATUS.MAINTENANCE_RECOMMENDED,
                    },
                    {
                        name: 'Backflow Preventer',
                        status: STATUS.MAINTENANCE_RECOMMENDED,
                    },
                    {
                        name: 'Water Filtration Connection',
                        status: STATUS.NOT_INSPECTED,
                    },
                    {
                        name: 'Additional Building / ADU Valve',
                        status: STATUS.NOT_INSPECTED,
                    },
                ]}
                notes="PRV belongs under the Water Service area, not under the Water Heater. Nearby related items may include the main shutoff, irrigation shutoff, hose bib, vacuum breaker, backflow device, water filtration connection, and separate building or ADU valves if present."
            />
        </View>
    );
}
