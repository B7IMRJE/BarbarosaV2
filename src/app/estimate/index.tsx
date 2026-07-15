import HomeHeader from '../../components/HomeHeader';

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
    buildApprovedAiReferenceContext,
    buildEstimateOptionWorkspace,
    formatMoney,
    getEstimateCategoryTemplate,
    inferEstimateCategoryFromDraft,
    isAnswerComplete,
    toHomeownerPresentationChoice,
    validateAiEstimateDraftResponse,
    type AiEstimateDraftChoice,
    type EstimateAnswerSet,
    type EstimateChoice as Phase1EstimateChoice,
    type EstimateOptionCategory,
    type EstimateQuestionDefinition,
} from '../../lib/estimateOptions';
import {
    loadCompanyPriceBook,
    type CompanyPriceBookItem,
} from '../../lib/companyPriceBook';
import {
    canUseCompanyEstimateWorkflow,
    loadCurrentCompanyEstimateAccess,
    type CompanyPermissionAccess,
} from '../../lib/companyPermissions';
import {
    EstimateDraftItem,
    EstimateDraftContext,
    loadEstimateDraftContext,
    loadEstimateDraft,
    removeItemFromEstimateDraft,
    saveEstimateDraftContext,
} from '../../lib/estimateDraft';
import {
    buildDraftEstimateOptionsRequest,
    resolveEstimateOptionSession,
    type EstimateOptionSession,
    type EstimateSessionSource,
} from '../../lib/estimateSessions';
import {
    hasProviderModeRouteSignal,
    providerModeItemPath,
    providerModePath,
    readProviderModeParams,
    validateProviderModeAccess,
} from '../../lib/providerMode';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../lib/supabase';
import { getProviderReturnActionLabel } from '../../lib/techosClientAccess';

const estimateFoundationSections = [
    {
        title: 'Findings',
        description: 'No findings added yet.',
    },
    {
        title: 'Recommended Work',
        description: 'Recommended repairs or replacements will be written here before customer review.',
    },
    {
        title: 'Price Book / Approved Catalog',
        description: 'Pricing setup is required before homeowner choices can be presented.',
    },
];

type EditableChoiceCopy = {
    title: string;
    shortSummary: string;
    homeownerExplanation: string;
};

