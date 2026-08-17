import {
    historicalHomeOSTradeNotice,
    homeOSTradeContextRpcParams,
    isHomeOSTradeEnabled,
    isWholeHomeRepipePlacement,
    parseHomeOSTradeContext,
    tradeKeyForHomeOSSystem,
} from './homeosTradeCapabilitiesCore';

function assert(condition: unknown, message: string) {
    if (!condition) throw new Error(message);
}

const plumbingOnly = ['plumbing'];
assert(isHomeOSTradeEnabled(plumbingOnly, 'plumbing'), 'Plumbing-only company must retain Plumbing Deck cards.');
assert(!isHomeOSTradeEnabled(plumbingOnly, 'electrical'), 'Plumbing-only company must not receive Electrical Deck cards.');
assert(isHomeOSTradeEnabled(['plumbing', 'electrical'], 'electrical'), 'Multi-trade company must receive its enabled Electrical Deck.');
assert(tradeKeyForHomeOSSystem('Water Service') === 'plumbing', 'Water Service should require Plumbing capability.');
assert(tradeKeyForHomeOSSystem('Electrical') === 'electrical', 'Electrical cards should require Electrical capability.');
assert(
    historicalHomeOSTradeNotice('Electrical', plumbingOnly).includes('Historical installed item'),
    'Disabled trades must label preserved installed items as historical instead of hiding them.',
);
assert(
    isWholeHomeRepipePlacement('Water Service', 'Whole Home', ''),
    'Whole Home in Water Service should expose the direct Repipe entry.',
);
assert(
    !isWholeHomeRepipePlacement('Water Service', 'Garage', ''),
    'The direct Repipe entry must not appear in unrelated areas.',
);

const parsed = parseHomeOSTradeContext({
    enabled_trade_keys: ['Plumbing', 'electrical', 'electrical'],
    can_start_repipe: true,
    repipe_trade_enabled: true,
});
assert(parsed.enabledTradeKeys.join(',') === 'plumbing,electrical', 'Trade context must normalize and de-duplicate explicit keys.');
assert(parsed.canStartRepipe, 'Server Repipe permission should remain explicit.');

const params = homeOSTradeContextRpcParams({
    companyId: ' company-1 ', propertyId: 'property-1', serviceRequestId: '', jobId: 'job-1',
});
assert(params.p_company_id === 'company-1', 'Trade access must preserve company scope.');
assert(params.p_property_id === 'property-1', 'Trade access must preserve property scope.');
assert(params.p_service_request_id === null, 'Empty assignment ids must stay null.');
assert(params.p_job_id === 'job-1', 'Assigned job scope must reach the server.');

console.log('HomeOS trade capability regression checks passed.');
