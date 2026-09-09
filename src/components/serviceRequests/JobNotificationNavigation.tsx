import { useEffect } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";

// Only job-message routes from our own notification payload are accepted.
export function jobNotificationRoute(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\/job-messages\?companyId=[0-9a-f-]{36}&requestId=[0-9a-f-]{36}$/i.test(
    value,
  )
    ? value
    : null;
}
export default function JobNotificationNavigation({
  ready,
}: {
  ready: boolean;
}) {
  useEffect(() => {
    if (!ready || Platform.OS === "web") return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    void import("expo-notifications")
      .then(async (notifications) => {
        if (!active) return;
        const open = (
          response: Awaited<
            ReturnType<typeof notifications.getLastNotificationResponseAsync>
          >,
        ) => {
          const route = jobNotificationRoute(
            response?.notification.request.content.data?.route,
          );
          if (active && route) {
            router.push(route as never);
            void notifications.clearLastNotificationResponseAsync();
          }
        };
        subscription =
          notifications.addNotificationResponseReceivedListener(open);
        open(await notifications.getLastNotificationResponseAsync());
      })
      .catch(() => undefined);
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [ready]);
  return null;
}
