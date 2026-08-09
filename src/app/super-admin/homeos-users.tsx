import DictationTextInput from '@/components/input/DictationTextInput';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import GlassCard from '../../components/glass/GlassCard';
import ThemedButton from '../../components/theme/ThemedButton';
import {
    COMPANY_PERMISSION_LABELS,
    resolveCompanyPermissions,
    type CompanyPermissionKey,
    type CompanyPermissionSet,
} from '../../lib/companyPermissions';
import { loadCurrentUserPlatformAdmin } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { orbitalGlassPalette } from '../../theme/glassPalette';

const peopleGlassPalette = {
    ...orbitalGlassPalette,
    screen: '#061D18',
    text: '#F1FFF9',
    mutedText: '#A9CFC2',
};

type AccountRow = {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    auth_status: string | null;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
    created_at: string | null;
    avatar_url: string | null;
};

type CompanyRow = {
    id: string;
    name: string | null;
    public_name: string | null;
    dba_name: string | null;
};

type CompanyUserRow = {
    id: string;
    company_id: string;
    auth_user_id: string | null;
    full_name: string | null;
    email: string | null;
    role: string | null;
    status: string | null;
    is_primary: boolean | null;
};

type MembershipRow = {
    user_id: string;
    property_id: string;
    role: string | null;
    status: string | null;
};

type PropertyRow = {
    id: string;
    name: string | null;
    address: string | null;
    address_line_1: string | null;
};

type ClientRow = {
    company_id: string;
    property_id: string;
    display_name: string | null;
    status: string | null;
};

type PersonGroupKey = 'owners' | 'management' | 'office' | 'technicians' | 'clients' | 'other';
type StatusFilter = 'all' | 'active' | 'inactive';

type PersonRecord = {
    key: string;
    accountId: string | null;
    name: string;
    email: string | null;
    platformRole: string | null;
    authStatus: string | null;
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
    accountCreatedAt: string | null;
    avatarUrl: string | null;
    companyUsers: CompanyUserRow[];
    homeMemberships: MembershipRow[];
    clientCompanies: ClientRow[];
    group: PersonGroupKey;
    active: boolean;
};

const GROUPS: { key: PersonGroupKey; label: string; description: string }[] = [
    { key: 'owners', label: 'Company Owners', description: 'Owners grouped with the companies they control.' },
    { key: 'management', label: 'Administrators & Management', description: 'Company admins and managers.' },
    { key: 'office', label: 'Office, Dispatch & Supervisors', description: 'Office and dispatch operations staff.' },
    { key: 'technicians', label: 'Technicians', description: 'Field technicians and their account access.' },
    { key: 'clients', label: 'Homeowners & Clients', description: 'HomeOS homeowners and the companies connected to their homes.' },
    { key: 'other', label: 'Other Users', description: 'Accounts without one of the positions above.' },
];

const PERMISSION_KEYS = Object.keys(COMPANY_PERMISSION_LABELS) as CompanyPermissionKey[];

