export const HOME_ITEM_CONDITIONS = [
    'Newly Installed',
    'Good',
    'Fair',
    'Needs Attention',
    'Failed',
    'Unknown',
] as const;

export const HOME_ITEM_CLOSEOUT_TYPES = ['installed', 'repaired', 'replaced'] as const;

export const HOME_ITEM_WARRANTY_CHOICES = [
    '1_year',
    '2_years',
    '5_years',
    '10_years',
    'limited_lifetime',
    'lifetime',
    'custom',
    'unknown_verify_later',
] as const;

export type HomeItemCondition = typeof HOME_ITEM_CONDITIONS[number];
export type HomeItemCloseoutType = typeof HOME_ITEM_CLOSEOUT_TYPES[number];
export type HomeItemWarrantyChoice = typeof HOME_ITEM_WARRANTY_CHOICES[number];
export type HomeItemWarrantyType = 'workmanship' | 'labor' | 'manufacturer_parts';

export type HomeItemCloseoutWarranty = {
    warranty_type: HomeItemWarrantyType;
    coverage_kind: HomeItemWarrantyChoice;
    custom_label: string | null;
    start_date: string;
    expiration_date: string | null;
    notes: string | null;
    verification_status: 'technician_entered' | 'verified' | 'unknown' | 'verify_later';
};

export type HomeItemCloseoutDraft = {
    completion_type: HomeItemCloseoutType;
    item_name: string;
    status: 'Installed';
    condition: HomeItemCondition;
    completion_date: string;
    installed_on: string;
    brand: string;
    model: string;
    serial_number: string;
    part_number: string;
    work_performed: string;
    installation_notes: string;
    warranties: HomeItemCloseoutWarranty[];
};

export type HomeItemCloseoutContext = {
    linked: boolean;
    workflow_id: string;
    home_item_id: string | null;
    item: {
        id: string;
        name: string;
        system: string | null;
        category: string | null;
        location: string | null;
        parent_area: string | null;
        status: string | null;
        condition: string | null;
        install_state: string | null;
        installed_on: string | null;
        brand: string | null;
        model: string | null;
        serial_number: string | null;
        part_number: string | null;
        installation_notes: string | null;
    } | null;
    draft: HomeItemCloseoutDraft | null;
    approved_scope: string[];
    attachment_counts: Record<string, number>;
    catalog_product?: {
        id: string;
        product_name: string | null;
        category: string;
        brand: string;
        model: string;
        manufacturer_part_number: string | null;
        workmanship_warranty: string | null;
        labor_warranty: string | null;
        manufacturer_warranty: string | null;
    } | null;
};

export type HomeItemLifetimeHistoryMedia = {
    id: string;
    stage: string;
    bucket: string;
    storage_path: string;
    file_name: string;
    mime_type: string | null;
    caption: string | null;
    created_at: string;
};

export type HomeItemLifetimeWarranty = HomeItemCloseoutWarranty & {
    id: string;
    notes: string | null;
};

export type HomeItemLifetimeHistoryEntry = {
    id: string;
    entry_type: string;
    completion_date: string;
    company_name: string | null;
    technician_name: string | null;
    original_problem: string | null;
    findings: string | null;
    recommended_work: string | null;
    approved_scope: string[];
    work_performed: string | null;
    installation_notes: string | null;
    brand: string | null;
    model: string | null;
    serial_number: string | null;
    part_number: string | null;
    estimate_reference: string | null;
    invoice_reference: string | null;
    completion_homeowner_name: string | null;
    completion_accepted_at: string | null;
    customer_signature_recorded: boolean;
    warranties: HomeItemLifetimeWarranty[];
    media: HomeItemLifetimeHistoryMedia[];
};

export type HomeItemLifetimeHistory = {
    item_id: string;
    entries: HomeItemLifetimeHistoryEntry[];
};

export function todayDateInput(now = new Date()) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function isInactiveHomeItemStatus(status?: string | null, installState?: string | null) {
    const normalized = `${status || ''} ${installState || ''}`.trim().toLowerCase();
    return ['missing', 'not installed', 'unknown', 'inactive', 'missing information']
        .some((candidate) => normalized.includes(candidate));
}

