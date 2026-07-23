import type { ReactNode } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import SystemStatusCard from '../cards/SystemStatusCard';
import HomeIdentityCard from '../HomeIdentityCard';
import ThemedButton from '../theme/ThemedButton';
import ThemedCard from '../theme/ThemedCard';
import {
  scoreAllSystems,
  scoreHomeItem,
  scoreOverallHomeHealth,
  statusForCard,
  type HomeHealthEmergency,
  type HomeHealthItem,
} from '../../lib/homeHealth';
import {
  buildHomeDashboardSystemTiles,
  type DashboardSystemTile,
} from '../../lib/homeDashboardSystems';
import { homeSystems } from '../../lib/homeSystems';
import type { HomeIdentity } from '../../lib/homeIdentity';
import { labelDueStatus, type DueStatusLabel } from '../../lib/maintenanceTimers';
import { useTheme } from '../../theme/useTheme';

export type { DashboardSystemTile } from '../../lib/homeDashboardSystems';

export type HomeDashboardItem = HomeHealthItem & {
  id?: string | null;
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

export type HomeDashboardMaintenanceReminder = {
  id: string;
  title: string;
  next_due_date: string;
  reminder_status: 'active' | 'paused' | 'archived';
};

type HomeDashboardViewProps = {
  identity: HomeIdentity | null;
  identityLoading: boolean;
  onEditIdentity: () => void;
  items: HomeDashboardItem[];
  emergencies?: HomeHealthEmergency[];
  maintenanceReminders: HomeDashboardMaintenanceReminder[];
  maintenanceReminderMessage?: string;
  afterIdentity?: ReactNode;
  beforeSummary?: ReactNode;
  afterHealthBreakdown?: ReactNode;
  showHealthLegend: boolean;
  onToggleHealthLegend: () => void;
  showAddService?: boolean;
  onAddService?: () => void;
  onOpenMaintenance?: () => void;
  maintenanceFooter?: ReactNode;
  healthBreakdownSubtitle?: string;
  issueOpenLabel?: string;
  onOpenSystemTile: (system: DashboardSystemTile) => void;
  onOpenIssueItem?: (item: HomeDashboardItem) => void;
};

export default function HomeDashboardView({
  identity,
  identityLoading,
  onEditIdentity,
  items,
  emergencies = [],
  maintenanceReminders,
  maintenanceReminderMessage = '',
  afterIdentity,
  beforeSummary,
  afterHealthBreakdown,
  showHealthLegend,
  onToggleHealthLegend,
  showAddService = true,
  onAddService,
  onOpenMaintenance,
  maintenanceFooter,
  healthBreakdownSubtitle,
  issueOpenLabel = 'Open Item',
  onOpenSystemTile,
  onOpenIssueItem,
}: HomeDashboardViewProps) {
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
  const healthSummary = scoreOverallHomeHealth(items, emergencies);
  const dashboardSystemTiles = buildHomeDashboardSystemTiles(items);
  const systemSummaries = scoreAllSystems(items, dashboardSystemTiles.map((system) => system.key));
  const fixedSystemCount = homeSystems.length;
  const customSystemCount = Math.max(dashboardSystemTiles.length - fixedSystemCount, 0);
  const issueItems = items
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
      const severityDifference = issueSeverity(a.health.status) - issueSeverity(b.health.status);

      if (severityDifference !== 0) return severityDifference;

      return issueItemName(a.item).localeCompare(issueItemName(b.item));
    });
  const maintenanceReminderCounts: Record<DueStatusLabel, number> = {
    Overdue: 0,
    'Due Soon': 0,
    Upcoming: 0,
    Paused: 0,
  };

  maintenanceReminders.forEach((reminder) => {
    maintenanceReminderCounts[labelDueStatus(reminder)] += 1;
  });

  const maintenanceReminderSummary = [
    { label: 'overdue', count: maintenanceReminderCounts.Overdue },
    { label: 'due soon', count: maintenanceReminderCounts['Due Soon'] },
    { label: 'upcoming', count: maintenanceReminderCounts.Upcoming },
    { label: 'paused', count: maintenanceReminderCounts.Paused },
  ].filter((summary) => summary.count > 0);
  const progressWidth = `${healthSummary.score ?? 0}%` as `${number}%`;
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

  return (
    <>
      <HomeIdentityCard
        identity={identity}
        loading={identityLoading}
        onEdit={onEditIdentity}
      />

      {afterIdentity}
      {beforeSummary}

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

          {onOpenMaintenance ? (
            <ThemedButton
              title="Open Maintenance"
              variant="secondary"
              onPress={onOpenMaintenance}
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
          ) : null}

          {maintenanceFooter}
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
          {healthBreakdownSubtitle ? (
            <Text
              style={{
                fontSize: scaleFont(13),
                fontWeight: '800',
                color: theme.colors.mutedText,
                marginTop: scaleIcon(4),
              }}
            >
              {healthBreakdownSubtitle}
            </Text>
          ) : customSystemCount > 0 ? (
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
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), justifyContent: 'flex-end' }}>
          <ThemedButton
            title="Legend"
            variant="secondary"
            onPress={onToggleHealthLegend}
            style={{
              paddingVertical: scaleIcon(10),
              paddingHorizontal: scaleIcon(14),
            }}
            textStyle={{ fontSize: scaleFont(13) }}
          />

          {showAddService && onAddService ? (
            <ThemedButton
              title="Add Service"
              variant="secondary"
              onPress={onAddService}
              style={{
                paddingVertical: scaleIcon(10),
                paddingHorizontal: scaleIcon(14),
              }}
              textStyle={{ fontSize: scaleFont(13) }}
            />
          ) : null}
        </View>
      </View>

      {showHealthLegend ? (
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
      ) : null}

      <View style={[healthBreakdownGridStyle, { gap: healthTileGap }]}>
        {dashboardSystemTiles.map((system) => (
          <SystemStatusCard
            key={system.key}
            title={system.label}
            icon={system.icon}
            status={statusForCard(systemSummaries[system.key])}
            onPress={() => onOpenSystemTile(system)}
            style={{
              width: healthTileSize,
              height: healthTileSize,
            }}
          />
        ))}
      </View>

      {afterHealthBreakdown}

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
                      Location: {firstText(item.area, item.location, item.parent_area) || 'Location not set'}
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

                  {itemSlug && onOpenIssueItem ? (
                    <ThemedButton
                      title={issueOpenLabel}
                      variant="secondary"
                      onPress={() => onOpenIssueItem(item)}
                      style={{
                        alignSelf: 'flex-start',
                        paddingVertical: scaleIcon(12),
                        paddingHorizontal: scaleIcon(16),
                      }}
                      textStyle={{
                        fontSize: scaleFont(14),
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ThemedCard>
    </>
  );
}

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
    firstText(item.status, item.install_state) ||
    (status === 'critical' ? 'Emergency' : 'Needs Attention')
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

const healthBreakdownGridStyle = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  alignItems: 'flex-start' as const,
  justifyContent: 'center' as const,
};
