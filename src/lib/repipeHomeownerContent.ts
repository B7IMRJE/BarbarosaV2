export type RepipeHomeownerGuideSection = {
    id: string;
    title: string;
    body: string;
};

export const repipeHomeownerGuideSections: RepipeHomeownerGuideSection[] = [
    {
        id: 'potable-water-scope',
        title: 'What a whole-home repipe covers',
        body: 'A whole-home repipe replaces the hot and cold potable-water distribution lines and reconnects only the fixtures and equipment named in this estimate. Drain, waste, and sewer piping are separate work unless a separate estimate line clearly includes them.',
    },
    {
        id: 'materials',
        title: 'Materials selected for this home',
        body: 'The estimate identifies the selected piping system, fixture connections, supports, insulation, valves, and protection components. Brand-specific warranties apply only when the written estimate names the verified brand and warranty term.',
    },
    {
        id: 'process',
        title: 'How the project proceeds',
        body: 'The project plan records the homeowner walkthrough, home-protection measures, installation, required inspections, patching scope, and final review. Permit and inspection timing depends on the local authority and the selections shown in the estimate.',
    },
    {
        id: 'verified-promises',
        title: 'Only confirmed promises are presented',
        body: 'Testing, workmanship warranties, manufacturer warranties, credentials, and optional equipment appear as included only when staff confirms them in this estimate. Marketing claims and unrelated customer or staff information are never added automatically.',
    },
];

const scopeDescriptions: Record<string, string> = {
    'distribution-piping': 'New hot and cold potable-water distribution piping using the material selected for this estimate.',
    'pipe-system': 'The written manufacturer or piping-system identity selected for this project.',
    'fixture-stubs': 'The selected material used for the exposed or accessible fixture stub connections.',
    'pipe-insulation': 'Insulation installed at the locations included in the scope to help limit heat loss, condensation, and freezing exposure.',
    'pipe-supports': 'Pipe supports and isolators used where included to secure tubing and reduce movement, vibration, abrasion, and noise.',
    'angle-stops': 'The confirmed quantity of fixture shutoff valves included in the estimate.',
    'other-valves': 'The confirmed quantity of other valves included in the estimate.',
    'full-port-shutoff': 'A full-port main shutoff selected for the documented water-service scope.',
    'pressure-regulator': 'A pressure regulator selected for the documented incoming-water conditions; final sizing and model remain project-specific.',
    'type-k-transition': 'Type K copper selected for the documented transition or service segment only where the estimate calls for it.',
    'red-brass-recirculation': 'Red-brass piping selected for the documented recirculation-pump connection only where the estimate calls for it.',
    'water-hammer-protection': 'The selected appliance connections include water-hammer protection at the locations named in the estimate.',
    'braided-connectors': 'New braided connectors are included only for the fixture and appliance groups listed in the estimate.',
    'exterior-components': 'The selected exterior shutoff, hose-bibb, or backflow-protection components are included only at the named locations.',
    'water-heater': 'Water-heater work is included as a separate confirmed project component.',
    'expansion-tank': 'A thermal expansion tank is included for the verified water-heater and pressure conditions.',
    'halo-5': 'A HALO 5 system is included as a separately confirmed equipment selection.',
    'flo-by-moen': 'A Flo by Moen smart shutoff is included as a separately confirmed equipment selection.',
    'water-main-riser': 'The water-main riser is included in the written repipe scope.',
    'walkthrough': 'A pre-work walkthrough with the homeowner is included to review access, sequence, timeline, and preparation.',
    'home-protection': 'Home-protection measures are included for the work areas identified in the estimate.',
    'permit-inspections': 'Permit and inspection coordination is included only as stated in the estimate and remains subject to local-authority scheduling.',
    'patching': 'Patching is included only to the extent stated in the estimate; finish, texture, and paint limits remain governed by the written scope.',
    'testing': 'Lead or asbestos testing is included only under the confirmed testing scope and by the qualified party named for the project.',
    'manufacturer-warranty': 'The stated manufacturer warranty is included only for the named product or piping system and is subject to its written terms.',
    'workmanship-warranty': 'The stated workmanship warranty is included only under the exact written term shown in the estimate.',
    'verified-credentials': 'The listed company credentials were explicitly entered for this estimate and should be current before presentation.',
};

const selectionLabelToScopeId: [string, string][] = [
    ['distribution piping', 'distribution-piping'],
    ['pipe system / brand', 'pipe-system'],
    ['fixture stubs', 'fixture-stubs'],
    ['pipe insulation', 'pipe-insulation'],
    ['pipe supports / isolators', 'pipe-supports'],
    ['angle stops', 'angle-stops'],
    ['other valves', 'other-valves'],
    ['full-port main shutoff', 'full-port-shutoff'],
    ['pressure regulator', 'pressure-regulator'],
    ['type k copper transition', 'type-k-transition'],
    ['red-brass recirculation connection', 'red-brass-recirculation'],
    ['water-hammer protection', 'water-hammer-protection'],
    ['braided connectors', 'braided-connectors'],
    ['exterior water components', 'exterior-components'],
    ['water heater', 'water-heater'],
    ['expansion tank', 'expansion-tank'],
    ['halo 5', 'halo-5'],
    ['flo by moen smart shutoff', 'flo-by-moen'],
    ['water main riser', 'water-main-riser'],
    ['homeowner walkthrough', 'walkthrough'],
    ['home protection', 'home-protection'],
    ['permit / inspections', 'permit-inspections'],
    ['patching', 'patching'],
    ['lead / asbestos testing', 'testing'],
    ['manufacturer warranty', 'manufacturer-warranty'],
    ['workmanship warranty', 'workmanship-warranty'],
    ['verified company credentials', 'verified-credentials'],
];

export function describeRepipeScopeItem(scopeId: string) {
    return scopeDescriptions[scopeId] || '';
}

export function describeRepipeCustomerSelection(selection: string) {
    const normalized = String(selection || '')
        .replace(/^included:\s*/i, '')
        .trim()
        .toLowerCase();
    const match = selectionLabelToScopeId.find(([label]) => normalized === label || normalized.startsWith(`${label}:`));

    return match ? describeRepipeScopeItem(match[1]) : '';
}

export function isRepipePresentationService(serviceType: string | null | undefined) {
    return String(serviceType || '').trim().toLowerCase() === 'whole_home_repipe';
}
