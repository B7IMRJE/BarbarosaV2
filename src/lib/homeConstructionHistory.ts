import { requireActivePropertyMembership } from './activeProperty';
import type { ProviderHomeItemsReadContext } from './providerHomeItems';
import { supabase } from './supabase';

export const CONSTRUCTION_EVENT_TYPES = [
    { value: 'installation', label: 'Installation' },
    { value: 'replacement', label: 'Replacement' },
    { value: 'upgrade', label: 'Upgrade' },
    { value: 'addition', label: 'Addition' },
    { value: 'inspection', label: 'Inspection' },
    { value: 'significant_repair', label: 'Significant repair' },
] as const;

export const CONSTRUCTION_EVENT_CATEGORIES = [
    { value: 'pool', label: 'Pool' },
    { value: 'solar', label: 'Solar' },
    { value: 'roof', label: 'Roof' },
    { value: 'hvac', label: 'HVAC' },
    { value: 'repipe', label: 'Repipe' },
    { value: 'electrical', label: 'Electrical' },
    { value: 'plumbing', label: 'Plumbing' },
    { value: 'structure', label: 'Structure' },
    { value: 'other', label: 'Other' },
] as const;

export type ConstructionEventType = typeof CONSTRUCTION_EVENT_TYPES[number]['value'];
export type ConstructionEventCategory = typeof CONSTRUCTION_EVENT_CATEGORIES[number]['value'];
export type ConstructionDatePrecision = 'exact' | 'month' | 'year';

export type ConstructionHistoryFile = {
    id: string;
    fileUrl: string;
    fileName: string | null;
    fileType: string;
    category: string | null;
    createdAt: string | null;
};

export type ConstructionHistoryEvent = {
    id: string;
    propertyId: string;
    eventType: ConstructionEventType;
    category: ConstructionEventCategory;
    title: string;
    eventDate: string;
    datePrecision: ConstructionDatePrecision;
    description: string | null;
    homeItemId: string | null;
    homeItemSlug: string | null;
    homeItemName: string | null;
    system: string | null;
    installerName: string | null;
    serviceCompany: string | null;
    serviceContact: string | null;
    warrantyDetails: string | null;
    relatedJobId: string | null;
    relatedJobTitle: string | null;
    relatedJobStatus: string | null;
    source: 'homeowner_provided' | 'company_documented';
    createdAt: string | null;
    updatedAt: string | null;
    files: ConstructionHistoryFile[];
};

export type ConstructionReferenceItem = {
    id: string;
    itemSlug: string;
    name: string;
    system: string;
};

export type ConstructionReferenceJob = {
    id: string;
    title: string;
    status: string;
    completedAt: string | null;
};

export type ConstructionEventDraft = {
    eventType: ConstructionEventType;
    category: ConstructionEventCategory;
    title: string;
    eventDate: string;
    datePrecision: ConstructionDatePrecision;
    description: string;
    homeItemId: string;
    system: string;
    installerName: string;
    serviceCompany: string;
    serviceContact: string;
    warrantyDetails: string;
    relatedJobId: string;
};

export async function loadConstructionHistory(context?: ProviderHomeItemsReadContext | null) {
    if (context) {
        const { data, error } = await supabase.rpc('get_company_construction_events', companyHistoryArgs(context));
        if (error) throw new Error(`Could not load shared construction history: ${error.message}`);
        return (data || []).map(normalizeConstructionEvent);
    }

    const activeProperty = await requireActivePropertyMembership();
    const { data, error } = await supabase
        .from('property_construction_events')
        .select('*')
        .eq('property_id', activeProperty.propertyId)
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) throw new Error(`Could not load construction history: ${error.message}`);

    const events = (data || []).map(normalizeConstructionEvent);
    return hydrateConstructionEvents(events, activeProperty.propertyId);
}

