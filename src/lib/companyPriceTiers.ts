import type { TemporaryPlumbingPrice } from './temporaryRiversidePlumbingPriceList';

/** Company-managed selling-price bands. Values remain proposals until approved. */
export const companyPriceTierKeys = ['normal', 'mid', 'high'] as const;
export type CompanyPriceTierKey = typeof companyPriceTierKeys[number];

export type CompanyPriceTierProposal = {
    normal: number;
    mid: number;
    high: number;
    source: 'starter_market_proposal';
    approved: false;
};

export function buildStarterPriceTierProposal(price: Pick<TemporaryPlumbingPrice, 'marketLow' | 'recommendedPrice' | 'marketHigh'>): CompanyPriceTierProposal {
    return {
        normal: price.marketLow,
        mid: price.recommendedPrice,
        high: price.marketHigh,
        source: 'starter_market_proposal',
        approved: false,
    };
}

export function getCompanyPriceTierAmount(proposal: CompanyPriceTierProposal, tier: CompanyPriceTierKey) {
    return proposal[tier];
}

export function isCompanyPriceTierProposal(value: unknown): value is CompanyPriceTierProposal {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<CompanyPriceTierProposal>;
    return typeof candidate.normal === 'number' && candidate.normal >= 0
        && typeof candidate.mid === 'number' && candidate.mid >= candidate.normal
        && typeof candidate.high === 'number' && candidate.high >= candidate.mid
        && candidate.source === 'starter_market_proposal'
        && candidate.approved === false;
}
