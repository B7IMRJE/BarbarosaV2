import HomeHeader from '../../components/HomeHeader';

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { type RefObject, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Alert, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
    buildApprovedAiReferenceContext,
    buildEstimateOptionWorkspace,
    canManageEstimatePricing,
    canUseEstimatePricing,
    createEstimateRequirementSkipAnswer,
    estimateRequirementId,
    formatMoney,
    getEstimateCategoriesForWorkType,
    getEstimateRequirementState,
    getEstimateCategoryTemplate,
    getEstimateWorkTypeForCategory,
    getEstimateQuestionAllowedAnswers,
    getMeasurementRequirementPrompt,
    inferEstimateCategoryForDraftItem,
    isEstimateCategoryForWorkType,
    isEstimateQuestionAnswerComplete,
    isMeasurementRequirementAnswer,
    isMeasurementRequirementComplete,
    isPhotoRequirementAnswer,
    isPhotoRequirementComplete,
    isRequirementSkipAnswer,
    measurementRequirementAnswerKey,
    normalizeCompleteEstimateOptionSet,
    estimateWorkTypeOptions,
    photoRequirementAnswerKey,
    readEstimateOptionCategory,
    toggleEstimateMultiSelectAnswer,
    toHomeownerPresentationChoice,
    validateAiEstimateDraftResponse,
    type AiEstimateDraftChoice,
    type EstimateAnswerSet,
    type EstimateAnswerValue,
    type EstimateCalculatedLine,
    type EstimateChoice as Phase1EstimateChoice,
    type EstimateDraftGate,
    type EstimateLinePriceAdjustment,
    type EstimateOptionCategory,
    type EstimateApprovedProduct,
    type EstimateQuestionDefinition,
    type EstimateRequirementMeasurementAnswer,
    type EstimateRequirementSkipReason,
    type EstimateWorkType,
} from '../../lib/estimateOptions';
import {
    createEstimateRequirementPhotoPreview,
    deleteEstimateSessionAnswer,
    loadEstimateSessionAnswers,
    removeEstimateRequirementPhotoFile,
    saveEstimateSessionAnswer,
    uploadEstimateRequirementPhoto,
} from '../../lib/estimateRequirementPersistence';
import {
    loadCompanyPriceBook,
    type CompanyPriceBookItem,
} from '../../lib/companyPriceBook';
import { loadCompanyApprovedProducts } from '../../lib/companyApprovedProducts';
import { findEstimatePriceBookCatalogItem } from '../../lib/estimatePriceBookTarget';
import { BUILD_DISPLAY } from '../../lib/appVersion';
import {
    applyEstimateChoiceLinePriceAdjustments,
    applyEstimateChoicePriceAdjustment,
    formatEstimatePriceAdjustmentPercentage,
    normalizeEstimatePriceAdjustmentPercentage,
    restoreCompatibleEstimateChoiceBasePricing,
} from '../../lib/estimatePriceAdjustments';
import {
    loadEstimateOptionSet,
    saveEstimateOptionSet,
    type PersistableEstimateChoice,
} from '../../lib/estimateOptionPersistence';
import {
    buildCustomEstimateChoice,
    isCustomEstimateChoice,
    synchronizeCustomEstimateChoiceCopy,
    type CustomEstimateOptionDraft,
} from '../../lib/customEstimateOption';
import {
    buildRecommendedEstimateChoice,
    getEligibleEstimateRecommendations,
    type EligibleEstimateRecommendation,
    type EstimateRecommendationRelationship,
} from '../../lib/estimate-option-rulebook';
import {
    canUseCompanyEstimateWorkflow,
    loadCurrentCompanyEstimateAccess,
    type CompanyPermissionAccess,
} from '../../lib/companyPermissions';
import {
    EstimateDraftItem,
    EstimateDraftContext,
    clearEstimateDraft,
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
    archiveCompanyEstimateDraft,
    hasEstimateBuilderSnapshot,
    loadCompanyEstimateBuilderDraft,
    normalizeEstimateBuilderStep,
    saveCompanyEstimateBuilderDraft,
    type CompanyEstimateBuilderDraft,
    type EstimateBuilderSnapshot,
    type EstimateBuilderStep,
} from '../../lib/estimateBuilderDraft';
import {
    hasProviderModeRouteSignal,
    providerModeItemPath,
    providerModePath,
    readProviderModeParams,
    validateProviderModeAccess,
} from '../../lib/providerMode';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../lib/supabase';
import {
    buildEstimateJobWorkflowRoute,
    getProviderReturnActionLabel,
    resolveTechOSEstimateReturnRoute,
} from '../../lib/techosClientAccess';

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

type RequirementUploadState = {
    uploading: boolean;
    error: string | null;
};

type RequirementKind = 'photo' | 'measurement';
type EstimateWorkspaceSection = 'pricing' | 'editor' | 'presentation' | 'findings';
type PriceAdjustmentDirection = 'discount' | 'increase';
type GuidedEstimateStep = 'build' | 'option_added' | 'recommendations' | 'review';
type GuidedBuildStep = 'work' | 'findings' | 'price';
type GuidedPriceAdjustmentMode = 'none' | 'discount' | 'markup' | 'override';

type PersistedEstimateBuilderState = {
    version: 1;
    items: EstimateDraftItem[];
    draftContext: EstimateDraftContext | null;
    selectedChoiceId: string;
    removedChoiceIds: string[];
    persistedOptionChoices: PersistableEstimateChoice[];
    selectedWorkType: EstimateWorkType | null;
    estimateCategoryChosen: boolean;
    selectedCategory: EstimateOptionCategory;
    answers: EstimateAnswerSet;
    measurementDraftByKey: Record<string, string>;
    technicianApproved: boolean;
    aiDraftsByChoiceId: Record<string, AiEstimateDraftChoice>;
    editableCopyByChoiceId: Record<string, EditableChoiceCopy>;
    priceAdjustmentByChoiceId: Record<string, number>;
    customPriceAdjustmentByChoiceId: Record<string, string>;
    priceAdjustmentDirectionByChoiceId: Record<string, PriceAdjustmentDirection>;
    priceAdjustmentLabelByChoiceId: Record<string, string>;
    linePriceAdjustmentsByChoiceId: Record<string, Record<string, EstimateLinePriceAdjustment>>;
    guidedStep: GuidedEstimateStep;
    guidedBuildStep: GuidedBuildStep;
    documentationExpanded: boolean;
    scopePickerExpanded: boolean;
    relatedSearch: string;
    guidedAdjustmentMode: GuidedPriceAdjustmentMode;
    guidedAdjustmentValue: string;
    guidedDiscountLabel: string;
    guidedAdjustmentLineId: string;
    editingGuidedOptionId: string;
    customQuoteMode: boolean;
    customQuoteDraft: CustomEstimateOptionDraft;
};

const emptyCustomEstimateOptionDraft: CustomEstimateOptionDraft = {
    name: '',
    workScope: '',
    customerSummary: '',
    price: '',
};

const discountReasonSuggestions = [
    'Military Discount',
    'First-Time Customer Discount',
    'Senior Discount',
    'Loyalty Discount',
    'Promotional Discount',
];

const requirementSkipReasons: { label: string; reason: EstimateRequirementSkipReason | null }[] = [
    { label: 'Skip for now', reason: null },
    { label: 'Inaccessible', reason: 'inaccessible' },
    { label: 'Unsafe', reason: 'unsafe_to_capture' },
    { label: 'Label unreadable', reason: 'label_unreadable' },
    { label: 'Customer unavailable', reason: 'customer_unavailable' },
    { label: 'N/A', reason: 'not_applicable' },
    { label: 'Other', reason: 'other' },
];

