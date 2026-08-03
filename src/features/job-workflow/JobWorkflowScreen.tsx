import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SignaturePad, { isDrawnSignature } from '../../components/signature-pad';
import { BUILD_DISPLAY } from '../../lib/appVersion';
import { formatMoney } from '../../lib/estimateOptions';
import {
    acceptJobWorkflowQuote,
    advanceJobWorkflow,
    closeJobWorkflow,
    loadOrCreateJobWorkflow,
    recordCloseoutPayment,
    startSameDayWork,
    uploadJobWorkflowPhoto,
    type JobWorkflowAttachment,
    type JobWorkflowBundle,
} from '../../lib/jobWorkflow';
import { supabase } from '../../lib/supabase';

export default function JobWorkflowScreen() {
    const { estimateSessionId, presentation, completion, source, returnTo } = useLocalSearchParams<{
        estimateSessionId?: string | string[];
        presentation?: string | string[];
        completion?: string | string[];
        source?: string | string[];
        returnTo?: string | string[];
    }>();
    const sessionId = Array.isArray(estimateSessionId) ? estimateSessionId[0] : estimateSessionId;
    const presentationMode = (Array.isArray(presentation) ? presentation[0] : presentation) === '1';
    const completionMode = (Array.isArray(completion) ? completion[0] : completion) === '1';
    const sourceName = Array.isArray(source) ? source[0] : source;
    const requestedReturnTo = Array.isArray(returnTo) ? returnTo[0] : returnTo;
    const techOSReturnTo = sourceName === 'techos' && requestedReturnTo?.startsWith('/techos')
        ? requestedReturnTo
        : '/techos';
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
    const [sameDayReason, setSameDayReason] = useState('');
    const [sameDayHomeownerName, setSameDayHomeownerName] = useState('');
    const [sameDayHomeownerSignature, setSameDayHomeownerSignature] = useState('');
    const [sameDayAgreementConfirmed, setSameDayAgreementConfirmed] = useState(false);
    const [sameDayTechnicianConfirmed, setSameDayTechnicianConfirmed] = useState(false);
    const [approvalPage, setApprovalPage] = useState<1 | 2 | 3>(1);
    const workflowScrollRef = useRef<ScrollView | null>(null);

    const approvedWorkSummary = useMemo(() => {
        if (!bundle) return '';

        const selectedIds = bundle.workflow.selected_source_choice_ids?.length
            ? bundle.workflow.selected_source_choice_ids
            : bundle.workflow.selected_source_choice_id
                ? [bundle.workflow.selected_source_choice_id]
                : [];
        const titles = bundle.options
            .filter((option) => selectedIds.includes(option.id))
            .map((option) => option.title.trim())
            .filter(Boolean);

        return titles.join(', ') || 'Approved work described in the signed work order';
    }, [bundle]);

    useEffect(() => {
        if (!sessionId) {
            setMessage('This quote does not have a saved estimate session.');
            return;
        }
        void refresh(sessionId);
    }, [sessionId]);

    useEffect(() => {
        const workflowId = bundle?.workflow.id;
        if (!workflowId || !sessionId) return;
        const channel = supabase
            .channel(`job-workflow-live:${workflowId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'company_job_workflows',
                filter: `id=eq.${workflowId}`,
            }, () => {
                void refresh(sessionId);
            })
            .subscribe();
        return () => {
            void supabase.removeChannel(channel);
        };
    }, [bundle?.workflow.id, sessionId]);

    useEffect(() => {
        if (bundle?.workflow.status !== 'sold') return;

        setSameDayReason((current) => current.trim() || approvedWorkSummary);
        setSameDayHomeownerName((current) => current.trim() || bundle.workflow.homeowner_name || '');
    }, [approvedWorkSummary, bundle?.workflow.homeowner_name, bundle?.workflow.status]);

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
            if (action === 'accept_completion' && completionMode && sourceName === 'techos') {
                router.replace(techOSReturnTo as never);
                return;
            }
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

    async function startWorkToday() {
        if (!bundle || busy) return;
        setBusy(true);
        setMessage('Saving the same-day authorization...');
        try {
            await startSameDayWork({
                workflowId: bundle.workflow.id,
                reason: sameDayReason,
                homeownerName: sameDayHomeownerName,
                homeownerSignature: sameDayHomeownerSignature,
                signedContractConfirmed: sameDayAgreementConfirmed,
                technicianConfirmed: sameDayTechnicianConfirmed,
            });
            await refresh();
            setMessage('Same-day start authorization recorded. Document the work area before starting work.');
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function closeOutJob(paymentHandling: 'paid_externally' | 'balance_due_to_office') {
        if (!bundle || busy) return;
        setBusy(true);
        setMessage('Closing out the job...');
        try {
            await closeJobWorkflow(bundle.workflow.id, paymentHandling);
            await refresh();
            setMessage(paymentHandling === 'paid_externally'
                ? 'Job closed out and payment recorded.'
                : 'Job closed out. The balance is now with the office.');
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function recordPaymentAfterCloseout() {
        if (!bundle || busy) return;
        setBusy(true);
        setMessage('Recording payment...');
        try {
            await recordCloseoutPayment(bundle.workflow.id);
            await refresh();
            setMessage('Closeout balance recorded as paid.');
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
    const selectedOptions = options.filter((option) => selectedChoiceIds.includes(option.id));
    const cancellationNoticeSigned = !!cancellationName.trim() && isDrawnSignature(cancellationSignature);
    const workApprovalReady = selectedChoiceIds.length > 0
        && cancellationNoticeSigned
        && !!homeownerName.trim()
        && isDrawnSignature(signature);
    const authorizedTotal = workflow.selected_total ?? selectedTotal;
    const sameDayBaseReady = !!sameDayReason.trim()
        && !!sameDayHomeownerName.trim()
        && isDrawnSignature(sameDayHomeownerSignature)
        && sameDayAgreementConfirmed
        && sameDayTechnicianConfirmed;
    const sameDayReady = sameDayBaseReady;

    function toggleChoice(choiceId: string) {
        setSelectedChoiceIds((current) => current.includes(choiceId)
            ? current.filter((id) => id !== choiceId)
            : [...current, choiceId]
        );
    }

    function openApprovalPage(page: 1 | 2 | 3) {
        setApprovalPage(page);
        requestAnimationFrame(() => {
            workflowScrollRef.current?.scrollTo({ y: 0, animated: false });
        });
    }

    return (
        <ScrollView
            ref={workflowScrollRef}
            contentInsetAdjustmentBehavior="automatic"
            style={screenStyle}
            contentContainerStyle={contentStyle}
        >
            <View style={headerStyle}>
                <View style={{ flex: 1 }}>
                    <Text style={eyebrowStyle}>
                        {completionMode ? 'Homeowner completion approval' : 'Homeowner approval & job workflow'}
                    </Text>
                    <Text style={titleStyle}>
                        {completionMode ? 'Completed work sign-off' : 'From quote to completion'}
                    </Text>
                    <Text style={versionStyle}>{BUILD_DISPLAY}</Text>
                </View>
                <TouchableOpacity
                    style={secondaryButtonStyle}
                    onPress={() => sourceName === 'techos' ? router.replace(techOSReturnTo as never) : router.back()}
                >
                    <Text style={secondaryButtonTextStyle}>Back</Text>
                </TouchableOpacity>
            </View>

            {!!message && <View style={noticeStyle}><Text style={noticeTextStyle}>{message}</Text></View>}
            <View style={statusStyle}>
                <Text style={statusLabelStyle}>Current step</Text>
                <Text style={statusValueStyle}>{status.replace(/_/g, ' ')}</Text>
            </View>

            {status === 'presenting' && approvalPage === 1 && (
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
                    <PrimaryButton
                        title="Continue to Cancellation Notice"
                        disabled={selectedChoiceIds.length === 0}
                        onPress={() => openApprovalPage(2)}
                    />
                </Section>
            )}

            {status === 'presenting' && approvalPage === 2 && (
                <Section title="2. Review and sign the cancellation notice" subtitle="This is a separate acknowledgment. It does not approve the work or waive the cancellation period.">
                    <Text style={legalTitleStyle}>{rule.cancellation_notice_title}</Text>
                    <Text style={bodyStyle}>{rule.cancellation_notice_text}</Text>
                    <Text style={mutedStyle}>
                        Cancellation period: {rule.cancellation_days} business days · {rule.jurisdiction_label}
                    </Text>
                    <View style={policyExplanationStyle}>
                        <Text style={optionTitleStyle}>What this means</Text>
                        <Text style={bodyStyle}>
                            You may cancel this transaction without penalty or obligation by sending the contractor written notice before
                            midnight of the third business day after receiving the completed, signed agreement and cancellation notice.
                        </Text>
                        <Text style={bodyStyle}>
                            Signing this page only confirms receipt. It does not give up the cancellation right, and ordinary work cannot
                            begin merely because this acknowledgment was signed. A different period or immediate-start rule applies only
                            when the contract legally qualifies for a specific California exception.
                        </Text>
                    </View>
                    <Text style={bodyStyle}>
                        By signing below, I confirm that I received and reviewed this cancellation notice before approving any work.
                    </Text>
                    <Field label="Name receiving cancellation notice" value={cancellationName} onChangeText={setCancellationName} />
                    <SignaturePad
                        label="Cancellation-notice signature"
                        value={cancellationSignature}
                        onChange={setCancellationSignature}
                    />
                    <View style={twoButtonRowStyle}>
                        <SecondaryButton title="Back to Options" onPress={() => openApprovalPage(1)} />
                        <PrimaryButton
                            title="Continue to Work Approval"
                            disabled={!cancellationNoticeSigned}
                            onPress={() => openApprovalPage(3)}
                        />
                    </View>
                </Section>
            )}

            {status === 'presenting' && approvalPage === 3 && (
                <Section title="3. Review and approve the selected work" subtitle="This second signature authorizes the exact scope and combined price below.">
                    <View style={optionGridStyle}>
                        {selectedOptions.map((option) => (
                            <View key={option.id} style={[optionStyle, optionSelectedStyle]}>
                                <Text style={optionTitleStyle}>{option.title}</Text>
                                <Text style={optionPriceStyle}>{formatMoney(option.pricingResult.totalAmount)}</Text>
                                <Text style={bodyStyle}>{option.homeownerExplanation}</Text>
                                {option.pricingResult.lineItems.map((line) => (
                                    <Text key={`${option.id}-${line.id}`} style={mutedStyle}>
                                        • {line.name} × {line.quantity} — {formatMoney(line.totalAmount)}
                                    </Text>
                                ))}
                            </View>
                        ))}
                    </View>
                    <View style={totalStyle}>
                        <Text style={statusLabelStyle}>Total authorized price</Text>
                        <Text style={totalAmountStyle}>{formatMoney(selectedTotal)}</Text>
                    </View>
                    <View style={policyExplanationStyle}>
                        <Text style={optionTitleStyle}>Work authorization</Text>
                        <Text style={bodyStyle}>
                            I reviewed the selected work, included line items, and combined price shown above. I authorize the company to
                            perform only this selected scope. Additional work or a material price change requires a separate explanation and approval.
                        </Text>
                        <Text style={bodyStyle}>
                            I understand that an invoice will be provided after completion and that payment collection may be handled by the
                            office or an approved external payment device.
                        </Text>
                    </View>
                    <Field label="Homeowner approving the work" value={homeownerName} onChangeText={setHomeownerName} />
                    <SignaturePad
                        label="Work-approval signature"
                        value={signature}
                        onChange={setSignature}
                    />
                    <PrimaryButton
                        title={busy ? 'Saving acceptance...' : 'Approve Selected Work'}
                        disabled={busy || !workApprovalReady}
                        onPress={acceptSelectedWork}
                    />
                    <SecondaryButton title="Back to Cancellation Notice" onPress={() => openApprovalPage(2)} />
                </Section>
            )}

            {status === 'sold' && (
                <Section title="When will the work happen?" subtitle="The technician decides whether to start today or set up a later visit.">
                    <View style={sameDayCardStyle}>
                        <Text style={optionTitleStyle}>Start Work Today</Text>
                        <Text style={bodyStyle}>
                            This is never automatic. Use it when the customer approves today’s plan and the technician confirms the job can be
                            handled today—whether that means a small repair, stabilizing a leak, or completing the full approved project.
                        </Text>
                        <Text style={mutedStyle}>Approved total: {formatMoney(authorizedTotal)} · The signed job approval stays attached to this start record.</Text>

                        <Field
                            label="Approved work starting today"
                            value={sameDayReason}
                            onChangeText={setSameDayReason}
                            multiline
                        />
                        <WorkflowCheck
                            checked={sameDayAgreementConfirmed}
                            onPress={() => setSameDayAgreementConfirmed((value) => !value)}
                            label="The signed and dated company agreement was given to the customer before work begins."
                        />
                        <WorkflowCheck
                            checked={sameDayTechnicianConfirmed}
                            onPress={() => setSameDayTechnicianConfirmed((value) => !value)}
                            label="Technician confirms today’s plan, staffing, materials, and time make this start workable."
                        />

                        <View style={completionAcknowledgementStyle}>
                            <Text style={optionTitleStyle}>Customer same-day authorization</Text>
                            <Text style={bodyStyle}>
                                I requested that the approved work described above begin today. I received the signed agreement and authorize the company to start today. Any applicable cancellation notice remains part of my agreement.
                            </Text>
                        </View>
                        <Field
                            label="Customer full name"
                            value={sameDayHomeownerName}
                            onChangeText={setSameDayHomeownerName}
                        />
                        <SignaturePad
                            label="Same-day work authorization signature"
                            value={sameDayHomeownerSignature}
                            onChange={setSameDayHomeownerSignature}
                        />
                        <PrimaryButton
                            title={busy ? 'Saving authorization...' : 'Start Work Today'}
                            disabled={busy || !sameDayReady}
                            onPress={startWorkToday}
                        />
                    </View>

                    <View style={policyExplanationStyle}>
                        <Text style={optionTitleStyle}>Set up a later visit</Text>
                        <Text style={bodyStyle}>
                            Use this when the work needs more time, materials, permits, staffing, or planning before the technician can begin.
                        </Text>
                    </View>
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
                    <PrimaryButton title="Technician Finished — Open Close Out" disabled={busy} onPress={() => run('complete_work')} />
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
                <Section
                    title="6. Close Out — Customer Acknowledgement"
                    subtitle="Please inspect the completed work before signing. Your signature confirms that the work described in the approved scope has been completed and that, based on your inspection at this time, you are satisfied with the completed work."
                >
                    <View style={completionAcknowledgementStyle}>
                        <Text style={optionTitleStyle}>Homeowner acknowledgement</Text>
                        <Text style={mutedStyle}>Final invoice total: {formatMoney(authorizedTotal)}</Text>
                        <Text style={bodyStyle}>
                            I have had an opportunity to inspect the completed work, ask questions, and identify any visible concerns. I acknowledge that the approved work has been performed and is satisfactory at the time of signing. This acknowledgement does not waive warranties or rights that cannot legally be waived.
                        </Text>
                    </View>
                    <Field label="Homeowner full name" value={completionName} onChangeText={setCompletionName} />
                    <SignaturePad
                        label="Customer closeout signature"
                        value={completionSignature}
                        onChange={setCompletionSignature}
                    />
                    <PrimaryButton title="Save Customer Acknowledgement" disabled={busy || !completionName.trim() || !isDrawnSignature(completionSignature)} onPress={() => run('accept_completion', {
                        homeowner_name: completionName, signature: completionSignature,
                    })} />
                </Section>
            )}

            {status === 'customer_completed' && (
                <Section title="7. Close Out Job" subtitle="The technician work, customer acknowledgement, and required closeout items are complete.">
                    <View style={completionAcknowledgementStyle}>
                        <Text style={optionTitleStyle}>Ready to close</Text>
                        <Text style={bodyStyle}>
                            Close this job after finalizing the invoice and deciding whether payment was collected in the field or the balance
                            should go to the office. Closing the field job does not erase an unpaid balance.
                        </Text>
                    </View>
                    <PrimaryButton title="Close Job — Payment Collected" disabled={busy} onPress={() => closeOutJob('paid_externally')} />
                    <SecondaryButton title="Close Job — Balance Due to Office" disabled={busy} onPress={() => closeOutJob('balance_due_to_office')} />
                </Section>
            )}

            {status === 'collection_pending' && (
                <Section title="Payment collection pending" subtitle="The office may call, or the technician may use an approved third-party terminal.">
                    <SecondaryButton title="Record External Payment Collected" disabled={busy} onPress={() => run('record_external_payment')} />
                </Section>
            )}

            {status === 'closed' && (
                <Section
                    title="Job closed"
                    subtitle={workflow.payment_status === 'collection_pending'
                        ? 'The field job is closed. The balance is awaiting office collection.'
                        : 'Quote, signatures, photos, invoice, and payment record are complete.'}
                >
                    {workflow.payment_status === 'collection_pending' && (
                        <SecondaryButton title="Record Closeout Balance Collected" disabled={busy} onPress={recordPaymentAfterCloseout} />
                    )}
                </Section>
            )}

            {!presentationMode && !completionMode && status !== 'presenting' && <Section title="Job timeline" subtitle="A timestamped audit trail for the company.">
                {(bundle.events || []).slice().reverse().map((event) => (
                    <View key={event.id} style={timelineStyle}>
                        <Text style={optionTitleStyle}>{event.title}</Text>
                        {!!event.detail && <Text style={bodyStyle}>{event.detail}</Text>}
                        <Text style={mutedStyle}>{formatDate(event.created_at)}</Text>
                    </View>
                ))}
                {bundle.events.length === 0 && <Text style={mutedStyle}>No workflow events yet.</Text>}
            </Section>}
        </ScrollView>
    );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
    return <View style={sectionStyle}><Text style={sectionTitleStyle}>{title}</Text><Text style={mutedStyle}>{subtitle}</Text>{children}</View>;
}
function Field(props: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; disabled?: boolean }) {
    return <View><Text style={fieldLabelStyle}>{props.label}</Text><TextInput {...props} editable={!props.disabled} style={[inputStyle, props.multiline && textAreaStyle, props.disabled && disabledStyle]} placeholderTextColor="#7391a5" /></View>;
}
function WorkflowCheck({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
    return (
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked }} style={checkRowStyle} onPress={onPress}>
            <Text style={checkStyle}>{checked ? '☑' : '☐'}</Text>
            <Text style={bodyStyle}>{label}</Text>
        </TouchableOpacity>
    );
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
const policyExplanationStyle = { backgroundColor: '#102432', borderColor: '#315c70', borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 } as const;
const sameDayCardStyle = { backgroundColor: '#15372f', borderColor: '#45d893', borderWidth: 1, borderRadius: 12, padding: 14, gap: 11 } as const;
const completionAcknowledgementStyle = { backgroundColor: '#123b35', borderColor: '#45d893', borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 } as const;
const twoButtonRowStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' } as const;
