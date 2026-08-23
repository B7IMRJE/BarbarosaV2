type CatalogFactoryMediaLike = {
    id: string;
    assetType: string;
    active: boolean;
    isPrimary: boolean;
};

export function reconcileCatalogFactoryMediaRemoval<T extends CatalogFactoryMediaLike>(
    assets: readonly T[],
    removedAssetId: string,
    primaryAssetId: string | null,
) {
    return assets
        .filter((asset) => asset.id !== removedAssetId)
        .map((asset) => asset.assetType === 'image'
            ? { ...asset, isPrimary: Boolean(primaryAssetId) && asset.id === primaryAssetId }
            : asset);
}
