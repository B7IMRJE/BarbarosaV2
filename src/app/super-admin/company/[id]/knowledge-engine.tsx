import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';
import {
    getKnowledgeObjectByPriceKey,
    getKnowledgeObjects,
    searchKnowledgeObjects,
    type BravoKnowledgeConfidenceLevel,
    type BravoKnowledgeObject,
    type BravoKnowledgeStatus,
} from '../../../../lib/bravoKnowledgeEngine';

type KnowledgeModuleId =
    | 'water-heaters'
    | 'toilets'
    | 'kitchen'
    | 'bathroom'
    | 'drain-sewer'
    | 'gas'
    | 'water-quality'
    | 'diagnostics'
    | 'emergency';

type KnowledgeModule = {
    id: KnowledgeModuleId;
    label: string;
    enabled: boolean;
};

type StatusFilter = 'all' | BravoKnowledgeStatus;
type ConfidenceFilter = 'all' | BravoKnowledgeConfidenceLevel;
type DetailSectionKey = 'identity' | 'navigation' | 'pricing' | 'estimate' | 'technician' | 'homeowner' | 'ai' | 'training' | 'reporting';

const knowledgeModules: KnowledgeModule[] = [
    { id: 'water-heaters', label: 'Water Heaters', enabled: true },
    { id: 'toilets', label: 'Toilets', enabled: false },
    { id: 'kitchen', label: 'Kitchen', enabled: false },
    { id: 'bathroom', label: 'Bathroom', enabled: false },
    { id: 'drain-sewer', label: 'Drain / Sewer', enabled: false },
    { id: 'gas', label: 'Gas', enabled: false },
    { id: 'water-quality', label: 'Water Quality', enabled: false },
    { id: 'diagnostics', label: 'Diagnostics', enabled: false },
    { id: 'emergency', label: 'Emergency', enabled: false },
];

const statusFilters: StatusFilter[] = ['all', 'draft', 'testing', 'approved', 'deprecated', 'archived'];
const confidenceFilters: ConfidenceFilter[] = ['all', 1, 2, 3, 4, 5];

const defaultOpenSections: Record<DetailSectionKey, boolean> = {
    identity: true,
    navigation: true,
    pricing: true,
    estimate: false,
    technician: false,
    homeowner: false,
    ai: false,
    training: false,
    reporting: false,
};

