import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import HomeHeader from "../../components/HomeHeader";
import JobConversation from "../../components/serviceRequests/JobConversation";
import ThemedButton from "../../components/theme/ThemedButton";
import ThemedCard from "../../components/theme/ThemedCard";
import {
  jobMessageArgs,
  jobMessageRpc,
  type JobMessageRow,
} from "../../lib/jobMessageCenter";
import { registerHomeOSPushNotifications } from "../../lib/pushNotifications";
import { useTheme } from "../../theme/useTheme";

type JobContext = {
  id: string;
  display_code: string | null;
  issue_summary: string | null;
  status: string;
  property_name: string;
  events: { event_type: string; message: string | null; created_at: string }[];
};
type Access = {
  company_id: string;
  company_name: string;
  role: string;
  status: string;
};
export default function JobMessageCenterScreen() {
  const params = useLocalSearchParams<{
    companyId?: string;
    requestId?: string;
  }>();
  const { theme } = useTheme();
  const [companyId, setCompanyId] = useState(params.companyId || "");
  const [companies, setCompanies] = useState<Access[]>([]);
  const [selected, setSelected] = useState(params.requestId || "");
  const [archived, setArchived] = useState(false),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<JobMessageRow[]>([]),
    [offset, setOffset] = useState(0);
  const [context, setContext] = useState<JobContext | null>(null),
    [progress, setProgress] = useState(false);
  const [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  const [contextNotice, setContextNotice] = useState("");
  const [contextRetry, setContextRetry] = useState(0);
  useEffect(() => {
    if (params.companyId) setCompanyId(params.companyId);
    setSelected(params.requestId || "");
  }, [params.companyId, params.requestId]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(0);
      setQuery(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let alive = true;
    void jobMessageRpc<Access[]>("get_job_message_companies", {})
      .then((rows) => {
        if (!alive) return;
        const active = rows;
        setCompanies(active);
        if (!companyId && active[0]) setCompanyId(active[0].company_id);
        if (!active.length) {
          setNotice(
            "You need an active company job assignment or message permission to use this center.",
          );
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setNotice(errorText(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [companyId]);
  const load = useCallback(async () => {
    if (!companyId) return;
    return jobMessageRpc<JobMessageRow[]>("get_job_message_directory", {
      p_company_id: companyId,
      p_archived: archived,
      p_search: query,
      p_offset: offset,
    });
  }, [companyId, archived, query, offset]);
  useEffect(() => {
    let alive = true,
      fetching = false;
    const update = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const rows = await load();
        if (alive && rows) {
          setJobs(rows);
          setNotice("");
        }
      } catch (e) {
        if (alive) setNotice(errorText(e));
      } finally {
        fetching = false;
        if (alive) setLoading(false);
      }
    };
    setLoading(true);
    void update();
    const timer = setInterval(() => void update(), 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    let alive = true;
    setContext(null);
    setContextNotice("");
    setProgress(false);
    if (selected && companyId)
      void jobMessageRpc<JobContext>(
        "get_job_message_context",
        jobMessageArgs(companyId, selected),
      )
        .then((c) => {
          if (alive) setContext(c);
        })
        .catch((e) => {
          if (alive) setContextNotice(errorText(e));
        });
    return () => {
      alive = false;
    };
  }, [selected, companyId, contextRetry]);
  async function enableAlerts() {
    try {
      await registerHomeOSPushNotifications();
      setNotice("Phone alerts enabled for supervisor requests.");
    } catch (e) {
      setNotice(errorText(e));
    }
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        padding: 20,
        paddingBottom: 60,
        alignItems: "center",
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: "100%", maxWidth: 1200, gap: 18 }}>
        <HomeHeader />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <ThemedButton
            title={selected ? "Back to all messages" : "Back"}
            variant="secondary"
            onPress={() =>
              selected
                ? setSelected("")
                : router.canGoBack()
                  ? router.back()
                  : router.replace("/techos" as never)
            }
          />
          {Platform.OS !== "web" && (
            <ThemedButton
              title="Enable phone alerts"
              variant="secondary"
              onPress={() => void enableAlerts()}
            />
          )}
        </View>
        <Text
          style={{ color: theme.colors.text, fontSize: 30, fontWeight: "800" }}
        >
          Message Center
        </Text>
        <Text style={{ color: theme.colors.mutedText, fontSize: 16 }}>
          Company conversations stay with each job. Requests for help go to the
          person you choose.
        </Text>
        {companies.length > 1 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {companies.map((c) => (
              <ThemedButton
                key={c.company_id}
                title={c.company_name}
                variant={companyId === c.company_id ? "primary" : "secondary"}
                onPress={() => {
                  setCompanyId(c.company_id);
                  setSelected("");
                  setOffset(0);
                }}
              />
            ))}
          </View>
        )}
        {!!notice && (
          <ThemedCard>
            <Text style={{ color: theme.colors.text }}>{notice}</Text>
            <ThemedButton
              title="Retry"
              variant="secondary"
              onPress={() =>
                void load()
                  .then((rows) => {
                    if (rows) {
                      setJobs(rows);
                      setNotice("");
                    }
                  })
                  .catch((e) => setNotice(errorText(e)))
              }
            />
          </ThemedCard>
        )}
        {!!selected && !context && (
          <ThemedCard style={{ gap: 12 }}>
            {contextNotice ? (
              <>
                <Text style={{ color: theme.colors.text }}>{contextNotice}</Text>
                <ThemedButton title="Retry loading job" onPress={() => setContextRetry((n) => n + 1)} />
              </>
            ) : (
              <><ActivityIndicator /><Text style={{ color: theme.colors.text }}>Loading job conversation…</Text></>
            )}
          </ThemedCard>
        )}
        {selected ? (
          context && (
            <>
              <ThemedCard style={{ gap: 10 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: 22,
                    fontWeight: "800",
                  }}
                >
                  {context.display_code || "Service request"} ·{" "}
                  {context.property_name}
                </Text>
                <Text style={{ color: theme.colors.text, fontSize: 17 }}>
                  {context.issue_summary || "No issue details yet."}
                </Text>
                <Text style={{ color: theme.colors.mutedText }}>
                  Status: {context.status.replaceAll("_", " ")}
                </Text>
                <ThemedButton
                  title={progress ? "Hide job progress" : "View job progress"}
                  variant="secondary"
                  onPress={() => setProgress(!progress)}
                />
                {progress &&
                  context.events.map((e, i) => (
                    <View key={`${e.created_at}:${i}`} style={{ gap: 4 }}>
                      <Text
                        style={{ color: theme.colors.text, fontWeight: "700" }}
                      >
                        {e.event_type.replaceAll("_", " ")}
                      </Text>
                      <Text style={{ color: theme.colors.text }}>
                        {e.message || "Status recorded"}
                      </Text>
                      <Text style={{ color: theme.colors.mutedText }}>
                        {new Date(e.created_at).toLocaleString()}
                      </Text>
                    </View>
                  ))}
              </ThemedCard>
              <JobConversation
                key={`${companyId}:${selected}`}
                companyId={companyId}
                serviceRequestId={selected}
              />
            </>
          )
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <ThemedButton
                title="Current jobs"
                variant={!archived ? "primary" : "secondary"}
                onPress={() => {
                  setArchived(false);
                  setOffset(0);
                }}
              />
              <ThemedButton
                title="Previous jobs"
                variant={archived ? "primary" : "secondary"}
                onPress={() => {
                  setArchived(true);
                  setOffset(0);
                }}
              />
            </View>
            <TextInput
              accessibilityLabel="Search job messages"
              placeholder="Search job number, home, technician, or issue"
              placeholderTextColor={theme.colors.mutedText}
              value={search}
              onChangeText={setSearch}
              style={{
                padding: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                color: theme.colors.text,
                fontSize: 16,
              }}
            />
            {loading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : jobs.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                {jobs.map((j) => (
                  <Pressable
                    key={j.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open messages for ${j.display_code || j.property_name}`}
                    onPress={() => setSelected(j.id)}
                    style={{
                      flexGrow: 1,
                      flexBasis: 320,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 18,
                      padding: 18,
                      backgroundColor: theme.colors.surface,
                      gap: 9,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: 21,
                        fontWeight: "800",
                      }}
                    >
                      {j.display_code || "Service request"} · {j.property_name}
                    </Text>
                    <Text style={{ color: theme.colors.text }}>
                      {j.technician_name} ·{" "}
                      {(j.status || "").replaceAll("_", " ")}
                    </Text>
                    {!!j.help_count && (
                      <Text
                        style={{
                          color: theme.colors.primary,
                          fontWeight: "800",
                        }}
                      >
                        {j.help_count} awaiting supervisor response
                      </Text>
                    )}
                    <Text
                      style={{ color: theme.colors.text, fontWeight: "700" }}
                    >
                      Internal team · {j.unread_count} unread
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={{ color: theme.colors.mutedText }}
                    >
                      {j.latest_internal_message || "No internal messages yet"}
                    </Text>
                    <Text
                      style={{ color: theme.colors.text, fontWeight: "700" }}
                    >
                      Customer · {j.customer_unread_count} unread
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={{ color: theme.colors.mutedText }}
                    >
                      {j.latest_customer_message || "No customer messages yet"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <ThemedCard>
                <Text style={{ color: theme.colors.mutedText }}>
                  No matching {archived ? "previous" : "current"} jobs. Jobs you
                  are assigned to or invited into will appear here.
                </Text>
              </ThemedCard>
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {offset > 0 && (
                <ThemedButton
                  title="Previous page"
                  variant="secondary"
                  onPress={() => setOffset(Math.max(0, offset - 40))}
                />
              )}{" "}
              {jobs.length === 40 && (
                <ThemedButton
                  title="More jobs"
                  variant="secondary"
                  onPress={() => setOffset(offset + 40)}
                />
              )}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
function errorText(e: unknown) {
  return e instanceof Error
    ? e.message
    : "Could not load messages. Please try again.";
}
