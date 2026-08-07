import type { TechOSJobDetailVisualKey } from './techosAppearance';

export const TECHOS_JOB_WORKSPACE_SECTIONS = [
    {
        key: 'summary',
        title: 'Job Summary',
        description: 'Customer, appointment, and request details',
        icon: 'clipboard-text-outline',
        variantKey: 'customer',
    },
    {
        key: 'messages',
        title: 'Dispatch Messages',
        description: 'Chat or request assistance',
        icon: 'message-text-outline',
        variantKey: 'note',
    },
    {
        key: 'media',
        title: 'Photos & Videos',
        description: 'Homeowner request media',
        icon: 'image-multiple-outline',
        variantKey: 'request',
    },
    {
        key: 'workflow',
        title: 'Job Status',
        description: 'Current stage and next action',
        icon: 'progress-check',
        variantKey: 'workflow',
    },
    {
        key: 'note',
        title: 'Job Note',
        description: 'Update Dispatch and the job record',
        icon: 'note-edit-outline',
        variantKey: 'note',
    },
    {
        key: 'estimate',
        title: 'Quote / Estimate',
        description: 'Build or continue customer pricing',
        icon: 'file-document-edit-outline',
        variantKey: 'estimate',
    },
    {
        key: 'finish',
        title: 'Finish Visit',
        description: 'Outcome, follow-up, and close visit',
        icon: 'clipboard-check-outline',
        variantKey: 'finish',
    },
    {
        key: 'availability',
        title: 'Next Job',
        description: 'Tell Dispatch your availability',
        icon: 'calendar-arrow-right',
        variantKey: 'status',
    },
] as const satisfies readonly {
    key: string;
    title: string;
    description: string;
    icon: string;
    variantKey: TechOSJobDetailVisualKey;
}[];

export type TechOSJobWorkspaceSectionKey = typeof TECHOS_JOB_WORKSPACE_SECTIONS[number]['key'];

export function toggleTechOSJobWorkspaceSection(
    currentSection: TechOSJobWorkspaceSectionKey | null,
    requestedSection: TechOSJobWorkspaceSectionKey
) {
    return currentSection === requestedSection ? null : requestedSection;
}
