import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchJson} from '../apps/web/app/http.mjs';

test('API outages finish with actionable errors and retain HTTP status',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'event'}),{status:200});
  assert.deepEqual(await fetchJson('https://example.invalid'),{id:'event'});
  globalThis.fetch=async()=>new Response(JSON.stringify({message:'Session expired.'}),{status:401});
  await assert.rejects(fetchJson('https://example.invalid'),e=>e.status===401&&e.message==='Session expired.');
  globalThis.fetch=async()=>new Response('<html>Bad gateway</html>',{status:502});
  await assert.rejects(fetchJson('https://example.invalid'),/temporarily unavailable/);
  globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
  await assert.rejects(fetchJson('https://example.invalid'),/Unable to reach Secret Santa/);
  globalThis.fetch=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  await assert.rejects(fetchJson('https://example.invalid',{},20),/took too long/);
  globalThis.fetch=async(_url,{signal})=>({ok:true,status:200,json:()=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))});
  await assert.rejects(fetchJson('https://example.invalid',{},20),/took too long/);
 } finally {globalThis.fetch=original;}
});
