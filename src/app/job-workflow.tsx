import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BUILD_DISPLAY } from '../lib/appVersion';
import { formatMoney } from '../lib/estimateOptions';
import {
    acceptJobWorkflowQuote,
    advanceJobWorkflow,
    loadOrCreateJobWorkflow,
    uploadJobWorkflowPhoto,
    type JobWorkflowAttachment,
    type JobWorkflowBundle,
} from '../lib/jobWorkflow';

export default function JobWorkflowScreen() {
    const { estimateSessionId } = useLocalSearchParams<{ estimateSessionId?: string | string[] }>();
    const sessionId = Array.isArray(estimateSessionId) ? estimateSessionId[0] : estimateSessionId;
    const [bundle, setBundle] = useState<JobWorkflowBundle | null>(null);
    const [message, setMessage] = useState('Opening customer approval...');
    const [busy, setBusy] = useState(false);
    const [selectedChoiceIds, setSelectedChoiceIds] = useState<string[]>([]);
    const [homeownerName, setHomeownerName] = useState('');
    const [signature, setSignature] = useState('');
    const [cancellationName, setCancellationName] = useState('');
    const [cancellationSignature, setCancellationSignature] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [storeName, setStoreName] = useState('');
    const [storeAddress, setStoreAddress] = useState('');
    const [conditionUnchanged, setConditionUnchanged] = useState(false);
    const [issueSummary, setIssueSummary] = useState('');
    const [resolutionSummary, setResolutionSummary] = useState('');
    const [completionName, setCompletionName] = useState('');
    const [completionSignature, setCompletionSignature] = useState('');

    useEffect(() => {
        if (!sessionId) {
            setMessage('This quote does not have a saved estimate session.');
            return;
        }
        void refresh(sessionId);
    }, [sessionId]);

    const attachmentCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const attachment of bundle?.attachments || []) {
            counts[attachment.stage] = (counts[attachment.stage] || 0) + 1;
        }
        return counts;
    }, [bundle?.attachments]);

    async function refresh(id = sessionId) {
        if (!id) return;
        try {
            const next = await loadOrCreateJobWorkflow(id);
            setBundle(next);
            setSelectedChoiceIds(
                next.workflow.selected_source_choice_ids?.length
                    ? next.workflow.selected_source_choice_ids
                    : next.workflow.selected_source_choice_id
                        ? [next.workflow.selected_source_choice_id]
                        : []
            );
            setHomeownerName(next.workflow.homeowner_name || '');
            setCompletionName(next.workflow.completion_homeowner_name || '');
            setMessage('');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    async function run(action: string, payload: Record<string, unknown> = {}) {
        if (!bundle || busy) return;
        setBusy(true);
        setMessage('Saving...');
        try {
            await advanceJobWorkflow(bundle.workflow.id, action, payload);
            await refresh();
            setMessage(actionMessage(action));
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function acceptSelectedWork() {
        if (!bundle || busy) return;
        setBusy(true);
        setMessage('Saving signed approval...');
        try {
            await acceptJobWorkflowQuote({
                workflowId: bundle.workflow.id,
                selectedChoiceIds,
                cancellationName,
                cancellationSignature,
                homeownerName,
                homeownerSignature: signature,
            });
            await refresh();
            setMessage('Selected work approved and job sold.');
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function addPhoto(stage: JobWorkflowAttachment['stage']) {
        if (!bundle || busy) return;
        setBusy(true);
        try {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            const result = permission.granted
                ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
                : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
            if (!result.canceled && result.assets[0]) {
                await uploadJobWorkflowPhoto({ workflow: bundle.workflow, stage, asset: result.assets[0] });
                await refresh();
                setMessage('Photo saved to the job.');
            }
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    if (!bundle) {
        return <View style={screenStyle}><Text style={messageStyle}>{message}</Text></View>;
    }

    const { workflow, contract_rule: rule, options } = bundle;
    const status = workflow.status;
    const selectedTotal = options
        .filter((option) => selectedChoiceIds.includes(option.id))
        .reduce((total, option) => total + option.pricingResult.totalAmount, 0);
    const cancellationNoticeSigned = !!cancellationName.trim() && !!cancellationSignature.trim();
    const workApprovalReady = selectedChoiceIds.length > 0
        && cancellationNoticeSigned
        && !!homeownerName.trim()
        && !!signature.trim();

    function toggleChoice(choiceId: string) {
        setSelectedChoiceIds((current) => current.includes(choiceId)
            ? current.filter((id) => id !== choiceId)
            : [...current, choiceId]
        );
    }

    return (
        <ScrollView style={screenStyle} contentContainerStyle={contentStyle}>
            <View style={headerStyle}>
                <View style={{ flex: 1 }}>
                    <Text style={eyebrowStyle}>Homeowner approval & job workflow</Text>
                    <Text style={titleStyle}>From quote to completion</Text>
                    <Text style={versionStyle}>{BUILD_DISPLAY}</Text>
                </View>
                <TouchableOpacity style={secondaryButtonStyle} onPress={() => router.back()}>
                    <Text style={secondaryButtonTextStyle}>Back</Text>
                </TouchableOpacity>
            </View>

            {!!message && <View style={noticeStyle}><Text style={noticeTextStyle}>{message}</Text></View>}
            <View style={statusStyle}>
                <Text style={statusLabelStyle}>Current step</Text>
                <Text style={statusValueStyle}>{status.replace(/_/g, ' ')}</Text>
            </View>

            {status === 'presenting' && (
                <Section title="1. Homeowner selects the work" subtitle="Select one or more technician-approved options.">
                    <View style={optionGridStyle}>
                        {options.map((option) => (
                            <TouchableOpacity
                                key={option.id}
                                onPress={() => toggleChoice(option.id)}
                                style={selectedChoiceIds.includes(option.id) ? [optionStyle, optionSelectedStyle] : optionStyle}
                            >
                                <Text style={optionTitleStyle}>{option.title}</Text>
                                <Text style={optionPriceStyle}>{formatMoney(option.pricingResult.totalAmount)}</Text>
                                <Text style={bodyStyle}>{option.homeownerExplanation}</Text>
                                <Text style={selectLabelStyle}>
                                    {selectedChoiceIds.includes(option.id) ? 'Selected ✓' : 'Select this option'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={totalStyle}>
                        <Text style={statusLabelStyle}>{selectedChoiceIds.length} option(s) selected</Text>
                        <Text style={totalAmountStyle}>{formatMoney(selectedTotal)}</Text>
                    </View>
                    <Text style={legalTitleStyle}>2. Sign the cancellation-right notice</Text>
                    <Text style={optionTitleStyle}>{rule.cancellation_notice_title}</Text>
                    <Text style={bodyStyle}>{rule.cancellation_notice_text}</Text>
                    <Text style={mutedStyle}>
                        Company rule: {rule.cancellation_days} day(s) · {rule.jurisdiction_label}
                    </Text>
                    <Text style={bodyStyle}>By signing below, I confirm that I received and reviewed this cancellation-right notice.</Text>
                    <Field label="Name receiving cancellation notice" value={cancellationName} onChangeText={setCancellationName} />
                    <Field label="Cancellation-notice signature (type full legal name)" value={cancellationSignature} onChangeText={setCancellationSignature} />
                    <Text style={legalTitleStyle}>3. Approve the selected work</Text>
                    {!cancellationNoticeSigned && (
                        <Text style={mutedStyle}>Sign the cancellation-right notice above to unlock work approval.</Text>
                    )}
                    <Field label="Homeowner full name" value={homeownerName} onChangeText={setHomeownerName} disabled={!cancellationNoticeSigned} />
                    <Field label="Work-approval signature (type full legal name)" value={signature} onChangeText={setSignature} disabled={!cancellationNoticeSigned} />
                    <PrimaryButton
                        title={busy ? 'Saving acceptance...' : 'Approve Selected Work'}
                        disabled={busy || !workApprovalReady}
                        onPress={acceptSelectedWork}
                    />
                </Section>
            )}

            {status === 'sold' && (
                <Section title="2. When will the work happen?" subtitle="This decision updates the company workflow.">
                    <PrimaryButton title="Perform Work Now" disabled={busy} onPress={() => run('choose_now')} />
                    <Field
                        label="Return date and time (example: 2026-07-28T09:00:00-07:00)"
                        value={scheduleDate}
                        onChangeText={setScheduleDate}
                    />
                    <SecondaryButton
                        title="Schedule for Another Day"
                        disabled={busy}
                        onPress={() => run('choose_later', { scheduled_for: scheduleDate })}
                    />
                </Section>
            )}

            {status === 'scheduled_later' && (
                <Section title="Scheduled return visit" subtitle={`Scheduled: ${formatDate(workflow.scheduled_for)}`}>
                    <PrimaryButton title="Begin Return Visit" disabled={busy} onPress={() => run('begin_return_visit')} />
                </Section>
            )}

            {status === 'prework' && (
                <Section title="3. Document the work area" subtitle="A before photo and condition confirmation are required.">
                    <PhotoButton label="Take Before Photo" count={attachmentCounts.before} onPress={() => addPhoto('before')} />
                    <TouchableOpacity style={checkRowStyle} onPress={() => setConditionUnchanged((value) => !value)}>
                        <Text style={checkStyle}>{conditionUnchanged ? '☑' : '☐'}</Text>
                        <Text style={bodyStyle}>The area matches the condition shown and is ready for work.</Text>
                    </TouchableOpacity>
                    <PrimaryButton
                        title="Start Work"
                        disabled={busy}
                        onPress={() => run('confirm_prework', { condition_unchanged: conditionUnchanged })}
                    />
                    <SecondaryButton title="Need to Go to a Store" disabled={busy} onPress={() => run('start_store_trip', {
                        store_name: storeName, store_address: storeAddress,
                    })} />
                    <Field label="Store name (complete before tapping store trip)" value={storeName} onChangeText={setStoreName} />
                    <Field label="Store address (optional)" value={storeAddress} onChangeText={setStoreAddress} />
                </Section>
            )}

            {status === 'store_trip' && (
                <Section title="4. Store purchase" subtitle={`${workflow.store_name || 'Store'} · Company-only purchase records`}>
                    <PhotoButton label="Photograph Receipt" count={attachmentCounts.receipt} onPress={() => addPhoto('receipt')} />
                    <PhotoButton label="Photograph Purchased Items" count={attachmentCounts.purchased_item} onPress={() => addPhoto('purchased_item')} />
                    <PrimaryButton title="Purchase Complete — On My Way Back" disabled={busy} onPress={() => run('complete_purchase')} />
                </Section>
            )}

            {status === 'returning_to_job' && (
                <Section title="Returning to job site" subtitle="Dispatch and the homeowner can see the return status.">
                    <PrimaryButton title="Arrived — Resume Work" disabled={busy} onPress={() => run('arrive_from_store')} />
                </Section>
            )}

            {status === 'work_in_progress' && (
                <Section title="5. Work in progress" subtitle="Report a problem or complete the work with after photos.">
                    <Field label="Issue found" value={issueSummary} onChangeText={setIssueSummary} multiline />
                    <SecondaryButton title="Pause — Issue Found" disabled={busy} onPress={() => run('report_issue', { issue_summary: issueSummary })} />
                    <PhotoButton label="Take Completed-Work Photo" count={attachmentCounts.after} onPress={() => addPhoto('after')} />
                    <PrimaryButton title="Technician Work Complete" disabled={busy} onPress={() => run('complete_work')} />
                    <Field label="Store name (if another trip is needed)" value={storeName} onChangeText={setStoreName} />
                    <Field label="Store address (optional)" value={storeAddress} onChangeText={setStoreAddress} />
                    <SecondaryButton title="Go to Store" disabled={busy} onPress={() => run('start_store_trip', {
                        store_name: storeName, store_address: storeAddress,
                    })} />
                </Section>
            )}

            {status === 'issue_found' && (
                <Section title="Issue found — work paused" subtitle={workflow.issue_summary || ''}>
                    <PhotoButton label="Photograph Issue (Company Only)" count={attachmentCounts.issue} onPress={() => addPhoto('issue')} />
                    <Field label="Resolution / approved change" value={resolutionSummary} onChangeText={setResolutionSummary} multiline />
                    <PrimaryButton title="Resume Work" disabled={busy} onPress={() => run('resume_work', { resolution_summary: resolutionSummary })} />
                </Section>
            )}

            {status === 'work_complete' && (
                <Section title="6. Homeowner completion approval" subtitle="Confirm the finished work is satisfactory.">
                    <Field label="Homeowner full name" value={completionName} onChangeText={setCompletionName} />
                    <Field label="Electronic signature (type full legal name)" value={completionSignature} onChangeText={setCompletionSignature} />
                    <PrimaryButton title="Accept Satisfactory Completion" disabled={busy} onPress={() => run('accept_completion', {
                        homeowner_name: completionName, signature: completionSignature,
                    })} />
                </Section>
            )}

            {status === 'customer_completed' && (
                <Section title="7. Invoice and collection" subtitle="No payment processor is connected yet.">
                    <PrimaryButton title="Mark Invoice Sent" disabled={busy} onPress={() => run('send_invoice')} />
                </Section>
            )}

            {status === 'collection_pending' && (
                <Section title="Payment collection pending" subtitle="The office may call, or the technician may use an approved third-party terminal.">
                    <SecondaryButton title="Record External Payment Collected" disabled={busy} onPress={() => run('record_external_payment')} />
                </Section>
            )}

            {status === 'closed' && (
                <Section title="Job closed" subtitle="Quote, signatures, photos, invoice, and external payment record are complete." />
            )}

            <Section title="Job timeline" subtitle="A timestamped audit trail for the company.">
                {(bundle.events || []).slice().reverse().map((event) => (
                    <View key={event.id} style={timelineStyle}>
                        <Text style={optionTitleStyle}>{event.title}</Text>
                        {!!event.detail && <Text style={bodyStyle}>{event.detail}</Text>}
                        <Text style={mutedStyle}>{formatDate(event.created_at)}</Text>
                    </View>
                ))}
                {bundle.events.length === 0 && <Text style={mutedStyle}>No workflow events yet.</Text>}
            </Section>
        </ScrollView>
    );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
    return <View style={sectionStyle}><Text style={sectionTitleStyle}>{title}</Text><Text style={mutedStyle}>{subtitle}</Text>{children}</View>;
}
function Field(props: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; disabled?: boolean }) {
    return <View><Text style={fieldLabelStyle}>{props.label}</Text><TextInput {...props} editable={!props.disabled} style={[inputStyle, props.multiline && textAreaStyle, props.disabled && disabledStyle]} placeholderTextColor="#7391a5" /></View>;
}
function PrimaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
    return <TouchableOpacity onPress={onPress} disabled={disabled} style={[primaryButtonStyle, disabled && disabledStyle]}><Text style={primaryButtonTextStyle}>{title}</Text></TouchableOpacity>;
}
function SecondaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
    return <TouchableOpacity onPress={onPress} disabled={disabled} style={[secondaryButtonStyle, disabled && disabledStyle]}><Text style={secondaryButtonTextStyle}>{title}</Text></TouchableOpacity>;
}
function PhotoButton({ label, count = 0, onPress }: { label: string; count?: number; onPress: () => void }) {
    return <SecondaryButton title={`${label}${count ? ` (${count} saved)` : ''}`} onPress={onPress} />;
}
function actionMessage(action: string) {
    return ({
        accept_quote: 'Quote accepted and job sold.',
        choose_now: 'Work-now workflow started.',
        choose_later: 'Return visit scheduled.',
        confirm_prework: 'Work started.',
        start_store_trip: 'Dispatch updated: technician is going to the store.',
        complete_purchase: 'Purchase saved. Technician is returning.',
        arrive_from_store: 'Arrival recorded. Work resumed.',
        report_issue: 'Issue recorded and work paused.',
        resume_work: 'Resolution recorded and work resumed.',
        complete_work: 'Technician completion recorded.',
        accept_completion: 'Homeowner completion signature saved.',
        send_invoice: 'Invoice marked sent; collection is pending.',
        record_external_payment: 'External payment recorded and job closed.',
    } as Record<string, string>)[action] || 'Saved.';
}
function errorMessage(error: unknown) {
    if (error && typeof error === 'object' && 'message' in error) return String(error.message);
    return 'The workflow could not be updated.';
}
function formatDate(value: string | null) {
    if (!value) return 'Not set';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const screenStyle = { flex: 1, backgroundColor: '#071924' } as const;
const contentStyle = { width: '100%', maxWidth: 980, alignSelf: 'center', padding: 18, gap: 14, paddingBottom: 80 } as const;
const headerStyle = { flexDirection: 'row', alignItems: 'flex-start', gap: 12 } as const;
const eyebrowStyle = { color: '#49d6d0', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 } as const;
const titleStyle = { color: '#f2fbff', fontSize: 28, fontWeight: '900', marginTop: 4 } as const;
const versionStyle = { color: '#7391a5', fontSize: 11, marginTop: 4 } as const;
const sectionStyle = { backgroundColor: '#0d2a3a', borderColor: '#24536b', borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 } as const;
const sectionTitleStyle = { color: '#f2fbff', fontSize: 20, fontWeight: '900' } as const;
const bodyStyle = { color: '#d8eaf2', fontSize: 14, lineHeight: 20, flex: 1 } as const;
const mutedStyle = { color: '#93adba', fontSize: 13, lineHeight: 18 } as const;
const messageStyle = { color: '#d8eaf2', padding: 24, fontSize: 16 } as const;
const noticeStyle = { backgroundColor: '#123d48', borderRadius: 12, padding: 12 } as const;
const noticeTextStyle = { color: '#d9ffff', fontSize: 14, fontWeight: '700' } as const;
const statusStyle = { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#102432', padding: 12, borderRadius: 12 } as const;
const statusLabelStyle = { color: '#93adba', fontSize: 13 } as const;
const statusValueStyle = { color: '#52e0a4', fontSize: 14, fontWeight: '900', textTransform: 'capitalize' } as const;
const optionGridStyle = { gap: 10 } as const;
const optionStyle = { borderColor: '#315c70', borderWidth: 1, borderRadius: 14, padding: 14, gap: 7 } as const;
const optionSelectedStyle = { borderColor: '#45d893', backgroundColor: '#123b35', borderWidth: 2 } as const;
const optionTitleStyle = { color: '#f2fbff', fontSize: 16, fontWeight: '800' } as const;
const optionPriceStyle = { color: '#52e0a4', fontSize: 22, fontWeight: '900' } as const;
const selectLabelStyle = { color: '#5ce5df', fontSize: 13, fontWeight: '800' } as const;
const legalTitleStyle = { color: '#f2fbff', fontSize: 17, fontWeight: '900', marginTop: 8 } as const;
const checkRowStyle = { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 } as const;
const checkStyle = { color: '#52e0a4', fontSize: 24 } as const;
const fieldLabelStyle = { color: '#bdd2dc', fontSize: 13, fontWeight: '700', marginBottom: 5 } as const;
const inputStyle = { borderColor: '#315c70', borderWidth: 1, borderRadius: 10, backgroundColor: '#071d29', color: '#f2fbff', padding: 12, fontSize: 15 } as const;
const textAreaStyle = { minHeight: 90, textAlignVertical: 'top' } as const;
const primaryButtonStyle = { backgroundColor: '#10a8a2', borderRadius: 11, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' } as const;
const primaryButtonTextStyle = { color: '#02151c', fontSize: 14, fontWeight: '900' } as const;
const secondaryButtonStyle = { borderColor: '#3b7188', borderWidth: 1, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' } as const;
const secondaryButtonTextStyle = { color: '#d8f8ff', fontSize: 14, fontWeight: '800' } as const;
const disabledStyle = { opacity: 0.5 } as const;
const timelineStyle = { borderLeftColor: '#35aaa5', borderLeftWidth: 3, paddingLeft: 12, gap: 3 } as const;
const totalStyle = { backgroundColor: '#123b35', borderColor: '#45d893', borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } as const;
const totalAmountStyle = { color: '#52e0a4', fontSize: 24, fontWeight: '900' } as const;