export default function PlatformHomeOSUsersScreen() {
    const [accounts, setAccounts] = useState<AccountRow[]>([]);
    const [companies, setCompanies] = useState<CompanyRow[]>([]);
    const [companyUsers, setCompanyUsers] = useState<CompanyUserRow[]>([]);
    const [memberships, setMemberships] = useState<MembershipRow[]>([]);
    const [properties, setProperties] = useState<PropertyRow[]>([]);
    const [clients, setClients] = useState<ClientRow[]>([]);
    const [search, setSearch] = useState('');
    const [groupFilter, setGroupFilter] = useState<PersonGroupKey | 'all'>('all');
    const [companyFilter, setCompanyFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [selectedPersonKey, setSelectedPersonKey] = useState<string | null>(null);
    const [message, setMessage] = useState('Loading people directory...');

    useEffect(() => {
        void loadUsers();
    }, []);

    async function loadUsers() {
        if (!await loadCurrentUserPlatformAdmin()) {
            setMessage('Platform administrator access is required.');
            return;
        }

        const [accountResult, companyResult, companyUserResult, membershipResult, propertyResult, clientResult] =
            await Promise.all([
                supabase.rpc('get_platform_people_accounts_v3'),
                supabase.from('companies').select('id, name, public_name, dba_name').order('name', { ascending: true }),
                supabase.rpc('get_platform_people_company_access_v2'),
                supabase.from('property_memberships').select('user_id, property_id, role, status'),
                supabase.from('properties').select('id, name, address, address_line_1'),
                supabase.from('company_property_clients').select('company_id, property_id, display_name, status'),
            ]);

        const error =
            accountResult.error ||
            companyResult.error ||
            companyUserResult.error ||
            membershipResult.error ||
            propertyResult.error ||
            clientResult.error;

        if (error) {
            setMessage(`Could not load the people directory: ${error.message}`);
            return;
        }

        setAccounts((accountResult.data || []) as AccountRow[]);
        setCompanies((companyResult.data || []) as CompanyRow[]);
        setCompanyUsers((companyUserResult.data || []) as CompanyUserRow[]);
        setMemberships((membershipResult.data || []) as MembershipRow[]);
        setProperties((propertyResult.data || []) as PropertyRow[]);
        setClients((clientResult.data || []) as ClientRow[]);
        setMessage('');
    }

    const companyById = useMemo(
        () => new Map(companies.map((company) => [company.id, company])),
        [companies]
    );
    const propertyById = useMemo(
        () => new Map(properties.map((property) => [property.id, property])),
        [properties]
    );

    const people = useMemo(() => {
        const companyUsersByAuthId = new Map<string, CompanyUserRow[]>();
        const companyUsersByEmail = new Map<string, CompanyUserRow[]>();
        const membershipsByUserId = new Map<string, MembershipRow[]>();
        const clientsByPropertyId = new Map<string, ClientRow[]>();

        companyUsers.forEach((companyUser) => {
            if (companyUser.auth_user_id) {
                companyUsersByAuthId.set(companyUser.auth_user_id, [
                    ...(companyUsersByAuthId.get(companyUser.auth_user_id) || []),
                    companyUser,
                ]);
            }
            const emailKey = normalizeEmail(companyUser.email);
            if (emailKey) {
                companyUsersByEmail.set(emailKey, [
                    ...(companyUsersByEmail.get(emailKey) || []),
                    companyUser,
                ]);
            }
        });
        memberships.forEach((membership) => {
            membershipsByUserId.set(membership.user_id, [
                ...(membershipsByUserId.get(membership.user_id) || []),
                membership,
            ]);
        });
        clients.forEach((client) => {
            clientsByPropertyId.set(client.property_id, [
                ...(clientsByPropertyId.get(client.property_id) || []),
                client,
            ]);
        });

        const records: PersonRecord[] = accounts.map((account) => {
            const personCompanyUsers = uniqueCompanyUsers([
                ...(companyUsersByAuthId.get(account.id) || []),
                ...(companyUsersByEmail.get(normalizeEmail(account.email)) || []),
            ]);
            const personHomeMemberships = membershipsByUserId.get(account.id) || [];
            const personClientCompanies = uniqueClients(
                personHomeMemberships.flatMap((membership) => clientsByPropertyId.get(membership.property_id) || [])
            );

            return buildPersonRecord({
                key: account.id,
                accountId: account.id,
                name: account.full_name || account.email || 'Unnamed account',
                email: account.email,
                platformRole: account.role,
                authStatus: account.auth_status,
                emailConfirmedAt: account.email_confirmed_at,
                lastSignInAt: account.last_sign_in_at,
                accountCreatedAt: account.created_at,
                avatarUrl: account.avatar_url,
                companyUsers: personCompanyUsers,
                homeMemberships: personHomeMemberships,
                clientCompanies: personClientCompanies,
            });
        });

        const accountIds = new Set(accounts.map((account) => account.id));
        const accountEmails = new Set(accounts.map((account) => normalizeEmail(account.email)).filter(Boolean));
        companyUsers
            .filter((companyUser) => (
                (!companyUser.auth_user_id || !accountIds.has(companyUser.auth_user_id)) &&
                !accountEmails.has(normalizeEmail(companyUser.email))
            ))
            .forEach((companyUser) => {
                records.push(buildPersonRecord({
                    key: `company-user-${companyUser.id}`,
                    accountId: companyUser.auth_user_id,
                    name: companyUser.full_name || companyUser.email || 'Unnamed company user',
                    email: companyUser.email,
                    platformRole: null,
                    authStatus: companyUser.auth_user_id ? 'linked' : 'invited',
                    emailConfirmedAt: null,
                    lastSignInAt: null,
                    accountCreatedAt: null,
                    avatarUrl: null,
                    companyUsers: [companyUser],
                    homeMemberships: [],
                    clientCompanies: [],
                }));
            });

        return records.sort((left, right) => left.name.localeCompare(right.name));
    }, [accounts, clients, companyUsers, memberships]);

    const filteredPeople = useMemo(() => {
        const query = search.trim().toLowerCase();

        return people.filter((person) => {
            const companyIds = new Set([
                ...person.companyUsers.map((companyUser) => companyUser.company_id),
                ...person.clientCompanies.map((client) => client.company_id),
            ]);
            const searchable = [
                person.name,
                person.email,
                person.accountId,
                person.platformRole,
                ...person.companyUsers.flatMap((companyUser) => [
                    companyUser.role,
                    companyName(companyById.get(companyUser.company_id)),
                ]),
                ...person.clientCompanies.map((client) => companyName(companyById.get(client.company_id))),
            ].filter(Boolean).join(' ').toLowerCase();

            return (
                (!query || searchable.includes(query)) &&
                (groupFilter === 'all' || person.group === groupFilter) &&
                (companyFilter === 'all' || companyIds.has(companyFilter)) &&
                (statusFilter === 'all' || (statusFilter === 'active' ? person.active : !person.active))
            );
        });
    }, [companyById, companyFilter, groupFilter, people, search, statusFilter]);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: peopleGlassPalette.screen }}
            contentContainerStyle={{ alignItems: 'center', padding: 20, paddingBottom: 48 }}
        >
            <View style={{ width: '100%', maxWidth: 1180 }}>
                <AdminNavBar backFallback="/super-admin" />
                <Text style={{ color: peopleGlassPalette.text, fontSize: 34, fontWeight: '900', marginTop: 20 }}>
                    People Directory
                </Text>
                <Text style={{ color: peopleGlassPalette.mutedText, fontSize: 16, lineHeight: 23, marginTop: 8, marginBottom: 20 }}>
                    Platform accounts, company positions, client relationships, account status, and effective permissions.
                </Text>

                <DictationTextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search name, email, account ID, role, or company"
                    placeholderTextColor={peopleGlassPalette.mutedText}
                    style={{
                        backgroundColor: 'rgba(15, 65, 53, 0.9)',
                        borderColor: 'rgba(129, 207, 181, 0.52)',
                        borderRadius: 14,
                        borderWidth: 1,
                        color: peopleGlassPalette.text,
                        fontSize: 16,
                        marginBottom: 14,
                        padding: 15,
                    }}
                />

                <FilterRow
                    label="Position"
                    options={[{ value: 'all', label: 'All people' }, ...GROUPS.map((group) => ({ value: group.key, label: group.label }))]}
                    selected={groupFilter}
                    onSelect={(value) => setGroupFilter(value as PersonGroupKey | 'all')}
                />
                <FilterRow
                    label="Company"
                    options={[
                        { value: 'all', label: 'All companies' },
                        ...companies.map((company) => ({ value: company.id, label: companyName(company) })),
                    ]}
                    selected={companyFilter}
                    onSelect={setCompanyFilter}
                />
                <FilterRow
                    label="Account status"
                    options={[
                        { value: 'all', label: 'All statuses' },
                        { value: 'active', label: 'Active' },
                        { value: 'inactive', label: 'Inactive / suspended' },
                    ]}
                    selected={statusFilter}
                    onSelect={(value) => setStatusFilter(value as StatusFilter)}
                />

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginVertical: 16 }}>
                <Text style={{ color: peopleGlassPalette.mutedText, fontWeight: '800' }}>
                    Showing {filteredPeople.length} of {people.length} people
                </Text>
                {(groupFilter !== 'all' || companyFilter !== 'all' || statusFilter !== 'all' || search.trim()) && (
                    <ThemedButton
                        title="Clear all filters"
                        variant="glass"
                        onPress={() => {
                            setSearch('');
                            setGroupFilter('all');
                            setCompanyFilter('all');
                            setStatusFilter('all');
                        }}
                        style={{ minWidth: 0, paddingHorizontal: 12 }}
                    />
                )}
                </View>

                {!!message && (
                    <Text style={{ color: peopleGlassPalette.mutedText, marginBottom: 16, fontWeight: '800' }}>
                        {message}
                    </Text>
                )}

                {GROUPS.map((group) => {
                    const groupPeople = filteredPeople.filter((person) => person.group === group.key);
                    if (groupPeople.length === 0) return null;

                    return (
                        <GlassCard key={group.key} tone="steel" style={{ padding: 18, marginBottom: 18, backgroundColor: 'rgba(18, 78, 62, 0.72)', borderColor: 'rgba(100, 210, 170, 0.54)' }}>
                            <Text style={{ color: peopleGlassPalette.text, fontSize: 22, fontWeight: '900' }}>
                                {group.label} · {groupPeople.length}
                            </Text>
                            <Text style={{ color: peopleGlassPalette.mutedText, marginTop: 4, marginBottom: 12 }}>
                                {group.description}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                                {groupPeople.map((person) => (
                                    <PersonTile
                                        key={person.key}
                                        person={person}
                                        companyById={companyById}
                                        selected={selectedPersonKey === person.key}
                                        onPress={() => setSelectedPersonKey((current) => current === person.key ? null : person.key)}
                                    />
                                ))}
                            </View>
                            {groupPeople.map((person) => (
                                selectedPersonKey === person.key ? (
                                    <PersonDetails
                                        key={`details-${person.key}`}
                                        person={person}
                                        companyById={companyById}
                                        propertyById={propertyById}
                                        onClose={() => setSelectedPersonKey(null)}
                                        onMakePrimary={async (companyUserId) => {
                                            setMessage('Updating the primary company...');
                                            const { error } = await supabase.rpc('set_platform_person_primary_company', {
                                                p_company_user_id: companyUserId,
                                            });
                                            if (error) {
                                                setMessage(`Could not update the primary company: ${error.message}`);
                                                return;
                                            }
                                            await loadUsers();
                                            setMessage('Primary company updated. This is visible only in Platform Administration.');
                                        }}
                                    />
                                ) : null
                            ))}
                        </GlassCard>
                    );
                })}

                {!message && filteredPeople.length === 0 && (
                    <GlassCard tone="steel" style={{ padding: 20, backgroundColor: 'rgba(18, 78, 62, 0.72)' }}>
                        <Text style={{ color: peopleGlassPalette.text, fontWeight: '900' }}>
                            No people match these filters.
                        </Text>
                    </GlassCard>
                )}

                <ThemedButton
                    title="Back to Platform Administration"
                    variant="glass"
                    onPress={() => router.push('/super-admin' as any)}
                    style={{ marginTop: 24 }}
                />
            </View>
        </ScrollView>
    );
}

