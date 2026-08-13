export type HomeItemEstimateWorkspaceContext = {
    hasEstimateAccess: boolean;
    isManagementMode: boolean;
    isProviderMode: boolean;
};

export function canShowHomeItemEstimateTools(context: HomeItemEstimateWorkspaceContext) {
    return context.hasEstimateAccess && (context.isManagementMode || context.isProviderMode);
}
