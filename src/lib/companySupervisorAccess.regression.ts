import { canAccessDispatch, canUseCompanyEstimateWorkflow, getRoleDefaultPermissions, resolveCompanyPermissions } from './companyPermissions';
import { buildAuthorizedWorkspaces } from './workspaceAccess';
import { resolveActiveCompanyRoute } from './onboarding';
import { COMPANY_ROLE_OPTIONS } from './companyInvitationRules';

const field=resolveCompanyPermissions({role:'field_supervisor',status:'active',permissions:{can_dispatch:true,can_manage_company_users:true,can_access_management:true,can_manage_price_book:true,can_manage_catalog:true}});
assert(field.can_view_techos && field.can_view_jobs,'Field supervision retains field access.');
assert(!field.can_dispatch && !field.can_manage_company_users && !field.can_access_management && !field.can_manage_price_book && !field.can_manage_catalog,'Field supervision cannot inherit office administration.');
assert(!canAccessDispatch({role:'office_supervisor',status:'active',permissions:{can_dispatch:false}}),'Explicit dispatch removal wins over role.');
assert(!resolveCompanyPermissions({role:'technician',status:'active',permissions:{can_manage_company_users:true}}).can_manage_company_users,'Only main management can manage users.');
assert(!canUseCompanyEstimateWorkflow({role:'technician',status:'active',permissions:{can_create_estimates:false}}),'Technician estimate removal is enforced.');
assert(getRoleDefaultPermissions('office_supervisor').can_dispatch,'Office supervision starts with office access.');
assert(COMPANY_ROLE_OPTIONS.some(r=>r.value==='manager'&&r.label==='General Manager'),'The management title is General Manager.');
const row={id:'test-member',full_name:null,email:null,created_at:null,company_id:'test-company',role:'field_supervisor',status:'active',can_view_techos:true,permissions:field};
assert(resolveActiveCompanyRoute([row])?.reason==='company-technician','Field supervisor routes to TechOS.');
const spaces=buildAuthorizedWorkspaces({profile:null,companyAccess:[row],activePropertyMembershipCount:0});
assert(!spaces.some(w=>w.kind==='management'),'Field supervisor never gets a ManagementOS workspace.');
const restrictedOffice={...row,role:'office_supervisor',permissions:{...getRoleDefaultPermissions('office_supervisor'),can_access_management:false}};
assert(resolveActiveCompanyRoute([restrictedOffice])?.reason==='company-technician','Removing ManagementOS changes workspace routing.');
console.log('PASS: field isolation, office overrides, grant restrictions, estimate denial, management naming, workspace routing');
function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
