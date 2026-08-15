import { supabase } from './supabase';
import {
    parseHomeItemProductReference,
    type HomeItemProductReferenceAsset,
} from './homeItemProductReferenceCore';

export {
    parseHomeItemProductReference,
    type HomeItemProductReference,
    type HomeItemProductReferenceAsset,
    type HomeItemProductReferenceAssetKind,
} from './homeItemProductReferenceCore';

export async function loadHomeItemProductReference(homeItemId: string) {
    const cleanHomeItemId = homeItemId.trim();
    if (!cleanHomeItemId) return null;

    const { data, error } = await supabase.rpc('get_home_item_product_reference', {
        p_home_item_id: cleanHomeItemId,
    });
    if (error) throw error;

    return parseHomeItemProductReference(data);
}

export async function createHomeItemProductReferenceAssetUrl(asset: HomeItemProductReferenceAsset) {
    if (asset.url) return asset.url;
    if (!asset.bucket || !asset.storagePath) throw new Error('This product reference file is unavailable.');

    const { data, error } = await supabase.storage
        .from(asset.bucket)
        .createSignedUrl(asset.storagePath, 60 * 30);
    if (error || !data?.signedUrl) throw error || new Error('This product reference file is unavailable.');

    return data.signedUrl;
}
