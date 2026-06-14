import HomeHeader from '../../components/HomeHeader';

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
    Job,
    JobThreadEvent,
    addJobNote,
    changeJobStatus,
    loadJob,
    loadJobThreadEvents,
} from '../../lib/jobs';
import { isStaffRole, loadCurrentUserRole } from '../../lib/roles';

const statuses = ['open', 'in_progress', 'waiting_on_customer', 'completed'];

export default function JobThreadScreen() {
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

    if (checkingAccess) {
        return <StaffOnlyMessage message="Checking access..." />;
    }

    if (!canUseStaffTools) {
        return <StaffOnlyMessage message="This area is for technicians and office staff." />;
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <HomeHeader />

                <View style={headerRowStyle}>
                    <View>
                        <Text style={titleStyle}>{job?.title || 'Job Thread'}</Text>
                        <Text style={subtitleStyle}>
                            {job?.system || 'Unknown system'} / {job?.room_or_area || 'No area'}
                        </Text>
                    </View>

                    <TouchableOpacity onPress={refreshThread} style={secondaryButtonStyle}>
                        <Text style={secondaryButtonTextStyle}>Refresh</Text>
                    </TouchableOpacity>
                </View>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                {job && (
                    <>
                        <View style={panelStyle}>
                            <Text style={sectionTitleStyle}>Status</Text>
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

                        <View style={panelStyle}>
                            <Text style={sectionTitleStyle}>Add Note</Text>
                            <TextInput
                                placeholder="Add a job update..."
                                value={note}
                                onChangeText={setNote}
                                style={[inputStyle, { minHeight: 100 }]}
                                multiline
                            />

                            <TouchableOpacity
                                onPress={handleAddNote}
                                disabled={saving}
                                style={primaryButtonStyle}
                            >
                                <Text style={primaryButtonTextStyle}>
                                    {saving ? 'Saving...' : 'Add Note'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={sectionTitleStyle}>Timeline</Text>

                        <View style={timelineStyle}>
                            {events.map((event) => (
                                <View key={event.id} style={eventCardStyle}>
                                    <Text style={eventTypeStyle}>
                                        {event.event_type.replace(/_/g, ' ')}
                                    </Text>
                                    <Text style={eventMessageStyle}>
                                        {event.message || 'No message'}
                                    </Text>
                                    <Text style={eventMetaStyle}>
                                        {event.created_by_name || 'Unknown'} / {new Date(event.created_at).toLocaleString()}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        {events.length === 0 && (
                            <View style={messageBoxStyle}>
                                <Text style={messageTextStyle}>No timeline events yet.</Text>
                            </View>
                        )}
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function StaffOnlyMessage({ message }: { message: string }) {
    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 700 }}>
                <HomeHeader />

                <View style={messageBoxStyle}>
                    <Text style={sectionTitleStyle}>{message}</Text>

                    <TouchableOpacity
                        onPress={() => router.replace('/' as any)}
                        style={primaryButtonStyle}
                    >
                        <Text style={primaryButtonTextStyle}>Back Home</Text>
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
    return (
        <View style={optionRowStyle}>
            {options.map((option) => (
                <TouchableOpacity
                    key={option}
                    onPress={() => onChange(option)}
                    disabled={disabled}
                    style={[
                        optionButtonStyle,
                        value === option && optionButtonSelectedStyle,
                    ]}
                >
                    <Text
                        style={[
                            optionButtonTextStyle,
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
