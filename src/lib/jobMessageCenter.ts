import { supabase } from "./supabase";
export type JobMessageRow = {
  id: string;
  display_code: string | null;
  issue_summary: string | null;
  status: string | null;
  property_name: string;
  technician_name: string;
  latest_internal_message: string | null;
  latest_customer_message: string | null;
  unread_count: number;
  customer_unread_count: number;
  help_count: number;
};
export type SupervisorChoice = { id: string; full_name: string; role: string };
export type SupervisorRequest = {
  id: string;
  recipient_name: string;
  question: string;
  status: string;
  notification_status: string;
  can_update: boolean;
  created_at: string;
};
export async function jobMessageRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export function jobMessageArgs(companyId: string, requestId: string) {
  return { p_company_id: companyId, p_service_request_id: requestId };
}
export async function askJobSupervisor(
  companyId: string,
  requestId: string,
  recipientId: string,
  question: string,
) {
  const id = await jobMessageRpc<string>("request_job_supervisor", {
    ...jobMessageArgs(companyId, requestId),
    p_recipient_company_user_id: recipientId,
    p_question: question,
  });
  const { error } = await supabase.functions.invoke("send-supervisor-request", {
    body: { request_id: id },
  });
  return {
    id,
    notificationError: error
      ? "Your request is saved. The phone alert could not be sent; the supervisor can see it in Messages."
      : null,
  };
}
