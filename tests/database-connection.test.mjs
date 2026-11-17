import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectionDiagnostic,connectDatabase} from '../scripts/database-connection.mjs';
const url='postgresql://private-user:private-password@db.example.com:5432/postgres?private=value';
test('connection diagnostics distinguish failures without leaking credentials',()=>{
 for(const code of ['ENETUNREACH','28P01','SELF_SIGNED_CERT_IN_CHAIN']){
  const diagnostic=connectionDiagnostic({code,message:url},url);
  assert.ok(diagnostic.message.includes(code));assert.ok(diagnostic.message.includes('db.example.com:5432'));
  assert.ok(!diagnostic.message.includes('private'));
 }
 assert.match(connectionDiagnostic({code:'ENETUNREACH'},url).message,/session pooler/);
 assert.equal(connectionDiagnostic({code:'28P01'},url).retryable,false);
});
test('startup retries temporary failures but stops promptly on bad credentials',async()=>{
 let calls=0;const client={};
 const pool={connect:async()=>{if(++calls<3)throw {code:'ECONNREFUSED'};return client;}};
 assert.equal(await connectDatabase(pool,url,{delayMs:1,log:()=>{}}),client);assert.equal(calls,3);
 calls=0;
 await assert.rejects(connectDatabase({connect:async()=>{calls++;throw {code:'28P01'};}},url,{delayMs:1,log:()=>{}}),/authentication failed/);assert.equal(calls,1);
});
