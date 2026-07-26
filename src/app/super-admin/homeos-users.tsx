import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
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

type AccountRow = {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    auth_status: string | null;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
    created_at: string | null;
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
                supabase.rpc('get_platform_people_accounts_v2'),
                supabase.from('companies').select('id, name, public_name, dba_name').order('name', { ascending: true }),
                supabase.from('company_users').select('id, company_id, auth_user_id, full_name, email, role, status').order('full_name', { ascending: true }),
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
            style={{ flex: 1, backgroundColor: orbitalGlassPalette.screen }}
            contentContainerStyle={{ alignItems: 'center', padding: 20, paddingBottom: 48 }}
        >
            <View style={{ width: '100%', maxWidth: 1180 }}>
                <AdminNavBar backFallback="/super-admin" />
                <Text style={{ color: orbitalGlassPalette.text, fontSize: 34, fontWeight: '900', marginTop: 20 }}>
                    People Directory
                </Text>
                <Text style={{ color: orbitalGlassPalette.mutedText, fontSize: 16, lineHeight: 23, marginTop: 8, marginBottom: 20 }}>
                    Platform accounts, company positions, client relationships, account status, and effective permissions.
                </Text>

                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search name, email, account ID, role, or company"
                    placeholderTextColor={orbitalGlassPalette.mutedText}
                    style={{
                        backgroundColor: 'rgba(16, 49, 75, 0.9)',
                        borderColor: 'rgba(174, 205, 229, 0.48)',
                        borderRadius: 14,
                        borderWidth: 1,
                        color: orbitalGlassPalette.text,
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

                <Text style={{ color: orbitalGlassPalette.mutedText, fontWeight: '800', marginVertical: 16 }}>
                    Showing {filteredPeople.length} of {people.length} people
                </Text>

                {!!message && (
                    <Text style={{ color: orbitalGlassPalette.mutedText, marginBottom: 16, fontWeight: '800' }}>
                        {message}
                    </Text>
                )}

                {GROUPS.map((group) => {
                    const groupPeople = filteredPeople.filter((person) => person.group === group.key);
                    if (groupPeople.length === 0) return null;

                    return (
                        <GlassCard key={group.key} tone="steel" style={{ padding: 18, marginBottom: 18 }}>
                            <Text style={{ color: orbitalGlassPalette.text, fontSize: 22, fontWeight: '900' }}>
                                {group.label} · {groupPeople.length}
                            </Text>
                            <Text style={{ color: orbitalGlassPalette.mutedText, marginTop: 4, marginBottom: 12 }}>
                                {group.description}
                            </Text>
                            <View style={{ gap: 10 }}>
                                {groupPeople.map((person) => (
                                    <PersonRow
                                        key={person.key}
                                        person={person}
                                        companyById={companyById}
                                        propertyById={propertyById}
                                    />
                                ))}
                            </View>
                        </GlassCard>
                    );
                })}

                {!message && filteredPeople.length === 0 && (
                    <GlassCard tone="steel" style={{ padding: 20 }}>
                        <Text style={{ color: orbitalGlassPalette.text, fontWeight: '900' }}>
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
            <Text style={{ color: orbitalGlassPalette.text, fontWeight: '900', marginBottom: 8 }}>{label}</Text>
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

function PersonRow({
    person,
    companyById,
    propertyById,
}: {
    person: PersonRecord;
    companyById: Map<string, CompanyRow>;
    propertyById: Map<string, PropertyRow>;
}) {
    return (
        <View
            style={{
                backgroundColor: 'rgba(6, 31, 50, 0.72)',
                borderColor: person.active ? 'rgba(72, 207, 168, 0.55)' : 'rgba(231, 173, 84, 0.58)',
                borderRadius: 12,
                borderWidth: 1,
                padding: 15,
            }}
        >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 220 }}>
                    <Text style={{ color: orbitalGlassPalette.text, fontSize: 18, fontWeight: '900' }}>{person.name}</Text>
                    <Text selectable style={{ color: orbitalGlassPalette.text, fontSize: 14, marginTop: 4 }}>
                        {person.email || 'No email available'}
                    </Text>
                    <Text selectable style={{ color: orbitalGlassPalette.mutedText, fontSize: 11, marginTop: 4 }}>
                        Account: {person.accountId || 'Invitation or company-only record'}
                    </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: person.active ? '#72E6C0' : '#F1BE69', fontWeight: '900' }}>
                        {person.active ? 'ACTIVE' : 'INACTIVE / SUSPENDED'}
                    </Text>
                    {!!person.platformRole && (
                        <Text style={{ color: orbitalGlassPalette.mutedText, marginTop: 4 }}>
                            Platform role: {formatRole(person.platformRole)}
                        </Text>
                    )}
                    <Text style={{ color: orbitalGlassPalette.mutedText, marginTop: 4 }}>
                        Login: {formatAuthStatus(person.authStatus)}
                    </Text>
                </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 }}>
                <Text style={{ color: orbitalGlassPalette.mutedText, fontSize: 12 }}>
                    Email confirmed: {formatDate(person.emailConfirmedAt)}
                </Text>
                <Text style={{ color: orbitalGlassPalette.mutedText, fontSize: 12 }}>
                    Last sign-in: {formatDate(person.lastSignInAt)}
                </Text>
                <Text style={{ color: orbitalGlassPalette.mutedText, fontSize: 12 }}>
                    Account created: {formatDate(person.accountCreatedAt)}
                </Text>
            </View>

            {person.companyUsers.map((companyUser) => {
                const permissions = resolveCompanyPermissions(companyUser);
                return (
                    <View key={companyUser.id} style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(174, 205, 229, 0.24)', paddingTop: 12 }}>
                        <Text style={{ color: orbitalGlassPalette.text, fontWeight: '900' }}>
                            {companyName(companyById.get(companyUser.company_id))} · {formatRole(companyUser.role)}
                        </Text>
                        <Text style={{ color: orbitalGlassPalette.mutedText, marginTop: 3 }}>
                            Company account: {formatStatus(companyUser.status)}
                        </Text>
                        <PermissionSummary permissions={permissions} />
                    </View>
                );
            })}

            {person.homeMemberships.length > 0 && (
                <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(174, 205, 229, 0.24)', paddingTop: 12 }}>
                    <Text style={{ color: orbitalGlassPalette.text, fontWeight: '900' }}>HomeOS memberships</Text>
                    {person.homeMemberships.map((membership) => (
                        <Text key={`${membership.property_id}-${membership.role}`} style={{ color: orbitalGlassPalette.mutedText, marginTop: 4 }}>
                            {propertyName(propertyById.get(membership.property_id))} · {formatRole(membership.role || 'homeowner')} · {formatStatus(membership.status)}
                        </Text>
                    ))}
                </View>
            )}

            {person.clientCompanies.length > 0 && (
                <View style={{ marginTop: 14 }}>
                    <Text style={{ color: orbitalGlassPalette.text, fontWeight: '900' }}>Connected client of</Text>
                    {person.clientCompanies.map((client) => (
                        <Text key={`${client.company_id}-${client.property_id}`} style={{ color: '#72E6C0', marginTop: 4, fontWeight: '800' }}>
                            {companyName(companyById.get(client.company_id))} · {client.display_name || propertyName(propertyById.get(client.property_id))} · {formatStatus(client.status)}
                        </Text>
                    ))}
                </View>
            )}
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
