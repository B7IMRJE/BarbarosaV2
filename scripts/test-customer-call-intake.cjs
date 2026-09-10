const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const original = Module._load;
const removed = [];
const rpcCalls = [];
let rpcResult = { data: null, error: null };
const stub = { supabase: {
 rpc: async (name, args) => { rpcCalls.push({ name, args }); return rpcResult; },
 storage: { from: () => ({ remove: async paths => { removed.push(...paths); return { error: null }; } }) },
} };
Module._load = function(name) {
 if (name === './supabase' || name.endsWith('/supabase')) return stub;
 return original.apply(this, arguments);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
(async () => {
 const intake = require('../src/lib/customerCallIntake.ts');
 const phone = require('../src/lib/serviceRequestPhoneHandoff.ts');
 rpcResult = { data: { service_request_id: 'saved-request', company_id: 'company', property_id: 'home', request_type: 'emergency', display_code: 'A0100' }, error: null };
 const receipt = await intake.submitCustomerIntake('same-call', 'Leak', 'regular', '  access  ');
 assert.equal(receipt.id, 'saved-request');
 assert.equal(receipt.requestType, 'emergency', 'Backend urgency wins over a client downgrade');
 assert.equal(rpcCalls.at(-1).args.p_intake_id, 'same-call');
 assert.equal(rpcCalls.at(-1).args.p_access_instructions, 'access');
 rpcResult = { data: null, error: { message: 'Use the invited account' } };
 await assert.rejects(intake.loadCustomerIntake({ intakeId: 'private-call' }), /invited account/);
 rpcResult = { data: null, error: null };
 await assert.rejects(intake.submitCustomerIntake('same-call', 'Leak', 'regular', ''), /same request/);
 const saved = { localId: 'phone-1', status: 'saved', storagePath: 'companies/company/request/photo.jpg' };
 const uploading = { localId: 'phone-2', status: 'uploading' };
 const arrived = { localId: 'phone-3', status: 'selected' };
 const merged = phone.mergePhoneHandoffDrafts([saved, uploading], [{ localId: 'phone-1', status: 'selected' }, { localId: 'phone-2', status: 'selected' }, arrived]);
 assert.equal(merged[0], saved, 'Polling must not turn an already saved phone photo back into a pending upload');
 assert.equal(merged[1], uploading, 'Polling must preserve an upload in progress');
 assert.equal(merged[2], arrived);
 await phone.finishServiceRequestPhoneHandoff({ id: 'handoff' }, [saved, { localId: 'phone-3', storagePath: 'handoffs/handoff/token/source.jpg' }]);
 assert.deepEqual(removed, ['handoffs/handoff/token/source.jpg'], 'Finishing capture must never delete a request attachment');
 assert.equal(intake.intakeProgressLabel({ submitted_at: null, property_id: 'home' }), 'Address confirmed · awaiting request');
 assert.equal(intake.intakeReasonLabel('warranty'), 'Warranty review requested');

 // A reloaded request must collect saved phone media, even with no local handoff state.
 const collectionCalls = [];
 const sourceId = '10000000-0000-4000-8000-000000000002';
 stub.supabase.rpc = async (name, args) => { collectionCalls.push(name); return { data: null, error: null }; };
 stub.supabase.from = () => ({ select: () => ({ in: (_, ids) => ({ is: async () => {
   collectionCalls.push('load-owned');
   assert.deepEqual(ids, ['stored-link']);
   return { data: [{ id: sourceId, media_type: 'photo', storage_path: 'source', file_name: 'phone.jpg', mime_type: 'image/jpeg', size_bytes: 20 }], error: null };
 } }) }) });
 stub.supabase.storage.from = () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://example.invalid/source' } }) });
 const collected = await phone.collectPhoneMediaForSubmission(['stored-link', 'stored-link'], []);
 assert.equal(collected.length, 1, 'Uploaded phone photo must be collected when local media is empty');
 assert.equal(collected[0].localId, 'phone-' + sourceId);
 assert.deepEqual(collectionCalls, ['seal_my_service_request_media_handoffs', 'load-owned'], 'Stop late uploads before reading final phone media');
 stub.supabase.rpc = async () => ({ data: null, error: { message: 'Cannot collect phone photos' } });
 await assert.rejects(phone.collectPhoneMediaForSubmission(['stored-link'], []), /Cannot collect/);
 await assert.rejects(phone.discardPhoneHandoffMedia('phone-' + sourceId), /Cannot collect/);
 const media = require('../src/lib/serviceRequestMedia.ts');
 const phoneUuid = '10000000-0000-4000-8000-000000000001';
 let savedRows = [];
 let uploads = 0;
 let saves = 0;
 const originalFetch = global.fetch;
 global.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) });
 stub.supabase.storage.from = () => ({
   upload: async () => { uploads++; return { error: null }; },
   createSignedUrl: async () => ({ data: { signedUrl: 'https://example.invalid/photo' }, error: null }),
   remove: async () => { throw new Error('A saved attachment must not be deleted'); },
 });
 stub.supabase.rpc = async (name, args) => {
   if (name === 'get_service_request_attachments') return { data: savedRows, error: null };
   if (name === 'save_service_request_attachment') {
     saves++;
     savedRows = [{ id: args.p_attachment_id, service_request_id: args.p_service_request_id, company_id: 'company', property_id: 'home', media_type: 'photo', bucket: 'service-request-media', storage_path: 'companies/company/request/photo.jpg', file_name: 'photo.jpg', mime_type: 'image/jpeg', size_bytes: 16 }];
     return { data: null, error: { message: 'Response lost after commit' } };
   }
   throw new Error('Unexpected RPC ' + name);
 };
 const photo = { localId: 'phone-' + phoneUuid, mediaType: 'photo', uri: 'https://example.invalid/source', fileName: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 16, durationSeconds: null, caption: '', status: 'selected' };
 const states = [];
 const input = { companyId: 'company', propertyId: 'home', serviceRequestId: 'request', items: [photo], onItemChange: (_, change) => states.push(change) };
 await media.uploadPendingServiceRequestMedia(input);
 await media.uploadPendingServiceRequestMedia(input);
 assert.equal(uploads, 1, 'Reloaded phone photo should reuse the saved attachment');
 assert.equal(saves, 1, 'A lost metadata response must reconcile with the saved attachment');
 assert.equal(states.at(-1).status, 'saved');
 global.fetch = originalFetch;
 console.log('PASS: intake contract, server urgency, authorization errors, receipt recovery and safe phone-photo polling/cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
