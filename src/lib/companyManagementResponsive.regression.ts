import { resolveCompanyManagementResponsiveLayout } from './companyManagementResponsive';

runCompanyManagementResponsiveRegressions();

export function runCompanyManagementResponsiveRegressions() {
    phoneWidthsConstrainLeadAlertActions();
    wideLayoutsPreserveInlineLeadAlertActions();
}

function phoneWidthsConstrainLeadAlertActions() {
    for (const width of [320, 375, 390]) {
        const layout = resolveCompanyManagementResponsiveLayout(width);

        assert(layout.isPhoneLayout, `${width}px must use the phone layout.`);
        assert(layout.stackLeadAlertContent, `${width}px must stack the lead alert content.`);
        assert(layout.constrainLeadAlertActions, `${width}px must constrain actions to the card width.`);
    }
}

function wideLayoutsPreserveInlineLeadAlertActions() {
    const layout = resolveCompanyManagementResponsiveLayout(1180);

    assert(!layout.isPhoneLayout, 'Wide layouts must keep the desktop presentation.');
    assert(!layout.stackLeadAlertContent, 'Wide lead alerts must remain inline.');
    assert(!layout.constrainLeadAlertActions, 'Wide actions must retain their natural width.');
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Company management responsive regression failed: ${message}`);
    }
}
