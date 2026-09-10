import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';
import ThemedButton from '../theme/ThemedButton';

export default function UnavailableDispatchMembers({ companyId }: { companyId: string }) {
    const { theme } = useTheme();
    const [members, setMembers] = useState<{ id: string; full_name: string; role: string; status: string }[]>([]);
    const [canManage, setCanManage] = useState(false);
    useEffect(() => {
        let current = true;
        setMembers([]); setCanManage(false);
        void Promise.all([
            supabase.rpc('get_company_unavailable_dispatch_members', { p_company_id: companyId }),
            supabase.rpc('can_manage_company_users', { p_company_id: companyId }),
        ]).then(([roster, access]) => {
            if (!current) return;
            if (!roster.error) setMembers(roster.data || []);
            if (!access.error) setCanManage(access.data === true);
        });
        return () => { current = false; };
    }, [companyId]);
    if (!members.length) return null;
    return <View style={{ gap: 8, marginTop: 10 }}>
        <Text style={{ color: theme.colors.mutedText, fontSize: 14 }}>Unavailable team members</Text>
        {members.map(member => <Text key={member.id} style={{ color: theme.colors.text, fontSize: 14 }}>{member.full_name || 'Team member'} · {member.status || 'Status not set'}</Text>)}
        <Text style={{ color: theme.colors.mutedText, fontSize: 14 }}>Only active team members can receive assignments. Main management can review their status in Team.</Text>
        {canManage && <ThemedButton title="Review team status" variant="secondary" onPress={() => router.push(`/super-admin/company/${companyId}/users` as never)} />}
    </View>;
}
