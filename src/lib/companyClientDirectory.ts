export const COMPANY_CLIENT_PAGE_SIZE = 20;

export type CompanyClientDirectorySource = {
    id: string;
    propertyId: string;
    displayName?: string | null;
    address?: string | null;
    linkedAt?: string | null;
};

export type CompanyClientDirectoryEntry = CompanyClientDirectorySource & {
    customerNumber: number;
    name: string;
    tenure: string;
};

export type CompanyClientDirectoryShelf = {
    key: string;
    label: string;
    entries: CompanyClientDirectoryEntry[];
};

type InviteStatusRecord = {
    status?: string | null;
};

const DIRECTORY_RANGES_SMALL = [
    ['A', 'D'],
    ['E', 'H'],
    ['I', 'L'],
    ['M', 'P'],
    ['Q', 'T'],
    ['U', 'Z'],
] as const;

const DIRECTORY_RANGES_MEDIUM = [
    ['A', 'B'],
    ['C', 'D'],
    ['E', 'F'],
    ['G', 'H'],
    ['I', 'J'],
    ['K', 'L'],
    ['M', 'N'],
    ['O', 'P'],
    ['Q', 'R'],
    ['S', 'T'],
    ['U', 'V'],
    ['W', 'Z'],
] as const;

export function buildCompanyClientDirectory(
    sources: CompanyClientDirectorySource[],
    now: Date = new Date()
): CompanyClientDirectoryEntry[] {
    return [...sources]
        .sort(compareClientJoinOrder)
        .map((source, index) => ({
            ...source,
            customerNumber: index + 1,
            name: source.displayName?.trim() || 'Customer home',
            address: source.address?.trim() || 'Address unavailable',
            tenure: formatCompanyClientTenure(source.linkedAt, now),
        }));
}

export function filterCompanyClientDirectory(
    entries: CompanyClientDirectoryEntry[],
    query: string
) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return entries;

    return entries.filter((entry) =>
        [entry.name, entry.address, `customer ${entry.customerNumber}`, `#${entry.customerNumber}`]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
    );
}

export function buildCompanyClientShelves(
    entries: CompanyClientDirectoryEntry[]
): CompanyClientDirectoryShelf[] {
    if (entries.length <= COMPANY_CLIENT_PAGE_SIZE) return [];

    const ranges = entries.length > 500
        ? alphabetRanges()
        : entries.length > 100
            ? DIRECTORY_RANGES_MEDIUM
            : DIRECTORY_RANGES_SMALL;

    const shelves = ranges
        .map(([start, end]) => {
            const shelfEntries = entries.filter((entry) => {
                const initial = customerInitial(entry.name);
                return initial >= start && initial <= end;
            });

            return {
                key: start === end ? start : `${start}-${end}`,
                label: start === end ? start : `${start}-${end}`,
                entries: shelfEntries,
            };
        })
        .filter((shelf) => shelf.entries.length > 0);

    const unfiled = entries.filter((entry) => customerInitial(entry.name) === '#');
    if (unfiled.length > 0) {
        shelves.push({
            key: '#',
            label: '#',
            entries: unfiled,
        });
    }

    return shelves;
}

export function paginateCompanyClientDirectory(
    entries: CompanyClientDirectoryEntry[],
    page: number
) {
    const pageCount = Math.max(1, Math.ceil(entries.length / COMPANY_CLIENT_PAGE_SIZE));
    const safePage = Math.min(Math.max(0, page), pageCount - 1);
    const start = safePage * COMPANY_CLIENT_PAGE_SIZE;

    return {
        entries: entries.slice(start, start + COMPANY_CLIENT_PAGE_SIZE),
        page: safePage,
        pageCount,
    };
}

export function filterPendingCustomerInvites<T extends InviteStatusRecord>(invites: T[]) {
    return invites.filter((invite) => normalizeValue(invite.status) === 'pending');
}

export function formatCompanyClientTenure(value?: string | null, now: Date = new Date()) {
    if (!value) return 'Recently joined';

    const joinedAt = new Date(value);
    if (Number.isNaN(joinedAt.getTime())) return 'Recently joined';

    const elapsedDays = Math.max(0, differenceInCalendarDays(joinedAt, now));
    if (elapsedDays === 0) return 'Joined today';
    if (elapsedDays < 30) return `${elapsedDays} ${elapsedDays === 1 ? 'day' : 'days'}`;

    if (elapsedDays < 365) {
        const months = Math.max(1, Math.floor(elapsedDays / 30));
        return `${months} ${months === 1 ? 'month' : 'months'}`;
    }

    const years = Math.max(1, Math.floor(elapsedDays / 365));
    return `${years} ${years === 1 ? 'year' : 'years'}`;
}

function compareClientJoinOrder(left: CompanyClientDirectorySource, right: CompanyClientDirectorySource) {
    const leftTime = parseJoinTime(left.linkedAt);
    const rightTime = parseJoinTime(right.linkedAt);

    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.id.localeCompare(right.id);
}

function parseJoinTime(value?: string | null) {
    if (!value) return Number.MAX_SAFE_INTEGER;

    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function differenceInCalendarDays(start: Date, end: Date) {
    const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.floor((endDay - startDay) / 86_400_000);
}

function customerInitial(value: string) {
    const initial = value.trim().charAt(0).toUpperCase();
    return initial >= 'A' && initial <= 'Z' ? initial : '#';
}

function alphabetRanges() {
    return Array.from({ length: 26 }, (_, index) => {
        const letter = String.fromCharCode(65 + index);
        return [letter, letter] as const;
    });
}

function normalizeValue(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
