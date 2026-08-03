import { useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import ServiceRequestThread from '../../components/serviceRequests/ServiceRequestThread';
import ThemedCard from '../../components/theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';

export type TechOSMessageThreadJob = {
    slot: {
        id: string;
        company_id: string;
        service_request_id: string | null;
        status: string | null;
    };
    request: {
        id: string;
        display_code: string | null;
        issue_summary: string | null;
        status: string | null;
    } | null;
    property: {
        name: string | null;
        address: string | null;
    } | null;
};

export default function TechOSMessageThreadsPanel({
    jobs,
}: {
    jobs: TechOSMessageThreadJob[];
}) {
    const { theme } = useTheme();
    const threads = useMemo(() => {
        const bySlotId = new Map<string, TechOSMessageThreadJob>();

        jobs.forEach((job) => {
            if (job.slot.id && job.slot.company_id && job.request?.id) {
                bySlotId.set(job.slot.id, job);
            }
        });

        return Array.from(bySlotId.values());
    }, [jobs]);
    const [selectedSlotId, setSelectedSlotId] = useState('');
    const selectedThread = threads.find((job) => job.slot.id === selectedSlotId) || threads[0] || null;

    useEffect(() => {
        if (!selectedSlotId || !threads.some((job) => job.slot.id === selectedSlotId)) {
            setSelectedSlotId(threads[0]?.slot.id || '');
        }
    }, [selectedSlotId, threads]);

    return (
        <View style={styles.root}>
            <ThemedCard style={styles.introCard}>
                <Text style={[styles.title, { color: theme.colors.text }]}>Messages</Text>
                <Text style={[styles.subtitle, { color: theme.colors.mutedText }]}>Message the office or Dispatch from the specific job you are working on. The conversation stays with that job.</Text>
            </ThemedCard>

            {threads.length === 0 ? (
                <ThemedCard>
                    <Text style={[styles.empty, { color: theme.colors.mutedText }]}>Messages will appear here when a job is assigned to you.</Text>
                </ThemedCard>
            ) : (
                <>
                    <View style={styles.threadPicker}>
                        {threads.map((job) => {
                            const selected = selectedThread?.slot.id === job.slot.id;

                            return (
                                <TouchableOpacity
                                    key={job.slot.id}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Open messages for ${getJobTitle(job)}`}
                                    onPress={() => setSelectedSlotId(job.slot.id)}
                                    style={[
                                        styles.threadChoice,
                                        {
                                            backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                                        },
                                    ]}
                                >
                                    <Text numberOfLines={1} style={[styles.threadTitle, { color: selected ? theme.colors.primaryText : theme.colors.text }]}>
                                        {getJobTitle(job)}
                                    </Text>
                                    <Text numberOfLines={2} style={[styles.threadMeta, { color: selected ? theme.colors.primaryText : theme.colors.mutedText }]}>
                                        {job.request?.issue_summary || 'Service request'}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {!!selectedThread?.request && (
                        <ServiceRequestThread
                            companyId={selectedThread.slot.company_id}
                            serviceRequestId={selectedThread.request.id}
                            scheduleSlotId={selectedThread.slot.id}
                            viewer="technician"
                            title={`Job messages · ${getJobTitle(selectedThread)}`}
                        />
                    )}
                </>
            )}
        </View>
    );
}

function getJobTitle(job: TechOSMessageThreadJob) {
    const displayCode = String(job.request?.display_code || '').trim();
    const propertyName = String(job.property?.name || job.property?.address || '').trim();

    return [displayCode, propertyName].filter(Boolean).join(' · ') || 'Assigned job';
}

const styles = {
    root: { gap: 12 },
    introCard: { gap: 6 },
    title: { fontSize: 22, fontWeight: '900' as const },
    subtitle: { fontSize: 14, lineHeight: 20 },
    empty: { fontSize: 14, lineHeight: 20 },
    threadPicker: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 9 },
    threadChoice: { borderRadius: 15, borderWidth: 1, flexBasis: 220, flexGrow: 1, minHeight: 80, padding: 12 },
    threadTitle: { fontSize: 14, fontWeight: '900' as const },
    threadMeta: { fontSize: 12, lineHeight: 17, marginTop: 5 },
};
