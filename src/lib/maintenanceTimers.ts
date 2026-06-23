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

export const maintenanceRecurrenceUnits: RecurrenceUnit[] = ['days', 'weeks', 'months', 'years'];

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
    item_slug?: string | null;
}) {
    const name = normalize(item.name);
    const system = normalize(item.system);
    const category = normalize(item.category);
    const itemSlug = normalize(item.item_slug);
    const text = normalize([name, system, category, itemSlug].filter(Boolean).join(' '));
    const presets: MaintenancePreset[] = [];

    const isWaterSystem = matchesAny(text, [
        'plumbing',
        'water service',
        'water quality',
        'water heater',
        'water main',
        'water meter',
        'prv',
        'pressure',
        'shutoff',
        'shut off',
        'valve',
        'filter',
        'reverse osmosis',
        'softener',
    ]);
    const isGasSystem = matchesAny(text, ['gas', 'fireplace', 'bbq', 'barbecue', 'grill']);
    const isHvacSystem = matchesAny(text, ['hvac', 'furnace', 'ac', 'air conditioner', 'air handler', 'heat pump', 'condenser', 'thermostat']);
    const isElectricalSystem = matchesAny(text, ['electrical', 'breaker', 'panel', 'gfci', 'outlet']);
    const isSafetySystem = matchesAny(text, ['safety', 'smoke', 'co detector', 'carbon monoxide', 'fire extinguisher', 'alarm']);
    const isIrrigationSystem = matchesAny(text, ['irrigation', 'sprinkler', 'controller', 'valve box', 'drip']);
    const isPoolSystem = matchesAny(text, ['pool', 'spa', 'pump', 'pool filter', 'equipment pad']);
    const isApplianceSystem = matchesAny(text, ['appliance', 'dryer', 'refrigerator', 'fridge', 'dishwasher', 'washer']);

    if (matchesAny(text, ['tankless water heater'])) {
        presets.push(
            preset('tankless_water_heater_descale', 'Descale tankless water heater', 1, 'years', 'Flush scale from the tankless water heater.'),
            preset('tankless_water_heater_inlet_filter', 'Clean inlet filter', 6, 'months', 'Clean or inspect the tankless inlet filter.'),
            preset('water_heater_tp_valve_drain_pan', 'Check T&P valve / drain pan', 1, 'years', 'Inspect the T&P valve discharge path and drain pan.')
        );
    } else if (matchesAny(text, ['water heater'])) {
        presets.push(
            preset('water_heater_flush', 'Flush water heater', 1, 'years', 'Flush sediment from the water heater.'),
            preset('water_heater_anode_rod', 'Check anode rod', 3, 'years', 'Inspect the anode rod and replace if needed.'),
            preset('water_heater_expansion_tank', 'Check expansion tank', 1, 'years', 'Check the expansion tank charge and condition.'),
            preset('water_heater_tp_valve_drain_pan', 'Check T&P valve / drain pan', 1, 'years', 'Inspect the T&P valve discharge path and drain pan.')
        );
    }

    if (isWaterSystem) {
        if (matchesAny(text, ['prv', 'pressure regulator', 'pressure reducing valve', 'pressure'])) {
            presets.push(preset('prv_pressure_check', 'Check PRV / water pressure', 1, 'years', 'Verify water pressure and pressure regulator behavior.'));
        }

        if (matchesAny(text, ['shutoff', 'shut off', 'valve', 'water service', 'water main'])) {
            presets.push(preset('shutoff_valve_check', 'Check shutoff valves', 1, 'years', 'Operate accessible shutoff valves and check for leaks.'));
        }

        if (matchesAny(text, ['water meter', 'meter', 'water service'])) {
            presets.push(preset('water_meter_leak_check', 'Check water meter for leaks', 3, 'months', 'Check the water meter for leak indications.'));
        }

        if (matchesAny(text, ['sediment filter', 'filter', 'whole house filter', 'cartridge'])) {
            presets.push(preset('sediment_filter_replace', 'Replace sediment filter', 6, 'months', 'Replace or clean the sediment filter.'));
        }

        if (matchesAny(text, ['ro', 'reverse osmosis'])) {
            presets.push(
                preset('replace_ro_filters', 'Replace RO filters', 1, 'years', 'Replace reverse osmosis filters.'),
                preset('ro_membrane_check', 'Check RO membrane', 3, 'years', 'Check reverse osmosis membrane condition and performance.')
            );
        }

        if (matchesAny(text, ['softener', 'brine'])) {
            presets.push(
                preset('softener_salt_brine_check', 'Check softener salt / brine tank', 1, 'months', 'Check salt level and brine tank condition.'),
                preset('softener_media_service', 'Service softener / media', 1, 'years', 'Check softener media and service needs.')
            );
        }
    }

    if (isGasSystem) {
        presets.push(
            preset('visible_gas_connection_check', 'Check visible gas connection', 1, 'years', 'Inspect visible gas connection and shutoff condition.'),
            preset('gas_shutoff_operation_check', 'Check gas shutoff operation', 1, 'years', 'Confirm accessible gas shutoffs are labeled and operable.')
        );

        if (matchesAny(text, ['fireplace'])) {
            presets.push(preset('fireplace_gas_valve_check', 'Check fireplace gas valve', 1, 'years', 'Inspect the fireplace gas valve and visible connection.'));
        }

        if (matchesAny(text, ['bbq', 'barbecue', 'grill', 'stub'])) {
            presets.push(preset('bbq_gas_stub_check', 'Check BBQ gas stub', 1, 'years', 'Inspect the BBQ gas stub and cap or connection.'));
        }
    }

    if (isHvacSystem) {
        presets.push(
            preset('hvac_filter_replace', 'Replace HVAC filter', 3, 'months', 'Replace the HVAC air filter.'),
            preset('ac_service', 'Service AC', 1, 'years', 'Schedule routine air conditioning service.'),
            preset('furnace_service', 'Service furnace', 1, 'years', 'Schedule routine furnace service.'),
            preset('condenser_cleaning', 'Clean condenser', 1, 'years', 'Clean debris from the outdoor condenser area.'),
            preset('thermostat_battery_replace', 'Replace thermostat batteries', 1, 'years', 'Replace thermostat batteries if applicable.')
        );
    }

    if (isElectricalSystem) {
        if (matchesAny(text, ['gfci', 'outlet', 'exterior outlet'])) {
            presets.push(preset('gfci_test', 'Test GFCI', 3, 'months', 'Test GFCI outlets and reset behavior.'));
        }

        if (matchesAny(text, ['breaker', 'panel'])) {
            presets.push(preset('breaker_panel_label_check', 'Check breaker panel labels', 1, 'years', 'Confirm breaker labels remain clear and accurate.'));
        }

        if (matchesAny(text, ['exterior', 'outlet', 'cover'])) {
            presets.push(preset('exterior_outlet_cover_check', 'Check exterior outlets / covers', 1, 'years', 'Inspect exterior outlet covers and weather protection.'));
        }
    }

    if (isSafetySystem || isElectricalSystem) {
        if (matchesAny(text, ['smoke', 'alarm'])) {
            presets.push(
                preset('smoke_alarm_test', 'Test smoke alarm', 1, 'years', 'Test smoke alarm operation.'),
                preset('smoke_detector_replace', 'Replace smoke detector', 10, 'years', 'Replace smoke detector by age or manufacturer guidance.')
            );
        }

        if (matchesAny(text, ['co detector', 'carbon monoxide', 'co alarm'])) {
            presets.push(
                preset('co_detector_test', 'Test CO detector', 1, 'years', 'Test carbon monoxide detector operation.'),
                preset('co_detector_replace', 'Replace CO detector', 10, 'years', 'Replace CO detector by age or manufacturer guidance.')
            );
        }

        if (matchesAny(text, ['battery', 'smoke', 'co detector', 'alarm'])) {
            presets.push(preset('detector_battery_replace', 'Replace batteries', 1, 'years', 'Replace detector batteries where applicable.'));
        }

        if (matchesAny(text, ['fire extinguisher', 'extinguisher'])) {
            presets.push(preset('fire_extinguisher_check', 'Check fire extinguisher', 1, 'years', 'Check charge, location, and expiration date.'));
        }
    }

    if (isIrrigationSystem) {
        presets.push(
            preset('irrigation_controller_schedule_check', 'Check controller schedule', 3, 'months', 'Review irrigation schedule for season and restrictions.'),
            preset('sprinkler_head_check', 'Check sprinkler heads', 6, 'months', 'Check sprinkler heads, drip lines, and overspray.'),
            preset('irrigation_valve_box_check', 'Check valve box', 1, 'years', 'Inspect irrigation valve box for leaks or damage.'),
            preset('irrigation_seasonal_inspection', 'Winter / seasonal inspection', 1, 'years', 'Inspect irrigation system before seasonal changes.')
        );
    }

    if (isPoolSystem) {
        presets.push(
            preset('pool_filter_clean_replace', 'Clean / replace pool filter', 3, 'months', 'Clean or replace the pool filter based on type and use.'),
            preset('pool_pump_filter_service', 'Service pump / filter', 1, 'years', 'Service pool pump and filter equipment.'),
            preset('pool_light_gfci_check', 'Check pool light / GFCI', 1, 'years', 'Check pool light and GFCI protection.'),
            preset('pool_equipment_pad_check', 'Check equipment pad', 1, 'years', 'Inspect pool equipment pad, valves, and visible connections.')
        );
    }

    if (isApplianceSystem || matchesAny(text, ['dryer', 'refrigerator', 'fridge', 'ice maker', 'water filter'])) {
        if (matchesAny(text, ['dryer'])) {
            presets.push(preset('dryer_vent_clean', 'Clean dryer vent', 1, 'years', 'Clean dryer vent and check airflow.'));
        }

        if (matchesAny(text, ['refrigerator', 'fridge'])) {
            presets.push(preset('refrigerator_coils_clean', 'Clean refrigerator coils', 1, 'years', 'Clean refrigerator condenser coils.'));
        }

        if (matchesAny(text, ['water filter', 'ice maker', 'refrigerator', 'fridge'])) {
            presets.push(preset('appliance_water_filter_replace', 'Replace appliance water filter', 6, 'months', 'Replace appliance water filter.'));
        }
    }

    return uniquePresets([...presets, genericPreset]);
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

export function parseDateInputValue(value?: string | null) {
    const trimmed = String(value || '').trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(year, month - 1, day);

    if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
    ) {
        return null;
    }

    return parsed;
}

export function isRecurrenceUnit(value: string): value is RecurrenceUnit {
    return maintenanceRecurrenceUnits.includes(value as RecurrenceUnit);
}

export function labelDueStatus(task: Pick<MaintenanceTask, 'next_due_date' | 'reminder_status'>): DueStatusLabel {
    if (task.reminder_status === 'paused') return 'Paused';

    const dueDate = parseDateInputValue(task.next_due_date);
    if (!dueDate) return 'Upcoming';

    const today = parseDateInputValue(toDateInputValue(new Date()));
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
    const parsed = parseDateInputValue(value);
    if (!parsed) return 'Not set';
    return parsed.toLocaleDateString();
}

function normalize(value?: string | null) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ');
}

function matchesAny(value: string, terms: string[]) {
    return terms.some((term) => value.includes(normalize(term)));
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
