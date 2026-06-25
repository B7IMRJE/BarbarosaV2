import HomeHeader from '../../components/HomeHeader';

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
    Job,
    JobThreadEvent,
    addJobThreadEvent,
    addJobNote,
    changeJobStatus,
    loadJob,
    loadJobThreadEvents,
} from '../../lib/jobs';
import { isStaffRole, loadCurrentUserRole } from '../../lib/roles';
import { useTheme } from '../../theme/useTheme';

const statuses = ['open', 'in_progress', 'waiting_on_customer', 'completed'];

const techWorkflowSteps = [
    {
        title: 'Arrival',
        description: 'Confirm the technician is on site and ready to begin.',
    },
    {
        title: 'Assessment',
        description: 'Inspect the issue, verify the system, and document findings.',
    },
    {
        title: 'Photos / Notes',
        description: 'Capture job photos, customer concerns, and field notes.',
    },
    {
        title: 'Estimate Options',
        description: 'Prepare repair, replacement, or good-better-best options.',
    },
    {
        title: 'Approval',
        description: 'Send proposal options and wait for customer approval.',
    },
    {
        title: 'Completion',
        description: 'Finish work, record final notes, and close the job.',
    },
    {
        title: 'Invoice / Review',
        description: 'Send final invoice, receipt, and review request.',
    },
];

function scaleJobStyle<T extends Record<string, any>>(
    style: T,
    scaleFont: (value: number) => number,
    scaleIcon: (value: number) => number
): T {
    const scaledStyle: Record<string, any> = { ...style };

    Object.entries(style).forEach(([key, value]) => {
        if (typeof value !== 'number') return;

        if (key === 'fontSize' || key === 'lineHeight') {
            scaledStyle[key] = scaleFont(value);
        }

        if (
            key === 'padding' ||
            key === 'paddingBottom' ||
            key === 'paddingVertical' ||
            key === 'paddingHorizontal' ||
            key === 'marginTop' ||
            key === 'marginBottom' ||
            key === 'gap' ||
            key === 'minWidth' ||
            key === 'minHeight' ||
            key === 'width' ||
            key === 'height' ||
            key === 'borderRadius'
        ) {
            scaledStyle[key] = scaleIcon(value);
        }
    });

    return scaledStyle as T;
}

