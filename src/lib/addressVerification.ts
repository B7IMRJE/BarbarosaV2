import type { VerifiedAddress } from './homeIdentity';
import { supabase } from './supabase';

export type AddressPrediction = {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText: string;
    types: string[];
};

type AutocompleteResponse = {
    ok?: boolean;
    predictions?: AddressPrediction[];
    code?: string;
};

type ValidationResponse = {
    ok?: boolean;
    status?: 'valid' | 'needs_confirmation' | 'invalid';
    message?: string;
    address?: VerifiedAddress | null;
    requiresConfirmation?: boolean;
    code?: string;
};

export function createAddressSessionToken() {
    const crypto = globalThis.crypto as Crypto | undefined;

    if (typeof crypto?.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const value = Math.floor(Math.random() * 16);
        const nibble = char === 'x' ? value : (value & 0x3) | 0x8;
        return nibble.toString(16);
    });
}

export async function searchAddressPredictions(input: string, sessionToken: string) {
    const { data, error } = await supabase.functions.invoke<AutocompleteResponse>('address-autocomplete', {
        body: {
            input,
            sessionToken,
        },
    });

    if (error || data?.ok !== true) {
        throw new Error('Address search is unavailable right now.');
    }

    return data.predictions || [];
}

export async function validateAddressPrediction({
    prediction,
    sessionToken,
    addressLine2,
}: {
    prediction: AddressPrediction;
    sessionToken: string;
    addressLine2: string;
}) {
    const { data, error } = await supabase.functions.invoke<ValidationResponse>('address-validate', {
        body: {
            placeId: prediction.placeId,
            addressText: prediction.description,
            addressLine2,
            sessionToken,
        },
    });

    if (error || data?.ok !== true) {
        throw new Error('Address validation is unavailable right now.');
    }

    return data;
}
