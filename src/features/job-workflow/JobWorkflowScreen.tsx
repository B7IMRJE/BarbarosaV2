import DictationTextInput from '@/components/input/DictationTextInput';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Linking, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ServiceRequestMediaGallery from '../../components/serviceRequests/ServiceRequestMediaGallery';
import SignaturePad, { isDrawnSignature } from '../../components/signature-pad';
import { BUILD_DISPLAY } from '../../lib/appVersion';
import { loadCompanyEstimateBuilderDraft } from '../../lib/estimateBuilderDraft';
import {
    formatMoney,
    hasConflictingEstimateSelectionGroups,
    toggleEstimateChoiceSelection,
} from '../../lib/estimateOptions';
import {
    acceptJobWorkflowQuote,
    acceptJobWorkflowCompletion,
    advanceJobWorkflow,
    closeJobWorkflow,
    createJobReturnHandoff,
    createJobWorkflowAttachmentUrl,
    deferJobWorkflowScheduling,
    loadJobWorkflowRequestCard,
    loadOrCreateJobWorkflow,
    recordCloseoutPayment,
    startSameDayWork,
    uploadJobWorkflowMedia,
    uploadJobWorkflowDocument,
    type JobWorkflowAttachment,
    type JobWorkflowBundle,
    type JobWorkflowRequestCard,
} from '../../lib/jobWorkflow';
import {
    buildCloseoutWarranty,
    buildHomeItemCloseoutDraft,
    defaultHomeItemCloseoutType,
    HOME_ITEM_CLOSEOUT_TYPES,
    HOME_ITEM_CONDITIONS,
    HOME_ITEM_WARRANTY_CHOICES,
    loadCompanyJobHomeItemCloseout,
    saveCompanyJobHomeItemCloseout,
    todayDateInput,
    warrantyChoiceFromText,
    warrantyChoiceLabel,
    type HomeItemCloseoutContext,
    type HomeItemCloseoutDraft,
    type HomeItemCloseoutWarranty,
    type HomeItemWarrantyType,
} from '../../lib/home-item-closeout';
import {
    changeJobWorkflowCalendarMonth,
    combineJobWorkflowScheduleDateTime,
    formatJobWorkflowDateInput,
    formatJobWorkflowMonthInput,
    formatJobWorkflowScheduleDate,
    formatJobWorkflowScheduleTime,
    getEarliestJobWorkflowScheduleDate,
    getJobWorkflowCalendarDays,
    JOB_WORKFLOW_SCHEDULING_REASONS,
    JOB_WORKFLOW_TIME_OPTIONS,
    type JobWorkflowSchedulingReason,
} from '../../lib/job-workflow-scheduling';
import {
    getCompanyLegalDocument,
    getWorkflowStageForStatus,
    isIntegratedLegalDocument,
    recordJobLegalDocument,
    type CompanyLegalDocument,
} from '../../lib/companyLegalDocuments';
import {
    isJobReturnHandoffReady,
    parseJobReturnHandoffMaterials,
} from '../../lib/jobReturnHandoff';
import { buildTechOSCurrentJobRoute } from '../../lib/techosClientAccess';
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
    const [bundle, setBundle] = useState<JobWorkflowBundle | null>(null);
    const [quoteNumber, setQuoteNumber] = useState('');
    const techOSReturnTo = requestedReturnTo?.startsWith('/techos')
        ? requestedReturnTo
        : buildTechOSCurrentJobRoute({ companyId: bundle?.workflow.company_id || '' });
    const [message, setMessage] = useState('Opening customer approval...');
    const [busy, setBusy] = useState(false);
    const [selectedChoiceIds, setSelectedChoiceIds] = useState<string[]>([]);
    const [homeownerName, setHomeownerName] = useState('');
    const [signature, setSignature] = useState('');
    const [cancellationName, setCancellationName] = useState('');
    const [cancellationSignature, setCancellationSignature] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('09:00');
    const [scheduleCalendarMonth, setScheduleCalendarMonth] = useState('');
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
    const [workTimingChoice, setWorkTimingChoice] = useState<'today' | 'later' | null>(null);
    const [laterVisitPlan, setLaterVisitPlan] = useState<'appointment' | 'dispatch' | null>(null);
    const [schedulingReason, setSchedulingReason] = useState<JobWorkflowSchedulingReason | null>(null);
    const [schedulingNote, setSchedulingNote] = useState('');
    const [returnHandoffOpen, setReturnHandoffOpen] = useState(false);
    const [returnWorkSummary, setReturnWorkSummary] = useState('');
    const [returnRemainingWork, setReturnRemainingWork] = useState('');
    const [returnMaterialsText, setReturnMaterialsText] = useState('');
    const [returnNoMaterialsNeeded, setReturnNoMaterialsNeeded] = useState(false);
    const [returnPickupNotes, setReturnPickupNotes] = useState('');
    const [returnScheduledFor, setReturnScheduledFor] = useState('');
    const [approvalPage, setApprovalPage] = useState<1 | 2 | 3>(1);
    const [jobCardOpen, setJobCardOpen] = useState(false);
    const [jobCardLoading, setJobCardLoading] = useState(false);
    const [jobCardMessage, setJobCardMessage] = useState('');
    const [requestCard, setRequestCard] = useState<JobWorkflowRequestCard | null>(null);
    const [homeItemCloseout, setHomeItemCloseout] = useState<{
        context: HomeItemCloseoutContext;
        draft: HomeItemCloseoutDraft;
    } | null>(null);
    const [legalDocumentInputs, setLegalDocumentInputs] = useState<Record<string, {
        customerName: string;
        signature: string;
    }>>({});
    const workflowScrollRef = useRef<ScrollView | null>(null);
    const refreshEvent = useEffectEvent(refresh);
    const completionNameDirtyRef = useRef(false);
    const hydratedWorkflowIdRef = useRef<string | null>(null);

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
        void refreshEvent(sessionId);
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
                void refreshEvent(sessionId);
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
            try {
                const estimateDraft = await loadCompanyEstimateBuilderDraft(id);
                setQuoteNumber(estimateDraft?.quoteNumber || '');
            } catch {
                setQuoteNumber('');
            }
            setSelectedChoiceIds(
                next.workflow.selected_source_choice_ids?.length
                    ? next.workflow.selected_source_choice_ids
                    : next.workflow.selected_source_choice_id
                        ? [next.workflow.selected_source_choice_id]
                        : []
            );
            setHomeownerName(next.workflow.homeowner_name || '');
            const isNewWorkflow = hydratedWorkflowIdRef.current !== next.workflow.id;
            if (isNewWorkflow) {
                const earliestScheduleDate = getEarliestJobWorkflowScheduleDate({
                    acceptedAt: next.workflow.homeowner_accepted_at,
                    soldAt: next.workflow.sold_at,
                    cancellationDays: next.contract_rule.cancellation_days,
                });
                const scheduleDateText = formatJobWorkflowDateInput(earliestScheduleDate);

                setScheduleDate(scheduleDateText);
                setScheduleCalendarMonth(formatJobWorkflowMonthInput(earliestScheduleDate));
                setScheduleTime('09:00');
                setWorkTimingChoice(next.workflow.status === 'sold' && next.workflow.execution_timing === 'later'
                    ? 'later'
                    : null);
                setLaterVisitPlan(next.workflow.status === 'sold' && next.workflow.execution_timing === 'later' && !next.workflow.scheduled_for
                    ? 'dispatch'
                    : null);
            }
            if (isNewWorkflow || !completionNameDirtyRef.current) {
                setCompletionName(next.workflow.completion_homeowner_name || '');
                completionNameDirtyRef.current = false;
            }
            hydratedWorkflowIdRef.current = next.workflow.id;
            setReturnWorkSummary((current) => current.trim() || next.workflow.return_visit_work_summary || '');
            setReturnRemainingWork((current) => current.trim() || next.workflow.return_visit_remaining_work || '');
            setReturnMaterialsText((current) => current.trim() || (next.workflow.return_visit_materials || [])
                .map((material) => material.name)
                .join('\n'));
            setReturnNoMaterialsNeeded((current) => current || next.workflow.return_visit_no_materials_needed || false);
            setReturnPickupNotes((current) => current.trim() || next.workflow.return_visit_pickup_notes || '');
            setReturnScheduledFor((current) => current.trim() || next.workflow.scheduled_for || '');
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

    async function acceptCompletion() {
        if (!bundle || busy) return;
        setBusy(true);
        setMessage('Saving the immutable completion document...');
        try {
            await acceptJobWorkflowCompletion({
                workflowId: bundle.workflow.id,
                homeownerName: completionName,
                signature: completionSignature,
            });
            await refresh();
            if (completionMode && sourceName === 'techos') {
                router.replace(techOSReturnTo as never);
                return;
            }
            setMessage('Customer completion acknowledgment saved.');
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function saveLegalDocument(document: CompanyLegalDocument) {
        if (!bundle || busy) return;
        const input = legalDocumentInputs[document.template_id] || { customerName: '', signature: '' };
        setBusy(true);
        setMessage(`Saving ${document.title}...`);
        try {
            await recordJobLegalDocument({
                workflowId: bundle.workflow.id,
                templateId: document.template_id,
                customerName: input.customerName || bundle.workflow.homeowner_name || '',
                signature: input.signature,
            });
            await refresh();
            setMessage(`${document.title} saved as an immutable job copy.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function updateLegalDocumentInput(
        templateId: string,
        patch: Partial<{ customerName: string; signature: string }>
    ) {
        setLegalDocumentInputs((current) => ({
            ...current,
            [templateId]: {
                customerName: current[templateId]?.customerName || '',
                signature: current[templateId]?.signature || '',
                ...patch,
            },
        }));
    }

    async function acceptSelectedWork() {
        if (!bundle || busy) return;
        if (hasConflictingEstimateSelectionGroups(bundle.options, selectedChoiceIds)) {
            setMessage('Choose only one equipment and warranty package from each option group.');
            return;
        }
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

    async function handSchedulingToDispatch() {
        if (!bundle || busy) return;
        if (!schedulingReason) {
            setMessage('Choose why Dispatch needs to schedule this work later.');
            return;
        }

        setBusy(true);
        setMessage('Sending this sold job to Dispatch for scheduling...');

        try {
            await deferJobWorkflowScheduling({
                workflow: bundle.workflow,
                reason: schedulingReason,
                note: schedulingNote,
            });
            await refresh();
            setWorkTimingChoice('later');
            setLaterVisitPlan('dispatch');
            setMessage('Dispatch scheduling requested. No appointment has been promised to the customer yet.');
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

    async function saveMedia(stage: JobWorkflowAttachment['stage'], assets: ImagePicker.ImagePickerAsset[]) {
        if (!bundle || assets.length === 0) return;

        let savedCount = 0;
        for (const [index, asset] of assets.entries()) {
            setMessage(`Saving media ${index + 1} of ${assets.length}...`);
            await uploadJobWorkflowMedia({ workflow: bundle.workflow, stage, asset });
            savedCount += 1;
        }

        await refresh();
        setMessage(`${savedCount} media item${savedCount === 1 ? '' : 's'} saved to the job.`);
    }

    async function addMediaFromLibrary(stage: JobWorkflowAttachment['stage']) {
        if (!bundle || busy) return;
        setBusy(true);
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                setMessage('Photo and video library permission is required.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images', 'videos'],
                allowsMultipleSelection: true,
                selectionLimit: 0,
                orderedSelection: true,
                quality: 0.8,
            });
            if (!result.canceled) await saveMedia(stage, result.assets);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function captureMedia(stage: JobWorkflowAttachment['stage'], mediaType: 'images' | 'videos') {
        if (!bundle || busy) return;
        setBusy(true);
        try {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
                setMessage('Camera permission is required. You can add existing media from the library instead.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: [mediaType],
                quality: 0.8,
                videoMaxDuration: mediaType === 'videos' ? 90 : undefined,
            });
            if (!result.canceled) await saveMedia(stage, result.assets);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function addWarrantyDocument() {
        if (!bundle || busy) return;
        setBusy(true);
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*'],
                multiple: true,
                copyToCacheDirectory: true,
            });
            if (result.canceled) return;
            for (const asset of result.assets) {
                await uploadJobWorkflowDocument({ workflow: bundle.workflow, stage: 'warranty', asset });
            }
            await refresh();
            setMessage(`${result.assets.length} warranty document${result.assets.length === 1 ? '' : 's'} attached.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function openHomeItemCloseout() {
        if (!bundle || busy) return;
        setBusy(true);
        setMessage('Preparing the permanent HomeOS item update...');
        try {
            const context = await loadCompanyJobHomeItemCloseout(bundle.workflow.id);
            if (!context.linked || !context.item) {
                await advanceJobWorkflow(bundle.workflow.id, 'complete_work');
                await refresh();
                setMessage('Technician completion recorded.');
                return;
            }

            const defaultCompletionType = defaultHomeItemCloseoutType(context);
            const completionType = context.catalog_product && defaultCompletionType === 'repaired'
                ? 'replaced'
                : defaultCompletionType;
            const date = todayDateInput();
            const catalogWarrantyByType: Record<HomeItemWarrantyType, string> = {
                workmanship: context.catalog_product?.workmanship_warranty || '',
                labor: context.catalog_product?.labor_warranty || '',
                manufacturer_parts: context.catalog_product?.manufacturer_warranty || '',
            };
            const warranties: HomeItemCloseoutWarranty[] = (['workmanship', 'labor', 'manufacturer_parts'] as HomeItemWarrantyType[])
                .map((warrantyType) => {
                    const warrantyText = catalogWarrantyByType[warrantyType];
                    const choice = warrantyChoiceFromText(warrantyText);
                    return buildCloseoutWarranty({
                        warrantyType,
                        choice,
                        startDate: date,
                        customLabel: choice === 'custom' ? warrantyText : '',
                    });
                });
            const draft = context.draft || buildHomeItemCloseoutDraft({
                completionType,
                itemName: context.catalog_product?.product_name || context.item.name,
                condition: completionType === 'repaired' ? 'Good' : 'Newly Installed',
                completionDate: date,
                installedOn: completionType === 'repaired' && context.item.installed_on
                    ? context.item.installed_on
                    : date,
                brand: context.catalog_product?.brand || context.item.brand || '',
                model: context.catalog_product?.model || context.item.model || '',
                serialNumber: context.item.serial_number || '',
                partNumber: context.catalog_product?.manufacturer_part_number || context.item.part_number || '',
                workPerformed: approvedWorkSummary,
                installationNotes: context.item.installation_notes || '',
                warranties,
            });
            setHomeItemCloseout({ context, draft });
            setMessage('');
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function updateHomeItemCloseout(patch: Partial<HomeItemCloseoutDraft>) {
        setHomeItemCloseout((current) => current
            ? { ...current, draft: { ...current.draft, ...patch } }
            : current);
    }

    function updateHomeItemWarranty(warrantyType: HomeItemWarrantyType, patch: Partial<HomeItemCloseoutWarranty>) {
        setHomeItemCloseout((current) => current
            ? {
                ...current,
                draft: {
                    ...current.draft,
                    warranties: current.draft.warranties.map((warranty) => warranty.warranty_type === warrantyType
                        ? { ...warranty, ...patch }
                        : warranty),
                },
            }
            : current);
    }

    async function confirmHomeItemCloseout() {
        if (!bundle || !homeItemCloseout || busy) return;
        if (!homeItemCloseout.draft.work_performed.trim()) {
            setMessage('Describe the work performed before completing the job.');
            return;
        }
        setBusy(true);
        setMessage('Updating the permanent HomeOS item and completing the work...');
        try {
            await saveCompanyJobHomeItemCloseout(bundle.workflow.id, homeItemCloseout.draft);
            await advanceJobWorkflow(bundle.workflow.id, 'complete_work');
            setHomeItemCloseout(null);
            await refresh();
            setMessage('Work completed. The linked HomeOS item and lifetime history were updated.');
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function pauseForIssue() {
        const summary = issueSummary.trim() || 'Technician paused work to assess an issue.';
        setIssueSummary(summary);
        await run('report_issue', { issue_summary: summary });
    }

    function changeCompletionName(value: string) {
        completionNameDirtyRef.current = true;
        setCompletionName(value);
    }

    async function startStoreRun() {
        await run('start_store_trip', {
            store_name: 'Store run',
            store_address: '',
        });
    }

    async function saveReturnVisitHandoff() {
        if (!bundle || busy) return;

        const materials = parseJobReturnHandoffMaterials(returnMaterialsText);
        const mediaCount = attachmentCounts.handoff || 0;

        if (!isJobReturnHandoffReady({
            workSummary: returnWorkSummary,
            remainingWork: returnRemainingWork,
            scheduledFor: returnScheduledFor,
            materials,
            noMaterialsNeeded: returnNoMaterialsNeeded,
            mediaCount,
        })) {
            setMessage('Complete the work summary, remaining work, return time, materials decision, and at least one handoff photo or video.');
            return;
        }

        setBusy(true);
        setMessage('Saving return-visit handoff...');

        try {
            await createJobReturnHandoff({
                workflowId: bundle.workflow.id,
                scheduledFor: returnScheduledFor,
                workSummary: returnWorkSummary.trim(),
                remainingWork: returnRemainingWork.trim(),
                materials,
                noMaterialsNeeded: returnNoMaterialsNeeded,
                pickupNotes: returnPickupNotes.trim(),
            });
            setReturnHandoffOpen(false);
            await refresh();
            setMessage('Return visit scheduled. The next technician handoff is attached to this job.');
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function openJobMedia(attachment: JobWorkflowAttachment) {
        try {
            const url = await createJobWorkflowAttachmentUrl(attachment);
            await Linking.openURL(url);
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    async function openJobCard() {
        setJobCardOpen(true);
        setJobCardLoading(true);
        setJobCardMessage('');
        setRequestCard(null);

        try {
            if (!bundle?.workflow.service_request_id) {
                setJobCardMessage('This workflow is not linked to a customer request yet.');
                return;
            }

            const nextRequestCard = await loadJobWorkflowRequestCard(bundle.workflow);

            if (!nextRequestCard) {
                setJobCardMessage('The linked customer request is unavailable.');
                return;
            }

            setRequestCard(nextRequestCard);
        } catch (error) {
            setJobCardMessage(errorMessage(error));
        } finally {
            setJobCardLoading(false);
        }
    }

    if (!bundle) {
        return <View style={screenStyle}><Text style={messageStyle}>{message}</Text></View>;
    }

    const { workflow, contract_rule: rule, options, legal_documents: legalDocuments } = bundle;
    const status = workflow.status;
    const returnsToTechOS = sourceName === 'techos' || requestedReturnTo?.startsWith('/techos');
    const handoffAttachments = bundle.attachments.filter((attachment) => attachment.stage === 'handoff');
    const returnMaterials = parseJobReturnHandoffMaterials(returnMaterialsText);
    const returnHandoffReady = isJobReturnHandoffReady({
        workSummary: returnWorkSummary,
        remainingWork: returnRemainingWork,
        scheduledFor: returnScheduledFor,
        materials: returnMaterials,
        noMaterialsNeeded: returnNoMaterialsNeeded,
        mediaCount: handoffAttachments.length,
    });
    const selectedTotal = options
        .filter((option) => selectedChoiceIds.includes(option.id))
        .reduce((total, option) => total + option.pricingResult.totalAmount, 0);
    const selectedOptions = options.filter((option) => selectedChoiceIds.includes(option.id));
    const groupedOptionKeys = options.map((option) => String(option.selectionGroup || '').trim());
    const allOptionsAreOneChoice = options.length > 1 &&
        groupedOptionKeys.every(Boolean) &&
        new Set(groupedOptionKeys).size === 1;
    const cancellationNoticeSigned = !!cancellationName.trim() && isDrawnSignature(cancellationSignature);
    const cancellationDocument = getCompanyLegalDocument(legalDocuments, 'notice_of_cancellation');
    const customerAuthorizationDocument = getCompanyLegalDocument(legalDocuments, 'customer_authorization');
    const sameDayAuthorizationDocument = getCompanyLegalDocument(legalDocuments, 'same_day_work_authorization');
    const completionDocument = getCompanyLegalDocument(legalDocuments, 'completion_acknowledgment');
    const currentLegalStage = getWorkflowStageForStatus(status);
    const genericLegalDocuments = legalDocuments.filter((document) => (
        document.is_active
        && !document.completed_snapshot_id
        && document.workflow_stage === currentLegalStage
        && !isIntegratedLegalDocument(document.document_type)
    ));
    const showGenericLegalDocuments = genericLegalDocuments.length > 0
        && (status !== 'presenting' || approvalPage === 3);
    const requiredLegalDocumentsReady = !genericLegalDocuments.some((document) => document.blocks_progression);
    const workApprovalReady = selectedChoiceIds.length > 0
        && cancellationNoticeSigned
        && !!homeownerName.trim()
        && isDrawnSignature(signature)
        && requiredLegalDocumentsReady;
    const authorizedTotal = workflow.selected_total ?? selectedTotal;
    const sameDayBaseReady = !!sameDayReason.trim()
        && !!sameDayHomeownerName.trim()
        && isDrawnSignature(sameDayHomeownerSignature)
        && sameDayAgreementConfirmed
        && sameDayTechnicianConfirmed;
    const sameDayReady = sameDayBaseReady && requiredLegalDocumentsReady;
    const earliestScheduleDate = formatJobWorkflowDateInput(getEarliestJobWorkflowScheduleDate({
        acceptedAt: workflow.homeowner_accepted_at,
        soldAt: workflow.sold_at,
        cancellationDays: rule.cancellation_days,
    }));
    const scheduledFor = combineJobWorkflowScheduleDateTime(scheduleDate, scheduleTime);

    function toggleChoice(choiceId: string) {
        setSelectedChoiceIds((current) => toggleEstimateChoiceSelection(options, current, choiceId));
    }

    function openApprovalPage(page: 1 | 2 | 3) {
        setApprovalPage(page);
        requestAnimationFrame(() => {
            workflowScrollRef.current?.scrollTo({ y: 0, animated: false });
        });
    }

    function leaveWorkflow() {
        if (returnsToTechOS) {
            returnToTechOS();
            return;
        }

        router.back();
    }

    function returnToTechOS() {
        router.replace(techOSReturnTo as never);
    }

    return (
        <>
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
                    {!!quoteNumber && <Text style={quoteNumberStyle}>Quote {quoteNumber}</Text>}
                    <Text style={versionStyle}>{BUILD_DISPLAY}</Text>
                </View>
                <TouchableOpacity
                    style={secondaryButtonStyle}
                    onPress={leaveWorkflow}
                >
                    <Text style={secondaryButtonTextStyle}>{returnsToTechOS ? 'Back to TechOS' : 'Back'}</Text>
                </TouchableOpacity>
            </View>

                {!!message && <View style={noticeStyle}><Text style={noticeTextStyle}>{message}</Text></View>}

                <SecondaryButton title="View Job Card" onPress={() => void openJobCard()} />

            {showGenericLegalDocuments && (
                <JobLegalDocumentsPanel
                    documents={genericLegalDocuments}
                    inputs={legalDocumentInputs}
                    defaultCustomerName={workflow.homeowner_name || homeownerName}
                    busy={busy}
                    onChange={updateLegalDocumentInput}
                    onSave={saveLegalDocument}
                />
            )}
            <View style={statusStyle}>
                <Text style={statusLabelStyle}>Current step</Text>
                <Text style={statusValueStyle}>{status.replace(/_/g, ' ')}</Text>
            </View>

            {!presentationMode && !completionMode && workflow.return_visit_handoff_at && (
                <Section
                    title="Return Visit Handoff"
                    subtitle={`Saved ${formatDate(workflow.return_visit_handoff_at)} · Return ${formatDate(workflow.scheduled_for)}`}
                >
                    <View style={handoffSummaryStyle}>
                        <Text style={optionTitleStyle}>Work completed and current condition</Text>
                        <Text style={bodyStyle}>{workflow.return_visit_work_summary || 'Not documented'}</Text>
                    </View>
                    <View style={handoffSummaryStyle}>
                        <Text style={optionTitleStyle}>What the next technician or crew must do</Text>
                        <Text style={bodyStyle}>{workflow.return_visit_remaining_work || 'Not documented'}</Text>
                    </View>
                    <View style={handoffSummaryStyle}>
                        <Text style={optionTitleStyle}>Materials to pick up</Text>
                        {workflow.return_visit_no_materials_needed ? (
                            <Text style={bodyStyle}>No additional materials needed.</Text>
                        ) : (
                            (workflow.return_visit_materials || []).map((material, index) => (
                                <Text key={`${material.name}-${index}`} style={bodyStyle}>• {material.name}</Text>
                            ))
                        )}
                        {!!workflow.return_visit_pickup_notes && (
                            <Text style={mutedStyle}>Pickup notes: {workflow.return_visit_pickup_notes}</Text>
                        )}
                    </View>
                    <JobMediaList attachments={handoffAttachments} onOpen={openJobMedia} />
                </Section>
            )}

            {status === 'presenting' && approvalPage === 1 && (
                <Section
                    title="1. Homeowner selects the work"
                    subtitle={allOptionsAreOneChoice
                        ? 'Choose one complete technician-approved quote option.'
                        : 'Select one or more technician-approved options.'}
                >
                    <View style={optionGridStyle}>
                        {options.map((option) => (
                            <TouchableOpacity
                                accessibilityRole={option.selectionGroup ? 'radio' : 'checkbox'}
                                accessibilityState={{ checked: selectedChoiceIds.includes(option.id) }}
                                key={option.id}
                                onPress={() => toggleChoice(option.id)}
                                style={selectedChoiceIds.includes(option.id) ? [optionStyle, optionSelectedStyle] : optionStyle}
                            >
                                <Text style={optionTitleStyle}>{option.title}</Text>
                                <Text style={optionPriceStyle}>{formatMoney(option.pricingResult.totalAmount)}</Text>
                                {!!option.selectionGroup && (
                                    <Text style={selectionGroupPillStyle}>
                                        {option.selectionGroupLabel || 'Choose one complete quote option'}
                                    </Text>
                                )}
                                <Text style={bodyStyle}>{option.homeownerExplanation}</Text>
                                <CustomerSelectionList selections={option.customerSelections} />
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
                    <Text style={legalTitleStyle}>
                        {cancellationDocument?.title || rule.cancellation_notice_title}
                    </Text>
                    <Text style={bodyStyle}>
                        {cancellationDocument?.body || rule.cancellation_notice_text}
                    </Text>
                    <Text style={mutedStyle}>
                        Cancellation period: {rule.cancellation_days} business days · {rule.jurisdiction_label}
                    </Text>
                    <Text style={bodyStyle}>
                        By signing below, I confirm that I received and reviewed this cancellation notice before approving any work.
                    </Text>
                    {cancellationDocument?.auto_record_datetime && (
                        <Text style={mutedStyle}>The signed date and time will be recorded automatically.</Text>
                    )}
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
                                <CustomerSelectionList selections={option.customerSelections} />
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
                        <Text style={optionTitleStyle}>
                            {customerAuthorizationDocument?.title || 'Work authorization'}
                        </Text>
                        <Text style={bodyStyle}>
                            {customerAuthorizationDocument?.body || (
                                'I reviewed the selected work, included line items, and combined price shown above. I authorize the company to perform only this selected scope. Additional work or a material price change requires a separate explanation and approval.'
                            )}
                        </Text>
                        {customerAuthorizationDocument?.auto_record_datetime && (
                            <Text style={mutedStyle}>The signed date and time will be recorded automatically.</Text>
                        )}
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
                    <Text style={timingInstructionStyle}>Choose one. You can switch choices until you press the final confirmation button.</Text>
                    <View style={timingChoiceGridStyle}>
                        <TimingChoice
                            title="Start Work Today"
                            description="Complete the same-day authorization, then begin pre-work documentation."
                            selected={workTimingChoice === 'today'}
                            disabled={busy}
                            onPress={() => {
                                setWorkTimingChoice('today');
                                setMessage('');
                            }}
                        />
                        <TimingChoice
                            title="Perform Work Later"
                            description="Choose a future return date when more time, materials, permits, or staffing are needed."
                            selected={workTimingChoice === 'later'}
                            disabled={busy}
                            onPress={() => {
                                setWorkTimingChoice('later');
                                setMessage('');
                            }}
                        />
                    </View>

                    {workTimingChoice === 'today' && (
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
                                <Text style={optionTitleStyle}>
                                    {sameDayAuthorizationDocument?.title || 'Customer same-day authorization'}
                                </Text>
                                <Text style={bodyStyle}>
                                    {sameDayAuthorizationDocument?.body || (
                                        'I requested that the approved work described above begin today. I received the signed agreement and authorize the company to start today. Any applicable cancellation notice remains part of my agreement.'
                                    )}
                                </Text>
                                {sameDayAuthorizationDocument?.auto_record_datetime && (
                                    <Text style={mutedStyle}>The signed date and time will be recorded automatically.</Text>
                                )}
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
                                title={busy ? 'Saving authorization...' : 'Confirm & Start Work Today'}
                                disabled={busy || !sameDayReady}
                                onPress={startWorkToday}
                            />
                            <SecondaryButton
                                title="Choose Perform Work Later Instead"
                                disabled={busy}
                                onPress={() => {
                                    setWorkTimingChoice('later');
                                    setMessage('');
                                }}
                            />
                        </View>
                    )}

                    {workTimingChoice === 'later' && (
                        <View style={laterVisitCardStyle}>
                            <Text style={optionTitleStyle}>Perform Work Later</Text>
                            <Text style={bodyStyle}>
                                Create the return appointment now, or send the sold job to Dispatch when parts, permits, staffing, or the customer are not ready yet.
                            </Text>
                            <View style={timingChoiceGridStyle}>
                                <TimingChoice
                                    title="Create Appointment Now"
                                    description="Choose the calendar date and start time while you are with the customer."
                                    selected={laterVisitPlan === 'appointment'}
                                    disabled={busy}
                                    onPress={() => {
                                        setLaterVisitPlan('appointment');
                                        setMessage('');
                                    }}
                                />
                                <TimingChoice
                                    title="Dispatch Schedules Later"
                                    description="Keep the sold job active without promising a date until parts or another condition is ready."
                                    selected={laterVisitPlan === 'dispatch'}
                                    disabled={busy}
                                    onPress={() => {
                                        setLaterVisitPlan('dispatch');
                                        setMessage('');
                                    }}
                                />
                            </View>

                            {laterVisitPlan === 'appointment' && (
                                <View style={appointmentPanelStyle}>
                                    <View style={appointmentHeaderStyle}>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={optionTitleStyle}>Return Appointment</Text>
                                            <Text style={mutedStyle}>
                                                {formatJobWorkflowScheduleDate(scheduleDate)} at {formatJobWorkflowScheduleTime(scheduleTime)}
                                            </Text>
                                        </View>
                                    </View>
                                    <JobWorkflowDatePicker
                                        selectedDate={scheduleDate}
                                        calendarMonth={scheduleCalendarMonth}
                                        minimumDate={earliestScheduleDate}
                                        onSelectDate={(date) => {
                                            setScheduleDate(date);
                                            setScheduleCalendarMonth(date.slice(0, 7));
                                        }}
                                        onChangeMonth={setScheduleCalendarMonth}
                                    />
                                    <JobWorkflowTimePicker value={scheduleTime} onSelect={setScheduleTime} />
                                    <Text style={mutedStyle}>
                                        The signed cancellation period is respected automatically. Earliest available date: {formatJobWorkflowScheduleDate(earliestScheduleDate)}.
                                    </Text>
                                    <PrimaryButton
                                        title={busy ? 'Creating appointment...' : 'Confirm Return Appointment'}
                                        disabled={busy || !scheduledFor}
                                        onPress={() => run('choose_later', { scheduled_for: scheduledFor })}
                                    />
                                </View>
                            )}

                            {laterVisitPlan === 'dispatch' && (
                                <View style={appointmentPanelStyle}>
                                    <Text style={optionTitleStyle}>Why is scheduling waiting?</Text>
                                    <View style={schedulingReasonGridStyle}>
                                        {JOB_WORKFLOW_SCHEDULING_REASONS.map((reason) => (
                                            <SchedulingReasonChoice
                                                key={reason.value}
                                                title={reason.label}
                                                selected={schedulingReason === reason.value}
                                                disabled={busy}
                                                onPress={() => setSchedulingReason(reason.value)}
                                            />
                                        ))}
                                    </View>
                                    {!!schedulingReason && (
                                        <Text style={schedulingSelectionStyle}>
                                            Selected: {JOB_WORKFLOW_SCHEDULING_REASONS.find((reason) => reason.value === schedulingReason)?.label}
                                        </Text>
                                    )}
                                    <Field
                                        label="Dispatch note (optional)"
                                        value={schedulingNote}
                                        onChangeText={setSchedulingNote}
                                        multiline
                                    />
                                    <PrimaryButton
                                        title={busy ? 'Sending to Dispatch...' : 'Leave Active for Dispatch'}
                                        disabled={busy || !schedulingReason}
                                        onPress={handSchedulingToDispatch}
                                    />
                                    {workflow.execution_timing === 'later' && !workflow.scheduled_for && (
                                        <Text style={schedulingPendingStyle}>Waiting for Dispatch · No appointment promised yet</Text>
                                    )}
                                </View>
                            )}

                            {!laterVisitPlan && (
                                <Text style={mutedStyle}>Choose whether to create the appointment now or let Dispatch schedule it later.</Text>
                            )}
                            <SecondaryButton
                                title="Choose Start Work Today Instead"
                                disabled={busy}
                                onPress={() => {
                                    setWorkTimingChoice('today');
                                    setMessage('');
                                }}
                            />
                        </View>
                    )}
                </Section>
            )}

            {status === 'scheduled_later' && (
                <Section title="Scheduled return visit" subtitle={`Scheduled: ${formatDate(workflow.scheduled_for)}`}>
                    <PrimaryButton title="Begin Return Visit" disabled={busy || !requiredLegalDocumentsReady} onPress={() => run('begin_return_visit')} />
                </Section>
            )}

            {status === 'prework' && (
                <Section title="3. Document the work area" subtitle="Add as many before photos and videos as needed, then confirm the condition.">
                    <MediaActions
                        label="Before-work media"
                        count={attachmentCounts.before}
                        disabled={busy || !requiredLegalDocumentsReady}
                        onTakePhoto={() => captureMedia('before', 'images')}
                        onRecordVideo={() => captureMedia('before', 'videos')}
                        onAddFromLibrary={() => addMediaFromLibrary('before')}
                    />
                    <TouchableOpacity style={checkRowStyle} onPress={() => setConditionUnchanged((value) => !value)}>
                        <Text style={checkStyle}>{conditionUnchanged ? '☑' : '☐'}</Text>
                        <Text style={bodyStyle}>The area matches the condition shown and is ready for work.</Text>
                    </TouchableOpacity>
                    <PrimaryButton
                        title="Start Work"
                        disabled={busy || !requiredLegalDocumentsReady}
                        onPress={() => run('confirm_prework', { condition_unchanged: conditionUnchanged })}
                    />
                    <SecondaryButton title="Go to Store" disabled={busy} onPress={startStoreRun} />
                    <SecondaryButton title="Continue Job on Another Visit" disabled={busy} onPress={() => setReturnHandoffOpen(true)} />
                </Section>
            )}

            {status === 'store_trip' && (
                <Section title="4. Store run" subtitle="The live board keeps this job In Progress and shows Store Run. Record receipts and purchased parts for the company.">
                    <MediaActions
                        label="Receipt media"
                        count={attachmentCounts.receipt}
                        disabled={busy}
                        onTakePhoto={() => captureMedia('receipt', 'images')}
                        onRecordVideo={() => captureMedia('receipt', 'videos')}
                        onAddFromLibrary={() => addMediaFromLibrary('receipt')}
                    />
                    <MediaActions
                        label="Purchased-parts media"
                        count={attachmentCounts.purchased_item}
                        disabled={busy}
                        onTakePhoto={() => captureMedia('purchased_item', 'images')}
                        onRecordVideo={() => captureMedia('purchased_item', 'videos')}
                        onAddFromLibrary={() => addMediaFromLibrary('purchased_item')}
                    />
                    <PrimaryButton title="Purchase Complete — On My Way Back" disabled={busy} onPress={() => run('complete_purchase')} />
                </Section>
            )}

            {status === 'returning_to_job' && (
                <Section title="Returning to job site" subtitle="Dispatch can see that you are returning. Confirm arrival before work can resume.">
                    <PrimaryButton title="I'm Back at the Job — Resume Work" disabled={busy} onPress={() => run('arrive_from_store')} />
                </Section>
            )}

            {status === 'work_in_progress' && (
                <Section title="5. Work in progress" subtitle="Report a problem or complete the work with after photos.">
                    <Field label="Issue notes (optional)" value={issueSummary} onChangeText={setIssueSummary} multiline />
                    <SecondaryButton title="Pause Work — Issue Found" disabled={busy} onPress={pauseForIssue} />
                    <MediaActions
                        label="During-work media"
                        count={attachmentCounts.during}
                        disabled={busy}
                        onTakePhoto={() => captureMedia('during', 'images')}
                        onRecordVideo={() => captureMedia('during', 'videos')}
                        onAddFromLibrary={() => addMediaFromLibrary('during')}
                    />
                    <MediaActions
                        label="Completed-work media"
                        count={attachmentCounts.after}
                        disabled={busy}
                        onTakePhoto={() => captureMedia('after', 'images')}
                        onRecordVideo={() => captureMedia('after', 'videos')}
                        onAddFromLibrary={() => addMediaFromLibrary('after')}
                    />
                    <PrimaryButton title="Technician Finished — Open Close Out" disabled={busy || !requiredLegalDocumentsReady} onPress={() => void openHomeItemCloseout()} />
                    <SecondaryButton title="Go to Store" disabled={busy} onPress={startStoreRun} />
                    <SecondaryButton title="Continue Job on Another Visit" disabled={busy} onPress={() => setReturnHandoffOpen(true)} />
                </Section>
            )}

            {status === 'issue_found' && (
                <Section title="Issue found — work paused" subtitle={workflow.issue_summary || ''}>
                    <MediaActions
                        label="Issue media (company only)"
                        count={attachmentCounts.issue}
                        disabled={busy}
                        onTakePhoto={() => captureMedia('issue', 'images')}
                        onRecordVideo={() => captureMedia('issue', 'videos')}
                        onAddFromLibrary={() => addMediaFromLibrary('issue')}
                    />
                    <Field label="Resolution / approved change" value={resolutionSummary} onChangeText={setResolutionSummary} multiline />
                    <PrimaryButton title="Resume Work" disabled={busy} onPress={() => run('resume_work', { resolution_summary: resolutionSummary })} />
                    <SecondaryButton title="Continue Job on Another Visit" disabled={busy} onPress={() => setReturnHandoffOpen(true)} />
                </Section>
            )}

            {returnHandoffOpen && ['prework', 'work_in_progress', 'issue_found'].includes(status) && (
                <Section
                    title="Job Continuance / Return Visit Handoff"
                    subtitle="Leave the next technician a complete field handoff before anyone travels to the job or store."
                >
                    <Field
                        label="Work completed and current site condition *"
                        value={returnWorkSummary}
                        onChangeText={setReturnWorkSummary}
                        multiline
                    />
                    <Field
                        label="Exactly what the next technician or crew must do *"
                        value={returnRemainingWork}
                        onChangeText={setReturnRemainingWork}
                        multiline
                    />
                    <Field
                        label="Materials and quantities — one item per line *"
                        value={returnMaterialsText}
                        onChangeText={setReturnMaterialsText}
                        multiline
                        disabled={returnNoMaterialsNeeded}
                    />
                    <WorkflowCheck
                        checked={returnNoMaterialsNeeded}
                        onPress={() => setReturnNoMaterialsNeeded((value) => !value)}
                        label="No additional materials are needed for the return visit."
                    />
                    <Field
                        label="Store, pickup, access, or staging notes"
                        value={returnPickupNotes}
                        onChangeText={setReturnPickupNotes}
                        multiline
                    />
                    <Field
                        label="Return date and time (example: 2026-08-06T09:00:00-07:00) *"
                        value={returnScheduledFor}
                        onChangeText={setReturnScheduledFor}
                    />
                    <MediaActions
                        label="Handoff photos and videos *"
                        count={handoffAttachments.length}
                        disabled={busy}
                        onTakePhoto={() => captureMedia('handoff', 'images')}
                        onRecordVideo={() => captureMedia('handoff', 'videos')}
                        onAddFromLibrary={() => addMediaFromLibrary('handoff')}
                    />
                    <JobMediaList attachments={handoffAttachments} onOpen={openJobMedia} />
                    <Text style={mutedStyle}>
                        Required: current condition, remaining work, a materials decision, a return time, and at least one clear photo or video.
                    </Text>
                    <PrimaryButton
                        title={busy ? 'Saving Handoff...' : 'Save Handoff & Schedule Return Visit'}
                        disabled={busy || !returnHandoffReady}
                        onPress={saveReturnVisitHandoff}
                    />
                    <SecondaryButton title="Cancel" disabled={busy} onPress={() => setReturnHandoffOpen(false)} />
                </Section>
            )}

            {status === 'work_complete' && (
                <Section
                    title="6. Close Out — Customer Acknowledgement"
                    subtitle="Please inspect the completed work before signing the company-configured completion document."
                >
                    <View style={completionAcknowledgementStyle}>
                        <Text style={optionTitleStyle}>
                            {completionDocument?.title || 'Homeowner acknowledgement'}
                        </Text>
                        <Text style={mutedStyle}>Final invoice total: {formatMoney(authorizedTotal)}</Text>
                        <Text style={bodyStyle}>
                            {completionDocument?.body || (
                                'I have had an opportunity to inspect the completed work, ask questions, and identify any visible concerns. I acknowledge that the approved work has been performed and is satisfactory at the time of signing. This acknowledgement does not waive warranties or rights that cannot legally be waived.'
                            )}
                        </Text>
                        {completionDocument?.auto_record_datetime && (
                            <Text style={mutedStyle}>The signed date and time will be recorded automatically.</Text>
                        )}
                    </View>
                    <Field label="Homeowner full name" value={completionName} onChangeText={changeCompletionName} />
                    <SignaturePad
                        label="Customer closeout signature"
                        value={completionSignature}
                        onChange={setCompletionSignature}
                    />
                    <PrimaryButton
                        title="Save Customer Acknowledgement"
                        disabled={busy || !requiredLegalDocumentsReady || !completionName.trim() || !isDrawnSignature(completionSignature)}
                        onPress={acceptCompletion}
                    />
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
                    <PrimaryButton title="Close Job — Payment Collected" disabled={busy || !requiredLegalDocumentsReady} onPress={() => closeOutJob('paid_externally')} />
                    <SecondaryButton title="Close Job — Balance Due to Office" disabled={busy || !requiredLegalDocumentsReady} onPress={() => closeOutJob('balance_due_to_office')} />
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
                    <SecondaryButton title="Back to TechOS Dashboard" onPress={returnToTechOS} />
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

            <JobRequestCardModal
                loading={jobCardLoading}
                message={jobCardMessage}
                onClose={() => setJobCardOpen(false)}
                request={requestCard}
                visible={jobCardOpen}
            />
            <HomeItemCloseoutModal
                busy={busy}
                closeout={homeItemCloseout}
                documentCount={attachmentCounts.warranty || 0}
                photoCount={(attachmentCounts.before || 0) + (attachmentCounts.issue || 0) + (attachmentCounts.handoff || 0) + (attachmentCounts.during || 0) + (attachmentCounts.purchased_item || 0) + (attachmentCounts.after || 0)}
                onAddDocument={() => void addWarrantyDocument()}
                onAddPhoto={() => void addMediaFromLibrary('warranty')}
                onClose={() => setHomeItemCloseout(null)}
                onConfirm={() => void confirmHomeItemCloseout()}
                onUpdate={updateHomeItemCloseout}
                onUpdateWarranty={updateHomeItemWarranty}
            />
        </>
    );
}

function HomeItemCloseoutModal({
    busy,
    closeout,
    documentCount,
    photoCount,
    onAddDocument,
    onAddPhoto,
    onClose,
    onConfirm,
    onUpdate,
    onUpdateWarranty,
}: {
    busy: boolean;
    closeout: { context: HomeItemCloseoutContext; draft: HomeItemCloseoutDraft } | null;
    documentCount: number;
    photoCount: number;
    onAddDocument: () => void;
    onAddPhoto: () => void;
    onClose: () => void;
    onConfirm: () => void;
    onUpdate: (patch: Partial<HomeItemCloseoutDraft>) => void;
    onUpdateWarranty: (type: HomeItemWarrantyType, patch: Partial<HomeItemCloseoutWarranty>) => void;
}) {
    if (!closeout) return null;
    const { context, draft } = closeout;

    return (
        <Modal visible animationType="slide" onRequestClose={onClose}>
            <ScrollView style={jobCardModalScreenStyle} contentContainerStyle={jobCardModalContentStyle}>
                <View style={jobCardModalHeaderStyle}>
                    <View style={{ flex: 1, minWidth: 220 }}>
                        <Text style={eyebrowStyle}>HOMEOS ITEM UPDATE</Text>
                        <Text style={jobCardModalTitleStyle}>{draft.item_name}</Text>
                        <Text style={mutedStyle}>{[context.item?.parent_area, context.item?.location].filter(Boolean).join(' · ') || 'Linked property item'}</Text>
                    </View>
                    <SecondaryButton title="Cancel" disabled={busy} onPress={onClose} />
                </View>

                <View style={closeoutSummaryStyle}>
                    <Text style={closeoutSummaryLabelStyle}>Permanent status</Text>
                    <Text style={closeoutSummaryValueStyle}>Installed</Text>
                    <Text style={mutedStyle}>The job remains the service transaction. This item becomes the permanent equipment record.</Text>
                </View>

                <Text style={legalTitleStyle}>What happened to this item?</Text>
                <View style={mediaActionRowStyle}>
                    {HOME_ITEM_CLOSEOUT_TYPES.map((type) => (
                        <ChoiceButton key={type} selected={draft.completion_type === type} title={type === 'installed' ? 'Installed' : type === 'repaired' ? 'Repaired' : 'Replaced'} onPress={() => onUpdate({ completion_type: type })} />
                    ))}
                </View>

                <Field label="Item name" value={draft.item_name} onChangeText={(item_name) => onUpdate({ item_name })} />
                <Text style={fieldLabelStyle}>Condition</Text>
                <View style={mediaActionRowStyle}>
                    {HOME_ITEM_CONDITIONS.map((condition) => (
                        <ChoiceButton key={condition} selected={draft.condition === condition} title={condition} onPress={() => onUpdate({ condition })} />
                    ))}
                </View>
                <Field label={draft.completion_type === 'repaired' ? 'Original installed on' : 'Installed on'} value={draft.installed_on} onChangeText={(installed_on) => onUpdate({ installed_on })} />
                <Text style={mutedStyle}>Use YYYY-MM-DD. Today is prefilled for installations and replacements.</Text>

                <View style={closeoutTwoColumnStyle}>
                    <View style={closeoutColumnStyle}><Field label="Brand (optional)" value={draft.brand} onChangeText={(brand) => onUpdate({ brand })} /></View>
                    <View style={closeoutColumnStyle}><Field label="Model (optional)" value={draft.model} onChangeText={(model) => onUpdate({ model })} /></View>
                    <View style={closeoutColumnStyle}><Field label="Serial number (optional)" value={draft.serial_number} onChangeText={(serial_number) => onUpdate({ serial_number })} /></View>
                    <View style={closeoutColumnStyle}><Field label="Part number (optional)" value={draft.part_number} onChangeText={(part_number) => onUpdate({ part_number })} /></View>
                </View>
                <Field label="Work performed *" value={draft.work_performed} onChangeText={(work_performed) => onUpdate({ work_performed })} multiline />
                <Field label="Installation / service notes (optional)" value={draft.installation_notes} onChangeText={(installation_notes) => onUpdate({ installation_notes })} multiline />

                <Text style={legalTitleStyle}>Separate warranties</Text>
                {draft.warranties.map((warranty) => (
                    <WarrantyEditor key={warranty.warranty_type} warranty={warranty} warrantyStartDate={draft.completion_date} onUpdate={(patch) => onUpdateWarranty(warranty.warranty_type, patch)} />
                ))}

                <View style={closeoutSummaryStyle}>
                    <Text style={optionTitleStyle}>Permanent attachments</Text>
                    <Text style={bodyStyle}>Photos: {photoCount} attached · Warranty documents: {documentCount} attached</Text>
                    <View style={mediaActionRowStyle}>
                        <SecondaryButton title="Add Warranty Photo" disabled={busy} onPress={onAddPhoto} />
                        <SecondaryButton title="Add Warranty PDF" disabled={busy} onPress={onAddDocument} />
                    </View>
                    <Text style={mutedStyle}>Before, diagnostic, during-work, product, label, and after photos already on this job will follow the item into HomeOS history.</Text>
                </View>

                <PrimaryButton title="Confirm HomeOS Update & Complete Work" disabled={busy || !draft.work_performed.trim()} onPress={onConfirm} />
                <SecondaryButton title="Return to Job" disabled={busy} onPress={onClose} />
            </ScrollView>
        </Modal>
    );
}

function WarrantyEditor({ warranty, warrantyStartDate, onUpdate }: {
    warranty: HomeItemCloseoutWarranty;
    warrantyStartDate: string;
    onUpdate: (patch: Partial<HomeItemCloseoutWarranty>) => void;
}) {
    const title = warranty.warranty_type === 'workmanship'
        ? 'Workmanship Warranty'
        : warranty.warranty_type === 'labor'
            ? 'Labor Warranty'
            : 'Manufacturer / Parts Warranty';

    return (
        <View style={legalDocumentCardStyle}>
            <Text style={optionTitleStyle}>{title}</Text>
            <View style={mediaActionRowStyle}>
                {HOME_ITEM_WARRANTY_CHOICES.map((choice) => (
                    <ChoiceButton
                        key={choice}
                        selected={warranty.coverage_kind === choice}
                        title={warrantyChoiceLabel(choice)}
                        onPress={() => {
                            const next = buildCloseoutWarranty({
                                warrantyType: warranty.warranty_type,
                                choice,
                                startDate: warrantyStartDate,
                                customLabel: warranty.custom_label || '',
                                customExpiration: warranty.expiration_date || '',
                                notes: warranty.notes || '',
                                verified: warranty.verification_status === 'verified',
                            });
                            onUpdate(next);
                        }}
                    />
                ))}
            </View>
            {warranty.coverage_kind === 'custom' && (
                <>
                    <Field label="Custom warranty" value={warranty.custom_label || ''} onChangeText={(custom_label) => onUpdate({ custom_label })} />
                    <Field label="Expiration date (optional)" value={warranty.expiration_date || ''} onChangeText={(expiration_date) => onUpdate({ expiration_date })} />
                </>
            )}
            <Field label="Warranty notes (optional)" value={warranty.notes || ''} onChangeText={(notes) => onUpdate({ notes })} />
            {warranty.warranty_type === 'manufacturer_parts' && warranty.coverage_kind !== 'unknown_verify_later' && (
                <TouchableOpacity style={checkRowStyle} onPress={() => onUpdate({ verification_status: warranty.verification_status === 'verified' ? 'technician_entered' : 'verified' })}>
                    <Text style={checkStyle}>{warranty.verification_status === 'verified' ? '☑' : '☐'}</Text>
                    <Text style={bodyStyle}>Verified from box, manual, warranty card, receipt, or manufacturer information</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

function ChoiceButton({ selected, title, onPress }: { selected: boolean; title: string; onPress: () => void }) {
    return (
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[closeoutChoiceStyle, selected && closeoutChoiceSelectedStyle]}>
            <Text style={[closeoutChoiceTextStyle, selected && closeoutChoiceTextSelectedStyle]}>{title}</Text>
        </TouchableOpacity>
    );
}

function JobRequestCardModal({
    loading,
    message,
    onClose,
    request,
    visible,
}: {
    loading: boolean;
    message: string;
    onClose: () => void;
    request: JobWorkflowRequestCard | null;
    visible: boolean;
}) {
    return (
        <Modal
            animationType="slide"
            onRequestClose={onClose}
            presentationStyle="pageSheet"
            visible={visible}
        >
            <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                style={jobCardModalScreenStyle}
                contentContainerStyle={jobCardModalContentStyle}
            >
                <View style={jobCardModalHeaderStyle}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={eyebrowStyle}>Customer request</Text>
                        <Text style={jobCardModalTitleStyle}>Job Card</Text>
                        <Text style={mutedStyle}>The original information and media sent with this request.</Text>
                    </View>
                    <TouchableOpacity accessibilityRole="button" style={secondaryButtonStyle} onPress={onClose}>
                        <Text style={secondaryButtonTextStyle}>Close</Text>
                    </TouchableOpacity>
                </View>

                {loading && <View style={noticeStyle}><Text style={noticeTextStyle}>Loading job card...</Text></View>}
                {!loading && !!message && <View style={noticeStyle}><Text style={noticeTextStyle}>{message}</Text></View>}

                {!loading && request && (
                    <>
                        <View style={jobCardRequestStyle}>
                            <View style={jobCardReferenceRowStyle}>
                                <Text style={jobCardReferenceStyle}>{getJobRequestReference(request)}</Text>
                                <Text style={jobCardPriorityStyle}>{formatRequestCardLabel(request.priority || 'normal')}</Text>
                            </View>
                            <RequestCardDetail label="Request type" value={formatRequestCardLabel(request.request_type || 'service')} />
                            <RequestCardDetail label="Status" value={formatRequestCardLabel(request.status || 'new')} />
                            <RequestCardDetail label="Submitted" value={formatDate(request.created_at)} />
                            <View style={jobCardIssueStyle}>
                                <Text style={fieldLabelStyle}>Customer description</Text>
                                <Text selectable style={bodyStyle}>
                                    {request.issue_summary || 'No description was included with this request.'}
                                </Text>
                            </View>
                        </View>

                        <ServiceRequestMediaGallery
                            serviceRequestId={request.id}
                            title="Customer photos and videos"
                        />
                    </>
                )}
            </ScrollView>
        </Modal>
    );
}

function RequestCardDetail({ label, value }: { label: string; value: string }) {
    return (
        <View style={jobCardDetailRowStyle}>
            <Text style={mutedStyle}>{label}</Text>
            <Text selectable style={jobCardDetailValueStyle}>{value}</Text>
        </View>
    );
}

function getJobRequestReference(request: JobWorkflowRequestCard) {
    if (request.display_code) return `Request ${request.display_code}`;
    if (request.display_sequence) return `Request A${String(request.display_sequence).padStart(4, '0')}`;
    return 'Customer Request';
}

function formatRequestCardLabel(value: string) {
    return value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

function JobLegalDocumentsPanel(props: {
    documents: CompanyLegalDocument[];
    inputs: Record<string, { customerName: string; signature: string }>;
    defaultCustomerName: string;
    busy: boolean;
    onChange: (templateId: string, patch: Partial<{ customerName: string; signature: string }>) => void;
    onSave: (document: CompanyLegalDocument) => Promise<void>;
}) {
    return (
        <Section
            title="Required company documents"
            subtitle="Complete the company-configured documents for this job stage. Each saved copy is permanently attached to this job revision."
        >
            {props.documents.map((document) => {
                const input = props.inputs[document.template_id] || { customerName: '', signature: '' };
                const customerName = input.customerName || props.defaultCustomerName;
                const needsName = document.requires_customer_printed_name || document.requires_customer_signature;
                const ready = (!needsName || Boolean(customerName.trim()))
                    && (!document.requires_customer_signature || isDrawnSignature(input.signature));

                return (
                    <View key={document.template_id} style={legalDocumentCardStyle}>
                        <View style={legalDocumentHeaderStyle}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={legalTitleStyle}>{document.title}</Text>
                                <Text style={mutedStyle}>Company revision {document.revision_number}</Text>
                            </View>
                            {document.blocks_progression && (
                                <Text style={requiredPillStyle}>Required</Text>
                            )}
                        </View>
                        <Text style={bodyStyle}>{document.body}</Text>
                        {document.auto_record_datetime && (
                            <Text style={mutedStyle}>The date and time will be recorded automatically.</Text>
                        )}
                        {needsName && (
                            <Field
                                label="Customer full name"
                                value={customerName}
                                onChangeText={(value) => props.onChange(document.template_id, { customerName: value })}
                            />
                        )}
                        {document.requires_customer_signature && (
                            <SignaturePad
                                label="Customer signature"
                                value={input.signature}
                                onChange={(signature) => props.onChange(document.template_id, { signature })}
                            />
                        )}
                        <PrimaryButton
                            title={document.requires_customer_signature ? 'Sign & Save Document' : 'Record Document'}
                            disabled={props.busy || !ready}
                            onPress={() => void props.onSave(document)}
                        />
                    </View>
                );
            })}
        </Section>
    );
}

function JobWorkflowDatePicker({
    selectedDate,
    calendarMonth,
    minimumDate,
    onSelectDate,
    onChangeMonth,
}: {
    selectedDate: string;
    calendarMonth: string;
    minimumDate: string;
    onSelectDate: (date: string) => void;
    onChangeMonth: (month: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const monthDate = new Date(`${calendarMonth || selectedDate.slice(0, 7)}-01T12:00:00`);
    const monthTitle = Number.isNaN(monthDate.getTime())
        ? 'Choose Date'
        : monthDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

    return (
        <View style={appointmentFieldStyle}>
            <Text style={fieldLabelStyle}>Appointment date</Text>
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${formatJobWorkflowScheduleDate(selectedDate)}. Open calendar.`}
                onPress={() => setOpen((current) => !current)}
                style={appointmentSelectStyle}
            >
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={appointmentSelectValueStyle}>{formatJobWorkflowScheduleDate(selectedDate)}</Text>
                    <Text style={appointmentSelectHintStyle}>{selectedDate || 'No date selected'}</Text>
                </View>
                <Text style={appointmentChevronStyle}>{open ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {open && (
                <View style={calendarPanelStyle}>
                    <View style={calendarHeaderStyle}>
                        <SecondaryButton
                            title="Previous"
                            onPress={() => onChangeMonth(changeJobWorkflowCalendarMonth(calendarMonth, -1))}
                        />
                        <Text style={calendarMonthTitleStyle}>{monthTitle}</Text>
                        <SecondaryButton
                            title="Next"
                            onPress={() => onChangeMonth(changeJobWorkflowCalendarMonth(calendarMonth, 1))}
                        />
                    </View>
                    <View style={calendarGridStyle}>
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday) => (
                            <Text key={weekday} style={calendarWeekdayStyle}>{weekday}</Text>
                        ))}
                        {getJobWorkflowCalendarDays(calendarMonth).map((day) => {
                            const selected = day.dateText === selectedDate;
                            const disabled = day.dateText < minimumDate;

                            return (
                                <TouchableOpacity
                                    key={day.dateText}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected, disabled }}
                                    disabled={disabled}
                                    onPress={() => {
                                        onSelectDate(day.dateText);
                                        setOpen(false);
                                    }}
                                    style={[
                                        calendarDayStyle,
                                        selected && calendarDaySelectedStyle,
                                        !day.inCurrentMonth && calendarDayOutsideStyle,
                                        disabled && disabledStyle,
                                    ]}
                                >
                                    <Text style={[calendarDayTextStyle, selected && calendarDayTextSelectedStyle]}>{day.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            )}
        </View>
    );
}

function JobWorkflowTimePicker({ value, onSelect }: { value: string; onSelect: (value: string) => void }) {
    const [open, setOpen] = useState(false);

    return (
        <View style={appointmentFieldStyle}>
            <Text style={fieldLabelStyle}>Appointment time</Text>
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${formatJobWorkflowScheduleTime(value)}. Open time choices.`}
                onPress={() => setOpen((current) => !current)}
                style={appointmentSelectStyle}
            >
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={appointmentSelectValueStyle}>{formatJobWorkflowScheduleTime(value)}</Text>
                    <Text style={appointmentSelectHintStyle}>30-minute choices</Text>
                </View>
                <Text style={appointmentChevronStyle}>{open ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {open && (
                <View style={appointmentTimeGridStyle}>
                    {JOB_WORKFLOW_TIME_OPTIONS.map((option) => {
                        const selected = option.value === value;

                        return (
                            <TouchableOpacity
                                key={option.value}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                onPress={() => {
                                    onSelect(option.value);
                                    setOpen(false);
                                }}
                                style={[appointmentTimeOptionStyle, selected && appointmentTimeOptionSelectedStyle]}
                            >
                                <Text style={[appointmentTimeTextStyle, selected && appointmentTimeTextSelectedStyle]}>{option.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}
        </View>
    );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
    return <View style={sectionStyle}><Text style={sectionTitleStyle}>{title}</Text><Text style={mutedStyle}>{subtitle}</Text>{children}</View>;
}
function CustomerSelectionList({ selections }: { selections?: string[] }) {
    if (!selections?.length) return null;

    return (
        <View style={customerSelectionListStyle}>
            <Text style={customerSelectionTitleStyle}>Selected equipment and site details</Text>
            {selections.map((selection) => (
                <Text key={selection} style={customerSelectionTextStyle}>• {selection}</Text>
            ))}
        </View>
    );
}
function Field(props: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; disabled?: boolean }) {
    return <View><Text style={fieldLabelStyle}>{props.label}</Text><DictationTextInput {...props} editable={!props.disabled} style={[inputStyle, props.multiline && textAreaStyle, props.disabled && disabledStyle]} placeholderTextColor="#7391a5" /></View>;
}
function WorkflowCheck({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
    return (
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked }} style={checkRowStyle} onPress={onPress}>
            <Text style={checkStyle}>{checked ? '☑' : '☐'}</Text>
            <Text style={bodyStyle}>{label}</Text>
        </TouchableOpacity>
    );
}
function TimingChoice({
    title,
    description,
    selected,
    disabled,
    onPress,
}: {
    title: string;
    description: string;
    selected: boolean;
    disabled?: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !!disabled }}
            disabled={disabled}
            onPress={onPress}
            style={[timingChoiceStyle, selected && timingChoiceSelectedStyle, disabled && disabledStyle]}
        >
            <View style={timingChoiceHeaderStyle}>
                <Text style={[optionTitleStyle, timingChoiceTitleStyle]}>{title}</Text>
                <Text style={[timingChoiceStatusStyle, selected && timingChoiceStatusSelectedStyle]}>
                    {selected ? 'Selected' : 'Choose'}
                </Text>
            </View>
            <Text style={mutedStyle}>{description}</Text>
        </TouchableOpacity>
    );
}
function SchedulingReasonChoice({
    title,
    selected,
    disabled,
    onPress,
}: {
    title: string;
    selected: boolean;
    disabled?: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !!disabled }}
            disabled={disabled}
            onPress={onPress}
            style={[schedulingReasonChoiceStyle, selected && schedulingReasonChoiceSelectedStyle, disabled && disabledStyle]}
        >
            <Text style={[schedulingReasonChoiceTextStyle, selected && schedulingReasonChoiceTextSelectedStyle]}>
                {selected ? '●' : '○'} {title}
            </Text>
        </TouchableOpacity>
    );
}
function PrimaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
    return <TouchableOpacity onPress={onPress} disabled={disabled} style={[primaryButtonStyle, disabled && disabledStyle]}><Text style={primaryButtonTextStyle}>{title}</Text></TouchableOpacity>;
}
function SecondaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
    return <TouchableOpacity accessibilityRole="button" onPress={onPress} disabled={disabled} style={[secondaryButtonStyle, disabled && disabledStyle]}><Text style={secondaryButtonTextStyle}>{title}</Text></TouchableOpacity>;
}
function MediaActions({
    label,
    count = 0,
    disabled,
    onTakePhoto,
    onRecordVideo,
    onAddFromLibrary,
}: {
    label: string;
    count?: number;
    disabled?: boolean;
    onTakePhoto: () => void;
    onRecordVideo: () => void;
    onAddFromLibrary: () => void;
}) {
    return (
        <View style={mediaActionsStyle}>
            <View style={mediaActionsHeaderStyle}>
                <Text style={optionTitleStyle}>{label}</Text>
                <Text style={mediaCountStyle}>{count ? `${count} saved` : 'Nothing saved yet'}</Text>
            </View>
            <Text style={mutedStyle}>Take more photos or videos whenever needed, or select a full batch from your library.</Text>
            <View style={mediaActionRowStyle}>
                <MediaActionButton title="Take Photo" disabled={disabled} onPress={onTakePhoto} />
                <MediaActionButton title="Record Video" disabled={disabled} onPress={onRecordVideo} />
                <MediaActionButton title="Add From Library" disabled={disabled} onPress={onAddFromLibrary} />
            </View>
        </View>
    );
}
function MediaActionButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
    return <TouchableOpacity onPress={onPress} disabled={disabled} style={[mediaActionButtonStyle, disabled && disabledStyle]}><Text style={mediaActionButtonTextStyle}>{title}</Text></TouchableOpacity>;
}
function JobMediaList({
    attachments,
    onOpen,
}: {
    attachments: JobWorkflowAttachment[];
    onOpen: (attachment: JobWorkflowAttachment) => void;
}) {
    if (attachments.length === 0) return null;

    return (
        <View style={jobMediaListStyle}>
            <Text style={fieldLabelStyle}>Saved handoff media</Text>
            {attachments.map((attachment, index) => (
                <TouchableOpacity
                    key={attachment.id}
                    style={jobMediaRowStyle}
                    onPress={() => onOpen(attachment)}
                >
                    <Text style={jobMediaNameStyle} numberOfLines={2}>
                        {index + 1}. {attachment.file_name}
                    </Text>
                    <Text style={jobMediaOpenStyle}>Open</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}
function actionMessage(action: string) {
    return ({
        accept_quote: 'Quote accepted and job sold.',
        choose_now: 'Work-now workflow started.',
        choose_later: 'Return visit scheduled.',
        confirm_prework: 'Work started.',
        start_store_trip: 'Store run started. Add receipt and purchased-parts media when you arrive.',
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
const jobCardModalScreenStyle = { flex: 1, backgroundColor: '#071924' } as const;
const jobCardModalContentStyle = { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, gap: 14, paddingBottom: 50 } as const;
const jobCardModalHeaderStyle = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 } as const;
const jobCardModalTitleStyle = { color: '#f2fbff', fontSize: 28, fontWeight: '900', marginTop: 4 } as const;
const jobCardRequestStyle = { backgroundColor: '#0d2a3a', borderColor: '#24536b', borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 } as const;
const jobCardReferenceRowStyle = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 } as const;
const jobCardReferenceStyle = { color: '#67e8f9', fontSize: 18, fontWeight: '900' } as const;
const jobCardPriorityStyle = { color: '#092c2c', backgroundColor: '#72e2c7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: '900', overflow: 'hidden' } as const;
const jobCardDetailRowStyle = { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, borderBottomColor: '#24536b', borderBottomWidth: 1, paddingBottom: 10 } as const;
const jobCardDetailValueStyle = { color: '#f2fbff', fontSize: 13, fontWeight: '800', textAlign: 'right' } as const;
const jobCardIssueStyle = { backgroundColor: '#071d29', borderColor: '#315c70', borderWidth: 1, borderRadius: 12, padding: 14, gap: 5 } as const;
const eyebrowStyle = { color: '#49d6d0', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 } as const;
const titleStyle = { color: '#f2fbff', fontSize: 28, fontWeight: '900', marginTop: 4 } as const;
const quoteNumberStyle = { color: '#67e8f9', fontSize: 15, fontWeight: '900', letterSpacing: 0.4, marginTop: 8 } as const;
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
const selectionGroupPillStyle = { alignSelf: 'flex-start', backgroundColor: '#173f55', borderRadius: 999, color: '#d8f8ff', fontSize: 11, fontWeight: '900', paddingHorizontal: 9, paddingVertical: 5 } as const;
const customerSelectionListStyle = { backgroundColor: '#102432', borderColor: '#315c70', borderWidth: 1, borderRadius: 10, padding: 11, gap: 5 } as const;
const customerSelectionTitleStyle = { color: '#d8f8ff', fontSize: 13, fontWeight: '900' } as const;
const customerSelectionTextStyle = { color: '#bdd2dc', fontSize: 12, lineHeight: 18 } as const;
const legalTitleStyle = { color: '#f2fbff', fontSize: 17, fontWeight: '900', marginTop: 8 } as const;
const legalDocumentCardStyle = { backgroundColor: '#102432', borderColor: '#3D7183', borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 } as const;
const legalDocumentHeaderStyle = { flexDirection: 'row', alignItems: 'flex-start', gap: 10 } as const;
const requiredPillStyle = { color: '#092C2C', backgroundColor: '#72E2C7', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '900', overflow: 'hidden' } as const;
const checkRowStyle = { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 } as const;
const checkStyle = { color: '#52e0a4', fontSize: 24 } as const;
const fieldLabelStyle = { color: '#bdd2dc', fontSize: 13, fontWeight: '700', marginBottom: 5 } as const;
const inputStyle = { borderColor: '#315c70', borderWidth: 1, borderRadius: 10, backgroundColor: '#071d29', color: '#f2fbff', padding: 12, fontSize: 15 } as const;
const textAreaStyle = { minHeight: 90, textAlignVertical: 'top' } as const;
const primaryButtonStyle = { backgroundColor: '#10a8a2', borderRadius: 11, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' } as const;
const primaryButtonTextStyle = { color: '#02151c', fontSize: 14, fontWeight: '900' } as const;
const secondaryButtonStyle = { borderColor: '#3b7188', borderWidth: 1, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' } as const;
const secondaryButtonTextStyle = { color: '#d8f8ff', fontSize: 14, fontWeight: '800' } as const;
const mediaActionsStyle = { backgroundColor: '#0a2230', borderColor: '#315c70', borderWidth: 1, borderRadius: 12, padding: 12, gap: 9 } as const;
const mediaActionsHeaderStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 } as const;
const mediaCountStyle = { color: '#5ce5df', fontSize: 12, fontWeight: '800' } as const;
const mediaActionRowStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as const;
const mediaActionButtonStyle = { flexGrow: 1, minWidth: 110, borderColor: '#3b7188', borderWidth: 1, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center' } as const;
const mediaActionButtonTextStyle = { color: '#d8f8ff', fontSize: 12, fontWeight: '800' } as const;
const handoffSummaryStyle = { backgroundColor: '#102432', borderColor: '#315c70', borderWidth: 1, borderRadius: 12, padding: 14, gap: 7 } as const;
const jobMediaListStyle = { gap: 8 } as const;
const jobMediaRowStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#071d29', borderColor: '#315c70', borderWidth: 1, borderRadius: 10, padding: 12 } as const;
const jobMediaNameStyle = { color: '#d8eaf2', fontSize: 13, fontWeight: '700', flex: 1 } as const;
const jobMediaOpenStyle = { color: '#5ce5df', fontSize: 13, fontWeight: '900' } as const;
const disabledStyle = { opacity: 0.5 } as const;
const timelineStyle = { borderLeftColor: '#35aaa5', borderLeftWidth: 3, paddingLeft: 12, gap: 3 } as const;
const totalStyle = { backgroundColor: '#123b35', borderColor: '#45d893', borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } as const;
const totalAmountStyle = { color: '#52e0a4', fontSize: 24, fontWeight: '900' } as const;
const policyExplanationStyle = { backgroundColor: '#102432', borderColor: '#315c70', borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 } as const;
const timingInstructionStyle = { color: '#d9ffff', backgroundColor: '#123d48', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: '800' } as const;
const timingChoiceGridStyle = { gap: 10 } as const;
const timingChoiceStyle = { backgroundColor: '#102432', borderColor: '#315c70', borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 } as const;
const timingChoiceSelectedStyle = { backgroundColor: '#15372f', borderColor: '#45d893', borderWidth: 2 } as const;
const timingChoiceHeaderStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 } as const;
const timingChoiceTitleStyle = { flex: 1 } as const;
const timingChoiceStatusStyle = { color: '#bdd2dc', backgroundColor: '#173f55', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: '900', overflow: 'hidden' } as const;
const timingChoiceStatusSelectedStyle = { color: '#092c2c', backgroundColor: '#72e2c7' } as const;
const sameDayCardStyle = { backgroundColor: '#15372f', borderColor: '#45d893', borderWidth: 1, borderRadius: 12, padding: 14, gap: 11 } as const;
const laterVisitCardStyle = { backgroundColor: '#15372f', borderColor: '#45d893', borderWidth: 1, borderRadius: 12, padding: 14, gap: 11 } as const;
const appointmentPanelStyle = { backgroundColor: '#0a2230', borderColor: '#315c70', borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 } as const;
const appointmentHeaderStyle = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 } as const;
const appointmentFieldStyle = { gap: 6 } as const;
const appointmentSelectStyle = { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderColor: '#3b7188', borderWidth: 1, borderRadius: 11, backgroundColor: '#071d29', paddingVertical: 10, paddingHorizontal: 12 } as const;
const appointmentSelectValueStyle = { color: '#f2fbff', fontSize: 15, fontWeight: '900' } as const;
const appointmentSelectHintStyle = { color: '#93adba', fontSize: 11, marginTop: 2 } as const;
const appointmentChevronStyle = { color: '#5ce5df', fontSize: 13, fontWeight: '900' } as const;
const calendarPanelStyle = { borderColor: '#315c70', borderWidth: 1, borderRadius: 12, backgroundColor: '#071d29', padding: 10, gap: 10 } as const;
const calendarHeaderStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as const;
const calendarMonthTitleStyle = { color: '#f2fbff', fontSize: 14, fontWeight: '900', flex: 1, textAlign: 'center' } as const;
const calendarGridStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'space-between' } as const;
const calendarWeekdayStyle = { color: '#93adba', width: '13%', textAlign: 'center', fontSize: 10, fontWeight: '800', paddingVertical: 4 } as const;
const calendarDayStyle = { width: '13%', minHeight: 34, borderColor: '#315c70', borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' } as const;
const calendarDaySelectedStyle = { backgroundColor: '#10a8a2', borderColor: '#72e2c7' } as const;
const calendarDayOutsideStyle = { opacity: 0.55 } as const;
const calendarDayTextStyle = { color: '#d8eaf2', fontSize: 12, fontWeight: '800' } as const;
const calendarDayTextSelectedStyle = { color: '#02151c' } as const;
const appointmentTimeGridStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 7 } as const;
const appointmentTimeOptionStyle = { flexBasis: 108, flexGrow: 1, borderColor: '#315c70', borderWidth: 1, borderRadius: 9, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 8 } as const;
const appointmentTimeOptionSelectedStyle = { backgroundColor: '#10a8a2', borderColor: '#72e2c7' } as const;
const appointmentTimeTextStyle = { color: '#d8eaf2', fontSize: 12, fontWeight: '800' } as const;
const appointmentTimeTextSelectedStyle = { color: '#02151c' } as const;
const schedulingReasonGridStyle = { gap: 8 } as const;
const schedulingReasonChoiceStyle = { borderColor: '#3b7188', borderWidth: 1, borderRadius: 11, backgroundColor: '#071d29', paddingVertical: 11, paddingHorizontal: 13 } as const;
const schedulingReasonChoiceSelectedStyle = { borderColor: '#72e2c7', backgroundColor: '#15372f' } as const;
const schedulingReasonChoiceTextStyle = { color: '#d8f8ff', fontSize: 13, fontWeight: '800' } as const;
const schedulingReasonChoiceTextSelectedStyle = { color: '#72e2c7' } as const;
const schedulingSelectionStyle = { color: '#d9ffff', backgroundColor: '#123d48', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: '800' } as const;
const schedulingPendingStyle = { color: '#092c2c', backgroundColor: '#72e2c7', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: '900', textAlign: 'center' } as const;
const completionAcknowledgementStyle = { backgroundColor: '#123b35', borderColor: '#45d893', borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 } as const;
const twoButtonRowStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' } as const;
const closeoutSummaryStyle = { backgroundColor: '#102432', borderColor: '#45d893', borderWidth: 1, borderRadius: 14, padding: 14, gap: 7 } as const;
const closeoutSummaryLabelStyle = { color: '#93adba', fontSize: 12, fontWeight: '800' } as const;
const closeoutSummaryValueStyle = { color: '#72e2c7', fontSize: 22, fontWeight: '900' } as const;
const closeoutTwoColumnStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 12 } as const;
const closeoutColumnStyle = { flexBasis: 250, flexGrow: 1 } as const;
const closeoutChoiceStyle = { borderColor: '#3b7188', borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#071d29' } as const;
const closeoutChoiceSelectedStyle = { borderColor: '#72e2c7', backgroundColor: '#15372f' } as const;
const closeoutChoiceTextStyle = { color: '#d8eaf2', fontSize: 12, fontWeight: '800' } as const;
const closeoutChoiceTextSelectedStyle = { color: '#72e2c7' } as const;
