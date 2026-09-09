// Database behavior is checked separately with the rollback-only SQL suite.
const fs = require('fs');
const Module = require('module');
const ts = require('typescript');
const original = Module._load;
const stub = { supabase: {} };
Module._load = function (name) {
    if (name === './supabase' || name.endsWith('/supabase')) return stub;
    return original.apply(this, arguments);
};
require.extensions['.ts'] = function (module, file) {
    module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, file);
};
(async () => {
    await require('../src/lib/customerInvitationConnection.regression.ts').runCustomerInvitationConnectionRegressions();
    require('../src/lib/preferredProviders.regression.ts');
    console.log('PASS: existing provider visibility and category rules');
})().catch(error => { console.error(error); process.exitCode = 1; });
