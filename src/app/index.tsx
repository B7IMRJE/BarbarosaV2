import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import PendingCustomerInvitesCard from '../components/PendingCustomerInvitesCard';
import HomeDashboardView, {
  type DashboardSystemTile,
  type HomeDashboardItem,
  type HomeDashboardMaintenanceReminder,
} from '../components/homeos/HomeDashboardView';
import ServiceRequestMediaGallery from '../components/serviceRequests/ServiceRequestMediaGallery';
import ServiceRequestMediaPicker from '../components/serviceRequests/ServiceRequestMediaPicker';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import {
  isActivePropertyResolutionError,
  requireActivePropertyMembership,
} from '../lib/activeProperty';
import {
  formatServiceRequestReference,
  requestHomeownerServiceRequestUpdate,
} from '../lib/homeServiceRequests';
import {
  getHomeownerFacingStatusLabel,
  isActiveHomeownerServiceRequest,
} from '../lib/homeownerActiveRequests';
import {
  loadHomeownerServiceRequestTimeline,
  markHomeownerServiceNotificationRead,
  type ServiceRequestActivityEvent,
} from '../lib/serviceRequestActivity';
import {
  hasUnresolvedServiceRequestMedia,
  uploadPendingServiceRequestMedia,
  type ServiceRequestMediaDraft,
} from '../lib/serviceRequestMedia';
import type { HomeHealthEmergency } from '../lib/homeHealth';
import { loadActiveHomeIdentity, loadHomeIdentityForProperty, type HomeIdentity } from '../lib/homeIdentity';
import {
  providerModePath,
  providerModeItemPath,
  providerModeQueryParams,
  readProviderModeParams,
} from '../lib/providerMode';
import {
  buildProviderHomeItemsRpcArgs,
  hasAssignedProviderHomeItemsContext,
} from '../lib/providerHomeItems';
import { getProviderReturnActionLabel } from '../lib/techosClientAccess';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type PreferredProvider = {
  companyId: string;
  companyName: string;
  propertyId: string;
  source?: string;
};

type HomeServiceRequest = {
  id: string;
  display_sequence: number | null;
  display_code: string | null;
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
  displayCode: string | null;
  displaySequence: number | null;
  companyId: string;
  propertyId: string;
  requestType: string;
  status: string;
  priority: string;
  createdAt: string | null;
};

