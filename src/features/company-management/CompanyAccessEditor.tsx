import { Host, Switch } from "@expo/ui";
import { Text, View } from "react-native";
import { COMPANY_PERMISSION_KEYS } from "../../lib/companyInvitationRules";
import {
  COMPANY_PERMISSION_LABELS,
  enforceCompanyRoleRestrictions,
  type CompanyPermissionSet,
} from "../../lib/companyPermissions";
import { useTheme } from "../../theme/useTheme";

export default function CompanyAccessEditor({
  role,
  value,
  onChange,
  disabled = false,
}: {
  role: string;
  value: CompanyPermissionSet;
  onChange: (value: CompanyPermissionSet) => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 12, marginVertical: 16 }}>
      <Text
        style={{ color: theme.colors.text, fontSize: 18, fontWeight: "700" }}
      >
        Permissions for this person
      </Text>
      <Text style={{ color: theme.colors.mutedText }}>
        Start with the role, then adjust access. Only main management can change
        permissions. Field supervisors stay outside office administration.
      </Text>
      {COMPANY_PERMISSION_KEYS.map((key) => {
        const toggled = enforceCompanyRoleRestrictions(role, {
          ...value,
          [key]: !value[key],
        });
        const locked = role === "owner" || toggled[key] === value[key];
        return (
          <View
            key={key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text style={{ flex: 1, color: theme.colors.text, fontSize: 16 }}>
              {COMPANY_PERMISSION_LABELS[key]}
              {locked ? " · Role protected" : ""}
            </Text>
            <Host matchContents accessibilityLabel={COMPANY_PERMISSION_LABELS[key]}>
              <Switch
                value={value[key]}
                disabled={disabled || locked}
                onValueChange={() => onChange(toggled)}
              />
            </Host>
          </View>
        );
      })}
    </View>
  );
}
