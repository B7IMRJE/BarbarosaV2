import { mergeCompanyTeamRosterMembers } from './companyTeamRoster';

runCompanyTeamRosterRegressions();

export function runCompanyTeamRosterRegressions() {
    dispatchRosterRestoresTechniciansHiddenByDirectRls();
    duplicateMembersKeepTheManagementRecord();
    invalidMembersStayHidden();
}

function dispatchRosterRestoresTechniciansHiddenByDirectRls() {
    const members = mergeCompanyTeamRosterMembers(
        [],
        [{ id: 'tech-1', company_id: 'company-1', full_name: 'Ivonne Tech 3' }]
    );

    assert(
        members.length === 1 && members[0].id === 'tech-1',
        'An authorized Dispatch roster technician should remain visible when the direct Team query is empty.'
    );
}

function duplicateMembersKeepTheManagementRecord() {
    const members = mergeCompanyTeamRosterMembers(
        [{ id: 'tech-1', company_id: 'company-1', full_name: 'Current Name' }],
        [{ id: 'tech-1', company_id: 'company-1', full_name: 'Older Name' }]
    );

    assert(
        members.length === 1 && members[0].full_name === 'Current Name',
        'The first authoritative Team record should win when roster sources overlap.'
    );
}

function invalidMembersStayHidden() {
    const members = mergeCompanyTeamRosterMembers(
        [{ id: '', company_id: 'company-1' }],
        [{ id: 'tech-2', company_id: '' }]
    );

    assert(members.length === 0, 'Roster rows without both member and company ids must stay hidden.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
