export type RecurrenceUnit = 'days' | 'weeks' | 'months' | 'years';

export type MaintenanceTask = {
    id: string;
    title: string;
    description: string | null;
    recurrence_interval: number;
    recurrence_unit: RecurrenceUnit;
    start_date: string | null;
    last_completed_date: string | null;
    next_due_date: string;
    reminder_status: 'active' | 'paused' | 'archived';
    task_key: string | null;
    notes: string | null;
    created_at: string;
};

export type MaintenanceCompletion = {
    id: string;
    maintenance_task_id: string;
    user_id: string;
    property_id: string;
    home_item_id: string;
    completed_on: string;
    notes: string | null;
    photo_urls: string[];
    document_urls: string[];
    created_by: string | null;
    created_at: string;
};

export type MaintenancePreset = {
    key: string;
    title: string;
    description: string;
    recurrenceInterval: number;
    recurrenceUnit: RecurrenceUnit;
};

export type DueStatusLabel = 'Overdue' | 'Due Soon' | 'Upcoming' | 'Paused';

const dayMs = 24 * 60 * 60 * 1000;

const genericPreset: MaintenancePreset = {
    key: 'general_inspection',
    title: 'General inspection',
    description: 'Check the item condition and note any changes.',
    recurrenceInterval: 1,
    recurrenceUnit: 'years',
};

function preset(
    key: string,
    title: string,
    recurrenceInterval: number,
    recurrenceUnit: RecurrenceUnit,
    description: string
): MaintenancePreset {
    return { key, title, recurrenceInterval, recurrenceUnit, description };
}

export function getMaintenancePresets(item: {
    name?: string | null;
    system?: string | null;
    category?: string | null;
}) {
    const name = normalize(item.name);
    const system = normalize(item.system);
    const category = normalize(item.category);
    const presets: MaintenancePreset[] = [];

    if (name.includes('tankless') && name.includes('water heater')) {
        presets.push(
            preset('tankless_water_heater_descale', 'Descale tankless water heater', 1, 'years', 'Flush scale from the tankless water heater.'),
            preset('tankless_water_heater_inlet_filter', 'Clean inlet filter', 6, 'months', 'Clean or inspect the tankless inlet filter.')
        );
    } else if (name.includes('water heater')) {
        presets.push(
            preset('water_heater_flush', 'Flush water heater', 1, 'years', 'Flush sediment from the water heater.'),
            preset('water_heater_anode_rod', 'Check anode rod', 3, 'years', 'Inspect the anode rod and replace if needed.'),
            preset('water_heater_expansion_tank', 'Check expansion tank', 1, 'years', 'Check the expansion tank charge and condition.'),
            preset('water_heater_tp_valve_drain_pan', 'Check T&P valve / drain pan', 1, 'years', 'Inspect the T&P valve discharge path and drain pan.')
        );
    }

    if (matchesAny(name, ['filter', 'whole house filter', 'cartridge']) || matchesAny(category, ['filter'])) {
        presets.push(preset('replace_filter', 'Replace filter', 6, 'months', 'Replace or clean the filter.'));
    }

    if (matchesAny(name, ['ro', 'reverse osmosis'])) {
        presets.push(preset('replace_ro_filters', 'Replace RO filters', 1, 'years', 'Replace reverse osmosis filters.'));
    }

    if (matchesAny(name, ['softener', 'brine'])) {
        presets.push(preset('softener_salt_brine_check', 'Check softener salt / brine tank', 1, 'months', 'Check salt level and brine tank condition.'));
    }

    if (matchesAny(name, ['prv', 'pressure regulator', 'pressure reducing valve', 'pressure'])) {
        presets.push(preset('prv_pressure_check', 'Check water pressure / PRV', 1, 'years', 'Verify water pressure and pressure regulator behavior.'));
    }

    if (system.includes('gas') || name.includes('gas')) {
        presets.push(preset('visible_gas_connection_check', 'Check visible gas connection', 1, 'years', 'Inspect visible gas connection and shutoff condition.'));
    }

    if (system.includes('hvac') || matchesAny(name, ['hvac', 'furnace', 'air handler', 'heat pump', 'condenser'])) {
        presets.push(
            preset('hvac_filter_replace', 'Replace HVAC filter', 3, 'months', 'Replace the HVAC air filter.'),
            preset('hvac_system_service', 'Service HVAC system', 1, 'years', 'Schedule routine HVAC service.')
        );
    }

    if (
        system.includes('electrical') ||
        system.includes('safety') ||
        matchesAny(name, ['gfci', 'smoke', 'co detector', 'carbon monoxide'])
    ) {
        presets.push(
            preset('gfci_test', 'Test GFCI', 3, 'months', 'Test GFCI outlets and reset behavior.'),
            preset('smoke_co_detector_test', 'Test smoke / CO detector', 1, 'years', 'Test smoke and carbon monoxide detector operation.')
        );
    }

    if (matchesAny(name, ['water meter', 'meter'])) {
        presets.push(preset('water_meter_leak_check', 'Check water meter for leaks', 1, 'years', 'Check the water meter for leak indications.'));
    }

    return uniquePresets(presets.length > 0 ? presets : [genericPreset]);
}

export function calculateNextDueDate(
    fromDate: Date,
    recurrenceInterval: number,
    recurrenceUnit: RecurrenceUnit
) {
    const nextDate = new Date(fromDate);
    const interval = Math.max(1, recurrenceInterval);

    if (recurrenceUnit === 'days') {
        nextDate.setDate(nextDate.getDate() + interval);
    } else if (recurrenceUnit === 'weeks') {
        nextDate.setDate(nextDate.getDate() + interval * 7);
    } else if (recurrenceUnit === 'months') {
        nextDate.setMonth(nextDate.getMonth() + interval);
    } else {
        nextDate.setFullYear(nextDate.getFullYear() + interval);
    }

    return toDateInputValue(nextDate);
}

export function toDateInputValue(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function labelDueStatus(task: Pick<MaintenanceTask, 'next_due_date' | 'reminder_status'>): DueStatusLabel {
    if (task.reminder_status === 'paused') return 'Paused';

    const dueDate = parseDateOnly(task.next_due_date);
    if (!dueDate) return 'Upcoming';

    const today = parseDateOnly(toDateInputValue(new Date()));
    if (!today) return 'Upcoming';

    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / dayMs);

    if (daysUntilDue < 0) return 'Overdue';
    if (daysUntilDue <= 30) return 'Due Soon';
    return 'Upcoming';
}

export function formatRecurrence(interval: number, unit: RecurrenceUnit) {
    const safeInterval = Math.max(1, interval);
    const singularUnit = unit.endsWith('s') ? unit.slice(0, -1) : unit;
    return `Every ${safeInterval} ${safeInterval === 1 ? singularUnit : unit}`;
}

export function formatDateLabel(value?: string | null) {
    if (!value) return 'Not set';
    return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function normalize(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function matchesAny(value: string, terms: string[]) {
    return terms.some((term) => value.includes(term));
}

function uniquePresets(presets: MaintenancePreset[]) {
    const presetsByKey = new Map<string, MaintenancePreset>();
    presets.forEach((presetValue) => {
        if (!presetsByKey.has(presetValue.key)) {
            presetsByKey.set(presetValue.key, presetValue);
        }
    });
    return Array.from(presetsByKey.values());
}

function parseDateOnly(value?: string | null) {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
