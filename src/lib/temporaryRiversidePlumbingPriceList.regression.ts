import { plumbingPriceBookCatalogItems } from './plumbingPriceBookCatalog';
import {
    buildTemporaryRiversidePlumbingPriceListTsv,
    getTemporaryRiversidePlumbingPrice,
    temporaryRiversidePlumbingPrices,
} from './temporaryRiversidePlumbingPriceList';

runTemporaryRiversidePlumbingPriceListRegressions();

export function runTemporaryRiversidePlumbingPriceListRegressions() {
    everyCatalogCardHasAPlanningRecommendation();
    planningRecommendationsStayWithinGuardrails();
    guidedEstimateScopesHaveDedicatedCardsAndPrices();
    tubShowerValvePriceStaysTwoHundredAboveShowerOnly();
    exportContainsEveryReviewedCatalogRow();
}

function everyCatalogCardHasAPlanningRecommendation() {
    const recommendationKeys = new Set(
        temporaryRiversidePlumbingPrices.map((entry) => entry.priceKey)
    );

    assert(
        recommendationKeys.size === temporaryRiversidePlumbingPrices.length,
        'Starter planning recommendations must not contain duplicate price keys.'
    );
    assert(
        temporaryRiversidePlumbingPrices.length === plumbingPriceBookCatalogItems.length,
        'Every plumbing catalog card should have exactly one starter planning recommendation.'
    );

    plumbingPriceBookCatalogItems.forEach((catalogItem) => {
        assert(
            recommendationKeys.has(catalogItem.price_key),
            `Missing starter planning recommendation for ${catalogItem.price_key}.`
        );
    });
}

function planningRecommendationsStayWithinGuardrails() {
    temporaryRiversidePlumbingPrices.forEach((entry) => {
        assert(entry.marketLow > 0, `${entry.priceKey} market low must be positive.`);
        assert(entry.recommendedPrice > 0, `${entry.priceKey} recommendation must be positive.`);
        assert(entry.recommendedPrice >= entry.marketLow, `${entry.priceKey} recommendation must not be below its low range.`);
        assert(entry.marketHigh >= entry.recommendedPrice, `${entry.priceKey} high range must not be below its recommendation.`);
        assert(entry.materialCost >= 0, `${entry.priceKey} material cost must be nonnegative.`);
        assert(entry.laborHours >= 0, `${entry.priceKey} labor hours must be nonnegative.`);
    });
}

function guidedEstimateScopesHaveDedicatedCardsAndPrices() {
    const requiredKeys = [
        'water_service_whole_home_domestic_water_riser_replacement_linear_foot',
        'water_service_whole_home_main_water_service_replacement_package',
        'drain_sewer_whole_home_sewer_line_replacement_linear_foot',
        'drain_sewer_exterior_main_line_hydro_jetting',
        'water_service_bathroom_shower_valve_replacement',
        'faucet-reinstall-existing',
        'faucet-install-company-approved',
    ];

    requiredKeys.forEach((priceKey) => {
        const recommendation = getTemporaryRiversidePlumbingPrice(priceKey);

        assert(recommendation, `Expected a dedicated price-book card for ${priceKey}.`);
        assert(recommendation.recommendedPrice > 0, `${priceKey} should have a positive planning recommendation.`);
    });
}

function tubShowerValvePriceStaysTwoHundredAboveShowerOnly() {
    const showerOnly = getTemporaryRiversidePlumbingPrice('water_service_bathroom_shower_valve_replacement');
    const tubShower = getTemporaryRiversidePlumbingPrice('water_service_bathroom_tub_shower_valve_replacement');
    const tubSpout = getTemporaryRiversidePlumbingPrice('water_service_bathroom_tub_spout_replacement');

    assert(showerOnly?.recommendedPrice === 1195, 'Shower-only valve replacement should remain $1,195.');
    assert(tubShower?.recommendedPrice === 1195, 'The tub-and-shower valve itself should remain $1,195.');
    assert(tubSpout?.recommendedPrice === 200, 'A selected tub-spout replacement should add $200.');
    assert(
        tubShower.recommendedPrice + tubSpout.recommendedPrice - showerOnly.recommendedPrice === 200,
        'Tub-and-shower valve plus a selected tub spout should stay $200 above shower-only pricing.'
    );
}

function exportContainsEveryReviewedCatalogRow() {
    const exportedRows = buildTemporaryRiversidePlumbingPriceListTsv().trim().split('\n');

    assert(
        exportedRows.length === temporaryRiversidePlumbingPrices.length + 1,
        'Starter price-sheet export should contain one header plus one row per catalog card.'
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
