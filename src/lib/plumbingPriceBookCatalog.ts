import type { CompanyPriceBookUnit } from './companyPriceBook';

export type PlumbingPriceBookCatalogItem = {
    price_key: string;
    name: string;
    system: string;
    area: string;
    category: string;
    unit: CompanyPriceBookUnit;
    defaultDescription: string;
    aliases?: string[];
};

export type PlumbingPriceBookCatalogArea = {
    name: string;
    items: PlumbingPriceBookCatalogItem[];
};

export type PlumbingPriceBookCatalogSystem = {
    key: string;
    label: string;
    icon: string;
    areas: PlumbingPriceBookCatalogArea[];
};

export const plumbingPriceBookAreaNames = [
    'Whole Home',
    'Garage / Mechanical',
    'Kitchen',
    'Bathroom',
    'Laundry',
    'Exterior',
    'Other',
];

export const plumbingPriceBookCatalog: PlumbingPriceBookCatalogSystem[] = [
    system('water-service', 'Water Service', '💧', [
        area('Whole Home', [
            item('water_service_whole_home_plumbing_diagnostic', 'Plumbing diagnostic', 'Water Service', 'Whole Home', 'Diagnostics / Inspections', 'diagnostic', 'General water service diagnostic visit.'),
            item('water_service_whole_home_water_leak_diagnostic', 'Water leak diagnostic', 'Water Service', 'Whole Home', 'Water Service', 'diagnostic', 'Diagnose an active or suspected potable water leak.'),
            item('water_service_whole_home_slab_leak_diagnostic', 'Slab leak diagnostic', 'Water Service', 'Whole Home', 'Water Service', 'diagnostic', 'Evaluate suspected under-slab water leaks and next-step repair options.', ['slab leak detection']),
            item('water_service_whole_home_pressure_test_water_system', 'Pressure test water system', 'Water Service', 'Whole Home', 'Water Service', 'inspection', 'Pressure test a residential water distribution system.'),
            item('water_service_whole_home_repipe_estimate', 'Whole-home repipe estimate', 'Water Service', 'Whole Home', 'Water Service', 'inspection', 'Estimate a whole-home domestic water repipe.'),
            item('water_service_whole_home_partial_repipe_by_fixture', 'Partial repipe by fixture', 'Water Service', 'Whole Home', 'Water Service', 'each', 'Price partial domestic water repipe work by fixture.'),
            item('water_service_whole_home_water_service_line_repair', 'Water service line repair', 'Water Service', 'Whole Home', 'Water Service', 'repair', 'Repair an accessible water service line.'),
            item('water_service_whole_home_main_water_service_replacement_estimate', 'Main water service replacement estimate', 'Water Service', 'Whole Home', 'Water Service', 'inspection', 'Estimate replacement of the main water service.'),
            item('water_service_whole_home_emergency_water_shutoff_service', 'Emergency water shutoff service', 'Water Service', 'Whole Home', 'Emergency / After Hours', 'service call', 'Emergency service to shut off or isolate water supply.'),
        ]),
        area('Garage / Mechanical', [
            item('water_service_garage_mechanical_standard_tank_water_heater_replacement', 'Standard tank water heater replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'replacement', 'Replace a standard residential tank water heater.'),
            item('water_service_garage_mechanical_tankless_water_heater_replacement', 'Tankless water heater replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'replacement', 'Replace a residential tankless water heater.'),
            item('water_service_garage_mechanical_water_heater_diagnostic', 'Water heater diagnostic', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'diagnostic', 'Diagnose water heater performance, leak, ignition, or code concerns.'),
            item('water_service_garage_mechanical_water_heater_flush', 'Water heater flush', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'service call', 'Flush a residential water heater.'),
            item('water_service_garage_mechanical_water_heater_service', 'Water heater service', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'service call', 'General residential water heater service.'),
            item('water_service_garage_mechanical_water_heater_supply_line_replacement', 'Water heater supply line replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'replacement', 'Replace water heater supply connectors.'),
            item('water_service_garage_mechanical_water_heater_flex_connector_replacement', 'Water heater flex connector replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'replacement', 'Replace flexible water heater connectors.'),
            item('water_service_garage_mechanical_water_heater_gas_connection', 'Water heater gas connection', 'Water Service', 'Garage / Mechanical', 'Gas', 'install', 'Connect water heater gas supply to approved shutoff and connector.'),
            item('water_service_garage_mechanical_water_heater_sediment_flush', 'Water heater sediment flush', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'service call', 'Flush sediment from a residential water heater.'),
            item('water_service_garage_mechanical_water_heater_drain_valve_replacement', 'Water heater drain valve replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'replacement', 'Replace a water heater drain valve.'),
            item('water_service_garage_mechanical_water_heater_tp_valve_replacement', 'Water heater T&P valve replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'replacement', 'Replace a temperature and pressure relief valve.', ['T&P valve replacement']),
            item('water_service_garage_mechanical_water_heater_expansion_tank_installation', 'Water heater expansion tank installation', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'install', 'Install a potable water heater expansion tank.', ['expansion tank install']),
            item('water_service_garage_mechanical_expansion_tank_replacement', 'Expansion tank replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'replacement', 'Replace an existing potable expansion tank.'),
            item('water_service_garage_mechanical_recirculation_pump_installation', 'Recirculation pump installation', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'install', 'Install a domestic hot water recirculation pump.'),
            item('water_service_garage_mechanical_recirculation_pump_replacement', 'Recirculation pump replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'replacement', 'Replace a domestic hot water recirculation pump.'),
            item('water_service_garage_mechanical_recirculation_timer_setup', 'Recirculation timer setup', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'service call', 'Set up or adjust a hot water recirculation timer.'),
            item('water_service_garage_mechanical_main_water_shutoff_replacement', 'Main water shutoff replacement', 'Water Service', 'Garage / Mechanical', 'Valves / Shutoffs', 'replacement', 'Replace the primary water shutoff valve serving the home.'),
            item('water_service_garage_mechanical_whole_home_water_shutoff_installation', 'Whole-home water shutoff installation', 'Water Service', 'Garage / Mechanical', 'Valves / Shutoffs', 'install', 'Install a new whole-home water shutoff valve.'),
            item('water_service_garage_mechanical_prv_pressure_regulator_replacement', 'PRV / pressure regulator replacement', 'Water Service', 'Garage / Mechanical', 'Valves / Shutoffs', 'replacement', 'Replace a pressure reducing valve or pressure regulator.'),
            item('water_service_garage_mechanical_pressure_regulator_adjustment', 'Pressure regulator adjustment', 'Water Service', 'Garage / Mechanical', 'Valves / Shutoffs', 'service call', 'Adjust an accessible water pressure regulator.'),
            item('water_service_garage_mechanical_pressure_test_water_system', 'Pressure test water system', 'Water Service', 'Garage / Mechanical', 'Water Service', 'inspection', 'Pressure test the domestic water system.'),
            item('water_service_garage_mechanical_garage_hose_bib_replacement', 'Garage hose bib replacement', 'Water Service', 'Garage / Mechanical', 'Fixtures', 'replacement', 'Replace a garage hose bib or utility faucet.'),
            item('water_service_garage_mechanical_garage_utility_sink_faucet_replacement', 'Garage utility sink faucet replacement', 'Water Service', 'Garage / Mechanical', 'Faucets / Sinks', 'replacement', 'Replace a garage utility sink faucet.'),
            item('water_service_garage_mechanical_water_heater_pan_installation', 'Water heater pan installation', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'install', 'Install a water heater drain pan.'),
            item('water_service_garage_mechanical_water_heater_stand_installation', 'Water heater stand installation', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'install', 'Install or replace a water heater stand.'),
            item('water_service_garage_mechanical_water_heater_seismic_strap_installation', 'Water heater seismic strap installation', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'install', 'Install approved water heater seismic straps.'),
            item('water_service_garage_mechanical_water_heater_permit_code_correction', 'Water heater permit / code correction', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'service call', 'Correct common water heater permit or code items.'),
        ]),
        area('Kitchen', [
            item('water_service_kitchen_kitchen_faucet_repair', 'Kitchen faucet repair', 'Water Service', 'Kitchen', 'Faucets / Sinks', 'repair', 'Repair a leaking or malfunctioning kitchen faucet.'),
            item('water_service_kitchen_kitchen_faucet_replacement', 'Kitchen faucet replacement', 'Water Service', 'Kitchen', 'Faucets / Sinks', 'replacement', 'Replace a kitchen faucet.'),
            item('water_service_kitchen_pull_down_kitchen_faucet_replacement', 'Pull-down kitchen faucet replacement', 'Water Service', 'Kitchen', 'Faucets / Sinks', 'replacement', 'Replace a pull-down kitchen faucet.'),
            item('water_service_kitchen_pot_filler_installation', 'Pot filler installation', 'Water Service', 'Kitchen', 'Faucets / Sinks', 'install', 'Install a kitchen pot filler water line and fixture.'),
            item('water_service_kitchen_kitchen_angle_stop_replacement', 'Kitchen angle stop replacement', 'Water Service', 'Kitchen', 'Valves / Shutoffs', 'replacement', 'Replace an accessible kitchen angle stop valve.'),
            item('water_service_kitchen_kitchen_supply_line_replacement', 'Kitchen supply line replacement', 'Water Service', 'Kitchen', 'Faucets / Sinks', 'replacement', 'Replace kitchen fixture supply lines.'),
            item('water_service_kitchen_dishwasher_supply_line_installation', 'Dishwasher supply line installation', 'Water Service', 'Kitchen', 'Laundry / Dishwasher', 'install', 'Install a dishwasher water supply line.'),
            item('water_service_kitchen_dishwasher_water_valve_replacement', 'Dishwasher water valve replacement', 'Water Service', 'Kitchen', 'Valves / Shutoffs', 'replacement', 'Replace a dishwasher water shutoff valve.'),
            item('water_service_kitchen_ice_maker_line_installation', 'Ice maker line installation', 'Water Service', 'Kitchen', 'Laundry / Dishwasher', 'install', 'Install an ice maker supply line.', ['ice maker line install']),
            item('water_service_kitchen_ice_maker_valve_replacement', 'Ice maker valve replacement', 'Water Service', 'Kitchen', 'Valves / Shutoffs', 'replacement', 'Replace an ice maker shutoff valve.'),
            item('water_service_kitchen_insta_hot_dispenser_installation', 'Insta-hot dispenser installation', 'Water Service', 'Kitchen', 'Fixtures', 'install', 'Install an instant hot water dispenser.'),
            item('water_service_kitchen_insta_hot_water_supply_connection', 'Insta-hot water supply connection', 'Water Service', 'Kitchen', 'Water Service', 'install', 'Connect water supply to an instant hot dispenser.'),
            item('water_service_kitchen_ro_feed_line_installation', 'RO feed line installation', 'Water Service', 'Kitchen', 'Water Quality', 'install', 'Install a feed line for a reverse osmosis system.'),
            item('water_service_kitchen_ro_faucet_replacement', 'RO faucet replacement', 'Water Service', 'Kitchen', 'Water Quality', 'replacement', 'Replace a reverse osmosis drinking water faucet.'),
            item('water_service_kitchen_kitchen_sink_shutoff_replacement', 'Kitchen sink shutoff replacement', 'Water Service', 'Kitchen', 'Valves / Shutoffs', 'replacement', 'Replace kitchen sink shutoff valves.'),
            item('water_service_kitchen_kitchen_leak_repair', 'Kitchen leak repair', 'Water Service', 'Kitchen', 'Water Service', 'repair', 'Repair an accessible kitchen water leak.'),
            item('water_service_kitchen_kitchen_water_line_repair', 'Kitchen water line repair', 'Water Service', 'Kitchen', 'Water Service', 'repair', 'Repair an accessible kitchen water line.'),
        ]),
        area('Bathroom', [
            item('water_service_bathroom_bathroom_faucet_repair', 'Bathroom faucet repair', 'Water Service', 'Bathroom', 'Faucets / Sinks', 'repair', 'Repair a leaking or malfunctioning bathroom faucet.'),
            item('water_service_bathroom_bathroom_faucet_replacement', 'Bathroom faucet replacement', 'Water Service', 'Bathroom', 'Faucets / Sinks', 'replacement', 'Replace a bathroom faucet.'),
            item('water_service_bathroom_widespread_faucet_replacement', 'Widespread faucet replacement', 'Water Service', 'Bathroom', 'Faucets / Sinks', 'replacement', 'Replace a widespread bathroom faucet.'),
            item('water_service_bathroom_single_handle_faucet_replacement', 'Single-handle faucet replacement', 'Water Service', 'Bathroom', 'Faucets / Sinks', 'replacement', 'Replace a single-handle bathroom faucet.'),
            item('water_service_bathroom_bathroom_angle_stop_replacement', 'Bathroom angle stop replacement', 'Water Service', 'Bathroom', 'Valves / Shutoffs', 'replacement', 'Replace an accessible bathroom angle stop valve.'),
            item('water_service_bathroom_bathroom_supply_line_replacement', 'Bathroom supply line replacement', 'Water Service', 'Bathroom', 'Faucets / Sinks', 'replacement', 'Replace bathroom fixture supply lines.'),
            item('water_service_bathroom_toilet_supply_line_replacement', 'Toilet supply line replacement', 'Water Service', 'Bathroom', 'Toilets', 'replacement', 'Replace a toilet supply line.'),
            item('water_service_bathroom_toilet_shutoff_replacement', 'Toilet shutoff replacement', 'Water Service', 'Bathroom', 'Toilets', 'replacement', 'Replace a toilet shutoff valve.'),
            item('water_service_bathroom_shower_cartridge_replacement', 'Shower cartridge replacement', 'Water Service', 'Bathroom', 'Fixtures', 'replacement', 'Replace a shower valve cartridge.'),
            item('water_service_bathroom_shower_valve_repair', 'Shower valve repair', 'Water Service', 'Bathroom', 'Fixtures', 'repair', 'Repair an accessible shower or tub/shower valve.'),
            item('water_service_bathroom_shower_valve_replacement', 'Shower valve replacement', 'Water Service', 'Bathroom', 'Fixtures', 'replacement', 'Replace a shower valve.'),
            item('water_service_bathroom_tub_shower_valve_replacement', 'Tub/shower valve replacement', 'Water Service', 'Bathroom', 'Fixtures', 'replacement', 'Replace a tub/shower valve.'),
            item('water_service_bathroom_tub_spout_replacement', 'Tub spout replacement', 'Water Service', 'Bathroom', 'Fixtures', 'replacement', 'Replace a tub spout.'),
            item('water_service_bathroom_roman_tub_valve_service', 'Roman tub valve service', 'Water Service', 'Bathroom', 'Fixtures', 'service call', 'Service a roman tub valve or trim set.'),
            item('water_service_bathroom_roman_tub_faucet_replacement', 'Roman tub faucet replacement', 'Water Service', 'Bathroom', 'Fixtures', 'replacement', 'Replace a roman tub faucet.'),
            item('water_service_bathroom_dual_sink_faucet_service', 'Dual sink faucet service', 'Water Service', 'Bathroom', 'Faucets / Sinks', 'service call', 'Service fixtures serving a dual sink setup.'),
            item('water_service_bathroom_bathroom_leak_repair', 'Bathroom leak repair', 'Water Service', 'Bathroom', 'Water Service', 'repair', 'Repair an accessible bathroom water leak.'),
            item('water_service_bathroom_bathroom_water_line_repair', 'Bathroom water line repair', 'Water Service', 'Bathroom', 'Water Service', 'repair', 'Repair accessible bathroom water piping.'),
            item('water_service_bathroom_bidet_seat_water_connection', 'Bidet seat water connection', 'Water Service', 'Bathroom', 'Toilets', 'install', 'Connect water supply to a bidet seat.'),
            item('water_service_bathroom_bidet_shutoff_installation', 'Bidet shutoff installation', 'Water Service', 'Bathroom', 'Toilets', 'install', 'Install a dedicated bidet shutoff valve.'),
            item('water_service_bathroom_toilet_repair', 'Toilet repair', 'Water Service', 'Bathroom', 'Toilets', 'repair', 'Repair a running, leaking, or loose toilet.'),
            item('water_service_bathroom_toilet_replacement', 'Toilet replacement', 'Water Service', 'Bathroom', 'Toilets', 'replacement', 'Replace a residential toilet.'),
            item('water_service_bathroom_fill_valve_replacement', 'Fill valve replacement', 'Water Service', 'Bathroom', 'Toilets', 'replacement', 'Replace a toilet fill valve.'),
            item('water_service_bathroom_flush_valve_replacement', 'Flush valve replacement', 'Water Service', 'Bathroom', 'Toilets', 'replacement', 'Replace a toilet flush valve.'),
            item('water_service_bathroom_flapper_replacement', 'Flapper replacement', 'Water Service', 'Bathroom', 'Toilets', 'replacement', 'Replace a toilet flapper.'),
            item('water_service_bathroom_toilet_handle_replacement', 'Toilet handle replacement', 'Water Service', 'Bathroom', 'Toilets', 'replacement', 'Replace a toilet handle.'),
            item('water_service_bathroom_toilet_tank_rebuild', 'Toilet tank rebuild', 'Water Service', 'Bathroom', 'Toilets', 'repair', 'Rebuild common toilet tank components.'),
            item('water_service_bathroom_toilet_supply_valve_replacement', 'Toilet supply valve replacement', 'Water Service', 'Bathroom', 'Toilets', 'replacement', 'Replace a toilet supply valve.'),
            item('water_service_bathroom_toilet_reset', 'Toilet reset', 'Water Service', 'Bathroom', 'Toilets', 'repair', 'Reset a toilet after service or repair.'),
            item('water_service_bathroom_toilet_leak_diagnostic', 'Toilet leak diagnostic', 'Water Service', 'Bathroom', 'Toilets', 'diagnostic', 'Diagnose a toilet leak.'),
            item('water_service_bathroom_toilet_running_repair', 'Toilet running repair', 'Water Service', 'Bathroom', 'Toilets', 'repair', 'Repair a running toilet.'),
            item('water_service_bathroom_toilet_installation_customer_supplied', 'Toilet installation customer supplied', 'Water Service', 'Bathroom', 'Toilets', 'install', 'Install a customer-supplied toilet.'),
        ]),
        area('Laundry', [
            item('water_service_laundry_washing_machine_supply_line_replacement', 'Washing machine supply line replacement', 'Water Service', 'Laundry', 'Laundry / Dishwasher', 'replacement', 'Replace washing machine supply lines.'),
            item('water_service_laundry_washing_machine_valve_replacement', 'Washing machine valve replacement', 'Water Service', 'Laundry', 'Valves / Shutoffs', 'replacement', 'Replace washing machine supply valves.'),
            item('water_service_laundry_laundry_box_replacement', 'Laundry box replacement', 'Water Service', 'Laundry', 'Laundry / Dishwasher', 'replacement', 'Replace recessed laundry supply/drain box.'),
            item('water_service_laundry_laundry_box_installation', 'Laundry box installation', 'Water Service', 'Laundry', 'Laundry / Dishwasher', 'install', 'Install a recessed laundry supply/drain box.'),
            item('water_service_laundry_washer_shutoff_replacement', 'Washer shutoff replacement', 'Water Service', 'Laundry', 'Valves / Shutoffs', 'replacement', 'Replace washer shutoff valves.'),
            item('water_service_laundry_washer_hose_replacement', 'Washer hose replacement', 'Water Service', 'Laundry', 'Laundry / Dishwasher', 'replacement', 'Replace washing machine hoses.'),
            item('water_service_laundry_utility_sink_faucet_replacement', 'Utility sink faucet replacement', 'Water Service', 'Laundry', 'Faucets / Sinks', 'replacement', 'Replace a utility sink faucet.'),
            item('water_service_laundry_utility_sink_supply_line_replacement', 'Utility sink supply line replacement', 'Water Service', 'Laundry', 'Faucets / Sinks', 'replacement', 'Replace utility sink supply lines.'),
            item('water_service_laundry_laundry_leak_repair', 'Laundry leak repair', 'Water Service', 'Laundry', 'Water Service', 'repair', 'Repair an accessible laundry water leak.'),
        ]),
        area('Exterior', [
            item('water_service_exterior_hose_bib_replacement', 'Hose bib replacement', 'Water Service', 'Exterior', 'Fixtures', 'replacement', 'Replace an exterior hose bib or sillcock.'),
            item('water_service_exterior_frost_free_hose_bib_replacement', 'Frost-free hose bib replacement', 'Water Service', 'Exterior', 'Fixtures', 'replacement', 'Replace a frost-free hose bib.'),
            item('water_service_exterior_exterior_shutoff_replacement', 'Exterior shutoff replacement', 'Water Service', 'Exterior', 'Valves / Shutoffs', 'replacement', 'Replace an exterior water shutoff valve.'),
            item('water_service_exterior_exterior_water_line_repair', 'Exterior water line repair', 'Water Service', 'Exterior', 'Water Service', 'repair', 'Repair accessible exterior water piping.'),
            item('water_service_exterior_water_line_repair_linear_foot', 'Water line repair by linear foot', 'Water Service', 'Exterior', 'Water Service', 'linear foot', 'Repair exposed or accessible water line by measured linear foot.'),
            item('water_service_exterior_main_water_service_repair_linear_foot', 'Main water service repair by linear foot', 'Water Service', 'Exterior', 'Water Service', 'linear foot', 'Repair main water service piping by measured linear foot.'),
            item('water_service_exterior_yard_leak_repair', 'Yard leak repair', 'Water Service', 'Exterior', 'Water Service', 'repair', 'Repair an accessible yard water leak.'),
            item('water_service_exterior_irrigation_tie_in_shutoff_replacement', 'Irrigation tie-in shutoff replacement', 'Water Service', 'Exterior', 'Valves / Shutoffs', 'replacement', 'Replace an irrigation tie-in shutoff valve.'),
            item('water_service_exterior_pressure_vacuum_breaker_replacement', 'Pressure vacuum breaker replacement', 'Water Service', 'Exterior', 'Valves / Shutoffs', 'replacement', 'Replace a pressure vacuum breaker.'),
            item('water_service_exterior_backflow_device_replacement', 'Backflow device replacement', 'Water Service', 'Exterior', 'Valves / Shutoffs', 'replacement', 'Replace an exterior backflow device.'),
            item('water_service_exterior_backflow_device_test_coordination', 'Backflow device test coordination', 'Water Service', 'Exterior', 'Water Service', 'other', 'Coordinate required backflow device testing.'),
            item('water_service_exterior_exterior_copper_repair', 'Exterior copper repair', 'Water Service', 'Exterior', 'Water Service', 'repair', 'Repair accessible exterior copper piping.'),
            item('water_service_exterior_exterior_pex_repair', 'Exterior PEX repair', 'Water Service', 'Exterior', 'Water Service', 'repair', 'Repair accessible exterior PEX piping.'),
        ]),
    ]),
    system('drain-sewer', 'Drain / Sewer', '🚿', [
        area('Whole Home', [
            item('drain_sewer_whole_home_drain_cleaning', 'Drain cleaning', 'Drain / Sewer', 'Whole Home', 'Drains / Sewer', 'service call', 'Clear a stoppage in an accessible drain line.'),
            item('drain_sewer_whole_home_main_line_cleanout', 'Main line cleanout', 'Drain / Sewer', 'Whole Home', 'Drains / Sewer', 'service call', 'Clear a main sewer line from an accessible cleanout.'),
            item('drain_sewer_whole_home_sewer_camera_inspection', 'Sewer camera inspection', 'Drain / Sewer', 'Whole Home', 'Drains / Sewer', 'inspection', 'Camera inspect accessible sewer piping and report findings.'),
            item('drain_sewer_whole_home_drain_inspection', 'Whole-home drain inspection', 'Drain / Sewer', 'Whole Home', 'Drains / Sewer', 'inspection', 'Inspect accessible drain and sewer conditions.'),
            item('drain_sewer_whole_home_hydro_jetting_placeholder', 'Hydro jetting placeholder', 'Drain / Sewer', 'Whole Home', 'Drains / Sewer', 'service call', 'Placeholder line item for hydro jetting scope.'),
            item('drain_sewer_whole_home_main_sewer_stoppage', 'Main sewer stoppage', 'Drain / Sewer', 'Whole Home', 'Drains / Sewer', 'service call', 'Clear or diagnose a main sewer stoppage.'),
            item('drain_sewer_whole_home_sewer_line_repair_estimate', 'Sewer line repair estimate', 'Drain / Sewer', 'Whole Home', 'Drains / Sewer', 'inspection', 'Estimate sewer line repair scope.'),
            item('drain_sewer_whole_home_sewer_line_repair_linear_foot', 'Sewer line repair by linear foot', 'Drain / Sewer', 'Whole Home', 'Drains / Sewer', 'linear foot', 'Repair accessible sewer line by measured linear foot.'),
            item('drain_sewer_whole_home_cleanout_install', 'Cleanout install', 'Drain / Sewer', 'Whole Home', 'Drains / Sewer', 'install', 'Install an accessible sewer or drain cleanout.'),
        ]),
        area('Garage / Mechanical', [
            item('drain_sewer_garage_mechanical_water_heater_drain_pan_line_installation', 'Water heater drain pan line installation', 'Drain / Sewer', 'Garage / Mechanical', 'Drains / Sewer', 'install', 'Install a water heater drain pan discharge line.'),
            item('drain_sewer_garage_mechanical_garage_floor_drain_service', 'Garage floor drain service', 'Drain / Sewer', 'Garage / Mechanical', 'Drains / Sewer', 'service call', 'Service an accessible garage floor drain.'),
            item('drain_sewer_garage_mechanical_garage_floor_drain_cleaning', 'Garage floor drain cleaning', 'Drain / Sewer', 'Garage / Mechanical', 'Drains / Sewer', 'service call', 'Clean an accessible garage floor drain.'),
            item('drain_sewer_garage_mechanical_condensate_drain_repair', 'Condensate drain repair', 'Drain / Sewer', 'Garage / Mechanical', 'Drains / Sewer', 'repair', 'Repair an accessible condensate drain line.'),
            item('drain_sewer_garage_mechanical_mechanical_room_drain_repair', 'Mechanical room drain repair', 'Drain / Sewer', 'Garage / Mechanical', 'Drains / Sewer', 'repair', 'Repair an accessible mechanical room drain.'),
            item('drain_sewer_garage_mechanical_utility_sink_drain_repair', 'Utility sink drain repair', 'Drain / Sewer', 'Garage / Mechanical', 'Drains / Sewer', 'repair', 'Repair a garage or mechanical room utility sink drain.'),
            item('drain_sewer_garage_mechanical_utility_sink_p_trap_replacement', 'Utility sink P-trap replacement', 'Drain / Sewer', 'Garage / Mechanical', 'Drains / Sewer', 'replacement', 'Replace a utility sink P-trap.'),
        ]),
        area('Kitchen', [
            item('drain_sewer_kitchen_kitchen_sink_drain_repair', 'Kitchen sink drain repair', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'repair', 'Repair kitchen sink drain piping or connections.'),
            item('drain_sewer_kitchen_kitchen_sink_drain_replacement', 'Kitchen sink drain replacement', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'replacement', 'Replace kitchen sink drain piping.'),
            item('drain_sewer_kitchen_basket_strainer_replacement', 'Basket strainer replacement', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'replacement', 'Replace a kitchen sink basket strainer.'),
            item('drain_sewer_kitchen_kitchen_drain_basket_replacement', 'Kitchen drain basket replacement', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'replacement', 'Replace a kitchen drain basket assembly.'),
            item('drain_sewer_kitchen_p_trap_replacement', 'P-trap replacement', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'replacement', 'Replace an accessible P-trap assembly.'),
            item('drain_sewer_kitchen_tubular_drain_replacement', 'Tubular drain replacement', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'replacement', 'Replace accessible tubular drain piping.'),
            item('drain_sewer_kitchen_kitchen_tubular_waste_rebuild', 'Kitchen tubular waste rebuild', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'repair', 'Rebuild kitchen tubular waste piping.'),
            item('drain_sewer_kitchen_dishwasher_drain_line_replacement', 'Dishwasher drain line replacement', 'Drain / Sewer', 'Kitchen', 'Laundry / Dishwasher', 'replacement', 'Replace a dishwasher drain line.'),
            item('drain_sewer_kitchen_dishwasher_air_gap_installation', 'Dishwasher air gap installation', 'Drain / Sewer', 'Kitchen', 'Laundry / Dishwasher', 'install', 'Install a dishwasher air gap.'),
            item('drain_sewer_kitchen_dishwasher_air_gap_replacement', 'Dishwasher air gap replacement', 'Drain / Sewer', 'Kitchen', 'Laundry / Dishwasher', 'replacement', 'Replace a dishwasher air gap.'),
            item('drain_sewer_kitchen_garbage_disposal_drain_connection', 'Garbage disposal drain connection', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'install', 'Reconnect or correct disposal drain piping.'),
            item('drain_sewer_kitchen_garbage_disposal_replacement', 'Garbage disposal replacement', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'replacement', 'Replace a residential garbage disposal.'),
            item('drain_sewer_kitchen_garbage_disposal_removal', 'Garbage disposal removal', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'service call', 'Remove a garbage disposal and reconnect sink drainage.'),
            item('drain_sewer_kitchen_dual_basin_sink_drain_rebuild', 'Dual-basin sink drain rebuild', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'repair', 'Rebuild drain piping for a dual-basin kitchen sink.'),
            item('drain_sewer_kitchen_kitchen_branch_drain_cleaning', 'Kitchen branch drain cleaning', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'service call', 'Clean a kitchen branch drain line.'),
            item('drain_sewer_kitchen_kitchen_sink_stoppage', 'Kitchen sink stoppage', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'service call', 'Clear a kitchen sink stoppage.'),
            item('drain_sewer_kitchen_cleanout_under_sink_installation', 'Cleanout under sink installation', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'install', 'Install an under-sink cleanout.'),
        ]),
        area('Bathroom', [
            item('drain_sewer_bathroom_bathroom_sink_drain_repair', 'Bathroom sink drain repair', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'repair', 'Repair bathroom sink drain piping or pop-up drain issues.'),
            item('drain_sewer_bathroom_bathroom_sink_drain_replacement', 'Bathroom sink drain replacement', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'replacement', 'Replace bathroom sink drain piping.'),
            item('drain_sewer_bathroom_bathroom_p_trap_replacement', 'Bathroom P-trap replacement', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'replacement', 'Replace a bathroom P-trap.'),
            item('drain_sewer_bathroom_pop_up_assembly_replacement', 'Pop-up assembly replacement', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'replacement', 'Replace a lavatory pop-up drain assembly.'),
            item('drain_sewer_bathroom_tub_drain_repair', 'Tub drain repair', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'repair', 'Repair accessible tub drain components.'),
            item('drain_sewer_bathroom_tub_drain_replacement', 'Tub drain replacement', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'replacement', 'Replace accessible tub drain components.'),
            item('drain_sewer_bathroom_shower_drain_service', 'Shower drain service', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'service call', 'Service an accessible shower drain.'),
            item('drain_sewer_bathroom_shower_drain_replacement', 'Shower drain replacement', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'replacement', 'Replace accessible shower drain components.'),
            item('drain_sewer_bathroom_toilet_stoppage', 'Toilet stoppage', 'Drain / Sewer', 'Bathroom', 'Toilets', 'service call', 'Clear a toilet stoppage.'),
            item('drain_sewer_bathroom_toilet_flange_repair', 'Toilet flange repair', 'Drain / Sewer', 'Bathroom', 'Toilets', 'repair', 'Repair an accessible toilet flange.'),
            item('drain_sewer_bathroom_toilet_flange_replacement', 'Toilet flange replacement', 'Drain / Sewer', 'Bathroom', 'Toilets', 'replacement', 'Replace an accessible toilet flange.'),
            item('drain_sewer_bathroom_wax_ring_replacement', 'Wax ring replacement', 'Drain / Sewer', 'Bathroom', 'Toilets', 'replacement', 'Reset toilet and replace wax ring.'),
            item('drain_sewer_bathroom_bathroom_branch_drain_cleaning', 'Bathroom branch drain cleaning', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'service call', 'Clean a bathroom branch drain.'),
            item('drain_sewer_bathroom_bathroom_sink_stoppage', 'Bathroom sink stoppage', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'service call', 'Clear a bathroom sink stoppage.'),
        ]),
        area('Laundry', [
            item('drain_sewer_laundry_washer_drain_repair', 'Washer drain repair', 'Drain / Sewer', 'Laundry', 'Drains / Sewer', 'repair', 'Repair washing machine drain piping.'),
            item('drain_sewer_laundry_washer_standpipe_repair', 'Washer standpipe repair', 'Drain / Sewer', 'Laundry', 'Drains / Sewer', 'repair', 'Repair washer standpipe piping.'),
            item('drain_sewer_laundry_laundry_standpipe_replacement', 'Laundry standpipe replacement', 'Drain / Sewer', 'Laundry', 'Drains / Sewer', 'replacement', 'Replace a laundry standpipe.'),
            item('drain_sewer_laundry_laundry_drain_cleaning', 'Laundry drain cleaning', 'Drain / Sewer', 'Laundry', 'Drains / Sewer', 'service call', 'Clean a laundry drain line.'),
            item('drain_sewer_laundry_laundry_sink_drain_repair', 'Laundry sink drain repair', 'Drain / Sewer', 'Laundry', 'Drains / Sewer', 'repair', 'Repair laundry sink drain piping.'),
            item('drain_sewer_laundry_utility_sink_p_trap_replacement', 'Utility sink P-trap replacement', 'Drain / Sewer', 'Laundry', 'Drains / Sewer', 'replacement', 'Replace a utility sink P-trap.'),
            item('drain_sewer_laundry_floor_drain_service', 'Floor drain service', 'Drain / Sewer', 'Laundry', 'Drains / Sewer', 'service call', 'Service an accessible floor drain.'),
            item('drain_sewer_laundry_floor_drain_cleaning', 'Floor drain cleaning', 'Drain / Sewer', 'Laundry', 'Drains / Sewer', 'service call', 'Clean an accessible floor drain.'),
        ]),
        area('Exterior', [
            item('drain_sewer_exterior_exterior_cleanout_service', 'Exterior cleanout service', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'service call', 'Service an exterior drain or sewer cleanout.'),
            item('drain_sewer_exterior_cleanout_installation', 'Cleanout installation', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'install', 'Install an exterior cleanout.'),
            item('drain_sewer_exterior_main_line_cleanout', 'Main line cleanout', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'service call', 'Clear a main sewer line from an exterior cleanout.'),
            item('drain_sewer_exterior_sewer_camera_inspection', 'Sewer camera inspection', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'inspection', 'Camera inspect accessible sewer piping from exterior access.'),
            item('drain_sewer_exterior_sewer_line_repair_linear_foot', 'Sewer line repair by linear foot', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'linear foot', 'Repair exterior sewer line by measured linear foot.'),
            item('drain_sewer_exterior_yard_sewer_repair', 'Yard sewer repair', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'repair', 'Repair accessible exterior sewer piping.'),
            item('drain_sewer_exterior_sewer_access_excavation_placeholder', 'Sewer access excavation placeholder', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'other', 'Placeholder line item for sewer access excavation scope.'),
            item('drain_sewer_exterior_sewer_cleanout_cap_replacement', 'Sewer cleanout cap replacement', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'replacement', 'Replace a sewer cleanout cap.'),
            item('drain_sewer_exterior_area_drain_cleaning', 'Area drain cleaning', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'service call', 'Clean an exterior area drain.'),
            item('drain_sewer_exterior_storm_drain_cleaning', 'Storm drain cleaning', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'service call', 'Clean an exterior storm drain.'),
            item('drain_sewer_exterior_outdoor_drain_repair', 'Outdoor drain repair', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'repair', 'Repair accessible outdoor drain piping.'),
        ]),
    ]),
    system('gas-service', 'Gas Service', '🔥', [
        area('Garage / Mechanical', [
            item('gas_service_garage_mechanical_gas_leak_diagnostic', 'Gas leak diagnostic', 'Gas Service', 'Garage / Mechanical', 'Gas', 'diagnostic', 'Diagnose suspected gas leaks and isolate likely source.'),
            item('gas_service_garage_mechanical_gas_shutoff_replacement', 'Gas shutoff replacement', 'Gas Service', 'Garage / Mechanical', 'Gas', 'replacement', 'Replace an accessible appliance or branch gas shutoff valve.'),
            item('gas_service_garage_mechanical_gas_pressure_test', 'Gas pressure test', 'Gas Service', 'Garage / Mechanical', 'Gas', 'inspection', 'Perform gas line pressure test where required.'),
            item('gas_service_garage_mechanical_gas_line_repair_linear_foot', 'Gas line repair by linear foot', 'Gas Service', 'Garage / Mechanical', 'Gas', 'linear foot', 'Repair accessible gas piping by measured linear foot.'),
            item('gas_service_garage_mechanical_gas_water_heater_connection', 'Gas water heater connection', 'Gas Service', 'Garage / Mechanical', 'Gas', 'install', 'Connect water heater gas supply to approved shutoff and connector.'),
            item('gas_service_garage_mechanical_gas_flex_connector_replacement', 'Gas flex connector replacement', 'Gas Service', 'Garage / Mechanical', 'Gas', 'replacement', 'Replace an appliance gas flex connector.'),
            item('gas_service_garage_mechanical_gas_sediment_trap_installation', 'Gas sediment trap installation', 'Gas Service', 'Garage / Mechanical', 'Gas', 'install', 'Install a gas sediment trap.'),
            item('gas_service_garage_mechanical_gas_line_cap_disconnect', 'Gas line cap / disconnect', 'Gas Service', 'Garage / Mechanical', 'Gas', 'service call', 'Cap or disconnect an accessible gas line.'),
            item('gas_service_garage_mechanical_gas_appliance_connection', 'Gas appliance connection', 'Gas Service', 'Garage / Mechanical', 'Gas', 'install', 'Connect a gas appliance to approved shutoff and connector.'),
        ]),
        area('Kitchen', [
            item('gas_service_kitchen_gas_range_connection', 'Gas range connection', 'Gas Service', 'Kitchen', 'Gas', 'install', 'Connect a gas range to approved shutoff and connector.'),
            item('gas_service_kitchen_gas_range_shutoff_replacement', 'Gas range shutoff replacement', 'Gas Service', 'Kitchen', 'Gas', 'replacement', 'Replace an accessible gas range shutoff valve.'),
            item('gas_service_kitchen_gas_appliance_connector_replacement', 'Gas appliance connector replacement', 'Gas Service', 'Kitchen', 'Gas', 'replacement', 'Replace a gas appliance connector.'),
            item('gas_service_kitchen_kitchen_gas_leak_diagnostic', 'Kitchen gas leak diagnostic', 'Gas Service', 'Kitchen', 'Gas', 'diagnostic', 'Diagnose a suspected kitchen gas leak.'),
            item('gas_service_kitchen_gas_line_cap_disconnect', 'Gas line cap / disconnect', 'Gas Service', 'Kitchen', 'Gas', 'service call', 'Cap or disconnect a kitchen gas line.'),
            item('gas_service_kitchen_gas_line_extension_to_range', 'Gas line extension to range', 'Gas Service', 'Kitchen', 'Gas', 'linear foot', 'Extend gas piping to a range location by measured linear foot.'),
        ]),
        area('Laundry', [
            item('gas_service_laundry_gas_dryer_connection', 'Gas dryer connection', 'Gas Service', 'Laundry', 'Gas', 'install', 'Connect a gas dryer to approved shutoff and connector.'),
            item('gas_service_laundry_gas_dryer_shutoff_replacement', 'Gas dryer shutoff replacement', 'Gas Service', 'Laundry', 'Gas', 'replacement', 'Replace a gas dryer shutoff valve.'),
            item('gas_service_laundry_gas_dryer_flex_connector_replacement', 'Gas dryer flex connector replacement', 'Gas Service', 'Laundry', 'Gas', 'replacement', 'Replace a gas dryer flex connector.'),
            item('gas_service_laundry_gas_dryer_disconnect_cap', 'Gas dryer disconnect / cap', 'Gas Service', 'Laundry', 'Gas', 'service call', 'Disconnect and cap a gas dryer line.'),
        ]),
        area('Exterior', [
            item('gas_service_exterior_gas_bbq_line_connection', 'Gas BBQ line connection', 'Gas Service', 'Exterior', 'Gas', 'install', 'Connect an exterior BBQ gas line.'),
            item('gas_service_exterior_exterior_gas_shutoff_replacement', 'Exterior gas shutoff replacement', 'Gas Service', 'Exterior', 'Gas', 'replacement', 'Replace an exterior gas shutoff valve.'),
            item('gas_service_exterior_exterior_gas_line_repair_linear_foot', 'Exterior gas line repair by linear foot', 'Gas Service', 'Exterior', 'Gas', 'linear foot', 'Repair exterior gas piping by measured linear foot.'),
            item('gas_service_exterior_gas_line_pressure_test', 'Gas line pressure test', 'Gas Service', 'Exterior', 'Gas', 'inspection', 'Pressure test exterior gas piping.'),
            item('gas_service_exterior_gas_line_extension', 'Gas line extension', 'Gas Service', 'Exterior', 'Gas', 'linear foot', 'Extend exterior gas piping by measured linear foot.'),
            item('gas_service_exterior_gas_line_cap_disconnect', 'Gas line cap / disconnect', 'Gas Service', 'Exterior', 'Gas', 'service call', 'Cap or disconnect an exterior gas line.'),
        ]),
    ]),
    system('water-quality', 'Water Quality', '🔎', [
        area('Garage / Mechanical', [
            item('water_quality_garage_mechanical_whole_home_filter_installation', 'Whole-home filter installation', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'install', 'Install a whole-home filtration system in an accessible location.'),
            item('water_quality_garage_mechanical_whole_home_filter_service', 'Whole-home filter service', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'service call', 'Service whole-home filtration equipment.'),
            item('water_quality_garage_mechanical_whole_home_filter_cartridge_replacement', 'Whole-home filter cartridge replacement', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'replacement', 'Replace whole-home filter cartridges.'),
            item('water_quality_garage_mechanical_water_softener_installation', 'Water softener installation', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'install', 'Install a residential water softener.'),
            item('water_quality_garage_mechanical_water_softener_service', 'Water softener service', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'service call', 'Service an existing water softener.'),
            item('water_quality_garage_mechanical_water_softener_bypass_valve_replacement', 'Water softener bypass valve replacement', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'replacement', 'Replace a water softener bypass valve.'),
            item('water_quality_garage_mechanical_water_softener_resin_tank_service', 'Water softener resin tank service', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'service call', 'Service a water softener resin tank.'),
            item('water_quality_garage_mechanical_water_conditioner_installation', 'Water conditioner installation', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'install', 'Install a residential water conditioner.'),
            item('water_quality_garage_mechanical_uv_light_installation', 'UV light installation', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'install', 'Install UV water treatment equipment.'),
            item('water_quality_garage_mechanical_uv_light_service', 'UV light service', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'service call', 'Service an existing UV treatment light.'),
            item('water_quality_garage_mechanical_uv_bulb_replacement', 'UV bulb replacement', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'replacement', 'Replace a UV treatment bulb.'),
            item('water_quality_garage_mechanical_whole_home_reverse_osmosis_evaluation', 'Whole-home reverse osmosis evaluation', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'inspection', 'Evaluate whole-home reverse osmosis options.'),
            item('water_quality_garage_mechanical_whole_home_ro_prefilter_replacement', 'Whole-home RO prefilter replacement', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'replacement', 'Replace whole-home RO prefilters.'),
        ]),
        area('Kitchen', [
            item('water_quality_kitchen_reverse_osmosis_installation', 'Reverse osmosis installation', 'Water Quality', 'Kitchen', 'Water Quality', 'install', 'Install a point-of-use reverse osmosis system.'),
            item('water_quality_kitchen_reverse_osmosis_service', 'Reverse osmosis service', 'Water Quality', 'Kitchen', 'Water Quality', 'service call', 'Service an existing reverse osmosis system.'),
            item('water_quality_kitchen_reverse_osmosis_filter_change', 'Reverse osmosis filter change', 'Water Quality', 'Kitchen', 'Water Quality', 'replacement', 'Replace reverse osmosis filters.'),
            item('water_quality_kitchen_reverse_osmosis_faucet_replacement', 'Reverse osmosis faucet replacement', 'Water Quality', 'Kitchen', 'Water Quality', 'replacement', 'Replace a reverse osmosis drinking water faucet.'),
            item('water_quality_kitchen_reverse_osmosis_storage_tank_replacement', 'Reverse osmosis storage tank replacement', 'Water Quality', 'Kitchen', 'Water Quality', 'replacement', 'Replace a reverse osmosis storage tank.'),
            item('water_quality_kitchen_ro_leak_repair', 'RO leak repair', 'Water Quality', 'Kitchen', 'Water Quality', 'repair', 'Repair an accessible reverse osmosis leak.'),
            item('water_quality_kitchen_instant_hot_filter_replacement', 'Instant hot filter replacement', 'Water Quality', 'Kitchen', 'Water Quality', 'replacement', 'Replace an instant hot dispenser filter.'),
            item('water_quality_kitchen_under_sink_filter_installation', 'Under-sink filter installation', 'Water Quality', 'Kitchen', 'Water Quality', 'install', 'Install an under-sink water filter.'),
            item('water_quality_kitchen_under_sink_filter_service', 'Under-sink filter service', 'Water Quality', 'Kitchen', 'Water Quality', 'service call', 'Service an under-sink water filter.'),
        ]),
    ]),
    system('diagnostics-inspections', 'Diagnostics / Inspections', '📋', [
        area('Whole Home', [
            item('diagnostics_inspections_whole_home_plumbing_diagnostic', 'Plumbing diagnostic', 'Diagnostics / Inspections', 'Whole Home', 'Diagnostics / Inspections', 'diagnostic', 'General plumbing diagnostic visit.'),
            item('diagnostics_inspections_whole_home_plumbing_inspection', 'Plumbing inspection', 'Diagnostics / Inspections', 'Whole Home', 'Diagnostics / Inspections', 'inspection', 'Residential plumbing system inspection.'),
            item('diagnostics_inspections_whole_home_leak_detection', 'Leak detection', 'Diagnostics / Inspections', 'Whole Home', 'Diagnostics / Inspections', 'diagnostic', 'Locate and document suspected plumbing leak.'),
            item('diagnostics_inspections_whole_home_slab_leak_detection', 'Slab leak detection', 'Diagnostics / Inspections', 'Whole Home', 'Diagnostics / Inspections', 'diagnostic', 'Locate and document suspected slab leak conditions.'),
            item('diagnostics_inspections_whole_home_video_inspection', 'Video inspection', 'Diagnostics / Inspections', 'Whole Home', 'Diagnostics / Inspections', 'inspection', 'Video inspection of accessible drain or sewer piping.'),
            item('diagnostics_inspections_whole_home_water_pressure_inspection', 'Water pressure inspection', 'Diagnostics / Inspections', 'Whole Home', 'Diagnostics / Inspections', 'inspection', 'Inspect water pressure and pressure regulator behavior.'),
            item('diagnostics_inspections_whole_home_water_heater_code_inspection', 'Water heater code inspection', 'Diagnostics / Inspections', 'Whole Home', 'Diagnostics / Inspections', 'inspection', 'Inspect water heater installation for common code items.'),
            item('diagnostics_inspections_whole_home_home_sale_plumbing_inspection', 'Home sale plumbing inspection', 'Diagnostics / Inspections', 'Whole Home', 'Diagnostics / Inspections', 'inspection', 'Inspect plumbing systems for a home sale or purchase.'),
            item('diagnostics_inspections_whole_home_estimate_consultation', 'Estimate / consultation', 'Diagnostics / Inspections', 'Whole Home', 'Diagnostics / Inspections', 'service call', 'Onsite estimate or consultation visit.'),
        ]),
        area('Other', [
            item('diagnostics_inspections_other_customer_supplied_fixture_installation', 'Customer supplied fixture installation', 'Diagnostics / Inspections', 'Other', 'Other Plumbing', 'install', 'Install a customer-supplied plumbing fixture.'),
            item('diagnostics_inspections_other_small_parts_allowance', 'Small parts allowance', 'Diagnostics / Inspections', 'Other', 'Other Plumbing', 'other', 'Allowance for small plumbing parts used during service.'),
            item('diagnostics_inspections_other_permit_coordination', 'Permit coordination', 'Diagnostics / Inspections', 'Other', 'Other Plumbing', 'other', 'Coordinate required plumbing permits.'),
            item('diagnostics_inspections_other_access_opening_coordination', 'Access opening coordination', 'Diagnostics / Inspections', 'Other', 'Other Plumbing', 'other', 'Coordinate access opening for plumbing work.'),
            item('diagnostics_inspections_other_drywall_access_coordination', 'Drywall access coordination', 'Diagnostics / Inspections', 'Other', 'Other Plumbing', 'other', 'Coordinate drywall access and restoration handoff for plumbing work.'),
            item('diagnostics_inspections_other_haul_away_disposal_fee', 'Haul away / disposal fee', 'Diagnostics / Inspections', 'Other', 'Other Plumbing', 'other', 'Fee for disposal or haul away of replaced plumbing material.'),
            item('diagnostics_inspections_other_trip_charge_service_call', 'Trip charge / service call', 'Diagnostics / Inspections', 'Other', 'Other Plumbing', 'service call', 'Standard trip charge or service call fee.'),
            item('diagnostics_inspections_other_minimum_service_charge', 'Minimum service charge', 'Diagnostics / Inspections', 'Other', 'Other Plumbing', 'service call', 'Minimum charge for billable plumbing service.'),
        ]),
    ]),
    system('emergency-after-hours', 'Emergency / After Hours', '🚨', [
        area('Whole Home', [
            item('emergency_after_hours_whole_home_emergency_dispatch_fee', 'Emergency dispatch fee', 'Emergency / After Hours', 'Whole Home', 'Emergency / After Hours', 'service call', 'Emergency dispatch fee for urgent plumbing response.'),
            item('emergency_after_hours_whole_home_after_hours_fee', 'After-hours fee', 'Emergency / After Hours', 'Whole Home', 'Emergency / After Hours', 'each', 'After-hours premium added to eligible service work.'),
            item('emergency_after_hours_whole_home_weekend_service_fee', 'Weekend service fee', 'Emergency / After Hours', 'Whole Home', 'Emergency / After Hours', 'each', 'Weekend service premium added to eligible service work.'),
            item('emergency_after_hours_whole_home_holiday_service_fee', 'Holiday service fee', 'Emergency / After Hours', 'Whole Home', 'Emergency / After Hours', 'each', 'Holiday service premium added to eligible service work.'),
            item('emergency_after_hours_whole_home_same_day_priority_fee', 'Same-day priority fee', 'Emergency / After Hours', 'Whole Home', 'Emergency / After Hours', 'each', 'Same-day priority scheduling fee.'),
            item('emergency_after_hours_whole_home_emergency_water_shutoff', 'Emergency water shutoff', 'Emergency / After Hours', 'Whole Home', 'Emergency / After Hours', 'service call', 'Emergency response to shut off or isolate water supply.'),
            item('emergency_after_hours_whole_home_emergency_leak_response', 'Emergency leak response', 'Emergency / After Hours', 'Whole Home', 'Emergency / After Hours', 'service call', 'Emergency response to active plumbing leak.'),
            item('emergency_after_hours_whole_home_emergency_drain_response', 'Emergency drain response', 'Emergency / After Hours', 'Whole Home', 'Emergency / After Hours', 'service call', 'Emergency response to active drain or sewer backup.'),
        ]),
    ]),
];

export const plumbingPriceBookCatalogItems = plumbingPriceBookCatalog.flatMap((systemEntry) =>
    systemEntry.areas.flatMap((areaEntry) => areaEntry.items)
);

export const plumbingPriceBookCategories = Array.from(
    new Set(plumbingPriceBookCatalogItems.map((catalogItem) => catalogItem.category))
).sort((a, b) => a.localeCompare(b));

function system(
    key: string,
    label: string,
    icon: string,
    areas: PlumbingPriceBookCatalogArea[]
): PlumbingPriceBookCatalogSystem {
    return { key, label, icon, areas };
}

function area(name: string, items: PlumbingPriceBookCatalogItem[]): PlumbingPriceBookCatalogArea {
    return { name, items };
}

function item(
    price_key: string,
    name: string,
    systemName: string,
    areaName: string,
    category: string,
    unit: CompanyPriceBookUnit,
    defaultDescription: string,
    aliases: string[] = []
): PlumbingPriceBookCatalogItem {
    return {
        price_key,
        name,
        system: systemName,
        area: areaName,
        category,
        unit,
        defaultDescription,
        aliases,
    };
}
