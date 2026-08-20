export type HomeOSStarterPresentationRole = 'container' | 'component';

export function homeOSStarterPresentationRole(value: unknown): HomeOSStarterPresentationRole | undefined {
    return value === 'container' || value === 'component' ? value : undefined;
}
