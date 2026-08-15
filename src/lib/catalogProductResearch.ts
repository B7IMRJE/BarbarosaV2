import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';
import {
    readCatalogProductResearchResponse,
    type CatalogProductResearch,
} from './catalogProductResearchCore';

export type CatalogProductResearchRequest = {
    companyId?: string;
    category: string;
    brand: string;
    model: string;
    manufacturerPartNumber?: string;
    notes?: string;
};

export async function researchCatalogProduct(input: CatalogProductResearchRequest): Promise<CatalogProductResearch> {
    const category = input.category.trim();
    const brand = input.brand.trim();
    const model = input.model.trim();
    const manufacturerPartNumber = input.manufacturerPartNumber?.trim() || '';

    if (!category) throw new Error('Choose the plumbing product category before researching.');
    if (!brand) throw new Error('Enter the manufacturer or brand before researching.');
    if (!model && !manufacturerPartNumber) throw new Error('Enter an exact model or manufacturer part number before researching.');

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(sessionError.message || 'The current session could not be verified.');
    if (!session) throw new Error('Sign in again before researching manufacturer information.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/research-catalog-product`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: supabaseAnonKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                company_id: input.companyId || null,
                trade: 'plumbing',
                category,
                brand,
                model,
                manufacturer_part_number: manufacturerPartNumber || null,
                notes: input.notes?.trim() || null,
            }),
            signal: controller.signal,
        });
        const responseText = await response.text();
        const data = parseJson(responseText);
        if (!response.ok) {
            const message = readMessage(data)
                || (response.status === 429
                    ? 'Manufacturer research is busy. Wait a moment and try again.'
                    : `Manufacturer research failed (${response.status}).`);
            throw new Error(message);
        }
        return readCatalogProductResearchResponse(data);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Manufacturer research took too long. Check the connection and try again.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function parseJson(value: string): unknown {
    try { return JSON.parse(value) as unknown; }
    catch { return null; }
}

function readMessage(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    const record = value as Record<string, unknown>;
    return typeof record.message === 'string' ? record.message.trim() : '';
}

export type { CatalogProductResearch } from './catalogProductResearchCore';
