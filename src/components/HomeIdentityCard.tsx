import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { BUILD_DISPLAY } from '../lib/appVersion';
import {
    formatHomeAddress,
    propertyTypeLabel,
    type HomeIdentity,
} from '../lib/homeIdentity';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';
import ThemedButton from './theme/ThemedButton';
import ThemedCard from './theme/ThemedCard';

type MapResponse = {
    ok?: boolean;
    dataUrl?: string;
};

type HomeIdentityCardProps = {
    identity: HomeIdentity | null;
    loading: boolean;
    onEdit: () => void;
};

export default function HomeIdentityCard({ identity, loading, onEdit }: HomeIdentityCardProps) {
    const { theme } = useTheme();
    const [mapDataUrl, setMapDataUrl] = useState('');
    const [mapLoading, setMapLoading] = useState(false);
    const coordinates = identity?.address
        ? {
            latitude: identity.address.latitude,
            longitude: identity.address.longitude,
        }
        : null;

    useEffect(() => {
        let cancelled = false;

        async function loadMap() {
            if (!coordinates) {
                setMapDataUrl('');
                return;
            }

            setMapDataUrl('');
            setMapLoading(true);

            const { data, error } = await supabase.functions.invoke<MapResponse>('home-static-map', {
                body: coordinates,
            });

            if (cancelled) return;

            setMapLoading(false);

            if (error || data?.ok !== true || !data.dataUrl) {
                setMapDataUrl('');
                return;
            }

            setMapDataUrl(data.dataUrl);
        }

        loadMap();

        return () => {
            cancelled = true;
        };
    }, [coordinates?.latitude, coordinates?.longitude]);

    if (loading) {
        return (
            <ThemedCard style={cardStyle}>
                <View style={loadingRowStyle}>
                    <ActivityIndicator size="small" />
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        Loading home information...
                    </Text>
                </View>
            </ThemedCard>
        );
    }

    if (!identity) {
        return (
            <ThemedCard style={cardStyle}>
                <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>Home Identity</Text>
                <Text style={[titleStyle, { color: theme.colors.text }]}>Home setup needed</Text>
                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                    Add your first home to start building your HomeOS record.
                </Text>
            </ThemedCard>
        );
    }

    return (
        <ThemedCard style={cardStyle}>
            <View style={contentRowStyle}>
                <View style={infoColumnStyle}>
                    <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>Home Identity</Text>
                    <Text style={[titleStyle, { color: theme.colors.text }]}>{identity.name}</Text>
                    <Text style={[ownerTextStyle, { color: theme.colors.mutedText }]}>
                        Owner: {identity.ownerDisplayName}
                    </Text>

                    <View style={metaBlockStyle}>
                        {formatHomeAddress(identity.address)
                            .split('\n')
                            .filter(Boolean)
                            .map((line) => (
                                <Text key={line} style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    {line}
                                </Text>
                            ))}
                    </View>

                    <Text style={[propertyTypeStyle, { color: theme.colors.text }]}>
                        {propertyTypeLabel(identity.propertyType)}
                    </Text>

                    <View style={footerRowStyle}>
                        <Text style={[buildTextStyle, { color: theme.colors.mutedText }]}>{BUILD_DISPLAY}</Text>
                        {identity.canEdit && (
                            <ThemedButton
                                title="Edit"
                                variant="secondary"
                                onPress={onEdit}
                                style={editButtonStyle}
                                textStyle={editButtonTextStyle}
                            />
                        )}
                    </View>
                </View>

                <View
                    style={[
                        mapContainerStyle,
                        {
                            backgroundColor: theme.colors.surfaceAlt,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radii.card,
                        },
                    ]}
                >
                    {mapDataUrl ? (
                        <Image source={{ uri: mapDataUrl }} style={mapImageStyle} resizeMode="cover" />
                    ) : (
                        <View style={mapPlaceholderStyle}>
                            {mapLoading ? (
                                <ActivityIndicator size="small" />
                            ) : (
                                <Text style={[mapPlaceholderTextStyle, { color: theme.colors.mutedText }]}>
                                    Map unavailable
                                </Text>
                            )}
                        </View>
                    )}
                </View>
            </View>
        </ThemedCard>
    );
}

const cardStyle = {
    marginTop: 22,
};

const contentRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 18,
    alignItems: 'stretch' as const,
};

const infoColumnStyle = {
    flex: 1,
    minWidth: 260,
};

const eyebrowStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const titleStyle = {
    fontSize: 28,
    fontWeight: '900' as const,
    lineHeight: 34,
    marginTop: 6,
};

const ownerTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
    marginTop: 8,
};

const metaBlockStyle = {
    marginTop: 12,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};

const propertyTypeStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
    marginTop: 12,
};

const footerRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
    marginTop: 14,
};

const buildTextStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
};

const editButtonStyle = {
    paddingHorizontal: 14,
    paddingVertical: 10,
};

const editButtonTextStyle = {
    fontSize: 13,
};

const mapContainerStyle = {
    width: 210,
    minHeight: 132,
    overflow: 'hidden' as const,
    borderWidth: 1,
};

const mapImageStyle = {
    width: '100%' as const,
    height: '100%' as const,
};

const mapPlaceholderStyle = {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 132,
    padding: 12,
};

const mapPlaceholderTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
};

const loadingRowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
};
