import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import {
    resolveLoggedInUserRoute,
    WORKSPACE_ACCESS_ERROR_MESSAGE,
    type AuthorizedWorkspace,
} from '../lib/onboarding';
import { supabase } from '../lib/supabase';

export default function WorkspaceChooserScreen() {
    const [workspaces, setWorkspaces] = useState<AuthorizedWorkspace[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [focusedWorkspaceId, setFocusedWorkspaceId] = useState('');

    useEffect(() => {
        void loadWorkspaces();
    }, []);

    async function loadWorkspaces() {
        setLoading(true);
        setMessage('');

        const userResult = await supabase.auth.getUser();
        const user = userResult.data.user;

        if (userResult.error || !user) {
            setLoading(false);
            router.replace('/auth/login' as any);
            return;
        }

        const decision = await resolveLoggedInUserRoute(user.id);

        if (decision.reason === 'service-unavailable') {
            setLoading(false);
            setMessage(WORKSPACE_ACCESS_ERROR_MESSAGE);
            return;
        }

        if (decision.reason !== 'multiple-workspaces') {
            setLoading(false);
            router.replace(decision.route as any);
            return;
        }

        const authorizedWorkspaces = decision.workspaces || [];

        if (!authorizedWorkspaces.length) {
            setLoading(false);
            setMessage(WORKSPACE_ACCESS_ERROR_MESSAGE);
            return;
        }

        setWorkspaces(authorizedWorkspaces);
        setLoading(false);
    }

    return (
        <ScrollView
            style={screenStyle}
            contentContainerStyle={contentStyle}
            keyboardShouldPersistTaps="handled"
        >
            <View style={cardStyle}>
                <Text accessibilityRole="header" style={titleStyle}>Choose your workspace</Text>
                <Text style={subtitleStyle}>Select where you would like to continue.</Text>

                {loading ? (
                    <View accessibilityLabel="Loading authorized workspaces" accessibilityRole="progressbar" style={loadingStyle}>
                        <ActivityIndicator size="large" color="#0B5FFF" />
                        <Text style={loadingTextStyle}>Loading your authorized workspaces...</Text>
                    </View>
                ) : (
                    <View style={workspaceListStyle}>
                        {workspaces.map((workspace) => (
                            <Pressable
                                key={workspace.id}
                                accessibilityLabel={`${workspace.label}. ${workspace.description}`}
                                accessibilityRole="button"
                                onBlur={() => setFocusedWorkspaceId((current) => current === workspace.id ? '' : current)}
                                onFocus={() => setFocusedWorkspaceId(workspace.id)}
                                onPress={() => router.replace(workspace.route as any)}
                                style={({ pressed }) => [
                                    workspaceButtonStyle,
                                    focusedWorkspaceId === workspace.id && workspaceButtonFocusedStyle,
                                    pressed && { opacity: 0.9, transform: [{ translateY: 1 }] },
                                ]}
                            >
                                <View style={workspaceTextStyle}>
                                    <Text style={workspaceLabelStyle}>{workspace.label}</Text>
                                    <Text style={workspaceDescriptionStyle}>{workspace.description}</Text>
                                </View>
                                <Text aria-hidden style={arrowStyle}>→</Text>
                            </Pressable>
                        ))}
                    </View>
                )}

                {!!message && (
                    <View accessibilityLiveRegion="polite" aria-live="polite" style={messageStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => void loadWorkspaces()}
                            style={({ pressed }) => [retryButtonStyle, pressed && { opacity: 0.85 }]}
                        >
                            <Text style={retryButtonTextStyle}>Try again</Text>
                        </Pressable>
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

const screenStyle = {
    flex: 1,
    backgroundColor: '#F3F6FA',
};

const contentStyle = {
    alignItems: 'center' as const,
    padding: 24,
};

const cardStyle = {
    marginTop: 60,
    maxWidth: 560,
    width: '100%' as const,
};

const titleStyle = {
    color: '#071B33',
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    color: '#637083',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 24,
    marginTop: 8,
};

const loadingStyle = {
    alignItems: 'center' as const,
    backgroundColor: '#FFFFFF',
    borderColor: '#E3E8EF',
    borderRadius: 18,
    borderWidth: 1,
    padding: 28,
};

const loadingTextStyle = {
    color: '#637083',
    marginTop: 14,
};

const workspaceListStyle = {
    gap: 14,
};

const workspaceButtonStyle = {
    alignItems: 'center' as const,
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E1EA',
    borderRadius: 18,
    borderWidth: 2,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    minHeight: 88,
    paddingHorizontal: 20,
    paddingVertical: 16,
};

const workspaceButtonFocusedStyle = {
    borderColor: '#0B5FFF',
    boxShadow: '0 0 0 3px rgba(11, 95, 255, 0.24)',
};

const workspaceTextStyle = {
    flex: 1,
    paddingRight: 16,
};

const workspaceLabelStyle = {
    color: '#071B33',
    fontSize: 20,
    fontWeight: '900' as const,
};

const workspaceDescriptionStyle = {
    color: '#637083',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
};

const arrowStyle = {
    color: '#0B5FFF',
    fontSize: 24,
    fontWeight: '900' as const,
};

const messageStyle = {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3E8EF',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
};

const messageTextStyle = {
    color: '#637083',
    fontSize: 14,
    lineHeight: 20,
};

const retryButtonStyle = {
    alignItems: 'center' as const,
    backgroundColor: '#0B5FFF',
    borderRadius: 12,
    marginTop: 14,
    minHeight: 46,
    paddingHorizontal: 18,
    paddingVertical: 12,
};

const retryButtonTextStyle = {
    color: '#FFFFFF',
    fontWeight: '900' as const,
};
