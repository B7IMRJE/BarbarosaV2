import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import HomeIdentityCard from '../components/HomeIdentityCard';
import PendingCustomerInvitesCard from '../components/PendingCustomerInvitesCard';
import SystemStatusCard from '../components/cards/SystemStatusCard';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import {
  isActivePropertyResolutionError,
  requireActivePropertyMembership,
} from '../lib/activeProperty';
import {
  scoreAllSystems,
  scoreHomeItem,
  scoreOverallHomeHealth,
  statusForCard,
  type HomeHealthEmergency,
  type HomeHealthItem,
} from '../lib/homeHealth';
import { homeSystems, isCustomServiceRoot } from '../lib/homeSystems';
import { loadActiveHomeIdentity, type HomeIdentity } from '../lib/homeIdentity';
import { labelDueStatus, type DueStatusLabel } from '../lib/maintenanceTimers';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type HomeDashboardItem = HomeHealthItem & {
  name?: string | null;
  item_slug?: string | null;
  system?: string | null;
  area?: string | null;
  location?: string | null;
  parent_area?: string | null;
  status?: string | null;
  install_state?: string | null;
  category?: string | null;
};

type HomeMaintenanceReminder = {
  id: string;
  title: string;
  next_due_date: string;
  reminder_status: 'active' | 'paused' | 'archived';
};

type PreferredProvider = {
  companyId: string;
  companyName: string;
  propertyId: string;
  source?: string;
};

type HomeServiceRequest = {
  id: string;
  company_id: string;
  property_id: string;
  request_type: string | null;
  status: string | null;
  priority: string | null;
  issue_summary: string | null;
  created_at: string | null;
  updated_at?: string | null;
  converted_job_id?: string | null;
};

type CreatedServiceRequestReceipt = {
  id: string;
  companyId: string;
  propertyId: string;
  requestType: string;
  status: string;
  priority: string;
  createdAt: string | null;
};

type DashboardSystemTile = {
  key: string;
  label: string;
  icon: string;
  route: 'documents' | 'plumbing' | 'system';
};

function logHomeMaintenanceSummaryError(stage: string, error: unknown) {
  const safeError = error as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  console.error('[HomeMaintenanceSummary]', {
    stage,
    message: typeof safeError?.message === 'string' ? safeError.message : 'Unknown error',
    code: typeof safeError?.code === 'string' || typeof safeError?.code === 'number' ? safeError.code : null,
    details: typeof safeError?.details === 'string' ? safeError.details : null,
    hint: typeof safeError?.hint === 'string' ? safeError.hint : null,
  });
}

