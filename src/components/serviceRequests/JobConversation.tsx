import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import ThemedButton from "../theme/ThemedButton";
import InternalJobThread from "./InternalJobThread";
import ServiceRequestThread from "./ServiceRequestThread";
import { useTheme } from "../../theme/useTheme";

export default function JobConversation({
  companyId,
  serviceRequestId,
  scheduleSlotId = null,
  title = "Job messages",
  readOnly = false,
}: {
  companyId: string;
  serviceRequestId: string;
  scheduleSlotId?: string | null;
  title?: string;
  readOnly?: boolean;
}) {
  const { theme } = useTheme();
  const [page, setPage] = useState<"internal" | "customer">("internal");
  useEffect(() => {
    setPage("internal");
  }, [companyId, serviceRequestId]);
  return (
    <View style={{ gap: 14 }}>
      <Text
        style={{ color: theme.colors.text, fontSize: 20, fontWeight: "800" }}
      >
        {title}
      </Text>
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <ThemedButton
          title="Internal team / Supervisor"
          variant={page === "internal" ? "primary" : "secondary"}
          onPress={() => setPage("internal")}
        />
        <ThemedButton
          title="Customer communication"
          variant={page === "customer" ? "primary" : "secondary"}
          onPress={() => setPage("customer")}
        />
      </View>
      {page === "internal" ? (
        <InternalJobThread
          key={`internal:${companyId}:${serviceRequestId}`}
          companyId={companyId}
          serviceRequestId={serviceRequestId}
          readOnly={readOnly}
        />
      ) : (
        <>
          <View
            style={{
              backgroundColor: "#FFF0D9",
              borderColor: "#A66B16",
              borderWidth: 2,
              borderRadius: 14,
              padding: 16,
            }}
          >
            <Text style={{ color: "#663D00", fontSize: 18, fontWeight: "800" }}>
              The homeowner can see everything you send here.
            </Text>
            <Text style={{ color: "#663D00", marginTop: 6 }}>
              For staff questions, open Internal team / Supervisor.
            </Text>
          </View>
          <ServiceRequestThread
            key={`customer:${companyId}:${serviceRequestId}`}
            companyId={companyId}
            serviceRequestId={serviceRequestId}
            scheduleSlotId={scheduleSlotId}
            viewer="technician"
            title="Customer communication"
            readOnly={readOnly}
          />
        </>
      )}
    </View>
  );
}