export default function EstimateScreen() {
    const { companyId, propertyId, itemSlug, mode, providerMode, returnTo, serviceRequestId, scheduleSlotId, jobId, estimateSessionId, step } = useLocalSearchParams<{
        companyId?: string | string[];
        propertyId?: string | string[];
        itemSlug?: string | string[];
        mode?: string | string[];
        providerMode?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
        estimateSessionId?: string | string[];
        step?: string | string[];
    }>();
    const requestedCompanyId = firstParam(companyId);
    const requestedPropertyId = firstParam(propertyId);
    const requestedItemSlug = firstParam(itemSlug);
    const requestedMode = firstParam(mode);
    const requestedReturnTo = firstParam(returnTo);
    const requestedEstimateSessionId = firstParam(estimateSessionId);
    const requestedBuilderStepParam = firstParam(step);
    const requestedBuilderStep = normalizeEstimateBuilderStep(requestedBuilderStepParam);
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
    const [quoteNumber, setQuoteNumber] = useState('');
    const [draftSaveStatus, setDraftSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [selectedChoiceId, setSelectedChoiceId] = useState('');
    const [detailChoiceId, setDetailChoiceId] = useState('');
    const [removedChoiceIds, setRemovedChoiceIds] = useState<string[]>([]);
    const [pendingRemoveChoiceId, setPendingRemoveChoiceId] = useState('');
    const [persistedOptionChoices, setPersistedOptionChoices] = useState<PersistableEstimateChoice[]>([]);
    const [priceBookItems, setPriceBookItems] = useState<CompanyPriceBookItem[]>([]);
    const [priceBookMessage, setPriceBookMessage] = useState('Price book loading...');
    const [approvedProducts, setApprovedProducts] = useState<EstimateApprovedProduct[]>([]);
    const [approvedProductMessage, setApprovedProductMessage] = useState('Approved products loading...');
    const [selectedWorkType, setSelectedWorkType] = useState<EstimateWorkType | null>(null);
    const [estimateCategoryChosen, setEstimateCategoryChosen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<EstimateOptionCategory>('faucet_replacement');
    const [expandedCategory, setExpandedCategory] = useState<EstimateOptionCategory | null>(null);
    const [expandedWorkspaceSection, setExpandedWorkspaceSection] = useState<EstimateWorkspaceSection | null>(null);
    const [optionsWorkspaceOpen, setOptionsWorkspaceOpen] = useState(false);
    const [optionsWorkspaceNotice, setOptionsWorkspaceNotice] = useState('');
    const [readinessExpanded, setReadinessExpanded] = useState(false);
    const [answers, setAnswers] = useState<EstimateAnswerSet>({});
    const [photoPreviewByKey, setPhotoPreviewByKey] = useState<Record<string, string>>({});
    const [requirementUploadByKey, setRequirementUploadByKey] = useState<Record<string, RequirementUploadState>>({});
    const [measurementDraftByKey, setMeasurementDraftByKey] = useState<Record<string, string>>({});
    const [measurementErrorByKey, setMeasurementErrorByKey] = useState<Record<string, string>>({});
    const [technicianApproved, setTechnicianApproved] = useState(false);
    const [presentationMode, setPresentationMode] = useState(false);
    const [aiDrafting, setAiDrafting] = useState(false);
    const [aiDraftWarnings, setAiDraftWarnings] = useState<string[]>([]);
    const [aiDraftsByChoiceId, setAiDraftsByChoiceId] = useState<Record<string, AiEstimateDraftChoice>>({});
    const [editableCopyByChoiceId, setEditableCopyByChoiceId] = useState<Record<string, EditableChoiceCopy>>({});
    const [priceAdjustmentByChoiceId, setPriceAdjustmentByChoiceId] = useState<Record<string, number>>({});
    const [customPriceAdjustmentByChoiceId, setCustomPriceAdjustmentByChoiceId] = useState<Record<string, string>>({});
    const [priceAdjustmentDirectionByChoiceId, setPriceAdjustmentDirectionByChoiceId] = useState<Record<string, PriceAdjustmentDirection>>({});
    const [priceAdjustmentLabelByChoiceId, setPriceAdjustmentLabelByChoiceId] = useState<Record<string, string>>({});
    const [linePriceAdjustmentsByChoiceId, setLinePriceAdjustmentsByChoiceId] = useState<Record<string, Record<string, EstimateLinePriceAdjustment>>>({});
    const [guidedStep, setGuidedStep] = useState<GuidedEstimateStep>('build');
    const [guidedBuildStep, setGuidedBuildStep] = useState<GuidedBuildStep>('work');
    const [documentationExpanded, setDocumentationExpanded] = useState(false);
    const [scopePickerExpanded, setScopePickerExpanded] = useState(false);
    const [relatedSearch, setRelatedSearch] = useState('');
    const [guidedAdjustmentMode, setGuidedAdjustmentMode] = useState<GuidedPriceAdjustmentMode>('none');
    const [guidedAdjustmentValue, setGuidedAdjustmentValue] = useState('');
    const [guidedDiscountLabel, setGuidedDiscountLabel] = useState('');
    const [guidedAdjustmentLineId, setGuidedAdjustmentLineId] = useState('');
    const [editingGuidedOptionId, setEditingGuidedOptionId] = useState('');
    const [savingGuidedOption, setSavingGuidedOption] = useState(false);
    const [customQuoteMode, setCustomQuoteMode] = useState(false);
    const [customQuoteDraft, setCustomQuoteDraft] = useState<CustomEstimateOptionDraft>(emptyCustomEstimateOptionDraft);
    const editingGuidedOptionSnapshotRef = useRef<{
        choiceId: string;
        editableCopy: EditableChoiceCopy | null;
        linePriceAdjustments: Record<string, EstimateLinePriceAdjustment>;
        presentationMode: boolean;
        technicianApproved: boolean;
    } | null>(null);
    const estimateScrollRef = useRef<ScrollView | null>(null);
    const estimateContentRef = useRef<View | null>(null);
    const expandedChecklistRef = useRef<View | null>(null);
    const readinessDetailsRef = useRef<View | null>(null);
    const workspaceDetailsRef = useRef<View | null>(null);
    const hydratedDraftSessionIdRef = useRef('');
    const latestDraftSaveRef = useRef<{
        sessionId: string;
        step: EstimateBuilderStep;
        state: EstimateBuilderSnapshot;
    } | null>(null);
    const draftSavePromiseRef = useRef<Promise<void> | null>(null);
    const activeDraftSessionId = estimateSession?.id || draftContext?.estimate_session_id || requestedEstimateSessionId;
    const currentBuilderStep = resolveCurrentBuilderStep(guidedStep, guidedBuildStep);
    const builderStateJson = JSON.stringify({
        version: 1,
        items,
        draftContext,
        selectedChoiceId,
        removedChoiceIds,
        persistedOptionChoices,
        selectedWorkType,
        estimateCategoryChosen,
        selectedCategory,
        answers,
        measurementDraftByKey,
        technicianApproved,
        aiDraftsByChoiceId,
        editableCopyByChoiceId,
        priceAdjustmentByChoiceId,
        customPriceAdjustmentByChoiceId,
        priceAdjustmentDirectionByChoiceId,
        priceAdjustmentLabelByChoiceId,
        linePriceAdjustmentsByChoiceId,
        guidedStep,
        guidedBuildStep,
        documentationExpanded,
        scopePickerExpanded,
        relatedSearch,
        guidedAdjustmentMode,
        guidedAdjustmentValue,
        guidedDiscountLabel,
        guidedAdjustmentLineId,
        editingGuidedOptionId,
        customQuoteMode,
        customQuoteDraft,
    } satisfies PersistedEstimateBuilderState);
    const checkAccessEvent = useEffectEvent(checkAccess);

    useEffect(() => {
        void checkAccessEvent();
    }, [
        requestedCompanyId,
        requestedPropertyId,
        requestedItemSlug,
        providerContextIncomplete,
        providerModeContext?.providerMode,
        providerModeContext?.companyId,
        providerModeContext?.propertyId,
        providerModeContext?.serviceRequestId,
        providerModeContext?.scheduleSlotId,
        providerModeContext?.jobId,
        requestedEstimateSessionId,
    ]);

    useEffect(() => {
        if (!activeDraftSessionId || hydratedDraftSessionIdRef.current !== activeDraftSessionId) return;

        const pendingSave = {
            sessionId: activeDraftSessionId,
            step: currentBuilderStep,
            state: JSON.parse(builderStateJson) as EstimateBuilderSnapshot,
        };
        latestDraftSaveRef.current = pendingSave;

        const timeout = setTimeout(() => {
            void persistLatestBuilderDraft();
        }, 500);

        return () => clearTimeout(timeout);
    }, [activeDraftSessionId, builderStateJson, currentBuilderStep]);

    useEffect(() => () => {
        if (latestDraftSaveRef.current) void persistLatestBuilderDraft({ silent: true });
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (!estimateAccess?.companyId) return undefined;

            let active = true;

            void loadCompanyPriceBook(estimateAccess.companyId, {
                includeStarterRecommendations: true,
            })
                .then((priceBook) => {
                    if (!active) return;
                    setPriceBookItems(priceBook.items);
                    setPriceBookMessage(priceBook.backendStatus.message);
                })
                .catch((error) => {
                    if (!active) return;
                    setPriceBookItems([]);
                    setPriceBookMessage(
                        `Price book unavailable: ${
                            error instanceof Error ? error.message : 'Unknown error'
                        }`
                    );
                });

            void loadCompanyApprovedProducts(estimateAccess.companyId)
                .then((products) => {
                    if (!active) return;
                    setApprovedProducts(products);
                    setApprovedProductMessage(products.length > 0
                        ? `${products.length} approved product${products.length === 1 ? '' : 's'} available.`
                        : 'No approved products are configured for this company yet.'
                    );
                })
                .catch((error) => {
                    if (!active) return;
                    setApprovedProducts([]);
                    setApprovedProductMessage(
                        `Approved products unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`
                    );
                });

            return () => {
                active = false;
            };
        }, [estimateAccess?.companyId])
    );

    useEffect(() => {
        if (!expandedCategory) return;

        return focusExpandedSection(expandedChecklistRef);
    }, [expandedCategory]);

    useEffect(() => {
        if (!readinessExpanded) return;

        return focusExpandedSection(readinessDetailsRef);
    }, [readinessExpanded]);

    useEffect(() => {
        if (!expandedWorkspaceSection) return;

        return focusExpandedSection(workspaceDetailsRef);
    }, [expandedWorkspaceSection]);

    useEffect(() => {
        let secondFrame: number | null = null;
        const scrollToStepStart = () => estimateScrollRef.current?.scrollTo({
            y: 0,
            animated: guidedStep !== 'build',
        });

        if (typeof requestAnimationFrame === 'function') {
            const firstFrame = requestAnimationFrame(() => {
                secondFrame = requestAnimationFrame(scrollToStepStart);
            });

            return () => {
                cancelAnimationFrame(firstFrame);
                if (secondFrame !== null) cancelAnimationFrame(secondFrame);
            };
        }

        const timeout = setTimeout(scrollToStepStart, 0);
        return () => clearTimeout(timeout);
    }, [guidedBuildStep, guidedStep]);

    function focusExpandedSection(targetRef: { readonly current: View | null }) {
        let secondFrame: number | null = null;

        const bringIntoView = () => {
            const scrollView = estimateScrollRef.current;
            const content = estimateContentRef.current;
            const target = targetRef.current;

            if (!scrollView || !content || !target) return;

            target.measureLayout(
                content,
                (_targetX, targetY) => {
                    scrollView.scrollTo({
                        y: Math.max(0, targetY - 16),
                        animated: true,
                    });
                },
                () => undefined
            );
        };

        if (typeof requestAnimationFrame === 'function') {
            const firstFrame = requestAnimationFrame(() => {
                secondFrame = requestAnimationFrame(bringIntoView);
            });

            return () => {
                cancelAnimationFrame(firstFrame);
                if (secondFrame !== null) cancelAnimationFrame(secondFrame);
            };
        }

        const timeout = setTimeout(bringIntoView, 0);
        return () => clearTimeout(timeout);
    }

    async function persistLatestBuilderDraft(options: { silent?: boolean } = {}) {
        if (draftSavePromiseRef.current) {
            await draftSavePromiseRef.current;
            return;
        }

        const pendingSave = latestDraftSaveRef.current;
        if (!pendingSave || hydratedDraftSessionIdRef.current !== pendingSave.sessionId) return;

        latestDraftSaveRef.current = null;
        if (!options.silent) setDraftSaveStatus('saving');

        const savePromise = saveCompanyEstimateBuilderDraft({
            sessionId: pendingSave.sessionId,
            currentBuilderStep: pendingSave.step,
            builderState: pendingSave.state,
        })
            .then(() => {
                if (!options.silent) setDraftSaveStatus('saved');
            })
            .catch((error) => {
                latestDraftSaveRef.current = pendingSave;
                if (!options.silent) {
                    setDraftSaveStatus('error');
                    setMessage(`Draft could not be saved: ${readEstimateErrorMessage(error, 'HomeOS services are unavailable.')}`);
                }
            })
            .finally(() => {
                draftSavePromiseRef.current = null;
            });

        draftSavePromiseRef.current = savePromise;
        await savePromise;
    }

    async function checkAccess() {
        setCheckingAccess(true);
        setEstimateAccess(null);
        setDraftContext(null);
        setEstimateSession(null);
        setQuoteNumber('');
        setDraftSaveStatus('idle');
        hydratedDraftSessionIdRef.current = '';
        latestDraftSaveRef.current = null;
        setItems([]);
        setExpandedCategory(null);
        setExpandedWorkspaceSection(null);
        setOptionsWorkspaceOpen(false);
        setOptionsWorkspaceNotice('');
        setReadinessExpanded(false);
        setPriceBookItems([]);
        setPriceBookMessage('Price book loading...');
        setSelectedWorkType(null);
        setEstimateCategoryChosen(false);
        setTechnicianApproved(false);
        setPresentationMode(false);
        setAiDraftWarnings([]);
        setAiDraftsByChoiceId({});
        setEditableCopyByChoiceId({});
        setPersistedOptionChoices([]);
        setLinePriceAdjustmentsByChoiceId({});
        setPhotoPreviewByKey({});
        setRequirementUploadByKey({});
        setMeasurementDraftByKey({});
        setMeasurementErrorByKey({});
        setGuidedStep('build');
        setGuidedBuildStep('work');
        setDocumentationExpanded(false);
        setScopePickerExpanded(false);
        setRelatedSearch('');
        setGuidedAdjustmentMode('none');
        setGuidedAdjustmentValue('');
        setGuidedDiscountLabel('');
        setGuidedAdjustmentLineId('');
        setEditingGuidedOptionId('');
        setSavingGuidedOption(false);
        setCustomQuoteMode(false);
        setCustomQuoteDraft(emptyCustomEstimateOptionDraft);
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
        const [localDraftItems, localDraftContext] = await Promise.all([
            loadEstimateDraft(scope),
            loadEstimateDraftContext(scope),
        ]);
        const serverSessionId = requestedEstimateSessionId || localDraftContext?.estimate_session_id || '';
        let serverDraft: CompanyEstimateBuilderDraft | null = null;

        if (serverSessionId) {
            try {
                serverDraft = await loadCompanyEstimateBuilderDraft(serverSessionId);
            } catch (error) {
                if (requestedEstimateSessionId) {
                    setMessage(`Saved quote could not be opened: ${readEstimateErrorMessage(error, 'Draft unavailable.')}`);
                    return;
                }
            }
        }

        if (serverDraft && serverDraft.companyId !== access.companyId) {
            setMessage('This quote belongs to a different company workspace.');
            return;
        }

        const persistedBuilderState = serverDraft && hasEstimateBuilderSnapshot(serverDraft.builderState)
            ? readPersistedEstimateBuilderState(serverDraft.builderState)
            : null;
        const draftItems = persistedBuilderState?.items || localDraftItems;
        const nextDraftContext = persistedBuilderState?.draftContext
            || localDraftContext
            || (serverDraft ? buildDraftContextFromServerDraft(serverDraft, access.companyUserId) : null);
        const inferredCategory = inferEstimateCategoryForDraftItem(
            draftItems,
            requestedItemSlug,
            nextDraftContext
        );
        const restoredCategory = readEstimateOptionCategory(
            persistedBuilderState?.selectedCategory || nextDraftContext?.estimate_category
        );
        const activeCategory = restoredCategory || inferredCategory;

        setItems(draftItems);
        setDraftContext(nextDraftContext);
        setEstimateSession(serverDraft ? mapBuilderDraftToEstimateSession(serverDraft) : null);
        setQuoteNumber(serverDraft?.quoteNumber || '');
        setSelectedCategory(activeCategory);
        setSelectedWorkType(restoredCategory ? getEstimateWorkTypeForCategory(restoredCategory) : null);
        setEstimateCategoryChosen(Boolean(restoredCategory));
        setAnswers({});
        setPhotoPreviewByKey({});
        setRequirementUploadByKey({});
        setMeasurementDraftByKey({});
        setMeasurementErrorByKey({});
        setTechnicianApproved(false);
        setPresentationMode(false);
        setAiDraftWarnings([]);
        setAiDraftsByChoiceId({});
        setEditableCopyByChoiceId({});
        setPersistedOptionChoices([]);
        setLinePriceAdjustmentsByChoiceId({});
        setGuidedStep('build');
        setGuidedBuildStep('work');
        setDocumentationExpanded(false);
        setScopePickerExpanded(false);
        setRelatedSearch('');
        setGuidedAdjustmentMode('none');
        setGuidedAdjustmentValue('');
        setGuidedDiscountLabel('');
        setGuidedAdjustmentLineId('');
        setEditingGuidedOptionId('');
        setCustomQuoteMode(false);
        setCustomQuoteDraft(emptyCustomEstimateOptionDraft);
        setMessage(providerModeContext && draftItems.length === 0 && !nextDraftContext
            ? 'No provider estimate draft found.'
            : ''
        );

        if (persistedBuilderState) {
            applyPersistedBuilderState(persistedBuilderState, serverDraft?.currentBuilderStep || 'work');
        } else if (serverDraft) {
            applyRequestedBuilderStep(serverDraft.currentBuilderStep);
        }

        const persistedSessionId = serverDraft?.id || nextDraftContext?.estimate_session_id || '';

        if (persistedSessionId && restoredCategory) {
            await Promise.all([
                loadPersistedAnswers(persistedSessionId, persistedBuilderState?.measurementDraftByKey),
                loadPersistedOptionSet(persistedSessionId, Boolean(persistedBuilderState)),
            ]);
        }

        if (persistedSessionId) {
            hydratedDraftSessionIdRef.current = persistedSessionId;
            setDraftSaveStatus('saved');
        }

        try {
            const priceBook = await loadCompanyPriceBook(access.companyId, {
                includeStarterRecommendations: true,
            });
            const pricingPreview = buildEstimateOptionWorkspace({
                companyId: access.companyId,
                draftItems,
                draftContext: nextDraftContext,
                category: activeCategory,
                answers: persistedBuilderState?.answers || {},
                priceBookItems: priceBook.items,
                technicianApproved: false,
            });

            setPriceBookItems(priceBook.items);
            setPriceBookMessage(priceBook.backendStatus.message);
            if (pricingPreview.pricingSetupRequired) {
                setExpandedWorkspaceSection('pricing');
            }
        } catch (error) {
            setPriceBookItems([]);
            setPriceBookMessage(`Price book unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setExpandedWorkspaceSection('pricing');
        }
    }

    function applyPersistedBuilderState(
        state: PersistedEstimateBuilderState,
        savedStep: EstimateBuilderStep,
    ) {
        setItems(state.items);
        setDraftContext(state.draftContext);
        setSelectedChoiceId(state.selectedChoiceId);
        setRemovedChoiceIds(state.removedChoiceIds);
        setPersistedOptionChoices(state.persistedOptionChoices);
        setSelectedWorkType(state.selectedWorkType);
        setEstimateCategoryChosen(state.estimateCategoryChosen);
        setSelectedCategory(state.selectedCategory);
        setAnswers(state.answers);
        setMeasurementDraftByKey(state.measurementDraftByKey);
        setTechnicianApproved(state.technicianApproved);
        setAiDraftsByChoiceId(state.aiDraftsByChoiceId);
        setEditableCopyByChoiceId(state.editableCopyByChoiceId);
        setPriceAdjustmentByChoiceId(state.priceAdjustmentByChoiceId);
        setCustomPriceAdjustmentByChoiceId(state.customPriceAdjustmentByChoiceId);
        setPriceAdjustmentDirectionByChoiceId(state.priceAdjustmentDirectionByChoiceId);
        setPriceAdjustmentLabelByChoiceId(state.priceAdjustmentLabelByChoiceId);
        setLinePriceAdjustmentsByChoiceId(state.linePriceAdjustmentsByChoiceId);
        setGuidedStep(state.guidedStep);
        setGuidedBuildStep(state.guidedBuildStep);
        setDocumentationExpanded(state.documentationExpanded);
        setScopePickerExpanded(state.scopePickerExpanded);
        setRelatedSearch(state.relatedSearch);
        setGuidedAdjustmentMode(state.guidedAdjustmentMode);
        setGuidedAdjustmentValue(state.guidedAdjustmentValue);
        setGuidedDiscountLabel(state.guidedDiscountLabel);
        setGuidedAdjustmentLineId(state.guidedAdjustmentLineId);
        setEditingGuidedOptionId(state.editingGuidedOptionId);
        setCustomQuoteMode(state.customQuoteMode);
        setCustomQuoteDraft(state.customQuoteDraft);
        applyRequestedBuilderStep(savedStep);
    }

    function applyRequestedBuilderStep(savedStep: EstimateBuilderStep) {
        const nextStep = requestedBuilderStepParam ? requestedBuilderStep : savedStep;
        const guided = builderStepToGuidedState(nextStep);

        setGuidedStep(guided.guidedStep);
        setGuidedBuildStep(guided.guidedBuildStep);
    }

    async function loadPersistedAnswers(
        sessionId: string,
        unsavedMeasurementDrafts: Record<string, string> = {},
    ) {
        try {
            const persistedAnswers = await loadEstimateSessionAnswers(sessionId);

            setAnswers(persistedAnswers);
            setMeasurementDraftByKey({
                ...createMeasurementDrafts(persistedAnswers),
                ...unsavedMeasurementDrafts,
            });
            await loadPhotoPreviews(persistedAnswers);
        } catch (error) {
            setMessage(`Estimate requirements could not be restored: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async function loadPersistedOptionSet(sessionId: string, preserveBuilderStep = false) {
        try {
            const savedSet = await loadEstimateOptionSet(sessionId);

            if (!savedSet || savedSet.options.length === 0) return;

            setPersistedOptionChoices(savedSet.options);
            if (!preserveBuilderStep) setGuidedStep('review');
            setSelectedChoiceId(savedSet.selectedSourceChoiceId || '');
            setTechnicianApproved(!!savedSet.technicianApprovedAt);
            setPriceAdjustmentByChoiceId(savedSet.options.reduce<Record<string, number>>((adjustments, choice) => {
                const percentage = Number(choice.priceAdjustmentPercentage || 0);

                if (percentage !== 0) adjustments[choice.id] = percentage;

                return adjustments;
            }, {}));
            setCustomPriceAdjustmentByChoiceId(savedSet.options.reduce<Record<string, string>>((adjustments, choice) => {
                const percentage = Number(choice.priceAdjustmentPercentage || 0);

                if (percentage !== 0) adjustments[choice.id] = String(Math.abs(percentage));

                return adjustments;
            }, {}));
            setPriceAdjustmentDirectionByChoiceId(savedSet.options.reduce<Record<string, PriceAdjustmentDirection>>((directions, choice) => {
                directions[choice.id] = Number(choice.priceAdjustmentPercentage || 0) < 0 ? 'discount' : 'increase';

                return directions;
            }, {}));
            setPriceAdjustmentLabelByChoiceId(savedSet.options.reduce<Record<string, string>>((labels, choice) => {
                const label = String(choice.priceAdjustmentLabel || '').trim();

                if (label) labels[choice.id] = label;

                return labels;
            }, {}));
            setLinePriceAdjustmentsByChoiceId(savedSet.options.reduce<Record<string, Record<string, EstimateLinePriceAdjustment>>>((adjustments, choice) => {
                if (choice.linePriceAdjustments && Object.keys(choice.linePriceAdjustments).length > 0) {
                    adjustments[choice.id] = choice.linePriceAdjustments;
                }

                return adjustments;
            }, {}));
        } catch (error) {
            setMessage(`Saved option set could not be restored: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    function clearCurrentDraft() {
        Alert.alert(
            quoteNumber ? `Delete ${quoteNumber}?` : 'Delete this quote draft?',
            'This removes the draft from the active list. Finished and signed quotes are not affected.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete Draft',
                    style: 'destructive',
                    onPress: () => void deleteCurrentDraft(),
                },
            ]
        );
    }

    async function deleteCurrentDraft() {
        if (!estimateAccess) return;

        const sessionIdToArchive = activeDraftSessionId;
        hydratedDraftSessionIdRef.current = '';
        latestDraftSaveRef.current = null;

        if (sessionIdToArchive) {
            try {
                await archiveCompanyEstimateDraft(sessionIdToArchive);
            } catch (error) {
                setMessage(`Draft could not be deleted: ${readEstimateErrorMessage(error, 'HomeOS services are unavailable.')}`);
                return;
            }
        }

        await clearEstimateDraft({
            userId: estimateAccess.userId,
            companyId: estimateAccess.companyId,
            propertyId: requestedPropertyId,
        });

        setItems([]);
        setDraftContext(null);
        setEstimateSession(null);
        setQuoteNumber('');
        setDraftSaveStatus('idle');
        setSelectedChoiceId('');
        setDetailChoiceId('');
        setRemovedChoiceIds([]);
        setPendingRemoveChoiceId('');
        setSelectedCategory('faucet_replacement');
        setExpandedCategory(null);
        setExpandedWorkspaceSection(null);
        setReadinessExpanded(false);
        setAnswers({});
        setPhotoPreviewByKey({});
        setRequirementUploadByKey({});
        setMeasurementDraftByKey({});
        setMeasurementErrorByKey({});
        setTechnicianApproved(false);
        setPresentationMode(false);
        setAiDraftWarnings([]);
        setAiDraftsByChoiceId({});
        setEditableCopyByChoiceId({});
        setPersistedOptionChoices([]);
        setPriceAdjustmentByChoiceId({});
        setCustomPriceAdjustmentByChoiceId({});
        setPriceAdjustmentDirectionByChoiceId({});
        setPriceAdjustmentLabelByChoiceId({});
        setLinePriceAdjustmentsByChoiceId({});
        setGuidedStep('build');
        setGuidedBuildStep('work');
        setDocumentationExpanded(false);
        setScopePickerExpanded(false);
        setRelatedSearch('');
        setGuidedAdjustmentMode('none');
        setGuidedAdjustmentValue('');
        setGuidedDiscountLabel('');
        setGuidedAdjustmentLineId('');
        setEditingGuidedOptionId('');
        setCustomQuoteMode(false);
        setCustomQuoteDraft(emptyCustomEstimateOptionDraft);
        setMessage('Quote draft deleted.');
        router.replace({
            pathname: '/estimate',
            params: requestedCompanyId || estimateAccess.companyId
                ? { companyId: requestedCompanyId || estimateAccess.companyId }
                : undefined,
        } as any);
    }

    async function loadPhotoPreviews(nextAnswers: EstimateAnswerSet) {
        const previewEntries = await Promise.all(
            Object.entries(nextAnswers).map(async ([key, value]) => {
                if (!isPhotoRequirementAnswer(value)) return null;

                const previewUrl = await createEstimateRequirementPhotoPreview(value);

                return previewUrl ? [key, previewUrl] as const : null;
            })
        );

        setPhotoPreviewByKey(previewEntries.reduce<Record<string, string>>((previews, entry) => {
            if (!entry) return previews;

            previews[entry[0]] = entry[1];

            return previews;
        }, {}));
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
            approvedProducts,
            technicianApproved,
            aiValidationFailed: false,
        }).choices.some((choice) => choice.id === selectedChoiceId)) {
            setSelectedChoiceId('');
        }
        setTechnicianApproved(false);
        setPresentationMode(false);
        setMessage('Item removed from estimate.');
    }

    function selectWorkType(workType: EstimateWorkType) {
        const categories = getEstimateCategoriesForWorkType(workType);
        const currentServiceCategory = getEstimateCategoryTemplate(selectedCategory).serviceCategory;
        const matchingCategory = items.length > 0
            ? categories.find((category) => category.serviceCategory === currentServiceCategory) || null
            : null;

        setSelectedWorkType(workType);
        setCustomQuoteMode(false);
        setSelectedCategory(matchingCategory?.id || categories[0]?.id || 'faucet_replacement');
        resetEstimateChecklist();
        setEstimateCategoryChosen(Boolean(matchingCategory));
        setMessage(matchingCategory
            ? `${estimateWorkTypeOptions.find((option) => option.id === workType)?.label || 'Work type'} selected for ${matchingCategory.label}.`
            : `${estimateWorkTypeOptions.find((option) => option.id === workType)?.label || 'Work type'} selected. Now choose the exact service.`);
    }

    function selectEstimateCategory(category: EstimateOptionCategory) {
        if (!selectedWorkType || !isEstimateCategoryForWorkType(category, selectedWorkType)) return;

        setSelectedCategory(category);
        setCustomQuoteMode(false);
        setEstimateCategoryChosen(true);
        resetEstimateChecklist();
        setMessage(`${getEstimateCategoryTemplate(category).label} checklist ready.`);
    }

    function resetEstimateChecklist() {
        setEstimateSession(null);
        setAnswers({});
        setPhotoPreviewByKey({});
        setRequirementUploadByKey({});
        setMeasurementDraftByKey({});
        setMeasurementErrorByKey({});
        setSelectedChoiceId('');
        setTechnicianApproved(false);
        setPresentationMode(false);
        setAiDraftWarnings([]);
        setAiDraftsByChoiceId({});
        setEditableCopyByChoiceId({});
        setPersistedOptionChoices([]);
        setRemovedChoiceIds([]);
        setPendingRemoveChoiceId('');
        setPriceAdjustmentByChoiceId({});
        setCustomPriceAdjustmentByChoiceId({});
        setPriceAdjustmentDirectionByChoiceId({});
        setPriceAdjustmentLabelByChoiceId({});
        setLinePriceAdjustmentsByChoiceId({});
        setGuidedStep('build');
        setGuidedBuildStep('work');
        setDocumentationExpanded(false);
        setRelatedSearch('');
        setGuidedAdjustmentMode('none');
        setGuidedAdjustmentValue('');
        setGuidedDiscountLabel('');
        setGuidedAdjustmentLineId('');
        setEditingGuidedOptionId('');
        setCustomQuoteMode(false);
        setCustomQuoteDraft(emptyCustomEstimateOptionDraft);
    }

    function configureDraftItem(item: EstimateDraftItem) {
        const category = inferEstimateCategoryForDraftItem([item], item.item_slug || item.id, null);
        const template = getEstimateCategoryTemplate(category);

        setSelectedWorkType(template.workType);
        setEstimateCategoryChosen(true);
        setSelectedCategory(category);
        setExpandedCategory(null);
        setExpandedWorkspaceSection(null);
        setReadinessExpanded(false);
        resetEstimateChecklist();
        setMessage(`${item.name} checklist opened.`);
    }

    function selectChoice(choice: Phase1EstimateChoice) {
        setSelectedChoiceId(choice.id);
        setOptionsWorkspaceNotice(`${choice.title} selected for the homeowner presentation.`);
        setMessage(`${choice.title} selected for technician review.`);
    }

    function viewChoiceDetails(choice: Phase1EstimateChoice) {
        setDetailChoiceId(choice.id);
        setPendingRemoveChoiceId('');
        setMessage(`${choice.title} includes ${choice.pricingResult.lineItems.map((line) => line.name).join(', ')}.`);
    }

    function removeChoice(choice: Phase1EstimateChoice) {
        if (pendingRemoveChoiceId !== choice.id) {
            setPendingRemoveChoiceId(choice.id);
            setOptionsWorkspaceNotice(`Press “Confirm Remove” to remove ${choice.title} from this quote.`);
            return;
        }

        setRemovedChoiceIds((current) => current.includes(choice.id) ? current : [...current, choice.id]);
        setPendingRemoveChoiceId('');
        setTechnicianApproved(false);
        setPresentationMode(false);
        if (selectedChoiceId === choice.id) setSelectedChoiceId('');
        if (detailChoiceId === choice.id) setDetailChoiceId('');
        setOptionsWorkspaceNotice(
            `${choice.title} removed. It will not appear in the homeowner presentation. Use Redo / Reset Options to restore it.`
        );
        setMessage(`${choice.title} removed from this quote.`);
    }

    function providerClientHomeOsPath() {
        if (!providerModeContext) return '/';

        return String(providerModePath('/', providerModeContext));
    }

    function providerCompanyDashboardPath() {
        if (!providerModeContext) return '/super-admin';

        return `/super-admin/company/${encodeURIComponent(providerModeContext.companyId)}`;
    }

    async function goBackToItem() {
        await persistLatestBuilderDraft();

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

    async function goBackToClientHomeOs() {
        await persistLatestBuilderDraft();
        router.push(providerClientHomeOsPath() as never);
    }

    async function goToCompanyDashboard() {
        await persistLatestBuilderDraft();
        router.push(providerCompanyDashboardPath() as never);
    }

    async function goBackFromEstimate() {
        await persistLatestBuilderDraft();

        const techOSReturnRoute = resolveTechOSEstimateReturnRoute({
            mode: requestedMode,
            returnTo: requestedReturnTo,
            companyId: requestedCompanyId || estimateAccess?.companyId,
        });

        if (techOSReturnRoute) {
            router.replace(techOSReturnRoute as never);
            return;
        }

        router.back();
    }

    async function openSavedDrafts() {
        await persistLatestBuilderDraft();
        router.push({
            pathname: '/estimate',
            params: { companyId: estimateAccess?.companyId || requestedCompanyId || '' },
        } as any);
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
        setAnswers((current) => {
            const next = { ...current, [question.id]: value };

            if (question.id === 'exterior_pipe_utility') {
                delete next.exterior_pipe_material;
                delete next.exterior_pipe_size;
            }

            return next;
        });
        void persistAnswerIfSessionReady(question.id, value);

        if (question.id === 'exterior_pipe_utility') {
            const sessionId = estimateSession?.category === selectedCategory ? estimateSession.id : null;

            if (sessionId) {
                void Promise.all([
                    deleteEstimateSessionAnswer(sessionId, 'exterior_pipe_material'),
                    deleteEstimateSessionAnswer(sessionId, 'exterior_pipe_size'),
                ]).catch((error) => setMessage(
                    `Previous pipe material and size could not be cleared: ${error instanceof Error ? error.message : 'Unknown error'}`
                ));
            }
        }
    }

    function toggleMultiAnswer(question: EstimateQuestionDefinition, value: string) {
        setTechnicianApproved(false);
        setPresentationMode(false);
        const nextValues = toggleEstimateMultiSelectAnswer(question, answers[question.id], value);

        setAnswers((current) => ({
            ...current,
            [question.id]: nextValues,
        }));
        void persistAnswerIfSessionReady(question.id, nextValues);
    }

    async function persistAnswerIfSessionReady(key: string, value: EstimateAnswerValue) {
        let sessionId = estimateSession?.category === selectedCategory
            ? estimateSession.id
            : null;

        if (!sessionId) {
            const resolvedSession = await resolveSessionForDraft(selectedCategory);

            if (!resolvedSession) return;
            sessionId = resolvedSession.id;
        }

        try {
            await saveEstimateSessionAnswer(sessionId, key, value);
        } catch (error) {
            setMessage(`Estimate answer could not be saved: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async function chooseRequirementPhoto(label: string, capture: boolean) {
        if (!estimateAccess) return;

        const key = photoRequirementAnswerKey(label);
        let file: File | null = null;

        try {
            file = await pickEstimateRequirementPhoto(capture);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Photo picker could not be opened.';

            setRequirementUploadByKey((current) => ({
                ...current,
                [key]: { uploading: false, error: errorMessage },
            }));
            setMessage(errorMessage);
            return;
        }

        if (!file) return;

        let uploadedAnswer: EstimateAnswerValue = null;

        setTechnicianApproved(false);
        setPresentationMode(false);
        setRequirementUploadByKey((current) => ({
            ...current,
            [key]: { uploading: true, error: null },
        }));
        setMessage(`Uploading ${label} photo...`);

        try {
            const resolvedSession = await resolveSessionForDraft(selectedCategory);

            if (!resolvedSession) {
                throw new Error('Estimate session could not be resolved for this requirement.');
            }

            uploadedAnswer = await uploadEstimateRequirementPhoto({
                companyId: resolvedSession.companyId,
                sessionId: resolvedSession.id,
                requirementLabel: label,
                file,
            });
            await saveEstimateSessionAnswer(resolvedSession.id, key, uploadedAnswer);

            setAnswers((current) => ({
                ...current,
                [key]: uploadedAnswer,
            }));
            setPhotoPreviewByKey((current) => ({
                ...current,
                [key]: createLocalPhotoPreview(file) || current[key] || '',
            }));
            setRequirementUploadByKey((current) => ({
                ...current,
                [key]: { uploading: false, error: null },
            }));
            setMessage(`${label} photo saved.`);
        } catch (error) {
            if (uploadedAnswer) {
                try {
                    await removeEstimateRequirementPhotoFile(uploadedAnswer);
                } catch {
                    // Best effort cleanup; the visible requirement remains incomplete.
                }
            }

            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            setRequirementUploadByKey((current) => ({
                ...current,
                [key]: { uploading: false, error: errorMessage },
            }));
            setMessage(`${label} photo could not be saved: ${errorMessage}`);
        }
    }

    async function removeRequirementPhoto(label: string) {
        const key = photoRequirementAnswerKey(label);
        const answer = answers[key];
        const session = await resolveSessionForDraft(selectedCategory);

        if (!session) return;

        setTechnicianApproved(false);
        setPresentationMode(false);
        setRequirementUploadByKey((current) => ({
            ...current,
            [key]: { uploading: true, error: null },
        }));

        try {
            await removeEstimateRequirementPhotoFile(answer);
            await deleteEstimateSessionAnswer(session.id, key);
            setAnswers((current) => {
                const next = { ...current };

                delete next[key];

                return next;
            });
            setPhotoPreviewByKey((current) => {
                const next = { ...current };

                delete next[key];

                return next;
            });
            setRequirementUploadByKey((current) => ({
                ...current,
                [key]: { uploading: false, error: null },
            }));
            setMessage(`${label} photo removed.`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            setRequirementUploadByKey((current) => ({
                ...current,
                [key]: { uploading: false, error: errorMessage },
            }));
            setMessage(`${label} photo could not be removed: ${errorMessage}`);
        }
    }

    async function skipRequirement(kind: RequirementKind, label: string, reason: EstimateRequirementSkipReason | null) {
        const key = kind === 'photo'
            ? photoRequirementAnswerKey(label)
            : measurementRequirementAnswerKey(label);
        const session = await resolveSessionForDraft(selectedCategory);

        if (!session) return;

        const answer = createEstimateRequirementSkipAnswer(label, reason);

        setTechnicianApproved(false);
        setPresentationMode(false);

        try {
            await saveEstimateSessionAnswer(session.id, key, answer);
            setAnswers((current) => ({
                ...current,
                [key]: answer,
            }));

            if (kind === 'photo') {
                setPhotoPreviewByKey((current) => {
                    const next = { ...current };

                    delete next[key];

                    return next;
                });
            }

            setMessage(`${label} marked skipped for now.`);
        } catch (error) {
            setMessage(`${label} skip state could not be saved: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async function clearSkippedRequirement(kind: RequirementKind, label: string) {
        const key = kind === 'photo'
            ? photoRequirementAnswerKey(label)
            : measurementRequirementAnswerKey(label);
        const session = await resolveSessionForDraft(selectedCategory);

        if (!session) return;

        setTechnicianApproved(false);
        setPresentationMode(false);

        try {
            await deleteEstimateSessionAnswer(session.id, key);
            setAnswers((current) => {
                const next = { ...current };

                delete next[key];

                return next;
            });
            setMessage(`${label} skip state cleared.`);
        } catch (error) {
            setMessage(`${label} skip state could not be cleared: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    function updateMeasurementDraft(label: string, value: string) {
        const key = measurementRequirementAnswerKey(label);

        setMeasurementDraftByKey((current) => ({
            ...current,
            [key]: value,
        }));
        setMeasurementErrorByKey((current) => ({
            ...current,
            [key]: '',
        }));
    }

    async function saveRequirementMeasurement(label: string) {
        const key = measurementRequirementAnswerKey(label);
        const validation = validateRequirementMeasurement(label, measurementDraftByKey[key] || '');

        if (validation.error) {
            setMeasurementErrorByKey((current) => ({
                ...current,
                [key]: validation.error || '',
            }));
            return;
        }

        const session = await resolveSessionForDraft(selectedCategory);

        if (!session || validation.value === null) return;

        const answer: EstimateRequirementMeasurementAnswer = {
            kind: 'requirement_measurement',
            value: validation.value,
            unit: validation.unit,
            capturedAt: new Date().toISOString(),
        };

        setTechnicianApproved(false);
        setPresentationMode(false);

        try {
            await saveEstimateSessionAnswer(session.id, key, answer);
            setAnswers((current) => ({
                ...current,
                [key]: answer,
            }));
            setMeasurementErrorByKey((current) => ({
                ...current,
                [key]: '',
            }));
            setMessage(`${label} measurement saved.`);
        } catch (error) {
            setMeasurementErrorByKey((current) => ({
                ...current,
                [key]: error instanceof Error ? error.message : 'Measurement could not be saved.',
            }));
        }
    }

    async function clearRequirementMeasurement(label: string) {
        const key = measurementRequirementAnswerKey(label);
        const session = await resolveSessionForDraft(selectedCategory);

        if (!session) return;

        setTechnicianApproved(false);
        setPresentationMode(false);

        try {
            await deleteEstimateSessionAnswer(session.id, key);
            setAnswers((current) => {
                const next = { ...current };

                delete next[key];

                return next;
            });
            setMeasurementDraftByKey((current) => ({
                ...current,
                [key]: '',
            }));
            setMeasurementErrorByKey((current) => ({
                ...current,
                [key]: '',
            }));
            setMessage(`${label} measurement cleared.`);
        } catch (error) {
            setMeasurementErrorByKey((current) => ({
                ...current,
                [key]: error instanceof Error ? error.message : 'Measurement could not be cleared.',
            }));
        }
    }

    function hasRequirementUploadInProgress() {
        return Object.values(requirementUploadByKey).some((state) => state.uploading);
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

    function setChoicePriceAdjustment(choiceId: string, percentage: number, adjustmentLabel: string | null) {
        const nextPercentage = normalizeEstimatePriceAdjustmentPercentage(percentage);
        const isDiscount = nextPercentage < 0;
        const normalizedLabel = isDiscount ? String(adjustmentLabel || '').trim() : '';

        setTechnicianApproved(false);
        setPresentationMode(false);
        setPriceAdjustmentByChoiceId((current) => ({
            ...current,
            [choiceId]: nextPercentage,
        }));
        setCustomPriceAdjustmentByChoiceId((current) => ({
            ...current,
            [choiceId]: nextPercentage === 0 ? '' : String(Math.abs(nextPercentage)),
        }));
        setPriceAdjustmentDirectionByChoiceId((current) => ({
            ...current,
            [choiceId]: isDiscount ? 'discount' : 'increase',
        }));
        setPriceAdjustmentLabelByChoiceId((current) => {
            const next = { ...current };

            if (normalizedLabel) next[choiceId] = normalizedLabel;
            else delete next[choiceId];

            return next;
        });
        const adjustmentDescription = isDiscount
            ? `${formatEstimatePriceAdjustmentPercentage(nextPercentage)} ${normalizedLabel}`
            : `${formatEstimatePriceAdjustmentPercentage(nextPercentage)} increase`;

        setOptionsWorkspaceNotice(nextPercentage === 0
            ? 'Option restored to its original company price-book amount.'
            : `Price adjustment changed to ${adjustmentDescription}.`);
        setMessage(nextPercentage === 0
            ? 'Option price reset to the company price-book amount.'
            : isDiscount
                ? `${normalizedLabel} applied at ${formatEstimatePriceAdjustmentPercentage(nextPercentage)}.`
                : `Option price increased by ${formatEstimatePriceAdjustmentPercentage(nextPercentage)}.`);
    }

    function resetChoicePrice(choice: Phase1EstimateChoice) {
        setTechnicianApproved(false);
        setPresentationMode(false);
        setPriceAdjustmentByChoiceId((current) => {
            const next = { ...current };

            delete next[choice.id];

            return next;
        });
        setCustomPriceAdjustmentByChoiceId((current) => {
            const next = { ...current };

            delete next[choice.id];

            return next;
        });
        setPriceAdjustmentDirectionByChoiceId((current) => ({
            ...current,
            [choice.id]: 'increase',
        }));
        setPriceAdjustmentLabelByChoiceId((current) => {
            const next = { ...current };

            delete next[choice.id];

            return next;
        });
        setOptionsWorkspaceNotice(
            `${choice.title} reset to ${formatMoney(phase1Workspace.choices.find((candidate) => candidate.id === choice.id)?.pricingResult.totalAmount || 0)}.`
        );
        setMessage('Option price reset to the company price-book amount.');
    }

    function applyCustomChoicePriceAdjustment(choiceId: string) {
        const draft = customPriceAdjustmentByChoiceId[choiceId] || '';
        const magnitude = Math.abs(Number(draft));
        const direction = priceAdjustmentDirectionByChoiceId[choiceId] || 'increase';

        if (!Number.isFinite(magnitude) || magnitude <= 0) {
            setMessage('Enter a percentage greater than 0.');
            return;
        }

        if (direction === 'discount') {
            const discountLabel = String(priceAdjustmentLabelByChoiceId[choiceId] || '').trim();

            if (magnitude > 100) {
                setMessage('A discount cannot be greater than 100%.');
                return;
            }

            if (!discountLabel) {
                setMessage('Choose or enter a discount name before applying the discount.');
                return;
            }

            setChoicePriceAdjustment(choiceId, -magnitude, discountLabel);
            return;
        }

        if (magnitude > 500) {
            setMessage('A price increase cannot be greater than 500%.');
            return;
        }

        setChoicePriceAdjustment(choiceId, magnitude, null);
    }

    function setChoiceLinePriceAdjustment(
        choiceId: string,
        line: EstimateCalculatedLine,
        adjustment: EstimateLinePriceAdjustment | null,
    ) {
        const normalizedPercentage = adjustment
            ? normalizeEstimatePriceAdjustmentPercentage(adjustment.percentage)
            : 0;

        setTechnicianApproved(false);
        setPresentationMode(false);
        setLinePriceAdjustmentsByChoiceId((current) => {
            const choiceAdjustments = { ...(current[choiceId] || {}) };

            if (adjustment && normalizedPercentage !== 0) {
                choiceAdjustments[line.id] = {
                    ...adjustment,
                    percentage: normalizedPercentage,
                    label: String(adjustment.label || '').trim() || null,
                };
            } else {
                delete choiceAdjustments[line.id];
            }

            const next = { ...current };

            next[choiceId] = choiceAdjustments;

            return next;
        });

        if (!adjustment || normalizedPercentage === 0) {
            setMessage(`${line.name} restored to its company price-book amount.`);
            return;
        }

        const adjustmentDescription = adjustment.mode === 'discount'
            ? `${formatEstimatePriceAdjustmentPercentage(normalizedPercentage)} ${adjustment.label || 'discount'}`
            : adjustment.mode === 'markup'
                ? `${formatEstimatePriceAdjustmentPercentage(normalizedPercentage)} markup`
                : 'authorized price override';

        setMessage(`${line.name}: ${adjustmentDescription} applied.`);
    }

    function selectGuidedAdjustmentLine(
        choice: Phase1EstimateChoice,
        line: EstimateCalculatedLine,
        finalChoice?: Phase1EstimateChoice,
    ) {
        const adjustment = linePriceAdjustmentsByChoiceId[choice.id]?.[line.id]
            || choice.linePriceAdjustments?.[line.id];
        const displayedChoice = finalChoice || (currentCandidateChoice?.id === choice.id ? currentCandidateChoice : null);
        const finalLine = displayedChoice
            ? displayedChoice.pricingResult.lineItems.find((candidate) => candidate.id === line.id)
            : null;

        setGuidedAdjustmentLineId(line.id);
        setGuidedAdjustmentMode(adjustment?.mode || 'none');
        setGuidedAdjustmentValue(adjustment
            ? adjustment.mode === 'override'
                ? String(finalLine?.totalAmount ?? line.totalAmount)
                : String(Math.abs(adjustment.percentage))
            : '');
        setGuidedDiscountLabel(String(adjustment?.label || ''));
    }

    function applyGuidedPriceAdjustment(choice: Phase1EstimateChoice) {
        const baseLine = choice.pricingResult.lineItems.find((line) => line.id === guidedAdjustmentLineId)
            || choice.pricingResult.lineItems[0];

        if (!baseLine) {
            setMessage('Select a service before adjusting its price.');
            return;
        }

        if (guidedAdjustmentMode === 'none') {
            setChoiceLinePriceAdjustment(choice.id, baseLine, null);
            setGuidedAdjustmentValue('');
            setGuidedDiscountLabel('');
            return;
        }

        const enteredValue = Number(guidedAdjustmentValue);

        if (!Number.isFinite(enteredValue) || enteredValue <= 0) {
            setMessage(guidedAdjustmentMode === 'override'
                ? 'Enter the authorized final option price.'
                : 'Enter a percentage greater than 0.');
            return;
        }

        if (guidedAdjustmentMode === 'discount') {
            const label = guidedDiscountLabel.trim();

            if (!label) {
                setMessage('Name the discount before applying it.');
                return;
            }

            if (enteredValue > 100) {
                setMessage('A discount cannot be greater than 100%.');
                return;
            }

            setChoiceLinePriceAdjustment(choice.id, baseLine, {
                percentage: -enteredValue,
                mode: 'discount',
                label,
            });
            return;
        }

        if (guidedAdjustmentMode === 'markup') {
            if (enteredValue > 500) {
                setMessage('A markup cannot be greater than 500%.');
                return;
            }

            setChoiceLinePriceAdjustment(choice.id, baseLine, {
                percentage: enteredValue,
                mode: 'markup',
            });
            return;
        }

        const percentage = baseLine.totalAmount > 0
            ? ((enteredValue - baseLine.totalAmount) / baseLine.totalAmount) * 100
            : 0;

        setChoiceLinePriceAdjustment(
            choice.id,
            baseLine,
            {
                percentage,
                mode: 'override',
                label: percentage < 0 ? 'Authorized Price Override' : null,
            },
        );
        setMessage(`${baseLine.name} authorized price set to ${formatMoney(enteredValue)}. Management approval applies when company limits are exceeded.`);
    }

    async function addCurrentChoiceToOptions(choice: Phase1EstimateChoice) {
        const nextId = nextGuidedOptionId(persistedOptionChoices);
        const baseChoice = phase1Workspace.choices.find((candidate) => candidate.id === choice.id);
        const nextChoice: PersistableEstimateChoice = {
            ...choice,
            id: nextId,
            displayOrder: persistedOptionChoices.length + 1,
            basePricingResult: baseChoice?.pricingResult || choice.pricingResult,
            priceAdjustmentPercentage: priceAdjustmentByChoiceId[choice.id] || 0,
            priceAdjustmentLabel: priceAdjustmentLabelByChoiceId[choice.id] || null,
            linePriceAdjustments: linePriceAdjustmentsByChoiceId[choice.id] || choice.linePriceAdjustments || {},
        };

        await persistGuidedOptions(
            [...persistedOptionChoices, nextChoice],
            `${nextChoice.title} added as Option ${persistedOptionChoices.length + 1}.`,
            'option_added',
        );
    }

    function navigateGuidedBuildStep(nextStep: GuidedBuildStep) {
        setGuidedStep('build');
        setGuidedBuildStep(nextStep);
        router.setParams({ step: nextStep } as any);
    }

    function navigateGuidedStep(nextStep: GuidedEstimateStep) {
        setGuidedStep(nextStep);

        const builderStep = nextStep === 'build' ? guidedBuildStep : nextStep;
        router.setParams({ step: builderStep } as any);
    }

    function startCustomQuote() {
        setCustomQuoteDraft(emptyCustomEstimateOptionDraft);
        setCustomQuoteMode(true);
        setScopePickerExpanded(false);
        navigateGuidedBuildStep('price');
        setMessage('Custom Quote opened. Enter only the work and exact price you intend to present.');
    }

    function cancelCustomQuote() {
        setCustomQuoteMode(false);
        setCustomQuoteDraft(emptyCustomEstimateOptionDraft);
        setGuidedAdjustmentLineId('');

        if (persistedOptionChoices.length > 0) {
            navigateGuidedStep('review');
            return;
        }

        navigateGuidedBuildStep('work');
    }

    function updateCustomQuoteDraft(field: keyof CustomEstimateOptionDraft, value: string) {
        setCustomQuoteDraft((current) => ({ ...current, [field]: value }));
        setTechnicianApproved(false);
        setPresentationMode(false);
    }

    async function addCustomQuoteToOptions() {
        const result = buildCustomEstimateChoice({
            id: nextGuidedOptionId(persistedOptionChoices),
            displayOrder: persistedOptionChoices.length + 1,
            draft: customQuoteDraft,
        });

        if (!result.choice) {
            setMessage(result.error || 'The custom quote is incomplete.');
            return;
        }

        const saved = await persistGuidedOptions(
            [...persistedOptionChoices, result.choice],
            `${result.choice.title} added as Option ${persistedOptionChoices.length + 1}.`,
            'option_added',
        );

        if (saved) {
            setCustomQuoteMode(false);
            setCustomQuoteDraft(emptyCustomEstimateOptionDraft);
        }
    }

    async function addRecommendedOption(
        recommendation: EligibleEstimateRecommendation,
        baseChoice: PersistableEstimateChoice,
    ) {
        if (!estimateAccess) return;

        const nextChoice = buildRecommendedEstimateChoice({
            id: nextGuidedOptionId(persistedOptionChoices),
            companyId: estimateAccess.companyId,
            baseChoice,
            recommendation,
            priceBookItems,
            displayOrder: persistedOptionChoices.length + 1,
        });

        if (!nextChoice) {
            setMessage('That option could not be priced from the active company Price Book.');
            return;
        }

        await persistGuidedOptions(
            [...persistedOptionChoices, nextChoice],
            `${nextChoice.title} added as Option ${persistedOptionChoices.length + 1}.`,
            'option_added',
        );
    }

    async function addSearchedPriceBookOption(
        item: CompanyPriceBookItem,
        baseChoice: PersistableEstimateChoice,
    ) {
        const recommendation: EligibleEstimateRecommendation = {
            id: `manual-${item.price_key}`,
            categories: [selectedCategory],
            title: item.name,
            reason: 'The technician selected this active company Price Book item as a separate customer choice.',
            relationship: 'alternative',
            priceKeys: [item.price_key],
            supersedesPriceKeys: baseChoice.pricingResult.lineItems.map((line) => line.code),
            availablePriceKeys: [item.price_key],
            priority: 100,
        };

        await addRecommendedOption(recommendation, baseChoice);
    }

    async function removeGuidedOption(choiceId: string) {
        const nextChoices = persistedOptionChoices
            .filter((choice) => choice.id !== choiceId)
            .map((choice, index) => ({ ...choice, displayOrder: index + 1 }));

        if (nextChoices.length === 0) navigateGuidedBuildStep('price');
        if (editingGuidedOptionId === choiceId) setEditingGuidedOptionId('');

        await persistGuidedOptions(
            nextChoices,
            'Option removed from this estimate.',
            nextChoices.length > 0 ? 'review' : 'build',
        );
    }

    async function persistGuidedOptions(
        nextChoices: PersistableEstimateChoice[],
        successMessage: string,
        nextStep: GuidedEstimateStep,
    ) {
        if (savingGuidedOption) return false;

        setSavingGuidedOption(true);
        setMessage('Saving estimate options...');

        try {
            const session = await resolveSessionForDraft(selectedCategory);

            if (!session) return false;

            const normalizedChoices = normalizeCompleteEstimateOptionSet(nextChoices, selectedCategory);

            const selectedSavedChoiceId = normalizedChoices.some((choice) => choice.id === selectedChoiceId)
                ? selectedChoiceId
                : null;

            await saveEstimateOptionSet({
                sessionId: session.id,
                options: normalizedChoices,
                selectedSourceChoiceId: selectedSavedChoiceId,
                technicianApproved: false,
            });
            setPersistedOptionChoices(normalizedChoices);
            setTechnicianApproved(false);
            navigateGuidedStep(nextStep);
            setRelatedSearch('');
            setMessage(successMessage);
            return true;
        } catch (error) {
            setMessage(`Estimate options could not be saved: ${readEstimateErrorMessage(error, 'The estimate could not be saved.')}`);
            return false;
        } finally {
            setSavingGuidedOption(false);
        }
    }

    function beginGuidedOptionEdit(baseChoice: Phase1EstimateChoice, finalChoice: Phase1EstimateChoice) {
        const effectiveLineAdjustments = Object.prototype.hasOwnProperty.call(
            linePriceAdjustmentsByChoiceId,
            baseChoice.id,
        )
            ? linePriceAdjustmentsByChoiceId[baseChoice.id] || {}
            : baseChoice.linePriceAdjustments || {};

        editingGuidedOptionSnapshotRef.current = {
            choiceId: baseChoice.id,
            editableCopy: editableCopyByChoiceId[baseChoice.id]
                ? { ...editableCopyByChoiceId[baseChoice.id] }
                : null,
            linePriceAdjustments: Object.fromEntries(
                Object.entries(effectiveLineAdjustments).map(([lineId, adjustment]) => [lineId, { ...adjustment }]),
            ),
            presentationMode,
            technicianApproved,
        };
        setEditingGuidedOptionId(baseChoice.id);

        const firstLine = baseChoice.pricingResult.lineItems[0];

        if (firstLine) selectGuidedAdjustmentLine(baseChoice, firstLine, finalChoice);
    }

    function closeGuidedOptionEditor() {
        setEditingGuidedOptionId('');
        setGuidedAdjustmentLineId('');
        setGuidedAdjustmentMode('none');
        setGuidedAdjustmentValue('');
        setGuidedDiscountLabel('');
        editingGuidedOptionSnapshotRef.current = null;
    }

    function cancelGuidedOptionEdit() {
        const snapshot = editingGuidedOptionSnapshotRef.current;

        if (snapshot) {
            setLinePriceAdjustmentsByChoiceId((current) => ({
                ...current,
                [snapshot.choiceId]: snapshot.linePriceAdjustments,
            }));
            setEditableCopyByChoiceId((current) => {
                const next = { ...current };

                if (snapshot.editableCopy) next[snapshot.choiceId] = snapshot.editableCopy;
                else delete next[snapshot.choiceId];

                return next;
            });
            setPresentationMode(snapshot.presentationMode);
            setTechnicianApproved(snapshot.technicianApproved);
        }

        closeGuidedOptionEditor();
    }

    async function saveGuidedOptionEdits(workspaceChoices: Phase1EstimateChoice[], choiceId: string) {
        const savedOptions = workspaceChoices.map((choice) => {
            const baseChoice = estimateChoiceBases.find((candidate) => candidate.id === choice.id);
            const effectiveAdjustments = linePriceAdjustmentsByChoiceId[choice.id] || choice.linePriceAdjustments || {};
            const validLineIds = new Set(baseChoice?.pricingResult.lineItems.map((line) => line.id) || []);
            const validLineAdjustments = Object.fromEntries(
                Object.entries(effectiveAdjustments).filter(([lineId]) => validLineIds.has(lineId)),
            );

            return {
                ...choice,
                basePricingResult: baseChoice?.pricingResult || choice.pricingResult,
                priceAdjustmentPercentage: priceAdjustmentByChoiceId[choice.id] || 0,
                priceAdjustmentLabel: priceAdjustmentLabelByChoiceId[choice.id] || null,
                linePriceAdjustments: validLineAdjustments,
            };
        });
        const editedChoice = workspaceChoices.find((choice) => choice.id === choiceId);
        const saved = await persistGuidedOptions(
            savedOptions,
            `${editedChoice?.title || 'Option'} updated.`,
            'review',
        );

        if (saved) closeGuidedOptionEditor();
    }

    function redoOptionDrafts() {
        setSelectedChoiceId('');
        setDetailChoiceId('');
        setRemovedChoiceIds([]);
        setPendingRemoveChoiceId('');
        setTechnicianApproved(false);
        setPresentationMode(false);
        setAiDraftWarnings([]);
        setAiDraftsByChoiceId({});
        setEditableCopyByChoiceId({});
        setPersistedOptionChoices([]);
        setPriceAdjustmentByChoiceId({});
        setCustomPriceAdjustmentByChoiceId({});
        setPriceAdjustmentDirectionByChoiceId({});
        setPriceAdjustmentLabelByChoiceId({});
        setLinePriceAdjustmentsByChoiceId({});
        setGuidedAdjustmentLineId('');
        setEditingGuidedOptionId('');
        setOptionsWorkspaceNotice('All options were rebuilt from the current checklist and original company price-book amounts.');
        setMessage('Options reset to the current checklist and company price-book values.');
    }

    async function approveForPresentation(workspaceChoices: Phase1EstimateChoice[]) {
        if (workspaceChoices.length === 0) {
            setMessage('Pricing setup required before presentation.');
            return;
        }

        const unnamedDiscount = workspaceChoices.find((choice) => {
            const choiceDiscountNeedsName = Number(choice.priceAdjustmentPercentage || 0) < 0 &&
                !String(choice.priceAdjustmentLabel || '').trim();
            const lineDiscountNeedsName = Object.values(choice.linePriceAdjustments || {}).some((adjustment) =>
                Number(adjustment.percentage || 0) < 0 && !String(adjustment.label || '').trim()
            );

            return choiceDiscountNeedsName || lineDiscountNeedsName;
        });

        if (unnamedDiscount) {
            setOptionsWorkspaceNotice(`Name the discount on ${unnamedDiscount.title} before approving the option set.`);
            setMessage('Every discount must have a name before homeowner presentation.');
            return;
        }

        setOptionsWorkspaceNotice('Saving approved option set...');

        try {
            const session = await resolveSessionForDraft(selectedCategory);

            if (!session) return;

            const savedOptions = normalizeCompleteEstimateOptionSet(workspaceChoices, selectedCategory).map((choice) => ({
                ...choice,
                basePricingResult: (
                    choiceSource.find((candidate) => candidate.id === choice.id) as PersistableEstimateChoice | undefined
                )?.basePricingResult || choiceSource.find((candidate) => candidate.id === choice.id)?.pricingResult,
                priceAdjustmentPercentage: priceAdjustmentByChoiceId[choice.id] || 0,
                priceAdjustmentLabel: priceAdjustmentLabelByChoiceId[choice.id] || null,
            }));

            await saveEstimateOptionSet({
                sessionId: session.id,
                options: savedOptions,
                selectedSourceChoiceId: selectedChoiceId || null,
                technicianApproved: true,
            });
            setEstimateSession(session);
            setPersistedOptionChoices(savedOptions);
            setTechnicianApproved(true);
            setOptionsWorkspaceNotice('Option set saved and approved. It is ready for homeowner presentation.');
            setMessage('Technician-approved option set saved.');
        } catch (error) {
            setTechnicianApproved(false);
            setOptionsWorkspaceNotice(`Could not save approval: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async function openHomeownerApproval() {
        if (!technicianApproved) {
            setOptionsWorkspaceNotice('Approve the option set before presenting it to the homeowner.');
            return;
        }

        try {
            const session = await resolveSessionForDraft(selectedCategory);

            if (!session) return;
            setOptionsWorkspaceOpen(false);
            router.push(buildEstimateJobWorkflowRoute({
                estimateSessionId: session.id,
                mode: requestedMode,
                returnTo: requestedReturnTo,
                companyId: requestedCompanyId || estimateAccess?.companyId,
            }) as never);
        } catch (error) {
            setOptionsWorkspaceNotice(`Could not open homeowner approval: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
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

        try {
            const serverDraft = await loadCompanyEstimateBuilderDraft(result.session.id);

            if (serverDraft) {
                setQuoteNumber(serverDraft.quoteNumber);

                if (
                    hydratedDraftSessionIdRef.current !== serverDraft.id &&
                    hasEstimateBuilderSnapshot(serverDraft.builderState)
                ) {
                    const restoredState = readPersistedEstimateBuilderState(serverDraft.builderState);

                    if (restoredState) {
                        applyPersistedBuilderState(restoredState, serverDraft.currentBuilderStep);
                        setEstimateSession(mapBuilderDraftToEstimateSession(serverDraft));
                        hydratedDraftSessionIdRef.current = serverDraft.id;
                        await Promise.all([
                            loadPersistedAnswers(serverDraft.id, restoredState.measurementDraftByKey),
                            loadPersistedOptionSet(serverDraft.id, true),
                        ]);
                        setDraftSaveStatus('saved');
                        return result.session;
                    }
                }
            }
        } catch (error) {
            setMessage(`Quote number could not be restored: ${readEstimateErrorMessage(error, 'Draft unavailable.')}`);
        }

        const nextDraftContext: EstimateDraftContext = {
            estimate_session_id: result.session.id,
            estimate_category: category,
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
        await persistLocalAnswersToSession(result.session.id);
        hydratedDraftSessionIdRef.current = result.session.id;
        setDraftSaveStatus('saved');

        return result.session;
    }

    async function persistLocalAnswersToSession(sessionId: string) {
        await Promise.all(Object.entries(answers).map(async ([key, value]) => {
            if (value === null || value === undefined) return;

            await saveEstimateSessionAnswer(sessionId, key, value);
        }));
    }

    function updateGuidedTechnicianNotes(value: string) {
        setDraftContext((current) => current ? {
            ...current,
            issue_summary: value,
            updated_at: new Date().toISOString(),
        } : current);
        setTechnicianApproved(false);
    }

    async function saveGuidedTechnicianNotes() {
        if (!estimateAccess || !draftContext) return;

        try {
            await saveEstimateDraftContext(draftContext, {
                userId: estimateAccess.userId,
                companyId: estimateAccess.companyId,
                propertyId: draftContext.property_id || requestedPropertyId,
            });
        } catch (error) {
            setMessage(`Technician notes could not be saved: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async function draftWithAi(workspaceChoices: Phase1EstimateChoice[], draftGate: EstimateDraftGate) {
        if (!estimateAccess) return;

        if (hasRequirementUploadInProgress()) {
            setMessage('Wait for photo uploads to finish before drafting with AI.');
            return;
        }

        if (!draftGate.canDraft) {
            setMessage(`AI drafting needs: ${draftGate.blockers.join(' ')}`);
            return;
        }

        if (workspaceChoices.length < 1) {
            setMessage('At least one deterministic priced option is required before AI drafting.');
            return;
        }

        setAiDrafting(true);
        setAiDraftWarnings([]);
        setMessage('Drafting option copy...');

        try {
            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();

            if (sessionError || !session) {
                const warning = formatAiDraftWarning(sessionError?.message || 'Sign in again.');

                setAiDraftWarnings([warning]);
                setMessage(warning);
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
                warnings: [
                    ...draftGate.warnings,
                    ...draftGate.assumptionsUsedInDraft.map((assumption) => `Assumption: ${assumption}`),
                    ...workspaceChoices.flatMap((choice) => choice.pricingResult.warnings),
                ],
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

                const warning = formatAiDraftWarning(messageText);

                setAiDraftWarnings([warning]);
                setMessage(warning);
                return;
            }

            const validation = validateAiEstimateDraftResponse(data, referenceContext);

            if (!validation.valid) {
                const warning = formatAiDraftWarning(validation.errors[0] || 'The returned draft did not pass the app safety check.');

                setAiDraftWarnings([warning]);
                setMessage(warning);
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
            setAiDraftWarnings([]);
            setMessage('AI wording is ready for technician review.');
        } catch (error) {
            const warning = formatAiDraftWarning(error instanceof Error ? error.message : 'Unknown error');

            setAiDraftWarnings([warning]);
            setMessage(warning);
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
        approvedProducts,
        technicianApproved,
        aiValidationFailed: false,
    });
    const estimateScopeSelected = Boolean(
        selectedWorkType &&
        estimateCategoryChosen &&
        isEstimateCategoryForWorkType(selectedCategory, selectedWorkType)
    );
    const focusedPriceBookItem = findEstimatePriceBookCatalogItem(items, phase1Workspace.template.label);
    const estimateReturnRoute = buildInternalRoute('/estimate/workspace', [
        ['companyId', requestedCompanyId],
        ['propertyId', requestedPropertyId],
        ['itemSlug', requestedItemSlug],
        ['mode', requestedMode],
        ['providerMode', firstParam(providerMode)],
        ['returnTo', requestedReturnTo],
        ['serviceRequestId', firstParam(serviceRequestId)],
        ['scheduleSlotId', firstParam(scheduleSlotId)],
        ['jobId', firstParam(jobId)],
        ['estimateSessionId', activeDraftSessionId],
        ['step', currentBuilderStep],
    ]);
    const companyPriceBookRoute = buildInternalRoute(
        `/super-admin/company/${encodeURIComponent(estimateAccess.companyId)}/price-book`,
        [
            ['focusPriceKey', focusedPriceBookItem?.price_key],
            ['returnTo', estimateReturnRoute],
        ]
    );
    const decorateEstimateChoice = (choice: PersistableEstimateChoice) => {
        const baseChoice = restoreCompatibleEstimateChoiceBasePricing(choice);
        const editedChoice = synchronizeCustomEstimateChoiceCopy(applyEditableChoiceCopy(
            baseChoice,
            aiDraftsByChoiceId[choice.id],
            editableCopyByChoiceId[choice.id]
        ));
        const priceAdjustmentPercentage = priceAdjustmentByChoiceId[choice.id] || 0;
        const linePriceAdjustments = linePriceAdjustmentsByChoiceId[choice.id]
            || choice.linePriceAdjustments
            || {};
        const optionAdjustedChoice = applyEstimateChoicePriceAdjustment(editedChoice, priceAdjustmentPercentage);
        const lineAdjustedChoice = applyEstimateChoiceLinePriceAdjustments(optionAdjustedChoice, linePriceAdjustments);

        return synchronizeCustomEstimateChoiceCopy({
            ...lineAdjustedChoice,
            priceAdjustmentPercentage,
            priceAdjustmentLabel: priceAdjustmentLabelByChoiceId[choice.id] || null,
            linePriceAdjustments,
        });
    };
    const candidateEstimateChoices = phase1Workspace.choices.map(decorateEstimateChoice);
    const currentCandidateChoice = candidateEstimateChoices.find((choice) => choice.id === selectedChoiceId)
        || candidateEstimateChoices.find((choice) => choice.kind === 'individual')
        || candidateEstimateChoices[0]
        || null;
    const choiceSource: PersistableEstimateChoice[] = persistedOptionChoices.length > 0
        ? persistedOptionChoices
        : phase1Workspace.choices;
    const estimateChoiceBases = choiceSource.map((choice) => restoreCompatibleEstimateChoiceBasePricing(choice));
    const allEstimateChoices = choiceSource.map(decorateEstimateChoice);
    const hasPersistedCustomChoice = persistedOptionChoices.some(isCustomEstimateChoice);
    const estimateChoices = estimateScopeSelected || hasPersistedCustomChoice
        ? allEstimateChoices.filter((choice) => !removedChoiceIds.includes(choice.id))
        : [];
    const optionChoices = estimateChoices.filter((choice) => choice.kind === 'individual');
    const bundleChoices = estimateChoices.filter((choice) => choice.kind === 'package');
    const selectedChoice = estimateChoices.find((choice) => choice.id === selectedChoiceId) || null;
    const detailChoice = estimateChoices.find((choice) => choice.id === detailChoiceId) || null;
    const requirementUploadInProgress = hasRequirementUploadInProgress();
    const missingQuestionCount = phase1Workspace.answerValidation.missingRequiredQuestionLabels.length;
    const missingPhotoCount = phase1Workspace.answerValidation.missingRequiredPhotoLabels.length;
    const missingMeasurementCount = phase1Workspace.answerValidation.missingRequiredMeasurementLabels.length;
    const readinessIssueLabels = [
        missingQuestionCount > 0 ? `${missingQuestionCount} question${missingQuestionCount === 1 ? '' : 's'}` : '',
        missingPhotoCount > 0 ? `${missingPhotoCount} photo${missingPhotoCount === 1 ? '' : 's'}` : '',
        missingMeasurementCount > 0 ? `${missingMeasurementCount} measurement${missingMeasurementCount === 1 ? '' : 's'}` : '',
        phase1Workspace.pricingSetupRequired ? 'pricing' : '',
    ].filter(Boolean);
    const readinessHeadline = readinessIssueLabels.length > 0
        ? `${readinessIssueLabels.join(' / ')} still needed`
        : 'Field requirements and deterministic pricing are complete';
    const editorStatusHeadline = readinessIssueLabels.length > 0
        ? readinessHeadline
        : phase1Workspace.presentationGate.blockers[0] || readinessHeadline;
    const activeDraftItem = requestedItemSlug
        ? items.find((item) => item.item_slug === requestedItemSlug || item.id === requestedItemSlug) || items[0] || null
        : items[0] || null;
    const recommendationBaseChoice = persistedOptionChoices[0] || null;
    const recommendationPriceKeys = recommendationBaseChoice
        ? recommendationBaseChoice.pricingResult.lineItems.map((line) => line.code)
        : currentCandidateChoice?.pricingResult.lineItems.map((line) => line.code) || [];
    const eligibleRecommendations = getEligibleEstimateRecommendations({
        category: selectedCategory,
        answers,
        currentPriceKeys: recommendationPriceKeys,
        priceBookItems,
    });
    const normalizedRelatedSearch = relatedSearch.trim().toLowerCase();
    const relatedSearchResults = normalizedRelatedSearch.length < 2
        ? []
        : priceBookItems
            .filter((item) => item.active && Number(item.recommended_selling_price ?? item.base_price) > 0)
            .filter((item) => !recommendationPriceKeys.includes(item.price_key))
            .filter((item) => [item.name, item.category, item.customer_description]
                .some((value) => String(value || '').toLowerCase().includes(normalizedRelatedSearch)))
            .slice(0, 8);

    if (isGuidedEstimateBuilderEnabled()) return renderGuidedEstimateBuilder({
        activeDraftItem,
        aiDrafting,
        answers,
        approveForPresentation,
        canManagePricing: canManageEstimatePricing(estimateAccess),
        canUsePricing: canUseEstimatePricing(estimateAccess),
        categoryPickerExpanded: scopePickerExpanded,
        chooseRequirementPhoto,
        clearCurrentDraft,
        clearSkippedRequirement,
        clearRequirementMeasurement,
        companyPriceBookRoute,
        candidateEstimateChoices,
        currentCandidateChoice,
        documentationExpanded,
        draftContext,
        eligibleRecommendations,
        estimateAccess,
        estimateChoiceBases,
        estimateChoices,
        estimateScopeSelected,
        getCategoriesForWorkType: getEstimateCategoriesForWorkType,
        goBackFromEstimate,
        goBackToClientHomeOs,
        goBackToItem,
        goToCompanyDashboard,
        guidedAdjustmentMode,
        guidedAdjustmentLineId,
        guidedAdjustmentValue,
        guidedBuildStep,
        guidedDiscountLabel,
        guidedStep,
        customQuoteDraft,
        customQuoteMode,
        editingGuidedOptionId,
        items,
        measurementDraftByKey,
        measurementErrorByKey,
        message,
        quoteNumber,
        draftSaveStatus,
        openSavedDrafts,
        openHomeownerApproval,
        persistAddCurrent: addCurrentChoiceToOptions,
        persistAddCustom: addCustomQuoteToOptions,
        persistAddRecommendation: addRecommendedOption,
        persistAddSearchResult: addSearchedPriceBookOption,
        persistRemoveOption: removeGuidedOption,
        beginGuidedOptionEdit,
        cancelGuidedOptionEdit,
        saveGuidedOptionEdits,
        phase1Workspace,
        approvedProductMessage,
        photoPreviewByKey,
        priceBookItems,
        priceBookMessage,
        providerModeContext: Boolean(providerModeContext),
        recommendationBaseChoice,
        relatedSearch,
        relatedSearchResults,
        removeRequirementPhoto,
        requestedMode,
        requirementUploadByKey,
        requirementUploadInProgress,
        saveRequirementMeasurement,
        savingGuidedOption,
        scrollRef: estimateScrollRef,
        selectEstimateCategory,
        selectCandidateChoice: (choiceId) => {
            setSelectedChoiceId(choiceId);
            setGuidedAdjustmentMode('none');
            setGuidedAdjustmentValue('');
            setGuidedDiscountLabel('');
            setGuidedAdjustmentLineId('');
        },
        selectGuidedAdjustmentLine,
        selectedCategory,
        selectedWorkType,
        selectWorkType,
        setCategoryPickerExpanded: setScopePickerExpanded,
        setDocumentationExpanded,
        setGuidedAdjustmentMode,
        setGuidedAdjustmentValue,
        setGuidedBuildStep: navigateGuidedBuildStep,
        setGuidedDiscountLabel,
        setGuidedStep: navigateGuidedStep,
        startCustomQuote,
        cancelCustomQuote,
        setRelatedSearch,
        skipRequirement,
        technicianApproved,
        updateAnswer,
        updateChoiceCopy,
        updateCustomQuoteDraft,
        updateGuidedTechnicianNotes,
        updateMeasurementDraft,
        toggleMultiAnswer,
        applyGuidedPriceAdjustment,
        draftWithAi,
        saveGuidedTechnicianNotes,
    });

    return (
        <ScrollView
            ref={estimateScrollRef}
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View ref={estimateContentRef} style={{ width: '100%', maxWidth: 1200 }}>
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

                            <TouchableOpacity
                                onPress={clearCurrentDraft}
                                style={secondaryButtonStyle}
                            >
                                <Text style={secondaryButtonTextStyle}>Clear Draft</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={providerNavStyle}>
                            <TouchableOpacity
                                onPress={goBackFromEstimate}
                                style={secondaryButtonStyle}
                            >
                                <Text style={secondaryButtonTextStyle}>
                                    {requestedMode === 'techos' ? 'Back to TechOS' : 'Back'}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={clearCurrentDraft}
                                style={secondaryButtonStyle}
                            >
                                <Text style={secondaryButtonTextStyle}>Clear Draft</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                <View style={sectionStyle}>
                    {renderSectionHeader('Estimate Header', 'Draft builder for selected client HomeOS items.')}
                    <View style={summaryGridStyle}>
                        {renderSummaryCard('Draft Items', String(items.length), 'Selected HomeOS records')}
                        {renderSummaryCard('Options', String(optionChoices.length), '2 to 4 individual choices')}
                        {renderSummaryCard('Packages', String(bundleChoices.length), 'Up to 2 broader packages')}
                        {renderSummaryCard(
                            'Status',
                            estimateScopeSelected
                                ? phase1Workspace.statusMessage
                                : selectedWorkType
                                    ? 'Choose exact service'
                                    : 'Choose repair or replacement',
                            'Technician review gate'
                        )}
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
                        {renderInfoChip('Pricing', !estimateScopeSelected
                            ? 'Waiting for service selection'
                            : phase1Workspace.pricingSetupRequired
                                ? 'Pricing setup required'
                                : 'Deterministic')}
                        {renderInfoChip('Price Book', priceBookMessage)}
                        {renderInfoChip('Work Type', selectedWorkType
                            ? estimateWorkTypeOptions.find((option) => option.id === selectedWorkType)?.label || selectedWorkType
                            : 'Not selected')}
                        {renderInfoChip('Category', estimateScopeSelected ? phase1Workspace.template.label : 'Not selected')}
                    </View>
                </View>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                <View style={sectionStyle}>
                    {renderSectionHeader(
                        'Estimate Checklist',
                        estimateScopeSelected
                            ? phase1Workspace.template.label
                            : 'Start by choosing Repair / Service or Replacement / Installation.'
                    )}
                    <Text style={estimateStepLabelStyle}>1. What kind of work is this?</Text>
                    <View style={workTypeGridStyle}>
                        {estimateWorkTypeOptions.map((option) => (
                            <TouchableOpacity
                                key={option.id}
                                onPress={() => selectWorkType(option.id)}
                                style={selectedWorkType === option.id
                                    ? [workTypeCardStyle, selectedWorkTypeCardStyle]
                                    : workTypeCardStyle}
                            >
                                <Text style={selectedWorkType === option.id ? selectedWorkTypeTitleStyle : workTypeTitleStyle}>
                                    {option.label}
                                </Text>
                                <Text style={selectedWorkType === option.id ? selectedWorkTypeDescriptionStyle : workTypeDescriptionStyle}>
                                    {option.description}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {!!selectedWorkType && (
                        <>
                            <Text style={estimateStepLabelStyle}>
                                2. {selectedWorkType === 'repair_service'
                                    ? 'What are we repairing, servicing, or diagnosing?'
                                    : 'What are we replacing or installing?'}
                            </Text>
                            <View style={categoryTabRowStyle}>
                                {getEstimateCategoriesForWorkType(selectedWorkType).map((template) => (
                                    <TouchableOpacity
                                        key={template.id}
                                        onPress={() => selectEstimateCategory(template.id)}
                                        style={estimateCategoryChosen && selectedCategory === template.id
                                            ? [categoryButtonStyle, selectedCategoryButtonStyle]
                                            : categoryButtonStyle}
                                    >
                                        <Text style={estimateCategoryChosen && selectedCategory === template.id
                                            ? selectedCategoryButtonTextStyle
                                            : categoryButtonTextStyle}
                                        >
                                            {template.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    )}

                    {estimateScopeSelected ? (
                        <>
                            <Text style={estimateStepLabelStyle}>3. Complete the {phase1Workspace.template.label} questions.</Text>
                            <View style={questionGridStyle}>
                                {phase1Workspace.template.questions.map((question) => renderQuestion(question, answers, updateAnswer, toggleMultiAnswer))}
                            </View>

                            <View style={requirementGridStyle}>
                                {phase1Workspace.template.requiredPhotoLabels.map((label) => renderPhotoRequirementCard({
                                    label,
                                    answers,
                                    previewByKey: photoPreviewByKey,
                                    uploadByKey: requirementUploadByKey,
                                    choosePhoto: chooseRequirementPhoto,
                                    removePhoto: removeRequirementPhoto,
                                    skipRequirement: (label, reason) => skipRequirement('photo', label, reason),
                                    clearSkippedRequirement: (label) => clearSkippedRequirement('photo', label),
                                }))}
                                {phase1Workspace.template.requiredMeasurementLabels.map((label) => renderMeasurementRequirementCard({
                                    label,
                                    answers,
                                    measurementDraftByKey,
                                    measurementErrorByKey,
                                    updateMeasurementDraft,
                                    saveMeasurement: saveRequirementMeasurement,
                                    clearMeasurement: clearRequirementMeasurement,
                                    skipRequirement: (label, reason) => skipRequirement('measurement', label, reason),
                                    clearSkippedRequirement: (label) => clearSkippedRequirement('measurement', label),
                                }))}
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

                            {phase1Workspace.draftGate.missingBeforeFinalPresentation.length > 0 && (
                        <View style={missingAnswerBoxStyle}>
                            <Text style={smallEmptyTitleStyle}>Missing before final presentation</Text>
                            {phase1Workspace.draftGate.missingBeforeFinalPresentation.slice(0, 8).map((entry) => (
                                <Text key={entry} style={missingAnswerTextStyle}>{entry}</Text>
                            ))}
                        </View>
                            )}

                            {phase1Workspace.draftGate.skippedForNow.length > 0 && (
                        <View style={missingAnswerBoxStyle}>
                            <Text style={smallEmptyTitleStyle}>Skipped for now</Text>
                            {phase1Workspace.draftGate.skippedForNow.map((entry) => (
                                <Text key={entry} style={missingAnswerTextStyle}>{entry}</Text>
                            ))}
                        </View>
                            )}

                            {phase1Workspace.draftGate.assumptionsUsedInDraft.length > 0 && (
                        <View style={missingAnswerBoxStyle}>
                            <Text style={smallEmptyTitleStyle}>Assumptions used in draft</Text>
                            {phase1Workspace.draftGate.assumptionsUsedInDraft.slice(0, 6).map((entry) => (
                                <Text key={entry} style={missingAnswerTextStyle}>{entry}</Text>
                            ))}
                        </View>
                            )}
                        </>
                    ) : (
                        <View style={smallEmptyStyle}>
                            <Text style={smallEmptyTitleStyle}>
                                {selectedWorkType ? 'Choose the exact service' : 'Choose Repair or Replacement'}
                            </Text>
                            <Text style={smallEmptyTextStyle}>
                                The checklist and price-book choices will appear only after both selections are made.
                            </Text>
                        </View>
                    )}
                </View>

                <View style={draftWorkspacePanelStyle}>
                    <View style={draftWorkspaceHeaderStyle}>
                        <View style={{ flex: 1 }}>
                            <Text style={sectionTitleStyle}>Items in Draft</Text>
                            <Text style={sectionDescriptionStyle}>
                                This is the estimate you are building now.
                            </Text>
                        </View>
                        <View style={draftWorkspaceCountStyle}>
                            <Text style={draftWorkspaceCountTextStyle}>{items.length}</Text>
                        </View>
                    </View>

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
                                    <View style={draftItemActionRowStyle}>
                                        <TouchableOpacity
                                            onPress={() => configureDraftItem(item)}
                                            style={compactPrimaryButtonStyle}
                                        >
                                            <Text style={compactPrimaryButtonTextStyle}>Configure</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => openDraftItem(item)}
                                            style={compactSecondaryButtonStyle}
                                        >
                                            <Text style={compactSecondaryButtonTextStyle}>Item Details</Text>
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
                    {renderSectionHeader('Estimate Workspace', 'Open only the part you need.')}
                    <View style={workspaceCardGridStyle}>
                        {([
                            {
                                id: 'pricing',
                                title: 'Pricing',
                                value: phase1Workspace.pricingSetupRequired
                                    ? `No ${phase1Workspace.template.label} price`
                                    : `${phase1Workspace.pricingResults.length} totals`,
                                description: 'Deterministic prices and scope.',
                                tone: cardTone('#FFF8DF', '#F2DC92', '#D99214'),
                            },
                            {
                                id: 'editor',
                                title: 'Options',
                                value: `${estimateChoices.length} choices`,
                                description: 'Draft and review customer choices.',
                                tone: cardTone('#EEF4FF', '#C8DAFF', '#276BDC'),
                            },
                            {
                                id: 'presentation',
                                title: 'Presentation',
                                value: phase1Workspace.presentationGate.canPresent ? 'Ready' : 'Blocked',
                                description: 'Technician-approved homeowner view.',
                                tone: cardTone('#ECFBF5', '#B7E8D7', '#0F8A68'),
                            },
                            {
                                id: 'findings',
                                title: 'Findings',
                                value: `${estimateFoundationSections.length} sections`,
                                description: 'Field notes and recommended work.',
                                tone: cardTone('#F3EFFF', '#D9CCFF', '#7357C8'),
                            },
                        ] as const).map((workspaceSection) => {
                            const open = workspaceSection.id === 'editor'
                                ? optionsWorkspaceOpen
                                : expandedWorkspaceSection === workspaceSection.id;

                            return (
                                <TouchableOpacity
                                    key={workspaceSection.id}
                                    onPress={() => {
                                        if (workspaceSection.id === 'editor') {
                                            setOptionsWorkspaceOpen(true);
                                            return;
                                        }

                                        setExpandedWorkspaceSection(open ? null : workspaceSection.id);
                                    }}
                                    style={[
                                        workspaceCardStyle,
                                        workspaceSection.tone,
                                        open ? workspaceCardOpenStyle : null,
                                    ]}
                                >
                                    <View>
                                        <Text style={workspaceCardTitleStyle}>{workspaceSection.title}</Text>
                                        <Text style={workspaceCardDescriptionStyle}>{workspaceSection.description}</Text>
                                    </View>
                                    <View style={workspaceCardFooterStyle}>
                                        <Text style={workspaceCardValueStyle}>{workspaceSection.value}</Text>
                                        <Text style={workspaceCardActionStyle}>{open ? 'Hide' : 'Open'}</Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {expandedWorkspaceSection === 'pricing' && (
                <View ref={workspaceDetailsRef} style={workspaceDetailStyle}>
                    {renderSectionHeader('Deterministic Pricing', estimateScopeSelected ? phase1Workspace.statusMessage : 'Waiting for estimate checklist selection')}
                    {!estimateScopeSelected ? (
                        <View style={smallEmptyStyle}>
                            <Text style={smallEmptyTitleStyle}>Select the work type and exact service first</Text>
                            <Text style={smallEmptyTextStyle}>
                                Repair price-book lines cannot appear in a replacement estimate, and replacement lines cannot appear in a repair estimate.
                            </Text>
                        </View>
                    ) : phase1Workspace.pricingSetupRequired ? (
                        <View style={smallEmptyStyle}>
                            <Text style={smallEmptyTitleStyle}>Pricing setup required</Text>
                            <Text style={smallEmptyTextStyle}>
                                {priceBookItems.some((item) => item.active && (item.recommended_selling_price != null || item.base_price != null))
                                    ? `No active selling price matches ${phase1Workspace.template.label}. Add or update a matching company Price Book item before generating homeowner choices.`
                                    : 'The company Price Book is connected, but it has no active selling prices yet.'}
                            </Text>
                            <Text style={smallEmptyTextStyle}>{priceBookMessage}</Text>
                            {canUseEstimatePricing(estimateAccess) && estimateAccess?.companyId ? (
                                <TouchableOpacity
                                    onPress={() => router.push(companyPriceBookRoute as never)}
                                    style={secondaryButtonStyle}
                                >
                                    <Text style={secondaryButtonTextStyle}>
                                        {canManageEstimatePricing(estimateAccess) ? 'Open Company Price Book' : 'View Company Price Book'}
                                    </Text>
                                </TouchableOpacity>
                            ) : null}
                            {!canManageEstimatePricing(estimateAccess) ? (
                                <Text style={smallEmptyTextStyle}>
                                    A company owner, manager, or admin must add the selling price before this estimate can be completed.
                                </Text>
                            ) : null}
                        </View>
                    ) : (
                        <View style={foundationGridStyle}>
                            {phase1Workspace.pricingResults.slice(0, 4).map((pricingResult) => (
                                <View key={pricingResult.id} style={[foundationCardStyle, cardTone('#EEF4FF', '#C8DAFF', '#276BDC')]}>
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
                )}

                <Modal
                    animationType="slide"
                    onRequestClose={() => setOptionsWorkspaceOpen(false)}
                    presentationStyle="fullScreen"
                    visible={estimateScopeSelected && optionsWorkspaceOpen}
                >
                <ScrollView
                    contentInsetAdjustmentBehavior="automatic"
                    style={optionsWorkspaceScreenStyle}
                    contentContainerStyle={optionsWorkspaceContentStyle}
                >
                <View style={optionsWorkspaceShellStyle}>
                    <View style={optionsWorkspaceHeaderStyle}>
                        <View style={{ flex: 1 }}>
                            <Text style={optionsWorkspaceEyebrowStyle}>Estimate workspace</Text>
                            <Text style={optionsWorkspaceTitleStyle}>Options</Text>
                            <Text style={optionsWorkspaceSubtitleStyle}>
                                Review customer choices, adjust selling prices, and prepare the presentation.
                            </Text>
                            <Text style={optionsWorkspaceVersionStyle}>{BUILD_DISPLAY}</Text>
                        </View>
                        <TouchableOpacity
                            accessibilityLabel="Close quote options"
                            onPress={() => setOptionsWorkspaceOpen(false)}
                            style={optionsWorkspaceCloseStyle}
                        >
                            <Text style={optionsWorkspaceCloseTextStyle}>Close</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={optionsCustomerSummaryStyle}>
                        <Text style={optionsCustomerSummaryTitleStyle}>
                            {draftContext?.customer_home_name || 'Customer home'}
                        </Text>
                        {!!draftContext?.issue_summary && (
                            <Text style={optionsCustomerSummaryTextStyle}>{draftContext.issue_summary}</Text>
                        )}
                        <View style={chipRowStyle}>
                            {!!draftContext?.technician_name && (
                                <Text style={itemChipStyle}>Technician: {draftContext.technician_name}</Text>
                            )}
                            <Text style={itemChipStyle}>Category: {phase1Workspace.template.label}</Text>
                            <Text style={itemChipStyle}>{items.length} draft item{items.length === 1 ? '' : 's'}</Text>
                        </View>
                    </View>

                    <View style={optionsWorkspaceToolbarStyle}>
                        {presentationMode ? (
                            <TouchableOpacity
                                onPress={() => {
                                    setPresentationMode(false);
                                    setOptionsWorkspaceNotice('Editing controls restored.');
                                }}
                                style={compactPrimaryButtonStyle}
                            >
                                <Text style={compactPrimaryButtonTextStyle}>Back to Edit Options</Text>
                            </TouchableOpacity>
                        ) : (
                            <>
                                <TouchableOpacity
                                    onPress={() => draftWithAi(estimateChoices, phase1Workspace.draftGate)}
                                    style={aiDrafting || requirementUploadInProgress || !phase1Workspace.draftGate.canDraft ? mutedButtonStyle : compactPrimaryButtonStyle}
                                    disabled={aiDrafting || requirementUploadInProgress}
                                >
                                    <Text style={compactPrimaryButtonTextStyle}>
                                        {aiDrafting ? 'Drafting wording...' : requirementUploadInProgress ? 'Uploading...' : 'Draft wording with AI'}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={redoOptionDrafts}
                                    style={compactSecondaryButtonStyle}
                                >
                                    <Text style={compactSecondaryButtonTextStyle}>Redo / Reset Options</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => approveForPresentation(estimateChoices)}
                                    style={technicianApproved ? approvedSetButtonStyle : compactSecondaryButtonStyle}
                                >
                                    <Text style={technicianApproved ? approvedSetButtonTextStyle : compactSecondaryButtonTextStyle}>
                                        {technicianApproved ? 'Set Approved ✓' : 'Approve Set'}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={openHomeownerApproval}
                                    style={technicianApproved ? compactPrimaryButtonStyle : mutedButtonStyle}
                                >
                                    <Text style={compactPrimaryButtonTextStyle}>Present to Homeowner</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>

                    {!presentationMode && !!optionsWorkspaceNotice && (
                        <View style={optionsWorkspaceNoticeStyle}>
                            <Text style={optionsWorkspaceNoticeTextStyle}>{optionsWorkspaceNotice}</Text>
                        </View>
                    )}

                    {!presentationMode ? (
                    <View style={workspaceDetailStyle}>
                        {renderSectionHeader('Technician Option Editor', selectedChoice?.title || 'Review choices before presentation.')}
                    <View style={compactActionRowStyle}>
                        <Text style={priceAdjustmentHelpStyle}>
                            Enter one percentage, choose minus for a named discount or plus for an increase, then apply it to that option.
                        </Text>
                    </View>

                    {phase1Workspace.presentationGate.blockers.length > 0 && (
                        <View style={editorStatusBannerStyle}>
                            <Text style={editorStatusTitleStyle}>Not ready for homeowner presentation</Text>
                            <Text style={editorStatusTextStyle}>{editorStatusHeadline}</Text>
                        </View>
                    )}

                    {!!selectedChoice && (
                        <View style={selectedOptionBannerStyle}>
                            <View style={{ flex: 1 }}>
                                <Text style={selectedOptionBannerLabelStyle}>Selected for presentation</Text>
                                <Text style={selectedOptionBannerTitleStyle}>{selectedChoice.title}</Text>
                            </View>
                            <Text style={selectedOptionBannerPriceStyle}>
                                {formatMoney(selectedChoice.pricingResult.totalAmount)}
                            </Text>
                        </View>
                    )}

                    {aiDraftWarnings.length > 0 && (
                        <View style={warningBoxStyle}>
                            {aiDraftWarnings.slice(0, 4).map((warning) => (
                                <Text key={warning} style={warningTextStyle}>{warning}</Text>
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
                                    <View style={priceAdjustmentPanelStyle}>
                                        <View style={priceAdjustmentHeaderStyle}>
                                            <View>
                                                <Text style={priceAdjustmentLabelStyle}>Price adjustment</Text>
                                                <Text style={priceAdjustmentCurrentStyle}>
                                                    {(priceAdjustmentByChoiceId[choice.id] || 0) === 0
                                                        ? 'No adjustment applied'
                                                        : (priceAdjustmentByChoiceId[choice.id] || 0) < 0
                                                            ? `${formatEstimatePriceAdjustmentPercentage(priceAdjustmentByChoiceId[choice.id])} ${priceAdjustmentLabelByChoiceId[choice.id] || 'discount'} applied`
                                                            : `${formatEstimatePriceAdjustmentPercentage(priceAdjustmentByChoiceId[choice.id])} increase applied`}
                                                </Text>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => resetChoicePrice(choice)}
                                                style={compactSecondaryButtonStyle}
                                            >
                                                <Text style={compactSecondaryButtonTextStyle}>Reset Price</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={customPriceAdjustmentRowStyle}>
                                            <TouchableOpacity
                                                accessibilityLabel={`Apply a discount to ${choice.title}`}
                                                onPress={() => setPriceAdjustmentDirectionByChoiceId((current) => ({
                                                    ...current,
                                                    [choice.id]: 'discount',
                                                }))}
                                                style={(priceAdjustmentDirectionByChoiceId[choice.id] || 'increase') === 'discount'
                                                    ? adjustmentSignSelectedStyle
                                                    : adjustmentSignButtonStyle}
                                            >
                                                <Text style={(priceAdjustmentDirectionByChoiceId[choice.id] || 'increase') === 'discount'
                                                    ? compactPrimaryButtonTextStyle
                                                    : compactSecondaryButtonTextStyle}
                                                >
                                                    −
                                                </Text>
                                            </TouchableOpacity>
                                            <TextInput
                                                accessibilityLabel={`Price adjustment percentage for ${choice.title}`}
                                                inputMode="decimal"
                                                keyboardType="decimal-pad"
                                                onChangeText={(value) => setCustomPriceAdjustmentByChoiceId((current) => ({
                                                    ...current,
                                                    [choice.id]: value,
                                                }))}
                                                onSubmitEditing={() => applyCustomChoicePriceAdjustment(choice.id)}
                                                placeholder="Percent"
                                                style={customPriceAdjustmentInputStyle}
                                                value={customPriceAdjustmentByChoiceId[choice.id] || ''}
                                            />
                                            <TouchableOpacity
                                                accessibilityLabel={`Apply a price increase to ${choice.title}`}
                                                onPress={() => setPriceAdjustmentDirectionByChoiceId((current) => ({
                                                    ...current,
                                                    [choice.id]: 'increase',
                                                }))}
                                                style={(priceAdjustmentDirectionByChoiceId[choice.id] || 'increase') === 'increase'
                                                    ? adjustmentSignSelectedStyle
                                                    : adjustmentSignButtonStyle}
                                            >
                                                <Text style={(priceAdjustmentDirectionByChoiceId[choice.id] || 'increase') === 'increase'
                                                    ? compactPrimaryButtonTextStyle
                                                    : compactSecondaryButtonTextStyle}
                                                >
                                                    +
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => applyCustomChoicePriceAdjustment(choice.id)}
                                                style={compactSecondaryButtonStyle}
                                            >
                                                <Text style={compactSecondaryButtonTextStyle}>Apply</Text>
                                            </TouchableOpacity>
                                        </View>
                                        {(priceAdjustmentDirectionByChoiceId[choice.id] || 'increase') === 'discount' && (
                                            <View style={discountReasonPanelStyle}>
                                                <Text style={discountReasonLabelStyle}>Discount name required</Text>
                                                <View style={discountReasonChipRowStyle}>
                                                    {discountReasonSuggestions.map((reason) => (
                                                        <TouchableOpacity
                                                            key={`${choice.id}-${reason}`}
                                                            onPress={() => setPriceAdjustmentLabelByChoiceId((current) => ({
                                                                ...current,
                                                                [choice.id]: reason,
                                                            }))}
                                                            style={priceAdjustmentLabelByChoiceId[choice.id] === reason
                                                                ? discountReasonChipSelectedStyle
                                                                : discountReasonChipStyle}
                                                        >
                                                            <Text style={priceAdjustmentLabelByChoiceId[choice.id] === reason
                                                                ? discountReasonChipSelectedTextStyle
                                                                : discountReasonChipTextStyle}
                                                            >
                                                                {reason.replace(/ Discount$/, '')}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                                <TextInput
                                                    accessibilityLabel={`Discount name for ${choice.title}`}
                                                    onChangeText={(value) => setPriceAdjustmentLabelByChoiceId((current) => ({
                                                        ...current,
                                                        [choice.id]: value,
                                                    }))}
                                                    placeholder="Custom discount name"
                                                    style={discountReasonInputStyle}
                                                    value={priceAdjustmentLabelByChoiceId[choice.id] || ''}
                                                />
                                            </View>
                                        )}
                                        {choice.pricingResult.requiredManagementApproval && (
                                            <Text style={warningTextStyle}>
                                                This adjustment is outside company price-book limits and requires management approval.
                                            </Text>
                                        )}
                                    </View>
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
                                                {selectedChoiceId === choice.id
                                                    ? 'Selected'
                                                    : choice.kind === 'package' ? 'Select Package' : 'Select Option'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => viewChoiceDetails(choice)}
                                            style={compactSecondaryButtonStyle}
                                        >
                                            <Text style={compactSecondaryButtonTextStyle}>View Details</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => removeChoice(choice)}
                                            style={compactDangerButtonStyle}
                                        >
                                            <Text style={compactDangerButtonTextStyle}>
                                                {pendingRemoveChoiceId === choice.id ? 'Confirm Remove' : 'Remove Option'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
                    ) : (
                        <View style={workspaceDetailStyle}>
                            {renderSectionHeader(
                                'Homeowner Presentation',
                                phase1Workspace.presentationGate.canPresent ? 'Ready' : 'Blocked'
                            )}
                            {!phase1Workspace.presentationGate.canPresent ? (
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
                    )}
                </View>
                </ScrollView>
                </Modal>

                <Modal
                    animationType="fade"
                    onRequestClose={() => setDetailChoiceId('')}
                    presentationStyle="pageSheet"
                    visible={!!detailChoice}
                >
                    <ScrollView
                        contentInsetAdjustmentBehavior="automatic"
                        style={optionDetailScreenStyle}
                        contentContainerStyle={optionDetailContentStyle}
                    >
                        {!!detailChoice && (
                            <View style={optionDetailShellStyle}>
                                <View style={optionDetailHeaderStyle}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={optionsWorkspaceEyebrowStyle}>Option details</Text>
                                        <Text style={optionDetailTitleStyle}>{detailChoice.title}</Text>
                                        <Text style={optionDetailPriceStyle}>
                                            {formatMoney(detailChoice.pricingResult.totalAmount)}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        accessibilityLabel="Close option details"
                                        onPress={() => setDetailChoiceId('')}
                                        style={optionsWorkspaceCloseStyle}
                                    >
                                        <Text style={optionsWorkspaceCloseTextStyle}>Close</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={optionDetailSectionStyle}>
                                    <Text style={optionDetailSectionTitleStyle}>Customer explanation</Text>
                                    <Text style={optionDetailBodyStyle}>{detailChoice.homeownerExplanation}</Text>
                                    {!!detailChoice.customerSelections?.length && (
                                        <View style={customerSelectionListStyle}>
                                            <Text style={customerSelectionTitleStyle}>Selected equipment and site details</Text>
                                            {detailChoice.customerSelections.map((selection) => (
                                                <Text key={`${detailChoice.id}-${selection}`} style={customerSelectionTextStyle}>
                                                    • {selection}
                                                </Text>
                                            ))}
                                        </View>
                                    )}
                                </View>

                                <View style={optionDetailSectionStyle}>
                                    <Text style={optionDetailSectionTitleStyle}>Included work</Text>
                                    {detailChoice.pricingResult.lineItems.map((line) => (
                                        <View key={`${detailChoice.id}-${line.id}`} style={optionDetailLineStyle}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={optionDetailLineNameStyle}>{line.name}</Text>
                                                <Text style={optionDetailLineMetaStyle}>
                                                    Quantity {line.quantity} · {line.code}
                                                </Text>
                                            </View>
                                            <Text style={optionDetailLinePriceStyle}>{formatMoney(line.totalAmount)}</Text>
                                        </View>
                                    ))}
                                </View>

                                <View style={optionDetailSectionStyle}>
                                    <Text style={optionDetailSectionTitleStyle}>Why this option is different</Text>
                                    <Text style={optionDetailBodyStyle}>{detailChoice.whyItDiffers}</Text>
                                    <View style={chipRowStyle}>
                                        {detailChoice.keyBenefits.map((benefit) => (
                                            <Text key={`${detailChoice.id}-${benefit}`} style={itemChipStyle}>{benefit}</Text>
                                        ))}
                                    </View>
                                </View>

                                {detailChoice.pricingResult.warnings.length > 0 && (
                                    <View style={warningBoxStyle}>
                                        {detailChoice.pricingResult.warnings.map((warning) => (
                                            <Text key={warning} style={warningTextStyle}>{warning}</Text>
                                        ))}
                                    </View>
                                )}

                                <TouchableOpacity
                                    onPress={() => {
                                        selectChoice(detailChoice);
                                        setDetailChoiceId('');
                                    }}
                                    style={optionDetailSelectStyle}
                                >
                                    <Text style={compactPrimaryButtonTextStyle}>
                                        {selectedChoiceId === detailChoice.id ? 'Selected for Presentation' : 'Select This Option'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                </Modal>

                {expandedWorkspaceSection === 'presentation' && (
                <View ref={workspaceDetailsRef} style={workspaceDetailStyle}>
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
                )}

                {expandedWorkspaceSection === 'findings' && (
                <View ref={workspaceDetailsRef} style={workspaceDetailStyle}>
                    {renderSectionHeader('Findings', 'Field findings will be attached before customer review.')}
                    <View style={foundationGridStyle}>
                        {estimateFoundationSections.map((section) => (
                            <View key={section.title} style={[foundationCardStyle, estimateFoundationTone(section.title)]}>
                                <Text style={foundationTitleStyle}>{section.title}</Text>
                                <Text style={foundationTextStyle}>{section.description}</Text>
                            </View>
                        ))}
                    </View>
                </View>
                )}

            </View>
        </ScrollView>
    );
}

type GuidedEstimateBuilderProps = {
    activeDraftItem: EstimateDraftItem | null;
    approvedProductMessage: string;
    aiDrafting: boolean;
    answers: EstimateAnswerSet;
    approveForPresentation: (choices: Phase1EstimateChoice[]) => Promise<void>;
    beginGuidedOptionEdit: (baseChoice: Phase1EstimateChoice, finalChoice: Phase1EstimateChoice) => void;
    cancelGuidedOptionEdit: () => void;
    canManagePricing: boolean;
    canUsePricing: boolean;
    categoryPickerExpanded: boolean;
    chooseRequirementPhoto: (label: string, capture: boolean) => Promise<void>;
    clearCurrentDraft: () => void;
    clearSkippedRequirement: (kind: RequirementKind, label: string) => Promise<void>;
    clearRequirementMeasurement: (label: string) => Promise<void>;
    companyPriceBookRoute: string;
    candidateEstimateChoices: Phase1EstimateChoice[];
    currentCandidateChoice: Phase1EstimateChoice | null;
    customQuoteDraft: CustomEstimateOptionDraft;
    customQuoteMode: boolean;
    documentationExpanded: boolean;
    draftContext: EstimateDraftContext | null;
    editingGuidedOptionId: string;
    eligibleRecommendations: EligibleEstimateRecommendation[];
    estimateAccess: CompanyPermissionAccess;
    estimateChoiceBases: Phase1EstimateChoice[];
    estimateChoices: Phase1EstimateChoice[];
    estimateScopeSelected: boolean;
    getCategoriesForWorkType: typeof getEstimateCategoriesForWorkType;
    goBackFromEstimate: () => void;
    goBackToClientHomeOs: () => void;
    goBackToItem: () => void;
    goToCompanyDashboard: () => void;
    guidedAdjustmentMode: GuidedPriceAdjustmentMode;
    guidedAdjustmentLineId: string;
    guidedAdjustmentValue: string;
    guidedBuildStep: GuidedBuildStep;
    guidedDiscountLabel: string;
    guidedStep: GuidedEstimateStep;
    items: EstimateDraftItem[];
    measurementDraftByKey: Record<string, string>;
    measurementErrorByKey: Record<string, string>;
    message: string;
    quoteNumber: string;
    draftSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
    openSavedDrafts: () => Promise<void>;
    openHomeownerApproval: () => Promise<void>;
    persistAddCurrent: (choice: Phase1EstimateChoice) => Promise<void>;
    persistAddCustom: () => Promise<void>;
    persistAddRecommendation: (
        recommendation: EligibleEstimateRecommendation,
        baseChoice: PersistableEstimateChoice,
    ) => Promise<void>;
    persistAddSearchResult: (
        item: CompanyPriceBookItem,
        baseChoice: PersistableEstimateChoice,
    ) => Promise<void>;
    persistRemoveOption: (choiceId: string) => Promise<void>;
    phase1Workspace: ReturnType<typeof buildEstimateOptionWorkspace>;
    photoPreviewByKey: Record<string, string>;
    priceBookItems: CompanyPriceBookItem[];
    priceBookMessage: string;
    providerModeContext: boolean;
    recommendationBaseChoice: PersistableEstimateChoice | null;
    relatedSearch: string;
    relatedSearchResults: CompanyPriceBookItem[];
    removeRequirementPhoto: (label: string) => Promise<void>;
    requestedMode: string | null;
    requirementUploadByKey: Record<string, RequirementUploadState>;
    requirementUploadInProgress: boolean;
    saveRequirementMeasurement: (label: string) => Promise<void>;
    savingGuidedOption: boolean;
    scrollRef: RefObject<ScrollView | null>;
    selectEstimateCategory: (category: EstimateOptionCategory) => void;
    selectCandidateChoice: (choiceId: string) => void;
    selectGuidedAdjustmentLine: (
        choice: Phase1EstimateChoice,
        line: EstimateCalculatedLine,
        finalChoice?: Phase1EstimateChoice,
    ) => void;
    selectedCategory: EstimateOptionCategory;
    selectedWorkType: EstimateWorkType | null;
    selectWorkType: (workType: EstimateWorkType) => void;
    setCategoryPickerExpanded: (expanded: boolean) => void;
    setDocumentationExpanded: (expanded: boolean) => void;
    setGuidedAdjustmentMode: (mode: GuidedPriceAdjustmentMode) => void;
    setGuidedAdjustmentValue: (value: string) => void;
    setGuidedBuildStep: (step: GuidedBuildStep) => void;
    setGuidedDiscountLabel: (value: string) => void;
    setGuidedStep: (step: GuidedEstimateStep) => void;
    startCustomQuote: () => void;
    cancelCustomQuote: () => void;
    setRelatedSearch: (value: string) => void;
    skipRequirement: (
        kind: RequirementKind,
        label: string,
        reason: EstimateRequirementSkipReason | null,
    ) => Promise<void>;
    technicianApproved: boolean;
    updateAnswer: (question: EstimateQuestionDefinition, value: string | number | boolean) => void;
    updateChoiceCopy: (choiceId: string, field: keyof EditableChoiceCopy, value: string) => void;
    updateCustomQuoteDraft: (field: keyof CustomEstimateOptionDraft, value: string) => void;
    updateGuidedTechnicianNotes: (value: string) => void;
    updateMeasurementDraft: (label: string, value: string) => void;
    toggleMultiAnswer: (question: EstimateQuestionDefinition, value: string) => void;
    applyGuidedPriceAdjustment: (choice: Phase1EstimateChoice) => void;
    draftWithAi: (choices: Phase1EstimateChoice[], draftGate: EstimateDraftGate) => Promise<void>;
    saveGuidedTechnicianNotes: () => Promise<void>;
    saveGuidedOptionEdits: (choices: Phase1EstimateChoice[], choiceId: string) => Promise<void>;
};

function renderGuidedEstimateBuilder({
    activeDraftItem,
    approvedProductMessage,
    aiDrafting,
    answers,
    approveForPresentation,
    beginGuidedOptionEdit,
    cancelGuidedOptionEdit,
    canManagePricing,
    canUsePricing,
    categoryPickerExpanded,
    chooseRequirementPhoto,
    clearCurrentDraft,
    clearSkippedRequirement,
    clearRequirementMeasurement,
    companyPriceBookRoute,
    candidateEstimateChoices,
    currentCandidateChoice,
    customQuoteDraft,
    customQuoteMode,
    documentationExpanded,
    draftContext,
    editingGuidedOptionId,
    eligibleRecommendations,
    estimateChoiceBases,
    estimateChoices,
    estimateScopeSelected,
    getCategoriesForWorkType,
    goBackFromEstimate,
    goBackToClientHomeOs,
    goBackToItem,
    goToCompanyDashboard,
    guidedAdjustmentMode,
    guidedAdjustmentLineId,
    guidedAdjustmentValue,
    guidedBuildStep,
    guidedDiscountLabel,
    guidedStep,
    items,
    measurementDraftByKey,
    measurementErrorByKey,
    message,
    quoteNumber,
    draftSaveStatus,
    openSavedDrafts,
    openHomeownerApproval,
    persistAddCurrent,
    persistAddCustom,
    persistAddRecommendation,
    persistAddSearchResult,
    persistRemoveOption,
    phase1Workspace,
    photoPreviewByKey,
    priceBookMessage,
    providerModeContext,
    recommendationBaseChoice,
    relatedSearch,
    relatedSearchResults,
    removeRequirementPhoto,
    requestedMode,
    requirementUploadByKey,
    requirementUploadInProgress,
    saveRequirementMeasurement,
    savingGuidedOption,
    scrollRef,
    selectEstimateCategory,
    selectCandidateChoice,
    selectGuidedAdjustmentLine,
    selectedCategory,
    selectedWorkType,
    selectWorkType,
    setCategoryPickerExpanded,
    setDocumentationExpanded,
    setGuidedAdjustmentMode,
    setGuidedAdjustmentValue,
    setGuidedBuildStep,
    setGuidedDiscountLabel,
    setGuidedStep,
    startCustomQuote,
    cancelCustomQuote,
    setRelatedSearch,
    skipRequirement,
    technicianApproved,
    updateAnswer,
    updateChoiceCopy,
    updateCustomQuoteDraft,
    updateGuidedTechnicianNotes,
    updateMeasurementDraft,
    toggleMultiAnswer,
    applyGuidedPriceAdjustment,
    draftWithAi,
    saveGuidedTechnicianNotes,
    saveGuidedOptionEdits,
}: GuidedEstimateBuilderProps) {
    const baseCandidate = currentCandidateChoice
        ? phase1Workspace.choices.find((choice) => choice.id === currentCandidateChoice.id) || currentCandidateChoice
        : null;
    const baseTotal = baseCandidate?.pricingResult.totalAmount || 0;
    const finalTotal = currentCandidateChoice?.pricingResult.totalAmount || 0;
    const adjustmentAmount = finalTotal - baseTotal;
    const selectedAdjustmentLineId = baseCandidate?.pricingResult.lineItems.some((line) => line.id === guidedAdjustmentLineId)
        ? guidedAdjustmentLineId
        : baseCandidate?.pricingResult.lineItems[0]?.id || '';
    const selectedBaseLine = baseCandidate?.pricingResult.lineItems.find((line) => line.id === selectedAdjustmentLineId) || null;
    const selectedFinalLine = currentCandidateChoice?.pricingResult.lineItems.find((line) => line.id === selectedAdjustmentLineId) || null;
    const selectedLineAdjustmentAmount = (selectedFinalLine?.totalAmount || 0) - (selectedBaseLine?.totalAmount || 0);
    const editingBaseChoice = estimateChoiceBases.find((choice) => choice.id === editingGuidedOptionId) || null;
    const editingFinalChoice = estimateChoices.find((choice) => choice.id === editingGuidedOptionId) || null;
    const editingSelectedLineId = editingBaseChoice?.pricingResult.lineItems.some((line) => line.id === guidedAdjustmentLineId)
        ? guidedAdjustmentLineId
        : editingBaseChoice?.pricingResult.lineItems[0]?.id || '';
    const editingBaseLine = editingBaseChoice?.pricingResult.lineItems.find((line) => line.id === editingSelectedLineId) || null;
    const editingFinalLine = editingFinalChoice?.pricingResult.lineItems.find((line) => line.id === editingSelectedLineId) || null;
    const editingLineAdjustmentAmount = (editingFinalLine?.totalAmount || 0) - (editingBaseLine?.totalAmount || 0);
    const editingOptionAdjustmentAmount = (editingFinalChoice?.pricingResult.totalAmount || 0) -
        (editingBaseChoice?.pricingResult.totalAmount || 0);
    const missingQuestionCount = phase1Workspace.answerValidation.missingRequiredQuestionLabels.length;
    const missingPhotoCount = phase1Workspace.answerValidation.missingRequiredPhotoLabels.length;
    const missingMeasurementCount = phase1Workspace.answerValidation.missingRequiredMeasurementLabels.length;
    const attentionParts = [
        missingQuestionCount > 0 ? `${missingQuestionCount} question${missingQuestionCount === 1 ? '' : 's'}` : '',
        missingPhotoCount > 0 ? `${missingPhotoCount} photo${missingPhotoCount === 1 ? '' : 's'}` : '',
        missingMeasurementCount > 0 ? `${missingMeasurementCount} measurement${missingMeasurementCount === 1 ? '' : 's'}` : '',
        phase1Workspace.pricingSetupRequired ? 'pricing' : '',
    ].filter(Boolean);
    const canAddCurrent = Boolean(
        estimateScopeSelected &&
        currentCandidateChoice &&
        currentCandidateChoice.pricingResult.totalAmount > 0 &&
        currentCandidateChoice.pricingResult.missingPricingInputs.length === 0
    );
    const hasStandardEstimateChoice = estimateChoices.some((choice) => !isCustomEstimateChoice(choice));
    const canApprove = estimateChoices.length > 0 &&
        !requirementUploadInProgress &&
        (!hasStandardEstimateChoice || (
            phase1Workspace.answerValidation.complete &&
            !phase1Workspace.pricingSetupRequired
        ));
    const reviewAttentionParts = hasStandardEstimateChoice ? attentionParts : [];

    return (
        <ScrollView
            ref={scrollRef}
            style={guidedScreenStyle}
            contentContainerStyle={guidedContentStyle}
            contentInsetAdjustmentBehavior="automatic"
        >
            <View style={guidedShellStyle}>
                <HomeHeader />

                <View style={guidedTopBarStyle}>
                    <TouchableOpacity onPress={providerModeContext ? goBackToItem : goBackFromEstimate} style={guidedBackButtonStyle}>
                        <Text style={guidedBackButtonTextStyle}>{requestedMode === 'techos' ? 'Back to TechOS' : 'Back'}</Text>
                    </TouchableOpacity>
                    <View style={guidedTopActionsStyle}>
                        <TouchableOpacity onPress={() => void openSavedDrafts()} style={guidedTextButtonStyle}>
                            <Text style={guidedTextButtonTextStyle}>Saved Drafts</Text>
                        </TouchableOpacity>
                        {providerModeContext && (
                            <TouchableOpacity onPress={goBackToClientHomeOs} style={guidedTextButtonStyle}>
                                <Text style={guidedTextButtonTextStyle}>Client HomeOS</Text>
                            </TouchableOpacity>
                        )}
                        {providerModeContext && (
                            <TouchableOpacity onPress={goToCompanyDashboard} style={guidedTextButtonStyle}>
                                <Text style={guidedTextButtonTextStyle}>Company</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={clearCurrentDraft} style={guidedTextButtonStyle}>
                            <Text style={guidedTextButtonTextStyle}>Delete Draft</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={guidedHeroStyle}>
                    <Text style={guidedEyebrowStyle}>CREATE QUOTE / ESTIMATE</Text>
                    <View style={guidedQuoteIdentityRowStyle}>
                        <Text style={guidedQuoteNumberStyle}>{quoteNumber || 'Quote number assigning…'}</Text>
                        <Text style={draftSaveStatus === 'error' ? guidedSaveErrorStyle : guidedSaveStatusStyle}>
                            {draftSaveStatus === 'saving'
                                ? 'Saving…'
                                : draftSaveStatus === 'error'
                                    ? 'Save needs attention'
                                    : draftSaveStatus === 'saved'
                                        ? 'All changes saved ✓'
                                        : 'Draft starting…'}
                        </Text>
                    </View>
                    <Text style={guidedTitleStyle}>Build one clear option at a time</Text>
                    <Text style={guidedSubtitleStyle}>
                        Document the selected work, confirm its price and summary, then decide whether the customer needs another option.
                    </Text>
                </View>

                <View style={guidedProgressStyle}>
                    {['1 Work', '2 Findings', '3 Price & summary', '4 Options'].map((label, index) => (
                        <View key={label} style={guidedProgressItemStyle}>
                            <View style={index <= guidedProgressIndex(guidedStep, guidedBuildStep, estimateScopeSelected || customQuoteMode) ? guidedProgressDotActiveStyle : guidedProgressDotStyle} />
                            <Text style={guidedProgressTextStyle}>{label}</Text>
                        </View>
                    ))}
                </View>

                {!!message && (
                    <View style={guidedMessageStyle}>
                        <Text style={guidedMessageTextStyle}>{message}</Text>
                    </View>
                )}

                {guidedStep === 'build' && (
                    <>
                        {guidedBuildStep === 'work' && (
                            <View style={guidedSectionStyle}>
                            <View style={guidedSectionHeadingRowStyle}>
                                <View style={{ flex: 1 }}>
                                    <Text style={guidedStepStyle}>STEP 1</Text>
                                    <Text style={guidedSectionTitleStyle}>Selected work</Text>
                                </View>
                                {estimateScopeSelected && (
                                    <TouchableOpacity onPress={() => setCategoryPickerExpanded(!categoryPickerExpanded)} style={guidedTextButtonStyle}>
                                        <Text style={guidedTextButtonTextStyle}>Change service</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {!!activeDraftItem && (
                                <View style={guidedSelectedItemStyle}>
                                    <View style={guidedSelectedItemIconStyle}><Text style={guidedSelectedItemIconTextStyle}>✓</Text></View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={guidedSelectedItemTitleStyle}>{activeDraftItem.name}</Text>
                                        <Text style={guidedSelectedItemMetaStyle}>
                                            {[activeDraftItem.location, activeDraftItem.parent_area].filter(Boolean).join(' · ') || activeDraftItem.system}
                                        </Text>
                                    </View>
                                    <Text style={guidedSelectedItemBadgeStyle}>{phase1Workspace.template.serviceCategory}</Text>
                                </View>
                            )}

                            {(!estimateScopeSelected || categoryPickerExpanded) && (
                                <View style={guidedPickerStyle}>
                                    <Text style={guidedPromptStyle}>What kind of work is this?</Text>
                                    <View style={guidedTwoColumnStyle}>
                                        {estimateWorkTypeOptions.map((option) => (
                                            <TouchableOpacity
                                                key={option.id}
                                                onPress={() => selectWorkType(option.id)}
                                                style={selectedWorkType === option.id ? guidedChoiceCardSelectedStyle : guidedChoiceCardStyle}
                                            >
                                                <Text style={guidedChoiceTitleStyle}>{option.label}</Text>
                                                <Text style={guidedChoiceDescriptionStyle}>{option.description}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    {!!selectedWorkType && (
                                        <>
                                            <Text style={guidedPromptStyle}>Choose the exact service</Text>
                                            <View style={guidedCategoryGridStyle}>
                                                {getCategoriesForWorkType(selectedWorkType).map((template) => (
                                                    <TouchableOpacity
                                                        key={template.id}
                                                        onPress={() => {
                                                            selectEstimateCategory(template.id);
                                                            setCategoryPickerExpanded(false);
                                                        }}
                                                        style={selectedCategory === template.id && estimateScopeSelected
                                                            ? guidedCategoryChipSelectedStyle
                                                            : guidedCategoryChipStyle}
                                                    >
                                                        <Text style={selectedCategory === template.id && estimateScopeSelected
                                                            ? guidedCategoryChipSelectedTextStyle
                                                            : guidedCategoryChipTextStyle}
                                                        >
                                                            {template.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </>
                                    )}
                                </View>
                            )}

                            <TouchableOpacity
                                accessibilityLabel="Create a custom quote"
                                accessibilityRole="button"
                                onPress={startCustomQuote}
                                style={[guidedChoiceCardStyle, { marginTop: 16, width: '100%' }]}
                            >
                                <Text style={guidedChoiceTitleStyle}>Custom Quote</Text>
                                <Text style={guidedChoiceDescriptionStyle}>
                                    Name the work, describe the exact scope, write the customer summary, and enter the exact price yourself.
                                </Text>
                            </TouchableOpacity>

                            {estimateScopeSelected && !categoryPickerExpanded && (
                                <View style={guidedServiceSummaryStyle}>
                                    <Text style={guidedServiceSummaryLabelStyle}>Service selected</Text>
                                    <Text style={guidedServiceSummaryTitleStyle}>{phase1Workspace.template.label}</Text>
                                </View>
                            )}

                                <TouchableOpacity
                                    disabled={!estimateScopeSelected || categoryPickerExpanded}
                                    onPress={() => setGuidedBuildStep('findings')}
                                    style={!estimateScopeSelected || categoryPickerExpanded ? guidedMutedPrimaryButtonStyle : guidedPrimaryButtonStyle}
                                >
                                    <Text style={guidedPrimaryButtonTextStyle}>Continue to Findings</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {guidedBuildStep === 'findings' && estimateScopeSelected && !categoryPickerExpanded && (
                                <View style={guidedSectionStyle}>
                                    <View style={guidedSectionHeadingRowStyle}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={guidedStepStyle}>STEP 2</Text>
                                            <Text style={guidedSectionTitleStyle}>Findings for this work</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => setGuidedBuildStep('work')} style={guidedTextButtonStyle}>
                                            <Text style={guidedTextButtonTextStyle}>Back to Work</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={guidedSectionDescriptionStyle}>
                                        Tap the findings that apply. Only this service is shown—unrelated price-book work stays out of the page.
                                    </Text>
                                    <View style={guidedQuestionGridStyle}>
                                        {phase1Workspace.template.questions.map((question) =>
                                            renderQuestion(question, answers, updateAnswer, toggleMultiAnswer)
                                        )}
                                    </View>

                                    {attentionParts.length > 0 ? (
                                        <View style={guidedAttentionStyle}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={guidedAttentionTitleStyle}>Needs attention</Text>
                                                <Text style={guidedAttentionTextStyle}>
                                                    {attentionParts.join(' · ')} still needed before homeowner presentation. You can price and save an option now.
                                                </Text>
                                            </View>
                                            <TouchableOpacity onPress={() => setDocumentationExpanded(!documentationExpanded)} style={guidedAttentionButtonStyle}>
                                                <Text style={guidedAttentionButtonTextStyle}>{documentationExpanded ? 'Hide' : 'Open'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <View style={guidedReadyStyle}>
                                            <Text style={guidedReadyTextStyle}>✓ Findings and required documentation are complete.</Text>
                                        </View>
                                    )}

                                    {documentationExpanded && (
                                        <View style={guidedDocumentationStyle}>
                                            <Text style={guidedDocumentationTitleStyle}>Photos & measurements</Text>
                                            <Text style={guidedSectionDescriptionStyle}>
                                                Add these in the field when needed. Skipping does not change the deterministic price, but final presentation still shows what is missing.
                                            </Text>
                                            <View style={requirementGridStyle}>
                                                {phase1Workspace.template.requiredPhotoLabels.map((label) => renderPhotoRequirementCard({
                                                    label,
                                                    answers,
                                                    previewByKey: photoPreviewByKey,
                                                    uploadByKey: requirementUploadByKey,
                                                    choosePhoto: chooseRequirementPhoto,
                                                    removePhoto: removeRequirementPhoto,
                                                    skipRequirement: (requirementLabel, reason) => skipRequirement('photo', requirementLabel, reason),
                                                    clearSkippedRequirement: (requirementLabel) => clearSkippedRequirement('photo', requirementLabel),
                                                }))}
                                                {phase1Workspace.template.requiredMeasurementLabels.map((label) => renderMeasurementRequirementCard({
                                                    label,
                                                    answers,
                                                    measurementDraftByKey,
                                                    measurementErrorByKey,
                                                    updateMeasurementDraft,
                                                    saveMeasurement: saveRequirementMeasurement,
                                                    clearMeasurement: clearRequirementMeasurement,
                                                    skipRequirement: (requirementLabel, reason) => skipRequirement('measurement', requirementLabel, reason),
                                                    clearSkippedRequirement: (requirementLabel) => clearSkippedRequirement('measurement', requirementLabel),
                                                }))}
                                            </View>
                                        </View>
                                    )}

                                    <TouchableOpacity onPress={() => setGuidedBuildStep('price')} style={guidedPrimaryButtonStyle}>
                                        <Text style={guidedPrimaryButtonTextStyle}>Continue to Price & Summary</Text>
                                    </TouchableOpacity>
                                </View>
                        )}

                        {guidedBuildStep === 'price' && customQuoteMode && (
                            <View style={guidedSectionStyle}>
                                <View style={guidedSectionHeadingRowStyle}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={guidedStepStyle}>CUSTOM QUOTE</Text>
                                        <Text style={guidedSectionTitleStyle}>Create work from scratch</Text>
                                    </View>
                                    <TouchableOpacity onPress={cancelCustomQuote} style={guidedTextButtonStyle}>
                                        <Text style={guidedTextButtonTextStyle}>Cancel</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={guidedSectionDescriptionStyle}>
                                    This creates one technician-defined option. HomeOS will not replace it with another service or guess a price-book item.
                                </Text>

                                <Text style={guidedFieldLabelStyle}>Option name</Text>
                                <TextInput
                                    onChangeText={(value) => updateCustomQuoteDraft('name', value)}
                                    placeholder="Example: Custom shower valve repair"
                                    style={guidedAdjustmentInputStyle}
                                    value={customQuoteDraft.name}
                                />

                                <Text style={guidedFieldLabelStyle}>Work to be performed</Text>
                                <Text style={guidedFieldHelpStyle}>List the exact work included in this price. Type or use phone dictation.</Text>
                                <TextInput
                                    multiline
                                    onChangeText={(value) => updateCustomQuoteDraft('workScope', value)}
                                    placeholder="Describe the exact work, materials, testing, cleanup, and anything else included."
                                    style={guidedSummaryInputStyle}
                                    value={customQuoteDraft.workScope}
                                />

                                <Text style={guidedFieldLabelStyle}>Customer summary</Text>
                                <TextInput
                                    multiline
                                    onChangeText={(value) => updateCustomQuoteDraft('customerSummary', value)}
                                    placeholder="Explain what will be done and why it is recommended."
                                    style={guidedSummaryInputStyle}
                                    value={customQuoteDraft.customerSummary}
                                />

                                <Text style={guidedFieldLabelStyle}>Exact customer price</Text>
                                <View style={guidedAdjustmentInputRowStyle}>
                                    <TextInput
                                        inputMode="decimal"
                                        keyboardType="decimal-pad"
                                        onChangeText={(value) => updateCustomQuoteDraft('price', value)}
                                        placeholder="0.00"
                                        style={guidedAdjustmentInputStyle}
                                        value={customQuoteDraft.price}
                                    />
                                    <Text style={guidedAdjustmentUnitStyle}>$ total</Text>
                                </View>
                                <Text style={guidedFieldHelpStyle}>
                                    This exact amount becomes the original price. You can still edit, discount, mark up, or override it from Quote Review.
                                </Text>

                                <TouchableOpacity
                                    disabled={savingGuidedOption}
                                    onPress={() => void persistAddCustom()}
                                    style={savingGuidedOption ? guidedMutedPrimaryButtonStyle : guidedPrimaryButtonStyle}
                                >
                                    <Text style={guidedPrimaryButtonTextStyle}>{savingGuidedOption ? 'Saving option…' : 'Add Custom Quote to Options'}</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {guidedBuildStep === 'price' && estimateScopeSelected && !categoryPickerExpanded && !customQuoteMode && (
                                <View style={guidedSectionStyle}>
                                    <View style={guidedSectionHeadingRowStyle}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={guidedStepStyle}>STEP 3</Text>
                                            <Text style={guidedSectionTitleStyle}>Price & customer summary</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => setGuidedBuildStep('findings')} style={guidedTextButtonStyle}>
                                            <Text style={guidedTextButtonTextStyle}>Back to Findings</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {selectedCategory === 'water_heater' && (
                                        <View style={guidedProductPickerStyle}>
                                            <Text style={guidedFieldLabelStyle}>Approved equipment</Text>
                                            <Text style={guidedFieldHelpStyle}>
                                                {candidateEstimateChoices.length > 1
                                                    ? `${candidateEstimateChoices.length} matching approved product choices are available.`
                                                    : approvedProductMessage}
                                            </Text>
                                            {candidateEstimateChoices.length > 1 && (
                                                <View style={guidedProductChoiceGridStyle}>
                                                    {candidateEstimateChoices.map((choice) => {
                                                        const selected = choice.id === currentCandidateChoice?.id;

                                                        return (
                                                            <TouchableOpacity
                                                                accessibilityLabel={`Use ${choice.title}`}
                                                                accessibilityRole="radio"
                                                                accessibilityState={{ selected }}
                                                                key={choice.id}
                                                                onPress={() => selectCandidateChoice(choice.id)}
                                                                style={selected ? guidedProductChoiceSelectedStyle : guidedProductChoiceStyle}
                                                            >
                                                                <Text style={selected ? guidedProductChoiceTitleSelectedStyle : guidedProductChoiceTitleStyle}>
                                                                    {choice.title}
                                                                </Text>
                                                                <Text style={guidedProductChoiceMetaStyle}>{choice.shortSummary}</Text>
                                                                <Text style={guidedProductChoicePriceStyle}>{formatMoney(choice.pricingResult.totalAmount)}</Text>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                            )}
                                        </View>
                                    )}

                                    {phase1Workspace.pricingSetupRequired || !currentCandidateChoice ? (
                                        <View style={guidedPricingMissingStyle}>
                                            <Text style={guidedPricingMissingTitleStyle}>Price setup needed</Text>
                                            <Text style={guidedSectionDescriptionStyle}>
                                                {priceBookMessage}. Choose the exact repair above, or add an active company selling price for this work.
                                            </Text>
                                            {canUsePricing && (
                                                <TouchableOpacity onPress={() => router.push(companyPriceBookRoute as never)} style={guidedSecondaryButtonStyle}>
                                                    <Text style={guidedSecondaryButtonTextStyle}>{canManagePricing ? 'Open Company Price Book' : 'View Company Price Book'}</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    ) : (
                                        <>
                                            <View style={guidedPriceCardStyle}>
                                                <View style={guidedPriceHeaderStyle}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={guidedPriceLabelStyle}>THIS OPTION</Text>
                                                        <Text style={guidedPriceTitleStyle}>{currentCandidateChoice.title}</Text>
                                                    </View>
                                                    <Text style={guidedPriceTotalStyle}>{formatMoney(finalTotal)}</Text>
                                                </View>
                                                <Text style={guidedLinePickerHelpStyle}>Select one service to adjust its price.</Text>
                                                {(baseCandidate || currentCandidateChoice).pricingResult.lineItems.map((baseLine) => {
                                                    const finalLine = currentCandidateChoice.pricingResult.lineItems.find((line) => line.id === baseLine.id) || baseLine;
                                                    const adjustment = currentCandidateChoice.linePriceAdjustments?.[baseLine.id];
                                                    const selected = baseLine.id === selectedAdjustmentLineId;
                                                    const priceChanged = finalLine.totalAmount !== baseLine.totalAmount;

                                                    return (
                                                        <TouchableOpacity
                                                            accessibilityLabel={`Adjust ${baseLine.name}`}
                                                            accessibilityRole="button"
                                                            accessibilityState={{ selected }}
                                                            key={baseLine.id}
                                                            onPress={() => selectGuidedAdjustmentLine(baseCandidate || currentCandidateChoice, baseLine)}
                                                            style={[guidedLineItemStyle, selected ? guidedLineItemSelectedStyle : null]}
                                                        >
                                                            <View style={selected ? guidedLineSelectionDotSelectedStyle : guidedLineSelectionDotStyle} />
                                                            <View style={guidedLineItemContentStyle}>
                                                                <Text style={guidedLineItemNameStyle}>{baseLine.name}</Text>
                                                                <Text style={guidedLineItemStatusStyle}>
                                                                    {adjustment
                                                                        ? adjustment.mode === 'discount'
                                                                            ? `${formatEstimatePriceAdjustmentPercentage(adjustment.percentage)} ${adjustment.label || 'discount'}`
                                                                            : adjustment.mode === 'markup'
                                                                                ? `${formatEstimatePriceAdjustmentPercentage(adjustment.percentage)} markup`
                                                                                : 'Authorized price override'
                                                                        : selected ? 'Selected for adjustment' : 'Tap to adjust'}
                                                                </Text>
                                                            </View>
                                                            <View style={guidedLineItemPriceColumnStyle}>
                                                                {priceChanged && <Text style={guidedLineItemBasePriceStyle}>{formatMoney(baseLine.totalAmount)}</Text>}
                                                                <Text style={guidedLineItemPriceStyle}>{formatMoney(finalLine.totalAmount)}</Text>
                                                            </View>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>

                                            <View style={guidedAdjustmentStyle}>
                                                <Text style={guidedFieldLabelStyle}>Adjust selected service</Text>
                                                <Text style={guidedSelectedLineNameStyle}>{selectedBaseLine?.name || 'Select a service above'}</Text>
                                                <Text style={guidedFieldHelpStyle}>The discount, markup, or override applies only to this service line.</Text>
                                                <View style={guidedModeRowStyle}>
                                                    {([
                                                        ['none', 'No adjustment'],
                                                        ['discount', 'Discount'],
                                                        ['markup', 'Markup'],
                                                        ['override', 'Authorized override'],
                                                    ] as [GuidedPriceAdjustmentMode, string][]).map(([mode, label]) => (
                                                        <TouchableOpacity
                                                            key={mode}
                                                            onPress={() => setGuidedAdjustmentMode(mode)}
                                                            style={guidedAdjustmentMode === mode ? guidedModeChipSelectedStyle : guidedModeChipStyle}
                                                        >
                                                            <Text style={guidedAdjustmentMode === mode ? guidedModeChipSelectedTextStyle : guidedModeChipTextStyle}>{label}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                                {guidedAdjustmentMode !== 'none' && (
                                                    <View style={guidedAdjustmentInputRowStyle}>
                                                        <TextInput
                                                            inputMode="decimal"
                                                            keyboardType="decimal-pad"
                                                            onChangeText={setGuidedAdjustmentValue}
                                                            placeholder={guidedAdjustmentMode === 'override' ? 'Final price in dollars' : 'Percentage'}
                                                            style={guidedAdjustmentInputStyle}
                                                            value={guidedAdjustmentValue}
                                                        />
                                                        <Text style={guidedAdjustmentUnitStyle}>{guidedAdjustmentMode === 'override' ? '$ final' : '%'}</Text>
                                                    </View>
                                                )}
                                                {guidedAdjustmentMode === 'discount' && (
                                                    <TextInput
                                                        onChangeText={setGuidedDiscountLabel}
                                                        placeholder="Discount name (required)"
                                                        style={guidedAdjustmentInputStyle}
                                                        value={guidedDiscountLabel}
                                                    />
                                                )}
                                                <View style={guidedAdjustmentSummaryStyle}>
                                                    <Text style={guidedAdjustmentSummaryTextStyle}>Company price {formatMoney(selectedBaseLine?.totalAmount || 0)}</Text>
                                                    <Text style={guidedAdjustmentSummaryTextStyle}>
                                                        {selectedLineAdjustmentAmount === 0 ? 'No change' : `${selectedLineAdjustmentAmount > 0 ? '+' : '−'}${formatMoney(Math.abs(selectedLineAdjustmentAmount))}`}
                                                    </Text>
                                                    <Text style={guidedAdjustmentFinalStyle}>Adjusted line {formatMoney(selectedFinalLine?.totalAmount || selectedBaseLine?.totalAmount || 0)}</Text>
                                                </View>
                                                <TouchableOpacity onPress={() => applyGuidedPriceAdjustment(baseCandidate || currentCandidateChoice)} style={guidedSecondaryButtonStyle}>
                                                    <Text style={guidedSecondaryButtonTextStyle}>Apply to selected service</Text>
                                                </TouchableOpacity>
                                                <View style={guidedOptionTotalSummaryStyle}>
                                                    <Text style={guidedOptionTotalLabelStyle}>Option total</Text>
                                                    <Text style={guidedOptionTotalChangeStyle}>
                                                        {adjustmentAmount === 0 ? 'No total change' : `${adjustmentAmount > 0 ? '+' : '−'}${formatMoney(Math.abs(adjustmentAmount))}`}
                                                    </Text>
                                                    <Text style={guidedOptionTotalPriceStyle}>{formatMoney(finalTotal)}</Text>
                                                </View>
                                            </View>

                                            <Text style={guidedFieldLabelStyle}>Technician notes / dictation</Text>
                                            <Text style={guidedFieldHelpStyle}>Type here or use the microphone on the phone keyboard.</Text>
                                            <TextInput
                                                multiline
                                                onBlur={() => void saveGuidedTechnicianNotes()}
                                                onChangeText={updateGuidedTechnicianNotes}
                                                placeholder="Describe what you found and why this work is recommended."
                                                style={guidedNotesInputStyle}
                                                value={draftContext?.issue_summary || ''}
                                            />

                                            <View style={guidedSummaryHeaderStyle}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={guidedFieldLabelStyle}>Customer summary</Text>
                                                    <Text style={guidedFieldHelpStyle}>AI can organize documented facts, but it cannot add work or change the price.</Text>
                                                </View>
                                                <TouchableOpacity
                                                    disabled={aiDrafting || requirementUploadInProgress}
                                                    onPress={() => void draftWithAi([currentCandidateChoice], phase1Workspace.draftGate)}
                                                    style={aiDrafting ? guidedMutedButtonStyle : guidedAiButtonStyle}
                                                >
                                                    <Text style={guidedAiButtonTextStyle}>{aiDrafting ? 'Writing…' : 'Write with AI'}</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <TextInput
                                                multiline
                                                onChangeText={(value) => updateChoiceCopy(currentCandidateChoice.id, 'homeownerExplanation', value)}
                                                placeholder="Customer-facing explanation"
                                                style={guidedSummaryInputStyle}
                                                value={currentCandidateChoice.homeownerExplanation}
                                            />

                                            <TouchableOpacity
                                                disabled={!canAddCurrent || savingGuidedOption}
                                                onPress={() => void persistAddCurrent(currentCandidateChoice)}
                                                style={!canAddCurrent || savingGuidedOption ? guidedMutedPrimaryButtonStyle : guidedPrimaryButtonStyle}
                                            >
                                                <Text style={guidedPrimaryButtonTextStyle}>{savingGuidedOption ? 'Saving option…' : 'Add to Options'}</Text>
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                        )}
                    </>
                )}

                {guidedStep === 'option_added' && (
                    <View style={guidedDecisionStyle}>
                        <View style={guidedDecisionCheckStyle}><Text style={guidedDecisionCheckTextStyle}>✓</Text></View>
                        <Text style={guidedDecisionTitleStyle}>
                            Option {estimateChoices.length} added
                        </Text>
                        <Text style={guidedDecisionTextStyle}>Would you like to add another option for this customer?</Text>
                        <Text style={guidedDecisionTextStyle}>Choose a related option below, search the Price Book, or continue with the options you have.</Text>
                        <TouchableOpacity onPress={() => setGuidedStep('review')} style={guidedPrimaryButtonStyle}>
                            <Text style={guidedPrimaryButtonTextStyle}>No — review & continue</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {(guidedStep === 'option_added' || guidedStep === 'recommendations') && (
                    <View style={guidedSectionStyle}>
                        <Text style={guidedStepStyle}>RELATED OPTIONS</Text>
                        <Text style={guidedSectionTitleStyle}>
                            {guidedStep === 'option_added' ? 'Yes — choose another option' : 'Choose another customer option'}
                        </Text>
                        <Text style={guidedSectionDescriptionStyle}>
                            HomeOS shows up to four rule-based choices. Nothing is added until you tap Add option.
                        </Text>

                        {eligibleRecommendations.length > 0 ? (
                            <View style={guidedRecommendationGridStyle}>
                                {eligibleRecommendations.map((recommendation) => (
                                    <View key={recommendation.id} style={guidedRecommendationCardStyle}>
                                        <Text style={guidedRelationshipStyle}>{guidedRelationshipLabel(recommendation.relationship)}</Text>
                                        <Text style={guidedRecommendationTitleStyle}>{recommendation.title}</Text>
                                        <Text style={guidedRecommendationReasonStyle}>{recommendation.reason}</Text>
                                        <TouchableOpacity
                                            disabled={!recommendationBaseChoice || savingGuidedOption}
                                            onPress={() => recommendationBaseChoice && void persistAddRecommendation(recommendation, recommendationBaseChoice)}
                                            style={guidedRecommendationButtonStyle}
                                        >
                                            <Text style={guidedRecommendationButtonTextStyle}>Add option</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View style={guidedNoRecommendationStyle}>
                                <Text style={guidedNoRecommendationTitleStyle}>No automatic recommendation</Text>
                                <Text style={guidedSectionDescriptionStyle}>
                                    The findings do not support another configured option. Search the active company Price Book if you need a technician-selected choice.
                                </Text>
                            </View>
                        )}

                        <View style={guidedSearchStyle}>
                            <Text style={guidedFieldLabelStyle}>Pick my own</Text>
                            <TextInput
                                onChangeText={setRelatedSearch}
                                placeholder="Search active company Price Book"
                                style={guidedSearchInputStyle}
                                value={relatedSearch}
                            />
                            {relatedSearchResults.map((item) => (
                                <View key={item.id} style={guidedSearchResultStyle}>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={guidedSearchResultTitleStyle}>{item.name}</Text>
                                        <Text style={guidedSearchResultMetaStyle}>{item.category} · {formatMoney(Number(item.recommended_selling_price ?? item.base_price))}</Text>
                                    </View>
                                    <TouchableOpacity
                                        disabled={!recommendationBaseChoice || savingGuidedOption}
                                        onPress={() => recommendationBaseChoice && void persistAddSearchResult(item, recommendationBaseChoice)}
                                        style={guidedSearchAddStyle}
                                    >
                                        <Text style={guidedSearchAddTextStyle}>Add</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>

                        <TouchableOpacity onPress={startCustomQuote} style={guidedSecondaryButtonStyle}>
                            <Text style={guidedSecondaryButtonTextStyle}>Create a custom option</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setGuidedStep('review')} style={guidedSecondaryButtonStyle}>
                            <Text style={guidedSecondaryButtonTextStyle}>Review current options</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {guidedStep === 'review' && (
                    <View style={guidedSectionStyle}>
                        <Text style={guidedStepStyle}>QUOTE REVIEW</Text>
                        <Text style={guidedSectionTitleStyle}>{estimateChoices.length} customer option{estimateChoices.length === 1 ? '' : 's'}</Text>
                        <Text style={guidedSectionDescriptionStyle}>Each card contains only the work and price included in that option.</Text>

                        <View style={guidedReviewListStyle}>
                            {estimateChoices.map((choice, index) => {
                                const baseChoice = estimateChoiceBases.find((candidate) => candidate.id === choice.id) || choice;
                                const editing = editingGuidedOptionId === choice.id;

                                return (
                                    <View key={choice.id} style={guidedReviewCardStyle}>
                                        <View style={guidedReviewHeaderStyle}>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={guidedRelationshipStyle}>OPTION {index + 1}</Text>
                                                <Text style={guidedReviewTitleStyle}>{choice.title}</Text>
                                            </View>
                                            <Text style={guidedReviewPriceStyle}>{formatMoney(choice.pricingResult.totalAmount)}</Text>
                                        </View>
                                        <Text style={guidedReviewSummaryStyle}>{choice.homeownerExplanation}</Text>
                                        {isCustomEstimateChoice(choice) && (
                                            <View style={guidedCustomerSelectionListStyle}>
                                                <Text style={customerSelectionTitleStyle}>Custom work to be performed</Text>
                                                <Text style={customerSelectionTextStyle}>{choice.shortSummary}</Text>
                                            </View>
                                        )}
                                        {!!choice.customerSelections?.length && !isCustomEstimateChoice(choice) && (
                                            <View style={guidedCustomerSelectionListStyle}>
                                                <Text style={customerSelectionTitleStyle}>Selected equipment and site details</Text>
                                                {choice.customerSelections.map((selection) => (
                                                    <Text key={`${choice.id}-${selection}`} style={customerSelectionTextStyle}>
                                                        • {selection}
                                                    </Text>
                                                ))}
                                            </View>
                                        )}
                                        {choice.pricingResult.lineItems.map((line) => (
                                            <View key={line.id} style={guidedLineItemStyle}>
                                                <Text style={guidedLineItemNameStyle}>{line.name}</Text>
                                                <Text style={guidedLineItemPriceStyle}>{formatMoney(line.totalAmount)}</Text>
                                            </View>
                                        ))}

                                        {editing && editingBaseChoice && editingFinalChoice && (
                                            <View style={guidedReviewEditorStyle}>
                                                <Text style={guidedStepStyle}>EDIT OPTION {index + 1}</Text>
                                                {isCustomEstimateChoice(choice) && (
                                                    <>
                                                        <Text style={guidedFieldLabelStyle}>Option name</Text>
                                                        <TextInput
                                                            onChangeText={(value) => updateChoiceCopy(choice.id, 'title', value)}
                                                            placeholder="Custom option name"
                                                            style={guidedAdjustmentInputStyle}
                                                            value={choice.title}
                                                        />
                                                        <Text style={guidedFieldLabelStyle}>Work to be performed</Text>
                                                        <TextInput
                                                            multiline
                                                            onChangeText={(value) => updateChoiceCopy(choice.id, 'shortSummary', value)}
                                                            placeholder="Exact work included"
                                                            style={guidedSummaryInputStyle}
                                                            value={choice.shortSummary}
                                                        />
                                                    </>
                                                )}
                                                <Text style={guidedFieldLabelStyle}>Choose the included service to change</Text>
                                                {editingBaseChoice.pricingResult.lineItems.map((baseLine) => {
                                                    const finalLine = editingFinalChoice.pricingResult.lineItems.find((line) => line.id === baseLine.id) || baseLine;
                                                    const adjustment = editingFinalChoice.linePriceAdjustments?.[baseLine.id];
                                                    const selected = baseLine.id === editingSelectedLineId;
                                                    const priceChanged = finalLine.totalAmount !== baseLine.totalAmount;

                                                    return (
                                                        <TouchableOpacity
                                                            accessibilityLabel={`Edit ${baseLine.name}`}
                                                            accessibilityRole="button"
                                                            accessibilityState={{ selected }}
                                                            key={baseLine.id}
                                                            onPress={() => selectGuidedAdjustmentLine(editingBaseChoice, baseLine, editingFinalChoice)}
                                                            style={[guidedLineItemStyle, selected ? guidedLineItemSelectedStyle : null]}
                                                        >
                                                            <View style={selected ? guidedLineSelectionDotSelectedStyle : guidedLineSelectionDotStyle} />
                                                            <View style={guidedLineItemContentStyle}>
                                                                <Text style={guidedLineItemNameStyle}>{baseLine.name}</Text>
                                                                <Text style={guidedLineItemStatusStyle}>
                                                                    {adjustment
                                                                        ? adjustment.mode === 'discount'
                                                                            ? `${formatEstimatePriceAdjustmentPercentage(adjustment.percentage)} ${adjustment.label || 'discount'}`
                                                                            : adjustment.mode === 'markup'
                                                                                ? `${formatEstimatePriceAdjustmentPercentage(adjustment.percentage)} markup`
                                                                                : 'Authorized price override'
                                                                        : selected ? 'Selected for editing' : 'Tap to edit'}
                                                                </Text>
                                                            </View>
                                                            <View style={guidedLineItemPriceColumnStyle}>
                                                                {priceChanged && <Text style={guidedLineItemBasePriceStyle}>{formatMoney(baseLine.totalAmount)}</Text>}
                                                                <Text style={guidedLineItemPriceStyle}>{formatMoney(finalLine.totalAmount)}</Text>
                                                            </View>
                                                        </TouchableOpacity>
                                                    );
                                                })}

                                                <View style={guidedAdjustmentStyle}>
                                                    <Text style={guidedFieldLabelStyle}>Adjust selected service</Text>
                                                    <Text style={guidedSelectedLineNameStyle}>{editingBaseLine?.name || 'Select a service above'}</Text>
                                                    <View style={guidedModeRowStyle}>
                                                        {([
                                                            ['none', 'No adjustment'],
                                                            ['discount', 'Discount'],
                                                            ['markup', 'Markup'],
                                                            ['override', 'Authorized override'],
                                                        ] as [GuidedPriceAdjustmentMode, string][]).map(([mode, label]) => (
                                                            <TouchableOpacity
                                                                key={mode}
                                                                onPress={() => setGuidedAdjustmentMode(mode)}
                                                                style={guidedAdjustmentMode === mode ? guidedModeChipSelectedStyle : guidedModeChipStyle}
                                                            >
                                                                <Text style={guidedAdjustmentMode === mode ? guidedModeChipSelectedTextStyle : guidedModeChipTextStyle}>{label}</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                    {guidedAdjustmentMode !== 'none' && (
                                                        <View style={guidedAdjustmentInputRowStyle}>
                                                            <TextInput
                                                                inputMode="decimal"
                                                                keyboardType="decimal-pad"
                                                                onChangeText={setGuidedAdjustmentValue}
                                                                placeholder={guidedAdjustmentMode === 'override' ? 'Final price in dollars' : 'Percentage'}
                                                                style={guidedAdjustmentInputStyle}
                                                                value={guidedAdjustmentValue}
                                                            />
                                                            <Text style={guidedAdjustmentUnitStyle}>{guidedAdjustmentMode === 'override' ? '$ final' : '%'}</Text>
                                                        </View>
                                                    )}
                                                    {guidedAdjustmentMode === 'discount' && (
                                                        <TextInput
                                                            onChangeText={setGuidedDiscountLabel}
                                                            placeholder="Discount name (required)"
                                                            style={guidedAdjustmentInputStyle}
                                                            value={guidedDiscountLabel}
                                                        />
                                                    )}
                                                    <View style={guidedAdjustmentSummaryStyle}>
                                                        <Text style={guidedAdjustmentSummaryTextStyle}>
                                                            {isCustomEstimateChoice(choice) ? 'Original custom price' : 'Company price'} {formatMoney(editingBaseLine?.totalAmount || 0)}
                                                        </Text>
                                                        <Text style={guidedAdjustmentSummaryTextStyle}>
                                                            {editingLineAdjustmentAmount === 0 ? 'No change' : `${editingLineAdjustmentAmount > 0 ? '+' : '−'}${formatMoney(Math.abs(editingLineAdjustmentAmount))}`}
                                                        </Text>
                                                        <Text style={guidedAdjustmentFinalStyle}>Adjusted line {formatMoney(editingFinalLine?.totalAmount || editingBaseLine?.totalAmount || 0)}</Text>
                                                    </View>
                                                    <TouchableOpacity onPress={() => applyGuidedPriceAdjustment(editingBaseChoice)} style={guidedSecondaryButtonStyle}>
                                                        <Text style={guidedSecondaryButtonTextStyle}>Apply to selected service</Text>
                                                    </TouchableOpacity>
                                                    <View style={guidedOptionTotalSummaryStyle}>
                                                        <Text style={guidedOptionTotalLabelStyle}>Option total</Text>
                                                        <Text style={guidedOptionTotalChangeStyle}>
                                                            {editingOptionAdjustmentAmount === 0 ? 'No total change' : `${editingOptionAdjustmentAmount > 0 ? '+' : '−'}${formatMoney(Math.abs(editingOptionAdjustmentAmount))}`}
                                                        </Text>
                                                        <Text style={guidedOptionTotalPriceStyle}>{formatMoney(editingFinalChoice.pricingResult.totalAmount)}</Text>
                                                    </View>
                                                </View>

                                                <Text style={guidedFieldLabelStyle}>Customer summary</Text>
                                                <TextInput
                                                    multiline
                                                    onChangeText={(value) => updateChoiceCopy(choice.id, 'homeownerExplanation', value)}
                                                    placeholder="Customer-facing explanation"
                                                    style={guidedSummaryInputStyle}
                                                    value={choice.homeownerExplanation}
                                                />

                                                <View style={guidedReviewEditorActionsStyle}>
                                                    <TouchableOpacity onPress={cancelGuidedOptionEdit} style={guidedSecondaryButtonStyle}>
                                                        <Text style={guidedSecondaryButtonTextStyle}>Cancel</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        disabled={savingGuidedOption}
                                                        onPress={() => void saveGuidedOptionEdits(estimateChoices, choice.id)}
                                                        style={savingGuidedOption ? guidedMutedPrimaryButtonStyle : guidedPrimaryButtonStyle}
                                                    >
                                                        <Text style={guidedPrimaryButtonTextStyle}>{savingGuidedOption ? 'Saving changes…' : 'Save option changes'}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        )}

                                        {!editing && !editingGuidedOptionId && (
                                            <View style={guidedReviewCardActionsStyle}>
                                                <TouchableOpacity onPress={() => beginGuidedOptionEdit(baseChoice, choice)} style={guidedEditButtonStyle}>
                                                    <Text style={guidedEditButtonTextStyle}>Edit option</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => void persistRemoveOption(choice.id)} style={guidedRemoveButtonStyle}>
                                                    <Text style={guidedRemoveButtonTextStyle}>Remove option</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>

                        {reviewAttentionParts.length > 0 && (
                            <View style={guidedAttentionStyle}>
                                <View style={{ flex: 1 }}>
                                    <Text style={guidedAttentionTitleStyle}>Before homeowner presentation</Text>
                                    <Text style={guidedAttentionTextStyle}>{reviewAttentionParts.join(' · ')} still needed.</Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => {
                                        setGuidedBuildStep('findings');
                                        setGuidedStep('build');
                                    }}
                                    style={guidedAttentionButtonStyle}
                                >
                                    <Text style={guidedAttentionButtonTextStyle}>Finish</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {!editingGuidedOptionId && (
                            <View style={guidedReviewActionsStyle}>
                                <TouchableOpacity onPress={() => setGuidedStep('recommendations')} style={guidedSecondaryButtonStyle}>
                                    <Text style={guidedSecondaryButtonTextStyle}>Add another option</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    disabled={!canApprove}
                                    onPress={() => void approveForPresentation(estimateChoices)}
                                    style={canApprove ? guidedPrimaryButtonStyle : guidedMutedPrimaryButtonStyle}
                                >
                                    <Text style={guidedPrimaryButtonTextStyle}>{technicianApproved ? 'Option set approved ✓' : canApprove ? 'Approve option set' : 'Complete required items first'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    disabled={!technicianApproved}
                                    onPress={() => void openHomeownerApproval()}
                                    style={technicianApproved ? guidedPresentButtonStyle : guidedMutedPrimaryButtonStyle}
                                >
                                    <Text style={guidedPrimaryButtonTextStyle}>Present to homeowner</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                <Text style={guidedFooterStyle}>{BUILD_DISPLAY} · {items.length} selected HomeOS item{items.length === 1 ? '' : 's'}</Text>
            </View>
        </ScrollView>
    );
}

function guidedProgressIndex(step: GuidedEstimateStep, buildStep: GuidedBuildStep, scopeSelected: boolean) {
    if (step === 'option_added' || step === 'recommendations' || step === 'review') return 3;
    if (!scopeSelected || buildStep === 'work') return 0;
    return buildStep === 'findings' ? 1 : 2;
}

function isGuidedEstimateBuilderEnabled() {
    return true;
}

function guidedRelationshipLabel(relationship: EstimateRecommendationRelationship) {
    const labels: Record<EstimateRecommendationRelationship, string> = {
        alternative: 'ALTERNATIVE',
        add_on: 'RELATED ADD-ON',
        upgrade: 'UPGRADE',
        protection: 'PROTECTION',
        required_correction: 'DOCUMENTED CORRECTION',
    };

    return labels[relationship];
}

function nextGuidedOptionId(choices: PersistableEstimateChoice[]) {
    const usedIds = new Set(choices.map((choice) => choice.id));
    let index = choices.length + 1;

    while (usedIds.has(`option-${index}`)) index += 1;

    return `option-${index}`;
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

function resolveCurrentBuilderStep(
    guidedStep: GuidedEstimateStep,
    guidedBuildStep: GuidedBuildStep,
): EstimateBuilderStep {
    return guidedStep === 'build' ? guidedBuildStep : guidedStep;
}

function builderStepToGuidedState(step: EstimateBuilderStep): {
    guidedStep: GuidedEstimateStep;
    guidedBuildStep: GuidedBuildStep;
} {
    if (step === 'work' || step === 'findings' || step === 'price') {
        return { guidedStep: 'build', guidedBuildStep: step };
    }

    return { guidedStep: step, guidedBuildStep: 'price' };
}

function readPersistedEstimateBuilderState(
    value: EstimateBuilderSnapshot,
): PersistedEstimateBuilderState | null {
    const record = readObject(value);
    if (!record) return null;

    const selectedCategory = readEstimateOptionCategory(record.selectedCategory) || 'faucet_replacement';
    const workType = String(record.selectedWorkType || '').trim() as EstimateWorkType;
    const selectedWorkType = estimateWorkTypeOptions.some((option) => option.id === workType)
        ? workType
        : null;
    const guidedStepText = String(record.guidedStep || '').trim();
    const guidedBuildStepText = String(record.guidedBuildStep || '').trim();
    const adjustmentMode = String(record.guidedAdjustmentMode || '').trim();
    const draftContextRecord = readObject(record.draftContext);
    const customDraftRecord = readObject(record.customQuoteDraft);

    return {
        version: 1,
        items: Array.isArray(record.items) ? record.items as EstimateDraftItem[] : [],
        draftContext: draftContextRecord ? draftContextRecord as EstimateDraftContext : null,
        selectedChoiceId: readSnapshotString(record.selectedChoiceId),
        removedChoiceIds: readStringArray(record.removedChoiceIds),
        persistedOptionChoices: Array.isArray(record.persistedOptionChoices)
            ? record.persistedOptionChoices as PersistableEstimateChoice[]
            : [],
        selectedWorkType,
        estimateCategoryChosen: record.estimateCategoryChosen === true,
        selectedCategory,
        answers: (readObject(record.answers) || {}) as EstimateAnswerSet,
        measurementDraftByKey: (readObject(record.measurementDraftByKey) || {}) as Record<string, string>,
        technicianApproved: record.technicianApproved === true,
        aiDraftsByChoiceId: (readObject(record.aiDraftsByChoiceId) || {}) as Record<string, AiEstimateDraftChoice>,
        editableCopyByChoiceId: (readObject(record.editableCopyByChoiceId) || {}) as Record<string, EditableChoiceCopy>,
        priceAdjustmentByChoiceId: (readObject(record.priceAdjustmentByChoiceId) || {}) as Record<string, number>,
        customPriceAdjustmentByChoiceId: (readObject(record.customPriceAdjustmentByChoiceId) || {}) as Record<string, string>,
        priceAdjustmentDirectionByChoiceId: (readObject(record.priceAdjustmentDirectionByChoiceId) || {}) as Record<string, PriceAdjustmentDirection>,
        priceAdjustmentLabelByChoiceId: (readObject(record.priceAdjustmentLabelByChoiceId) || {}) as Record<string, string>,
        linePriceAdjustmentsByChoiceId: (readObject(record.linePriceAdjustmentsByChoiceId) || {}) as Record<string, Record<string, EstimateLinePriceAdjustment>>,
        guidedStep: ['build', 'option_added', 'recommendations', 'review'].includes(guidedStepText)
            ? guidedStepText as GuidedEstimateStep
            : 'build',
        guidedBuildStep: ['work', 'findings', 'price'].includes(guidedBuildStepText)
            ? guidedBuildStepText as GuidedBuildStep
            : 'work',
        documentationExpanded: record.documentationExpanded === true,
        scopePickerExpanded: record.scopePickerExpanded === true,
        relatedSearch: readSnapshotString(record.relatedSearch),
        guidedAdjustmentMode: ['none', 'discount', 'markup', 'override'].includes(adjustmentMode)
            ? adjustmentMode as GuidedPriceAdjustmentMode
            : 'none',
        guidedAdjustmentValue: readSnapshotString(record.guidedAdjustmentValue),
        guidedDiscountLabel: readSnapshotString(record.guidedDiscountLabel),
        guidedAdjustmentLineId: readSnapshotString(record.guidedAdjustmentLineId),
        editingGuidedOptionId: readSnapshotString(record.editingGuidedOptionId),
        customQuoteMode: record.customQuoteMode === true,
        customQuoteDraft: {
            name: readSnapshotString(customDraftRecord?.name),
            workScope: readSnapshotString(customDraftRecord?.workScope),
            customerSummary: readSnapshotString(customDraftRecord?.customerSummary),
            price: readSnapshotString(customDraftRecord?.price),
        },
    };
}

function buildDraftContextFromServerDraft(
    draft: CompanyEstimateBuilderDraft,
    companyUserId: string | null,
): EstimateDraftContext {
    return {
        estimate_session_id: draft.id,
        estimate_category: draft.category,
        company_id: draft.companyId,
        property_id: draft.propertyId,
        customer_home_name: draft.customerName,
        service_request_id: draft.serviceRequestId,
        job_id: draft.jobId,
        schedule_slot_id: draft.scheduleSlotId,
        technician_company_user_id: companyUserId,
        technician_name: null,
        issue_summary: draft.issueSummary,
        source: draft.source,
        updated_at: draft.updatedAt || new Date().toISOString(),
    };
}

function mapBuilderDraftToEstimateSession(draft: CompanyEstimateBuilderDraft): EstimateOptionSession {
    return {
        id: draft.id,
        companyId: draft.companyId,
        propertyId: draft.propertyId,
        serviceRequestId: draft.serviceRequestId,
        jobId: draft.jobId,
        scheduleSlotId: draft.scheduleSlotId,
        homeItemId: draft.homeItemId,
        category: draft.category,
        status: draft.status,
        source: draft.source,
        createdByCompanyUserId: null,
        technicianApprovedAt: null,
        presentedAt: null,
    };
}

function readObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function readStringArray(value: unknown) {
    return Array.isArray(value)
        ? value.map(readSnapshotString).filter(Boolean)
        : [];
}

function readSnapshotString(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function firstParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] || null : value || null;
}


function buildInternalRoute(path: string, entries: [string, string | null | undefined][]) {
    const query = entries
        .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value.trim())}`)
        .join('&');

    return query ? `${path}?${query}` : path;
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
    const complete = isEstimateQuestionAnswerComplete(question, answers);
    const allowedAnswers = getEstimateQuestionAllowedAnswers(question, answers);
    const isScopeQuestion = question.id.endsWith('_scope');
    const customAnswer = question.customAnswer;
    const customSelected = Boolean(
        customAnswer &&
        Array.isArray(currentAnswer) &&
        currentAnswer.includes(customAnswer.optionLabel)
    );
    const customAnswerValue = customAnswer ? answers[customAnswer.answerId] : undefined;

    return (
        <View
            key={question.id}
            style={[questionCardStyle, isScopeQuestion ? wideQuestionCardStyle : null, estimateQuestionTone(question.id)]}
        >
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
                    {(question.type === 'yes_no' && allowedAnswers.length === 0 ? ['yes', 'no'] : allowedAnswers).map((answer) => (
                        <TouchableOpacity
                            key={`${question.id}-${answer}`}
                            onPress={() => updateAnswer(question, answer)}
                            style={currentAnswer === answer
                                ? [answerButtonStyle, isScopeQuestion ? scopeAnswerButtonStyle : null, selectedAnswerButtonStyle]
                                : [answerButtonStyle, isScopeQuestion ? scopeAnswerButtonStyle : null]}
                        >
                            <Text style={currentAnswer === answer
                                ? [selectedAnswerButtonTextStyle, isScopeQuestion ? scopeAnswerButtonTextStyle : null]
                                : [answerButtonTextStyle, isScopeQuestion ? scopeAnswerButtonTextStyle : null]}
                            >
                                {answer}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ) : question.type === 'multi_select' ? (
                <View style={chipRowStyle}>
                    {allowedAnswers.map((answer) => {
                        const selected = Array.isArray(currentAnswer) && currentAnswer.includes(answer);

                        return (
                            <TouchableOpacity
                                key={`${question.id}-${answer}`}
                                onPress={() => toggleMultiAnswer(question, answer)}
                                style={selected
                                    ? [answerButtonStyle, isScopeQuestion ? scopeAnswerButtonStyle : null, selectedAnswerButtonStyle]
                                    : [answerButtonStyle, isScopeQuestion ? scopeAnswerButtonStyle : null]}
                            >
                                <Text style={selected
                                    ? [selectedAnswerButtonTextStyle, isScopeQuestion ? scopeAnswerButtonTextStyle : null]
                                    : [answerButtonTextStyle, isScopeQuestion ? scopeAnswerButtonTextStyle : null]}
                                >
                                    {answer}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ) : question.type === 'measurement' ? (
                <View style={{ gap: 7 }}>
                    <View style={guidedAdjustmentInputRowStyle}>
                        <TextInput
                            inputMode="decimal"
                            keyboardType="decimal-pad"
                            onChangeText={(value) => updateAnswer(question, value)}
                            placeholder={question.min ? `Minimum ${question.min}` : 'Enter amount'}
                            style={guidedAdjustmentInputStyle}
                            value={typeof currentAnswer === 'number' || typeof currentAnswer === 'string'
                                ? String(currentAnswer)
                                : ''}
                        />
                        <Text style={guidedAdjustmentUnitStyle}>
                            {question.id === 'exterior_pipe_linear_feet' ? 'linear ft' : 'hours'}
                        </Text>
                    </View>
                    {!complete && typeof currentAnswer === 'string' && currentAnswer.trim().length > 0 && (
                        <Text style={requirementErrorTextStyle}>
                            Enter a number{question.min !== undefined ? ` of at least ${question.min}` : ''}.
                        </Text>
                    )}
                </View>
            ) : question.type === 'counter' ? (
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

            {(question.id === 'exterior_pipe_material' || question.id === 'exterior_pipe_size') && allowedAnswers.length === 0 && (
                <Text style={guidedFieldHelpStyle}>Choose water, sewer, or gas first.</Text>
            )}

            {customAnswer && customSelected && (
                <View style={customScopeStyle}>
                    <Text style={customScopeLabelStyle}>{customAnswer.label}</Text>
                    <TextInput
                        value={typeof customAnswerValue === 'string'
                            ? customAnswerValue
                            : ''}
                        onChangeText={(value) => updateAnswer({
                            id: customAnswer.answerId,
                            label: customAnswer.label,
                            type: 'short_note',
                            required: true,
                        }, value)}
                        style={copyTextAreaStyle}
                        multiline
                        placeholder={customAnswer.placeholder}
                    />
                    <Text style={customScopeHelpStyle}>
                        Custom work is saved here, but it must have an approved company price-book line before automatic pricing.
                    </Text>
                </View>
            )}
        </View>
    );
}

function renderPhotoRequirementCard(input: {
    label: string;
    answers: EstimateAnswerSet;
    previewByKey: Record<string, string>;
    uploadByKey: Record<string, RequirementUploadState>;
    choosePhoto: (label: string, capture: boolean) => void;
    removePhoto: (label: string) => void;
    skipRequirement: (label: string, reason: EstimateRequirementSkipReason | null) => void;
    clearSkippedRequirement: (label: string) => void;
}) {
    const key = photoRequirementAnswerKey(input.label);
    const answer = input.answers[key];
    const complete = isPhotoRequirementComplete(answer);
    const skipped = isRequirementSkipAnswer(answer);
    const requirementState = getEstimateRequirementState(answer, complete);
    const previewUrl = input.previewByKey[key] || '';
    const uploadState = input.uploadByKey[key] || { uploading: false, error: null };

    return (
        <View key={key} style={[requirementCardStyle, photoRequirementToneStyle]}>
            <View style={choiceTitleRowStyle}>
                <Text style={requirementTitleStyle}>{input.label}</Text>
                <Text style={complete ? donePillStyle : requiredPillStyle}>
                    {formatRequirementState(requirementState)}
                </Text>
            </View>

            {previewUrl ? (
                <Image
                    source={{ uri: previewUrl }}
                    style={requirementPreviewStyle}
                    resizeMode="cover"
                />
            ) : (
                <View style={requirementPreviewPlaceholderStyle}>
                    <Text style={requirementPreviewPlaceholderTextStyle}>
                        {skipped ? 'Skipped for now' : 'No photo saved'}
                    </Text>
                </View>
            )}

            <View style={compactActionRowStyle}>
                <TouchableOpacity
                    onPress={() => input.choosePhoto(input.label, true)}
                    style={uploadState.uploading ? mutedButtonStyle : compactPrimaryButtonStyle}
                    disabled={uploadState.uploading}
                >
                    <Text style={compactPrimaryButtonTextStyle}>
                        {complete ? 'Replace' : 'Take Photo'}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => input.choosePhoto(input.label, false)}
                    style={uploadState.uploading ? mutedButtonStyle : compactSecondaryButtonStyle}
                    disabled={uploadState.uploading}
                >
                    <Text style={uploadState.uploading ? compactPrimaryButtonTextStyle : compactSecondaryButtonTextStyle}>
                        Choose Photo
                    </Text>
                </TouchableOpacity>
                {complete && (
                    <TouchableOpacity
                        onPress={() => input.removePhoto(input.label)}
                        style={uploadState.uploading ? mutedButtonStyle : compactDangerButtonStyle}
                        disabled={uploadState.uploading}
                    >
                        <Text style={uploadState.uploading ? compactPrimaryButtonTextStyle : compactDangerButtonTextStyle}>
                            Remove
                        </Text>
                    </TouchableOpacity>
                )}
                {skipped && (
                    <TouchableOpacity
                        onPress={() => input.clearSkippedRequirement(input.label)}
                        style={compactSecondaryButtonStyle}
                    >
                        <Text style={compactSecondaryButtonTextStyle}>
                            Clear Skip
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {!complete && !uploadState.uploading && (
                <View style={chipRowStyle}>
                    {requirementSkipReasons.map((skipReason) => (
                        <TouchableOpacity
                            key={`${key}-${skipReason.reason}`}
                            onPress={() => input.skipRequirement(input.label, skipReason.reason)}
                            style={answerButtonStyle}
                        >
                            <Text style={answerButtonTextStyle}>
                                {skipReason.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {uploadState.uploading && (
                <Text style={requirementProgressTextStyle}>Uploading...</Text>
            )}
            {!!uploadState.error && (
                <Text style={requirementErrorTextStyle}>{uploadState.error}</Text>
            )}
        </View>
    );
}

function renderMeasurementRequirementCard(input: {
    label: string;
    answers: EstimateAnswerSet;
    measurementDraftByKey: Record<string, string>;
    measurementErrorByKey: Record<string, string>;
    updateMeasurementDraft: (label: string, value: string) => void;
    saveMeasurement: (label: string) => void;
    clearMeasurement: (label: string) => void;
    skipRequirement: (label: string, reason: EstimateRequirementSkipReason | null) => void;
    clearSkippedRequirement: (label: string) => void;
}) {
    const key = measurementRequirementAnswerKey(input.label);
    const answer = input.answers[key];
    const complete = isMeasurementRequirementComplete(answer);
    const skipped = isRequirementSkipAnswer(answer);
    const requirementState = getEstimateRequirementState(answer, complete);
    const unit = isMeasurementRequirementAnswer(answer) ? answer.unit : defaultMeasurementUnit(input.label);
    const draftValue = input.measurementDraftByKey[key] ??
        (isMeasurementRequirementAnswer(answer) ? String(answer.value) : '');
    const error = input.measurementErrorByKey[key] || '';

    return (
        <View key={key} style={[requirementCardStyle, measurementRequirementToneStyle]}>
            <View style={choiceTitleRowStyle}>
                <Text style={requirementTitleStyle}>{getMeasurementRequirementPrompt(input.label)}</Text>
                <Text style={complete ? donePillStyle : requiredPillStyle}>
                    {formatRequirementState(requirementState)}
                </Text>
            </View>

            <View style={measurementInputRowStyle}>
                <TextInput
                    value={draftValue}
                    onChangeText={(value) => input.updateMeasurementDraft(input.label, value)}
                    style={measurementInputStyle}
                    keyboardType="decimal-pad"
                    placeholder={unit === 'sq ft' ? 'Enter square feet' : '0'}
                />
                <Text style={measurementUnitStyle}>{unit}</Text>
            </View>

            <View style={compactActionRowStyle}>
                <TouchableOpacity
                    onPress={() => input.saveMeasurement(input.label)}
                    style={compactPrimaryButtonStyle}
                >
                    <Text style={compactPrimaryButtonTextStyle}>
                        {complete ? 'Update' : 'Save'}
                    </Text>
                </TouchableOpacity>
                {complete && (
                    <TouchableOpacity
                        onPress={() => input.clearMeasurement(input.label)}
                        style={compactSecondaryButtonStyle}
                    >
                        <Text style={compactSecondaryButtonTextStyle}>Clear</Text>
                    </TouchableOpacity>
                )}
                {skipped && (
                    <TouchableOpacity
                        onPress={() => input.clearSkippedRequirement(input.label)}
                        style={compactSecondaryButtonStyle}
                    >
                        <Text style={compactSecondaryButtonTextStyle}>Clear Skip</Text>
                    </TouchableOpacity>
                )}
            </View>

            {!complete && (
                <View style={chipRowStyle}>
                    {requirementSkipReasons.map((skipReason) => (
                        <TouchableOpacity
                            key={`${key}-${skipReason.reason}`}
                            onPress={() => input.skipRequirement(input.label, skipReason.reason)}
                            style={answerButtonStyle}
                        >
                            <Text style={answerButtonTextStyle}>
                                {skipReason.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {skipped && (
                <Text style={requirementProgressTextStyle}>Skipped for now</Text>
            )}

            {!!error && (
                <Text style={requirementErrorTextStyle}>{error}</Text>
            )}
        </View>
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
            {presentationChoice.priceAdjustmentPercentage < 0 && presentationChoice.priceAdjustmentLabel && (
                <Text style={presentationDiscountStyle}>
                    {presentationChoice.priceAdjustmentLabel}: {formatEstimatePriceAdjustmentPercentage(presentationChoice.priceAdjustmentPercentage)}
                </Text>
            )}
            <Text style={choiceDescriptionStyle}>{presentationChoice.homeownerExplanation}</Text>
            {presentationChoice.customerSelections.length > 0 && (
                <View style={customerSelectionListStyle}>
                    <Text style={customerSelectionTitleStyle}>Selected equipment and site details</Text>
                    {presentationChoice.customerSelections.map((selection) => (
                        <Text key={`${presentationChoice.id}-${selection}`} style={customerSelectionTextStyle}>
                            • {selection}
                        </Text>
                    ))}
                </View>
            )}
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

function readEstimateErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) return error.message.trim();

    if (error && typeof error === 'object' && 'message' in error) {
        const message = String(error.message || '').trim();

        if (message) return message;
    }

    return fallback;
}

const guidedScreenStyle = {
    flex: 1,
    backgroundColor: '#F3F7FA',
};

const guidedContentStyle = {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 150,
    alignItems: 'center' as const,
};

const guidedShellStyle = {
    width: '100%' as const,
    maxWidth: 820,
    gap: 16,
};

const guidedTopBarStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
};

const guidedTopActionsStyle = {
    flex: 1,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end' as const,
    gap: 8,
};

const guidedBackButtonStyle = {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#0B6F82',
};

const guidedBackButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800' as const,
};

const guidedTextButtonStyle = {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#E8F1F5',
};

const guidedTextButtonTextStyle = {
    color: '#0A5364',
    fontSize: 13,
    fontWeight: '800' as const,
};

const guidedHeroStyle = {
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#08263F',
};

const guidedEyebrowStyle = {
    color: '#70DBE8',
    fontSize: 12,
    fontWeight: '900' as const,
    letterSpacing: 1.2,
};

const guidedQuoteIdentityRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    justifyContent: 'space-between' as const,
    marginTop: 12,
};

const guidedQuoteNumberStyle = {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900' as const,
    letterSpacing: 0.5,
};

const guidedSaveStatusStyle = {
    color: '#B9F6D5',
    fontSize: 12,
    fontWeight: '800' as const,
};

const guidedSaveErrorStyle = {
    ...guidedSaveStatusStyle,
    color: '#FFD0D0',
};

const guidedTitleStyle = {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900' as const,
    marginTop: 6,
};

const guidedSubtitleStyle = {
    color: '#C8D8E3',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
};

const guidedProgressStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
    paddingHorizontal: 4,
};

const guidedProgressItemStyle = {
    flexGrow: 1,
    flexBasis: 76,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minWidth: 76,
};

const guidedProgressDotStyle = {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#B7C7D2',
};

const guidedProgressDotActiveStyle = {
    ...guidedProgressDotStyle,
    backgroundColor: '#0B8DA5',
};

const guidedProgressTextStyle = {
    color: '#526675',
    fontSize: 12,
    fontWeight: '800' as const,
};

const guidedMessageStyle = {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B8DCE4',
    backgroundColor: '#EBF8FA',
};

const guidedMessageTextStyle = {
    color: '#164C59',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700' as const,
};

const guidedSectionStyle = {
    width: '100%' as const,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D9E3EA',
    backgroundColor: '#FFFFFF',
    gap: 14,
};

const guidedSectionHeadingRowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
};

const guidedStepStyle = {
    color: '#0B8196',
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 1.1,
};

const guidedSectionTitleStyle = {
    color: '#09243C',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900' as const,
};

const guidedSectionDescriptionStyle = {
    color: '#607180',
    fontSize: 15,
    lineHeight: 22,
};

const guidedSelectedItemStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B9E3E9',
    backgroundColor: '#EFFAFC',
};

const guidedSelectedItemIconStyle = {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#0C8A70',
};

const guidedSelectedItemIconTextStyle = {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900' as const,
};

const guidedSelectedItemTitleStyle = {
    color: '#0A2B43',
    fontSize: 17,
    fontWeight: '900' as const,
};

const guidedSelectedItemMetaStyle = {
    color: '#617482',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
};

const guidedSelectedItemBadgeStyle = {
    flexShrink: 1,
    color: '#0B6F82',
    fontSize: 11,
    fontWeight: '900' as const,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#D9F2F6',
};

const guidedPickerStyle = {
    gap: 12,
};

const guidedPromptStyle = {
    color: '#18344B',
    fontSize: 16,
    fontWeight: '900' as const,
    marginTop: 4,
};

const guidedTwoColumnStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const guidedChoiceCardStyle = {
    flexGrow: 1,
    flexBasis: 260,
    minWidth: 0,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#D8E1E7',
    backgroundColor: '#FFFFFF',
};

const guidedChoiceCardSelectedStyle = {
    ...guidedChoiceCardStyle,
    borderColor: '#0B8DA5',
    backgroundColor: '#EAF8FA',
};

const guidedChoiceTitleStyle = {
    color: '#09243C',
    fontSize: 18,
    fontWeight: '900' as const,
};

const guidedChoiceDescriptionStyle = {
    color: '#607180',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
};

const guidedCategoryGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 9,
};

const guidedCategoryChipStyle = {
    maxWidth: '100%' as const,
    minHeight: 44,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CCD8E0',
    justifyContent: 'center' as const,
    backgroundColor: '#F7F9FB',
};

const guidedCategoryChipSelectedStyle = {
    ...guidedCategoryChipStyle,
    borderColor: '#0B8DA5',
    backgroundColor: '#DFF5F8',
};

const guidedCategoryChipTextStyle = {
    color: '#314A5D',
    fontSize: 13,
    fontWeight: '800' as const,
};

const guidedCategoryChipSelectedTextStyle = {
    ...guidedCategoryChipTextStyle,
    color: '#086A7D',
};

const guidedServiceSummaryStyle = {
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F2F6F9',
};

const guidedServiceSummaryLabelStyle = {
    color: '#71818E',
    fontSize: 11,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const guidedServiceSummaryTitleStyle = {
    color: '#0A2B43',
    fontSize: 18,
    fontWeight: '900' as const,
    marginTop: 3,
};

const guidedQuestionGridStyle = {
    width: '100%' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const guidedAttentionStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAD089',
    backgroundColor: '#FFF9E8',
};

const guidedAttentionTitleStyle = {
    color: '#7A4B06',
    fontSize: 15,
    fontWeight: '900' as const,
};

const guidedAttentionTextStyle = {
    color: '#805B21',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
};

const guidedAttentionButtonStyle = {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#F4D982',
};

const guidedAttentionButtonTextStyle = {
    color: '#63400B',
    fontSize: 12,
    fontWeight: '900' as const,
};

const guidedReadyStyle = {
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#EAF8F2',
};

const guidedReadyTextStyle = {
    color: '#0B6F58',
    fontSize: 14,
    fontWeight: '800' as const,
};

const guidedDocumentationStyle = {
    gap: 12,
    paddingTop: 4,
};

const guidedDocumentationTitleStyle = {
    color: '#0A2B43',
    fontSize: 18,
    fontWeight: '900' as const,
};

const guidedPricingMissingStyle = {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFF6E1',
};

const guidedPricingMissingTitleStyle = {
    color: '#6E4608',
    fontSize: 18,
    fontWeight: '900' as const,
};

const guidedPriceCardStyle = {
    overflow: 'hidden' as const,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C9D9E3',
    backgroundColor: '#FAFCFD',
};

const guidedPriceHeaderStyle = {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
    padding: 16,
    backgroundColor: '#EAF6F8',
};

const guidedPriceLabelStyle = {
    color: '#0B8196',
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 0.8,
};

const guidedPriceTitleStyle = {
    color: '#09243C',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900' as const,
    marginTop: 3,
};

const guidedPriceTotalStyle = {
    color: '#08735B',
    fontSize: 22,
    fontWeight: '900' as const,
};

const guidedLineItemStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E3E9EE',
    backgroundColor: '#FFFFFF',
};

const guidedLineItemSelectedStyle = {
    backgroundColor: '#E7F7F9',
    borderTopColor: '#8DD4DE',
};

const guidedLinePickerHelpStyle = {
    color: '#617684',
    fontSize: 12,
    fontWeight: '700' as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#D8E6EA',
    backgroundColor: '#F7FAFB',
};

const guidedLineSelectionDotStyle = {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#A7B8C3',
    backgroundColor: '#FFFFFF',
};

const guidedLineSelectionDotSelectedStyle = {
    ...guidedLineSelectionDotStyle,
    borderWidth: 6,
    borderColor: '#0B8DA5',
};

const guidedLineItemContentStyle = {
    flex: 1,
    minWidth: 0,
};

const guidedLineItemNameStyle = {
    color: '#20394D',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700' as const,
};

const guidedLineItemStatusStyle = {
    color: '#587080',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700' as const,
    marginTop: 3,
};

const guidedLineItemPriceColumnStyle = {
    alignItems: 'flex-end' as const,
    minWidth: 76,
};

const guidedLineItemBasePriceStyle = {
    color: '#7A8993',
    fontSize: 11,
    textDecorationLine: 'line-through' as const,
};

const guidedLineItemPriceStyle = {
    color: '#0A664F',
    fontSize: 14,
    fontWeight: '900' as const,
};

const guidedAdjustmentStyle = {
    gap: 10,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D8E1E7',
    backgroundColor: '#F8FAFB',
};

const guidedSelectedLineNameStyle = {
    color: '#08758A',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900' as const,
};

const guidedFieldLabelStyle = {
    color: '#17344B',
    fontSize: 15,
    fontWeight: '900' as const,
};

const guidedFieldHelpStyle = {
    color: '#6A7B88',
    fontSize: 12,
    lineHeight: 18,
};

const guidedProductPickerStyle = {
    backgroundColor: '#F4FAFB',
    borderColor: '#C8DDE3',
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 14,
};

const guidedProductChoiceGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const guidedProductChoiceStyle = {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD7DF',
    borderRadius: 14,
    borderWidth: 1,
    flexGrow: 1,
    gap: 5,
    minWidth: 210,
    padding: 12,
};

const guidedProductChoiceSelectedStyle = {
    ...guidedProductChoiceStyle,
    backgroundColor: '#DDF4F7',
    borderColor: '#0B8DA5',
    borderWidth: 2,
};

const guidedProductChoiceTitleStyle = {
    color: '#17344B',
    fontSize: 14,
    fontWeight: '900' as const,
};

const guidedProductChoiceTitleSelectedStyle = {
    ...guidedProductChoiceTitleStyle,
    color: '#08758A',
};

const guidedProductChoiceMetaStyle = {
    color: '#6A7B88',
    fontSize: 12,
    lineHeight: 17,
};

const guidedProductChoicePriceStyle = {
    color: '#0A664F',
    fontSize: 18,
    fontWeight: '900' as const,
};

const guidedModeRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
};

const guidedModeChipStyle = {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD7DF',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#FFFFFF',
};

const guidedModeChipSelectedStyle = {
    ...guidedModeChipStyle,
    borderColor: '#0B8DA5',
    backgroundColor: '#DDF4F7',
};

const guidedModeChipTextStyle = {
    color: '#445A6A',
    fontSize: 12,
    fontWeight: '800' as const,
};

const guidedModeChipSelectedTextStyle = {
    ...guidedModeChipTextStyle,
    color: '#076B7D',
};

const guidedAdjustmentInputRowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
};

const guidedAdjustmentInputStyle = {
    flex: 1,
    flexGrow: 1,
    minHeight: 46,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C8D5DE',
    color: '#102D43',
    fontSize: 15,
    backgroundColor: '#FFFFFF',
};

const guidedAdjustmentUnitStyle = {
    color: '#546B7B',
    fontSize: 13,
    fontWeight: '800' as const,
};

const guidedAdjustmentSummaryStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#EAF0F4',
};

const guidedAdjustmentSummaryTextStyle = {
    color: '#536A79',
    fontSize: 12,
    fontWeight: '700' as const,
};

const guidedAdjustmentFinalStyle = {
    color: '#0A664F',
    fontSize: 13,
    fontWeight: '900' as const,
};

const guidedOptionTotalSummaryStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#D8E1E7',
};

const guidedOptionTotalLabelStyle = {
    color: '#17344B',
    fontSize: 13,
    fontWeight: '900' as const,
};

const guidedOptionTotalChangeStyle = {
    color: '#617684',
    fontSize: 12,
    fontWeight: '700' as const,
};

const guidedOptionTotalPriceStyle = {
    color: '#08735B',
    fontSize: 17,
    fontWeight: '900' as const,
};

const guidedNotesInputStyle = {
    minHeight: 100,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C8D5DE',
    color: '#102D43',
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top' as const,
    backgroundColor: '#FFFFFF',
};

const guidedSummaryHeaderStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
};

const guidedSummaryInputStyle = {
    minHeight: 130,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#AFCAD5',
    color: '#102D43',
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top' as const,
    backgroundColor: '#F9FCFD',
};

const guidedAiButtonStyle = {
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 13,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#6554C0',
};

const guidedMutedButtonStyle = {
    ...guidedAiButtonStyle,
    backgroundColor: '#AEB5C5',
};

const guidedAiButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900' as const,
};

const guidedPrimaryButtonStyle = {
    width: '100%' as const,
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#087F94',
};

const guidedMutedPrimaryButtonStyle = {
    ...guidedPrimaryButtonStyle,
    backgroundColor: '#AEBCC5',
};

const guidedPrimaryButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900' as const,
};

const guidedSecondaryButtonStyle = {
    width: '100%' as const,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#9CB8C4',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#FFFFFF',
};

const guidedSecondaryButtonTextStyle = {
    color: '#0B6173',
    fontSize: 14,
    fontWeight: '900' as const,
};

const guidedDecisionStyle = {
    width: '100%' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 26,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#B8E0D2',
    backgroundColor: '#F0FBF7',
};

const guidedDecisionCheckStyle = {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#0A8A6B',
};

const guidedDecisionCheckTextStyle = {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900' as const,
};

const guidedDecisionTitleStyle = {
    color: '#092F27',
    fontSize: 25,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
};

const guidedDecisionTextStyle = {
    color: '#41685D',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center' as const,
};

const guidedRecommendationGridStyle = {
    gap: 12,
};

const guidedRecommendationCardStyle = {
    width: '100%' as const,
    padding: 16,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#C8D9E2',
    backgroundColor: '#F9FCFD',
};

const guidedRelationshipStyle = {
    color: '#0B8196',
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1,
};

const guidedRecommendationTitleStyle = {
    color: '#0A2B43',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900' as const,
    marginTop: 5,
};

const guidedRecommendationReasonStyle = {
    color: '#607180',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
};

const guidedRecommendationButtonStyle = {
    alignSelf: 'flex-start' as const,
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 13,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#087F94',
    marginTop: 12,
};

const guidedRecommendationButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900' as const,
};

const guidedNoRecommendationStyle = {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#F2F6F8',
};

const guidedNoRecommendationTitleStyle = {
    color: '#294457',
    fontSize: 16,
    fontWeight: '900' as const,
    marginBottom: 4,
};

const guidedSearchStyle = {
    gap: 10,
    paddingTop: 4,
};

const guidedSearchInputStyle = {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFCFD8',
    color: '#102D43',
    fontSize: 15,
    backgroundColor: '#FFFFFF',
};

const guidedSearchResultStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7E1E7',
    backgroundColor: '#FAFCFD',
};

const guidedSearchResultTitleStyle = {
    color: '#18344B',
    fontSize: 14,
    fontWeight: '900' as const,
};

const guidedSearchResultMetaStyle = {
    color: '#667987',
    fontSize: 12,
    marginTop: 3,
};

const guidedSearchAddStyle = {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#DDF4F7',
};

const guidedSearchAddTextStyle = {
    color: '#076B7D',
    fontSize: 12,
    fontWeight: '900' as const,
};

const guidedReviewListStyle = {
    gap: 12,
};

const guidedReviewCardStyle = {
    overflow: 'hidden' as const,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CAD8E1',
    backgroundColor: '#FAFCFD',
};

const guidedReviewHeaderStyle = {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
    padding: 16,
    backgroundColor: '#EAF6F8',
};

const guidedReviewTitleStyle = {
    color: '#09243C',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900' as const,
    marginTop: 4,
};

const guidedReviewPriceStyle = {
    color: '#08735B',
    fontSize: 20,
    fontWeight: '900' as const,
};

const guidedReviewSummaryStyle = {
    color: '#526877',
    fontSize: 14,
    lineHeight: 20,
    padding: 16,
};

const guidedReviewEditorStyle = {
    gap: 12,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#CAD8E1',
    backgroundColor: '#F4FAFB',
};

const guidedReviewEditorActionsStyle = {
    gap: 10,
};

const guidedReviewCardActionsStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    padding: 14,
};

const guidedEditButtonStyle = {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8BBCC5',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#EAF8FA',
};

const guidedEditButtonTextStyle = {
    color: '#087083',
    fontSize: 12,
    fontWeight: '900' as const,
};

const guidedRemoveButtonStyle = {
    alignSelf: 'flex-start' as const,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E1B5B5',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#FFF7F7',
};

const guidedRemoveButtonTextStyle = {
    color: '#9B3333',
    fontSize: 12,
    fontWeight: '900' as const,
};

const guidedReviewActionsStyle = {
    gap: 10,
};

const guidedPresentButtonStyle = {
    ...guidedPrimaryButtonStyle,
    backgroundColor: '#0A765C',
};

const guidedFooterStyle = {
    color: '#7A8994',
    fontSize: 11,
    textAlign: 'center' as const,
    paddingVertical: 8,
};

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

function formatAiDraftWarning(error: string) {
    const message = String(error || '').trim();
    const normalized = message.toLowerCase();

    if (
        normalized.includes('no credits remaining') ||
        normalized.includes('insufficient_quota') ||
        normalized.includes('insufficient quota') ||
        normalized.includes('billing')
    ) {
        return 'AI wording is unavailable because the OpenAI API account needs credits. Your verified scope, price, and homeowner presentation can still continue without AI wording.';
    }

    return `AI wording was not used. Your verified scope, price, and homeowner presentation can still continue. ${message || 'Please try AI wording again later.'}`;
}

function pickEstimateRequirementPhoto(capture: boolean) {
    if (typeof document === 'undefined') {
        return Promise.reject(new Error('Photo picker is available in the web app for this release.'));
    }

    return new Promise<File | null>((resolve) => {
        const input = document.createElement('input');

        input.type = 'file';
        input.accept = 'image/*';
        if (capture) input.setAttribute('capture', 'environment');
        input.style.display = 'none';

        input.onchange = () => {
            resolve(input.files?.[0] || null);
            input.remove();
        };
        input.oncancel = () => {
            resolve(null);
            input.remove();
        };

        document.body.appendChild(input);
        input.click();
    });
}

function createLocalPhotoPreview(file: File) {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';

    return URL.createObjectURL(file);
}

function createMeasurementDrafts(answers: EstimateAnswerSet) {
    return Object.entries(answers).reduce<Record<string, string>>((drafts, [key, value]) => {
        if (isMeasurementRequirementAnswer(value)) drafts[key] = String(value.value);

        return drafts;
    }, {});
}

function formatRequirementState(state: 'completed' | 'skipped' | 'missing') {
    if (state === 'completed') return 'Done';
    if (state === 'skipped') return 'Skipped';

    return 'Required';
}

function validateRequirementMeasurement(label: string, rawValue: string) {
    const trimmed = rawValue.trim();

    if (!trimmed) {
        return {
            value: null,
            unit: defaultMeasurementUnit(label),
            error: `${label} is required.`,
        };
    }

    const value = Number(trimmed);

    if (!Number.isFinite(value)) {
        return {
            value: null,
            unit: defaultMeasurementUnit(label),
            error: `${label} must be a valid number.`,
        };
    }

    if (value <= 0) {
        return {
            value: null,
            unit: defaultMeasurementUnit(label),
            error: `${label} must be greater than zero.`,
        };
    }

    return {
        value,
        unit: defaultMeasurementUnit(label),
        error: '',
    };
}

function defaultMeasurementUnit(label: string) {
    const requirementId = estimateRequirementId(label);

    if (requirementId.includes('home-size')) return 'sq ft';
    if (requirementId.includes('water-hardness')) return 'gpg';
    if (requirementId.includes('service-flow')) return 'gpm';
    if (requirementId.includes('tankless-demand')) return 'gpm';
    if (requirementId.includes('tank-size')) return 'gal';

    return 'in';
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
        <View key={label} style={[summaryCardStyle, estimateSummaryTone(label)]}>
            <Text style={summaryLabelStyle}>{label}</Text>
            <Text style={summaryValueStyle} numberOfLines={1}>{value}</Text>
            <Text style={summaryDescriptionStyle}>{description}</Text>
        </View>
    );
}

function estimateSummaryTone(label: string) {
    const normalized = label.toLowerCase();

    if (normalized.includes('draft')) return cardTone('#FFF8DF', '#F2DC92', '#D99214');
    if (normalized.includes('option')) return cardTone('#EEF4FF', '#C8DAFF', '#276BDC');
    if (normalized.includes('package')) return cardTone('#F3EFFF', '#D9CCFF', '#7357C8');
    if (normalized.includes('status')) return cardTone('#ECFBF5', '#BFEEDC', '#0F8A68');

    return cardTone('#FFFFFF', '#E3E8EF', '#637083');
}

function estimateQuestionTone(questionId: string) {
    const normalized = questionId.toLowerCase();

    if (normalized.includes('photo') || normalized.includes('source')) return cardTone('#EAF9FF', '#BCEBFA', '#2C91C9');
    if (normalized.includes('spread') || normalized.includes('measurement') || normalized.includes('size')) return cardTone('#ECFBF5', '#BFEEDC', '#0F8A68');
    if (normalized.includes('condition') || normalized.includes('shutoff')) return cardTone('#FFF8DF', '#F2DC92', '#D99214');
    if (normalized.includes('access') || normalized.includes('unusual')) return cardTone('#F3EFFF', '#D9CCFF', '#7357C8');

    return cardTone('#FFFFFF', '#E3E8EF', '#637083');
}

function estimateFoundationTone(title: string) {
    const normalized = title.toLowerCase();

    if (normalized.includes('finding')) return cardTone('#F3EFFF', '#D9CCFF', '#7357C8');
    if (normalized.includes('recommended')) return cardTone('#FFF8DF', '#F2DC92', '#D99214');
    if (normalized.includes('price')) return cardTone('#EEF4FF', '#C8DAFF', '#276BDC');

    return cardTone('#FFFFFF', '#E3E8EF', '#637083');
}

function cardTone(backgroundColor: string, borderColor: string, accentColor: string) {
    return {
        backgroundColor,
        borderColor,
        borderTopColor: accentColor,
        borderTopWidth: 5,
    };
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

const draftWorkspacePanelStyle = {
    backgroundColor: '#EAF3FF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#9FC0F4',
    marginBottom: 18,
};

const estimateStepLabelStyle = {
    color: '#34465A',
    fontSize: 13,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const workTypeGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 16,
};

const workTypeCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#D8E0EA',
    flexGrow: 1,
    flexBasis: 280,
    maxWidth: 520,
};

const selectedWorkTypeCardStyle = {
    backgroundColor: '#071B33',
    borderColor: '#071B33',
};

const workTypeTitleStyle = {
    color: '#071B33',
    fontSize: 17,
    fontWeight: '900' as const,
    marginBottom: 5,
};

const selectedWorkTypeTitleStyle = {
    ...workTypeTitleStyle,
    color: '#FFFFFF',
};

const workTypeDescriptionStyle = {
    color: '#637083',
    fontSize: 12,
    lineHeight: 17,
};

const selectedWorkTypeDescriptionStyle = {
    ...workTypeDescriptionStyle,
    color: '#DCE8F5',
};

const categoryTabRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 12,
};

const draftWorkspaceHeaderStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 12,
};

const draftWorkspaceCountStyle = {
    backgroundColor: '#276BDC',
    borderRadius: 999,
    minWidth: 34,
    height: 34,
    paddingHorizontal: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const draftWorkspaceCountTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};

const workspaceCardGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const workspaceCardStyle = {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    width: 180,
    minHeight: 108,
    justifyContent: 'space-between' as const,
    overflow: 'hidden' as const,
};

const workspaceCardOpenStyle = {
    borderWidth: 3,
};

const workspaceCardTitleStyle = {
    color: '#071B33',
    fontSize: 16,
    fontWeight: '900' as const,
};

const workspaceCardDescriptionStyle = {
    color: '#526175',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 5,
};

const workspaceCardFooterStyle = {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
    marginTop: 12,
};

const workspaceCardValueStyle = {
    color: '#071B33',
    fontSize: 14,
    fontWeight: '900' as const,
    flex: 1,
};

const workspaceCardActionStyle = {
    color: '#276BDC',
    fontSize: 11,
    fontWeight: '900' as const,
};

const workspaceDetailStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D8E0EA',
    marginBottom: 18,
};

const categoryButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D8E0EA',
    width: 180,
    minHeight: 98,
    overflow: 'hidden' as const,
};

const selectedCategoryButtonStyle = {
    backgroundColor: '#071B33',
    borderColor: '#071B33',
    borderWidth: 2,
};

const categoryButtonTextStyle = {
    color: '#071B33',
    fontSize: 14,
    fontWeight: '900' as const,
    flex: 1,
};

const selectedCategoryButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900' as const,
    flex: 1,
};

const questionGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const questionCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 360,
    minWidth: 280,
    minHeight: 148,
    overflow: 'hidden' as const,
};

const wideQuestionCardStyle = {
    width: '100%' as const,
    flexBasis: '100%' as const,
    minHeight: 180,
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

const scopeAnswerButtonStyle = {
    borderRadius: 12,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 240,
    minHeight: 50,
    paddingVertical: 11,
    paddingHorizontal: 12,
    justifyContent: 'center' as const,
};

const scopeAnswerButtonTextStyle = {
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'center' as const,
};

const customScopeStyle = {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#D8E0EA',
};

const customScopeLabelStyle = {
    color: '#071B33',
    fontSize: 13,
    fontWeight: '900' as const,
};

const customScopeHelpStyle = {
    color: '#637083',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
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

const requirementCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    width: 220,
    minHeight: 214,
    gap: 10,
    overflow: 'hidden' as const,
};

const photoRequirementToneStyle = cardTone('#EAF9FF', '#BCEBFA', '#2C91C9');

const measurementRequirementToneStyle = cardTone('#ECFBF5', '#BFEEDC', '#0F8A68');

const requirementTitleStyle = {
    color: '#071B33',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900' as const,
    flex: 1,
};

const requirementPreviewStyle = {
    width: '100%' as const,
    height: 104,
    borderRadius: 10,
    backgroundColor: '#F3F6FA',
};

const requirementPreviewPlaceholderStyle = {
    width: '100%' as const,
    height: 104,
    borderRadius: 10,
    backgroundColor: '#F3F6FA',
    borderWidth: 1,
    borderColor: '#D8E0EA',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const requirementPreviewPlaceholderTextStyle = {
    color: '#637083',
    fontSize: 12,
    fontWeight: '800' as const,
};

const requirementProgressTextStyle = {
    color: '#0B5CAD',
    fontSize: 12,
    fontWeight: '900' as const,
};

const requirementErrorTextStyle = {
    color: '#9D2B2B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800' as const,
};

const measurementInputRowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
};

const measurementInputStyle = {
    flex: 1,
    backgroundColor: '#F8FAFD',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    color: '#071B33',
    fontSize: 15,
    fontWeight: '900' as const,
    paddingVertical: 9,
    paddingHorizontal: 10,
};

const measurementUnitStyle = {
    color: '#071B33',
    backgroundColor: '#E8F7F0',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: '900' as const,
};

const editorStatusBannerStyle = {
    backgroundColor: '#FFF8DF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F2DC92',
    borderLeftWidth: 5,
    borderLeftColor: '#D99214',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 10,
    alignSelf: 'flex-start' as const,
    maxWidth: 680,
};

const editorStatusTitleStyle = {
    color: '#071B33',
    fontSize: 13,
    fontWeight: '800' as const,
};

const editorStatusTextStyle = {
    color: '#8A4B00',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700' as const,
    marginTop: 2,
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
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F2D18B',
    marginTop: 12,
    marginBottom: 12,
    alignSelf: 'flex-start' as const,
    maxWidth: 680,
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

const presentationDiscountStyle = {
    color: '#7A5700',
    fontSize: 13,
    fontWeight: '900' as const,
    marginTop: 4,
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
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    width: 152,
    minHeight: 104,
    overflow: 'hidden' as const,
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

const optionsWorkspaceScreenStyle = {
    flex: 1,
    backgroundColor: '#E9EEF5',
};

const optionsWorkspaceContentStyle = {
    alignItems: 'center' as const,
    padding: 18,
};

const optionsWorkspaceShellStyle = {
    gap: 14,
    maxWidth: 1200,
    width: '100%' as const,
};

const optionsWorkspaceHeaderStyle = {
    alignItems: 'flex-start' as const,
    backgroundColor: '#071B33',
    borderRadius: 20,
    flexDirection: 'row' as const,
    gap: 16,
    justifyContent: 'space-between' as const,
    padding: 18,
};

const optionsWorkspaceEyebrowStyle = {
    color: '#79D7E5',
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
};

const optionsWorkspaceTitleStyle = {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900' as const,
    marginTop: 3,
};

const optionsWorkspaceSubtitleStyle = {
    color: '#C7D4E2',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
};

const optionsWorkspaceVersionStyle = {
    color: '#8FA4BA',
    fontSize: 10,
    fontWeight: '800' as const,
    marginTop: 8,
};

const optionsWorkspaceCloseStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
};

const optionsWorkspaceCloseTextStyle = {
    color: '#071B33',
    fontSize: 13,
    fontWeight: '900' as const,
};

const optionsCustomerSummaryStyle = {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E0EA',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
};

const optionsCustomerSummaryTitleStyle = {
    color: '#071B33',
    fontSize: 18,
    fontWeight: '900' as const,
};

const optionsCustomerSummaryTextStyle = {
    color: '#526175',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
};

const optionsWorkspaceToolbarStyle = {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E0EA',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    padding: 12,
};

const approvedSetButtonStyle = {
    backgroundColor: '#E8F7F0',
    borderColor: '#8ED1B5',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
};

const approvedSetButtonTextStyle = {
    color: '#14533A',
    fontSize: 12,
    fontWeight: '900' as const,
};

const optionsWorkspaceNoticeStyle = {
    backgroundColor: '#EAF3FF',
    borderColor: '#9FC0F4',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
};

const optionsWorkspaceNoticeTextStyle = {
    color: '#173E72',
    fontSize: 13,
    fontWeight: '800' as const,
    lineHeight: 18,
};

const selectedOptionBannerStyle = {
    alignItems: 'center' as const,
    backgroundColor: '#E8F7F0',
    borderColor: '#8ED1B5',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
    marginBottom: 12,
    padding: 12,
};

const selectedOptionBannerLabelStyle = {
    color: '#1F7A55',
    fontSize: 11,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const selectedOptionBannerTitleStyle = {
    color: '#071B33',
    fontSize: 16,
    fontWeight: '900' as const,
    marginTop: 2,
};

const selectedOptionBannerPriceStyle = {
    color: '#14533A',
    fontSize: 18,
    fontWeight: '900' as const,
};

const optionDetailScreenStyle = {
    flex: 1,
    backgroundColor: '#E9EEF5',
};

const optionDetailContentStyle = {
    alignItems: 'center' as const,
    padding: 18,
};

const optionDetailShellStyle = {
    gap: 12,
    maxWidth: 760,
    width: '100%' as const,
};

const optionDetailHeaderStyle = {
    alignItems: 'flex-start' as const,
    backgroundColor: '#071B33',
    borderRadius: 18,
    flexDirection: 'row' as const,
    gap: 14,
    justifyContent: 'space-between' as const,
    padding: 18,
};

const optionDetailTitleStyle = {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900' as const,
    marginTop: 4,
};

const optionDetailPriceStyle = {
    color: '#79D7E5',
    fontSize: 24,
    fontWeight: '900' as const,
    marginTop: 8,
};

const optionDetailSectionStyle = {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E0EA',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
};

const optionDetailSectionTitleStyle = {
    color: '#071B33',
    fontSize: 17,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const optionDetailBodyStyle = {
    color: '#526175',
    fontSize: 14,
    lineHeight: 21,
};

const customerSelectionListStyle = {
    backgroundColor: '#F4F8FA',
    borderColor: '#D8E1E7',
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
    marginTop: 12,
    padding: 12,
};

const guidedCustomerSelectionListStyle = {
    ...customerSelectionListStyle,
    marginHorizontal: 16,
    marginTop: 0,
};

const customerSelectionTitleStyle = {
    color: '#17344B',
    fontSize: 13,
    fontWeight: '900' as const,
};

const customerSelectionTextStyle = {
    color: '#526175',
    fontSize: 12,
    lineHeight: 18,
};

const optionDetailLineStyle = {
    alignItems: 'center' as const,
    borderBottomColor: '#E3E8EF',
    borderBottomWidth: 1,
    flexDirection: 'row' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
    paddingVertical: 10,
};

const optionDetailLineNameStyle = {
    color: '#071B33',
    fontSize: 14,
    fontWeight: '900' as const,
};

const optionDetailLineMetaStyle = {
    color: '#637083',
    fontSize: 11,
    marginTop: 3,
};

const optionDetailLinePriceStyle = {
    color: '#14533A',
    fontSize: 14,
    fontWeight: '900' as const,
};

const optionDetailSelectStyle = {
    alignItems: 'center' as const,
    backgroundColor: '#071B33',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
};

const choiceGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const choiceCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    flexBasis: 300,
    flexGrow: 1,
    maxWidth: 380,
    minWidth: 260,
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

const priceAdjustmentHelpStyle = {
    color: '#526175',
    fontSize: 13,
    lineHeight: 18,
};

const priceAdjustmentPanelStyle = {
    backgroundColor: '#EEF4FF',
    borderColor: '#C8DAFF',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    padding: 10,
};

const priceAdjustmentHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
};

const priceAdjustmentLabelStyle = {
    color: '#071B33',
    fontSize: 13,
    fontWeight: '900' as const,
};

const priceAdjustmentCurrentStyle = {
    color: '#276BDC',
    fontSize: 11,
    fontWeight: '800' as const,
    marginTop: 2,
};

const customPriceAdjustmentRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 8,
};

const customPriceAdjustmentInputStyle = {
    backgroundColor: '#FFFFFF',
    borderColor: '#AFC7EE',
    borderRadius: 10,
    borderWidth: 1,
    color: '#071B33',
    flex: 1,
    fontSize: 13,
    fontWeight: '900' as const,
    minWidth: 100,
    paddingHorizontal: 10,
    paddingVertical: 9,
};

const adjustmentSignButtonStyle = {
    alignItems: 'center' as const,
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E0EA',
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 38,
    paddingHorizontal: 11,
    paddingVertical: 9,
};

const adjustmentSignSelectedStyle = {
    alignItems: 'center' as const,
    backgroundColor: '#071B33',
    borderRadius: 12,
    minWidth: 38,
    paddingHorizontal: 11,
    paddingVertical: 9,
};

const discountReasonPanelStyle = {
    backgroundColor: '#FFF9E8',
    borderColor: '#E9D292',
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    marginTop: 10,
    padding: 10,
};

const discountReasonLabelStyle = {
    color: '#634600',
    fontSize: 12,
    fontWeight: '900' as const,
};

const discountReasonChipRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
};

const discountReasonChipStyle = {
    backgroundColor: '#FFFFFF',
    borderColor: '#D9C27E',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
};

const discountReasonChipSelectedStyle = {
    ...discountReasonChipStyle,
    backgroundColor: '#7A5700',
    borderColor: '#7A5700',
};

const discountReasonChipTextStyle = {
    color: '#634600',
    fontSize: 11,
    fontWeight: '800' as const,
};

const discountReasonChipSelectedTextStyle = {
    ...discountReasonChipTextStyle,
    color: '#FFFFFF',
};

const discountReasonInputStyle = {
    ...customPriceAdjustmentInputStyle,
    minWidth: 0,
    width: '100%' as const,
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
    backgroundColor: '#FFF8DF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F2DC92',
    alignSelf: 'flex-start' as const,
    width: 220,
    minHeight: 112,
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
    backgroundColor: '#FFF8DF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F2DC92',
    width: 190,
    minHeight: 190,
};

const draftItemActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const foundationGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 18,
};

const foundationCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    width: 184,
    minHeight: 132,
    overflow: 'hidden' as const,
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
