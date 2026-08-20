import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

type ProductCardImageProps = {
    imageUrl?: string | null;
    productName: string;
    compact?: boolean;
    style?: StyleProp<ViewStyle>;
};

export default function ProductCardImage({ imageUrl, productName, compact = false, style }: ProductCardImageProps) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const [failedUrl, setFailedUrl] = useState('');
    const cleanImageUrl = imageUrl?.trim() || '';
    const showImage = Boolean(cleanImageUrl && cleanImageUrl !== failedUrl);

    useEffect(() => {
        setFailedUrl('');
    }, [cleanImageUrl]);

    return (
        <View
            style={[
                foundation.imageSurface,
                {
                    minHeight: scaleIcon(compact ? 68 : 110),
                    backgroundColor: theme.colors.surfaceAlt,
                },
                style,
            ]}
        >
            {showImage ? (
                <Image
                    accessibilityLabel={`${productName} product photo`}
                    alt={`${productName} product photo`}
                    cachePolicy="memory-disk"
                    contentFit="contain"
                    onError={() => setFailedUrl(cleanImageUrl)}
                    source={cleanImageUrl}
                    style={{ width: '100%', height: '100%' }}
                    transition={180}
                />
            ) : (
                <View style={{ flex: 1, minHeight: scaleIcon(compact ? 68 : 110), alignItems: 'center', justifyContent: 'center', gap: scaleIcon(compact ? 2 : 6), padding: scaleIcon(compact ? 6 : 12) }}>
                    <Text style={{ fontSize: scaleIcon(compact ? 24 : 30) }}>📦</Text>
                    <Text
                        style={{ color: theme.colors.mutedText, fontSize: scaleFont(compact ? 10 : 12), fontWeight: '800', textAlign: 'center' }}
                        numberOfLines={compact ? 1 : 2}
                    >
                        {compact ? 'No photo' : 'Product photo not available'}
                    </Text>
                </View>
            )}
        </View>
    );
}