export default function KnowledgeEngineScreen() {
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const companyId = normalizeRouteParam(id);
    const companyRoute = `/super-admin/company/${encodeURIComponent(companyId)}`;
    const [selectedModuleId, setSelectedModuleId] = useState<KnowledgeModuleId>('water-heaters');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
    const [selectedPriceKey, setSelectedPriceKey] = useState<string | null>(null);
    const [openSections, setOpenSections] = useState<Record<DetailSectionKey, boolean>>(defaultOpenSections);

    const selectedModule = knowledgeModules.find((module) => module.id === selectedModuleId) || knowledgeModules[0];
    const moduleObjects = useMemo(() => getObjectsForModule(selectedModuleId), [selectedModuleId]);
    const visibleObjects = useMemo(() => {
        const searchResults = searchQuery.trim() ? searchKnowledgeObjects(searchQuery) : getKnowledgeObjects();
        const searchKeys = new Set(searchResults.map((object) => object.price_key));

        return moduleObjects
            .filter((object) => searchKeys.has(object.price_key))
            .filter((object) => statusFilter === 'all' || object.status === statusFilter)
            .filter((object) => confidenceFilter === 'all' || object.confidence_level === confidenceFilter)
            .sort((first, second) => first.service_name.localeCompare(second.service_name));
    }, [confidenceFilter, moduleObjects, searchQuery, statusFilter]);

    const selectedObject = selectedPriceKey ? getKnowledgeObjectByPriceKey(selectedPriceKey) : null;

    function selectModule(moduleId: KnowledgeModuleId) {
        setSelectedModuleId(moduleId);
        setSelectedPriceKey(null);
        setOpenSections(defaultOpenSections);
    }

    function openDetail(object: BravoKnowledgeObject) {
        setSelectedPriceKey(object.price_key);
        setOpenSections(defaultOpenSections);
    }

    function backToKnowledgeEngine() {
        setSelectedPriceKey(null);
        setSelectedModuleId('water-heaters');
        setSearchQuery('');
        setStatusFilter('all');
        setConfidenceFilter('all');
        setOpenSections(defaultOpenSections);
    }

    function toggleSection(section: DetailSectionKey) {
        setOpenSections((current) => ({
            ...current,
            [section]: !current[section],
        }));
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 42, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1180, minWidth: 0 }}>
                <AdminNavBar companyId={companyId} backFallback={companyRoute as never} />

                <Text style={eyebrowStyle}>ManagementOS / Bravo Knowledge Engine</Text>
                <Text style={titleStyle}>Knowledge Engine</Text>
                <Text style={subtitleStyle}>
                    Read-only review of BKE objects before they connect to Price Book, Estimate Builder, TechOS, HomeOS, and AI.
                </Text>

                {selectedObject ? (
                    <KnowledgeObjectDetail
                        object={selectedObject}
                        openSections={openSections}
                        onToggleSection={toggleSection}
                        onBackToModule={() => setSelectedPriceKey(null)}
                        onBackToKnowledgeEngine={backToKnowledgeEngine}
                        onCompanyDashboard={() => router.push(companyRoute as never)}
                    />
                ) : (
                    <>
                        <View style={summaryGridStyle}>
                            <SummaryCard label="Module" value={selectedModule.label} />
                            <SummaryCard label="Objects" value={String(moduleObjects.length)} />
                            <SummaryCard label="Visible" value={String(visibleObjects.length)} />
                            <SummaryCard label="Mode" value="Read-only" />
                        </View>

                        <View style={panelStyle}>
                            <View style={panelHeaderStyle}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={sectionTitleStyle}>Module Selector</Text>
                                    <Text style={bodyTextStyle}>Water Heaters is live. Other modules are placeholders for future BKE work.</Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => router.push(companyRoute as never)}
                                    activeOpacity={0.82}
                                    style={secondaryButtonStyle}
                                >
                                    <Text style={secondaryButtonTextStyle}>Company Dashboard</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={moduleRowStyle}>
                                {knowledgeModules.map((module) => (
                                    <FilterChip
                                        key={module.id}
                                        label={module.enabled ? module.label : `${module.label} · future`}
                                        active={module.id === selectedModuleId}
                                        onPress={() => selectModule(module.id)}
                                    />
                                ))}
                            </View>

                            <View style={controlGridStyle}>
                                <View style={fieldWrapStyle}>
                                    <Text style={fieldLabelStyle}>Search</Text>
                                    <TextInput
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                        placeholder="Search service, price key, equipment, notes..."
                                        placeholderTextColor={colors.mutedText}
                                        style={searchInputStyle}
                                    />
                                </View>

                                <View style={fieldWrapStyle}>
                                    <Text style={fieldLabelStyle}>Status Filter</Text>
                                    <View style={chipRowStyle}>
                                        {statusFilters.map((status) => (
                                            <FilterChip
                                                key={status}
                                                label={status === 'all' ? 'All' : formatFilterLabel(status)}
                                                active={statusFilter === status}
                                                onPress={() => setStatusFilter(status)}
                                            />
                                        ))}
                                    </View>
                                </View>

                                <View style={fieldWrapStyle}>
                                    <Text style={fieldLabelStyle}>Confidence Filter</Text>
                                    <View style={chipRowStyle}>
                                        {confidenceFilters.map((confidence) => (
                                            <FilterChip
                                                key={String(confidence)}
                                                label={confidence === 'all' ? 'All' : String(confidence)}
                                                active={confidenceFilter === confidence}
                                                onPress={() => setConfidenceFilter(confidence)}
                                            />
                                        ))}
                                    </View>
                                </View>
                            </View>
                        </View>

                        <View style={panelStyle}>
                            <Text style={sectionTitleStyle}>{selectedModule.label}</Text>
                            <Text style={bodyTextStyle}>
                                {selectedModule.enabled
                                    ? `${visibleObjects.length} of ${moduleObjects.length} objects shown.`
                                    : 'No BKE objects are assigned to this future module yet.'}
                            </Text>

                            {visibleObjects.length ? (
                                <View style={objectGridStyle}>
                                    {visibleObjects.map((object) => (
                                        <KnowledgeObjectCard key={object.price_key} object={object} onPress={() => openDetail(object)} />
                                    ))}
                                </View>
                            ) : (
                                <View style={emptyStateStyle}>
                                    <Text style={emptyTitleStyle}>No knowledge objects found.</Text>
                                    <Text style={bodyTextStyle}>Adjust filters or choose Water Heaters to review the current BKE module.</Text>
                                </View>
                            )}
                        </View>
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function KnowledgeObjectCard({ object, onPress }: { object: BravoKnowledgeObject; onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.84} style={objectCardStyle}>
            <Text numberOfLines={2} style={objectTitleStyle}>
                {object.service_name}
            </Text>
            <Text numberOfLines={2} style={priceKeyStyle}>
                {object.price_key}
            </Text>
            <View style={chipRowStyle}>
                <ReadOnlyChip label={formatFilterLabel(object.status)} />
                <ReadOnlyChip label={`Confidence ${object.confidence_level}`} />
            </View>
            <View style={miniGridStyle}>
                <MiniValue label="Equipment" value={object.equipment} />
                <MiniValue label="Category" value={object.category} />
                <MiniValue label="Service Type" value={object.service_type} />
            </View>
        </TouchableOpacity>
    );
}

