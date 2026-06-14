import HomeHeader from '../../components/HomeHeader';

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import {
    EstimateDraftItem,
    loadEstimateDraft,
    removeItemFromEstimateDraft,
} from '../../lib/estimateDraft';
import { isStaffRole, loadCurrentUserRole } from '../../lib/roles';

export default function EstimateScreen() {
    const [items, setItems] = useState<EstimateDraftItem[]>([]);
    const [message, setMessage] = useState('Loading estimate draft...');
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [canUseStaffTools, setCanUseStaffTools] = useState(false);

    useEffect(() => {
        checkAccess();
    }, []);

    async function checkAccess() {
        const role = await loadCurrentUserRole();
        const canAccess = isStaffRole(role);

        setCanUseStaffTools(canAccess);
        setCheckingAccess(false);

        if (canAccess) {
            await loadDraft();
        } else {
            setMessage('');
        }
    }

    async function loadDraft() {
        const draftItems = await loadEstimateDraft();

        setItems(draftItems);
        setMessage('');
    }

    async function removeItem(id: string) {
        const nextItems = await removeItemFromEstimateDraft(id);

        setItems(nextItems);
        setMessage('Item removed from estimate.');
    }

    if (checkingAccess) {
        return <StaffOnlyMessage message="Checking access..." />;
    }

    if (!canUseStaffTools) {
        return <StaffOnlyMessage message="This area is for technicians and office staff." />;
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <HomeHeader />

                <View style={headerRowStyle}>
                    <View>
                        <Text style={titleStyle}>Estimate Draft</Text>
                        <Text style={subtitleStyle}>
                            Selected home items for a future estimate.
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={secondaryButtonStyle}
                    >
                        <Text style={secondaryButtonTextStyle}>Back</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity disabled style={disabledButtonStyle}>
                    <Text style={disabledButtonTextStyle}>
                        Generate AI Options Coming Soon
                    </Text>
                </TouchableOpacity>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                {items.length === 0 ? (
                    <View style={emptyBoxStyle}>
                        <Text style={emptyTitleStyle}>No estimate items yet.</Text>
                        <Text style={emptyTextStyle}>
                            Add equipment or fixtures to start building an estimate.
                        </Text>
                    </View>
                ) : (
                    <View style={listStyle}>
                        {items.map((item) => (
                            <View key={item.id} style={itemCardStyle}>
                                <View style={{ flex: 1 }}>
                                    <Text style={itemTitleStyle}>{item.name}</Text>
                                    <Text style={itemMetaStyle}>
                                        {item.system} / {item.category}
                                    </Text>
                                    <Text style={itemMetaStyle}>
                                        Status: {item.status || 'Missing Information'}
                                    </Text>
                                    <Text style={itemMetaStyle}>
                                        Install State: {item.install_state || 'Unknown'}
                                    </Text>
                                </View>

                                <View style={itemActionStyle}>
                                    <TouchableOpacity
                                        onPress={() => router.push(`/item/${item.item_slug}` as any)}
                                        style={openButtonStyle}
                                    >
                                        <Text style={openButtonTextStyle}>Open</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={() => removeItem(item.id)}
                                        style={removeButtonStyle}
                                    >
                                        <Text style={removeButtonTextStyle}>Remove</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

function StaffOnlyMessage({ message }: { message: string }) {
    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 700 }}>
                <HomeHeader />

                <View style={emptyBoxStyle}>
                    <Text style={emptyTitleStyle}>{message}</Text>

                    <TouchableOpacity
                        onPress={() => router.replace('/' as any)}
                        style={openButtonStyle}
                    >
                        <Text style={openButtonTextStyle}>Back Home</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}

const headerRowStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: 16,
    marginBottom: 24,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    color: '#071B33',
};

const subtitleStyle = {
    color: '#637083',
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
};

const secondaryButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const secondaryButtonTextStyle = {
    color: '#071B33',
    fontSize: 15,
    fontWeight: '900' as const,
};

const disabledButtonStyle = {
    backgroundColor: '#E7ECF3',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center' as const,
    marginBottom: 14,
};

const disabledButtonTextStyle = {
    color: '#637083',
    fontSize: 16,
    fontWeight: '900' as const,
};

const messageBoxStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    marginBottom: 14,
};

const messageTextStyle = {
    color: '#637083',
    fontSize: 14,
};

const emptyBoxStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const emptyTitleStyle = {
    color: '#071B33',
    fontSize: 20,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const emptyTextStyle = {
    color: '#637083',
    fontSize: 16,
    lineHeight: 22,
};

const listStyle = {
    gap: 12,
};

const itemCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    flexDirection: 'row' as const,
    gap: 14,
    alignItems: 'center' as const,
};

const itemTitleStyle = {
    color: '#071B33',
    fontSize: 18,
    fontWeight: '900' as const,
};

const itemMetaStyle = {
    color: '#637083',
    fontSize: 14,
    marginTop: 5,
};

const itemActionStyle = {
    gap: 8,
};

const openButtonStyle = {
    backgroundColor: '#071B33',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center' as const,
};

const openButtonTextStyle = {
    color: '#FFFFFF',
    fontWeight: '900' as const,
};

const removeButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: '#F1B8B8',
};

const removeButtonTextStyle = {
    color: '#B00020',
    fontWeight: '900' as const,
};