export function defaultHomeItemCloseoutType(context: HomeItemCloseoutContext): HomeItemCloseoutType {
    if (!context.item) return 'installed';
    return isInactiveHomeItemStatus(context.item.status, context.item.install_state) ? 'installed' : 'repaired';
}

export function warrantyChoiceLabel(choice: HomeItemWarrantyChoice) {
    return ({
        '1_year': '1 Year',
        '2_years': '2 Years',
        '5_years': '5 Years',
        '10_years': '10 Years',
        limited_lifetime: 'Limited Lifetime',
        lifetime: 'Lifetime',
        custom: 'Custom',
        unknown_verify_later: 'Unknown / Verify Later',
    } as const)[choice];
}

export function warrantyChoiceFromText(value?: string | null): HomeItemWarrantyChoice {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized.includes('unknown') || normalized.includes('verify')) return 'unknown_verify_later';
    if (normalized.includes('limited lifetime')) return 'limited_lifetime';
    if (normalized.includes('lifetime')) return 'lifetime';
    if (/\b10\s*(year|yr)/.test(normalized)) return '10_years';
    if (/\b5\s*(year|yr)/.test(normalized)) return '5_years';
    if (/\b2\s*(year|yr)/.test(normalized)) return '2_years';
    if (/\b1\s*(year|yr)/.test(normalized)) return '1_year';
    return 'custom';
}

export function warrantyExpirationDate(startDate: string, choice: HomeItemWarrantyChoice, customExpiration?: string | null) {
    if (choice === 'custom') return cleanOptional(customExpiration);
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
    const years = ({ '1_year': 1, '2_years': 2, '5_years': 5, '10_years': 10 } as Partial<Record<HomeItemWarrantyChoice, number>>)[choice];
    if (!years) return null;
    const [year, month, day] = startDate.split('-').map(Number);
    return todayDateInput(new Date(year + years, month - 1, day, 12, 0, 0));
}

export function buildCloseoutWarranty(input: {
    warrantyType: HomeItemWarrantyType;
    choice: HomeItemWarrantyChoice;
    startDate: string;
    customLabel?: string;
    customExpiration?: string;
    notes?: string;
    verified?: boolean;
}): HomeItemCloseoutWarranty {
    return {
        warranty_type: input.warrantyType,
        coverage_kind: input.choice,
        custom_label: input.choice === 'custom' ? cleanOptional(input.customLabel) : null,
        start_date: input.startDate,
        expiration_date: warrantyExpirationDate(input.startDate, input.choice, input.customExpiration),
        notes: cleanOptional(input.notes),
        verification_status: input.choice === 'unknown_verify_later'
            ? 'verify_later'
            : input.verified ? 'verified' : 'technician_entered',
    };
}

export function buildHomeItemCloseoutDraft(input: {
    completionType: HomeItemCloseoutType;
    itemName: string;
    condition: HomeItemCondition;
    completionDate?: string;
    installedOn: string;
    brand?: string;
    model?: string;
    serialNumber?: string;
    partNumber?: string;
    workPerformed: string;
    installationNotes?: string;
    warranties: HomeItemCloseoutWarranty[];
}): HomeItemCloseoutDraft {
    return {
        completion_type: input.completionType,
        item_name: input.itemName.trim(),
        status: 'Installed',
        condition: input.condition,
        completion_date: input.completionDate || todayDateInput(),
        installed_on: input.installedOn,
        brand: input.brand?.trim() || '',
        model: input.model?.trim() || '',
        serial_number: input.serialNumber?.trim() || '',
        part_number: input.partNumber?.trim() || '',
        work_performed: input.workPerformed.trim(),
        installation_notes: input.installationNotes?.trim() || '',
        warranties: input.warranties,
    };
}

function cleanOptional(value?: string | null) {
    const cleaned = String(value || '').trim();
    return cleaned || null;
}
