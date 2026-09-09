import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import DictationTextInput from "../input/DictationTextInput";
import ThemedButton from "../theme/ThemedButton";
import ThemedCard from "../theme/ThemedCard";
import {
  loadServiceRequestDispatchChatMessages,
  sendServiceRequestDispatchChatMessage,
  type DispatchChatMessage,
} from "../../lib/dispatchChat";
import {
  askJobSupervisor,
  jobMessageArgs,
  jobMessageRpc,
  type SupervisorChoice,
  type SupervisorRequest,
} from "../../lib/jobMessageCenter";
import { useTheme } from "../../theme/useTheme";

export default function InternalJobThread({
  companyId,
  serviceRequestId,
  readOnly = false,
}: {
  companyId: string;
  serviceRequestId: string;
  readOnly?: boolean;
}) {
  const { theme } = useTheme();
  const [messages, setMessages] = useState<DispatchChatMessage[]>([]),
    [draft, setDraft] = useState(""),
    [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [asking, setAsking] = useState(false);
  const [choices, setChoices] = useState<SupervisorChoice[]>([]),
    [recipient, setRecipient] = useState(""),
    [question, setQuestion] = useState("");
  const [requests, setRequests] = useState<SupervisorRequest[]>([]);
  const refresh = useCallback(async () => {
    const [next, help] = await Promise.all([
      loadServiceRequestDispatchChatMessages(companyId, serviceRequestId),
      jobMessageRpc<SupervisorRequest[]>(
        "get_job_supervisor_requests",
        jobMessageArgs(companyId, serviceRequestId),
      ),
    ]);
    setMessages(next);
    setRequests(help);
    if (next.length)
      await jobMessageRpc("mark_job_internal_messages_read", {
        ...jobMessageArgs(companyId, serviceRequestId),
        p_seen_at: next[next.length - 1].created_at,
      });
  }, [companyId, serviceRequestId]);
  useEffect(() => {
    let alive = true,
      fetching = false;
    const update = async () => {
      if (fetching) return;
      fetching = true;
      try {
        if (alive) await refresh();
      } catch (e) {
        if (alive) setNotice(errorText(e));
      } finally {
        fetching = false;
        if (alive) setLoading(false);
      }
    };
    void update();
    const timer = setInterval(() => void update(), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refresh]);
  async function send() {
    if (busy || !draft.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      await sendServiceRequestDispatchChatMessage({
        companyId,
        serviceRequestId,
        message: draft,
      });
      setDraft("");
      await refresh();
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function openSupervisor() {
    setAsking(!asking);
    setNotice("");
    try {
      setChoices(
        await jobMessageRpc<SupervisorChoice[]>(
          "get_job_supervisor_choices",
          jobMessageArgs(companyId, serviceRequestId),
        ),
      );
    } catch (e) {
      setNotice(errorText(e));
    }
  }
  async function ask() {
    if (busy || !recipient || !question.trim()) return;
    setBusy(true);
    try {
      const result = await askJobSupervisor(
        companyId,
        serviceRequestId,
        recipient,
        question,
      );
      setQuestion("");
      setAsking(false);
      setNotice(
        result.notificationError ||
          "Help requested. Delivery status appears below.",
      );
      await refresh();
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function update(id: string, status: string) {
    if (busy) return;
    setBusy(true);
    try {
      await jobMessageRpc("update_job_supervisor_request", {
        p_request_id: id,
        p_status: status,
      });
      await refresh();
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ThemedCard style={{ gap: 14 }}>
      <Text
        style={{ color: theme.colors.text, fontSize: 22, fontWeight: "800" }}
      >
        Internal team · Private
      </Text>
      <Text style={{ color: theme.colors.mutedText }}>
        Only authorized company staff can read this conversation. The homeowner
        cannot see it.
      </Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <ScrollView
          nestedScrollEnabled
          style={{ maxHeight: 420 }}
          contentContainerStyle={{ gap: 10 }}
        >
          {messages.length ? (
            messages.map((m) => (
              <View
                key={m.id}
                style={{
                  padding: 12,
                  backgroundColor: theme.colors.surfaceAlt,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "700" }}>
                  {m.sender_name} · {m.sender_role}
                </Text>
                <Text
                  selectable
                  style={{
                    color: theme.colors.text,
                    fontSize: 16,
                    lineHeight: 23,
                    marginTop: 6,
                  }}
                >
                  {m.message}
                </Text>
                <Text
                  style={{
                    color: theme.colors.mutedText,
                    fontSize: 12,
                    marginTop: 6,
                  }}
                >
                  {new Date(m.created_at).toLocaleString()}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ color: theme.colors.mutedText }}>
              No internal messages yet.
            </Text>
          )}
        </ScrollView>
      )}
      {!readOnly && (
        <>
          <DictationTextInput
            accessibilityLabel="Private team message"
            placeholder="Message the internal team"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
            style={{
              padding: 14,
              minHeight: 100,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 14,
              color: theme.colors.text,
            }}
          />
          <ThemedButton
            title={busy ? "Working…" : "Send to internal team"}
            onPress={() => void send()}
            disabled={busy || !draft.trim()}
          />
          <ThemedButton
            title="Ask a supervisor"
            variant="secondary"
            onPress={() => void openSupervisor()}
            disabled={busy}
          />
          {asking && (
            <View style={{ gap: 12 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "700" }}>
                Who do you need?
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {choices.map((c) => (
                  <ThemedButton
                    key={c.id}
                    title={c.full_name}
                    variant={recipient === c.id ? "primary" : "secondary"}
                    onPress={() => setRecipient(c.id)}
                  />
                ))}
              </View>
              {!choices.length && (
                <Text style={{ color: theme.colors.mutedText }}>
                  No other active supervisors are available in this company.
                </Text>
              )}
              <DictationTextInput
                accessibilityLabel="Question for supervisor"
                placeholder="What do you need help with?"
                value={question}
                onChangeText={setQuestion}
                multiline
                maxLength={1850}
                style={{
                  padding: 12,
                  minHeight: 90,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: 12,
                }}
              />
              <ThemedButton
                title="Request help and notify supervisor"
                disabled={busy || !recipient || !question.trim()}
                onPress={() => void ask()}
              />
            </View>
          )}
        </>
      )}
      {!!notice && <Text style={{ color: theme.colors.text }}>{notice}</Text>}
      {requests.map((r) => (
        <View
          key={r.id}
          style={{
            gap: 8,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "700" }}>
            {r.recipient_name} · {r.status}
          </Text>
          <Text style={{ color: theme.colors.text }}>{r.question}</Text>
          <Text style={{ color: theme.colors.mutedText }}>
            {r.notification_status === "accepted"
              ? "Phone alert accepted for delivery"
              : r.notification_status === "unavailable"
                ? "In-app request saved · No registered phone for push alerts"
                : r.notification_status === "failed"
                  ? "In-app request saved · Phone alert failed"
                  : "Phone alert pending"}
          </Text>
          {r.can_update && r.status !== "resolved" && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              {r.status === "pending" && (
                <ThemedButton
                  title="I’m on it"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void update(r.id, "acknowledged")}
                />
              )}
              <ThemedButton
                title="Resolve"
                variant="secondary"
                disabled={busy}
                onPress={() => void update(r.id, "resolved")}
              />
            </View>
          )}
        </View>
      ))}
    </ThemedCard>
  );
}
function errorText(e: unknown) {
  return e instanceof Error
    ? e.message
    : "Messages could not be loaded. Please retry.";
}