export default function HomeScreen() {
  const { scaleFont, scaleIcon, theme } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const dashboardContentWidth = Math.min(Math.max(viewportWidth - scaleIcon(40), 0), 900);
  const healthTileGap = scaleIcon(10);
  const healthTileColumns =
    dashboardContentWidth >= 680 ? 4 : dashboardContentWidth >= 500 ? 3 : dashboardContentWidth >= 300 ? 2 : 1;
  const healthTileSize = Math.max(
    scaleIcon(118),
    Math.min(scaleIcon(156), (dashboardContentWidth - healthTileGap * (healthTileColumns - 1)) / healthTileColumns)
  );
  const actionTileSize = Math.max(scaleIcon(188), Math.min(scaleIcon(210), healthTileSize + scaleIcon(54)));
  const [homeIdentity, setHomeIdentity] = useState<HomeIdentity | null>(null);
  const [homeIdentityLoading, setHomeIdentityLoading] = useState(true);
  const [homeItems, setHomeItems] = useState<HomeDashboardItem[]>([]);
  const [activeEmergencies, setActiveEmergencies] = useState<HomeHealthEmergency[]>([]);
  const [maintenanceReminders, setMaintenanceReminders] = useState<HomeMaintenanceReminder[]>([]);
  const [maintenanceReminderMessage, setMaintenanceReminderMessage] = useState('');
  const [activePropertyId, setActivePropertyId] = useState('');
  const [preferredProvider, setPreferredProvider] = useState<PreferredProvider | null>(null);
  const [availableProviders, setAvailableProviders] = useState<PreferredProvider[]>([]);
  const [providerSelectionCompanyId, setProviderSelectionCompanyId] = useState('');
  const [serviceRequestType, setServiceRequestType] = useState<'regular' | 'emergency'>('regular');
  const [serviceIssueSummary, setServiceIssueSummary] = useState('');
  const [serviceRequestMessage, setServiceRequestMessage] = useState('');
  const [submittingServiceRequest, setSubmittingServiceRequest] = useState(false);
  const [homeServiceRequests, setHomeServiceRequests] = useState<HomeServiceRequest[]>([]);
  const [serviceRequestNoteById, setServiceRequestNoteById] = useState<Record<string, string>>({});
  const [serviceRequestActionId, setServiceRequestActionId] = useState<string | null>(null);
  const [lastCreatedServiceRequest, setLastCreatedServiceRequest] = useState<CreatedServiceRequestReceipt | null>(null);
  const [showServiceRequestForm, setShowServiceRequestForm] = useState(false);
  const [showHealthLegend, setShowHealthLegend] = useState(false);

  const loadHomeHealthData = useCallback(async () => {
    let activeProperty;

    try {
      activeProperty = await requireActivePropertyMembership();
    } catch (error) {
      setHomeIdentity(null);
      setHomeIdentityLoading(false);
      setHomeItems([]);
      setActiveEmergencies([]);
      setMaintenanceReminders([]);
      setMaintenanceReminderMessage('');
      setActivePropertyId('');
      setPreferredProvider(null);
      setAvailableProviders([]);
      setProviderSelectionCompanyId('');
      setServiceRequestMessage('');
      setHomeServiceRequests([]);
      setServiceRequestNoteById({});
      setLastCreatedServiceRequest(null);

      if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
        router.replace('/auth/login' as any);
      } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
        router.replace('/onboarding/create-home' as any);
      }

      return;
    }

    setHomeIdentityLoading(true);
    setActivePropertyId(activeProperty.propertyId);

    try {
      setHomeIdentity(await loadActiveHomeIdentity());
    } catch {
      setHomeIdentity(null);
    } finally {
      setHomeIdentityLoading(false);
    }

    await loadPreferredProvider(activeProperty.propertyId);
    await loadHomeServiceRequests(activeProperty.propertyId);

    const { data: items } = await supabase
      .from('home_items')
      .select('*')
      .eq('property_id', activeProperty.propertyId)
      .or('archived.eq.false,archived.is.null');

    const { data: emergencies } = await supabase
      .from('home_emergencies')
      .select('id, status, emergency_type')
      .eq('property_id', activeProperty.propertyId)
      .neq('status', 'Resolved');

    const { data: reminders, error: remindersError } = await supabase
      .from('home_item_maintenance_tasks')
      .select('id, title, next_due_date, reminder_status')
      .eq('property_id', activeProperty.propertyId)
      .neq('reminder_status', 'archived');

    if (remindersError) {
      logHomeMaintenanceSummaryError('load-reminders', remindersError);
      setMaintenanceReminders([]);
      setMaintenanceReminderMessage('Maintenance reminder summary could not be loaded.');
    } else {
      setMaintenanceReminders((reminders || []) as HomeMaintenanceReminder[]);
      setMaintenanceReminderMessage('');
    }

    setHomeItems((items || []) as HomeDashboardItem[]);
    setActiveEmergencies((emergencies || []) as HomeHealthEmergency[]);
  }, []);

  useEffect(() => {
    saveRecoverySession();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHomeHealthData();
    }, [loadHomeHealthData])
  );

  const issueItems = useMemo(() => {
    return homeItems
      .map((item) => ({
        item,
        health: scoreHomeItem(item),
      }))
      .filter(
        ({ item, health }) =>
          !sameText(item.category, 'Area') &&
          (health.status === 'critical' || health.status === 'needs_attention')
      )
      .sort((a, b) => {
        const severityDifference =
          issueSeverity(a.health.status) - issueSeverity(b.health.status);

        if (severityDifference !== 0) return severityDifference;

        return issueItemName(a.item).localeCompare(issueItemName(b.item));
      });
  }, [homeItems]);

  const healthSummary = useMemo(
    () => scoreOverallHomeHealth(homeItems, activeEmergencies),
    [homeItems, activeEmergencies]
  );
  const dashboardSystemTiles = useMemo(() => buildDashboardSystemTiles(homeItems), [homeItems]);
  const systemSummaries = useMemo(
    () => scoreAllSystems(homeItems, dashboardSystemTiles.map((system) => system.key)),
    [homeItems, dashboardSystemTiles]
  );
  const fixedSystemCount = homeSystems.length;
  const customSystemCount = Math.max(dashboardSystemTiles.length - fixedSystemCount, 0);
  const healthLegendItems = [
    {
      label: 'White / Empty',
      description: 'Area or service exists, but no items have been added yet.',
      colors: theme.colors.status.unknown,
    },
    {
      label: 'Green / Good',
      description: 'Items are added and currently OK.',
      colors: theme.colors.status.good,
    },
    {
      label: 'Yellow / Needs Review',
      description: 'Missing information, needs confirmation, unknown, or not inspected.',
      colors: theme.colors.status.notInspected,
    },
    {
      label: 'Red / Critical',
      description: 'Urgent, emergency, active leak, flood, gas smell, or problem.',
      colors: theme.colors.status.emergency,
    },
  ];

  function openSystemTile(system: DashboardSystemTile) {
    if (system.route === 'documents') {
      router.push('/documents');
      return;
    }

    if (system.route === 'plumbing') {
      router.push('/system/plumbing');
      return;
    }

    router.push({
      pathname: '/system/[system]',
      params: { system: system.key },
    });
  }
  const maintenanceReminderCounts = useMemo(() => {
    const counts: Record<DueStatusLabel, number> = {
      Overdue: 0,
      'Due Soon': 0,
      Upcoming: 0,
      Paused: 0,
    };

    maintenanceReminders.forEach((reminder) => {
      counts[labelDueStatus(reminder)] += 1;
    });

    return counts;
  }, [maintenanceReminders]);
  const maintenanceReminderSummary = [
    { label: 'overdue', count: maintenanceReminderCounts.Overdue },
    { label: 'due soon', count: maintenanceReminderCounts['Due Soon'] },
    { label: 'upcoming', count: maintenanceReminderCounts.Upcoming },
    { label: 'paused', count: maintenanceReminderCounts.Paused },
  ].filter((summary) => summary.count > 0);
  const progressWidth = `${healthSummary.score ?? 0}%` as `${number}%`;

  async function saveRecoverySession() {
    if (typeof window === 'undefined') return;

    const hash = new URLSearchParams(window.location.hash.replace('#', ''));

    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    const authType = hash.get('type');

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (authType === 'recovery') {
        window.history.replaceState({}, document.title, '/auth/reset-password');
        router.replace('/auth/reset-password' as any);
        return;
      }

      window.history.replaceState({}, document.title, '/');
    }
  }

  async function loadPreferredProvider(propertyId: string) {
    const { data: preferredRows, error: preferredError } = await supabase
      .from('property_preferred_providers')
      .select('company_id, property_id, status, selected_at')
      .eq('property_id', propertyId)
      .eq('status', 'active')
      .order('selected_at', { ascending: false });

    if (preferredError) {
      await loadConnectedProviderFallback(propertyId);
      return;
    }

    const preferredCompanyId = firstText(
      ...((preferredRows || []) as Array<{ company_id?: string | null }>).map((row) => row.company_id)
    );

    if (!preferredCompanyId) {
      await loadConnectedProviderFallback(propertyId);
      return;
    }

    const providers = await hydratePreferredProviders(propertyId, [preferredCompanyId], 'Active provider');
    const currentProvider = providers[0] || null;
    setAvailableProviders(currentProvider ? [currentProvider] : []);
    setPreferredProvider(currentProvider);
    setServiceRequestMessage(currentProvider ? '' : 'Choose a service provider first.');
  }

  async function loadConnectedProviderFallback(propertyId: string) {
    const { data, error } = await supabase
      .from('company_property_clients')
      .select('company_id, property_id, status, connected_at, created_at')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });

    if (error) {
      setAvailableProviders([]);
      setPreferredProvider(null);
      setServiceRequestMessage(`Choose a service provider first. Provider lookup failed: ${error.message}`);
      return;
    }

    const companyIds = uniqueCompanyIds(
      ((data || []) as Array<{ company_id?: string | null; status?: string | null }>)
        .filter((row) => !row.status || ['active', 'connected', 'approved'].includes(normalizeText(row.status)))
        .map((row) => row.company_id)
    );

    const fallbackCompanyId = companyIds[0] || '';
    const providers = fallbackCompanyId
      ? await hydratePreferredProviders(propertyId, [fallbackCompanyId], 'Connected provider')
      : [];
    const currentProvider = providers[0] || null;
    setAvailableProviders(currentProvider ? [currentProvider] : []);
    setPreferredProvider(currentProvider);
    setServiceRequestMessage(currentProvider ? '' : 'Choose a service provider first.');
  }

  async function hydratePreferredProviders(propertyId: string, companyIds: string[], source: string): Promise<PreferredProvider[]> {
    if (companyIds.length === 0) return [];

    const { data: companyData } = await supabase
      .from('companies')
      .select('id, name, public_name, dba_name')
      .in('id', companyIds);

    const companiesById = ((companyData || []) as Array<{
      id: string;
      name?: string | null;
      public_name?: string | null;
      dba_name?: string | null;
    }>).reduce<Record<string, { name?: string | null; public_name?: string | null; dba_name?: string | null }>>((accumulator, company) => {
      accumulator[company.id] = company;
      return accumulator;
    }, {});

    return companyIds.map((companyId) => {
      const companyRecord = companiesById[companyId] || {};

      return {
        companyId,
        companyName: firstText(companyRecord.public_name, companyRecord.dba_name, companyRecord.name) || 'Selected provider',
        propertyId,
        source,
      };
    });
  }

  async function handleSelectServiceProvider(provider: PreferredProvider) {
    if (!activePropertyId) {
      setServiceRequestMessage('Choose a home before choosing a service provider.');
      return;
    }

    setProviderSelectionCompanyId(provider.companyId);
    setServiceRequestMessage(`Choosing ${provider.companyName}...`);

    const { error } = await supabase.rpc('request_property_provider_connection', {
      p_property_id: activePropertyId,
      p_company_id: provider.companyId,
    });

    setProviderSelectionCompanyId('');

    if (error) {
      setServiceRequestMessage(`Could not save service provider: ${error.message}`);
      return;
    }

    setAvailableProviders([provider]);
    setPreferredProvider(provider);
    setServiceRequestMessage(`${provider.companyName} is selected for new service requests.`);
    await loadPreferredProvider(activePropertyId);
  }

  async function loadHomeServiceRequests(propertyId: string) {
    const { data, error } = await supabase
      .from('service_requests')
      .select('id, company_id, property_id, request_type, status, priority, issue_summary, created_at, updated_at, converted_job_id')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      setHomeServiceRequests([]);
      setServiceRequestMessage(`Could not load service request status: ${error.message}`);
      return false;
    }

    setHomeServiceRequests((data || []) as HomeServiceRequest[]);
    return true;
  }

  async function handleCreateServiceRequest() {
    const issueSummary = serviceIssueSummary.trim();

    if (!activePropertyId || !preferredProvider?.companyId) {
      setServiceRequestMessage('Choose a service provider first.');
      return;
    }

    if (!issueSummary) {
      setServiceRequestMessage('Add a short issue summary before sending the request.');
      return;
    }

    setSubmittingServiceRequest(true);
    setServiceRequestMessage('Sending service request...');

    const { data, error } = await supabase.rpc('create_homeowner_service_request', {
      p_property_id: activePropertyId,
      p_company_id: preferredProvider.companyId,
      p_request_type: serviceRequestType,
      p_issue_summary: issueSummary,
      p_priority: serviceRequestType === 'emergency' ? 'emergency' : 'normal',
    });

    setSubmittingServiceRequest(false);

    if (error) {
      setServiceRequestMessage(`Could not send service request: ${error.message}`);
      return;
    }

    const confirmedRequest = parseCreatedServiceRequest(data);

    if (!confirmedRequest) {
      setServiceRequestMessage('Could not confirm service request: Supabase did not return a service_request_id.');
      return;
    }

    setLastCreatedServiceRequest(confirmedRequest);
    setServiceIssueSummary('');
    setServiceRequestType('regular');
    setServiceRequestMessage(`Service request sent. Reference ${shortId(confirmedRequest.id)}.`);
    await loadHomeServiceRequests(activePropertyId);
  }

  async function handleRefreshHomeServiceRequests() {
    if (!activePropertyId) {
      setServiceRequestMessage('Choose a home before refreshing service requests.');
      return;
    }

    setServiceRequestMessage('Refreshing service requests...');
    const refreshed = await loadHomeServiceRequests(activePropertyId);

    if (refreshed) {
      setServiceRequestMessage('Service requests refreshed.');
    }
  }

  async function handleAddServiceRequestNote(request: HomeServiceRequest) {
    const note = (serviceRequestNoteById[request.id] || '').trim();

    if (!note) {
      setServiceRequestMessage('Write a note before adding it to the request.');
      return;
    }

    setServiceRequestActionId(request.id);
    setServiceRequestMessage('Adding note...');

    const { error } = await supabase.rpc('add_service_request_note', {
      p_service_request_id: request.id,
      p_message: note,
    });

    setServiceRequestActionId(null);

    if (error) {
      setServiceRequestMessage(formatServiceEventError(error.message, 'Service request notes are not installed yet. Review SQL 580 before adding notes.'));
      return;
    }

    setServiceRequestNoteById((current) => ({ ...current, [request.id]: '' }));
    setServiceRequestMessage('Note added to the service request.');
    await loadHomeServiceRequests(request.property_id);
  }

  async function handleRequestServiceUpdate(request: HomeServiceRequest) {
    setServiceRequestActionId(request.id);
    setServiceRequestMessage('Requesting update...');

    const { error } = await supabase.rpc('request_service_request_update', {
      p_service_request_id: request.id,
    });

    setServiceRequestActionId(null);

    if (error) {
      setServiceRequestMessage(formatServiceEventError(error.message, 'Service request updates are not installed yet. Review SQL 580 before requesting updates.'));
      return;
    }

    setServiceRequestMessage('Update requested. The company dispatch board will show this request.');
    await loadHomeServiceRequests(request.property_id);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        padding: scaleIcon(20),
        paddingBottom: scaleIcon(40),
        alignItems: 'center',
      }}
    >
      <View style={{ width: '100%', maxWidth: 900 }}>
        <HomeIdentityCard
          identity={homeIdentity}
          loading={homeIdentityLoading}
          onEdit={() => router.push('/home/edit' as any)}
        />

        <PendingCustomerInvitesCard
          compact
          onAccepted={loadHomeHealthData}
        />

        <View style={summaryGridStyle}>
          <ThemedCard style={summaryCardStyle}>
            <Text
              style={{
                fontSize: scaleFont(15),
                color: theme.colors.mutedText,
                fontWeight: '700',
                marginBottom: scaleIcon(10),
              }}
            >
              Home Health Status
            </Text>

            <Text
              style={{
                fontSize: scaleFont(26),
                fontWeight: '900',
                color: theme.colors.text,
                marginBottom: scaleIcon(14),
              }}
            >
              {healthSummary.label}
            </Text>

            <View
              style={{
                height: scaleIcon(16),
                backgroundColor: theme.colors.progressTrack,
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: progressWidth,
                  height: '100%',
                  backgroundColor: theme.colors.progressFill,
                }}
              />
            </View>

            <Text
              style={{
                marginTop: scaleIcon(12),
                fontSize: scaleFont(14),
                color: theme.colors.mutedText,
                lineHeight: scaleFont(20),
              }}
            >
              {healthSummary.score === null
                ? 'Start by adding real equipment, fixtures, documents, and photos from your home.'
                : `${healthSummary.score}/100 based on ${healthSummary.itemCount} home item${healthSummary.itemCount === 1 ? '' : 's'}.`}
            </Text>
          </ThemedCard>

          <ThemedCard style={summaryCardStyle}>
            <Text
              style={{
                fontSize: scaleFont(20),
                fontWeight: '900',
                color: theme.colors.text,
                marginBottom: scaleIcon(8),
              }}
            >
              Maintenance Reminders
            </Text>

            {maintenanceReminderMessage ? (
              <Text
                style={{
                  fontSize: scaleFont(15),
                  color: theme.colors.mutedText,
                  lineHeight: scaleFont(22),
                  marginBottom: scaleIcon(14),
                }}
              >
                {maintenanceReminderMessage}
              </Text>
            ) : maintenanceReminders.length === 0 ? (
              <Text
                style={{
                  fontSize: scaleFont(15),
                  color: theme.colors.mutedText,
                  lineHeight: scaleFont(22),
                  marginBottom: scaleIcon(14),
                }}
              >
                No maintenance reminders yet.
              </Text>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: scaleIcon(10),
                  marginBottom: scaleIcon(14),
                }}
              >
                {maintenanceReminderSummary.map((summary) => (
                  <View
                    key={summary.label}
                    style={{
                      backgroundColor: theme.colors.surfaceAlt,
                      borderColor: theme.colors.border,
                      borderWidth: 1,
                      borderRadius: theme.radii.card,
                      paddingVertical: scaleIcon(10),
                      paddingHorizontal: scaleIcon(12),
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: scaleFont(16),
                        fontWeight: '900',
                      }}
                    >
                      {summary.count} {summary.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <ThemedButton
              title="Open Maintenance"
              variant="secondary"
              onPress={() => router.push('/maintenance' as any)}
              style={{
                alignSelf: 'flex-start',
                paddingVertical: scaleIcon(12),
                paddingHorizontal: scaleIcon(18),
                marginTop: 'auto',
              }}
              textStyle={{
                fontSize: scaleFont(14),
              }}
            />
          </ThemedCard>
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: scaleIcon(10),
            marginTop: scaleIcon(26),
            marginBottom: scaleIcon(14),
          }}
        >
          <View>
            <Text
              style={{
                fontSize: scaleFont(20),
                fontWeight: '900',
                color: theme.colors.text,
              }}
            >
              Health Breakdown
            </Text>
            {customSystemCount > 0 && (
              <Text
                style={{
                  fontSize: scaleFont(13),
                  fontWeight: '800',
                  color: theme.colors.mutedText,
                  marginTop: scaleIcon(4),
                }}
              >
                {customSystemCount} custom service{customSystemCount === 1 ? '' : 's'} added
              </Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), justifyContent: 'flex-end' }}>
            <ThemedButton
              title="Legend"
              variant="secondary"
              onPress={() => setShowHealthLegend((current) => !current)}
              style={{
                paddingVertical: scaleIcon(10),
                paddingHorizontal: scaleIcon(14),
              }}
              textStyle={{ fontSize: scaleFont(13) }}
            />

            <ThemedButton
              title="Add Service"
              variant="secondary"
              onPress={() => router.push('/system/create')}
              style={{
                paddingVertical: scaleIcon(10),
                paddingHorizontal: scaleIcon(14),
              }}
              textStyle={{ fontSize: scaleFont(13) }}
            />
          </View>
        </View>

        {showHealthLegend && (
          <ThemedCard style={{ marginBottom: scaleIcon(14) }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: scaleFont(17),
                fontWeight: '900',
                marginBottom: scaleIcon(10),
              }}
            >
              Status Legend
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
              {healthLegendItems.map((item) => (
                <View
                  key={item.label}
                  style={{
                    flexGrow: 1,
                    flexBasis: 180,
                    borderWidth: 1,
                    borderColor: item.colors.border,
                    backgroundColor: item.colors.background,
                    borderRadius: theme.radii.card,
                    padding: scaleIcon(12),
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: scaleFont(14),
                      fontWeight: '900',
                      marginBottom: scaleIcon(4),
                    }}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.mutedText,
                      fontSize: scaleFont(12),
                      fontWeight: '700',
                      lineHeight: scaleFont(17),
                    }}
                  >
                    {item.description}
                  </Text>
                </View>
              ))}
            </View>
          </ThemedCard>
        )}

        <View style={[healthBreakdownGridStyle, { gap: healthTileGap }]}>
          {dashboardSystemTiles.map((system) => (
            <SystemStatusCard
              key={system.key}
              title={system.label}
              icon={system.icon}
              status={statusForCard(systemSummaries[system.key])}
              onPress={() => openSystemTile(system)}
              style={{
                width: healthTileSize,
                height: healthTileSize,
              }}
            />
          ))}
        </View>

        <ThemedCard
          style={{
            marginTop: scaleIcon(26),
          }}
        >
          <Text
            style={{
              fontSize: scaleFont(20),
              fontWeight: '900',
              color: theme.colors.text,
              marginBottom: scaleIcon(8),
            }}
          >
            Needs Attention
          </Text>

          {issueItems.length === 0 ? (
            <Text
              style={{
                fontSize: scaleFont(15),
                color: theme.colors.mutedText,
                lineHeight: scaleFont(22),
              }}
            >
              No issues reported.
            </Text>
          ) : (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: scaleIcon(12),
                justifyContent: 'center',
              }}
            >
              {issueItems.map(({ item, health }) => {
                const itemSlug = firstText(item.item_slug);
                const isCritical = health.status === 'critical';

                return (
                  <View
                    key={item.id || itemSlug || issueItemName(item)}
                    style={{
                      width: healthTileSize,
                      minHeight: healthTileSize,
                      borderWidth: 1,
                      borderColor: isCritical
                        ? theme.colors.status.activeEmergency.border
                        : theme.colors.border,
                      backgroundColor: isCritical
                        ? theme.colors.status.activeEmergency.background
                        : theme.colors.surface,
                      borderRadius: theme.radii.card,
                      padding: scaleIcon(14),
                      gap: scaleIcon(10),
                    }}
                  >
                    <View style={{ gap: 5 }}>
                      <Text
                        style={{
                          fontSize: scaleFont(17),
                          fontWeight: '900',
                          color: theme.colors.text,
                        }}
                      >
                        {issueItemName(item)}
                      </Text>

                      <Text
                        style={{
                          fontSize: scaleFont(14),
                          color: theme.colors.mutedText,
                          lineHeight: scaleFont(20),
                        }}
                      >
                        System: {firstText(item.system) || 'System not set'}
                      </Text>

                      <Text
                        style={{
                          fontSize: scaleFont(14),
                          color: theme.colors.mutedText,
                          lineHeight: scaleFont(20),
                        }}
                      >
                        Location:{' '}
                        {firstText(item.area, item.location, item.parent_area) ||
                          'Location not set'}
                      </Text>

                      <Text
                        style={{
                          fontSize: scaleFont(14),
                          color: theme.colors.mutedText,
                          lineHeight: scaleFont(20),
                        }}
                      >
                        Status: {issueStatusLabel(item, health.status)}
                      </Text>
                    </View>

                    {!!itemSlug && (
                      <ThemedButton
                        title="Open Item"
                        variant="secondary"
                        onPress={() => router.push(`/item/${itemSlug}` as any)}
                        style={{
                          alignSelf: 'flex-start',
                          paddingVertical: scaleIcon(12),
                          paddingHorizontal: scaleIcon(16),
                        }}
                        textStyle={{
                          fontSize: scaleFont(14),
                        }}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ThemedCard>

        <View style={actionCardGridStyle}>
          <ThemedCard
            style={[
              actionCardStyle,
              { width: actionTileSize, minHeight: actionTileSize },
              {
                borderColor: theme.colors.status.activeEmergency.border,
                backgroundColor: theme.colors.status.activeEmergency.background,
              },
            ]}
          >
            <Text
              style={{
                fontSize: scaleFont(18),
                fontWeight: '900',
                color: theme.colors.text,
                marginBottom: scaleIcon(8),
              }}
            >
              Emergency Center
            </Text>

            <Text
              style={{
                fontSize: scaleFont(14),
                color: theme.colors.mutedText,
                lineHeight: scaleFont(20),
                marginBottom: scaleIcon(14),
              }}
            >
              Report urgent home issues with photos, notes, and status history.
            </Text>

            <ThemedButton
              title="Open Emergency Center"
              onPress={() => router.push('/emergency' as any)}
              style={{ marginTop: 'auto', paddingVertical: scaleIcon(12), paddingHorizontal: scaleIcon(14) }}
              textStyle={{ fontSize: scaleFont(14) }}
            />
          </ThemedCard>

          <ThemedCard style={[actionCardStyle, { width: actionTileSize, minHeight: actionTileSize }]}>
            <Text
              style={{
                fontSize: scaleFont(18),
                fontWeight: '900',
                color: theme.colors.text,
                marginBottom: scaleIcon(8),
              }}
            >
              Maintenance Center
            </Text>

            <Text
              style={{
                fontSize: scaleFont(14),
                color: theme.colors.mutedText,
                lineHeight: scaleFont(20),
                marginBottom: scaleIcon(14),
              }}
            >
              Track service history, photos, documents, and next maintenance dates.
            </Text>

            <ThemedButton
              title="Open Maintenance Center"
              variant="secondary"
              onPress={() => router.push('/maintenance' as any)}
              style={{ marginTop: 'auto', paddingVertical: scaleIcon(12), paddingHorizontal: scaleIcon(14) }}
              textStyle={{ fontSize: scaleFont(14) }}
            />
          </ThemedCard>

          <ThemedCard style={[actionCardStyle, { width: actionTileSize, minHeight: actionTileSize }]}>
            <Text
              style={{
                fontSize: scaleFont(18),
                fontWeight: '900',
                color: theme.colors.text,
                marginBottom: scaleIcon(8),
              }}
            >
              Company Connections
            </Text>

            <Text
              style={{
                fontSize: scaleFont(14),
                color: theme.colors.mutedText,
                lineHeight: scaleFont(20),
                marginBottom: scaleIcon(14),
              }}
            >
              Review connected companies and pending access requests for your home.
            </Text>

            <ThemedButton
              title="Open Connections"
              variant="secondary"
              onPress={() => router.push('/connections' as any)}
              style={{ marginTop: 'auto', paddingVertical: scaleIcon(12), paddingHorizontal: scaleIcon(14) }}
              textStyle={{ fontSize: scaleFont(14) }}
            />
          </ThemedCard>

          <ThemedCard style={[actionCardStyle, { width: actionTileSize, minHeight: actionTileSize }]}>
            <Text
              style={{
                fontSize: scaleFont(18),
                fontWeight: '900',
                color: theme.colors.text,
                marginBottom: scaleIcon(8),
              }}
            >
              Request Service
            </Text>

            <Text
              style={{
                fontSize: scaleFont(14),
                color: theme.colors.mutedText,
                lineHeight: scaleFont(20),
                marginBottom: scaleIcon(14),
              }}
            >
              Open a regular or emergency service request with your selected provider.
            </Text>

            <ThemedButton
              title={showServiceRequestForm ? 'Hide Request Form' : 'Open Request Form'}
              onPress={() => setShowServiceRequestForm((current) => !current)}
              disabled={submittingServiceRequest}
              style={{ marginTop: 'auto', paddingVertical: scaleIcon(12), paddingHorizontal: scaleIcon(14) }}
              textStyle={{ fontSize: scaleFont(14) }}
            />
          </ThemedCard>
        </View>

        {showServiceRequestForm && (
          <ThemedCard style={{ marginTop: scaleIcon(18) }}>
            <Text
              style={{
                fontSize: scaleFont(20),
                fontWeight: '900',
                color: theme.colors.text,
                marginBottom: scaleIcon(8),
              }}
            >
              Request Service
            </Text>

          <Text
            style={{
              fontSize: scaleFont(14),
              color: theme.colors.mutedText,
              lineHeight: scaleFont(20),
              marginBottom: scaleIcon(6),
            }}
          >
            Provider: {preferredProvider?.companyName || 'Choose a service provider first.'}
            {preferredProvider?.source ? ` / ${preferredProvider.source}` : ''}
          </Text>
          {availableProviders.length > 1 && (
            <View style={{ marginBottom: scaleIcon(12) }}>
              <Text
                style={{
                  fontSize: scaleFont(12),
                  color: theme.colors.mutedText,
                  lineHeight: scaleFont(18),
                  marginBottom: scaleIcon(8),
                  fontWeight: '800',
                }}
              >
                Service provider
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8) }}>
                {availableProviders.map((provider) => {
                  const selected = provider.companyId === preferredProvider?.companyId;

                  return (
                    <ThemedButton
                      key={provider.companyId}
                      title={providerSelectionCompanyId === provider.companyId ? 'Saving...' : provider.companyName}
                      variant={selected ? 'primary' : 'secondary'}
                      disabled={!!providerSelectionCompanyId}
                      onPress={() => handleSelectServiceProvider(provider)}
                      style={{ flexGrow: 1, flexBasis: 180, paddingVertical: scaleIcon(10), paddingHorizontal: scaleIcon(12) }}
                      textStyle={{ fontSize: scaleFont(12) }}
                    />
                  );
                })}
              </View>
            </View>
          )}
          <Text
            style={{
              fontSize: scaleFont(12),
              color: theme.colors.mutedText,
              lineHeight: scaleFont(18),
              marginBottom: scaleIcon(12),
              fontWeight: '700',
            }}
          >
            Company ID: {preferredProvider?.companyId || 'Not selected'}
            {lastCreatedServiceRequest
              ? ` / Last confirmed request ${shortId(lastCreatedServiceRequest.id)} (${formatLabel(lastCreatedServiceRequest.status)})`
              : ''}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), marginBottom: scaleIcon(12) }}>
            <ThemedButton
              title="Regular"
              variant={serviceRequestType === 'regular' ? 'primary' : 'secondary'}
              onPress={() => setServiceRequestType('regular')}
              style={{ paddingVertical: scaleIcon(10), paddingHorizontal: scaleIcon(14) }}
              textStyle={{ fontSize: scaleFont(13) }}
            />
            <ThemedButton
              title="Emergency"
              variant={serviceRequestType === 'emergency' ? 'primary' : 'secondary'}
              onPress={() => setServiceRequestType('emergency')}
              style={{ paddingVertical: scaleIcon(10), paddingHorizontal: scaleIcon(14) }}
              textStyle={{ fontSize: scaleFont(13) }}
            />
          </View>

          <TextInput
            value={serviceIssueSummary}
            onChangeText={setServiceIssueSummary}
            placeholder="Briefly describe the issue"
            placeholderTextColor={theme.colors.mutedText}
            multiline
            style={{
              minHeight: scaleIcon(92),
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.card,
              padding: scaleIcon(12),
              color: theme.colors.text,
              fontSize: scaleFont(14),
              fontWeight: '700',
              textAlignVertical: 'top',
              marginBottom: scaleIcon(12),
            }}
          />

          <ThemedButton
            title={submittingServiceRequest ? 'Sending...' : serviceRequestType === 'emergency' ? 'Request Emergency Service' : 'Request Service'}
            onPress={handleCreateServiceRequest}
            disabled={submittingServiceRequest || !preferredProvider}
            style={{ alignSelf: 'flex-start', paddingVertical: scaleIcon(12), paddingHorizontal: scaleIcon(16) }}
            textStyle={{ fontSize: scaleFont(14) }}
          />
          <ThemedButton
            title="Refresh Requests"
            variant="secondary"
            onPress={handleRefreshHomeServiceRequests}
            disabled={!activePropertyId}
            style={{
              alignSelf: 'flex-start',
              paddingVertical: scaleIcon(10),
              paddingHorizontal: scaleIcon(14),
              marginTop: scaleIcon(8),
            }}
            textStyle={{ fontSize: scaleFont(13) }}
          />

          {!!serviceRequestMessage && (
            <Text
              style={{
                fontSize: scaleFont(13),
                color: theme.colors.mutedText,
                lineHeight: scaleFont(19),
                marginTop: scaleIcon(10),
                fontWeight: '700',
              }}
            >
              {serviceRequestMessage}
            </Text>
          )}

          {homeServiceRequests.length > 0 && (
            <View style={{ marginTop: scaleIcon(16), gap: scaleIcon(10) }}>
              {homeServiceRequests.map((request) => {
                const isActiveRequest = !['converted_to_job', 'cancelled', 'canceled'].includes(normalizeText(request.status));
                const isActing = serviceRequestActionId === request.id;

                return (
                  <View
                    key={request.id}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radii.card,
                      padding: scaleIcon(12),
                      backgroundColor: theme.colors.surface,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900' }}>
                      {formatLabel(request.request_type)} request / {formatLabel(request.status)}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '700', lineHeight: scaleFont(19), marginTop: scaleIcon(4) }}>
                      Provider company: {preferredProvider?.companyName || shortId(request.company_id)}
                      {' / '}Created {formatDate(request.created_at)}
                      {' / '}Ref {shortId(request.id)}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '700', lineHeight: scaleFont(19), marginTop: scaleIcon(4) }}>
                      {request.issue_summary || 'No summary available.'}
                    </Text>

                    {isActiveRequest && (
                      <>
                        <TextInput
                          value={serviceRequestNoteById[request.id] || ''}
                          onChangeText={(text) => setServiceRequestNoteById((current) => ({ ...current, [request.id]: text }))}
                          placeholder="Add a note for dispatch"
                          placeholderTextColor={theme.colors.mutedText}
                          multiline
                          style={{
                            minHeight: scaleIcon(72),
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radii.card,
                            padding: scaleIcon(10),
                            color: theme.colors.text,
                            fontSize: scaleFont(13),
                            fontWeight: '700',
                            textAlignVertical: 'top',
                            marginTop: scaleIcon(10),
                          }}
                        />
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), marginTop: scaleIcon(10) }}>
                          <ThemedButton
                            title={isActing ? 'Saving...' : 'Add Note'}
                            variant="secondary"
                            disabled={isActing}
                            onPress={() => handleAddServiceRequestNote(request)}
                            style={{ paddingVertical: scaleIcon(10), paddingHorizontal: scaleIcon(14) }}
                            textStyle={{ fontSize: scaleFont(13) }}
                          />
                          <ThemedButton
                            title={isActing ? 'Requesting...' : 'Request Update'}
                            disabled={isActing}
                            onPress={() => handleRequestServiceUpdate(request)}
                            style={{ paddingVertical: scaleIcon(10), paddingHorizontal: scaleIcon(14) }}
                            textStyle={{ fontSize: scaleFont(13) }}
                          />
                        </View>
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          </ThemedCard>
        )}

      </View>
    </ScrollView>
  );
}

