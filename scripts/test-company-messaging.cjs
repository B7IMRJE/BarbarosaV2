// Run with node scripts/test-company-messaging.cjs. Database tests run separately in a rollback transaction.
const fs=require('fs'), Module=require('module'), ts=require(process.cwd()+'/node_modules/typescript');
const original=Module._load;
Module._load=function(name,parent,isMain){if(name==='./supabase'||name.endsWith('/supabase'))return {supabase:{}};return original.apply(this,arguments);};
require.extensions['.ts']=function(module,file){module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);};
const suites = ['companyPermissions', 'companyDashboardModules', 'companyInvitation', 'dispatcherAuthorization', 'sharedCoreAccessPolicy', 'onboarding', 'companySupervisorAccess', 'serviceRequestThreads', 'dispatchChat'].map(name => `src/lib/${name}.regression.ts`);
suites.push('supabase/functions/send-supervisor-request/notification.regression.ts');
for(const name of suites){require(process.cwd()+'/'+name);console.log('PASS '+name);}