export default function JobThreadScreen() {
    const { scaleFont, scaleIcon } = useTheme();
    const { id } = useLocalSearchParams();
    const jobId = String(id || '');
    const [job, setJob] = useState<Job | null>(null);
    const [events, setEvents] = useState<JobThreadEvent[]>([]);
    const [note, setNote] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('open');
    const [message, setMessage] = useState('Loading job thread...');
    const [saving, setSaving] = useState(false);
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [canUseStaffTools, setCanUseStaffTools] = useState(false);

    useEffect(() => {
        checkAccess();
    }, [jobId]);

    async function checkAccess() {
        const role = await loadCurrentUserRole();
        const canAccess = isStaffRole(role);

        setCanUseStaffTools(canAccess);
        setCheckingAccess(false);

        if (canAccess) {
            await refreshThread();
        } else {
            setMessage('');
        }
    }

    async function refreshThread() {
        if (!jobId) {
            setMessage('Missing job id.');
            return;
        }

        try {
            setMessage('Loading job thread...');
            const loadedJob = await loadJob(jobId);

            if (!loadedJob) {
                setJob(null);
                setEvents([]);
                setMessage('Job not found.');
                return;
            }

            const loadedEvents = await loadJobThreadEvents(jobId);

            setJob(loadedJob);
            setSelectedStatus(loadedJob.status || 'open');
            setEvents(loadedEvents);
            setMessage('');
        } catch (error: any) {
            setMessage(`Could not load job thread: ${error.message || 'Unknown error'}`);
        }
    }

    async function handleAddNote() {
        if (!note.trim()) {
            setMessage('Enter a note.');
            return;
        }

        try {
            setSaving(true);
            setMessage('Adding note...');
            await addJobNote(jobId, note);
            setNote('');
            await refreshThread();
        } catch (error: any) {
            setMessage(`Could not add note: ${error.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    async function handleChangeStatus(nextStatus: string) {
        try {
            setSaving(true);
            setMessage('Changing status...');
            await changeJobStatus(jobId, nextStatus);
            await refreshThread();
        } catch (error: any) {
            setMessage(`Could not change status: ${error.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    }

    async function handleWorkflowStep(stepTitle: string) {
        if (!jobId) {
            setMessage('Missing job id.');
            return;
        }

        try {
            setSaving(true);
            setMessage('Logging ' + stepTitle + '...');

            await addJobThreadEvent({
                jobId,
                eventType: 'tech_workflow_step',
                message: 'TechOS step logged: ' + stepTitle + '.',
            });

            await refreshThread();
        } catch (error: any) {
            setMessage('Could not log workflow step: ' + (error.message || 'Unknown error'));
        } finally {
            setSaving(false);
        }
    }

    if (checkingAccess) {
        return <StaffOnlyMessage message="Checking access..." />;
    }

    if (!canUseStaffTools) {
        return <StaffOnlyMessage message="This area is for the HomeOS service team." />;
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <HomeHeader />

                <View style={scaleJobStyle(headerRowStyle, scaleFont, scaleIcon)}>
                    <View>
                        <Text style={scaleJobStyle(titleStyle, scaleFont, scaleIcon)}>{job?.title || 'Job Thread'}</Text>
                        <Text style={scaleJobStyle(subtitleStyle, scaleFont, scaleIcon)}>
                            {job?.system || 'Unknown system'} / {job?.room_or_area || 'No area'}
                        </Text>
                    </View>

                    <TouchableOpacity onPress={refreshThread} style={scaleJobStyle(secondaryButtonStyle, scaleFont, scaleIcon)}>
                        <Text style={scaleJobStyle(secondaryButtonTextStyle, scaleFont, scaleIcon)}>Refresh</Text>
                    </TouchableOpacity>
                </View>

                {!!message && (
                    <View style={scaleJobStyle(messageBoxStyle, scaleFont, scaleIcon)}>
                        <Text style={scaleJobStyle(messageTextStyle, scaleFont, scaleIcon)}>{message}</Text>
                    </View>
                )}

                {job && (
                    <>
                        <View style={scaleJobStyle(panelStyle, scaleFont, scaleIcon)}>
                            <Text style={scaleJobStyle(sectionTitleStyle, scaleFont, scaleIcon)}>Status</Text>
                            <OptionRow
                                options={statuses}
                                value={selectedStatus}
                                onChange={(value) => {
                                    setSelectedStatus(value);
                                    handleChangeStatus(value);
                                }}
                                disabled={saving}
                            />
                        </View>

                        <View style={scaleJobStyle(panelStyle, scaleFont, scaleIcon)}>
                            <Text style={scaleJobStyle(sectionTitleStyle, scaleFont, scaleIcon)}>TechOS Field Workflow</Text>
                            <Text style={scaleJobStyle(workflowIntroStyle, scaleFont, scaleIcon)}>
                                This is the technician path we will connect to job actions, photos, estimate options,
                                approvals, invoices, and review requests.
                            </Text>

                            <View style={scaleJobStyle(workflowGridStyle, scaleFont, scaleIcon)}>
                                {techWorkflowSteps.map((step, index) => (
                                    <View key={step.title} style={scaleJobStyle(workflowStepCardStyle, scaleFont, scaleIcon)}>
                                        <View style={scaleJobStyle(workflowStepHeaderStyle, scaleFont, scaleIcon)}>
                                            <View style={scaleJobStyle(workflowStepNumberStyle, scaleFont, scaleIcon)}>
                                                <Text style={scaleJobStyle(workflowStepNumberTextStyle, scaleFont, scaleIcon)}>
                                                    {index + 1}
                                                </Text>
                                            </View>
                                            <Text style={scaleJobStyle(workflowStepTitleStyle, scaleFont, scaleIcon)}>
                                                {step.title}
                                            </Text>
                                        </View>
                                        <Text style={scaleJobStyle(workflowStepDescriptionStyle, scaleFont, scaleIcon)}>
                                            {step.description}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View style={scaleJobStyle(panelStyle, scaleFont, scaleIcon)}>
                            <Text style={scaleJobStyle(sectionTitleStyle, scaleFont, scaleIcon)}>Add Note</Text>
                            <TextInput
                                placeholder="Add a job update..."
                                value={note}
                                onChangeText={setNote}
                                style={[scaleJobStyle(inputStyle, scaleFont, scaleIcon), { minHeight: scaleIcon(100) }]}
                                multiline
                            />

                            <TouchableOpacity
                                onPress={handleAddNote}
                                disabled={saving}
                                style={scaleJobStyle(primaryButtonStyle, scaleFont, scaleIcon)}
                            >
                                <Text style={scaleJobStyle(primaryButtonTextStyle, scaleFont, scaleIcon)}>
                                    {saving ? 'Saving...' : 'Add Note'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={scaleJobStyle(sectionTitleStyle, scaleFont, scaleIcon)}>Timeline</Text>

                        <View style={scaleJobStyle(timelineStyle, scaleFont, scaleIcon)}>
                            {events.map((event) => (
                                <View key={event.id} style={scaleJobStyle(eventCardStyle, scaleFont, scaleIcon)}>
                                    <Text style={scaleJobStyle(eventTypeStyle, scaleFont, scaleIcon)}>
                                        {event.event_type.replace(/_/g, ' ')}
                                    </Text>
                                    <Text style={scaleJobStyle(eventMessageStyle, scaleFont, scaleIcon)}>
                                        {event.message || 'No message'}
                                    </Text>
                                    <Text style={scaleJobStyle(eventMetaStyle, scaleFont, scaleIcon)}>
                                        {event.created_by_name || 'Unknown'} / {new Date(event.created_at).toLocaleString()}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        {events.length === 0 && (
                            <View style={scaleJobStyle(messageBoxStyle, scaleFont, scaleIcon)}>
                                <Text style={scaleJobStyle(messageTextStyle, scaleFont, scaleIcon)}>No timeline events yet.</Text>
                            </View>
                        )}
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function StaffOnlyMessage({ message }: { message: string }) {
    const { scaleFont, scaleIcon } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 700 }}>
                <HomeHeader />

                <View style={scaleJobStyle(messageBoxStyle, scaleFont, scaleIcon)}>
                    <Text style={scaleJobStyle(sectionTitleStyle, scaleFont, scaleIcon)}>{message}</Text>

                    <TouchableOpacity
                        onPress={() => router.replace('/' as any)}
                        style={scaleJobStyle(primaryButtonStyle, scaleFont, scaleIcon)}
                    >
                        <Text style={scaleJobStyle(primaryButtonTextStyle, scaleFont, scaleIcon)}>Back Home</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}

function OptionRow({
    options,
    value,
    onChange,
    disabled,
}: {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}) {
    const { scaleFont, scaleIcon } = useTheme();

    return (
        <View style={scaleJobStyle(optionRowStyle, scaleFont, scaleIcon)}>
            {options.map((option) => (
                <TouchableOpacity
                    key={option}
                    onPress={() => onChange(option)}
                    disabled={disabled}
                    style={[
                        scaleJobStyle(optionButtonStyle, scaleFont, scaleIcon),
                        value === option && optionButtonSelectedStyle,
                    ]}
                >
                    <Text
                        style={[
                            scaleJobStyle(optionButtonTextStyle, scaleFont, scaleIcon),
                            value === option && optionButtonSelectedTextStyle,
                        ]}
                    >
                        {option.replace(/_/g, ' ')}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const workflowIntroStyle = {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700' as const,
    lineHeight: 21,
    marginBottom: 14,
};

const workflowGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const workflowStepCardStyle = {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    width: '48%' as const,
};

const workflowStepHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
    marginBottom: 8,
};

const workflowStepNumberStyle = {
    alignItems: 'center' as const,
    backgroundColor: '#111827',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center' as const,
    width: 28,
};

const workflowStepNumberTextStyle = {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900' as const,
};

const workflowStepTitleStyle = {
    color: '#111827',
    flex: 1,
    fontSize: 15,
    fontWeight: '900' as const,
};

const workflowStepDescriptionStyle = {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700' as const,
    lineHeight: 18,
};

const workflowStepButtonStyle = {
    alignSelf: 'flex-start' as const,
    backgroundColor: '#E5E7EB',
    borderColor: '#CBD5E1',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
};

const workflowStepButtonTextStyle = {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900' as const,
};

const headerRowStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: 16,
    marginBottom: 24,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    color: '#071B33',
};

const subtitleStyle = {
    color: '#637083',
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
};

const panelStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    marginBottom: 16,
};

const sectionTitleStyle = {
    fontSize: 20,
    fontWeight: '900' as const,
    color: '#071B33',
    marginBottom: 12,
};

const inputStyle = {
    backgroundColor: '#F3F6FA',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const optionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 4,
};

const optionButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const optionButtonSelectedStyle = {
    backgroundColor: '#071B33',
    borderColor: '#071B33',
};

const optionButtonTextStyle = {
    color: '#637083',
    fontWeight: '900' as const,
    textTransform: 'capitalize' as const,
};

const optionButtonSelectedTextStyle = {
    color: '#FFFFFF',
};

const primaryButtonStyle = {
    backgroundColor: '#071B33',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center' as const,
};

const primaryButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};

const secondaryButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const secondaryButtonTextStyle = {
    color: '#071B33',
    fontSize: 15,
    fontWeight: '900' as const,
};

const messageBoxStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    marginBottom: 14,
};

const messageTextStyle = {
    color: '#637083',
    fontSize: 14,
};

const timelineStyle = {
    gap: 12,
};

const eventCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const eventTypeStyle = {
    color: '#071B33',
    fontSize: 16,
    fontWeight: '900' as const,
    textTransform: 'capitalize' as const,
};

const eventMessageStyle = {
    color: '#071B33',
    fontSize: 16,
    lineHeight: 22,
    marginTop: 8,
};

const eventMetaStyle = {
    color: '#637083',
    fontSize: 13,
    marginTop: 10,
};
