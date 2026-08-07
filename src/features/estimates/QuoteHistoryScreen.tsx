import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { BUILD_DISPLAY } from '../../lib/appVersion';
import {
    canUseCompanyEstimateWorkflow,
    loadCurrentCompanyEstimateAccess,
} from '../../lib/companyPermissions';
import {
    formatEstimateQuoteHistoryStatus,
    isEstimateQuoteSelected,
    loadCompanyEstimateQuoteHistory,
    type CompanyEstimateQuoteHistory,
} from '../../lib/estimateQuoteHistory';
import type { PersistableEstimateChoice } from '../../lib/estimateOptionPersistence';

export default function QuoteHistoryScreen() {
    const params = useLocalSearchParams<{
        estimateSessionId?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
    }>();
    const estimateSessionId = firstParam(params.estimateSessionId);
    const requestedCompanyId = firstParam(params.companyId);
    const requestedPropertyId = firstParam(params.propertyId);
    const [quote, setQuote] = useState<CompanyEstimateQuoteHistory | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('Loading saved quote...');
    const loadQuoteEvent = useEffectEvent(loadQuote);

    useEffect(() => {
        void loadQuoteEvent();
    }, [estimateSessionId, requestedCompanyId, requestedPropertyId]);

    async function loadQuote() {
        setLoading(true);
        setQuote(null);

        if (!estimateSessionId) {
            setMessage('Choose a customer quote from the quote history first.');
            setLoading(false);
            return;
        }

        const permission = await loadCurrentCompanyEstimateAccess({ companyId: requestedCompanyId || null });

        if (!permission.access || !canUseCompanyEstimateWorkflow(permission.access)) {
            setMessage(permission.error || 'This work account is not authorized to view company quotes.');
            setLoading(false);
            return;
        }

        try {
            const savedQuote = await loadCompanyEstimateQuoteHistory(estimateSessionId);

            if (!savedQuote
                || savedQuote.companyId !== permission.access.companyId
                || (requestedPropertyId && savedQuote.propertyId !== requestedPropertyId)) {
                setMessage('This quote is unavailable for the selected customer home.');
                return;
            }

            setQuote(savedQuote);
            setMessage('Read-only saved quote loaded.');
        } catch (error) {
            setMessage(`Quote could not be loaded: ${readError(error)}`);
        } finally {
            setLoading(false);
        }
    }

    function backToQuotes() {
        if (router.canGoBack()) {
            router.back();
            return;
        }

        router.replace({
            pathname: '/estimate',
            params: compactParams({
                companyId: quote?.companyId || requestedCompanyId,
                propertyId: quote?.propertyId || requestedPropertyId,
            }),
        } as any);
    }

    return (
        <ScrollView style={screenStyle} contentContainerStyle={contentStyle} contentInsetAdjustmentBehavior="automatic">
            <View style={shellStyle}>
                <HomeHeader />

                <View style={topRowStyle}>
                    <TouchableOpacity onPress={backToQuotes} style={secondaryButtonStyle}>
                        <Text style={secondaryButtonTextStyle}>Back to Quotes</Text>
                    </TouchableOpacity>
                </View>

                <View style={heroStyle}>
                    <Text style={eyebrowStyle}>CUSTOMER QUOTE HISTORY</Text>
                    <Text selectable style={titleStyle}>{quote?.quoteNumber || 'Saved quote'}</Text>
                    <Text style={subtitleStyle}>
                        This is a read-only record of the priced options saved for this customer. Viewing it does not change the active job or another technician&apos;s draft.
                    </Text>
                    <Text style={buildStyle}>{BUILD_DISPLAY}</Text>
                </View>

                <View style={messageStyle}>
                    <Text selectable style={messageTextStyle}>{loading ? 'Loading saved quote...' : message}</Text>
                </View>

                {!loading && quote && (
                    <>
                        <QuoteSummary quote={quote} />

                        <View style={sectionHeaderStyle}>
                            <Text style={sectionTitleStyle}>Saved priced options</Text>
                            <Text style={sectionSubtitleStyle}>
                                {quote.options.length > 0
                                    ? `${quote.options.length} exact option snapshot${quote.options.length === 1 ? '' : 's'} from this quote.`
                                    : 'No priced options have been saved to this quote yet.'}
                            </Text>
                        </View>

                        <View style={optionListStyle}>
                            {quote.options.map((option) => (
                                <HistoricalOptionCard
                                    key={option.id}
                                    option={option}
                                    selected={isEstimateQuoteSelected(quote, option.id)}
                                    accepted={Boolean(quote.acceptedAt)}
                                />
                            ))}
                        </View>

                        <View style={snapshotNoticeStyle}>
                            <Text style={snapshotNoticeTitleStyle}>Historical record protected</Text>
                            <Text style={snapshotNoticeTextStyle}>
                                Accepted quote sessions and their option snapshots cannot be reopened or overwritten. Later price-book or draft changes do not rewrite this saved record.
                            </Text>
                        </View>
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function QuoteSummary({ quote }: { quote: CompanyEstimateQuoteHistory }) {
    const status = formatEstimateQuoteHistoryStatus(quote.status, quote.acceptedAt);
    const total = quote.selectedTotal !== null
        ? formatMoney(quote.selectedTotal)
        : quote.options.length > 0
            ? `${formatMoney(Math.min(...quote.options.map((option) => option.pricingResult.totalAmount)))} – ${formatMoney(Math.max(...quote.options.map((option) => option.pricingResult.totalAmount)))}`
            : 'Not priced yet';

    return (
        <View style={summaryCardStyle}>
            <View style={summaryHeadingStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text selectable style={customerNameStyle}>{quote.customerName}</Text>
                    {!!quote.customerAddress && <Text selectable style={customerAddressStyle}>{quote.customerAddress}</Text>}
                </View>
                <Text style={statusBadgeStyle}>{status}</Text>
            </View>

            <View style={factGridStyle}>
                <QuoteFact label="QUOTE NUMBER" value={quote.quoteNumber} />
                <QuoteFact label="TOTAL" value={total} />
                <QuoteFact label="PREPARED BY" value={quote.preparedByName} />
                <QuoteFact label="SAVED" value={formatDateTime(quote.acceptedAt || quote.presentedAt || quote.updatedAt)} />
                {!!quote.requestDisplayCode && <QuoteFact label="CUSTOMER / REQUEST" value={quote.requestDisplayCode} />}
                {!!quote.acceptedCustomerName && <QuoteFact label="ACCEPTED BY" value={quote.acceptedCustomerName} />}
            </View>

            {!!quote.issueSummary && (
                <View style={issueStyle}>
                    <Text style={issueLabelStyle}>CUSTOMER REQUEST</Text>
                    <Text selectable style={issueTextStyle}>{quote.issueSummary}</Text>
                </View>
            )}
        </View>
    );
}

function QuoteFact({ label, value }: { label: string; value: string }) {
    return (
        <View style={factStyle}>
            <Text style={factLabelStyle}>{label}</Text>
            <Text selectable style={factValueStyle}>{value}</Text>
        </View>
    );
}

function HistoricalOptionCard({
    option,
    selected,
    accepted,
}: {
    option: PersistableEstimateChoice;
    selected: boolean;
    accepted: boolean;
}) {
    return (
        <View style={selected ? selectedOptionCardStyle : optionCardStyle}>
            <View style={optionHeadingStyle}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text selectable style={optionTitleStyle}>{option.title}</Text>
                    {!!option.shortSummary && <Text selectable style={optionSummaryStyle}>{option.shortSummary}</Text>}
                </View>
                <Text selectable style={optionTotalStyle}>{formatMoney(option.pricingResult.totalAmount)}</Text>
            </View>

            {selected && (
                <Text style={selectedBadgeStyle}>{accepted ? 'CUSTOMER SELECTED' : 'SELECTED FOR PRESENTATION'}</Text>
            )}

            {!!option.homeownerExplanation && (
                <Text selectable style={optionExplanationStyle}>{option.homeownerExplanation}</Text>
            )}

            {option.keyBenefits.length > 0 && (
                <View style={benefitListStyle}>
                    {option.keyBenefits.map((benefit, index) => (
                        <Text selectable key={`${option.id}-benefit-${index}`} style={benefitStyle}>• {benefit}</Text>
                    ))}
                </View>
            )}

            {option.pricingResult.lineItems.length > 0 && (
                <View style={lineListStyle}>
                    <Text style={lineListTitleStyle}>SAVED PRICE BREAKDOWN</Text>
                    {option.pricingResult.lineItems.map((line, index) => (
                        <View key={`${option.id}-line-${line.id || index}`} style={lineStyle}>
                            <Text selectable style={lineNameStyle}>{line.name} × {line.quantity}</Text>
                            <Text selectable style={lineAmountStyle}>{formatMoney(line.totalAmount)}</Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

function compactParams(values: Record<string, unknown>) {
    return Object.entries(values).reduce<Record<string, string>>((result, [key, value]) => {
        const text = firstParam(value as string | string[] | undefined);
        if (text) result[key] = text;
        return result;
    }, {});
}

function firstParam(value?: string | string[]) {
    return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function formatMoney(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(value);
}

function formatDateTime(value: string | null) {
    if (!value) return 'Not recorded';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function readError(error: unknown) {
    return error instanceof Error ? error.message : 'HomeOS services are unavailable.';
}

const screenStyle = { flex: 1, backgroundColor: '#F3F6FA' } as const;
const contentStyle = { padding: 20, paddingBottom: 56, alignItems: 'center' as const };
const shellStyle = { width: '100%' as const, maxWidth: 920, gap: 18 };
const topRowStyle = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 };
const heroStyle = { borderRadius: 24, backgroundColor: '#08263A', padding: 24, gap: 8 };
const eyebrowStyle = { color: '#67E8F9', fontSize: 13, fontWeight: '900' as const, letterSpacing: 1.1 };
const titleStyle = { color: '#FFFFFF', fontSize: 34, lineHeight: 39, fontWeight: '900' as const };
const subtitleStyle = { color: '#D6E8F1', fontSize: 17, lineHeight: 25, fontWeight: '600' as const };
const buildStyle = { color: '#8FB5C7', fontSize: 12, fontWeight: '700' as const };
const messageStyle = { borderRadius: 16, backgroundColor: '#E7F5FB', borderWidth: 1, borderColor: '#A8D5E5', padding: 14 };
const messageTextStyle = { color: '#244C5E', fontSize: 15, lineHeight: 21, fontWeight: '700' as const };
const summaryCardStyle = { borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C8D7DF', padding: 20, gap: 16 };
const summaryHeadingStyle = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'flex-start' as const, gap: 12 };
const customerNameStyle = { color: '#102A3A', fontSize: 26, lineHeight: 32, fontWeight: '900' as const };
const customerAddressStyle = { color: '#536D7A', fontSize: 15, lineHeight: 21, fontWeight: '600' as const, marginTop: 3 };
const statusBadgeStyle = { color: '#0A604E', backgroundColor: '#DFF7EE', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: '900' as const };
const factGridStyle = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 };
const factStyle = { flexGrow: 1, flexBasis: 180, borderRadius: 14, backgroundColor: '#F3F7F9', borderWidth: 1, borderColor: '#D5E0E5', padding: 13, gap: 4 };
const factLabelStyle = { color: '#68808D', fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.7 };
const factValueStyle = { color: '#163746', fontSize: 16, lineHeight: 21, fontWeight: '800' as const };
const issueStyle = { borderRadius: 14, backgroundColor: '#EEF7FA', padding: 14, gap: 5 };
const issueLabelStyle = { color: '#4A7080', fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.7 };
const issueTextStyle = { color: '#244B5B', fontSize: 15, lineHeight: 22, fontWeight: '700' as const };
const sectionHeaderStyle = { gap: 5, paddingTop: 4 };
const sectionTitleStyle = { color: '#102A3A', fontSize: 25, lineHeight: 31, fontWeight: '900' as const };
const sectionSubtitleStyle = { color: '#58717E', fontSize: 15, lineHeight: 22, fontWeight: '600' as const };
const optionListStyle = { gap: 14 };
const optionCardStyle = { borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD9E1', padding: 18, gap: 12 };
const selectedOptionCardStyle = { ...optionCardStyle, borderWidth: 2, borderColor: '#12A47E', backgroundColor: '#F4FFFB' };
const optionHeadingStyle = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'flex-start' as const, gap: 12 };
const optionTitleStyle = { color: '#102A3A', fontSize: 22, lineHeight: 28, fontWeight: '900' as const };
const optionSummaryStyle = { color: '#526B78', fontSize: 14, lineHeight: 20, fontWeight: '700' as const, marginTop: 3 };
const optionTotalStyle = { color: '#08718A', fontSize: 22, lineHeight: 28, fontWeight: '900' as const };
const selectedBadgeStyle = { alignSelf: 'flex-start' as const, color: '#0B654E', backgroundColor: '#D9F7EC', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.6 };
const optionExplanationStyle = { color: '#294A59', fontSize: 15, lineHeight: 23, fontWeight: '600' as const };
const benefitListStyle = { gap: 5 };
const benefitStyle = { color: '#355866', fontSize: 14, lineHeight: 21, fontWeight: '700' as const };
const lineListStyle = { borderTopWidth: 1, borderTopColor: '#DCE6EA', paddingTop: 12, gap: 8 };
const lineListTitleStyle = { color: '#68808D', fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.7 };
const lineStyle = { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-start' as const, gap: 12 };
const lineNameStyle = { flex: 1, color: '#355766', fontSize: 14, lineHeight: 20, fontWeight: '600' as const };
const lineAmountStyle = { color: '#183C4B', fontSize: 14, lineHeight: 20, fontWeight: '900' as const };
const snapshotNoticeStyle = { borderRadius: 18, backgroundColor: '#FFF8E3', borderWidth: 1, borderColor: '#E6CC79', padding: 17, gap: 6 };
const snapshotNoticeTitleStyle = { color: '#664E06', fontSize: 17, fontWeight: '900' as const };
const snapshotNoticeTextStyle = { color: '#705C21', fontSize: 14, lineHeight: 21, fontWeight: '600' as const };
const secondaryButtonStyle = { minHeight: 48, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#9AB0BC', paddingHorizontal: 18, paddingVertical: 13, justifyContent: 'center' as const, alignItems: 'center' as const };
const secondaryButtonTextStyle = { color: '#163C4E', fontSize: 15, fontWeight: '900' as const };