function FilterRow({
    label,
    options,
    selected,
    onSelect,
}: {
    label: string;
    options: { value: string; label: string }[];
    selected: string;
    onSelect: (value: string) => void;
}) {
    return (
        <View style={{ marginTop: 10 }}>
            <Text style={{ color: peopleGlassPalette.text, fontWeight: '900', marginBottom: 8 }}>{label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {options.map((option) => (
                    <ThemedButton
                        key={option.value}
                        title={option.label}
                        variant={selected === option.value ? 'primary' : 'glass'}
                        onPress={() => onSelect(option.value)}
                        style={{ minWidth: 0, paddingHorizontal: 12 }}
                    />
                ))}
            </View>
        </View>
    );
}

function PersonTile({
    person,
    companyById,
    selected,
    onPress,
}: {
    person: PersonRecord;
    companyById: Map<string, CompanyRow>;
    selected: boolean;
    onPress: () => void;
}) {
    const primaryCompanyUser = primaryCompanyRelationship(person.companyUsers);
    const primaryCompany = primaryCompanyUser
        ? companyName(companyById.get(primaryCompanyUser.company_id))
        : person.clientCompanies[0]
            ? companyName(companyById.get(person.clientCompanies[0].company_id))
            : 'HomeOS';
    const role = primaryCompanyUser?.role || person.platformRole || (person.group === 'clients' ? 'homeowner' : 'user');

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View account details for ${person.name}`}
            onPress={onPress}
            style={{
                alignItems: 'center',
                backgroundColor: selected ? 'rgba(24, 130, 92, 0.82)' : 'rgba(19, 87, 67, 0.72)',
                borderColor: selected
                    ? 'rgba(111, 239, 224, 0.95)'
                    : person.active ? 'rgba(72, 207, 168, 0.64)' : 'rgba(231, 173, 84, 0.68)',
                borderRadius: 18,
                borderWidth: selected ? 2 : 1,
                boxShadow: selected
                    ? '0 9px 0 rgba(3, 43, 31, 0.9), 0 16px 28px rgba(0, 0, 0, 0.32)'
                    : '0 6px 0 rgba(3, 43, 31, 0.82), 0 11px 20px rgba(0, 0, 0, 0.24)',
                justifyContent: 'space-between',
                minHeight: 194,
                padding: 14,
                width: 190,
            }}
        >
            <View style={{ alignItems: 'center', width: '100%' }}>
                <View
                    style={{
                        alignItems: 'center',
                        backgroundColor: 'rgba(165, 235, 204, 0.18)',
                        borderColor: 'rgba(198, 250, 226, 0.62)',
                        borderRadius: 16,
                        borderWidth: 1,
                        height: 66,
                        justifyContent: 'center',
                        overflow: 'hidden',
                        width: 66,
                    }}
                >
                    {person.avatarUrl ? (
                        <Image source={{ uri: person.avatarUrl }} style={{ height: '100%', width: '100%' }} resizeMode="cover" />
                    ) : (
                        <Text style={{ color: peopleGlassPalette.text, fontSize: 22, fontWeight: '900' }}>
                            {personInitials(person.name)}
                        </Text>
                    )}
                </View>
                <Text numberOfLines={1} style={{ color: peopleGlassPalette.text, fontSize: 16, fontWeight: '900', marginTop: 10, maxWidth: '100%' }}>
                    {person.name}
                </Text>
                <Text numberOfLines={1} style={{ color: peopleGlassPalette.mutedText, fontSize: 11, marginTop: 3, maxWidth: '100%' }}>
                    {person.email || 'No email available'}
                </Text>
                <Text numberOfLines={1} style={{ color: '#A9EFE1', fontSize: 12, fontWeight: '800', marginTop: 7, maxWidth: '100%' }}>
                    {primaryCompany}
                </Text>
                {person.companyUsers.length > 1 && (
                    <Text numberOfLines={1} style={{ color: '#F1CF72', fontSize: 10, fontWeight: '900', marginTop: 2 }}>
                        PRIMARY · +{person.companyUsers.length - 1} ADDITIONAL
                    </Text>
                )}
                <Text numberOfLines={1} style={{ color: peopleGlassPalette.mutedText, fontSize: 11, marginTop: 2 }}>
                    {formatRole(role)}
                </Text>
            </View>
            <View style={{ alignItems: 'center', width: '100%' }}>
                <Text style={{ color: person.active ? '#72E6C0' : '#F1BE69', fontSize: 10, fontWeight: '900' }}>
                    {person.active ? '● ACTIVE' : '● NEEDS ATTENTION'}
                </Text>
                <Text style={{ color: peopleGlassPalette.text, fontSize: 11, fontWeight: '900', marginTop: 5 }}>
                    {selected ? 'Hide details' : 'View details'}
                </Text>
            </View>
        </Pressable>
    );
}

function PersonDetails({
    person,
    companyById,
    propertyById,
    onClose,
    onMakePrimary,
}: {
    person: PersonRecord;
    companyById: Map<string, CompanyRow>;
    propertyById: Map<string, PropertyRow>;
    onClose: () => void;
    onMakePrimary: (companyUserId: string) => Promise<void>;
}) {
    const orderedCompanyUsers = orderCompanyRelationships(person.companyUsers);

    return (
        <View
            style={{
                backgroundColor: 'rgba(5, 44, 33, 0.86)',
                borderColor: person.active ? 'rgba(72, 207, 168, 0.55)' : 'rgba(231, 173, 84, 0.58)',
                borderRadius: 16,
                borderWidth: 1,
                marginTop: 22,
                padding: 17,
            }}
        >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 220 }}>
                    <Text style={{ color: peopleGlassPalette.text, fontSize: 20, fontWeight: '900' }}>{person.name}</Text>
                    <Text selectable style={{ color: peopleGlassPalette.text, fontSize: 14, marginTop: 4 }}>
                        {person.email || 'No email available'}
                    </Text>
                    <Text selectable style={{ color: peopleGlassPalette.mutedText, fontSize: 11, marginTop: 4 }}>
                        Account: {person.accountId || 'Invitation or company-only record'}
                    </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: person.active ? '#72E6C0' : '#F1BE69', fontWeight: '900' }}>
                        {person.active ? 'ACTIVE' : 'INACTIVE / SUSPENDED'}
                    </Text>
                    {!!person.platformRole && (
                        <Text style={{ color: peopleGlassPalette.mutedText, marginTop: 4 }}>
                            Platform role: {formatRole(person.platformRole)}
                        </Text>
                    )}
                    <Text style={{ color: peopleGlassPalette.mutedText, marginTop: 4 }}>
                        Login: {formatAuthStatus(person.authStatus)}
                    </Text>
                </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 }}>
                <Text style={{ color: peopleGlassPalette.mutedText, fontSize: 12 }}>
                    Email confirmed: {formatDate(person.emailConfirmedAt)}
                </Text>
                <Text style={{ color: peopleGlassPalette.mutedText, fontSize: 12 }}>
                    Last sign-in: {formatDate(person.lastSignInAt)}
                </Text>
                <Text style={{ color: peopleGlassPalette.mutedText, fontSize: 12 }}>
                    Account created: {formatDate(person.accountCreatedAt)}
                </Text>
            </View>

            {orderedCompanyUsers.map((companyUser, index) => {
                const permissions = resolveCompanyPermissions(companyUser);
                const isPrimary = companyUser.is_primary || index === 0;
                return (
                    <View key={companyUser.id} style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(126, 211, 180, 0.28)', paddingTop: 12 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                            <View style={{ flex: 1, minWidth: 210 }}>
                                <Text style={{ color: isPrimary ? '#F1CF72' : '#A9EFE1', fontSize: 11, fontWeight: '900' }}>
                                    {isPrimary ? 'PRIMARY COMPANY' : `ADDITIONAL COMPANY ${index}`}
                                </Text>
                                <Text style={{ color: peopleGlassPalette.text, fontWeight: '900', marginTop: 3 }}>
                                    {companyName(companyById.get(companyUser.company_id))} · {formatRole(companyUser.role)}
                                </Text>
                            </View>
                            {!isPrimary && (
                                <ThemedButton
                                    title="Make Primary"
                                    variant="glass"
                                    onPress={() => void onMakePrimary(companyUser.id)}
                                    style={{ minWidth: 0, paddingHorizontal: 12 }}
                                />
                            )}
                        </View>
                        <Text style={{ color: peopleGlassPalette.mutedText, marginTop: 3 }}>
                            Company account: {formatStatus(companyUser.status)}
                        </Text>
                        <PermissionSummary permissions={permissions} />
                    </View>
                );
            })}

            {person.homeMemberships.length > 0 && (
                <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(126, 211, 180, 0.28)', paddingTop: 12 }}>
                    <Text style={{ color: peopleGlassPalette.text, fontWeight: '900' }}>HomeOS memberships</Text>
                    {person.homeMemberships.map((membership) => (
                        <Text key={`${membership.property_id}-${membership.role}`} style={{ color: peopleGlassPalette.mutedText, marginTop: 4 }}>
                            {propertyName(propertyById.get(membership.property_id))} · {formatRole(membership.role || 'homeowner')} · {formatStatus(membership.status)}
                        </Text>
                    ))}
                </View>
            )}

            {person.clientCompanies.length > 0 && (
                <View style={{ marginTop: 14 }}>
                    <Text style={{ color: peopleGlassPalette.text, fontWeight: '900' }}>Connected client of</Text>
                    {person.clientCompanies.map((client) => (
                        <Text key={`${client.company_id}-${client.property_id}`} style={{ color: '#72E6C0', marginTop: 4, fontWeight: '800' }}>
                            {companyName(companyById.get(client.company_id))} · {client.display_name || propertyName(propertyById.get(client.property_id))} · {formatStatus(client.status)}
                        </Text>
                    ))}
                </View>
            )}
            <ThemedButton title="Close Account Details" variant="glass" onPress={onClose} style={{ marginTop: 18 }} />
        </View>
    );
}

function PermissionSummary({ permissions }: { permissions: CompanyPermissionSet }) {
    const allowed = PERMISSION_KEYS.filter((key) => permissions[key]).map((key) => COMPANY_PERMISSION_LABELS[key]);
    const denied = PERMISSION_KEYS.filter((key) => !permissions[key]).map((key) => COMPANY_PERMISSION_LABELS[key]);

    return (
        <View style={{ marginTop: 8 }}>
            <Text style={{ color: '#72E6C0', fontSize: 12, fontWeight: '800' }}>
                Allowed: {allowed.length > 0 ? allowed.join(' · ') : 'No company permissions'}
            </Text>
            <Text style={{ color: '#F1BE69', fontSize: 12, fontWeight: '800', marginTop: 4 }}>
                Not allowed: {denied.length > 0 ? denied.join(' · ') : 'None'}
            </Text>
        </View>
    );
}

function buildPersonRecord(input: Omit<PersonRecord, 'group' | 'active'>): PersonRecord {
    const roles = [
        ...input.companyUsers.map((companyUser) => normalizeRole(companyUser.role)),
        normalizeRole(input.platformRole),
    ].filter(Boolean);
    const group: PersonGroupKey =
        roles.some((role) => hasRoleWord(role, ['owner'])) ? 'owners' :
        roles.some((role) => hasRoleWord(role, ['admin', 'administrator', 'manager', 'management'])) ? 'management' :
        roles.some((role) => hasRoleWord(role, ['office', 'dispatch', 'dispatcher', 'supervisor', 'coordinator'])) ? 'office' :
        roles.some((role) => hasRoleWord(role, ['tech', 'technician', 'installer', 'field'])) ? 'technicians' :
        input.homeMemberships.length > 0 || roles.some((role) => hasRoleWord(role, ['homeowner', 'client', 'customer'])) ? 'clients' :
        'other';
    const authActive = !input.authStatus || ['active', 'linked', 'invited'].includes(input.authStatus);
    const relationshipActive = input.companyUsers.length > 0
        ? input.companyUsers.some((companyUser) => String(companyUser.status || '').toLowerCase() === 'active')
        : input.homeMemberships.every((membership) => !membership.status || String(membership.status).toLowerCase() === 'active');
    const active = authActive && relationshipActive;

    return { ...input, group, active };
}

function uniqueCompanyUsers(rows: CompanyUserRow[]) {
    return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function orderCompanyRelationships(rows: CompanyUserRow[]) {
    return [...rows].sort((left, right) => {
        if (Boolean(left.is_primary) !== Boolean(right.is_primary)) {
            return left.is_primary ? -1 : 1;
        }
        return left.id.localeCompare(right.id);
    });
}

function primaryCompanyRelationship(rows: CompanyUserRow[]) {
    return orderCompanyRelationships(rows)[0];
}

function uniqueClients(rows: ClientRow[]) {
    return Array.from(new Map(rows.map((row) => [`${row.company_id}-${row.property_id}`, row])).values());
}

function companyName(company?: CompanyRow) {
    return company?.public_name || company?.dba_name || company?.name || 'Unassigned company';
}

function propertyName(property?: PropertyRow) {
    return property?.name || property?.address_line_1 || property?.address || 'Home';
}

function formatRole(value?: string | null) {
    const normalized = String(value || 'user').replace(/[_-]+/g, ' ');
    return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatStatus(value?: string | null) {
    return formatRole(value || 'unknown');
}

function normalizeEmail(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function normalizeRole(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function hasRoleWord(role: string, words: string[]) {
    return words.some((word) => role === word || role.includes(`${word} `) || role.includes(` ${word}`));
}

function formatAuthStatus(value?: string | null) {
    const labels: Record<string, string> = {
        active: 'Active',
        invited: 'Invitation pending',
        linked: 'Linked account',
        missing_auth_account: 'Authentication account missing',
        pending_confirmation: 'Email confirmation pending',
        suspended: 'Suspended',
    };
    return labels[String(value || '')] || formatStatus(value || 'unknown');
}

function formatDate(value?: string | null) {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function personInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) || '?').toUpperCase();
}
