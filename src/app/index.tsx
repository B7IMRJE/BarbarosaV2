import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import HomeIdentityCard from '../components/HomeIdentityCard';
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
import { homeSystems } from '../lib/homeSystems';
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
  condition?: string | null;
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
  const [homeIdentity, setHomeIdentity] = useState<HomeIdentity | null>(null);
  const [homeIdentityLoading, setHomeIdentityLoading] = useState(true);
  const [homeItems, setHomeItems] = useState<HomeDashboardItem[]>([]);
  const [activeEmergencies, setActiveEmergencies] = useState<HomeHealthEmergency[]>([]);
  const [maintenanceReminders, setMaintenanceReminders] = useState<HomeMaintenanceReminder[]>([]);
  const [maintenanceReminderMessage, setMaintenanceReminderMessage] = useState('');
  const [activePropertyId, setActivePropertyId] = useState('');
  const [preferredProvider, setPreferredProvider] = useState<PreferredProvider | null>(null);
  const [serviceRequestType, setServiceRequestType] = useState<'regular' | 'emergency'>('regular');
  const [serviceIssueSummary, setServiceIssueSummary] = useState('');
  const [serviceRequestMessage, setServiceRequestMessage] = useState('');
  const [submittingServiceRequest, setSubmittingServiceRequest] = useState(false);
  const [homeServiceRequests, setHomeServiceRequests] = useState<HomeServiceRequest[]>([]);
  const [serviceRequestNoteById, setServiceRequestNoteById] = useState<Record<string, string>>({});
  const [serviceRequestActionId, setServiceRequestActionId] = useState<string | null>(null);

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
      setServiceRequestMessage('');
      setHomeServiceRequests([]);
      setServiceRequestNoteById({});

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
  const systemSummaries = useMemo(
    () => scoreAllSystems(homeItems, homeSystems.map((system) => system.key)),
    [homeItems]
  );
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
      .order('selected_at', { ascending: false })
      .limit(1);

    if (preferredError) {
      setPreferredProvider(null);
      setServiceRequestMessage('Choose a preferred provider before requesting service.');
      return;
    }

    const preferredRow = (preferredRows || [])[0] as { company_id?: string | null; property_id?: string | null } | undefined;
    const providerCompanyId = String(preferredRow?.company_id || '').trim();

    if (!providerCompanyId) {
      setPreferredProvider(null);
      setServiceRequestMessage('Choose a preferred provider before requesting service.');
      return;
    }

    const { data: companyData } = await supabase
      .from('companies')
      .select('id, name, public_name, dba_name')
      .eq('id', providerCompanyId)
      .maybeSingle();

    const companyRecord = (companyData || {}) as {
      id?: string | null;
      name?: string | null;
      public_name?: string | null;
      dba_name?: string | null;
    };

    setPreferredProvider({
      companyId: providerCompanyId,
      companyName: firstText(companyRecord.public_name, companyRecord.dba_name, companyRecord.name) || 'Selected provider',
      propertyId,
    });
    setServiceRequestMessage('');
  }

  async function loadHomeServiceRequests(propertyId: string) {
    const { data, error } = await supabase
      .from('service_requests')
      .select('id, company_id, property_id, request_type, status, priority, issue_summary, created_at, updated_at, converted_job_id')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      const normalized = String(error.message || '').toLowerCase();
      setHomeServiceRequests([]);

      if (normalized.includes('service_requests') || normalized.includes('schema cache')) {
        return;
      }

      setServiceRequestMessage(`Could not load service request status: ${error.message}`);
      return;
    }

    setHomeServiceRequests((data || []) as HomeServiceRequest[]);
  }

  async function handleCreateServiceRequest() {
    const issueSummary = serviceIssueSummary.trim();

    if (!activePropertyId || !preferredProvider?.companyId) {
      setServiceRequestMessage('Choose a preferred provider before requesting service.');
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
      const normalized = String(error.message || '').toLowerCase();
      setServiceRequestMessage(
        normalized.includes('schema cache') || normalized.includes('function')
          ? 'Service request intake is not installed yet. The Dispatch Board setup proposal is ready for review.'
          : `Could not send service request: ${error.message}`
      );
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const requestId = row && typeof row === 'object' ? String((row as Record<string, unknown>).service_request_id || '').slice(0, 8) : '';

    setServiceIssueSummary('');
    setServiceRequestType('regular');
    setServiceRequestMessage(requestId ? `Service request sent. Reference ${requestId}.` : 'Service request sent.');
    await loadHomeServiceRequests(activePropertyId);
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

        <Text
          style={{
            fontSize: scaleFont(20),
            fontWeight: '900',
            color: theme.colors.text,
            marginTop: scaleIcon(26),
            marginBottom: scaleIcon(14),
          }}
        >
          Health Breakdown
        </Text>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: scaleIcon(12),
          }}
        >
          {homeSystems.map((system) => (
            <SystemStatusCard
              key={system.key}
              title={system.label}
              icon={system.icon}
              status={statusForCard(systemSummaries[system.key])}
              onPress={() => {
                if (system.key === 'Documents') {
                  router.push('/documents' as any);
                  return;
                }

                if (system.key === 'Plumbing') {
                  router.push('/system/plumbing' as any);
                  return;
                }

                router.push({
                  pathname: '/system/[system]',
                  params: { system: system.key },
                } as any);
              }}
              style={{
                width: '48%',
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
            <View style={{ gap: 12 }}>
              {issueItems.map(({ item, health }) => {
                const itemSlug = firstText(item.item_slug);
                const isCritical = health.status === 'critical';

                return (
                  <View
                    key={item.id || itemSlug || issueItemName(item)}
                    style={{
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

          <ThemedCard style={actionCardStyle}>
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

          <ThemedCard style={actionCardStyle}>
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

          <ThemedCard style={actionCardStyle}>
            <Text
              style={{
                fontSize: scaleFont(18),
                fontWeight: '900',
                color: theme.colors.text,
                marginBottom: scaleIcon(8),
              }}
            >
              Request Professional Help
            </Text>

            <Text
              style={{
                fontSize: scaleFont(14),
                color: theme.colors.mutedText,
                lineHeight: scaleFont(20),
                marginBottom: scaleIcon(14),
              }}
            >
              Request support from a trusted home service professional.
            </Text>

            <ThemedButton
              title="Request Professional Help"
              onPress={handleCreateServiceRequest}
              disabled={submittingServiceRequest || !preferredProvider}
              style={{ marginTop: 'auto', paddingVertical: scaleIcon(12), paddingHorizontal: scaleIcon(14) }}
              textStyle={{ fontSize: scaleFont(14) }}
            />
          </ThemedCard>
        </View>

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
              marginBottom: scaleIcon(12),
            }}
          >
            Provider: {preferredProvider?.companyName || 'Choose a provider in Company Connections first.'}
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

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            backgroundColor: theme.colors.surface,
            borderRadius: 26,
            paddingVertical: scaleIcon(16),
            marginTop: scaleIcon(28),
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ fontWeight: '900', color: theme.colors.text }}>Home</Text>

          <Text
            onPress={() => router.push('/equipment' as any)}
            style={{ fontWeight: '800', color: theme.colors.mutedText }}
          >
            Equipment
          </Text>

          <Text
            onPress={() => router.push('/documents' as any)}
            style={{ fontWeight: '800', color: theme.colors.mutedText }}
          >
            Documents
          </Text>

          <Text
            onPress={() => router.push('/profile' as any)}
            style={{ fontWeight: '800', color: theme.colors.mutedText }}
          >
            Profile
          </Text>
        </View>
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
  gap: 12,
  marginTop: 18,
};

const actionCardStyle = {
  flexGrow: 1,
  flexBasis: 200,
  minWidth: 200,
  minHeight: 220,
};



function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = String(value || '').trim();

    if (text) return text;
  }

  return '';
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
    firstText(item.status, item.condition, item.install_state) ||
    (status === 'critical' ? 'Emergency' : 'Needs Attention')
  );
}

function normalizeText(value?: string | null) {
  return String(value || '').trim().toLowerCase();
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