const summaryGridStyle = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  alignItems: 'stretch' as const,
  gap: 14,
  marginTop: 22,
};

const summaryCardStyle = {
  flexGrow: 1,
  flexBasis: 360,
  minWidth: 280,
};

const actionCardGridStyle = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  alignItems: 'stretch' as const,
  justifyContent: 'center' as const,
  gap: 12,
  marginTop: 18,
};

const actionCardStyle = {
  flexShrink: 0,
};

const healthBreakdownGridStyle = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  alignItems: 'flex-start' as const,
  justifyContent: 'center' as const,
};



function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = String(value || '').trim();

    if (text) return text;
  }

  return '';
}

function buildDashboardSystemTiles(items: HomeDashboardItem[]): DashboardSystemTile[] {
  const customSystemsByKey = new Map<string, string>();

  items.forEach((item) => {
    if (!isCustomServiceRoot(item)) return;

    const systemName = firstText(item.system);
    const normalizedSystemName = normalizeText(systemName);

    if (!systemName) return;

    if (!customSystemsByKey.has(normalizedSystemName)) {
      customSystemsByKey.set(normalizedSystemName, systemName);
    }
  });

  const fixedTiles = homeSystems.map<DashboardSystemTile>((system) => ({
    key: system.key,
    label: system.label,
    icon: system.icon,
    route: system.key === 'Documents' ? 'documents' : system.key === 'Plumbing' ? 'plumbing' : 'system',
  }));

  const customTiles = Array.from(customSystemsByKey.values())
    .sort((a, b) => a.localeCompare(b))
    .map<DashboardSystemTile>((systemName) => ({
      key: systemName,
      label: systemName,
      icon: getCustomSystemIcon(systemName),
      route: 'system',
    }));

  return [...fixedTiles, ...customTiles];
}

