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
    EstimateDraftContext,
    loadEstimateDraftContext,
    loadEstimateDraft,
    removeItemFromEstimateDraft,
} from '../../lib/estimateDraft';
import {
    providerModePath,
    readProviderModeParams,
    validateProviderModeAccess,
} from '../../lib/providerMode';
import { getProviderReturnActionLabel } from '../../lib/techosClientAccess';

const estimateFoundationSections = [
    {
        title: 'Findings',
        description: 'No findings added yet.',
    },
    {
        title: 'Recommended Work',
        description: 'Recommended repairs or replacements will be written here before customer review.',
    },
    {
        title: 'Price Book Coming Soon',
        description: 'Pricing is not configured yet. No fake prices are generated.',
    },
];

type EstimateChoice = {
    id: string;
    kind: 'option' | 'bundle';
    name: string;
    description: string;
    items: EstimateDraftItem[];
    systems: string[];
};

export default function EstimateScreen() {
    const { companyId, propertyId, mode, providerMode, returnTo, serviceRequestId, scheduleSlotId, jobId } = useLocalSearchParams<{
        companyId?: string | string[];
        propertyId?: string | string[];
        mode?: string | string[];
        providerMode?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const requestedCompanyId = firstParam(companyId);
    const requestedPropertyId = firstParam(propertyId);
    const requestedMode = firstParam(mode);
    const requestedReturnTo = firstParam(returnTo);
    const providerModeContext = readProviderModeParams({
        providerMode,
        companyId,
        propertyId,
        returnTo,
        serviceRequestId,
        scheduleSlotId,
        jobId,
    });
    const [items, setItems] = useState<EstimateDraftItem[]>([]);
    const [message, setMessage] = useState('Loading estimate draft...');
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [estimateAccess, setEstimateAccess] = useState<CompanyPermissionAccess | null>(null);
    const [draftContext, setDraftContext] = useState<EstimateDraftContext | null>(null);
    const [selectedChoiceId, setSelectedChoiceId] = useState('');

    useEffect(() => {
        void checkAccess();
    }, [requestedCompanyId, requestedPropertyId, providerModeContext?.providerMode]);

    async function checkAccess() {
        setCheckingAccess(true);
        setEstimateAccess(null);
        setDraftContext(null);
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
        const scope = {
            userId: access.userId,
            companyId: access.companyId,
            propertyId: requestedPropertyId,
        };
        const [draftItems, nextDraftContext] = await Promise.all([
            loadEstimateDraft(scope),
            loadEstimateDraftContext(scope),
        ]);

        setItems(draftItems);
        setDraftContext(nextDraftContext);
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
        if (!buildEstimateChoices(nextItems).some((choice) => choice.id === selectedChoiceId)) {
            setSelectedChoiceId('');
        }
        setMessage('Item removed from estimate.');
    }

    function selectChoice(choice: EstimateChoice) {
        setSelectedChoiceId(choice.id);
        setMessage(`${choice.name} selected. Price book pricing is not configured yet.`);
    }

    function viewChoiceDetails(choice: EstimateChoice) {
        setSelectedChoiceId(choice.id);
        setMessage(`${choice.name} includes ${choice.items.map((item) => item.name).join(', ')}.`);
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

    const estimateChoices = buildEstimateChoices(items);
    const optionChoices = estimateChoices.filter((choice) => choice.kind === 'option');
    const bundleChoices = estimateChoices.filter((choice) => choice.kind === 'bundle');
    const selectedChoice = estimateChoices.find((choice) => choice.id === selectedChoiceId) || null;

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
                                <Text style={secondaryButtonTextStyle}>
                                    {getProviderReturnActionLabel(requestedReturnTo) === 'Back to Current Job'
                                        ? 'Back to Current Job'
                                        : 'Back to Item'}
                                </Text>
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

                <View style={sectionStyle}>
                    {renderSectionHeader('Estimate Header', 'Draft builder for selected client HomeOS items.')}
                    <View style={summaryGridStyle}>
                        {renderSummaryCard('Draft Items', String(items.length), 'Selected HomeOS records')}
                        {renderSummaryCard('Options', String(optionChoices.length), 'Auto-built from item order')}
                        {renderSummaryCard('Bundles', String(bundleChoices.length), items.length > 4 ? 'Created after option cap' : 'Starts after 4 items')}
                        {renderSummaryCard('Selected', selectedChoice?.name || 'None', 'No customer approval yet')}
                    </View>
                </View>

                <View style={sectionStyle}>
                    {renderSectionHeader('Customer / Home', 'Provider drafts stay scoped to this company and property.')}
                    <View style={infoGridStyle}>
                        {!!draftContext?.customer_home_name && renderInfoChip('Home', draftContext.customer_home_name)}
                        {renderInfoChip('Company', shortId(estimateAccess.companyId))}
                        {renderInfoChip('Property', shortId(requestedPropertyId))}
                        {renderInfoChip('Context', providerModeContext ? 'Provider Mode' : requestedMode || 'ManagementOS')}
                        {!!draftContext?.service_request_id && renderInfoChip('Request', shortId(draftContext.service_request_id))}
                        {!!draftContext?.job_id && renderInfoChip('Job', shortId(draftContext.job_id))}
                        {!!draftContext?.technician_name && renderInfoChip('Technician', draftContext.technician_name)}
                        {renderInfoChip('Pricing', 'Price book coming soon')}
                    </View>
                    {!!draftContext?.issue_summary && (
                        <Text style={contextSummaryStyle}>
                            {draftContext.issue_summary}
                        </Text>
                    )}
                </View>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                <View style={sectionStyle}>
                    {renderSectionHeader('Estimate Options', 'Options are generated from the current draft item order.')}
                    {estimateChoices.length === 0 ? (
                        <View style={smallEmptyStyle}>
                            <Text style={smallEmptyTextStyle}>Add an item to create Option 1.</Text>
                        </View>
                    ) : (
                        <View style={choiceGridStyle}>
                            {estimateChoices.map((choice) => (
                                <View
                                    key={choice.id}
                                    style={selectedChoiceId === choice.id
                                        ? [choiceCardStyle, selectedChoiceCardStyle]
                                        : choiceCardStyle}
                                >
                                    <View style={choiceTitleRowStyle}>
                                        <Text style={choiceTitleStyle}>{choice.name}</Text>
                                        <Text style={choiceCountStyle}>{choice.items.length} items</Text>
                                    </View>
                                    <Text style={choiceDescriptionStyle}>{choice.description}</Text>
                                    <View style={chipRowStyle}>
                                        {choice.items.slice(0, 4).map((item) => (
                                            <Text key={`${choice.id}-${item.id}`} style={itemChipStyle}>
                                                {item.name}
                                            </Text>
                                        ))}
                                        {choice.items.length > 4 && (
                                            <Text style={itemChipStyle}>+{choice.items.length - 4} more</Text>
                                        )}
                                    </View>
                                    <Text style={systemsTextStyle}>
                                        Systems: {choice.systems.join(', ')}
                                    </Text>
                                    <Text style={pricePlaceholderStyle}>Price book coming soon</Text>
                                    <View style={compactActionRowStyle}>
                                        <TouchableOpacity
                                            onPress={() => selectChoice(choice)}
                                            style={compactPrimaryButtonStyle}
                                        >
                                            <Text style={compactPrimaryButtonTextStyle}>
                                                {choice.kind === 'bundle' ? 'Select Bundle' : 'Select Option'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => viewChoiceDetails(choice)}
                                            style={compactSecondaryButtonStyle}
                                        >
                                            <Text style={compactSecondaryButtonTextStyle}>View Details</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                <View style={sectionStyle}>
                    {renderSectionHeader('Items in Draft', 'Compact item cards stay removable and recalculate options immediately.')}
                    {items.length === 0 ? (
                        <View style={smallEmptyStyle}>
                            <Text style={smallEmptyTitleStyle}>No estimate items yet.</Text>
                            <Text style={smallEmptyTextStyle}>
                                {providerModeContext
                                    ? 'No provider estimate draft found.'
                                    : 'Add equipment or fixtures to start building an estimate.'}
                            </Text>
                        </View>
                    ) : (
                        <View style={draftGridStyle}>
                            {items.map((item) => (
                                <View key={item.id} style={draftItemCardStyle}>
                                    <Text style={itemTitleStyle} numberOfLines={2}>{item.name}</Text>
                                    <Text style={itemMetaStyle} numberOfLines={1}>
                                        {item.system} / {item.category}
                                    </Text>
                                    <Text style={itemMetaStyle} numberOfLines={1}>
                                        {itemLocation(item)}
                                    </Text>
                                    <View style={miniMetaRowStyle}>
                                        <Text style={miniMetaPillStyle}>{item.status || 'Missing Info'}</Text>
                                        <Text style={miniMetaPillStyle}>{item.install_state || 'Unknown'}</Text>
                                    </View>
                                    <View style={compactActionRowStyle}>
                                        <TouchableOpacity
                                            onPress={() => openDraftItem(item)}
                                            style={compactPrimaryButtonStyle}
                                        >
                                            <Text style={compactPrimaryButtonTextStyle}>Open</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => removeItem(item.id)}
                                            style={compactDangerButtonStyle}
                                        >
                                            <Text style={compactDangerButtonTextStyle}>Remove</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                <View style={sectionStyle}>
                    {renderSectionHeader('Findings', 'Field findings will be attached before customer review.')}
                    <View style={foundationGridStyle}>
                        {estimateFoundationSections.map((section) => (
                            <View key={section.title} style={foundationCardStyle}>
                                <Text style={foundationTitleStyle}>{section.title}</Text>
                                <Text style={foundationTextStyle}>{section.description}</Text>
                            </View>
                        ))}
                    </View>
                </View>

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
                        onPress={() => router.replace(homeRoute as never)}
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

function buildEstimateChoices(items: EstimateDraftItem[]): EstimateChoice[] {
    const choices: EstimateChoice[] = [];
    const optionCount = Math.min(items.length, 4);

    for (let index = 0; index < optionCount; index += 1) {
        const optionItems = items.slice(0, index + 1);

        choices.push({
            id: `option-${index + 1}`,
            kind: 'option',
            name: `Option ${index + 1}`,
            description: index === 0
                ? 'Focused starter option from the first selected item.'
                : `Includes the first ${index + 1} selected items.`,
            items: optionItems,
            systems: uniqueSystems(optionItems),
        });
    }

    if (items.length > 4) {
        choices.push({
            id: 'bundle-all',
            kind: 'bundle',
            name: 'Package / Bundle',
            description: 'Includes all selected items after the four-option cap.',
            items,
            systems: uniqueSystems(items),
        });
    }

    return choices;
}

function uniqueSystems(items: EstimateDraftItem[]) {
    const systems = new Set<string>();

    items.forEach((item) => {
        const systemName = item.system.trim();
        systems.add(systemName || 'Unspecified');
    });

    return Array.from(systems);
}

function itemLocation(item: EstimateDraftItem) {
    return item.location || item.parent_area || 'Whole Home';
}

function renderSectionHeader(title: string, description: string) {
    return (
        <View style={sectionHeaderStyle}>
            <Text style={sectionTitleStyle}>{title}</Text>
            <Text style={sectionDescriptionStyle}>{description}</Text>
        </View>
    );
}

function renderSummaryCard(label: string, value: string, description: string) {
    return (
        <View key={label} style={summaryCardStyle}>
            <Text style={summaryLabelStyle}>{label}</Text>
            <Text style={summaryValueStyle} numberOfLines={1}>{value}</Text>
            <Text style={summaryDescriptionStyle}>{description}</Text>
        </View>
    );
}

function renderInfoChip(label: string, value: string) {
    return (
        <View key={label} style={infoChipStyle}>
            <Text style={infoLabelStyle}>{label}</Text>
            <Text style={infoValueStyle} numberOfLines={1}>{value}</Text>
        </View>
    );
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

const sectionStyle = {
    marginBottom: 18,
};

const contextSummaryStyle = {
    color: '#637083',
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 10,
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

const sectionHeaderStyle = {
    marginBottom: 10,
};

const sectionTitleStyle = {
    color: '#071B33',
    fontSize: 20,
    fontWeight: '900' as const,
};

const sectionDescriptionStyle = {
    color: '#637083',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
};

const summaryGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const summaryCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    width: 170,
    minHeight: 112,
};

const summaryLabelStyle = {
    color: '#637083',
    fontSize: 12,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
};

const summaryValueStyle = {
    color: '#071B33',
    fontSize: 24,
    fontWeight: '900' as const,
    marginTop: 8,
};

const summaryDescriptionStyle = {
    color: '#637083',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 5,
};

const infoGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
};

const infoChipStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    flexDirection: 'row' as const,
    gap: 7,
    alignItems: 'center' as const,
};

const infoLabelStyle = {
    color: '#637083',
    fontSize: 12,
    fontWeight: '900' as const,
};

const infoValueStyle = {
    color: '#071B33',
    fontSize: 13,
    fontWeight: '900' as const,
    maxWidth: 220,
};

const choiceGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const choiceCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    width: 260,
    minHeight: 218,
};

const selectedChoiceCardStyle = {
    borderColor: '#1F7A55',
    backgroundColor: '#F5FFF9',
};

const choiceTitleRowStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 8,
};

const choiceTitleStyle = {
    color: '#071B33',
    fontSize: 18,
    fontWeight: '900' as const,
};

const choiceCountStyle = {
    color: '#1F7A55',
    backgroundColor: '#E9F7EF',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: '900' as const,
};

const choiceDescriptionStyle = {
    color: '#637083',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
};

const chipRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 10,
};

const itemChipStyle = {
    color: '#071B33',
    backgroundColor: '#F3F6FA',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: '800' as const,
};

const systemsTextStyle = {
    color: '#637083',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
};

const pricePlaceholderStyle = {
    color: '#A05A00',
    backgroundColor: '#FFF5E6',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: '900' as const,
    marginTop: 10,
    alignSelf: 'flex-start' as const,
};

const compactActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const compactPrimaryButtonStyle = {
    backgroundColor: '#071B33',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    alignItems: 'center' as const,
};

const compactPrimaryButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900' as const,
};

const compactSecondaryButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: '#D8E0EA',
};

const compactSecondaryButtonTextStyle = {
    color: '#071B33',
    fontSize: 12,
    fontWeight: '900' as const,
};

const compactDangerButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: '#F1B8B8',
};

const compactDangerButtonTextStyle = {
    color: '#B00020',
    fontSize: 12,
    fontWeight: '900' as const,
};

const smallEmptyStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    alignSelf: 'flex-start' as const,
    maxWidth: 360,
};

const smallEmptyTitleStyle = {
    color: '#071B33',
    fontSize: 16,
    fontWeight: '900' as const,
    marginBottom: 5,
};

const smallEmptyTextStyle = {
    color: '#637083',
    fontSize: 14,
    lineHeight: 20,
};

const draftGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const draftItemCardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    width: 180,
    minHeight: 190,
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
    width: 230,
    minHeight: 128,
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

const itemTitleStyle = {
    color: '#071B33',
    fontSize: 18,
    fontWeight: '900' as const,
};

const itemMetaStyle = {
    color: '#637083',
    fontSize: 12,
    marginTop: 5,
};

const miniMetaRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 9,
};

const miniMetaPillStyle = {
    color: '#637083',
    backgroundColor: '#F3F6FA',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 7,
    fontSize: 11,
    fontWeight: '800' as const,
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
