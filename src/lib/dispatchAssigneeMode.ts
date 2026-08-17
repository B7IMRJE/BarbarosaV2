export type DispatchAssigneeType = 'technician' | 'sales';

export type DispatchScheduleRpcCall =
    | {
        rpcName: 'schedule_service_request_slot';
        assigneeArgs: { p_technician_company_user_id: string };
    }
    | {
        rpcName: 'schedule_sales_service_request_slot';
        assigneeArgs: {
            p_sales_company_user_id: string;
            p_assignment_kind: 'sales_visit';
        };
    };

export function resolveDispatchScheduleRpcCall(
    assigneeType: DispatchAssigneeType,
    companyUserId: string,
): DispatchScheduleRpcCall {
    const cleanCompanyUserId = String(companyUserId || '').trim();

    if (assigneeType === 'sales') {
        return {
            rpcName: 'schedule_sales_service_request_slot',
            assigneeArgs: {
                p_sales_company_user_id: cleanCompanyUserId,
                p_assignment_kind: 'sales_visit',
            },
        };
    }

    return {
        rpcName: 'schedule_service_request_slot',
        assigneeArgs: { p_technician_company_user_id: cleanCompanyUserId },
    };
}
