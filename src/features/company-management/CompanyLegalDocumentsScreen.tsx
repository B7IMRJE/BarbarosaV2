import DictationTextInput from '@/components/input/DictationTextInput';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Switch,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import { logCompanyAuditEvent, safeAuditRecord } from '../../lib/companyAuditLogs';
import {
    COMPANY_LEGAL_DOCUMENT_NOTICE,
    COMPANY_LEGAL_DOCUMENT_TYPE_LABELS,
    COMPANY_LEGAL_WORKFLOW_STAGE_LABELS,
    COMPANY_LEGAL_WORKFLOW_STAGES,
    loadCompanyLegalDocuments,
    restoreCompanyLegalDocumentDefault,
    saveCompanyLegalDocument,
    type CompanyLegalDocument,
    type CompanyLegalWorkflowStage,
} from '../../lib/companyLegalDocuments';
import { loadCurrentCompanyPermissionAccess } from '../../lib/companyPermissions';
import { loadCurrentUserPlatformAdmin } from '../../lib/roles';
import { supabase } from '../../lib/supabase';

type DocumentDraft = {
    title: string;
    body: string;
    requiresCustomerSignature: boolean;
    requiresCustomerPrintedName: boolean;
    autoRecordDateTime: boolean;
    workflowStage: CompanyLegalWorkflowStage;
    blocksProgression: boolean;
    isActive: boolean;
    source: 'company_custom' | 'attorney_approved';
};