export async function loadConstructionHistoryEvent(eventId: string, context?: ProviderHomeItemsReadContext | null) {
    if (context) {
        const { data, error } = await supabase.rpc('get_company_construction_events', {
            ...companyHistoryArgs(context),
            p_event_id: eventId,
        });
        if (error) throw new Error(`Could not load shared construction event: ${error.message}`);

        const row = Array.isArray(data) ? data[0] : data;
        return row ? normalizeConstructionEvent(row) : null;
    }

    const activeProperty = await requireActivePropertyMembership();
    const { data, error } = await supabase
        .from('property_construction_events')
        .select('*')
        .eq('id', eventId)
        .eq('property_id', activeProperty.propertyId)
        .maybeSingle();

    if (error) throw new Error(`Could not load construction event: ${error.message}`);
    if (!data) return null;

    return (await hydrateConstructionEvents([normalizeConstructionEvent(data)], activeProperty.propertyId))[0] || null;
}

export async function createConstructionHistoryEvent(draft: ConstructionEventDraft) {
    const activeProperty = await requireActivePropertyMembership();
    const validationError = validateConstructionEventDraft(draft);
    if (validationError) throw new Error(validationError);

    const { data, error } = await supabase
        .from('property_construction_events')
        .insert({
            property_id: activeProperty.propertyId,
            created_by: activeProperty.userId,
            event_type: draft.eventType,
            category: draft.category,
            title: draft.title.trim(),
            event_date: normalizeConstructionEventDate(draft.eventDate, draft.datePrecision),
            date_precision: draft.datePrecision,
            description: nullableText(draft.description),
            home_item_id: nullableText(draft.homeItemId),
            system: nullableText(draft.system),
            installer_name: nullableText(draft.installerName),
            service_company: nullableText(draft.serviceCompany),
            service_contact: nullableText(draft.serviceContact),
            warranty_details: nullableText(draft.warrantyDetails),
            related_job_id: nullableText(draft.relatedJobId),
            source: 'homeowner_provided',
        })
        .select('id')
        .single();

    if (error) throw new Error(`Could not save construction event: ${error.message}`);

    return String(data.id);
}

export async function loadConstructionReferenceOptions() {
    const activeProperty = await requireActivePropertyMembership();
    const [itemsResult, jobsResult] = await Promise.all([
        supabase
            .from('home_items')
            .select('id, item_slug, name, system')
            .eq('property_id', activeProperty.propertyId)
            .or('archived.eq.false,archived.is.null')
            .order('system')
            .order('name'),
        supabase
            .from('jobs')
            .select('id, title, status, completed_at')
            .eq('property_id', activeProperty.propertyId)
            .order('updated_at', { ascending: false })
            .limit(50),
    ]);

    if (itemsResult.error) throw new Error(`Could not load home items: ${itemsResult.error.message}`);
    if (jobsResult.error) throw new Error(`Could not load job history: ${jobsResult.error.message}`);

    return {
        items: (itemsResult.data || []).map((row) => ({
            id: text(row.id),
            itemSlug: text(row.item_slug),
            name: text(row.name) || 'Home item',
            system: text(row.system),
        })),
        jobs: (jobsResult.data || []).map((row) => ({
            id: text(row.id),
            title: text(row.title) || 'Job',
            status: text(row.status),
            completedAt: nullableText(row.completed_at),
        })),
    };
}

export async function loadConstructionEventFileCandidates(event: ConstructionHistoryEvent) {
    if (!event.homeItemId) return [];

    const activeProperty = await requireActivePropertyMembership();
    const { data, error } = await supabase
        .from('home_item_files')
        .select('id, file_url, file_name, file_type, category, created_at')
        .eq('property_id', activeProperty.propertyId)
        .eq('home_item_id', event.homeItemId)
        .order('created_at', { ascending: false });

    if (error) throw new Error(`Could not load item files: ${error.message}`);

    return (data || []).map(normalizeConstructionFile);
}

export async function setConstructionEventFileLinked(event: ConstructionHistoryEvent, fileId: string, linked: boolean) {
    const activeProperty = await requireActivePropertyMembership();

    if (linked) {
        const { error } = await supabase.from('property_construction_event_files').insert({
            event_id: event.id,
            home_item_file_id: fileId,
            property_id: activeProperty.propertyId,
            created_by: activeProperty.userId,
        });
        if (error) throw new Error(`Could not link the file: ${error.message}`);
        return;
    }

    const { error } = await supabase
        .from('property_construction_event_files')
        .delete()
        .eq('event_id', event.id)
        .eq('home_item_file_id', fileId)
        .eq('property_id', activeProperty.propertyId);

    if (error) throw new Error(`Could not unlink the file: ${error.message}`);
}