function getCustomSystemIcon(systemName: string) {
  const normalizedName = normalizeText(systemName);

  if (normalizedName.includes('storage') || normalizedName.includes('inventory')) return '📦';
  if (normalizedName.includes('roof')) return '🏠';
  if (normalizedName.includes('paint')) return '🎨';
  if (normalizedName.includes('siding')) return '🏡';
  if (normalizedName.includes('landscape') || normalizedName.includes('yard')) return '🌿';

  return '🏠';
}

function sameText(a?: string | null, b?: string | null) {
  return firstText(a).toLowerCase() === firstText(b).toLowerCase();
}

function issueSeverity(status: string) {
  return status === 'critical' ? 0 : 1;
}

function issueItemName(item: HomeDashboardItem) {
  return firstText(item.name) || 'Unnamed Item';
}

function issueStatusLabel(item: HomeDashboardItem, status: string) {
  return (
    firstText(item.status, item.install_state) ||
    (status === 'critical' ? 'Emergency' : 'Needs Attention')
  );
}

function normalizeText(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function uniqueCompanyIds(values: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return values.reduce<string[]>((ids, value) => {
    const id = firstText(value);

    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }

    return ids;
  }, []);
}

function formatLabel(value?: string | null) {
  const normalized = normalizeText(value);

  if (!normalized) return 'Unknown';

  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value?: string | null) {
  if (!value) return 'Not available';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}

function shortId(value?: string | null) {
  return String(value || '').replace(/-/g, '').slice(0, 8).toUpperCase() || 'UNKNOWN';
}

function parseCreatedServiceRequest(data: unknown): CreatedServiceRequestReceipt | null {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row !== 'object') return null;

  const record = row as Record<string, unknown>;
  const id = String(record.service_request_id || '').trim();
  const companyId = String(record.company_id || '').trim();
  const propertyId = String(record.property_id || '').trim();

  if (!id || !companyId || !propertyId) return null;

  return {
    id,
    companyId,
    propertyId,
    requestType: String(record.request_type || ''),
    status: String(record.status || ''),
    priority: String(record.priority || ''),
    createdAt: typeof record.created_at === 'string' ? record.created_at : null,
  };
}

function formatServiceEventError(message: string, setupMessage: string) {
  const normalized = normalizeText(message);

  if (
    normalized.includes('schema cache') ||
    normalized.includes('function') ||
    normalized.includes('service_request_events')
  ) {
    return setupMessage;
  }

  return `Could not update service request: ${message}`;
}
