import DictationTextInput from '@/components/input/DictationTextInput';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    buildProfessionalVCard,
    hasShareableProfessionalContact,
    loadMyStaffProfessionalContact,
    type StaffProfessionalContact,
} from '../../lib/staffProfessionalContact';
import {
    formatProfileList,
    loadMyCompanyTechnicianPublicProfile,
    parseProfileList,
    submitMyCompanyTechnicianPublicProfile,
    type CompanyTechnicianPublicProfile,
    type TechnicianProfileContent,
} from '../../lib/technicianPublicProfile';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type ProfileDraft = {
    displayName: string;
    profilePhotoUrl: string;
    shortBio: string;
    generalLocation: string;
    familyNote: string;
    hobbies: string;
    specialties: string;
    languages: string;
    certifications: string;
    yearsExperience: string;
};

export default function TechnicianSelfProfileScreen() {
    const params = useLocalSearchParams<{
        companyUserId?: string;
        companyName?: string;
        technicianName?: string;
    }>();
    const { scaleFont, scaleIcon, theme } = useTheme();
    const companyUserId = String(params.companyUserId || '').trim();
    const companyName = String(params.companyName || 'Service company').trim();
    const technicianName = String(params.technicianName || 'Technician').trim();
    const [profile, setProfile] = useState<CompanyTechnicianPublicProfile | null>(null);
    const [professionalContact, setProfessionalContact] = useState<StaffProfessionalContact | null>(null);
    const [draft, setDraft] = useState<ProfileDraft>(() => createDraft(null, technicianName));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingPortrait, setUploadingPortrait] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        let active = true;

        async function load() {
            if (!companyUserId) {
                setMessage('Your technician profile link is missing. Return to TechOS and open it again.');
                setLoading(false);
                return;
            }

            try {
                const [nextProfile, nextContact] = await Promise.all([
                    loadMyCompanyTechnicianPublicProfile(companyUserId),
                    loadMyStaffProfessionalContact(companyUserId),
                ]);

                if (!active) return;
                setProfile(nextProfile);
                setProfessionalContact(nextContact);
                setDraft(createDraft(nextProfile, technicianName));
            } catch (error) {
                if (active) setMessage(getErrorMessage(error));
            } finally {
                if (active) setLoading(false);
            }
        }

        void load();

        return () => {
            active = false;
        };
    }, [companyUserId, technicianName]);

    function update<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
        setDraft((current) => ({ ...current, [key]: value }));
    }

    async function submit() {
        if (saving || !companyUserId) return;

        setSaving(true);
        setMessage('Submitting your profile to management...');

        try {
            const saved = await submitMyCompanyTechnicianPublicProfile({
                company_user_id: companyUserId,
                display_name: draft.displayName.trim() || null,
                profile_photo_url: draft.profilePhotoUrl.trim() || null,
                short_bio: draft.shortBio.trim() || null,
                general_location: draft.generalLocation.trim() || null,
                family_note: draft.familyNote.trim() || null,
                hobbies: parseProfileList(draft.hobbies),
                specialties: parseProfileList(draft.specialties),
                languages: parseProfileList(draft.languages),
                certifications: parseProfileList(draft.certifications),
                years_experience: parseOptionalInteger(draft.yearsExperience),
            });

            setProfile(saved);
            setDraft(createDraft(saved, technicianName));
            setMessage('Profile submitted. Management must approve it before homeowners see the changes.');
        } catch (error) {
            setMessage(getErrorMessage(error));
        } finally {
            setSaving(false);
        }
    }

    async function chooseUniformPortrait() {
        if (uploadingPortrait || !companyUserId) return;

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
            setMessage('Photo library permission is required to choose a uniform portrait.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.9,
        });

        if (result.canceled || !result.assets?.[0]) return;

        setUploadingPortrait(true);
        setMessage('Uploading uniform portrait...');

        try {
            const asset = result.assets[0];
            const response = await fetch(asset.uri);
            const arrayBuffer = await response.arrayBuffer();
            const extension = getImageExtension(asset.fileName || asset.uri);
            const { data: authData, error: authError } = await supabase.auth.getUser();
            const authUserId = authData.user?.id;

            if (authError || !authUserId) throw new Error('Your signed-in technician account could not be confirmed.');

            const filePath = `${authUserId}/${companyUserId}/${Date.now()}.${extension}`;
            const profilePhotoBucket = 'technician-profile-photos';
            const { error } = await supabase.storage.from(profilePhotoBucket).upload(filePath, arrayBuffer, {
                contentType: asset.mimeType || `image/${extension}`,
                upsert: false,
            });

            if (error) throw error;

            const { data } = supabase.storage.from(profilePhotoBucket).getPublicUrl(filePath);
            update('profilePhotoUrl', data.publicUrl);
            setMessage('Portrait uploaded. Submit the profile when you are ready for management review.');
        } catch (error) {
            setMessage(`Portrait upload failed: ${getErrorMessage(error)}`);
        } finally {
            setUploadingPortrait(false);
        }
    }

    if (loading) {
        return (
            <View style={{ alignItems: 'center', backgroundColor: theme.colors.background, flex: 1, justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), fontWeight: '800', marginTop: scaleIcon(12) }}>
                    Loading your public profile...
                </Text>
            </View>
        );
    }

    const previewName = draft.displayName.trim() || technicianName;
    const pending = Boolean(profile?.pending_profile && profile.pending_submitted_at);
    const published = profile?.publication_status === 'published';
    const qrValue = professionalContact && hasShareableProfessionalContact(professionalContact)
        ? buildProfessionalVCard({ displayName: previewName, companyName, contact: professionalContact })
        : '';

    return (
        <ScrollView
            style={{ backgroundColor: theme.colors.background, flex: 1 }}
            contentContainerStyle={{ alignItems: 'center', padding: scaleIcon(20), paddingBottom: scaleIcon(48) }}
        >
            <View style={{ maxWidth: 760, width: '100%' }}>
                <HomeHeader />
                <ThemedButton
                    title="Back to TechOS"
                    variant="secondary"
                    onPress={() => router.back()}
                    style={{ alignSelf: 'flex-start', marginBottom: scaleIcon(14) }}
                />

                <ThemedCard style={{ alignItems: 'center' }}>
                    <Portrait name={previewName} url={draft.profilePhotoUrl} />
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(26), fontWeight: '900', marginTop: scaleIcon(14), textAlign: 'center' }}>
                        {previewName}
                    </Text>
                    <Text style={{ color: theme.colors.primary, fontSize: scaleFont(14), fontWeight: '900', marginTop: scaleIcon(5) }}>
                        {companyName}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800', marginTop: scaleIcon(8), textAlign: 'center' }}>
                        {pending ? 'Changes pending management approval' : published ? 'Current profile is published' : 'Private draft — not visible to homeowners'}
                    </Text>
                </ThemedCard>

                {!!qrValue && (
                    <ThemedCard style={{ alignItems: 'center', marginTop: scaleIcon(14) }}>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900' }}>My Professional Contact QR</Text>
                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(19), marginTop: scaleIcon(6), textAlign: 'center' }}>
                            This contains only the work contact information your company approved for sharing.
                        </Text>
                        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, marginTop: scaleIcon(14), padding: scaleIcon(14) }}>
                            <QRCode value={qrValue} size={Math.min(scaleIcon(210), 210)} backgroundColor="#FFFFFF" color="#071E33" />
                        </View>
                    </ThemedCard>
                )}

                <ThemedCard style={{ gap: scaleIcon(12), marginTop: scaleIcon(14) }}>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(21), fontWeight: '900' }}>Edit My Public Profile</Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(19) }}>
                        You can skip this and come back anytime. Your changes remain private until management reviews and approves them.
                    </Text>

                    <ProfileInput label="Public display name" value={draft.displayName} onChangeText={(value) => update('displayName', value)} />
                    <ThemedButton
                        title={uploadingPortrait ? 'Uploading Portrait...' : 'Choose Uniform Portrait'}
                        variant="secondary"
                        disabled={uploadingPortrait || !companyUserId}
                        onPress={() => void chooseUniformPortrait()}
                    />
                    <ProfileInput label="Uniform portrait HTTPS address" value={draft.profilePhotoUrl} onChangeText={(value) => update('profilePhotoUrl', value)} autoCapitalize="none" keyboardType="url" />
                    <ProfileInput label="Friendly biography" value={draft.shortBio} onChangeText={(value) => update('shortBio', value)} multiline />
                    <ProfileInput label="General location" value={draft.generalLocation} onChangeText={(value) => update('generalLocation', value)} placeholder="Riverside area" />
                    <ProfileInput label="Optional family note" value={draft.familyNote} onChangeText={(value) => update('familyNote', value)} placeholder="For example: Proud father of five" />
                    <ProfileInput label="Years of experience" value={draft.yearsExperience} onChangeText={(value) => update('yearsExperience', value.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
                    <ProfileInput label="Specialties — separate with commas" value={draft.specialties} onChangeText={(value) => update('specialties', value)} />
                    <ProfileInput label="Languages — separate with commas" value={draft.languages} onChangeText={(value) => update('languages', value)} />
                    <ProfileInput label="Certifications — separate with commas" value={draft.certifications} onChangeText={(value) => update('certifications', value)} />
                    <ProfileInput label="Hobbies — separate with commas" value={draft.hobbies} onChangeText={(value) => update('hobbies', value)} />

                    {!!message && (
                        <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '800' }}>
                            {message}
                        </Text>
                    )}
                    <ThemedButton
                        title={saving ? 'Submitting...' : 'Submit Changes for Approval'}
                        disabled={saving || !companyUserId}
                        onPress={() => void submit()}
                    />
                </ThemedCard>
            </View>
        </ScrollView>
    );
}

