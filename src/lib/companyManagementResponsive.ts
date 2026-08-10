export const COMPANY_MANAGEMENT_PHONE_MAX_WIDTH = 640;

export function resolveCompanyManagementResponsiveLayout(viewportWidth: number) {
    const isPhoneLayout = viewportWidth <= COMPANY_MANAGEMENT_PHONE_MAX_WIDTH;

    return {
        isPhoneLayout,
        stackLeadAlertContent: isPhoneLayout,
        constrainLeadAlertActions: isPhoneLayout,
    };
}
