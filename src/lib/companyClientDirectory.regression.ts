import {
    COMPANY_CLIENT_PAGE_SIZE,
    buildCompanyClientDirectory,
    buildCompanyClientShelves,
    filterCompanyClientDirectory,
    filterPendingCustomerInvites,
    formatCompanyClientTenure,
    paginateCompanyClientDirectory,
    type CompanyClientDirectorySource,
} from './companyClientDirectory';

runCompanyClientDirectoryRegressions();

export function runCompanyClientDirectoryRegressions() {
    customerNumbersFollowJoinOrder();
    tenureProgressesFromDaysToMonthsToYears();
    searchMatchesNameAddressAndCustomerNumber();
    acceptedInvitesDoNotRemainPending();
    smallDirectoriesRenderWithoutShelves();
    largerDirectoriesUseAlphabetShelves();
    veryLargeDirectoriesUseSingleLetterShelves();
    shelfResultsStayLimitedToTwentyPerPage();
}

function customerNumbersFollowJoinOrder() {
    const entries = buildCompanyClientDirectory([
        customer('newer', '2026-07-10T12:00:00.000Z'),
        customer('older', '2026-06-10T12:00:00.000Z'),
    ], new Date('2026-07-22T12:00:00.000Z'));

    assert(entries[0]?.id === 'older', 'Oldest connected customer should appear first.');
    assert(entries[0]?.customerNumber === 1, 'Oldest connected customer should be Customer 1.');
    assert(entries[1]?.customerNumber === 2, 'Next connected customer should receive the next number.');
}

function tenureProgressesFromDaysToMonthsToYears() {
    const now = new Date('2026-07-22T12:00:00.000Z');

    assert(formatCompanyClientTenure('2026-07-21T12:00:00.000Z', now) === '1 day', 'One day should use a day label.');
    assert(formatCompanyClientTenure('2026-05-22T12:00:00.000Z', now) === '2 months', 'Sixty-one days should use a month label.');
    assert(formatCompanyClientTenure('2024-07-22T12:00:00.000Z', now) === '2 years', 'Two years should use a year label.');
}

function searchMatchesNameAddressAndCustomerNumber() {
    const entries = buildCompanyClientDirectory([
        {
            ...customer('amparito', '2026-07-01T12:00:00.000Z'),
            displayName: 'Amparito Trivino',
            address: '5526 Wayman St',
        },
    ]);

    assert(filterCompanyClientDirectory(entries, 'amparito').length === 1, 'Search should match customer name.');
    assert(filterCompanyClientDirectory(entries, 'wayman').length === 1, 'Search should match customer address.');
    assert(filterCompanyClientDirectory(entries, 'customer 1').length === 1, 'Search should match customer number.');
    assert(filterCompanyClientDirectory(entries, '#1').length === 1, 'Search should match displayed customer number.');
}

function acceptedInvitesDoNotRemainPending() {
    const pending = filterPendingCustomerInvites([
        { status: 'accepted', id: 'accepted' },
        { status: 'pending', id: 'pending' },
        { status: 'revoked', id: 'revoked' },
    ]);

    assert(pending.length === 1, 'Only unresolved pending invitations should appear.');
    assert(pending[0]?.id === 'pending', 'Accepted customer invitations should leave the pending list.');
}

function smallDirectoriesRenderWithoutShelves() {
    const entries = buildCompanyClientDirectory(createCustomers(20));

    assert(buildCompanyClientShelves(entries).length === 0, 'Twenty or fewer customers should render directly as cards.');
}

function largerDirectoriesUseAlphabetShelves() {
    const entries = buildCompanyClientDirectory(createCustomers(80));
    const shelves = buildCompanyClientShelves(entries);

    assert(shelves.length > 0, 'More than twenty customers should use directory shelves.');
    assert(shelves.every((shelf) => shelf.label.includes('-')), 'Medium directories should combine neighboring letters.');
}

function veryLargeDirectoriesUseSingleLetterShelves() {
    const entries = buildCompanyClientDirectory(createCustomers(1000));
    const shelves = buildCompanyClientShelves(entries);

    assert(shelves.length === 26, 'A thousand-customer directory should expose A through Z shelves.');
    assert(shelves.every((shelf) => shelf.label.length === 1), 'Large directory shelves should use one letter each.');
}

function shelfResultsStayLimitedToTwentyPerPage() {
    const page = paginateCompanyClientDirectory(buildCompanyClientDirectory(createCustomers(45)), 0);

    assert(page.entries.length === COMPANY_CLIENT_PAGE_SIZE, 'Directory pages should show no more than twenty customers.');
    assert(page.pageCount === 3, 'Forty-five customers should produce three pages.');
}

function customer(id: string, linkedAt: string): CompanyClientDirectorySource {
    return {
        id,
        propertyId: `property-${id}`,
        displayName: id,
        address: `${id} Main St`,
        linkedAt,
    };
}

function createCustomers(count: number) {
    return Array.from({ length: count }, (_, index) => {
        const letter = String.fromCharCode(65 + (index % 26));
        const number = String(index + 1).padStart(4, '0');

        return customer(`${letter} Customer ${number}`, `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`);
    });
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