function KnowledgeObjectDetail({
    object,
    openSections,
    onToggleSection,
    onBackToModule,
    onBackToKnowledgeEngine,
    onCompanyDashboard,
}: {
    object: BravoKnowledgeObject;
    openSections: Record<DetailSectionKey, boolean>;
    onToggleSection: (section: DetailSectionKey) => void;
    onBackToModule: () => void;
    onBackToKnowledgeEngine: () => void;
    onCompanyDashboard: () => void;
}) {
    const pricingRows = getPricingRows(object);
    const hasPricing = pricingRows.some((row) => row.value !== null);

    return (
        <>
            <View style={detailHeaderStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={eyebrowStyle}>Knowledge Object Detail</Text>
                    <Text style={detailTitleStyle}>{object.service_name}</Text>
                    <Text style={priceKeyStyle}>{object.price_key}</Text>
                </View>
                <View style={actionRowStyle}>
                    <TouchableOpacity onPress={onBackToModule} activeOpacity={0.82} style={secondaryButtonStyle}>
                        <Text style={secondaryButtonTextStyle}>Back to Module</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onBackToKnowledgeEngine} activeOpacity={0.82} style={secondaryButtonStyle}>
                        <Text style={secondaryButtonTextStyle}>Back to Knowledge Engine</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onCompanyDashboard} activeOpacity={0.82} style={primaryButtonStyle}>
                        <Text style={primaryButtonTextStyle}>Company Dashboard</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <DetailSection title="Identity" open={openSections.identity} onToggle={() => onToggleSection('identity')}>
                <DetailGrid
                    rows={[
                        ['Service ID', object.service_id],
                        ['Price Key', object.price_key],
                        ['Version', object.version],
                        ['Status', formatFilterLabel(object.status)],
                        ['Confidence', String(object.confidence_level)],
                        ['Active', object.active ? 'Yes' : 'No'],
                    ]}
                />
            </DetailSection>

            <DetailSection title="Navigation" open={openSections.navigation} onToggle={() => onToggleSection('navigation')}>
                <DetailGrid
                    rows={[
                        ['System', object.system],
                        ['Area', object.area],
                        ['Equipment', object.equipment],
                        ['Category', object.category],
                        ['Service Type', object.service_type],
                        ['Unit', object.unit],
                    ]}
                />
            </DetailSection>

            <DetailSection title="Pricing" open={openSections.pricing} onToggle={() => onToggleSection('pricing')}>
                {!hasPricing && <Text style={pricingEmptyStyle}>No pricing assigned yet</Text>}
                <DetailGrid rows={pricingRows.map((row) => [row.label, formatPricingValue(row.value)])} />
            </DetailSection>

            <DetailSection title="Estimate" open={openSections.estimate} onToggle={() => onToggleSection('estimate')}>
                <TextBlock label="Customer Description" value={object.customer_description} />
                <TextBlock label="Internal Description" value={object.internal_description} />
                <TextBlock label="Estimate Title" value={object.estimate_template.title} />
                <TextBlock label="Scope Summary" value={object.estimate_template.scope_summary} />
                <ListBlock label="Default Line Items" items={object.estimate_template.default_line_items} />
                <ListBlock label="Customer Notes" items={object.estimate_template.customer_notes} />
                <ListBlock label="What's Included" items={object.whats_included} />
                <ListBlock label="What's Not Included" items={object.whats_not_included} />
                <ListBlock label="Common Add-ons" items={object.common_add_ons} />
                <ListBlock label="Recommended Upgrades" items={object.recommended_upgrades} />
            </DetailSection>

            <DetailSection title="Technician" open={openSections.technician} onToggle={() => onToggleSection('technician')}>
                <ListBlock label="Required Photos" items={object.required_photos} />
                <ListBlock label="Required Measurements" items={object.required_measurements} />
                <ListBlock label="Required Tests" items={object.required_tests} />
                <ListBlock label="Required Documents" items={object.required_documents} />
                <ListBlock label="Code Notes" items={object.code_notes} />
                <ListBlock label="Safety Notes" items={object.safety_notes} />
                <ListBlock label="Recommended Tools" items={object.recommended_tools} />
                <TextBlock label="Permit Required" value={object.permit_required ? 'Yes' : 'No'} />
            </DetailSection>

            <DetailSection title="Homeowner" open={openSections.homeowner} onToggle={() => onToggleSection('homeowner')}>
                <TextBlock label="Customer Description" value={object.customer_description} />
                <TextBlock label="Warranty" value={object.warranty} />
                <ListBlock label="What's Included" items={object.whats_included} />
                <ListBlock label="What's Not Included" items={object.whats_not_included} />
                <ListBlock label="Recommended Upgrades" items={object.recommended_upgrades} />
            </DetailSection>

            <DetailSection title="AI" open={openSections.ai} onToggle={() => onToggleSection('ai')}>
                <TextBlock label="AI Context" value={object.ai_context} />
                <ListBlock label="Related Services" items={object.related_services} />
            </DetailSection>

            <DetailSection title="Training" open={openSections.training} onToggle={() => onToggleSection('training')}>
                <ListBlock label="Training Notes" items={object.training_notes} />
            </DetailSection>

            <DetailSection title="Reporting" open={openSections.reporting} onToggle={() => onToggleSection('reporting')}>
                <ListBlock label="Reporting Tags" items={object.reporting_tags} />
            </DetailSection>
        </>
    );
}

function DetailSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
    return (
        <View style={detailSectionStyle}>
            <TouchableOpacity onPress={onToggle} activeOpacity={0.82} style={detailSectionHeaderStyle}>
                <Text style={sectionTitleStyle}>{title}</Text>
                <Text style={sectionToggleStyle}>{open ? 'Collapse' : 'Expand'}</Text>
            </TouchableOpacity>
            {open && <View style={detailSectionBodyStyle}>{children}</View>}
        </View>
    );
}

function DetailGrid({ rows }: { rows: Array<[string, string]> }) {
    return (
        <View style={detailGridStyle}>
            {rows.map(([label, value]) => (
                <MiniValue key={label} label={label} value={value} />
            ))}
        </View>
    );
}

function TextBlock({ label, value }: { label: string; value: string }) {
    return (
        <View style={textBlockStyle}>
            <Text style={fieldLabelStyle}>{label}</Text>
            <Text style={bodyTextStyle}>{value || 'Not provided'}</Text>
        </View>
    );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
    return (
        <View style={textBlockStyle}>
            <Text style={fieldLabelStyle}>{label}</Text>
            {items.length ? (
                <View style={listWrapStyle}>
                    {items.map((item) => (
                        <Text key={item} style={listItemStyle}>
                            {item}
                        </Text>
                    ))}
                </View>
            ) : (
                <Text style={bodyTextStyle}>Not provided</Text>
            )}
        </View>
    );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
    return (
        <View style={summaryCardStyle}>
            <Text style={summaryLabelStyle}>{label}</Text>
            <Text numberOfLines={1} style={summaryValueStyle}>
                {value}
            </Text>
        </View>
    );
}

function MiniValue({ label, value }: { label: string; value: string }) {
    return (
        <View style={miniValueStyle}>
            <Text style={miniLabelStyle}>{label}</Text>
            <Text numberOfLines={2} style={miniValueTextStyle}>
                {value || 'Not provided'}
            </Text>
        </View>
    );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={[filterChipStyle, active ? activeChipStyle : null]}>
            <Text style={[filterChipTextStyle, active ? activeChipTextStyle : null]}>{label}</Text>
        </TouchableOpacity>
    );
}

function ReadOnlyChip({ label }: { label: string }) {
    return (
        <View style={readOnlyChipStyle}>
            <Text style={readOnlyChipTextStyle}>{label}</Text>
        </View>
    );
}