function ProfileInput({
    label,
    multiline = false,
    ...props
}: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    multiline?: boolean;
    placeholder?: string;
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'number-pad' | 'url';
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View>
            <Text style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: '900', marginBottom: scaleIcon(6) }}>{label}</Text>
            <DictationTextInput
                {...props}
                multiline={multiline}
                numberOfLines={multiline ? 4 : 1}
                accessibilityLabel={label}
                style={{
                    borderColor: theme.colors.border,
                    borderRadius: 12,
                    borderWidth: 1,
                    color: theme.colors.text,
                    minHeight: multiline ? scaleIcon(110) : scaleIcon(48),
                    paddingHorizontal: scaleIcon(12),
                    paddingVertical: scaleIcon(10),
                    textAlignVertical: multiline ? 'top' : 'center',
                }}
            />
        </View>
    );
}

function Portrait({ name, url }: { name: string; url: string }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const size = Math.min(scaleIcon(132), 132);

    if (url.trim()) {
        return <Image source={{ uri: url.trim() }} contentFit="cover" style={{ borderColor: theme.colors.border, borderRadius: size / 2, borderWidth: 3, height: size, width: size }} />;
    }

    return (
        <View style={{ alignItems: 'center', backgroundColor: theme.colors.secondaryButton, borderColor: theme.colors.border, borderRadius: size / 2, borderWidth: 3, height: size, justifyContent: 'center', width: size }}>
            <Text style={{ color: theme.colors.primary, fontSize: scaleFont(36), fontWeight: '900' }}>{getInitials(name)}</Text>
        </View>
    );
}

function createDraft(profile: CompanyTechnicianPublicProfile | null, fallbackName: string): ProfileDraft {
    const source: TechnicianProfileContent | null = profile?.pending_profile || profile;

    return {
        displayName: source?.display_name || fallbackName,
        profilePhotoUrl: source?.profile_photo_url || '',
        shortBio: source?.short_bio || '',
        generalLocation: source?.general_location || '',
        familyNote: source?.family_note || '',
        hobbies: formatProfileList(source?.hobbies || []),
        specialties: formatProfileList(source?.specialties || []),
        languages: formatProfileList(source?.languages || []),
        certifications: formatProfileList(source?.certifications || []),
        yearsExperience: source?.years_experience === null || source?.years_experience === undefined
            ? ''
            : String(source.years_experience),
    };
}

function parseOptionalInteger(value: string) {
    const number = Number.parseInt(value.trim(), 10);
    return Number.isFinite(number) ? number : null;
}

function getInitials(value: string) {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'TE';
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'The profile could not be loaded.';
}

function getImageExtension(value: string) {
    const match = value.toLowerCase().match(/\.([a-z0-9]{2,5})(?:\?|$)/);
    const extension = match?.[1] || 'jpg';

    return ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(extension) ? extension : 'jpg';
}
