import { resolveDispatchScheduleRpcCall } from './dispatchAssigneeMode';

runDispatchAssigneeModeRegressions();

export function runDispatchAssigneeModeRegressions() {
    technicianAssignmentsKeepExistingScheduler();
    salesAssignmentsRequireDedicatedSalesVisitScheduler();
}

function technicianAssignmentsKeepExistingScheduler() {
    const call = resolveDispatchScheduleRpcCall('technician', ' tech-user ');
    assert(call.rpcName === 'schedule_service_request_slot', 'Technicians should keep the field-service scheduler.');
    assert(
        'p_technician_company_user_id' in call.assigneeArgs && call.assigneeArgs.p_technician_company_user_id === 'tech-user',
        'Technician assignments should pass only the technician company-user id.',
    );
}

function salesAssignmentsRequireDedicatedSalesVisitScheduler() {
    const call = resolveDispatchScheduleRpcCall('sales', ' sales-user ');
    assert(call.rpcName === 'schedule_sales_service_request_slot', 'Sales Tech must use the dedicated server-validated scheduler.');
    assert(
        'p_assignment_kind' in call.assigneeArgs && call.assigneeArgs.p_assignment_kind === 'sales_visit',
        'Sales Tech scheduling must explicitly identify a Sales Visit.',
    );
    assert(
        'p_sales_company_user_id' in call.assigneeArgs && call.assigneeArgs.p_sales_company_user_id === 'sales-user',
        'Sales Tech scheduling should pass the Sales company-user id.',
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
