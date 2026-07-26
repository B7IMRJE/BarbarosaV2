type CompanyIdentity = {
    dba_name?: string | null;
    public_name?: string | null;
    name?: string | null;
};

/**
 * Operational screens use the customer-facing DBA first. The legal corporation
 * name remains available only in the protected company administration record.
 */
export function getCompanyDisplayName(
    company: CompanyIdentity | null | undefined,
    fallback = 'Company',
) {
    return (
        company?.dba_name?.trim() ||
        company?.public_name?.trim() ||
        company?.name?.trim() ||
        fallback
    );
}
