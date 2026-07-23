import {
    buildCustomerInviteRpcPayload,
    customerInviteHasContact,
    customerInvitePhoneWasPersisted,
} from './customerInviteDraft';
import {
    parseValidatedAddress,
    type ValidationResponse,
} from '../../supabase/functions/address-validate/index';

runHomeConnectionRegressions();

export function runHomeConnectionRegressions() {
    invitationPayloadPreservesPhone();
    missingPersistedPhoneIsDetected();
    premiseAddressWithInferredComponentsCanBeConfirmed();
    routeLevelAddressRemainsBlocked();
    incompleteAddressRemainsBlocked();
    unresolvedAddressRemainsBlocked();
}

function invitationPayloadPreservesPhone() {
    const payload = buildCustomerInviteRpcPayload('company-1', {
        invitedName: 'Sample Customer',
        invitedEmail: 'customer@example.com',
        invitedPhone: ' (951) 555-0123 ',
        note: '',
    });

    assert(customerInviteHasContact({
        invitedName: '',
        invitedEmail: '',
        invitedPhone: '951-555-0123',
        note: '',
    }), 'A phone-only customer invitation should be valid.');
    assert(payload.p_invited_phone === '(951) 555-0123', 'The latest typed phone should be sent to the invite RPC.');
    assert(
        customerInvitePhoneWasPersisted(payload.p_invited_phone, '(951) 555-0123'),
        'A returned phone should satisfy the persistence check.'
    );
}

function missingPersistedPhoneIsDetected() {
    assert(
        !customerInvitePhoneWasPersisted('(951) 555-0123', null),
        'The form must not clear when the RPC response drops a requested phone.'
    );
}

function premiseAddressWithInferredComponentsCanBeConfirmed() {
    const parsed = parseValidatedAddress(validationResponse({
        addressComplete: false,
        hasUnconfirmedComponents: true,
        hasInferredComponents: true,
        unconfirmedComponentTypes: ['postal_code'],
    }), 'place-1', '');

    assert(parsed.address?.addressLine1 === '123 Harbor View Dr', 'A complete premise address should remain usable.');
    assert(parsed.requiresConfirmation, 'Inferred or unconfirmed address components should require explicit review.');
}

function routeLevelAddressRemainsBlocked() {
    const response = validationResponse({ validationGranularity: 'ROUTE' });
    const parsed = parseValidatedAddress(response, 'place-2', '');

    assert(parsed.address === null, 'A street without a specific home must remain blocked.');
}

function incompleteAddressRemainsBlocked() {
    const response = validationResponse({ postalCode: '' });
    const parsed = parseValidatedAddress(response, 'place-3', '');

    assert(parsed.address === null, 'An address without required structured fields must remain blocked.');
}

function unresolvedAddressRemainsBlocked() {
    const response = validationResponse({ unresolvedTokens: ['rear unit'] });
    const parsed = parseValidatedAddress(response, 'place-4', '');

    assert(parsed.address === null, 'An address with unresolved input must remain blocked.');
}

function validationResponse(overrides: {
    validationGranularity?: string;
    addressComplete?: boolean;
    hasUnconfirmedComponents?: boolean;
    hasInferredComponents?: boolean;
    postalCode?: string;
    unconfirmedComponentTypes?: string[];
    unresolvedTokens?: string[];
}): ValidationResponse {
    return {
        result: {
            verdict: {
                validationGranularity: overrides.validationGranularity || 'PREMISE',
                addressComplete: overrides.addressComplete ?? true,
                hasUnconfirmedComponents: overrides.hasUnconfirmedComponents ?? false,
                hasInferredComponents: overrides.hasInferredComponents ?? false,
                possibleNextAction: 'CONFIRM',
            },
            address: {
                formattedAddress: '123 Harbor View Dr, Sampletown, CA 90000, USA',
                postalAddress: {
                    regionCode: 'US',
                    postalCode: overrides.postalCode ?? '90000',
                    administrativeArea: 'CA',
                    locality: 'Sampletown',
                    addressLines: ['123 Harbor View Dr'],
                },
                missingComponentTypes: [],
                unconfirmedComponentTypes: overrides.unconfirmedComponentTypes || [],
                unresolvedTokens: overrides.unresolvedTokens || [],
            },
            geocode: {
                location: {
                    latitude: 33.534,
                    longitude: -117.764,
                },
            },
        },
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Home connection regression failed: ${message}`);
    }
}
