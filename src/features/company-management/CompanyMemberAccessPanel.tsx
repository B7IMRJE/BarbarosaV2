import { useState } from "react";
import { Text, View } from "react-native";
import ThemedButton from "../../components/theme/ThemedButton";
import ThemedCard from "../../components/theme/ThemedCard";
import { logCompanyAuditEvent } from "../../lib/companyAuditLogs";
import {
  resolveCompanyPermissions,
  type CompanyPermissionSet,
} from "../../lib/companyPermissions";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../theme/useTheme";
import CompanyAccessEditor from "./CompanyAccessEditor";

type Member = {
  id: string;
  role: string;
  status: string;
  full_name: string | null;
  email: string | null;
  permissions?: Partial<CompanyPermissionSet> | null;
};
export default function CompanyMemberAccessPanel({
  companyId,
  members,
  rolePermissions,
  canAssignGeneralManager,
  onSaved,
}: {
  canAssignGeneralManager: boolean;
  companyId: string;
  members: Member[];
  rolePermissions: Partial<Record<string, CompanyPermissionSet>>;
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const [member, setMember] = useState<Member | null>(null);
  const [value, setValue] = useState<CompanyPermissionSet | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function save() {
    if (!member || !value || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const { error } = await supabase.rpc("set_company_member_permissions", {
        p_company_user_id: member.id,
        p_permissions: value,
      });
      if (error) throw new Error(error.message);
      await logCompanyAuditEvent({
        companyId,
        action: "company_member_permissions_updated",
        targetType: "company_user",
        targetId: member.id,
        targetLabel: member.full_name || member.email,
        afterData: { permissions: value },
      });
      setNotice("Permissions saved.");
      onSaved();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save permissions.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ThemedCard style={{ gap: 12 }}>
      <Text
        style={{ color: theme.colors.text, fontSize: 20, fontWeight: "700" }}
      >
        Individual access
      </Text>
      <Text style={{ color: theme.colors.mutedText }}>
        Choose a team member to add or remove permissions for their current
        role.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {members
          .filter((m) => m.role !== "owner" && (canAssignGeneralManager || m.role !== "manager"))
          .map((m) => (
            <ThemedButton
              key={m.id}
              title={m.full_name || m.email || "Team member"}
              variant={member?.id === m.id ? "primary" : "secondary"}
              disabled={busy}
              onPress={() => {
                setMember(m);
                setNotice("");
                setValue(
                  resolveCompanyPermissions({
                    role: m.role,
                    status: "active",
                    permissions: {
                      ...rolePermissions[m.role],
                      ...m.permissions,
                    },
                  }),
                );
              }}
            />
          ))}
      </View>
      {member && value && (
        <>
          <CompanyAccessEditor
            role={member.role}
            value={value}
            onChange={setValue}
            disabled={busy}
          />
          <ThemedButton
            title={busy ? "Saving…" : "Save individual permissions"}
            disabled={busy}
            onPress={() => void save()}
          />
        </>
      )}
      {!!notice && <Text style={{ color: theme.colors.text }}>{notice}</Text>}
    </ThemedCard>
  );
}
