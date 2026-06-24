import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import { loadEstimateDraft } from '../lib/estimateDraft';
import { loadJobs, type Job } from '../lib/jobs';
import { isStaffRole, loadCurrentUserRole } from '../lib/roles';
import { useTheme } from '../theme/useTheme';

type DashboardCounts = {
    todayJobs: number;
    openEstimates: number;
    waitingApproval: number;
    newMessages: number;
};

const defaultCounts: DashboardCounts = {
    todayJobs: 0,
    openEstimates: 0,
    waitingApproval: 0,
    newMessages: 0,
};

const actionCards = [
    {
        title: 'Create Job',
        description: 'Start a new job thread for a customer, home system, room, or item.',
        route: '/jobs',
        button: 'Open Jobs',
    },
    {
        title: 'Build Estimate',
        description: 'Prepare proposal options from job notes, photos, and HomeOS equipment data.',
        route: '/estimate',
        button: 'Open Estimates',
    },
    {
        title: 'Dispatch Tech',
        description: 'Assign work, track field progress, and keep the office informed.',
        route: '/dispatch',
        button: 'Open Dispatch',
    },
    {
        title: 'Review Field Package',
        description: 'Photos, findings, customer notes, and recommended repair options will live here.',
        route: '/jobs',
        button: 'Review Jobs',
    },
];

const workflowSteps = [
    'Job intake',
    'Dispatch',
    'Assessment',
    'Photos and notes',
    'Estimate options',
    'Customer approval',
    'Completion',
    'Invoice and review request',
];

