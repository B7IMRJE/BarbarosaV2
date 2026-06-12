import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import EquipmentDetailTemplate from '../components/templates/EquipmentDetailTemplate';
import { STATUS } from '../constants/status';

export default function WaterServiceScreen() {
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
                name="Water Service"
                status={STATUS.GOOD}
                statusReason="No active water service issues have been reported."
                priority="Normal"
                manufacturer="Home Water System"
                model="Municipal Water Service"
                serial="N/A"
                installDate="Unknown"
                warranty="Varies By Component"
                aboutEquipment="The water service is the main entry point where water comes into the home. This area may include the water main, main shutoff valve, pressure regulator valve, backflow device, hose bib, irrigation shutoff, and branches feeding other buildings or systems."
                whyThisEquipmentMatters="The water service is one of the most important plumbing areas in the home because it controls and protects the incoming water supply. If a leak, burst pipe, water heater failure, toilet overflow, irrigation break, or supply line failure occurs, the main shutoff valve in this area may be the fastest way to stop water damage. Keeping this area documented helps homeowners, plumbers, emergency responders, and property managers quickly locate the correct valves and understand how water is distributed through the property."
                commonProblems={[
                    'Homeowner does not know where the main shutoff valve is located.',
                    'Main shutoff valve is stuck, broken, buried, blocked, or difficult to access.',
                    'Pressure regulator valve is failed, leaking, or set incorrectly.',
                    'Incoming water pressure is too high or too low.',
                    'Backflow preventer or vacuum breaker is missing, leaking, or due for inspection.',
                    'Irrigation shutoff valve is not clearly identified.',
                    'Separate building, ADU, garage, or branch valves are not labeled.',
                    'Hose bibs or vacuum breakers show signs of leaking, corrosion, or damage.',
                ]}
                recommendedMaintenance={[
                    {
                        title: 'Locate And Label Main Shutoff Valve',
                        description:
                            'The homeowner should know where the main water shutoff is located. In an emergency, being able to shut off the water quickly can reduce damage from leaks, burst pipes, failed supply lines, water heater leaks, or fixture failures.',
                    },
                    {
                        title: 'Exercise Shutoff Valves',
                        description:
                            'Shutoff valves should be carefully operated periodically to help confirm they still move and can be used when needed. Skipping this task may allow valves to become stuck over time, which can make an emergency harder to control.',
                    },
                    {
                        title: 'Annual Water Pressure Check',
                        description:
                            'Water pressure should be checked periodically. Excessive pressure can damage fixtures, cartridges, toilet fill valves, supply lines, appliances, water heaters, and other plumbing components. Low pressure can indicate restrictions, valve issues, or system problems.',
                    },
                    {
                        title: 'Inspect Backflow And Vacuum Breaker Devices',
                        description:
                            'Backflow preventers and vacuum breakers help protect the water supply from contamination. These devices should be inspected when present and maintained according to local requirements and system design.',
                    },
                    {
                        title: 'Identify Irrigation And Building Branch Valves',
                        description:
                            'Properties may have separate valves for irrigation, ADUs, detached garages, additions, or other buildings. Labeling these valves helps technicians and homeowners isolate only the affected system instead of shutting down the entire property.',
                    },
                ]}
                recommendations={[
                    'Inspect water pressure annually.',
                    'Exercise shutoff valves annually.',
                    'Inspect hose bib vacuum breakers.',
                    'Inspect backflow devices.',
                    'Label irrigation, ADU, and additional building valves when present.',
                ]}
                specifications={[
                    'Main Water Entry Point',
                    'Contains Service Components',
                    'Feeds Entire Home',
                    'May Support Irrigation, ADUs, Garages, Or Other Building Branches',
                ]}
                history={[
                    'Pressure checked 2026',
                    'PRV inspected 2026',
                    'No active leak detected',
                ]}
                components={[
                    {
                        name: 'Pressure Regulator Valve',
                        status: STATUS.GOOD,
                        onPress: () => router.push('/prv'),
                    },
                    {
                        name: 'Main Water Shutoff Valve',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Water Main',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Backflow Preventer',
                        status: STATUS.MAINTENANCE_RECOMMENDED,
                    },
                    {
                        name: 'Irrigation Shutoff Valve',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Hose Bib',
                        status: STATUS.GOOD,
                    },
                    {
                        name: 'Vacuum Breaker',
                        status: STATUS.NEEDS_ATTENTION,
                    },
                    {
                        name: 'Additional Building / ADU Valve',
                        status: STATUS.NOT_INSPECTED,
                    },
                ]}
                notes="Water Service is the parent asset for the home's incoming water system. All service-entry components should be tracked here so homeowners and technicians know where valves are located, what they control, and what needs attention."
            />
        </View>
    );
}