export type CompanyTeamRosterMember = {
    id: string;
    company_id: string;
};

export function mergeCompanyTeamRosterMembers<T extends CompanyTeamRosterMember>(
    ...memberLists: T[][]
) {
    const membersById = new Map<string, T>();

    memberLists.forEach((members) => {
        members.forEach((member) => {
            if (!member.id || !member.company_id || membersById.has(member.id)) return;
            membersById.set(member.id, member);
        });
    });

    return Array.from(membersById.values());
}
