import {
    CATALOG_SOURCE_PREVIEW_COUNT,
    CATALOG_SPECIFICATION_PREVIEW_COUNT,
    catalogFieldLabel,
    catalogFieldValue,
    catalogPreviewItems,
    catalogSourceDisplayName,
    catalogSpecificationDisplays,
} from './catalogFactoryPresentation';

runCatalogFactoryPresentationRegressions();

export function runCatalogFactoryPresentationRegressions() {
    specificationsAreReadableInsteadOfRawJson();
    longSectionsStayCollapsedUntilRequested();
    sourceUrlsUseCompactHumanLabels();
}

function specificationsAreReadableInsteadOfRawJson() {
    const displays = catalogSpecificationDisplays({
        showerhead_flow_rate: '1.75 gpm',
        ada_compliant: true,
        ignored: '',
    });

    assert(displays.length === 2, 'Blank specification values should not occupy review-card space.');
    assert(displays[0].label === 'Showerhead Flow Rate', 'Specification keys should render as readable labels.');
    assert(displays[1].label === 'ADA Compliant', 'Known catalog abbreviations should stay uppercase.');
    assert(displays[1].value === 'Yes', 'Boolean specification values should be human-readable.');
    assert(catalogFieldValue({ min_psi: 20, max_psi: 80 }) === 'Min PSI: 20 · Max PSI: 80', 'Nested values should stay structured without a JSON dump.');
}

function longSectionsStayCollapsedUntilRequested() {
    const specifications = Array.from({ length: 10 }, (_, index) => index);
    const sources = Array.from({ length: 8 }, (_, index) => index);

    assert(catalogPreviewItems(specifications, false, CATALOG_SPECIFICATION_PREVIEW_COUNT).length === 4, 'Specifications should use the compact preview size.');
    assert(catalogPreviewItems(sources, false, CATALOG_SOURCE_PREVIEW_COUNT).length === 3, 'Sources should use the compact preview size.');
    assert(catalogPreviewItems(sources, true, CATALOG_SOURCE_PREVIEW_COUNT).length === 8, 'Expanded sections should reveal every record.');
}

function sourceUrlsUseCompactHumanLabels() {
    assert(
        catalogSourceDisplayName('Installation manual', 'https://assets.example.com/manual.pdf') === 'Installation manual',
        'Deliberate source titles should be preserved.'
    );
    assert(
        catalogSourceDisplayName('', 'https://www.example.com/products/fixture') === 'example.com/products/fixture',
        'Untitled URLs should render as compact host and path labels.'
    );
    assert(catalogFieldLabel('installation_manual') === 'Installation Manual', 'Source types should use the same readable labels.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
