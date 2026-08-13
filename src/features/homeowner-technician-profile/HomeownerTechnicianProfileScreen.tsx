import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    formatRatingCategoryLabel,
    getTechnicianRatingDisclosure,
    loadHomeownerTechnicianPublicProfile,
    type HomeownerTechnicianPublicProfile,
} from '../../lib/technicianPublicProfile';
import { buildProfessionalVCard, hasShareableProfessionalContact, type StaffProfessionalContact } from '../../lib/staffProfessionalContact';
import { useTheme } from '../../theme/useTheme';

export default function HomeownerTechnicianProfileScreen() {
    const { id, serviceRequestId } = useLocalSearchParams<{ id: string; serviceRequestId: string }>();
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [profile, setProfile] = useState<HomeownerTechnicianPublicProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        let active = true;

        async function loadProfile() {
            const technicianId = String(id || '').trim();
            const requestId = String(serviceRequestId || '').trim();

            if (!technicianId || !requestId) {
                if (active) {
                    setMessage('The technician or service request link is missing.');
                    setLoading(false);
                }
                return;
            }

            try {
                const nextProfile = await loadHomeownerTechnicianPublicProfile(technicianId, requestId);

                if (active) setProfile(nextProfile);
            } catch (error) {
                if (active) setMessage(getErrorMessage(error));
            } finally {
                if (active) setLoading(false);
            }
        }

        void loadProfile();

        return () => {
            active = false;
        };
    }, [id, serviceRequestId]);

    if (loading) {
        return (
            <View style={{ alignItems: 'center', backgroundColor: theme.colors.background, flex: 1, justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), fontWeight: '800', marginTop: scaleIcon(12) }}>
                    Loading technician profile...
                </Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={{ backgroundColor: theme.colors.background, flex: 1 }}
            contentContainerStyle={{ alignItems: 'center', padding: scaleIcon(20), paddingBottom: scaleIcon(48) }}
        >
            <View style={{ maxWidth: 760, width: '100%' }}>
                <HomeHeader />
                <ThemedButton
                    title="Back to Request"
                    variant="secondary"
                    onPress={() => router.back()}
                    style={{ alignSelf: 'flex-start', marginBottom: scaleIcon(14) }}
                />

                {!profile ? (
                    <ThemedCard>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(22), fontWeight: '900' }}>
                            Technician profile unavailable
                        </Text>
                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(21), marginTop: scaleIcon(8) }}>
                            {message || 'The company has not made this profile available.'}
                        </Text>
                    </ThemedCard>
                ) : (
                    <>
                        <ThemedCard style={{ alignItems: 'center', padding: scaleIcon(22) }}>
                            <Portrait profile={profile} />
                            <View style={{ alignItems: 'center', marginTop: scaleIcon(16) }}>
                                <Text style={{ color: theme.colors.text, fontSize: scaleFont(28), fontWeight: '900', textAlign: 'center' }}>
                                    {profile.display_name}
                                </Text>
                                <Text style={{ color: theme.colors.primary, fontSize: scaleFont(15), fontWeight: '900', marginTop: scaleIcon(5), textAlign: 'center' }}>
                                    {profile.company_name}
                                </Text>
                                <View style={{ alignItems: 'center', flexDirection: 'row', gap: scaleIcon(5), marginTop: scaleIcon(8) }}>
                                    <Ionicons name="shield-checkmark" size={scaleIcon(17)} color={theme.colors.primary} />
                                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900' }}>
                                        Assigned by the service company
                                    </Text>
                                </View>
                            </View>
                        </ThemedCard>

                        <ThemedCard style={{ marginTop: scaleIcon(14) }}>
                            <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900' }}>
                                Verified service feedback
                            </Text>
                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), fontWeight: '800', lineHeight: scaleFont(21), marginTop: scaleIcon(7) }}>
                                {getTechnicianRatingDisclosure(profile)}
                            </Text>
                            {Object.entries(profile.public_category_scores).map(([category, rating]) => (
                                <View key={category} style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: scaleIcon(10) }}>
                                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: '800' }}>
                                        {formatRatingCategoryLabel(category)}
                                    </Text>
                                    <Text style={{ color: theme.colors.primary, fontSize: scaleFont(13), fontWeight: '900' }}>
                                        {rating.toFixed(1)} / 5
                                    </Text>
                                </View>
                            ))}
                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(11), lineHeight: scaleFont(16), marginTop: scaleIcon(12) }}>
                                Only verified completed-job reviews count. Written feedback remains private unless reviewed. Ratings do not trigger automatic employment decisions.
                            </Text>
                        </ThemedCard>

                        <ProfessionalContactCard profile={profile} />

                        {profile.profile_published ? (
                            <>
                                {!!profile.short_bio && <ProfileSection title="About" values={[profile.short_bio]} sentence />}
                                <ProfileFacts profile={profile} />
                                <ProfileSection title="Specialties" values={profile.specialties} />
                                <ProfileSection title="Languages" values={profile.languages} />
                                <ProfileSection title="Certifications" values={profile.certifications} />
                                <ProfileSection title="Outside of work" values={profile.hobbies} />
                            </>
                        ) : (
                            <ThemedCard style={{ marginTop: scaleIcon(14) }}>
                                <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900' }}>
                                    Company bio coming soon
                                </Text>
                                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(21), marginTop: scaleIcon(7) }}>
                                    The technician is assigned to your request, but the company has not published their optional biography yet.
                                </Text>
                            </ThemedCard>
                        )}
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function ProfessionalContactCard({ profile }: { profile: HomeownerTechnicianPublicProfile }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const contact = getPublishedProfessionalContact(profile);

    if (!hasShareableProfessionalContact(contact)) return null;

    const vCard = buildProfessionalVCard({
        displayName: profile.display_name,
        companyName: profile.company_name,
        contact,
    });

    return (
        <ThemedCard style={{ alignItems: 'center', marginTop: scaleIcon(14) }}>
            <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900', textAlign: 'center' }}>
                Save Professional Contact
            </Text>
            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(19), marginTop: scaleIcon(6), textAlign: 'center' }}>
                Scan this company-approved QR code to add the technician’s professional contact card.
            </Text>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, marginTop: scaleIcon(14), padding: scaleIcon(14) }}>
                <QRCode value={vCard} size={Math.min(scaleIcon(210), 210)} backgroundColor="#FFFFFF" color="#071E33" />
            </View>
            <View style={{ alignSelf: 'stretch', marginTop: scaleIcon(12) }}>
                {!!profile.professional_title && <ContactLine label="Position" value={profile.professional_title} />}
                {!!profile.department && <ContactLine label="Department" value={profile.department} />}
                {!!profile.professional_phone && <ContactLine label="Work phone" value={`${profile.professional_phone}${profile.extension ? ` ext. ${profile.extension}` : ''}`} />}
                {!!profile.professional_email && <ContactLine label="Work email" value={profile.professional_email} />}
                {!!profile.professional_website && <ContactLine label="Website" value={profile.professional_website} />}
            </View>
        </ThemedCard>
    );
}