const HOMEOS_SERVICE_REQUEST_REFRESH_MS = 30_000;

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
  const routeParams = useLocalSearchParams<{
    providerMode?: string | string[];
    companyId?: string | string[];
    propertyId?: string | string[];
    returnTo?: string | string[];
    serviceRequestId?: string | string[];
    scheduleSlotId?: string | string[];
    jobId?: string | string[];
  }>();
  const providerModeContext = useMemo(() => readProviderModeParams(routeParams), [
    routeParams.providerMode,
    routeParams.companyId,
    routeParams.propertyId,
    routeParams.returnTo,
    routeParams.serviceRequestId,
    routeParams.scheduleSlotId,
    routeParams.jobId,
  ]);
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
  const [maintenanceReminders, setMaintenanceReminders] = useState<HomeDashboardMaintenanceReminder[]>([]);
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
  const [serviceRequestTimelineById, setServiceRequestTimelineById] = useState<Record<string, ServiceRequestActivityEvent[]>>({});
  const [serviceRequestTimelineMessage, setServiceRequestTimelineMessage] = useState('');
  const [selectedServiceRequestId, setSelectedServiceRequestId] = useState('');
  const [serviceRequestNoteById, setServiceRequestNoteById] = useState<Record<string, string>>({});
  const [serviceRequestActionId, setServiceRequestActionId] = useState<string | null>(null);
  const [lastCreatedServiceRequest, setLastCreatedServiceRequest] = useState<CreatedServiceRequestReceipt | null>(null);
  const [pendingServiceRequest, setPendingServiceRequest] = useState<CreatedServiceRequestReceipt | null>(null);
  const [serviceRequestMedia, setServiceRequestMedia] = useState<ServiceRequestMediaDraft[]>([]);
  const [showServiceRequestForm, setShowServiceRequestForm] = useState(false);
  const [showHealthLegend, setShowHealthLegend] = useState(false);
  const [providerCompanyName, setProviderCompanyName] = useState('');
  const homeownerServiceNotifications = useMemo(
    () => Object.values(serviceRequestTimelineById)
      .flat()
      .filter((event) => event.audience === 'homeowner')
      .sort((first, second) => getTimeValue(second.created_at) - getTimeValue(first.created_at))
      .slice(0, 5),
    [serviceRequestTimelineById]
  );
  const unreadServiceNotificationCount = homeownerServiceNotifications.filter((event) => !event.read_at).length;

  const loadHomeHealthData = useCallback(async () => {
    let activeProperty;

    try {
      activeProperty = await requireActivePropertyMembership({
        propertyIdOverride: providerModeContext?.propertyId,
        companyId: providerModeContext?.companyId,
      });
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
      setServiceRequestTimelineById({});
      setServiceRequestTimelineMessage('');
      setSelectedServiceRequestId('');
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
      setHomeIdentity(providerModeContext
        ? await loadHomeIdentityForProperty(providerModeContext.propertyId, {
          ownerDisplayName: 'Customer',
          canEdit: false,
        })
        : await loadActiveHomeIdentity());
    } catch {
      setHomeIdentity(null);
    } finally {
      setHomeIdentityLoading(false);
    }

    if (providerModeContext) {
      await loadProviderCompanyName(providerModeContext.companyId);
      setPreferredProvider(null);
      setAvailableProviders([]);
      setProviderSelectionCompanyId('');
      setServiceRequestMessage('');
      setHomeServiceRequests([]);
      setServiceRequestNoteById({});
      setLastCreatedServiceRequest(null);
    } else {
      setProviderCompanyName('');
      await loadPreferredProvider(activeProperty.propertyId);
      await loadHomeServiceRequests(activeProperty.propertyId);
    }

    let items: HomeDashboardItem[] = [];
    let itemLoadMessage = '';

    if (providerModeContext) {
      if (!hasAssignedProviderHomeItemsContext(providerModeContext)) {
        itemLoadMessage = 'Provider context is missing the assigned request, visit, or job. Use Back to Current Job and reopen Client HomeOS.';
      } else {
        const { data, error } = await supabase.rpc(
          'get_provider_homeos_items',
          buildProviderHomeItemsRpcArgs(providerModeContext)
        );

        if (error) {
          itemLoadMessage = `Client HomeOS items could not be loaded: ${error.message}`;
        } else {
          items = (data || []) as HomeDashboardItem[];
        }
      }
    } else {
      const { data, error } = await supabase
        .from('home_items')
        .select('*')
        .eq('property_id', activeProperty.propertyId)
        .or('archived.eq.false,archived.is.null');

      if (error) {
        itemLoadMessage = `HomeOS items could not be loaded: ${error.message}`;
      } else {
        items = (data || []) as HomeDashboardItem[];
      }
    }

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
      setMaintenanceReminders((reminders || []) as HomeDashboardMaintenanceReminder[]);
      setMaintenanceReminderMessage('');
    }

    setHomeItems(items);
    setActiveEmergencies((emergencies || []) as HomeHealthEmergency[]);
    if (itemLoadMessage) setServiceRequestMessage(itemLoadMessage);
  }, [providerModeContext]);

  useEffect(() => {
    saveRecoverySession();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHomeHealthData();
    }, [loadHomeHealthData])
  );

  useEffect(() => {
    if (!providerModeContext || typeof window === 'undefined') return;

    const refreshFromLifecycle = () => {
      void loadHomeHealthData();
    };
    const refreshWhenVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        refreshFromLifecycle();
      }
    };

    window.addEventListener('focus', refreshFromLifecycle);
    document?.addEventListener?.('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', refreshFromLifecycle);
      document?.removeEventListener?.('visibilitychange', refreshWhenVisible);
    };
  }, [providerModeContext, loadHomeHealthData]);

  useEffect(() => {
    if (!activePropertyId || providerModeContext) return;

    const refreshHomeServiceRequests = () => {
      void loadHomeServiceRequests(activePropertyId);
    };
    const channel = supabase
      .channel(`homeos-service-request-events:${activePropertyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_request_events',
          filter: `property_id=eq.${activePropertyId}`,
        },
        refreshHomeServiceRequests
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_requests',
          filter: `property_id=eq.${activePropertyId}`,
        },
        refreshHomeServiceRequests
      )
      .subscribe();
    const fallbackRefreshId = setInterval(refreshHomeServiceRequests, HOMEOS_SERVICE_REQUEST_REFRESH_MS);

    return () => {
      clearInterval(fallbackRefreshId);
      void supabase.removeChannel(channel);
    };
  }, [activePropertyId, providerModeContext]);

  function openSystemTile(system: DashboardSystemTile) {
    if (providerModeContext) {
      if (system.route === 'documents') {
        setServiceRequestMessage('Shared documents stay locked until the provider sharing workflow is enabled.');
        return;
      }

      router.push({
        pathname: '/system/[system]',
        params: {
          system: system.key,
          ...providerModeQueryParams(providerModeContext),
        },
      } as any);
      return;
    }

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

  async function loadProviderCompanyName(companyId: string) {
    const { data } = await supabase
      .from('companies')
      .select('id, name, public_name, dba_name')
      .eq('id', companyId)
      .maybeSingle();

    const company = (data || null) as { name?: string | null; public_name?: string | null; dba_name?: string | null } | null;
    setProviderCompanyName(firstText(company?.public_name, company?.dba_name, company?.name) || 'Company');
  }
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
      .select('id, display_sequence, display_code, company_id, property_id, request_type, status, priority, issue_summary, created_at, updated_at, converted_job_id')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      setHomeServiceRequests([]);
      setServiceRequestTimelineById({});
      setServiceRequestMessage(`Could not load service request status: ${error.message}`);
      return false;
    }

    const loadedRequests = (data || []) as HomeServiceRequest[];
    setHomeServiceRequests(loadedRequests);
    await loadHomeownerTimelinesForRequests(loadedRequests);
    return true;
  }

  async function loadHomeownerTimelinesForRequests(requests: HomeServiceRequest[]) {
    if (requests.length === 0) {
      setServiceRequestTimelineById({});
      setServiceRequestTimelineMessage('');
      return;
    }

    const entries = await Promise.all(
      requests.map(async (request) => {
        try {
          return {
            requestId: request.id,
            events: await loadHomeownerServiceRequestTimeline(request.id),
            error: '',
          };
        } catch (error) {
          return {
            requestId: request.id,
            events: [] as ServiceRequestActivityEvent[],
            error: getErrorMessage(error),
          };
        }
      })
    );
    const firstError = entries.find((entry) => entry.error)?.error || '';

    setServiceRequestTimelineById(entries.reduce<Record<string, ServiceRequestActivityEvent[]>>((accumulator, entry) => {
      accumulator[entry.requestId] = entry.events;
      return accumulator;
    }, {}));
    setServiceRequestTimelineMessage(firstError ? `Could not load some appointment updates: ${firstError}` : '');
  }

  async function handleOpenServiceNotification(event: ServiceRequestActivityEvent) {
    setSelectedServiceRequestId(event.service_request_id);

    if (event.read_at) return;

    try {
      const markedRead = await markHomeownerServiceNotificationRead(event.id);

      if (!markedRead) return;

      const readAt = new Date().toISOString();
      setServiceRequestTimelineById((current) => {
        const events = current[event.service_request_id] || [];

        return {
          ...current,
          [event.service_request_id]: events.map((item) => (
            item.id === event.id
              ? {
                ...item,
                read_at: readAt,
                notification_delivery_status: item.notification_delivery_status === 'sent'
                  ? 'delivered'
                  : item.notification_delivery_status,
              }
              : item
          )),
        };
      });
    } catch (error) {
      setServiceRequestTimelineMessage(`Could not update notification read state: ${getErrorMessage(error)}`);
    }
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

    if (hasUnresolvedServiceRequestMedia(serviceRequestMedia)) {
      setServiceRequestMessage('Wait for the current media action to finish before sending the request.');
      return;
    }

    setSubmittingServiceRequest(true);
    setServiceRequestMessage(pendingServiceRequest ? 'Retrying media upload...' : 'Sending service request...');

    let confirmedRequest = pendingServiceRequest;

    if (!confirmedRequest) {
      const { data, error } = await supabase.rpc('create_homeowner_service_request', {
        p_property_id: activePropertyId,
        p_company_id: preferredProvider.companyId,
        p_request_type: serviceRequestType,
        p_issue_summary: issueSummary,
        p_priority: serviceRequestType === 'emergency' ? 'emergency' : 'normal',
      });

      if (error) {
        setSubmittingServiceRequest(false);
        setServiceRequestMessage(`Could not send service request: ${error.message}`);
        return;
      }

      confirmedRequest = parseCreatedServiceRequest(data);
    }

    if (!confirmedRequest) {
      setSubmittingServiceRequest(false);
      setServiceRequestMessage('Could not confirm service request: Supabase did not return a service_request_id.');
      return;
    }

    try {
      if (serviceRequestMedia.length > 0) {
        setPendingServiceRequest(confirmedRequest);
        setServiceRequestMessage('Uploading request media...');
        await uploadPendingServiceRequestMedia({
          companyId: confirmedRequest.companyId,
          propertyId: confirmedRequest.propertyId,
          serviceRequestId: confirmedRequest.id,
          items: serviceRequestMedia,
          onItemChange: updateServiceRequestMediaDraft,
        });
      }
    } catch (error) {
      setPendingServiceRequest(confirmedRequest);
      setSubmittingServiceRequest(false);
      setServiceRequestMessage(`${formatServiceRequestReference(confirmedRequest)} was created, but media upload failed: ${getErrorMessage(error)}. Remove or retry the failed file to finish attaching media.`);
      return;
    }

    setSubmittingServiceRequest(false);
    setLastCreatedServiceRequest(confirmedRequest);
    setPendingServiceRequest(null);
    setServiceRequestMedia([]);
    setServiceIssueSummary('');
    setServiceRequestType('regular');
    setServiceRequestMessage(`Service request sent. ${formatServiceRequestReference(confirmedRequest)}.`);
    await loadHomeServiceRequests(activePropertyId);
  }

  function updateServiceRequestMediaDraft(localId: string, updates: Partial<ServiceRequestMediaDraft>) {
    setServiceRequestMedia((current) => current.map((item) => (
      item.localId === localId ? { ...item, ...updates } : item
    )));
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

    try {
      const result = await requestHomeownerServiceRequestUpdate(request.id);

      setServiceRequestMessage(result.message);
      await loadHomeServiceRequests(request.property_id);
    } catch (error) {
      setServiceRequestMessage(`Request update failed: ${getErrorMessage(error)}`);
    } finally {
      setServiceRequestActionId(null);
    }
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
        <HomeDashboardView
          identity={homeIdentity}
          identityLoading={homeIdentityLoading}
          onEditIdentity={() => {
            if (providerModeContext) {
              setServiceRequestMessage('Provider mode edits are staged only. Update Client HomeOS publishing is coming next.');
              return;
            }

            router.push('/home/edit' as any);
          }}
          items={homeItems}
          emergencies={activeEmergencies}
          maintenanceReminders={maintenanceReminders}
          maintenanceReminderMessage={maintenanceReminderMessage}
          afterIdentity={providerModeContext ? undefined : (
            <PendingCustomerInvitesCard
              compact
              onAccepted={loadHomeHealthData}
            />
          )}
          beforeSummary={providerModeContext ? (
            <ThemedCard style={{ marginTop: scaleIcon(14), marginBottom: scaleIcon(16) }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(12), justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, minWidth: 220 }}>
                  <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900', textTransform: 'uppercase' }}>
                    Provider Mode
                  </Text>
                  <Text style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900', marginTop: scaleIcon(4) }}>
                    Viewing client HomeOS
                  </Text>
                  <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), fontWeight: '800', lineHeight: scaleFont(20), marginTop: scaleIcon(6) }}>
                    Company: {providerCompanyName || 'Company'} / client property {shortId(providerModeContext.propertyId)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), justifyContent: 'flex-end' }}>
                  <ThemedButton
                    title="Refresh"
                    variant="secondary"
                    onPress={loadHomeHealthData}
                    style={{ paddingVertical: scaleIcon(10), paddingHorizontal: scaleIcon(12) }}
                    textStyle={{ fontSize: scaleFont(12) }}
                  />
                  <ThemedButton
                    title="Client Home"
                    variant="secondary"
                    onPress={() => router.replace(providerModePath('/', providerModeContext) as any)}
                    style={{ paddingVertical: scaleIcon(10), paddingHorizontal: scaleIcon(12) }}
                    textStyle={{ fontSize: scaleFont(12) }}
                  />
                  <ThemedButton
                    title="Company Dashboard"
                    variant="secondary"
                    onPress={() => router.replace(`/super-admin/company/${providerModeContext.companyId}` as any)}
                    style={{ paddingVertical: scaleIcon(10), paddingHorizontal: scaleIcon(12) }}
                    textStyle={{ fontSize: scaleFont(12) }}
                  />
                  <ThemedButton
                    title={getProviderReturnActionLabel(providerModeContext.returnTo)}
                    onPress={() => router.replace((providerModeContext.returnTo || `/super-admin/company/${providerModeContext.companyId}/client/${providerModeContext.propertyId}`) as any)}
                    style={{ paddingVertical: scaleIcon(10), paddingHorizontal: scaleIcon(12) }}
                    textStyle={{ fontSize: scaleFont(12) }}
                  />
                </View>
              </View>
            </ThemedCard>
          ) : undefined}
          showHealthLegend={showHealthLegend}
          onToggleHealthLegend={() => setShowHealthLegend((current) => !current)}
          onAddService={() => {
            if (providerModeContext) {
              setServiceRequestMessage('Provider mode changes are staged only. Add Service publishing is coming next.');
              return;
            }

            router.push('/system/create' as any);
          }}
          onOpenMaintenance={() => {
            if (providerModeContext) {
              setServiceRequestMessage('Provider mode maintenance editing is staged only. Client publishing is coming next.');
              return;
            }

            router.push('/maintenance' as any);
          }}
          onOpenSystemTile={openSystemTile}
          onOpenIssueItem={(item) => {
            const itemSlug = firstText(item.item_slug);

            if (itemSlug) {
              router.push(providerModeContext ? providerModeItemPath(itemSlug, providerModeContext) : `/item/${itemSlug}` as any);
            }
          }}
        />

        {providerModeContext ? (
          <>
            <ThemedCard style={{ marginTop: scaleIcon(18) }}>
              <Text style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900', marginBottom: scaleIcon(8) }}>
                Company Tools
              </Text>
              <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), fontWeight: '800', lineHeight: scaleFont(20) }}>
                Open an item to add estimates, company notes, findings, job photos, or staged client updates. Homeowner service requests and provider selection are hidden in provider mode.
              </Text>
            </ThemedCard>
            <ServiceRequestMediaGallery
              serviceRequestId={providerModeContext.serviceRequestId}
              title="Current job photos and videos"
            />
          </>
        ) : (
        <>
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
            Company: {preferredProvider?.companyName || 'Not selected'}
            {lastCreatedServiceRequest
              ? ` / Last confirmed ${formatServiceRequestReference(lastCreatedServiceRequest)} (${getHomeownerFacingStatusLabel(lastCreatedServiceRequest.status)})`
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

          {serviceRequestType === 'emergency' && (
            <Text
              style={{
                fontSize: scaleFont(13),
                color: theme.colors.mutedText,
                lineHeight: scaleFont(19),
                marginBottom: scaleIcon(10),
                fontWeight: '800',
              }}
            >
              If there is immediate danger, fire, gas odor, electrical danger, or a medical emergency, call 911. If safe, shut off the affected water or gas supply.
            </Text>
          )}

          <ServiceRequestMediaPicker
            items={serviceRequestMedia}
            disabled={submittingServiceRequest}
            onChange={setServiceRequestMedia}
            onMessage={setServiceRequestMessage}
          />

          {!!pendingServiceRequest && (
            <Text
              style={{
                fontSize: scaleFont(13),
                color: theme.colors.mutedText,
                lineHeight: scaleFont(19),
                marginBottom: scaleIcon(10),
                fontWeight: '900',
              }}
            >
              {formatServiceRequestReference(pendingServiceRequest)} is waiting for media to finish. Retrying will use the same request.
            </Text>
          )}

          <ThemedButton
            title={submittingServiceRequest ? 'Sending...' : serviceRequestType === 'emergency' ? 'Request Emergency Service' : 'Request Service'}
            onPress={handleCreateServiceRequest}
            disabled={submittingServiceRequest || !preferredProvider || hasUnresolvedServiceRequestMedia(serviceRequestMedia)}
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
          {!!serviceRequestTimelineMessage && (
            <Text
              style={{
                fontSize: scaleFont(13),
                color: theme.colors.mutedText,
                lineHeight: scaleFont(19),
                marginTop: scaleIcon(8),
                fontWeight: '700',
              }}
            >
              {serviceRequestTimelineMessage}
            </Text>
          )}

          {homeownerServiceNotifications.length > 0 && (
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.card,
                padding: scaleIcon(10),
                marginTop: scaleIcon(14),
                backgroundColor: theme.colors.background,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: scaleIcon(8) }}>
                <Text style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900' }}>
                  Notifications
                </Text>
                {unreadServiceNotificationCount > 0 && (
                  <View
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: scaleIcon(9),
                      paddingVertical: scaleIcon(4),
                      backgroundColor: theme.colors.primary,
                    }}
                  >
                    <Text style={{ color: theme.colors.primaryText, fontSize: scaleFont(12), fontWeight: '900' }}>
                      {unreadServiceNotificationCount} unread
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ gap: scaleIcon(8), marginTop: scaleIcon(8) }}>
                {homeownerServiceNotifications.map((event) => (
                  <TouchableOpacity
                    key={event.id}
                    activeOpacity={0.78}
                    onPress={() => handleOpenServiceNotification(event)}
                    style={{
                      borderWidth: 1,
                      borderColor: selectedServiceRequestId === event.service_request_id
                        ? theme.colors.primary
                        : theme.colors.border,
                      borderRadius: theme.radii.card,
                      padding: scaleIcon(10),
                      backgroundColor: event.read_at ? theme.colors.surface : theme.colors.background,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: '900' }}>
                      {formatServiceTimelineTitle(event.event_type)}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '700', lineHeight: scaleFont(18), marginTop: scaleIcon(2) }}>
                      {event.message || 'Appointment update'}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '700', marginTop: scaleIcon(4) }}>
                      {formatDateTime(event.created_at)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {homeServiceRequests.length > 0 && (
            <View style={{ marginTop: scaleIcon(16), gap: scaleIcon(10) }}>
              {homeServiceRequests.map((request) => {
                const isActing = serviceRequestActionId === request.id;
                const timelineEvents = serviceRequestTimelineById[request.id] || [];
                const latestTimelineEvent = timelineEvents[timelineEvents.length - 1] || null;
                const isActiveRequest = isActiveHomeownerServiceRequest(request);
                const statusLabel = getHomeownerFacingStatusLabel(request.status, latestTimelineEvent?.event_type);
                const selected = selectedServiceRequestId === request.id;

                return (
                  <View
                    key={request.id}
                    style={{
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      borderRadius: theme.radii.card,
                      padding: scaleIcon(12),
                      backgroundColor: theme.colors.surface,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900' }}>
                      {formatLabel(request.request_type)} request / {statusLabel}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '700', lineHeight: scaleFont(19), marginTop: scaleIcon(4) }}>
                      Provider company: {preferredProvider?.companyName || 'Provider company on file'}
                      {' / '}Created {formatDate(request.created_at)}
                      {' / '}{formatServiceRequestReference(request)}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '700', lineHeight: scaleFont(19), marginTop: scaleIcon(4) }}>
                      {request.issue_summary || 'No summary available.'}
                    </Text>

                    <ServiceRequestMediaGallery
                      serviceRequestId={request.id}
                      title="Request photos and videos"
                      compact
                    />

                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radii.card,
                        padding: scaleIcon(10),
                        marginTop: scaleIcon(10),
                        backgroundColor: theme.colors.background,
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900' }}>
                        Appointment Updates
                      </Text>
                      {timelineEvents.length === 0 ? (
                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '700', lineHeight: scaleFont(19), marginTop: scaleIcon(4) }}>
                          Updates will appear here when your appointment is scheduled or your technician shares a customer-visible status.
                        </Text>
                      ) : (
                        <View style={{ gap: scaleIcon(8), marginTop: scaleIcon(8) }}>
                          {timelineEvents.slice(-5).map((event) => (
                            <View key={event.id}>
                              <Text style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: '900' }}>
                                {formatServiceTimelineTitle(event.event_type)}
                              </Text>
                              <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '700', lineHeight: scaleFont(18) }}>
                                {event.message || 'Appointment update'}
                              </Text>
                              <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '700', marginTop: scaleIcon(2) }}>
                                {formatDateTime(event.created_at)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

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
        </>
        )}

      </View>
    </ScrollView>
  );
}

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

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = String(value || '').trim();

    if (text) return text;
  }

  return '';
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

function formatDateTime(value?: string | null) {
  if (!value) return 'Not available';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function formatServiceTimelineTitle(eventType?: string | null) {
  const normalized = normalizeText(eventType);
  const labels: Record<string, string> = {
    request_acknowledged: 'Request Acknowledged',
    appointment_scheduled: 'Appointment Scheduled',
    technician_assigned: 'Technician Assigned',
    technician_reassigned: 'Technician Reassigned',
    technician_on_the_way: 'Technician On the Way',
    technician_delayed: 'Technician Delayed',
    technician_arriving_soon: 'Technician Arriving Soon',
    technician_arrived: 'Technician Arrived',
    work_in_progress: 'Work in Progress',
    waiting_for_customer_approval: 'Waiting for Customer Approval',
    appointment_delayed: 'Appointment Delayed',
    work_completed: 'Work Completed',
    work_completed_rating_requested: 'Work Completed',
  };

  return labels[normalized] || formatLabel(eventType);
}

function getTimeValue(value?: string | null) {
  if (!value) return 0;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
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
    displayCode: readOptionalString(record.display_code)?.toUpperCase() || null,
    displaySequence: readOptionalNumber(record.display_sequence),
    companyId,
    propertyId,
    requestType: String(record.request_type || ''),
    status: String(record.status || ''),
    priority: String(record.priority || ''),
    createdAt: typeof record.created_at === 'string' ? record.created_at : null,
  };
}

function readOptionalString(value: unknown) {
  const text = String(value || '').trim();

  return text || null;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}
