declare const Deno: { env: { get(name: string): string | undefined } };
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS")
      return new Response("ok", { headers: cors });
    if (request.method !== "POST")
      return json({ error: "Method not allowed." }, 405);
    const url = Deno.env.get("SUPABASE_URL"),
      anon = Deno.env.get("SUPABASE_ANON_KEY"),
      service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service)
      return json({ error: "Notification configuration unavailable." }, 503);
    const authorization = request.headers.get("authorization") || "";
    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, authorization },
    });
    if (!userResponse.ok) return json({ error: "Sign in required." }, 401);
    const user = await userResponse.json();
    const input = await request.json().catch(() => ({}));
    const id = String(input.request_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id))
      return json({ error: "Invalid request." }, 400);
    const headers = {
      apikey: service,
      authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
    };
    const claim = await fetch(
      `${url}/rest/v1/rpc/claim_job_supervisor_notification`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ p_request_id: id, p_actor_id: user.id }),
      },
    );
    if (!claim.ok) return json({ error: "Request cannot be notified." }, 403);
    const ticket = await claim.json();
    if (!ticket) return json({ status: "already_processed" });
    let status = "failed";
    try {
      const devicesResponse = await fetch(
        `${url}/rest/v1/communication_push_devices?active=eq.true&user_id=eq.${encodeURIComponent(ticket.recipient_user_id)}&select=expo_push_token`,
        { headers },
      );
      if (!devicesResponse.ok) throw new Error("Devices unavailable");
      const devices = await devicesResponse.json();
      if (!Array.isArray(devices) || !devices.length) status = "unavailable";
      else {
        const pushHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
        if (accessToken) pushHeaders.Authorization = `Bearer ${accessToken}`;
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: pushHeaders,
          body: JSON.stringify(
            devices.slice(0, 100).map((d: { expo_push_token: string }) => ({
              to: d.expo_push_token,
              title: "A technician needs your help",
              body: "Open the private job conversation to respond.",
              sound: "default",
              channelId: "homeos-updates",
              data: {
                route: `/job-messages?companyId=${ticket.company_id}&requestId=${ticket.service_request_id}`,
              },
            })),
          ),
        });
        const result = response.ok ? await response.json() : null;
        status = result?.data?.some(
          (t: { status: string }) => t.status === "ok",
        )
          ? "accepted"
          : "failed";
      }
    } catch {
      status = "failed";
    }
    const saved = await fetch(
      `${url}/rest/v1/job_supervisor_requests?id=eq.${id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          notification_status: status,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!saved.ok)
      return json({ error: "Notification status could not be saved." }, 502);
    return json({ status });
  },
};