export default function EstimateScreen() {
    const { companyId, propertyId, mode, providerMode, returnTo, serviceRequestId, scheduleSlotId, jobId } = useLocalSearchParams<{
        companyId?: string | string[];
        propertyId?: string | string[];
        mode?: string | string[];
        providerMode?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const requestedCompanyId = firstParam(companyId);
    const requestedPropertyId = firstParam(propertyId);
    const requestedMode = firstParam(mode);
    const requestedReturnTo = firstParam(returnTo);
    const providerRouteParams = {
        providerMode,
        companyId,
        propertyId,
        returnTo,
        serviceRequestId,
        scheduleSlotId,
        jobId,
    };
    const providerModeContext = readProviderModeParams(providerRouteParams);
    const providerContextIncomplete = hasProviderModeRouteSignal(providerRouteParams) && !providerModeContext;
    const [items, setItems] = useState<EstimateDraftItem[]>([]);
    const [message, setMessage] = useState('Loading estimate draft...');
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [estimateAccess, setEstimateAccess] = useState<CompanyPermissionAccess | null>(null);
    const [draftContext, setDraftContext] = useState<EstimateDraftContext | null>(null);
    const [estimateSession, setEstimateSession] = useState<EstimateOptionSession | null>(null);
    const [selectedChoiceId, setSelectedChoiceId] = useState('');
    const [priceBookItems, setPriceBookItems] = useState<CompanyPriceBookItem[]>([]);
    const [priceBookMessage, setPriceBookMessage] = useState('Price book loading...');
    const [selectedCategory, setSelectedCategory] = useState<EstimateOptionCategory>('faucet_replacement');
    const [answers, setAnswers] = useState<EstimateAnswerSet>({});
    const [technicianApproved, setTechnicianApproved] = useState(false);
    const [presentationMode, setPresentationMode] = useState(false);
    const [aiDrafting, setAiDrafting] = useState(false);
    const [aiValidationErrors, setAiValidationErrors] = useState<string[]>([]);
    const [aiDraftsByChoiceId, setAiDraftsByChoiceId] = useState<Record<string, AiEstimateDraftChoice>>({});
    const [editableCopyByChoiceId, setEditableCopyByChoiceId] = useState<Record<string, EditableChoiceCopy>>({});

    useEffect(() => {
        void checkAccess();
    }, [
        requestedCompanyId,
        requestedPropertyId,
        providerContextIncomplete,
        providerModeContext?.providerMode,
        providerModeContext?.companyId,
        providerModeContext?.propertyId,
        providerModeContext?.serviceRequestId,
        providerModeContext?.scheduleSlotId,
        providerModeContext?.jobId,
    ]);

    async function checkAccess() {
        setCheckingAccess(true);
        setEstimateAccess(null);
        setDraftContext(null);
        setEstimateSession(null);
        setItems([]);
        setPriceBookItems([]);
        setPriceBookMessage('Price book loading...');
        setTechnicianApproved(false);
        setPresentationMode(false);
        setAiValidationErrors([]);
        setAiDraftsByChoiceId({});
        setEditableCopyByChoiceId({});
        setMessage('Loading estimate draft...');

        if (providerContextIncomplete) {
            setCheckingAccess(false);
            setMessage('Provider context is incomplete. Use Back to Current Job and reopen the estimate from the assigned job.');
            return;
        }

        if (providerModeContext) {
            const providerAccess = await validateProviderModeAccess(
                providerModeContext.companyId,
                providerModeContext.propertyId
            );

            if (!providerAccess.access) {
                setCheckingAccess(false);
                setMessage(providerAccess.error || 'Provider mode access could not be confirmed.');
                return;
            }

            if (!canUseCompanyEstimateWorkflow(providerAccess.access)) {
                setCheckingAccess(false);
                setMessage('This work account is not authorized to create estimates for this company.');
                return;
            }

            const access: CompanyPermissionAccess = {
                userId: providerAccess.access.userId,
                companyUserId: providerAccess.access.companyUserId,
                companyId: providerAccess.access.companyId,
                role: providerAccess.access.role,
                status: providerAccess.access.status,
                permissions: providerAccess.access.permissions,
            };

            setEstimateAccess(access);
            setCheckingAccess(false);
            await loadDraft(access);
            return;
        }

        const permission = await loadCurrentCompanyEstimateAccess({
            companyId: requestedCompanyId,
        });

        if (!permission.access) {
            setEstimateAccess(null);
            setCheckingAccess(false);
            setMessage(permission.error || 'This work account is not authorized to create estimates for this company.');
            return;
        }

        setEstimateAccess(permission.access);
        setCheckingAccess(false);
        await loadDraft(permission.access);
    }

    async function loadDraft(access: CompanyPermissionAccess) {
        const scope = {
            userId: access.userId,
            companyId: access.companyId,
            propertyId: requestedPropertyId,
        };
        const [draftItems, nextDraftContext] = await Promise.all([
            loadEstimateDraft(scope),
            loadEstimateDraftContext(scope),
        ]);
        const inferredCategory = inferEstimateCategoryFromDraft(draftItems, nextDraftContext);

        setItems(draftItems);
        setDraftContext(nextDraftContext);
        setEstimateSession(null);
        setSelectedCategory(inferredCategory);
        setAnswers({});
        setTechnicianApproved(false);
        setPresentationMode(false);
        setAiValidationErrors([]);
        setAiDraftsByChoiceId({});
        setEditableCopyByChoiceId({});
        setMessage(providerModeContext && draftItems.length === 0 && !nextDraftContext
            ? 'No provider estimate draft found.'
            : ''
        );

        try {
            const priceBook = await loadCompanyPriceBook(access.companyId);

            setPriceBookItems(priceBook.items);
            setPriceBookMessage(priceBook.backendStatus.message);
        } catch (error) {
            setPriceBookItems([]);
            setPriceBookMessage(`Price book unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async function removeItem(id: string) {
        if (!estimateAccess) return;

        const nextItems = await removeItemFromEstimateDraft(id, {
            userId: estimateAccess.userId,
            companyId: estimateAccess.companyId,
            propertyId: requestedPropertyId,
        });

        setItems(nextItems);
        if (!buildEstimateOptionWorkspace({
            companyId: estimateAccess.companyId,
            draftItems: nextItems,
            draftContext,
            category: selectedCategory,
            answers,
            priceBookItems,
            technicianApproved,
            aiValidationFailed: aiValidationErrors.length > 0,
        }).choices.some((choice) => choice.id === selectedChoiceId)) {
            setSelectedChoiceId('');
        }
        setSelectedCategory(inferEstimateCategoryFromDraft(nextItems, draftContext));
        setTechnicianApproved(false);
        setPresentationMode(false);
        setMessage('Item removed from estimate.');
    }

    function selectChoice(choice: Phase1EstimateChoice) {
        setSelectedChoiceId(choice.id);
        setMessage(`${choice.title} selected for technician review.`);
    }

    function viewChoiceDetails(choice: Phase1EstimateChoice) {
        setSelectedChoiceId(choice.id);
        setMessage(`${choice.title} includes ${choice.pricingResult.lineItems.map((line) => line.name).join(', ')}.`);
    }

    function providerClientHomeOsPath() {
        if (!providerModeContext) return '/';

        return String(providerModePath('/', providerModeContext));
    }

    function providerCompanyDashboardPath() {
        if (!providerModeContext) return '/super-admin';

        return `/super-admin/company/${encodeURIComponent(providerModeContext.companyId)}`;
    }

    function goBackToItem() {
        if (requestedReturnTo) {
            router.push(requestedReturnTo as never);
            return;
        }

        if (items[0]) {
            openDraftItem(items[0]);
            return;
        }

        router.push(providerClientHomeOsPath() as never);
    }

    function goBackToClientHomeOs() {
        router.push(providerClientHomeOsPath() as never);
    }

    function goToCompanyDashboard() {
        router.push(providerCompanyDashboardPath() as never);
    }

    function openDraftItem(item: EstimateDraftItem) {
        const itemSlug = item.item_slug;
        const routeCompanyId = item.company_id || estimateAccess?.companyId || requestedCompanyId || '';
        const routePropertyId = item.property_id || requestedPropertyId || '';
        const queryParams = new URLSearchParams();

        if (providerModeContext) {
            router.push(providerModeItemPath(itemSlug, providerModeContext) as never);
            return;
        }

        if (routeCompanyId) queryParams.set('companyId', routeCompanyId);
        if (routePropertyId) queryParams.set('propertyId', routePropertyId);

        if (requestedMode === 'management' || (routeCompanyId && routePropertyId)) {
            queryParams.set('mode', 'management');
        }

        const queryString = queryParams.toString();
        const itemRoute = `/item/${encodeURIComponent(itemSlug)}${queryString ? `?${queryString}` : ''}`;

        router.push(itemRoute as never);
    }

    function updateAnswer(question: EstimateQuestionDefinition, value: string | number | boolean) {
        setTechnicianApproved(false);
        setPresentationMode(false);
        setAnswers((current) => ({
            ...current,
            [question.id]: value,
        }));
    }

    function toggleMultiAnswer(question: EstimateQuestionDefinition, value: string) {
        setTechnicianApproved(false);
        setPresentationMode(false);
        setAnswers((current) => {
            const currentValues = Array.isArray(current[question.id]) ? current[question.id] as string[] : [];
            const nextValues = currentValues.includes(value)
                ? currentValues.filter((entry) => entry !== value)
                : [...currentValues, value];

            return {
                ...current,
                [question.id]: nextValues,
            };
        });
    }

    function markRequirementComplete(key: string) {
        setTechnicianApproved(false);
        setPresentationMode(false);
        setAnswers((current) => ({
            ...current,
            [key]: true,
        }));
    }

    function updateChoiceCopy(choiceId: string, field: keyof EditableChoiceCopy, value: string) {
        setTechnicianApproved(false);
        setPresentationMode(false);
        setEditableCopyByChoiceId((current) => {
            const currentCopy = current[choiceId] || {
                title: '',
                shortSummary: '',
                homeownerExplanation: '',
            };

            return {
                ...current,
                [choiceId]: {
                    ...currentCopy,
                    [field]: value,
                },
            };
        });
    }

    function approveForPresentation(workspaceChoices: Phase1EstimateChoice[]) {
        if (workspaceChoices.length === 0) {
            setMessage('Pricing setup required before presentation.');
            return;
        }

        setTechnicianApproved(true);
        setMessage('Technician review marked complete.');
    }

    async function resolveSessionForDraft(category: EstimateOptionCategory) {
        if (!estimateAccess) return null;

        const primaryItem = items[0] || null;
        const source = resolveEstimateSessionSource(providerModeContext ? 'provider_mode' : draftContext?.source || requestedMode);
        const propertyId =
            providerModeContext?.propertyId ||
            draftContext?.property_id ||
            requestedPropertyId ||
            primaryItem?.property_id ||
            null;
        const result = await resolveEstimateOptionSession({
            sessionId: estimateSession?.id || draftContext?.estimate_session_id || null,
            companyId: estimateAccess.companyId,
            propertyId,
            serviceRequestId: providerModeContext?.serviceRequestId || draftContext?.service_request_id || null,
            jobId: providerModeContext?.jobId || draftContext?.job_id || null,
            scheduleSlotId: providerModeContext?.scheduleSlotId || draftContext?.schedule_slot_id || null,
            homeItemId: primaryItem?.id || null,
            category,
            source,
        });

        if (!result.session) {
            setMessage(`Estimate session unavailable: ${result.error || 'Session could not be resolved.'}`);
            return null;
        }

        setEstimateSession(result.session);

        const nextDraftContext: EstimateDraftContext = {
            estimate_session_id: result.session.id,
            company_id: result.session.companyId,
            property_id: result.session.propertyId,
            customer_home_name: draftContext?.customer_home_name || primaryItem?.customer_home_name || null,
            service_request_id: result.session.serviceRequestId,
            job_id: result.session.jobId,
            schedule_slot_id: result.session.scheduleSlotId,
            technician_company_user_id: draftContext?.technician_company_user_id || estimateAccess.companyUserId || null,
            technician_name: draftContext?.technician_name || null,
            issue_summary: draftContext?.issue_summary || null,
            source: result.session.source,
            updated_at: new Date().toISOString(),
        };

        setDraftContext(nextDraftContext);
        await saveEstimateDraftContext(nextDraftContext, {
            userId: estimateAccess.userId,
            companyId: estimateAccess.companyId,
            propertyId: result.session.propertyId,
        });

        return result.session;
    }

    async function draftWithAi(workspaceChoices: Phase1EstimateChoice[]) {
        if (!estimateAccess) return;

        if (workspaceChoices.length < 2) {
            setMessage('At least two deterministic priced options are required before AI drafting.');
            return;
        }

        setAiDrafting(true);
        setAiValidationErrors([]);
        setMessage('Drafting option copy...');

        try {
            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();

            if (sessionError || !session) {
                setMessage(`AI drafting unavailable: ${sessionError?.message || 'Sign in again.'}`);
                return;
            }

            const resolvedSession = await resolveSessionForDraft(selectedCategory);

            if (!resolvedSession) {
                return;
            }

            const referenceContext = buildApprovedAiReferenceContext(workspaceChoices);
            const payload = buildDraftEstimateOptionsRequest(resolvedSession.id, {
                homeowner_preferred_first_name: readPreferredFirstName(draftContext),
                answered_questions: answers,
                technician_notes: draftContext?.issue_summary || '',
                approved_product_candidates: referenceContext.productIds.map((id) => ({ id, label: labelForReference(id, workspaceChoices) })),
                approved_scope_combinations: referenceContext.scopeIds.map((id) => ({ id, label: labelForReference(id, workspaceChoices) })),
                deterministic_price_results: workspaceChoices.map((choice) => ({
                    id: choice.pricingResult.id,
                    choice_id: choice.id,
                    kind: choice.kind,
                    total_amount: choice.pricingResult.totalAmount,
                    scope_ids: choice.scopeIds,
                    product_ids: choice.productIds,
                    warranty_ids: choice.warrantyIds,
                    inclusion_ids: choice.inclusionIds,
                    exclusion_ids: choice.exclusionIds,
                })),
                warranties: referenceContext.warrantyIds.map((id) => ({ id, label: labelForReference(id, workspaceChoices) })),
                inclusions: referenceContext.inclusionIds.map((id) => ({ id, label: labelForReference(id, workspaceChoices) })),
                exclusions: referenceContext.exclusionIds.map((id) => ({ id, label: labelForReference(id, workspaceChoices) })),
                warnings: workspaceChoices.flatMap((choice) => choice.pricingResult.warnings),
                company_tone_rules: [
                    'Professional',
                    'Brief',
                    'No unsupported savings, lifespan, financing, or performance claims',
                ],
            });
            const response = await fetch(`${supabaseUrl}/functions/v1/draft-estimate-options`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: supabaseAnonKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const data = await readFunctionJson(response);

            if (!response.ok) {
                const messageText = readFunctionMessage(data, response.status);

                setAiValidationErrors([messageText]);
                setMessage(messageText);
                return;
            }

            const validation = validateAiEstimateDraftResponse(data, referenceContext);

            if (!validation.valid) {
                setAiValidationErrors(validation.errors);
                setMessage(`AI draft validation failed: ${validation.errors[0] || 'Invalid structured output.'}`);
                return;
            }

            const nextDrafts = validation.choices.reduce<Record<string, AiEstimateDraftChoice>>((accumulator, draft) => {
                accumulator[draft.sourceChoiceId] = draft;
                return accumulator;
            }, {});
            const nextEditableCopy = validation.choices.reduce<Record<string, EditableChoiceCopy>>((accumulator, draft) => {
                accumulator[draft.sourceChoiceId] = {
                    title: draft.title,
                    shortSummary: draft.shortSummary,
                    homeownerExplanation: draft.homeownerExplanation,
                };
                return accumulator;
            }, {});

            setAiDraftsByChoiceId(nextDrafts);
            setEditableCopyByChoiceId((current) => ({
                ...current,
                ...nextEditableCopy,
            }));
            setMessage('AI drafts ready for technician review.');
        } catch (error) {
            setMessage(`AI drafting unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setAiDrafting(false);
        }
    }

    if (checkingAccess) {
        return (
            <StaffOnlyMessage
                message="Checking access..."
                homeRoute={providerModeContext ? providerClientHomeOsPath() : undefined}
            />
        );
    }

    if (!estimateAccess) {
        return (
            <StaffOnlyMessage
                message="Estimate tools are available to active company users with estimate permission."
                detail={message}
                homeRoute={providerModeContext ? providerClientHomeOsPath() : undefined}
            />
        );
    }

    const phase1Workspace = buildEstimateOptionWorkspace({
        companyId: estimateAccess.companyId,
        draftItems: items,
        draftContext,
        category: selectedCategory,
        answers,
        priceBookItems,
        technicianApproved,
        aiValidationFailed: aiValidationErrors.length > 0,
    });
    const estimateChoices = phase1Workspace.choices.map((choice) =>
        applyEditableChoiceCopy(choice, aiDraftsByChoiceId[choice.id], editableCopyByChoiceId[choice.id])
    );
    const optionChoices = estimateChoices.filter((choice) => choice.kind === 'individual');
    const bundleChoices = estimateChoices.filter((choice) => choice.kind === 'package');
    const selectedChoice = estimateChoices.find((choice) => choice.id === selectedChoiceId) || null;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <HomeHeader />

                <View style={headerRowStyle}>
                    <View>
                        <Text style={titleStyle}>
                            {providerModeContext ? 'Provider Estimate Draft' : 'Estimate Draft'}
                        </Text>
                        <Text style={subtitleStyle}>
                            {providerModeContext
                                ? 'Provider estimate draft for this client HomeOS.'
                                : 'Selected home items for a future estimate.'}
                        </Text>
                    </View>

                    {providerModeContext ? (
                        <View style={providerNavStyle}>
                            <TouchableOpacity
                                onPress={goBackToItem}
                                style={secondaryButtonStyle}
                            >
                                <Text style={secondaryButtonTextStyle}>
                                    {getProviderReturnActionLabel(requestedReturnTo) === 'Back to Current Job'
                                        ? 'Back to Current Job'
                                        : 'Back to Item'}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={goBackToClientHomeOs}
                                style={secondaryButtonStyle}
                            >
                                <Text style={secondaryButtonTextStyle}>Back to Client HomeOS</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={goToCompanyDashboard}
                                style={secondaryButtonStyle}
                            >
                                <Text style={secondaryButtonTextStyle}>Company Dashboard</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={secondaryButtonStyle}
                        >
                            <Text style={secondaryButtonTextStyle}>Back</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={sectionStyle}>
                    {renderSectionHeader('Estimate Header', 'Draft builder for selected client HomeOS items.')}
                    <View style={summaryGridStyle}>
                        {renderSummaryCard('Draft Items', String(items.length), 'Selected HomeOS records')}
                        {renderSummaryCard('Options', String(optionChoices.length), '2 to 4 individual choices')}
                        {renderSummaryCard('Packages', String(bundleChoices.length), 'Up to 2 broader packages')}
                        {renderSummaryCard('Status', phase1Workspace.statusMessage, 'Technician review gate')}
                    </View>
                </View>

                <View style={sectionStyle}>
                    {renderSectionHeader('Customer / Home', 'Provider drafts stay scoped to this company and property.')}
                    <View style={infoGridStyle}>
                        {!!draftContext?.customer_home_name && renderInfoChip('Home', draftContext.customer_home_name)}
                        {renderInfoChip('Company', shortId(estimateAccess.companyId))}
                        {renderInfoChip('Property', shortId(requestedPropertyId))}
                        {renderInfoChip('Context', providerModeContext ? 'Provider Mode' : requestedMode || 'ManagementOS')}
                        {!!draftContext?.service_request_id && renderInfoChip('Request', shortId(draftContext.service_request_id))}
                        {!!draftContext?.job_id && renderInfoChip('Job', shortId(draftContext.job_id))}
                        {!!draftContext?.technician_name && renderInfoChip('Technician', draftContext.technician_name)}
                        {renderInfoChip('Pricing', phase1Workspace.pricingSetupRequired ? 'Pricing setup required' : 'Deterministic')}
                        {renderInfoChip('Price Book', priceBookMessage)}
                        {renderInfoChip('Category', phase1Workspace.template.label)}
                    </View>
                    {!!draftContext?.issue_summary && (
                        <Text style={contextSummaryStyle}>
                            {draftContext.issue_summary}
                        </Text>
                    )}
                </View>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                <View style={sectionStyle}>
                    {renderSectionHeader('Category Questions', phase1Workspace.template.label)}
                    <View style={categoryTabRowStyle}>
                        {(['toilet_replacement', 'water_heater', 'garbage_disposal', 'faucet_replacement', 'whole_home_repipe'] as EstimateOptionCategory[]).map((category) => (
                            <TouchableOpacity
                                key={category}
                                onPress={() => {
                                    setSelectedCategory(category);
                                    setAnswers({});
                                    setTechnicianApproved(false);
                                    setPresentationMode(false);
                                }}
                                style={selectedCategory === category ? [categoryButtonStyle, selectedCategoryButtonStyle] : categoryButtonStyle}
                            >
                                <Text style={selectedCategory === category ? selectedCategoryButtonTextStyle : categoryButtonTextStyle}>
                                    {getEstimateCategoryTemplate(category).label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={questionGridStyle}>
                        {phase1Workspace.template.questions.map((question) => renderQuestion(question, answers, updateAnswer, toggleMultiAnswer))}
                    </View>

                    <View style={requirementGridStyle}>
                        {phase1Workspace.template.requiredPhotoLabels.map((label) => renderRequirementPill(`photo:${label}`, label, answers, markRequirementComplete))}
                        {phase1Workspace.template.requiredMeasurementLabels.map((label) => renderRequirementPill(`measurement:${label}`, label, answers, markRequirementComplete))}
                    </View>

                    {!phase1Workspace.answerValidation.complete && (
                        <View style={missingAnswerBoxStyle}>
                            {phase1Workspace.answerValidation.missingRequiredQuestionLabels.length > 0 && (
                                <Text style={missingAnswerTextStyle}>
                                    Questions still needed: {phase1Workspace.answerValidation.missingRequiredQuestionLabels.join(', ')}
                                </Text>
                            )}
                            {phase1Workspace.answerValidation.missingRequiredPhotoLabels.length > 0 && (
                                <Text style={missingAnswerTextStyle}>
                                    Photos still needed: {phase1Workspace.answerValidation.missingRequiredPhotoLabels.join(', ')}
                                </Text>
                            )}
                            {phase1Workspace.answerValidation.missingRequiredMeasurementLabels.length > 0 && (
                                <Text style={missingAnswerTextStyle}>
                                    Measurements still needed: {phase1Workspace.answerValidation.missingRequiredMeasurementLabels.join(', ')}
                                </Text>
                            )}
                        </View>
                    )}
                </View>

                <View style={sectionStyle}>
                    {renderSectionHeader('Deterministic Pricing', phase1Workspace.statusMessage)}
                    {phase1Workspace.pricingSetupRequired ? (
                        <View style={smallEmptyStyle}>
                            <Text style={smallEmptyTitleStyle}>Pricing setup required</Text>
                            <Text style={smallEmptyTextStyle}>
                                Add active company price-book entries before generating homeowner choices.
                            </Text>
                        </View>
                    ) : (
                        <View style={foundationGridStyle}>
                            {phase1Workspace.pricingResults.slice(0, 4).map((pricingResult) => (
                                <View key={pricingResult.id} style={foundationCardStyle}>
                                    <Text style={foundationTitleStyle}>{formatMoney(pricingResult.totalAmount)}</Text>
                                    <Text style={foundationTextStyle}>
                                        {pricingResult.lineItems.map((line) => line.name).join(', ')}
                                    </Text>
                                    {pricingResult.missingPricingInputs.length > 0 && (
                                        <Text style={warningTextStyle}>
                                            {pricingResult.missingPricingInputs[0]}
                                        </Text>
                                    )}
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                <View style={sectionStyle}>
                    {renderSectionHeader('Technician Option Editor', selectedChoice?.title || 'Review choices before presentation.')}
                    <View style={compactActionRowStyle}>
                        <TouchableOpacity
                            onPress={() => draftWithAi(estimateChoices)}
                            style={aiDrafting ? mutedButtonStyle : compactPrimaryButtonStyle}
                            disabled={aiDrafting}
                        >
                            <Text style={compactPrimaryButtonTextStyle}>
                                {aiDrafting ? 'Drafting...' : 'Draft with AI'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => approveForPresentation(estimateChoices)}
                            style={compactSecondaryButtonStyle}
                        >
                            <Text style={compactSecondaryButtonTextStyle}>Approve Set</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setPresentationMode((current) => !current)}
                            style={compactSecondaryButtonStyle}
                        >
                            <Text style={compactSecondaryButtonTextStyle}>
                                {presentationMode ? 'Back to Edit' : 'Present to Homeowner'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {phase1Workspace.presentationGate.blockers.length > 0 && (
                        <View style={warningBoxStyle}>
                            {phase1Workspace.presentationGate.blockers.slice(0, 6).map((blocker) => (
                                <Text key={blocker} style={warningTextStyle}>{blocker}</Text>
                            ))}
                        </View>
                    )}

                    {aiValidationErrors.length > 0 && (
                        <View style={warningBoxStyle}>
                            {aiValidationErrors.slice(0, 4).map((error) => (
                                <Text key={error} style={warningTextStyle}>{error}</Text>
                            ))}
                        </View>
                    )}

                    {estimateChoices.length === 0 ? (
                        <View style={smallEmptyStyle}>
                            <Text style={smallEmptyTextStyle}>Pricing setup required before choices can be generated.</Text>
                        </View>
                    ) : (
                        <View style={choiceGridStyle}>
                            {estimateChoices.map((choice) => (
                                <View
                                    key={choice.id}
                                    style={selectedChoiceId === choice.id
                                        ? [choiceCardStyle, selectedChoiceCardStyle]
                                        : choiceCardStyle}
                                >
                                    <View style={choiceTitleRowStyle}>
                                        <Text style={choiceTitleStyle}>{choice.title}</Text>
                                        <Text style={choiceCountStyle}>{formatMoney(choice.pricingResult.totalAmount)}</Text>
                                    </View>
                                    <Text style={choiceDescriptionStyle}>{choice.shortSummary}</Text>
                                    <View style={chipRowStyle}>
                                        {choice.pricingResult.lineItems.slice(0, 4).map((line) => (
                                            <Text key={`${choice.id}-${line.id}`} style={itemChipStyle}>
                                                {line.name}
                                            </Text>
                                        ))}
                                        {choice.pricingResult.lineItems.length > 4 && (
                                            <Text style={itemChipStyle}>+{choice.pricingResult.lineItems.length - 4} more</Text>
                                        )}
                                    </View>
                                    <TextInput
                                        value={choice.title}
                                        onChangeText={(value) => updateChoiceCopy(choice.id, 'title', value)}
                                        style={copyInputStyle}
                                        placeholder="Option title"
                                    />
                                    <TextInput
                                        value={choice.homeownerExplanation}
                                        onChangeText={(value) => updateChoiceCopy(choice.id, 'homeownerExplanation', value)}
                                        style={copyTextAreaStyle}
                                        multiline
                                        placeholder="Homeowner explanation"
                                    />
                                    <View style={compactActionRowStyle}>
                                        <TouchableOpacity
                                            onPress={() => selectChoice(choice)}
                                            style={compactPrimaryButtonStyle}
                                        >
                                            <Text style={compactPrimaryButtonTextStyle}>
                                                {choice.kind === 'package' ? 'Select Package' : 'Select Option'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => viewChoiceDetails(choice)}
                                            style={compactSecondaryButtonStyle}
                                        >
                                            <Text style={compactSecondaryButtonTextStyle}>View Details</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                <View style={sectionStyle}>
                    {renderSectionHeader('Homeowner Presentation', phase1Workspace.presentationGate.canPresent ? 'Ready' : 'Blocked')}
                    {!presentationMode ? (
                        <View style={smallEmptyStyle}>
                            <Text style={smallEmptyTextStyle}>
                                Presentation preview is available after technician review.
                            </Text>
                        </View>
                    ) : !phase1Workspace.presentationGate.canPresent ? (
                        <View style={warningBoxStyle}>
                            {phase1Workspace.presentationGate.blockers.map((blocker) => (
                                <Text key={blocker} style={warningTextStyle}>{blocker}</Text>
                            ))}
                        </View>
                    ) : (
                        <View style={presentationGridStyle}>
                            {estimateChoices.map((choice) => renderPresentationChoice(choice))}
                        </View>
                    )}
                </View>

                <View style={sectionStyle}>
                    {renderSectionHeader('Items in Draft', 'Compact item cards stay removable and recalculate options immediately.')}
                    {items.length === 0 ? (
                        <View style={smallEmptyStyle}>
                            <Text style={smallEmptyTitleStyle}>No estimate items yet.</Text>
                            <Text style={smallEmptyTextStyle}>
                                {providerModeContext
                                    ? 'No provider estimate draft found.'
                                    : 'Add equipment or fixtures to start building an estimate.'}
                            </Text>
                        </View>
                    ) : (
                        <View style={draftGridStyle}>
                            {items.map((item) => (
                                <View key={item.id} style={draftItemCardStyle}>
                                    <Text style={itemTitleStyle} numberOfLines={2}>{item.name}</Text>
                                    <Text style={itemMetaStyle} numberOfLines={1}>
                                        {item.system} / {item.category}
                                    </Text>
                                    <Text style={itemMetaStyle} numberOfLines={1}>
                                        {itemLocation(item)}
                                    </Text>
                                    <View style={miniMetaRowStyle}>
                                        <Text style={miniMetaPillStyle}>{item.status || 'Missing Info'}</Text>
                                        <Text style={miniMetaPillStyle}>{item.install_state || 'Unknown'}</Text>
                                    </View>
                                    <View style={compactActionRowStyle}>
                                        <TouchableOpacity
                                            onPress={() => openDraftItem(item)}
                                            style={compactPrimaryButtonStyle}
                                        >
                                            <Text style={compactPrimaryButtonTextStyle}>Open</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => removeItem(item.id)}
                                            style={compactDangerButtonStyle}
                                        >
                                            <Text style={compactDangerButtonTextStyle}>Remove</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                <View style={sectionStyle}>
                    {renderSectionHeader('Findings', 'Field findings will be attached before customer review.')}
                    <View style={foundationGridStyle}>
                        {estimateFoundationSections.map((section) => (
                            <View key={section.title} style={foundationCardStyle}>
                                <Text style={foundationTitleStyle}>{section.title}</Text>
                                <Text style={foundationTextStyle}>{section.description}</Text>
                            </View>
                        ))}
                    </View>
                </View>

            </View>
        </ScrollView>
    );
}

function StaffOnlyMessage({ message, detail, homeRoute = '/' }: { message: string; detail?: string; homeRoute?: string }) {
    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 700 }}>
                <HomeHeader />

                <View style={emptyBoxStyle}>
                    <Text style={emptyTitleStyle}>{message}</Text>
                    {!!detail && <Text style={emptyTextStyle}>{detail}</Text>}

                    <TouchableOpacity
                        onPress={() => router.replace(homeRoute as never)}
                        style={openButtonStyle}
                    >
                        <Text style={openButtonTextStyle}>Back Home</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}

function firstParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] || null : value || null;
}

function shortId(value?: string | null) {
    if (!value) return 'Unavailable';

    return value.slice(0, 8).toUpperCase();
}

function itemLocation(item: EstimateDraftItem) {
    return item.location || item.parent_area || 'Whole Home';
}

function applyEditableChoiceCopy(
    choice: Phase1EstimateChoice,
    aiDraft?: AiEstimateDraftChoice,
    editableCopy?: EditableChoiceCopy
): Phase1EstimateChoice {
    return {
        ...choice,
        title: editableCopy?.title || aiDraft?.title || choice.title,
        shortSummary: editableCopy?.shortSummary || aiDraft?.shortSummary || choice.shortSummary,
        homeownerExplanation: editableCopy?.homeownerExplanation || aiDraft?.homeownerExplanation || choice.homeownerExplanation,
        keyBenefits: aiDraft?.keyBenefits?.length ? aiDraft.keyBenefits : choice.keyBenefits,
        whyItDiffers: aiDraft?.whyItDiffers || choice.whyItDiffers,
        recommendedReason: aiDraft?.recommendedReason || choice.recommendedReason,
    };
}

function renderQuestion(
    question: EstimateQuestionDefinition,
    answers: EstimateAnswerSet,
    updateAnswer: (question: EstimateQuestionDefinition, value: string | number | boolean) => void,
    toggleMultiAnswer: (question: EstimateQuestionDefinition, value: string) => void
) {
    const currentAnswer = answers[question.id];
    const complete = isAnswerComplete(currentAnswer);

    return (
        <View key={question.id} style={questionCardStyle}>
            <View style={choiceTitleRowStyle}>
                <Text style={questionLabelStyle}>{question.label}</Text>
                {question.required && (
                    <Text style={complete ? donePillStyle : requiredPillStyle}>
                        {complete ? 'Done' : 'Required'}
                    </Text>
                )}
            </View>

            {question.type === 'single_select' || question.type === 'yes_no' ? (
                <View style={chipRowStyle}>
                    {(question.allowedAnswers || ['yes', 'no']).map((answer) => (
                        <TouchableOpacity
                            key={`${question.id}-${answer}`}
                            onPress={() => updateAnswer(question, answer)}
                            style={currentAnswer === answer ? [answerButtonStyle, selectedAnswerButtonStyle] : answerButtonStyle}
                        >
                            <Text style={currentAnswer === answer ? selectedAnswerButtonTextStyle : answerButtonTextStyle}>
                                {answer}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ) : question.type === 'multi_select' ? (
                <View style={chipRowStyle}>
                    {(question.allowedAnswers || []).map((answer) => {
                        const selected = Array.isArray(currentAnswer) && currentAnswer.includes(answer);

                        return (
                            <TouchableOpacity
                                key={`${question.id}-${answer}`}
                                onPress={() => toggleMultiAnswer(question, answer)}
                                style={selected ? [answerButtonStyle, selectedAnswerButtonStyle] : answerButtonStyle}
                            >
                                <Text style={selected ? selectedAnswerButtonTextStyle : answerButtonTextStyle}>
                                    {answer}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ) : question.type === 'measurement' || question.type === 'counter' ? (
                <View style={counterRowStyle}>
                    <TouchableOpacity
                        onPress={() => updateAnswer(question, Math.max(0, Number(currentAnswer || 0) - 1))}
                        style={counterButtonStyle}
                    >
                        <Text style={counterButtonTextStyle}>-</Text>
                    </TouchableOpacity>
                    <Text style={counterValueStyle}>{Number(currentAnswer || 0)}</Text>
                    <TouchableOpacity
                        onPress={() => updateAnswer(question, Number(currentAnswer || 0) + 1)}
                        style={counterButtonStyle}
                    >
                        <Text style={counterButtonTextStyle}>+</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <TextInput
                    value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                    onChangeText={(value) => updateAnswer(question, value)}
                    style={copyTextAreaStyle}
                    multiline
                    placeholder="Notes"
                />
            )}
        </View>
    );
}

function renderRequirementPill(
    key: string,
    label: string,
    answers: EstimateAnswerSet,
    markRequirementComplete: (key: string) => void
) {
    const complete = answers[key] === true;

    return (
        <TouchableOpacity
            key={key}
            onPress={() => markRequirementComplete(key)}
            style={complete ? [requirementPillStyle, completeRequirementPillStyle] : requirementPillStyle}
        >
            <Text style={complete ? completeRequirementPillTextStyle : requirementPillTextStyle}>
                {complete ? `Done: ${label}` : `Required: ${label}`}
            </Text>
        </TouchableOpacity>
    );
}

function renderPresentationChoice(choice: Phase1EstimateChoice) {
    const presentationChoice = toHomeownerPresentationChoice(choice);

    return (
        <View key={presentationChoice.id} style={presentationCardStyle}>
            <View style={choiceTitleRowStyle}>
                <Text style={presentationTitleStyle}>{presentationChoice.title}</Text>
                {presentationChoice.recommended && <Text style={recommendedPillStyle}>Recommended</Text>}
            </View>
            <Text style={presentationPriceStyle}>{formatMoney(presentationChoice.totalAmount)}</Text>
            <Text style={choiceDescriptionStyle}>{presentationChoice.homeownerExplanation}</Text>
            <View style={chipRowStyle}>
                {presentationChoice.keyBenefits.map((benefit) => (
                    <Text key={`${presentationChoice.id}-${benefit}`} style={itemChipStyle}>{benefit}</Text>
                ))}
            </View>
            <Text style={systemsTextStyle}>Full Details: {presentationChoice.inclusionIds.join(', ') || 'Included scope reviewed'}</Text>
            <Text style={systemsTextStyle}>Compare Options: {presentationChoice.whyItDiffers}</Text>
        </View>
    );
}

function labelForReference(id: string, choices: Phase1EstimateChoice[]) {
    for (const choice of choices) {
        const line = choice.pricingResult.lineItems.find((candidate) =>
            candidate.priceBookEntryId === id || candidate.code === id
        );

        if (line) return line.name;
    }

    return id;
}

function readPreferredFirstName(context: EstimateDraftContext | null) {
    const homeName = String(context?.customer_home_name || '').trim();

    if (!homeName || /^client homeos/i.test(homeName)) return '';

    return homeName.split(/\s+/)[0] || '';
}

function resolveEstimateSessionSource(value?: string | null): EstimateSessionSource {
    const normalized = String(value || '').trim().toLowerCase();

    return ['techos', 'provider_mode', 'management', 'homeos'].includes(normalized)
        ? normalized as EstimateSessionSource
        : 'techos';
}

async function readFunctionJson(response: Response) {
    const text = await response.text();

    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        return { message: text };
    }
}

function readFunctionMessage(data: Record<string, unknown>, status: number) {
    const message = typeof data.message === 'string' ? data.message : '';
    const detail = typeof data.detail === 'string' ? data.detail : '';

    return message || detail || `AI drafting failed with status ${status}.`;
}

function renderSectionHeader(title: string, description: string) {
    return (
        <View style={sectionHeaderStyle}>
            <Text style={sectionTitleStyle}>{title}</Text>
            <Text style={sectionDescriptionStyle}>{description}</Text>
        </View>
    );
}

function renderSummaryCard(label: string, value: string, description: string) {
    return (
        <View key={label} style={summaryCardStyle}>
            <Text style={summaryLabelStyle}>{label}</Text>
            <Text style={summaryValueStyle} numberOfLines={1}>{value}</Text>
            <Text style={summaryDescriptionStyle}>{description}</Text>
        </View>
    );
}

function renderInfoChip(label: string, value: string) {
    return (
        <View key={label} style={infoChipStyle}>
            <Text style={infoLabelStyle}>{label}</Text>
            <Text style={infoValueStyle} numberOfLines={1}>{value}</Text>
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

const providerNavStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end' as const,
    gap: 8,
    maxWidth: 520,
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

const sectionStyle = {
    marginBottom: 18,
};

const categoryTabRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 12,
};

const categoryButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D8E0EA',
};

const selectedCategoryButtonStyle = {
    backgroundColor: '#071B33',
    borderColor: '#071B33',
};

const categoryButtonTextStyle = {
    color: '#071B33',
    fontSize: 12,
    fontWeight: '900' as const,
};

const selectedCategoryButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900' as const,
};

const questionGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const questionCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    width: 280,
    minHeight: 118,
};

const questionLabelStyle = {
    color: '#071B33',
    fontSize: 14,
    fontWeight: '900' as const,
    flex: 1,
};

const requiredPillStyle = {
    color: '#8A4B00',
    backgroundColor: '#FFF4DD',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 7,
    fontSize: 10,
    fontWeight: '900' as const,
};

const donePillStyle = {
    color: '#14533A',
    backgroundColor: '#E8F7F0',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 7,
    fontSize: 10,
    fontWeight: '900' as const,
};

const answerButtonStyle = {
    backgroundColor: '#F3F6FA',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const selectedAnswerButtonStyle = {
    backgroundColor: '#E8F7F0',
    borderColor: '#1F7A55',
};

const answerButtonTextStyle = {
    color: '#071B33',
    fontSize: 12,
    fontWeight: '800' as const,
};

const selectedAnswerButtonTextStyle = {
    color: '#14533A',
    fontSize: 12,
    fontWeight: '900' as const,
};

const counterRowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginTop: 10,
};

const counterButtonStyle = {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#071B33',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const counterButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900' as const,
};

const counterValueStyle = {
    color: '#071B33',
    fontSize: 18,
    fontWeight: '900' as const,
    minWidth: 28,
    textAlign: 'center' as const,
};

const requirementGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const requirementPillStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#D8E0EA',
};

const completeRequirementPillStyle = {
    backgroundColor: '#E8F7F0',
    borderColor: '#1F7A55',
};

const requirementPillTextStyle = {
    color: '#637083',
    fontSize: 12,
    fontWeight: '800' as const,
};

const completeRequirementPillTextStyle = {
    color: '#14533A',
    fontSize: 12,
    fontWeight: '900' as const,
};

const missingAnswerBoxStyle = {
    backgroundColor: '#FFF8E8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0D18A',
    padding: 10,
    marginTop: 12,
    gap: 4,
};

const missingAnswerTextStyle = {
    color: '#8A4B00',
    fontSize: 12,
    fontWeight: '800' as const,
};

const warningBoxStyle = {
    backgroundColor: '#FFF8E8',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F2D18B',
    marginTop: 12,
    marginBottom: 12,
};

const warningTextStyle = {
    color: '#8A4B00',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800' as const,
};

const mutedButtonStyle = {
    backgroundColor: '#8390A2',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    alignItems: 'center' as const,
};

const copyInputStyle = {
    backgroundColor: '#F8FAFD',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    color: '#071B33',
    fontSize: 13,
    fontWeight: '900' as const,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 10,
};

const copyTextAreaStyle = {
    backgroundColor: '#F8FAFD',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    color: '#071B33',
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 10,
    minHeight: 68,
    textAlignVertical: 'top' as const,
};

const presentationGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 14,
};

const presentationCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D8E0EA',
    width: 320,
    minHeight: 260,
};

const presentationTitleStyle = {
    color: '#071B33',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900' as const,
    flex: 1,
};

const presentationPriceStyle = {
    color: '#14533A',
    fontSize: 28,
    fontWeight: '900' as const,
    marginTop: 10,
};

const recommendedPillStyle = {
    color: '#14533A',
    backgroundColor: '#E8F7F0',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 11,
    fontWeight: '900' as const,
};

const contextSummaryStyle = {
    color: '#637083',
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 10,
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

const sectionHeaderStyle = {
    marginBottom: 10,
};

const sectionTitleStyle = {
    color: '#071B33',
    fontSize: 20,
    fontWeight: '900' as const,
};

const sectionDescriptionStyle = {
    color: '#637083',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
};

const summaryGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const summaryCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    width: 170,
    minHeight: 112,
};

const summaryLabelStyle = {
    color: '#637083',
    fontSize: 12,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
};

const summaryValueStyle = {
    color: '#071B33',
    fontSize: 24,
    fontWeight: '900' as const,
    marginTop: 8,
};

const summaryDescriptionStyle = {
    color: '#637083',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 5,
};

const infoGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
};

const infoChipStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    flexDirection: 'row' as const,
    gap: 7,
    alignItems: 'center' as const,
};

const infoLabelStyle = {
    color: '#637083',
    fontSize: 12,
    fontWeight: '900' as const,
};

const infoValueStyle = {
    color: '#071B33',
    fontSize: 13,
    fontWeight: '900' as const,
    maxWidth: 220,
};

const choiceGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const choiceCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    width: 260,
    minHeight: 218,
};

const selectedChoiceCardStyle = {
    borderColor: '#1F7A55',
    backgroundColor: '#F5FFF9',
};

const choiceTitleRowStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 8,
};

const choiceTitleStyle = {
    color: '#071B33',
    fontSize: 18,
    fontWeight: '900' as const,
};

const choiceCountStyle = {
    color: '#1F7A55',
    backgroundColor: '#E9F7EF',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: '900' as const,
};

const choiceDescriptionStyle = {
    color: '#637083',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
};

const chipRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 10,
};

const itemChipStyle = {
    color: '#071B33',
    backgroundColor: '#F3F6FA',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: '800' as const,
};

const systemsTextStyle = {
    color: '#637083',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
};

const pricePlaceholderStyle = {
    color: '#A05A00',
    backgroundColor: '#FFF5E6',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: '900' as const,
    marginTop: 10,
    alignSelf: 'flex-start' as const,
};

const compactActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const compactPrimaryButtonStyle = {
    backgroundColor: '#071B33',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    alignItems: 'center' as const,
};

const compactPrimaryButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900' as const,
};

const compactSecondaryButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: '#D8E0EA',
};

const compactSecondaryButtonTextStyle = {
    color: '#071B33',
    fontSize: 12,
    fontWeight: '900' as const,
};

const compactDangerButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: '#F1B8B8',
};

const compactDangerButtonTextStyle = {
    color: '#B00020',
    fontSize: 12,
    fontWeight: '900' as const,
};

const smallEmptyStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    alignSelf: 'flex-start' as const,
    maxWidth: 360,
};

const smallEmptyTitleStyle = {
    color: '#071B33',
    fontSize: 16,
    fontWeight: '900' as const,
    marginBottom: 5,
};

const smallEmptyTextStyle = {
    color: '#637083',
    fontSize: 14,
    lineHeight: 20,
};

const draftGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const draftItemCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    width: 180,
    minHeight: 190,
};

const foundationGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 18,
};

const foundationCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    width: 230,
    minHeight: 128,
};

const foundationTitleStyle = {
    color: '#071B33',
    fontSize: 16,
    fontWeight: '900' as const,
    marginBottom: 6,
};

const foundationTextStyle = {
    color: '#637083',
    fontSize: 14,
    lineHeight: 20,
};

const emptyBoxStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const emptyTitleStyle = {
    color: '#071B33',
    fontSize: 20,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const emptyTextStyle = {
    color: '#637083',
    fontSize: 16,
    lineHeight: 22,
};

const itemTitleStyle = {
    color: '#071B33',
    fontSize: 18,
    fontWeight: '900' as const,
};

const itemMetaStyle = {
    color: '#637083',
    fontSize: 12,
    marginTop: 5,
};

const miniMetaRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 9,
};

const miniMetaPillStyle = {
    color: '#637083',
    backgroundColor: '#F3F6FA',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 7,
    fontSize: 11,
    fontWeight: '800' as const,
};

const openButtonStyle = {
    backgroundColor: '#071B33',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center' as const,
};

const openButtonTextStyle = {
    color: '#FFFFFF',
    fontWeight: '900' as const,
};
