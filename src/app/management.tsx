import { router } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import { useTheme } from '../theme/useTheme';

const summaryCards = [
    {
        title: "Today's Jobs",
        value: '0',
        note: 'Field jobs scheduled for today.',
        route: '/jobs',
    },
    {
        title: 'Open Estimates',
        value: '0',
        note: 'Drafts, proposals, and options waiting to be sent.',
        route: '/estimate',
    },
    {
        title: 'Waiting Approval',
        value: '0',
        note: 'Customer approvals, change orders, and job decisions.',
        route: '/jobs',
    },
    {
        title: 'New Messages',
        value: '0',
        note: 'Customer, technician, and office updates.',
        route: '/jobs',
    },
];

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

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), paddingBottom: scaleIcon(44), alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1100 }}>
                <HomeHeader />

                <View style={scaleStyle(heroCardStyle)}>
                    <Text style={[scaleStyle(kickerStyle), { color: theme.colors.primary }]}>ManagementOS</Text>
                    <Text style={[scaleStyle(titleStyle), { color: theme.colors.text }]}>
                        Run the business side of HomeOS.
                    </Text>
                    <Text style={[scaleStyle(subtitleStyle), { color: theme.colors.mutedText }]}>
                        This is the starting dashboard for managers, office staff, and technicians. It will connect jobs,
                        estimates, approvals, field notes, invoices, and customer updates without mixing them into the
                        homeowner experience.
                    </Text>

                    <View style={scaleStyle(heroButtonRowStyle)}>
                        <TouchableOpacity
                            activeOpacity={0.82}
                            onPress={() => goTo('/jobs')}
                            style={[scaleStyle(primaryButtonStyle), { backgroundColor: theme.colors.primary }]}
                        >
                            <Text style={[scaleStyle(primaryButtonTextStyle), { color: theme.colors.primaryText }]}>
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
