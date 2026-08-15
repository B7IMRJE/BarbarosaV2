export type CompanyCatalogDraftValidationInput = {
    category: string;
    brand: string;
    model: string;
    status: string;
    approvedSellingPrice: number | null;
    minimumSellingPrice: number | null;
    maximumSellingPrice: number | null;
};

export function resolveCompanyCatalogCardImageUrl(
    uploadedPhotoUrl?: string | null,
    masterProductImageUrl?: string | null,
) {
    return uploadedPhotoUrl?.trim() || masterProductImageUrl?.trim() || null;
}

export function validateCompanyCatalogDraft(draft: CompanyCatalogDraftValidationInput) {
    if (!draft.category.trim()) return 'Choose a product category.';
    if (!draft.brand.trim()) return 'Enter the product brand.';
    if (!draft.model.trim()) return 'Enter the product model.';
    if (draft.status === 'approved' && draft.approvedSellingPrice !== null && draft.approvedSellingPrice <= 0) {
        return 'Approved selling price must be greater than zero.';
    }
    if (
        draft.minimumSellingPrice !== null &&
        draft.maximumSellingPrice !== null &&
        draft.minimumSellingPrice > draft.maximumSellingPrice
    ) {
        return 'Minimum selling price cannot exceed the maximum.';
    }
    return '';
}