export default function CompanyLegalDocumentsScreen() {
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const companyId = normalizeRouteParam(id);
    const companyRoute = `/super-admin/company/${encodeURIComponent(companyId)}`;
    const { width } = useWindowDimensions();
    const isPhone = width <= 700;
    const [companyName, setCompanyName] = useState('Company');
    const [documents, setDocuments] = useState<CompanyLegalDocument[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [draft, setDraft] = useState<DocumentDraft | null>(null);
    const [message, setMessage] = useState('Loading legal documents...');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [authorized, setAuthorized] = useState(false);
    const loadEvent = useEffectEvent(load);

    useEffect(() => {
        void loadEvent();
    }, [companyId]);

    async function load() {
        if (!companyId) {
            setMessage('Company id is missing.');
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const [isPlatformAdmin, permission, companyResult] = await Promise.all([
                loadCurrentUserPlatformAdmin(),
                loadCurrentCompanyPermissionAccess('can_manage_company_profile', { companyId }),
                supabase.from('companies').select('name, public_name, dba_name').eq('id', companyId).maybeSingle(),
            ]);

            const canManage = isPlatformAdmin || Boolean(permission.access);
            setAuthorized(canManage);
            if (!canManage) {
                setDocuments([]);
                setMessage('Company administrator access is required to manage contracts and legal documents.');
                return;
            }

            if (companyResult.data) {
                setCompanyName(
                    String(companyResult.data.public_name || companyResult.data.dba_name || companyResult.data.name || 'Company')
                );
            }

            const nextDocuments = await loadCompanyLegalDocuments(companyId);
            setDocuments(nextDocuments);
            setMessage('');

            if (selectedTemplateId) {
                const selected = nextDocuments.find((document) => document.template_id === selectedTemplateId);
                setDraft(selected ? createDraft(selected) : null);
                if (!selected) setSelectedTemplateId(null);
            }
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setLoading(false);
        }
    }

    function selectDocument(document: CompanyLegalDocument) {
        if (selectedTemplateId === document.template_id) {
            setSelectedTemplateId(null);
            setDraft(null);
            return;
        }

        setSelectedTemplateId(document.template_id);
        setDraft(createDraft(document));
        setMessage('');
    }

    function updateDraft(patch: Partial<DocumentDraft>) {
        setDraft((current) => current ? { ...current, ...patch } : current);
    }

    async function save(document: CompanyLegalDocument) {
        if (!draft || saving) return;
        if (!draft.title.trim() || !draft.body.trim()) {
            setMessage('Document title and wording are required.');
            return;
        }

        setSaving(true);
        setMessage('Saving a new immutable document revision...');
        try {
            const saved = await saveCompanyLegalDocument({
                companyId,
                templateId: document.template_id,
                title: draft.title.trim(),
                body: draft.body.trim(),
                requiresCustomerSignature: draft.requiresCustomerSignature,
                requiresCustomerPrintedName: draft.requiresCustomerPrintedName,
                autoRecordDateTime: draft.autoRecordDateTime,
                workflowStage: draft.workflowStage,
                blocksProgression: draft.blocksProgression,
                isActive: draft.isActive,
                source: draft.source,
            });
            if (!saved) throw new Error('The saved document could not be reloaded.');

            await recordCompanyLegalAuditEvent({
                companyId,
                action: 'legal_document_revision_created',
                targetType: 'company_legal_document',
                targetId: document.template_id,
                targetLabel: saved.title,
                beforeData: legalDocumentAuditRecord(document),
                afterData: legalDocumentAuditRecord(saved),
                metadata: safeAuditRecord({ revision_id: saved.revision_id }),
            });

            setDocuments((current) => current.map((item) => (
                item.template_id === saved.template_id ? saved : item
            )));
            setDraft(createDraft(saved));
            setMessage(`Saved revision ${saved.revision_number}. Earlier revisions and signed jobs were not changed.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setSaving(false);
        }
    }

    function confirmRestore(document: CompanyLegalDocument) {
        Alert.alert(
            'Restore TechOS default?',
            'This creates a new revision from the TechOS starter template. It does not alter any signed job or delete prior revisions.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Restore Default', onPress: () => void restoreDefault(document) },
            ]
        );
    }

    async function restoreDefault(document: CompanyLegalDocument) {
        if (saving) return;
        setSaving(true);
        setMessage('Restoring the TechOS default as a new revision...');
        try {
            const restored = await restoreCompanyLegalDocumentDefault(companyId, document.template_id);
            if (!restored) throw new Error('The restored document could not be reloaded.');

            await recordCompanyLegalAuditEvent({
                companyId,
                action: 'legal_document_default_restored',
                targetType: 'company_legal_document',
                targetId: document.template_id,
                targetLabel: restored.title,
                beforeData: legalDocumentAuditRecord(document),
                afterData: legalDocumentAuditRecord(restored),
                metadata: safeAuditRecord({ revision_id: restored.revision_id }),
            });

            setDocuments((current) => current.map((item) => (
                item.template_id === restored.template_id ? restored : item
            )));
            setDraft(createDraft(restored));
            setMessage(`TechOS default restored as revision ${restored.revision_number}.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setSaving(false);
        }
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#071B33' }}
            contentContainerStyle={{ padding: isPhone ? 14 : 22, paddingBottom: 48, alignItems: 'center' }}
            keyboardShouldPersistTaps="handled"
        >
            <View style={{ width: '100%', maxWidth: 1120 }}>
                <AdminNavBar companyId={companyId} backFallback={companyRoute as never} />

                <View style={heroStyle}>
                    <Text style={eyebrowStyle}>Administration</Text>
                    <Text style={titleStyle}>Contracts &amp; Legal Documents</Text>
                    <Text style={subtitleStyle}>
                        {companyName} controls its own wording, workflow placement, signatures, and active document package.
                    </Text>
                    <TouchableOpacity style={dashboardButtonStyle} onPress={() => router.push(companyRoute as never)}>
                        <Text style={dashboardButtonTextStyle}>Company Dashboard</Text>
                    </TouchableOpacity>
                </View>

                <View style={legalNoticeStyle}>
                    <Text style={legalNoticeTitleStyle}>Company legal review required</Text>
                    <Text style={legalNoticeTextStyle}>{COMPANY_LEGAL_DOCUMENT_NOTICE}</Text>
                </View>

                <View style={immutabilityStyle}>
                    <Text style={sectionTitleStyle}>Signed copies never change</Text>
                    <Text style={bodyStyle}>
                        Every presentation saves the exact title, wording, revision, requirements, customer identity, signature,
                        timestamp, job, company, and presenting user. Editing this page later creates a new revision and never
                        rewrites a historical signed copy.
                    </Text>
                </View>

                {!!message && (
                    <View style={messageStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                {loading && (
                    <View style={loadingStyle}>
                        <ActivityIndicator color="#41D9C5" />
                        <Text style={bodyStyle}>Loading company documents...</Text>
                    </View>
                )}

                {!loading && authorized && documents.map((document) => {
                    const selected = selectedTemplateId === document.template_id;
                    return (
                        <View key={document.template_id} style={documentCardStyle}>
                            <TouchableOpacity
                                activeOpacity={0.82}
                                onPress={() => selectDocument(document)}
                                style={documentHeaderStyle}
                            >
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={documentTypeStyle}>
                                        {COMPANY_LEGAL_DOCUMENT_TYPE_LABELS[document.document_type]}
                                    </Text>
                                    <Text style={documentTitleStyle}>{document.title}</Text>
                                    <Text style={documentMetaStyle}>
                                        Revision {document.revision_number} · {document.is_active ? 'Active' : 'Inactive'} ·{' '}
                                        {COMPANY_LEGAL_WORKFLOW_STAGE_LABELS[document.workflow_stage]}
                                    </Text>
                                </View>
                                <View style={[statusPillStyle, document.is_active ? activePillStyle : inactivePillStyle]}>
                                    <Text style={statusPillTextStyle}>{selected ? 'Close' : 'Edit'}</Text>
                                </View>
                            </TouchableOpacity>

                            {selected && draft && (
                                <View style={editorStyle}>
                                    {!!document.protected_notice && (
                                        <View style={protectedStyle}>
                                            <Text style={protectedTitleStyle}>Protected TechOS requirements</Text>
                                            <Text style={protectedTextStyle}>{document.protected_notice}</Text>
                                            <Text style={protectedMetaStyle}>
                                                Locked controls are marked “Protected” below. The company title and wording remain editable.
                                            </Text>
                                        </View>
                                    )}

                                    <Field
                                        label="Document title"
                                        value={draft.title}
                                        onChangeText={(title) => updateDraft({ title })}
                                    />
                                    <Field
                                        label="Company document wording"
                                        value={draft.body}
                                        onChangeText={(body) => updateDraft({ body })}
                                        multiline
                                    />

                                    <Text style={fieldLabelStyle}>Document source</Text>
                                    <View style={chipRowStyle}>
                                        <ChoiceChip
                                            label="Company custom"
                                            selected={draft.source === 'company_custom'}
                                            onPress={() => updateDraft({ source: 'company_custom' })}
                                        />
                                        <ChoiceChip
                                            label="Attorney approved"
                                            selected={draft.source === 'attorney_approved'}
                                            onPress={() => updateDraft({ source: 'attorney_approved' })}
                                        />
                                    </View>

                                    <SettingToggle
                                        label="Document active"
                                        detail="Inactive documents do not appear in new job workflows."
                                        value={draft.isActive}
                                        protectedValue={isProtected(document, 'is_active')}
                                        onValueChange={(isActive) => updateDraft({ isActive })}
                                    />
                                    <SettingToggle
                                        label="Customer signature required"
                                        detail="A drawn signature is saved with the immutable copy."
                                        value={draft.requiresCustomerSignature}
                                        protectedValue={isProtected(document, 'requires_customer_signature')}
                                        onValueChange={(requiresCustomerSignature) => updateDraft({ requiresCustomerSignature })}
                                    />
                                    <SettingToggle
                                        label="Customer printed name required"
                                        detail="The customer name is stored with the signed document."
                                        value={draft.requiresCustomerPrintedName}
                                        protectedValue={isProtected(document, 'requires_customer_printed_name')}
                                        onValueChange={(requiresCustomerPrintedName) => updateDraft({ requiresCustomerPrintedName })}
                                    />
                                    <SettingToggle
                                        label="Show automatic date and time"
                                        detail="TechOS always preserves the signed timestamp; this controls whether it is displayed on the document."
                                        value={draft.autoRecordDateTime}
                                        protectedValue={isProtected(document, 'auto_record_datetime')}
                                        onValueChange={(autoRecordDateTime) => updateDraft({ autoRecordDateTime })}
                                    />
                                    <SettingToggle
                                        label="Block the next job stage"
                                        detail="The server refuses the next workflow transition until this document is completed."
                                        value={draft.blocksProgression}
                                        protectedValue={isProtected(document, 'blocks_progression')}
                                        onValueChange={(blocksProgression) => updateDraft({ blocksProgression })}
                                    />

                                    <Text style={fieldLabelStyle}>
                                        Workflow location {isProtected(document, 'workflow_stage') ? '· Protected' : ''}
                                    </Text>
                                    <View style={chipRowStyle}>
                                        {COMPANY_LEGAL_WORKFLOW_STAGES.map((stage) => (
                                            <ChoiceChip
                                                key={stage}
                                                label={COMPANY_LEGAL_WORKFLOW_STAGE_LABELS[stage]}
                                                selected={draft.workflowStage === stage}
                                                disabled={isProtected(document, 'workflow_stage')}
                                                onPress={() => updateDraft({ workflowStage: stage })}
                                            />
                                        ))}
                                    </View>

                                    <View style={[buttonRowStyle, { flexDirection: isPhone ? 'column' : 'row' }]}>
                                        <TouchableOpacity
                                            disabled={saving}
                                            onPress={() => void save(document)}
                                            style={[primaryButtonStyle, saving && disabledButtonStyle]}
                                        >
                                            <Text style={primaryButtonTextStyle}>
                                                {saving ? 'Saving...' : 'Save New Revision'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            disabled={saving}
                                            onPress={() => confirmRestore(document)}
                                            style={[secondaryButtonStyle, saving && disabledButtonStyle]}
                                        >
                                            <Text style={secondaryButtonTextStyle}>Restore TechOS Default</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    );
                })}
            </View>
        </ScrollView>
    );
}

function Field(props: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    multiline?: boolean;
}) {
    return (
        <View style={{ gap: 7 }}>
            <Text style={fieldLabelStyle}>{props.label}</Text>
            <DictationTextInput
                value={props.value}
                onChangeText={props.onChangeText}
                multiline={props.multiline}
                textAlignVertical={props.multiline ? 'top' : 'center'}
                placeholderTextColor="#7890A4"
                style={[inputStyle, props.multiline && wordingInputStyle]}
            />
        </View>
    );
}

function SettingToggle(props: {
    label: string;
    detail: string;
    value: boolean;
    protectedValue: boolean;
    onValueChange: (value: boolean) => void;
}) {
    return (
        <View style={toggleRowStyle}>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={toggleLabelStyle}>
                    {props.label}{props.protectedValue ? ' · Protected' : ''}
                </Text>
                <Text style={toggleDetailStyle}>{props.detail}</Text>
            </View>
            <Switch
                value={props.value}
                disabled={props.protectedValue}
                onValueChange={props.onValueChange}
                trackColor={{ false: '#52687B', true: '#117E83' }}
                thumbColor={props.value ? '#E8FFF8' : '#D7E0E7'}
            />
        </View>
    );
}

function ChoiceChip(props: {
    label: string;
    selected: boolean;
    disabled?: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            disabled={props.disabled}
            onPress={props.onPress}
            style={[
                chipStyle,
                props.selected && selectedChipStyle,
                props.disabled && disabledChipStyle,
            ]}
        >
            <Text style={[chipTextStyle, props.selected && selectedChipTextStyle]}>{props.label}</Text>
        </TouchableOpacity>
    );
}

function createDraft(document: CompanyLegalDocument): DocumentDraft {
    return {
        title: document.title,
        body: document.body,
        requiresCustomerSignature: document.requires_customer_signature,
        requiresCustomerPrintedName: document.requires_customer_printed_name,
        autoRecordDateTime: document.auto_record_datetime,
        workflowStage: document.workflow_stage,
        blocksProgression: document.blocks_progression,
        isActive: document.is_active,
        source: document.source === 'attorney_approved' ? 'attorney_approved' : 'company_custom',
    };
}

function legalDocumentAuditRecord(document: CompanyLegalDocument) {
    return safeAuditRecord({
        document_type: document.document_type,
        revision_id: document.revision_id,
        revision_number: document.revision_number,
        title: document.title,
        requires_customer_signature: document.requires_customer_signature,
        requires_customer_printed_name: document.requires_customer_printed_name,
        auto_record_datetime: document.auto_record_datetime,
        workflow_stage: document.workflow_stage,
        blocks_progression: document.blocks_progression,
        is_active: document.is_active,
        source: document.source,
    });
}

function isProtected(document: CompanyLegalDocument, field: string) {
    return document.protected_fields.includes(field);
}

function normalizeRouteParam(value?: string | string[]) {
    return String(Array.isArray(value) ? value[0] || '' : value || '').trim();
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to manage company legal documents.';
}

async function recordCompanyLegalAuditEvent(input: Parameters<typeof logCompanyAuditEvent>[0]) {
    try {
        await logCompanyAuditEvent(input);
    } catch {
        // The versioned legal-document save already succeeded; audit availability must not misreport it as failed.
    }
}

const heroStyle = {
    backgroundColor: '#0C2940', borderRadius: 24, borderWidth: 1, borderColor: '#3B6C7D',
    padding: 22, marginTop: 16, marginBottom: 16, gap: 8,
} as const;
const eyebrowStyle = { color: '#45D4C7', fontSize: 13, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' } as const;
const titleStyle = { color: '#F4FAFD', fontSize: 34, lineHeight: 39, fontWeight: '900' } as const;
const subtitleStyle = { color: '#B9CAD6', fontSize: 16, lineHeight: 23, fontWeight: '600', maxWidth: 800 } as const;
const dashboardButtonStyle = { alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#DFF6FB', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11 } as const;
const dashboardButtonTextStyle = { color: '#09243A', fontWeight: '900' } as const;
const legalNoticeStyle = { backgroundColor: '#FFF4D8', borderColor: '#D4A93D', borderWidth: 2, borderRadius: 20, padding: 18, marginBottom: 14, gap: 7 } as const;
const legalNoticeTitleStyle = { color: '#4B3510', fontSize: 18, fontWeight: '900' } as const;
const legalNoticeTextStyle = { color: '#5A451D', fontSize: 15, lineHeight: 22, fontWeight: '700' } as const;
const immutabilityStyle = { backgroundColor: '#0E3B43', borderColor: '#2BB8A9', borderWidth: 1, borderRadius: 20, padding: 18, marginBottom: 14, gap: 7 } as const;
const sectionTitleStyle = { color: '#F4FAFD', fontSize: 19, fontWeight: '900' } as const;
const bodyStyle = { color: '#C6D5DF', fontSize: 15, lineHeight: 22, fontWeight: '600' } as const;
const messageStyle = { backgroundColor: '#17344B', borderRadius: 15, borderWidth: 1, borderColor: '#55778D', padding: 13, marginBottom: 14 } as const;
const messageTextStyle = { color: '#E7F3F8', fontWeight: '800', lineHeight: 20 } as const;
const loadingStyle = { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 12 } as const;
const documentCardStyle = { backgroundColor: '#102B40', borderRadius: 22, borderWidth: 1, borderColor: '#557286', marginBottom: 14, overflow: 'hidden' } as const;
const documentHeaderStyle = { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 } as const;
const documentTypeStyle = { color: '#44D7C7', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 } as const;
const documentTitleStyle = { color: '#F5FAFC', fontSize: 20, lineHeight: 25, fontWeight: '900', marginTop: 4 } as const;
const documentMetaStyle = { color: '#AEBFCC', fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 5 } as const;
const statusPillStyle = { borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, minWidth: 64, alignItems: 'center' } as const;
const activePillStyle = { backgroundColor: '#0C726C' } as const;
const inactivePillStyle = { backgroundColor: '#526475' } as const;
const statusPillTextStyle = { color: '#FFFFFF', fontWeight: '900', fontSize: 13 } as const;
const editorStyle = { borderTopWidth: 1, borderTopColor: '#3B5C70', backgroundColor: '#0B2236', padding: 18, gap: 16 } as const;
const protectedStyle = { backgroundColor: '#372F20', borderWidth: 1, borderColor: '#B39345', borderRadius: 16, padding: 15, gap: 6 } as const;
const protectedTitleStyle = { color: '#FFE49B', fontWeight: '900', fontSize: 16 } as const;
const protectedTextStyle = { color: '#F5E8C6', fontWeight: '700', lineHeight: 20 } as const;
const protectedMetaStyle = { color: '#CFBE91', fontSize: 12, fontWeight: '700', lineHeight: 17 } as const;
const fieldLabelStyle = { color: '#D9E7EE', fontSize: 14, fontWeight: '900' } as const;
const inputStyle = { backgroundColor: '#EAF5F8', color: '#08243A', borderRadius: 14, borderWidth: 2, borderColor: '#5A8998', minHeight: 48, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, fontWeight: '700' } as const;
const wordingInputStyle = { minHeight: 190, lineHeight: 21 } as const;
const chipRowStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 9 } as const;
const chipStyle = { backgroundColor: '#29465B', borderColor: '#607E91', borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 } as const;
const selectedChipStyle = { backgroundColor: '#DDF8F5', borderColor: '#2CC5B5' } as const;
const disabledChipStyle = { opacity: 0.58 } as const;
const chipTextStyle = { color: '#D5E4EB', fontSize: 13, fontWeight: '800' } as const;
const selectedChipTextStyle = { color: '#07373B' } as const;
const toggleRowStyle = { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#17354B', borderRadius: 15, borderWidth: 1, borderColor: '#44667B', padding: 13 } as const;
const toggleLabelStyle = { color: '#F1F8FB', fontSize: 15, fontWeight: '900' } as const;
const toggleDetailStyle = { color: '#AFC2CE', fontSize: 12, lineHeight: 17, fontWeight: '600', marginTop: 3 } as const;
const buttonRowStyle = { gap: 10 } as const;
const primaryButtonStyle = { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#0D8390', paddingHorizontal: 16 } as const;
const primaryButtonTextStyle = { color: '#FFFFFF', fontWeight: '900', fontSize: 15 } as const;
const secondaryButtonStyle = { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#D9EDF2', paddingHorizontal: 16 } as const;
const secondaryButtonTextStyle = { color: '#08283F', fontWeight: '900', fontSize: 15 } as const;
const disabledButtonStyle = { opacity: 0.5 } as const;
