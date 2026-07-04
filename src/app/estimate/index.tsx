import HomeHeader from '../../components/HomeHeader';

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import {
    loadCurrentCompanyPermissionAccess,
    type CompanyPermissionAccess,
} from '../../lib/companyPermissions';
import {
    EstimateDraftItem,
    loadEstimateDraft,
    removeItemFromEstimateDraft,
} from '../../lib/estimateDraft';
import {
    providerModePath,
    readProviderModeParams,
    validateProviderModeAccess,
} from '../../lib/providerMode';

const estimateFoundationSections = [
    {
        title: 'Findings',
        description: 'Field findings from the selected HomeOS item will be captured here.',
    },
    {
        title: 'Recommended Work',
        description: 'Recommended repairs or replacements will be written here before customer review.',
    },
    {
        title: 'Price Book Coming Soon',
        description: 'Pricing is not configured yet. No fake prices are generated.',
    },
    {
        title: 'Photos / Notes Later',
        description: 'Photos, notes, and approvals will connect after the estimate schema is installed.',
    },
];

export default function EstimateScreen() {
    const { companyId, propertyId, mode, providerMode, returnTo } = useLocalSearchParams<{
        companyId?: string | string[];
        propertyId?: string | string[];
        mode?: string | string[];
        providerMode?: string | string[];
        returnTo?: string | string[];
    }>();
    const requestedCompanyId = firstParam(companyId);
    const requestedPropertyId = firstParam(propertyId);
    const requestedMode = firstParam(mode);
    const requestedReturnTo = firstParam(returnTo);
    const providerModeContext = readProviderModeParams({ providerMode, companyId, propertyId, returnTo });
    const [items, setItems] = useState<EstimateDraftItem[]>([]);
    const [message, setMessage] = useState('Loading estimate draft...');
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [estimateAccess, setEstimateAccess] = useState<CompanyPermissionAccess | null>(null);

    useEffect(() => {
        void checkAccess();
    }, [requestedCompanyId, requestedPropertyId, providerModeContext?.providerMode]);

    async function checkAccess() {
        setCheckingAccess(true);
        setEstimateAccess(null);
        setItems([]);
        setMessage('Loading estimate draft...');

        if (providerModeContext) {
            const providerAccess = await validateProviderModeAccess(
                providerModeContext.companyId,
                providerModeContext.propertyId
            );

            if (!providerAccess.access) {
                setCheckingAccess(false);
                setMessage(`Estimate permission unavailable: ${providerAccess.error || 'Provider mode access could not be confirmed.'}`);
                return;
            }

            const access: CompanyPermissionAccess = {
                userId: providerAccess.access.userId,
                companyUserId: providerAccess.access.companyUserId,
                companyId: providerAccess.access.companyId,
                role: providerAccess.access.role,
                status: providerAccess.access.status,
                permissions: providerAccess.access.permissions,
            };

            if (!access.permissions.can_add_item_to_estimate) {
                setEstimateAccess(null);
                setCheckingAccess(false);
                setMessage('Estimate access unavailable: You do not have permission to add estimates.');
                return;
            }

            setEstimateAccess(access);
            setCheckingAccess(false);
            await loadDraft(access);
            return;
        }

        const permission = await loadCurrentCompanyPermissionAccess('can_add_item_to_estimate', {
            companyId: requestedCompanyId,
        });

        if (!permission.access) {
            setEstimateAccess(null);
            setCheckingAccess(false);
            setMessage(permission.error || '');
            return;
        }

        setEstimateAccess(permission.access);
        setCheckingAccess(false);
        await loadDraft(permission.access);
    }

    async function loadDraft(access: CompanyPermissionAccess) {
        const draftItems = await loadEstimateDraft({
            userId: access.userId,
            companyId: access.companyId,
            propertyId: requestedPropertyId,
        });

        setItems(draftItems);
        setMessage(providerModeContext && draftItems.length === 0
            ? 'No provider estimate draft found.'
            : ''
        );
    }

    async function removeItem(id: string) {
        if (!estimateAccess) return;

        const nextItems = await removeItemFromEstimateDraft(id, {
            userId: estimateAccess.userId,
            companyId: estimateAccess.companyId,
            propertyId: requestedPropertyId,
        });

        setItems(nextItems);
        setMessage('Item removed from estimate.');
    }

    function providerClientHomeOsPath() {
        if (!providerModeContext) return '/';

        return String(providerModePath('/', providerModeContext));
    }

    function providerCompanyDashboardPath() {
        if (!providerModeContext) return '/super-admin';

        return `/super-admin/company/${encodeURIComponent(providerModeContext.companyId)}`;
    }

    function goBackToItem() {
        if (requestedReturnTo) {
            router.push(requestedReturnTo as never);
            return;
        }

        if (items[0]) {
            openDraftItem(items[0]);
            return;
        }

        router.push(providerClientHomeOsPath() as never);
    }

    function goBackToClientHomeOs() {
        router.push(providerClientHomeOsPath() as never);
    }

    function goToCompanyDashboard() {
        router.push(providerCompanyDashboardPath() as never);
    }

    function openDraftItem(item: EstimateDraftItem) {
        const itemSlug = encodeURIComponent(item.item_slug);
        const routeCompanyId = item.company_id || estimateAccess?.companyId || requestedCompanyId || '';
        const routePropertyId = item.property_id || requestedPropertyId || '';
        const queryParams = new URLSearchParams();

        if (routeCompanyId) queryParams.set('companyId', routeCompanyId);
        if (routePropertyId) queryParams.set('propertyId', routePropertyId);
        if (providerModeContext) {
            queryParams.set('providerMode', '1');
            queryParams.set('returnTo', providerClientHomeOsPath());
        } else if (requestedMode === 'management' || (routeCompanyId && routePropertyId)) {
            queryParams.set('mode', 'management');
        }

        const queryString = queryParams.toString();
        const itemRoute = `/item/${itemSlug}${queryString ? `?${queryString}` : ''}`;

        router.push(itemRoute as never);
    }

    if (checkingAccess) {
        return (
            <StaffOnlyMessage
                message="Checking access..."
                homeRoute={providerModeContext ? providerClientHomeOsPath() : undefined}
            />
        );
    }

    if (!estimateAccess) {
        return (
            <StaffOnlyMessage
                message="Estimate tools are available to active company users with estimate permission."
                detail={message}
                homeRoute={providerModeContext ? providerClientHomeOsPath() : undefined}
            />
        );
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
                        <Text style={titleStyle}>
                            {providerModeContext ? 'Provider Estimate Draft' : 'Estimate Draft'}
                        </Text>
                        <Text style={subtitleStyle}>
                            {providerModeContext
                                ? 'Provider estimate draft for this client HomeOS.'
                                : 'Selected home items for a future estimate.'}
                        </Text>
                    </View>

                    {providerModeContext ? (
                        <View style={providerNavStyle}>
                            <TouchableOpacity
                                onPress={goBackToItem}
                                style={secondaryButtonStyle}
                            >
                                <Text style={secondaryButtonTextStyle}>Back to Item</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={goBackToClientHomeOs}
                                style={secondaryButtonStyle}
                            >
                                <Text style={secondaryButtonTextStyle}>Back to Client HomeOS</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={goToCompanyDashboard}
                                style={secondaryButtonStyle}
                            >
                                <Text style={secondaryButtonTextStyle}>Company Dashboard</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={secondaryButtonStyle}
                        >
                            <Text style={secondaryButtonTextStyle}>Back</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <TouchableOpacity disabled style={disabledButtonStyle}>
                    <Text style={disabledButtonTextStyle}>
                        Estimate pricing and customer approval are coming soon.
                    </Text>
                </TouchableOpacity>

                <View style={messageBoxStyle}>
                    <Text style={messageTextStyle}>
                        Company: {shortId(estimateAccess.companyId)}
                    </Text>
                    <Text style={messageTextStyle}>
                        Customer/Home Property: {shortId(requestedPropertyId)}
                    </Text>
                    <Text style={messageTextStyle}>
                        Context: {providerModeContext ? 'Provider Mode' : requestedMode || 'ManagementOS'}
                    </Text>
                </View>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                <View style={foundationGridStyle}>
                    {estimateFoundationSections.map((section) => (
                        <View key={section.title} style={foundationCardStyle}>
                            <Text style={foundationTitleStyle}>{section.title}</Text>
                            <Text style={foundationTextStyle}>{section.description}</Text>
                        </View>
                    ))}
                </View>

                {items.length === 0 ? (
                    <View style={emptyBoxStyle}>
                        <Text style={emptyTitleStyle}>No estimate items yet.</Text>
                        <Text style={emptyTextStyle}>
                            {providerModeContext
                                ? 'No provider estimate draft found.'
                                : 'Add equipment or fixtures to start building an estimate.'}
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
                                        Area: {item.location || item.parent_area || 'Whole Home'}
                                    </Text>
                                    <Text style={itemMetaStyle}>
                                        Property: {shortId(item.property_id)}
                                    </Text>
                                    {!!item.customer_home_name && (
                                        <Text style={itemMetaStyle}>
                                            Customer Home: {item.customer_home_name}
                                        </Text>
                                    )}
                                    <Text style={itemMetaStyle}>
                                        Status: {item.status || 'Missing Information'}
                                    </Text>
                                    <Text style={itemMetaStyle}>
                                        Condition: {item.install_state || 'Unknown'}
                                    </Text>
                                </View>

                                <View style={itemActionStyle}>
                                    <TouchableOpacity
                                        onPress={() => openDraftItem(item)}
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

function StaffOnlyMessage({ message, detail, homeRoute = '/' }: { message: string; detail?: string; homeRoute?: string }) {
    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 700 }}>
                <HomeHeader />

                <View style={emptyBoxStyle}>
                    <Text style={emptyTitleStyle}>{message}</Text>
                    {!!detail && <Text style={emptyTextStyle}>{detail}</Text>}

                    <TouchableOpacity
                        onPress={() => router.replace(homeRoute as any)}
                        style={openButtonStyle}
                    >
                        <Text style={openButtonTextStyle}>Back Home</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}

function firstParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] || null : value || null;
}

function shortId(value?: string | null) {
    if (!value) return 'Unavailable';

    return value.slice(0, 8).toUpperCase();
}

const headerRowStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: 16,
    marginBottom: 24,
};

const providerNavStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end' as const,
    gap: 8,
    maxWidth: 520,
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

const foundationGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 18,
};

const foundationCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    minWidth: 220,
    flex: 1,
};

const foundationTitleStyle = {
    color: '#071B33',
    fontSize: 16,
    fontWeight: '900' as const,
    marginBottom: 6,
};

const foundationTextStyle = {
    color: '#637083',
    fontSize: 14,
    lineHeight: 20,
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