function getObjectsForModule(moduleId: KnowledgeModuleId): BravoKnowledgeObject[] {
    if (moduleId !== 'water-heaters') return [];

    return getKnowledgeObjects();
}

function getPricingRows(object: BravoKnowledgeObject) {
    return [
        { label: 'Base Price', value: object.base_price },
        { label: 'Labor Hours', value: object.labor_hours },
        { label: 'Material Cost', value: object.material_cost },
        { label: 'Linear Foot Price', value: object.linear_foot_price },
        { label: 'Minimum Price', value: object.minimum_price },
        { label: 'Maximum Discount Percent', value: object.maximum_discount_percent },
        { label: 'Package Discount Percent', value: object.package_discount_percent },
    ];
}

function formatPricingValue(value: number | null) {
    if (value === null) return 'Not assigned';

    return String(value);
}

function normalizeRouteParam(value: string | string[] | undefined) {
    const firstValue = Array.isArray(value) ? value[0] : value;

    return String(firstValue || '').trim();
}

function formatFilterLabel(value: string) {
    return value
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
        .join(' ');
}

const colors = {
    background: '#F3F6FA',
    card: '#FFFFFF',
    text: '#071B33',
    mutedText: '#64748B',
    border: '#DFE7F1',
    surface: '#F8FAFC',
    accent: '#0B5FFF',
    accentSoft: '#EEF4FF',
    success: '#047857',
};

const eyebrowStyle = {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '900' as const,
    letterSpacing: 0,
    textTransform: 'uppercase' as const,
};

const titleStyle = {
    color: colors.text,
    fontSize: 32,
    fontWeight: '900' as const,
    marginTop: 6,
};

const subtitleStyle = {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '700' as const,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 20,
    maxWidth: 760,
};

const summaryGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 16,
};

const summaryCardStyle = {
    minWidth: 160,
    flexGrow: 1,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
};

const summaryLabelStyle = {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const summaryValueStyle = {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900' as const,
    marginTop: 4,
};

const panelStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
};

const panelHeaderStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    marginBottom: 14,
};

const sectionTitleStyle = {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900' as const,
};

const bodyTextStyle = {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700' as const,
    lineHeight: 20,
    marginTop: 6,
};

const moduleRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 16,
};

const controlGridStyle = {
    gap: 12,
};

const fieldWrapStyle = {
    gap: 8,
};

const fieldLabelStyle = {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const searchInputStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
    paddingHorizontal: 12,
    paddingVertical: 11,
};

const chipRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 7,
};

const filterChipStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
};

const activeChipStyle = {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
};

const filterChipTextStyle = {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '900' as const,
};

const activeChipTextStyle = {
    color: '#FFFFFF',
};

const objectGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 14,
};

const objectCardStyle = {
    width: '31%' as const,
    minWidth: 260,
    flexGrow: 1,
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 10,
};

const objectTitleStyle = {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900' as const,
    lineHeight: 21,
};

const priceKeyStyle = {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: '800' as const,
    lineHeight: 16,
};

const readOnlyChipStyle = {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
};

const readOnlyChipTextStyle = {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900' as const,
};

const miniGridStyle = {
    gap: 8,
};

const miniValueStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
};

const miniLabelStyle = {
    color: colors.mutedText,
    fontSize: 10,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const miniValueTextStyle = {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900' as const,
    lineHeight: 17,
    marginTop: 3,
};

const emptyStateStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 18,
    marginTop: 14,
};

const emptyTitleStyle = {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900' as const,
};

const detailHeaderStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 14,
};

const detailTitleStyle = {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900' as const,
    marginTop: 5,
};

const actionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    justifyContent: 'flex-end' as const,
};

const primaryButtonStyle = {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const primaryButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900' as const,
};

const secondaryButtonStyle = {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const secondaryButtonTextStyle = {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900' as const,
};

const detailSectionStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden' as const,
};

const detailSectionHeaderStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    padding: 14,
};

const sectionToggleStyle = {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900' as const,
};

const detailSectionBodyStyle = {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: 14,
    gap: 12,
};

const detailGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const pricingEmptyStyle = {
    color: colors.success,
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontWeight: '900' as const,
};

const textBlockStyle = {
    gap: 6,
};

const listWrapStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 7,
};

const listItemStyle = {
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    fontWeight: '800' as const,
};
