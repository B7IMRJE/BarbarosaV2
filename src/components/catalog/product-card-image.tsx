import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/useTheme';

type ProductCardImageProps = {
    imageUrl?: string | null;
    productName: string;
    style?: StyleProp<ViewStyle>;
};

export default function ProductCardImage({ imageUrl, productName, style }: ProductCardImageProps) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [failedUrl, setFailedUrl] = useState('');
    const cleanImageUrl = imageUrl?.trim() || '';
    const showImage = Boolean(cleanImageUrl && cleanImageUrl !== failedUrl);

    useEffect(() => {
        setFailedUrl('');
    }, [cleanImageUrl]);

    return (
        <View
            style={[
                {
                    minHeight: scaleIcon(110),
                    overflow: 'hidden',
                    borderRadius: theme.radii.button,
                    borderCurve: 'continuous',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
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
                <View style={{ flex: 1, minHeight: scaleIcon(110), alignItems: 'center', justifyContent: 'center', gap: scaleIcon(6), padding: scaleIcon(12) }}>
                    <Text style={{ fontSize: scaleIcon(30) }}>📦</Text>
                    <Text
                        style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800', textAlign: 'center' }}
                        numberOfLines={2}
                    >
                        Product photo not available
                    </Text>
                </View>
            )}
        </View>
    );
}
