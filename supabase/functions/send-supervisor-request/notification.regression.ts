function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
namespace assert {
    export function equal(actual: unknown, expected: unknown) { assert(actual === expected, `Expected ${String(expected)}, received ${String(actual)}`); }
    export function deepEqual(actual: unknown, expected: unknown) { assert(JSON.stringify(actual) === JSON.stringify(expected), 'Unexpected response body'); }
}
import handler from './index';

async function run() {
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis,'Deno',{value:{env:{get:(name:string)=>({SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'test-anon',SUPABASE_SERVICE_ROLE_KEY:'test-service'}[name])}},configurable:true});
    const id='00000000-0000-4000-8000-000000000001';
    const calls:{url:string;body:unknown}[]=[];
    let authenticated=true, hasDevice=false;
    globalThis.fetch=(async(input:RequestInfo|URL, init?:RequestInit)=>{
        const url=String(input);const body=typeof init?.body==='string'?JSON.parse(init.body):null;calls.push({url,body});
        if(url.endsWith('/auth/v1/user'))return Response.json({id:'verified-test-user'},{status:authenticated?200:401});
        if(url.endsWith('/rpc/claim_job_supervisor_notification')){assert.equal(body.p_actor_id,'verified-test-user');return Response.json({id,company_id:id,service_request_id:id,recipient_user_id:'recipient'});}
        if(url.includes('communication_push_devices'))return Response.json(hasDevice?[{expo_push_token:'ExponentPushToken[test]'}]:[]);
        if(url==='https://exp.host/--/api/v2/push/send'){
            assert.equal(body.length,1);assert.equal(body[0].title,'A technician needs your help');
            assert.equal(body[0].body,'Open the private job conversation to respond.');
            assert.equal(body[0].data.route,`/job-messages?companyId=${id}&requestId=${id}`);
            return Response.json({data:[{status:'ok',id:'test-ticket'}]});
        }
        if(url.includes('/job_supervisor_requests?'))return new Response(null,{status:204});
        throw new Error('Unexpected network request in notification test.');
    }) as typeof fetch;
    try {
        const request=()=>new Request('https://test.invalid/send-supervisor-request',{method:'POST',headers:{authorization:'Bearer test-session','Content-Type':'application/json'},body:JSON.stringify({request_id:id})});
        authenticated=false;assert.equal((await handler.fetch(request())).status,401);assert.equal(calls.length,1);
        authenticated=true;calls.length=0;
        assert.deepEqual(await (await handler.fetch(request())).json(),{status:'unavailable'});
        assert(!calls.some(c=>c.url.includes('exp.host')),'Unregistered devices must not be reported as notified.');
        hasDevice=true;calls.length=0;
        assert.deepEqual(await (await handler.fetch(request())).json(),{status:'accepted'});
        assert(calls.some(c=>c.url.includes('exp.host')));
        console.log('PASS: authenticated sender, targeted recipient, missing-device feedback, private push payload, delivery status');
    } finally {globalThis.fetch=originalFetch;}
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
