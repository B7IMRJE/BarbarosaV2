import HomeHeader from '../../components/HomeHeader';

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Job, createJob, loadJobs } from '../../lib/jobs';
import { isStaffRole, loadCurrentUserRole } from '../../lib/roles';
import { useTheme } from '../../theme/useTheme';

const systems = ['Plumbing', 'HVAC', 'Electrical', 'Gas', 'Water Quality', 'Safety', 'Appliances', 'Exterior'];
const priorities = ['normal', 'urgent', 'emergency'];

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

export default function JobsIndexScreen() {
    const { scaleFont, scaleIcon } = useTheme();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [title, setTitle] = useState('');
    const [system, setSystem] = useState('Plumbing');
    const [priority, setPriority] = useState('normal');
    const [roomOrArea, setRoomOrArea] = useState('');
    const [message, setMessage] = useState('Loading jobs...');
    const [creating, setCreating] = useState(false);
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [canUseStaffTools, setCanUseStaffTools] = useState(false);

    useEffect(() => {
        checkAccess();
    }, []);

    async function checkAccess() {
        const role = await loadCurrentUserRole();
        const canAccess = isStaffRole(role);

        setCanUseStaffTools(canAccess);
        setCheckingAccess(false);

        if (canAccess) {
            await refreshJobs();
        } else {
            setMessage('');
        }
    }

    async function refreshJobs() {
        try {
            setMessage('Loading jobs...');
            const loadedJobs = await loadJobs();

            setJobs(loadedJobs);
            setMessage('');
        } catch (error: any) {
            setMessage(`Could not load jobs: ${error.message || 'Unknown error'}`);
        }
    }

    async function handleCreateJob() {
        if (!title.trim()) {
            setMessage('Enter a job title.');
            return;
        }

        try {
            setCreating(true);
            setMessage('Creating job...');

            const job = await createJob({
                title,
                system,
                priority,
                room_or_area: roomOrArea,
            });

            setTitle('');
            setRoomOrArea('');
            await refreshJobs();
            router.push(`/jobs/${job.id}` as any);
        } catch (error: any) {
            setMessage(`Could not create job: ${error.message || 'Unknown error'}`);
        } finally {
            setCreating(false);
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
                        <Text style={scaleJobStyle(titleStyle, scaleFont, scaleIcon)}>Jobs</Text>
                        <Text style={scaleJobStyle(subtitleStyle, scaleFont, scaleIcon)}>
                            Active work logs for home systems, rooms, and items.
                        </Text>
                    </View>

                    <TouchableOpacity onPress={refreshJobs} style={scaleJobStyle(secondaryButtonStyle, scaleFont, scaleIcon)}>
                        <Text style={scaleJobStyle(secondaryButtonTextStyle, scaleFont, scaleIcon)}>Refresh</Text>
                    </TouchableOpacity>
                </View>

                <View style={scaleJobStyle(createCardStyle, scaleFont, scaleIcon)}>
                    <Text style={scaleJobStyle(sectionTitleStyle, scaleFont, scaleIcon)}>Create Job</Text>

                    <TextInput
                        placeholder="Job title"
                        value={title}
                        onChangeText={setTitle}
                        style={scaleJobStyle(inputStyle, scaleFont, scaleIcon)}
                    />

                    <TextInput
                        placeholder="Room or area"
                        value={roomOrArea}
                        onChangeText={setRoomOrArea}
                        style={scaleJobStyle(inputStyle, scaleFont, scaleIcon)}
                    />

                    <Text style={scaleJobStyle(labelStyle, scaleFont, scaleIcon)}>System</Text>
                    <OptionRow options={systems} value={system} onChange={setSystem} />

                    <Text style={scaleJobStyle(labelStyle, scaleFont, scaleIcon)}>Priority</Text>
                    <OptionRow options={priorities} value={priority} onChange={setPriority} />

                    <TouchableOpacity
                        onPress={handleCreateJob}
                        disabled={creating}
                        style={scaleJobStyle(primaryButtonStyle, scaleFont, scaleIcon)}
                    >
                        <Text style={scaleJobStyle(primaryButtonTextStyle, scaleFont, scaleIcon)}>
                            {creating ? 'Creating...' : 'Create Job'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {!!message && (
                    <View style={scaleJobStyle(messageBoxStyle, scaleFont, scaleIcon)}>
                        <Text style={scaleJobStyle(messageTextStyle, scaleFont, scaleIcon)}>{message}</Text>
                    </View>
                )}

                <Text style={scaleJobStyle(sectionTitleStyle, scaleFont, scaleIcon)}>Active Jobs</Text>

                <View style={scaleJobStyle(listStyle, scaleFont, scaleIcon)}>
                    {jobs.map((job) => (
                        <TouchableOpacity
                            key={job.id}
                            onPress={() => router.push(`/jobs/${job.id}` as any)}
                            style={scaleJobStyle(jobCardStyle, scaleFont, scaleIcon)}
                        >
                            <Text style={scaleJobStyle(jobTitleStyle, scaleFont, scaleIcon)}>{job.title}</Text>
                            <Text style={scaleJobStyle(jobMetaStyle, scaleFont, scaleIcon)}>
                                {job.system || 'Unknown system'} / {job.room_or_area || 'No area'}
                            </Text>
                            <Text style={scaleJobStyle(jobMetaStyle, scaleFont, scaleIcon)}>
                                Status: {job.status} / Priority: {job.priority}
                            </Text>
                            <Text style={scaleJobStyle(openTextStyle, scaleFont, scaleIcon)}>Open Job Thread</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {jobs.length === 0 && !message && (
                    <View style={scaleJobStyle(messageBoxStyle, scaleFont, scaleIcon)}>
                        <Text style={scaleJobStyle(messageTextStyle, scaleFont, scaleIcon)}>No jobs yet. Create one above.</Text>
                    </View>
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
}: {
    options: string[];
    value: string;
    onChange: (value: string) => void;
}) {
    const { scaleFont, scaleIcon } = useTheme();

    return (
        <View style={scaleJobStyle(optionRowStyle, scaleFont, scaleIcon)}>
            {options.map((option) => (
                <TouchableOpacity
                    key={option}
                    onPress={() => onChange(option)}
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
                        {option}
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

const createCardStyle = {
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

const labelStyle = {
    color: '#637083',
    fontWeight: '900' as const,
    marginBottom: 8,
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
    marginBottom: 12,
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
};

const optionButtonSelectedTextStyle = {
    color: '#FFFFFF',
};

const primaryButtonStyle = {
    backgroundColor: '#071B33',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center' as const,
    marginTop: 6,
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

const listStyle = {
    gap: 12,
};

const jobCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const jobTitleStyle = {
    color: '#071B33',
    fontSize: 18,
    fontWeight: '900' as const,
};

const jobMetaStyle = {
    color: '#637083',
    fontSize: 14,
    marginTop: 6,
};

const openTextStyle = {
    color: '#0B5FFF',
    marginTop: 12,
    fontWeight: '900' as const,
};
