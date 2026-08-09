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
    onOpenHistory: () => void;
};

export default function HomeIdentityCard({ identity, loading, onEdit, onOpenHistory }: HomeIdentityCardProps) {
    const { theme } = useTheme();
    const [mapDataUrl, setMapDataUrl] = useState('');
    const [mapLoading, setMapLoading] = useState(false);
    const latitude = identity?.address?.latitude ?? null;
    const longitude = identity?.address?.longitude ?? null;

    useEffect(() => {
        let cancelled = false;

        async function loadMap() {
            if (latitude === null || longitude === null) {
                setMapDataUrl('');
                return;
            }

            setMapDataUrl('');
            setMapLoading(true);

            const { data, error } = await supabase.functions.invoke<MapResponse>('home-static-map', {
                body: { latitude, longitude },
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
    }, [latitude, longitude]);

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
                    {!identity.canEdit ? (
                        <Text style={[ownerTextStyle, { color: theme.colors.mutedText }]}>
                            Homeowner: {identity.ownerDisplayName}
                        </Text>
                    ) : null}

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

                    {(identity.yearBuilt || identity.squareFootage || identity.apn || identity.majorUpgradeTypes.length > 0) ? (
                        <View style={[profileFactsStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                            <Text style={[profileSourceStyle, { color: theme.colors.mutedText }]}>Homeowner-provided · not publicly verified</Text>
                            <View style={profileFactsRowStyle}>
                                {identity.yearBuilt ? <ProfileFact label="Year built" value={String(identity.yearBuilt)} /> : null}
                                {identity.squareFootage ? <ProfileFact label="Square feet" value={identity.squareFootage.toLocaleString()} /> : null}
                                {identity.apn ? <ProfileFact label="APN" value={identity.apn} /> : null}
                                {identity.majorUpgradeTypes.length > 0 ? (
                                    <ProfileFact
                                        label="Reported upgrades"
                                        value={identity.majorUpgradeTypes.map(formatUpgradeLabel).join(', ')}
                                    />
                                ) : null}
                            </View>
                        </View>
                    ) : null}

                    <View style={footerRowStyle}>
                        <Text style={[buildTextStyle, { color: theme.colors.mutedText }]}>{BUILD_DISPLAY}</Text>
                        <View style={actionRowStyle}>
                            <ThemedButton
                                title="Construction History"
                                variant="secondary"
                                onPress={onOpenHistory}
                                style={editButtonStyle}
                                textStyle={editButtonTextStyle}
                            />
                            {identity.canEdit && (
                            <ThemedButton
                                title="Edit Home Profile"
                                variant="secondary"
                                onPress={onEdit}
                                style={editButtonStyle}
                                textStyle={editButtonTextStyle}
                            />
                            )}
                        </View>
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

function ProfileFact({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View style={profileFactStyle}>
            <Text style={[profileFactLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[profileFactValueStyle, { color: theme.colors.text }]}>{value}</Text>
        </View>
    );
}

function formatUpgradeLabel(value: string) {
    if (value === 'hvac') return 'HVAC';

    return value.charAt(0).toUpperCase() + value.slice(1);
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

const actionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
};

const profileFactsStyle = {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
};

const profileSourceStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const profileFactsRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 10,
};

const profileFactStyle = {
    minWidth: 110,
    flexGrow: 1,
    flexBasis: 140,
};

const profileFactLabelStyle = {
    fontSize: 11,
    fontWeight: '800' as const,
};

const profileFactValueStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
    marginTop: 3,
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