function ContactLine({ label, value }: { label: string; value: string }) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View style={{ flexDirection: 'row', gap: scaleIcon(10), justifyContent: 'space-between', marginTop: scaleIcon(7) }}>
            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900' }}>{label}</Text>
            <Text selectable style={{ color: theme.colors.text, flex: 1, fontSize: scaleFont(12), fontWeight: '800', textAlign: 'right' }}>{value}</Text>
        </View>
    );
}

function getPublishedProfessionalContact(profile: HomeownerTechnicianPublicProfile): Partial<StaffProfessionalContact> {
    const sharedFields: StaffProfessionalContact['shared_fields'] = [];

    if (profile.professional_title) sharedFields.push('professional_title');
    if (profile.department) sharedFields.push('department');
    if (profile.professional_phone) sharedFields.push('professional_phone');
    if (profile.professional_email) sharedFields.push('professional_email');
    if (profile.extension) sharedFields.push('extension');
    if (profile.professional_website) sharedFields.push('professional_website');
    if (profile.years_with_company !== null) sharedFields.push('years_with_company');

    return {
        professional_title: profile.professional_title,
        department: profile.department,
        professional_phone: profile.professional_phone,
        professional_email: profile.professional_email,
        extension: profile.extension,
        professional_website: profile.professional_website,
        years_with_company: profile.years_with_company,
        shared_fields: sharedFields,
    };
}

function Portrait({ profile }: { profile: HomeownerTechnicianPublicProfile }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const size = scaleIcon(142);

    if (profile.profile_photo_url) {
        return (
            <Image
                accessibilityLabel={`Portrait of ${profile.display_name}`}
                contentFit="cover"
                source={{ uri: profile.profile_photo_url }}
                style={{ borderColor: theme.colors.border, borderRadius: size / 2, borderWidth: 3, height: size, width: size }}
            />
        );
    }

    return (
        <View style={{ alignItems: 'center', backgroundColor: theme.colors.secondaryButton, borderColor: theme.colors.border, borderRadius: size / 2, borderWidth: 3, height: size, justifyContent: 'center', width: size }}>
            <Text style={{ color: theme.colors.primary, fontSize: scaleFont(38), fontWeight: '900' }}>
                {getInitials(profile.display_name)}
            </Text>
        </View>
    );
}

function ProfileFacts({ profile }: { profile: HomeownerTechnicianPublicProfile }) {
    const facts = [
        profile.years_experience === null ? '' : `${profile.years_experience} years of experience`,
        profile.general_location,
        profile.family_note,
    ].filter((value): value is string => Boolean(value));

    return <ProfileSection title="At a glance" values={facts} />;
}

function ProfileSection({ title, values, sentence = false }: { title: string; values: string[]; sentence?: boolean }) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    if (values.length === 0) return null;

    return (
        <ThemedCard style={{ marginTop: scaleIcon(14) }}>
            <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900' }}>{title}</Text>
            {sentence ? (
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(22), marginTop: scaleIcon(8) }}>
                    {values[0]}
                </Text>
            ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), marginTop: scaleIcon(10) }}>
                    {values.map((value) => (
                        <View key={value} style={{ backgroundColor: theme.colors.secondaryButton, borderColor: theme.colors.border, borderRadius: theme.radii.pill, borderWidth: 1, paddingHorizontal: scaleIcon(10), paddingVertical: scaleIcon(7) }}>
                            <Text style={{ color: theme.colors.secondaryButtonText, fontSize: scaleFont(12), fontWeight: '900' }}>{value}</Text>
                        </View>
                    ))}
                </View>
            )}
        </ThemedCard>
    );
}

function getInitials(value: string) {
    return value.split(/\s+/).map((part) => part[0] || '').join('').slice(0, 2).toUpperCase() || 'T';
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'The technician profile could not be loaded.';
}