export function validateConstructionEventDraft(draft: ConstructionEventDraft) {
    if (!CONSTRUCTION_EVENT_TYPES.some((option) => option.value === draft.eventType)) return 'Choose a durable event type.';
    if (!CONSTRUCTION_EVENT_CATEGORIES.some((option) => option.value === draft.category)) return 'Choose a construction category.';
    if (!draft.title.trim()) return 'Add a short event title.';
    if (draft.title.trim().length > 160) return 'Keep the event title under 160 characters.';
    const normalizedDate = normalizeConstructionEventDate(draft.eventDate, draft.datePrecision);
    if (!normalizedDate) return draft.datePrecision === 'year'
        ? 'Enter a four-digit event year.'
        : draft.datePrecision === 'month'
            ? 'Enter the event month as YYYY-MM.'
            : 'Enter the event date as YYYY-MM-DD.';

    const date = new Date(`${normalizedDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return 'Enter a valid event date.';
    if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return 'Construction history cannot include future work.';
    if (draft.description.length > 8_000) return 'Keep the description under 8,000 characters.';
    if (draft.warrantyDetails.length > 4_000) return 'Keep warranty details under 4,000 characters.';

    return '';
}

export function normalizeConstructionEventDate(value: string, precision: ConstructionDatePrecision) {
    const cleanValue = String(value || '').trim();
    const candidate = precision === 'year' && /^\d{4}$/.test(cleanValue)
        ? `${cleanValue}-01-01`
        : precision === 'month' && /^\d{4}-\d{2}$/.test(cleanValue)
            ? `${cleanValue}-01`
            : precision === 'exact' && /^\d{4}-\d{2}-\d{2}$/.test(cleanValue)
                ? cleanValue
                : '';

    if (!candidate) return '';

    const date = new Date(`${candidate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    if (date.toISOString().slice(0, 10) !== candidate) return '';

    return candidate;
}

export function constructionEventTypeLabel(value: string) {
    return CONSTRUCTION_EVENT_TYPES.find((option) => option.value === value)?.label || 'Construction event';
}

export function constructionCategoryLabel(value: string) {
    return CONSTRUCTION_EVENT_CATEGORIES.find((option) => option.value === value)?.label || 'Other';
}

export function formatConstructionEventDate(value: string, precision: ConstructionDatePrecision) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    if (precision === 'year') return String(date.getFullYear());
    if (precision === 'month') return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    return date.toLocaleDateString();
}

async function hydrateConstructionEvents(events: ConstructionHistoryEvent[], propertyId: string) {
    const itemIds = unique(events.map((event) => event.homeItemId));
    const jobIds = unique(events.map((event) => event.relatedJobId));
    const eventIds = events.map((event) => event.id);
    const [itemsResult, jobsResult, linksResult] = await Promise.all([
        itemIds.length
            ? supabase.from('home_items').select('id, item_slug, name, system').eq('property_id', propertyId).in('id', itemIds)
            : Promise.resolve({ data: [], error: null }),
        jobIds.length
            ? supabase.from('jobs').select('id, title, status').eq('property_id', propertyId).in('id', jobIds)
            : Promise.resolve({ data: [], error: null }),
        eventIds.length
            ? supabase.from('property_construction_event_files').select('event_id, home_item_file_id').eq('property_id', propertyId).in('event_id', eventIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    if (itemsResult.error || jobsResult.error || linksResult.error) {
        throw new Error('Construction history links could not be loaded.');
    }

    const links = (linksResult.data || []) as { event_id: string; home_item_file_id: string }[];
    const fileIds = unique(links.map((link) => link.home_item_file_id));
    const filesResult = fileIds.length
        ? await supabase.from('home_item_files').select('id, file_url, file_name, file_type, category, created_at').eq('property_id', propertyId).in('id', fileIds)
        : { data: [], error: null };

    if (filesResult.error) throw new Error('Construction history files could not be loaded.');

    const items = new Map((itemsResult.data || []).map((row) => [text(row.id), row]));
    const jobs = new Map((jobsResult.data || []).map((row) => [text(row.id), row]));
    const files = new Map((filesResult.data || []).map((row) => [text(row.id), normalizeConstructionFile(row)]));

    return events.map((event) => {
        const item = event.homeItemId ? items.get(event.homeItemId) : null;
        const job = event.relatedJobId ? jobs.get(event.relatedJobId) : null;

        return {
            ...event,
            homeItemSlug: text(item?.item_slug) || event.homeItemSlug,
            homeItemName: text(item?.name) || event.homeItemName,
            system: event.system || text(item?.system) || null,
            relatedJobTitle: text(job?.title) || event.relatedJobTitle,
            relatedJobStatus: text(job?.status) || event.relatedJobStatus,
            files: links
                .filter((link) => link.event_id === event.id)
                .map((link) => files.get(link.home_item_file_id))
                .filter((file): file is ConstructionHistoryFile => Boolean(file)),
        };
    });
}

function normalizeConstructionEvent(value: unknown): ConstructionHistoryEvent {
    const row = record(value);

    return {
        id: text(row.id),
        propertyId: text(row.property_id),
        eventType: readEventType(row.event_type),
        category: readCategory(row.category),
        title: text(row.title),
        eventDate: text(row.event_date),
        datePrecision: readDatePrecision(row.date_precision),
        description: nullableText(row.description),
        homeItemId: nullableText(row.home_item_id),
        homeItemSlug: nullableText(row.home_item_slug),
        homeItemName: nullableText(row.home_item_name),
        system: nullableText(row.system),
        installerName: nullableText(row.installer_name),
        serviceCompany: nullableText(row.service_company),
        serviceContact: nullableText(row.service_contact),
        warrantyDetails: nullableText(row.warranty_details),
        relatedJobId: nullableText(row.related_job_id),
        relatedJobTitle: nullableText(row.related_job_title),
        relatedJobStatus: nullableText(row.related_job_status),
        source: row.source === 'company_documented' ? 'company_documented' : 'homeowner_provided',
        createdAt: nullableText(row.created_at),
        updatedAt: nullableText(row.updated_at),
        files: Array.isArray(row.linked_files) ? row.linked_files.map(normalizeConstructionFile) : [],
    };
}

function normalizeConstructionFile(value: unknown): ConstructionHistoryFile {
    const row = record(value);

    return {
        id: text(row.id),
        fileUrl: text(row.file_url),
        fileName: nullableText(row.file_name),
        fileType: text(row.file_type),
        category: nullableText(row.category),
        createdAt: nullableText(row.created_at),
    };
}

function companyHistoryArgs(context: ProviderHomeItemsReadContext) {
    return {
        p_company_id: context.companyId,
        p_property_id: context.propertyId,
        p_service_request_id: context.serviceRequestId || null,
        p_schedule_slot_id: context.scheduleSlotId || null,
        p_job_id: context.jobId || null,
        p_event_id: null,
    };
}

function readEventType(value: unknown): ConstructionEventType {
    const textValue = text(value);
    return CONSTRUCTION_EVENT_TYPES.some((option) => option.value === textValue)
        ? textValue as ConstructionEventType
        : 'significant_repair';
}

function readCategory(value: unknown): ConstructionEventCategory {
    const textValue = text(value);
    return CONSTRUCTION_EVENT_CATEGORIES.some((option) => option.value === textValue)
        ? textValue as ConstructionEventCategory
        : 'other';
}

function readDatePrecision(value: unknown): ConstructionDatePrecision {
    return value === 'month' || value === 'year' ? value : 'exact';
}

function unique(values: (string | null)[]) {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
    return typeof value === 'string' ? value.trim() : String(value || '').trim();
}

function nullableText(value: unknown) {
    return text(value) || null;
}