export default function ManagementScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [canUseStaffTools, setCanUseStaffTools] = useState(false);
    const [counts, setCounts] = useState<DashboardCounts>(defaultCounts);
    const [recentJobs, setRecentJobs] = useState<Job[]>([]);
    const [message, setMessage] = useState('Loading ManagementOS dashboard...');

    useEffect(() => {
        checkAccess();
    }, []);

    async function checkAccess() {
        const role = await loadCurrentUserRole();
        const canAccess = isStaffRole(role);

        setCanUseStaffTools(canAccess);
        setCheckingAccess(false);

        if (canAccess) {
            await loadDashboardCounts();
        } else {
            setMessage('');
        }
    }

    async function loadDashboardCounts() {
        try {
            setMessage('Loading ManagementOS dashboard...');

            const [jobs, estimateDraftItems] = await Promise.all([
                loadJobs(),
                loadEstimateDraft(),
            ]);

            setRecentJobs(jobs.slice(0, 5));
            setCounts({
                todayJobs: jobs.filter(isJobTouchedToday).length,
                openEstimates: estimateDraftItems.length,
                waitingApproval: jobs.filter(isWaitingForApproval).length,
                newMessages: 0,
            });
            setMessage('');
        } catch (error: any) {
            setCounts(defaultCounts);
            setMessage(`Could not load dashboard counts: ${error.message || 'Unknown error'}`);
        }
    }

    function scaleStyle<T extends Record<string, any>>(style: T): any {
        const fontKeys = new Set(['fontSize', 'lineHeight']);
        const iconKeys = new Set([
            'padding',
            'paddingBottom',
            'paddingVertical',
            'paddingHorizontal',
            'marginTop',
            'marginBottom',
            'gap',
            'width',
            'height',
            'minWidth',
            'minHeight',
            'borderRadius',
        ]);

        const scaledStyle: Record<string, any> = { ...style };

        Object.entries(style).forEach(([key, value]) => {
            if (typeof value !== 'number') return;

            if (fontKeys.has(key)) {
                scaledStyle[key] = scaleFont(value);
            }

            if (iconKeys.has(key)) {
                scaledStyle[key] = scaleIcon(value);
            }
        });

        return scaledStyle;
    }

    function goTo(route: string) {
        router.push(route as any);
    }

    const summaryCards = [
        {
            title: "Today's Jobs",
            value: counts.todayJobs.toString(),
            note: 'Jobs created, dispatched, updated, or completed today.',
            route: '/jobs',
        },
        {
            title: 'Open Estimates',
            value: counts.openEstimates.toString(),
            note: 'Items currently waiting in the estimate draft.',
            route: '/estimate',
        },
        {
            title: 'Waiting Approval',
            value: counts.waitingApproval.toString(),
            note: 'Jobs marked as waiting for customer approval.',
            route: '/jobs',
        },
        {
            title: 'New Messages',
            value: counts.newMessages.toString(),
            note: 'Message alerts will connect after job notifications are added.',
            route: '/jobs',
        },
    ];

    if (checkingAccess) {
        return <StaffOnlyMessage message="Checking ManagementOS access..." />;
    }

    if (!canUseStaffTools) {
        return <StaffOnlyMessage message="ManagementOS is for managers, office staff, and technicians." />;
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), paddingBottom: scaleIcon(44), alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1100 }}>
                <HomeHeader />

                <View
                    style={[
                        scaleStyle(heroCardStyle),
                        {
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            borderWidth: 1,
                        },
                    ]}
                >
                    <Text style={[scaleStyle(kickerStyle), { color: theme.colors.primary }]}>ManagementOS</Text>
                    <Text style={[scaleStyle(titleStyle), { color: theme.colors.text }]}>
                        Run the business side of HomeOS.
                    </Text>
                    <Text style={[scaleStyle(subtitleStyle), { color: theme.colors.mutedText }]}>
                        This is the starting dashboard for managers, office staff, and technicians. It connects jobs,
                        estimate drafts, approvals, field notes, invoices, and customer updates without mixing them into
                        the homeowner experience.
                    </Text>

                    <View style={scaleStyle(heroButtonRowStyle)}>
                        <TouchableOpacity
                            activeOpacity={0.82}
                            onPress={loadDashboardCounts}
                            style={[scaleStyle(primaryButtonStyle), { backgroundColor: theme.colors.primary }]}
                        >
                            <Text style={[scaleStyle(primaryButtonTextStyle), { color: theme.colors.primaryText }]}>
                                Refresh Dashboard
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            activeOpacity={0.82}
                            onPress={() => goTo('/jobs')}
                            style={[
                                scaleStyle(secondaryButtonStyle),
                                {
                                    backgroundColor: theme.colors.secondaryButton,
                                    borderColor: theme.colors.border,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    scaleStyle(secondaryButtonTextStyle),
                                    { color: theme.colors.secondaryButtonText },
                                ]}
                            >
                                Open Jobs
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            activeOpacity={0.82}
                            onPress={() => goTo('/estimate')}
                            style={[
                                scaleStyle(secondaryButtonStyle),
                                {
                                    backgroundColor: theme.colors.secondaryButton,
                                    borderColor: theme.colors.border,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    scaleStyle(secondaryButtonTextStyle),
                                    { color: theme.colors.secondaryButtonText },
                                ]}
                            >
                                Open Estimates
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {!!message && (
                    <View
                        style={[
                            scaleStyle(messageCardStyle),
                            {
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                            },
                        ]}
                    >
                        <Text style={[scaleStyle(messageTextStyle), { color: theme.colors.mutedText }]}>
                            {message}
                        </Text>
                    </View>
                )}

                <View style={scaleStyle(summaryGridStyle)}>
                    {summaryCards.map((card) => (
                        <TouchableOpacity
                            key={card.title}
                            activeOpacity={0.82}
                            onPress={() => goTo(card.route)}
                            style={[
                                scaleStyle(summaryCardStyle),
                                {
                                    backgroundColor: theme.colors.surface,
                                    borderColor: theme.colors.border,
                                },
                            ]}
                        >
                            <Text style={[scaleStyle(summaryValueStyle), { color: theme.colors.text }]}>
                                {card.value}
                            </Text>
                            <Text style={[scaleStyle(summaryTitleStyle), { color: theme.colors.text }]}>
                                {card.title}
                            </Text>
                            <Text style={[scaleStyle(summaryNoteStyle), { color: theme.colors.mutedText }]}>
                                {card.note}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <View
                    style={[
                        scaleStyle(recentActivityCardStyle),
                        {
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                        },
                    ]}
                >
                    <View style={scaleStyle(recentHeaderStyle)}>
                        <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Recent Activity</Text>

                        <TouchableOpacity
                            activeOpacity={0.82}
                            onPress={() => goTo('/jobs')}
                            style={[
                                scaleStyle(smallButtonStyle),
                                {
                                    backgroundColor: theme.colors.secondaryButton,
                                    borderColor: theme.colors.border,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    scaleStyle(smallButtonTextStyle),
                                    { color: theme.colors.secondaryButtonText },
                                ]}
                            >
                                View All
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {recentJobs.length === 0 ? (
                        <Text style={[scaleStyle(recentEmptyTextStyle), { color: theme.colors.mutedText }]}>
                            No recent jobs yet. New field work will show here.
                        </Text>
                    ) : (
                        <View style={scaleStyle(recentListStyle)}>
                            {recentJobs.map((job) => (
                                <TouchableOpacity
                                    key={job.id}
                                    activeOpacity={0.82}
                                    onPress={() => goTo('/jobs/' + job.id)}
                                    style={[
                                        scaleStyle(recentJobCardStyle),
                                        {
                                            backgroundColor: theme.colors.surfaceAlt,
                                            borderColor: theme.colors.border,
                                        },
                                    ]}
                                >
                                    <Text style={[scaleStyle(recentJobTitleStyle), { color: theme.colors.text }]}>
                                        {job.title}
                                    </Text>
                                    <Text style={[scaleStyle(recentJobMetaStyle), { color: theme.colors.mutedText }]}>
                                        {job.system || 'Unknown system'} / {job.room_or_area || 'No area'}
                                    </Text>
                                    <Text style={[scaleStyle(recentJobMetaStyle), { color: theme.colors.mutedText }]}>
                                        Status: {job.status} / Priority: {job.priority} / Updated: {formatJobDate(job.updated_at)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Manager Actions</Text>

                <View style={scaleStyle(actionGridStyle)}>
                    {actionCards.map((card) => (
                        <View
                            key={card.title}
                            style={[
                                scaleStyle(actionCardStyle),
                                {
                                    backgroundColor: theme.colors.surface,
                                    borderColor: theme.colors.border,
                                },
                            ]}
                        >
                            <Text style={[scaleStyle(actionTitleStyle), { color: theme.colors.text }]}>
                                {card.title}
                            </Text>
                            <Text style={[scaleStyle(actionDescriptionStyle), { color: theme.colors.mutedText }]}>
                                {card.description}
                            </Text>

                            <TouchableOpacity
                                activeOpacity={0.82}
                                onPress={() => goTo(card.route)}
                                style={[
                                    scaleStyle(actionButtonStyle),
                                    {
                                        backgroundColor: theme.colors.secondaryButton,
                                        borderColor: theme.colors.border,
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        scaleStyle(actionButtonTextStyle),
                                        { color: theme.colors.secondaryButtonText },
                                    ]}
                                >
                                    {card.button}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>

                <View
                    style={[
                        scaleStyle(workflowCardStyle),
                        {
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                        },
                    ]}
                >
                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>TechOS Flow</Text>
                    <Text style={[scaleStyle(workflowSubtitleStyle), { color: theme.colors.mutedText }]}>
                        This is the field workflow we will connect next. For now, it is a safe roadmap inside the app.
                    </Text>

                    <View style={scaleStyle(workflowListStyle)}>
                        {workflowSteps.map((step, index) => (
                            <View key={step} style={scaleStyle(workflowStepStyle)}>
                                <View
                                    style={[
                                        scaleStyle(stepNumberStyle),
                                        {
                                            backgroundColor: theme.colors.primary,
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            scaleStyle(stepNumberTextStyle),
                                            { color: theme.colors.primaryText },
                                        ]}
                                    >
                                        {index + 1}
                                    </Text>
                                </View>
                                <Text style={[scaleStyle(stepTextStyle), { color: theme.colors.text }]}>{step}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>
        </ScrollView>
    );
}

function StaffOnlyMessage({ message }: { message: string }) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center' }}
        >
            <View
                style={{
                    width: '100%',
                    maxWidth: 720,
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: scaleIcon(24),
                    borderWidth: 1,
                    padding: scaleIcon(24),
                }}
            >
                <HomeHeader />
                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: scaleFont(28),
                        fontWeight: '900',
                        marginBottom: scaleIcon(10),
                    }}
                >
                    ManagementOS
                </Text>
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        fontSize: scaleFont(16),
                        fontWeight: '700',
                        lineHeight: scaleFont(23),
                    }}
                >
                    {message}
                </Text>
            </View>
        </ScrollView>
    );
}

function formatJobDate(value: string | null) {
    if (!value) return 'Unknown';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return 'Unknown';

    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function isJobTouchedToday(job: Job) {
    return [
        job.dispatched_at,
        job.arrived_at,
        job.completed_at,
        job.updated_at,
        job.created_at,
    ].some((value) => isToday(value));
}

function isWaitingForApproval(job: Job) {
    const approvalValues = [
        job.status,
        job.dispatch_status,
        job.visibility_status,
    ]
        .filter(Boolean)
        .map((value) => value?.toLowerCase());

    return approvalValues.some((value) =>
        value?.includes('approval') ||
        value?.includes('approve') ||
        value?.includes('waiting_customer') ||
        value?.includes('pending_customer')
    );
}

function isToday(value: string | null) {
    if (!value) return false;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return false;

    const today = new Date();

    return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
    );
}

const heroCardStyle = {
    borderRadius: 28,
    marginBottom: 18,
    padding: 24,
};

const kickerStyle = {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: 'uppercase',
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
    marginBottom: 10,
};

const subtitleStyle = {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
};

const heroButtonRowStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
};

const primaryButtonStyle = {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
};

const primaryButtonTextStyle = {
    fontSize: 14,
    fontWeight: '900',
};

const secondaryButtonStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
};

const secondaryButtonTextStyle = {
    fontSize: 14,
    fontWeight: '900',
};

const messageCardStyle = {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
};

const messageTextStyle = {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
};

const summaryGridStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
};

const summaryCardStyle = {
    borderRadius: 22,
    borderWidth: 1,
    minWidth: 160,
    padding: 18,
    width: '48%',
};

const recentActivityCardStyle = {
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 24,
    padding: 18,
};

const recentHeaderStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
};

const recentListStyle = {
    gap: 10,
};

const recentJobCardStyle = {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
};

const recentJobTitleStyle = {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 5,
};

const recentJobMetaStyle = {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
};

const recentEmptyTextStyle = {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
};

const smallButtonStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
};

const smallButtonTextStyle = {
    fontSize: 12,
    fontWeight: '900',
};

const summaryValueStyle = {
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 4,
};

const summaryTitleStyle = {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 6,
};

const summaryNoteStyle = {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 12,
};

const actionGridStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
};

const actionCardStyle = {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    width: '48%',
};

const actionTitleStyle = {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
};

const actionDescriptionStyle = {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 14,
};

const actionButtonStyle = {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
};

const actionButtonTextStyle = {
    fontSize: 13,
    fontWeight: '900',
};

const workflowCardStyle = {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
};

const workflowSubtitleStyle = {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: 16,
};

const workflowListStyle = {
    gap: 10,
};

const workflowStepStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
};

const stepNumberStyle = {
    alignItems: 'center',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
};

const stepNumberTextStyle = {
    fontSize: 13,
    fontWeight: '900',
};

const stepTextStyle = {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
};
