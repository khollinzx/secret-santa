import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
const runScript=(path,env)=>new Promise((resolve,reject)=>{const processHandle=spawn(process.execPath,[path],{env:{...process.env,...env},stdio:'pipe'});processHandle.on('error',reject);processHandle.on('exit',code=>code===0?resolve():reject(new Error('Script failed: '+path)));});
const url=process.env.TEST_DATABASE_URL;
test('PostgreSQL API: privacy, access controls, concurrent picks, reset, and completion',{skip:!url},async()=>{
 const database=new URL(url).pathname.slice(1);assert.ok(database.endsWith('_test'),'Use a disposable database whose name ends with _test.');
 const db=new pg.Client({connectionString:url,options:'-c search_path=secret_santa,public -c timezone=UTC'});await db.connect();
 await db.query('BEGIN');await db.query(await readFile(new URL('../database/001_initial.sql',import.meta.url),'utf8'));await db.query('COMMIT');
 const port=process.env.TEST_PORT||'4011';const origin=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['apps/api/dist/main.js'],{env:{...process.env,DATABASE_URL:url,PORT:port,WEB_ORIGIN:origin,ADMIN_ORIGIN:origin},stdio:'ignore'});
 let eventId;const userIds=[];
 const call=async(path,method='GET',body,token)=>{const res=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};
 try{
  let started=false;for(let i=0;i<50;i++){try{await fetch(origin+'/me');started=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert.ok(started,'API did not start. Build it first and check PostgreSQL credentials.');
  const users=[];const run=Date.now();
  for(let i=0;i<5;i++){const r=await call('/auth/register','POST',{name:`Integration Person ${i}`,email:`santa-test-${run}-${i}@example.com`,password:'Testing-password-4932!'});assert.equal(r.status,201,JSON.stringify(r.data));users.push(r.data);userIds.push(r.data.user.id);}
  const organiser=users[0].token;
  assert.equal((await call('/auth/login','POST',{email:users[0].user.email,password:'Testing-password-4932!',audience:'admin'})).status,401);
  const adminEmail=`santa-admin-${run}@example.com`;const password='Testing-admin-password-4932!';
  await runScript('apps/api/dist/seed-admin.js',{DATABASE_URL:url,ADMIN_EMAIL:adminEmail,ADMIN_PASSWORD:password});
  const adminId=(await db.query('SELECT id FROM users WHERE email=$1',[adminEmail])).rows[0].id;userIds.push(adminId);
  assert.equal((await call('/auth/login','POST',{email:adminEmail,password:'wrong-password',audience:'admin'})).status,401);
  const admin=await call('/auth/login','POST',{email:adminEmail,password,audience:'admin'});assert.equal(admin.status,201);
  const overview=await call('/admin/overview','GET',undefined,admin.data.token);assert.equal(overview.status,200);assert.equal(typeof overview.data.stats.users,'number');
  const staffParticipant=await call('/auth/login','POST',{email:adminEmail,password});assert.equal((await call('/admin/overview','GET',undefined,staffParticipant.data.token)).status,403);

  assert.equal((await call('/admin/overview','GET',undefined,organiser)).status,403);
  assert.equal((await call('/events')).status,401);
  const r=await call('/events','POST',{name:'Integration exchange',description:'Temporary test event',budget:20000,currency:'NGN',registrationDeadline:'2099-12-01',pickingDeadline:'2099-12-15',exchangeDate:'2099-12-20'},organiser);assert.equal(r.status,201);eventId=r.data.id;
  const invitation=await call(`/events/${eventId}/invitations`,'POST',{},organiser);const invitationToken=new URL(invitation.data.link).searchParams.get('invite');
  assert.equal((await call(`/events/${eventId}`,'GET',undefined,users[1].token)).status,403);
  for(const user of users.slice(1))assert.equal((await call('/invitations/accept','POST',{invitation:invitationToken},user.token)).status,201);
  assert.equal((await call(`/events/${eventId}/status`,'POST',{action:'close'},users[1].token)).status,403);
  assert.equal((await call(`/events/${eventId}/status`,'POST',{action:'close'},organiser)).status,201);
  assert.equal((await call(`/events/${eventId}/status`,'POST',{action:'open_picking'},organiser)).status,201);
  const pools=await Promise.all(users.map(u=>call(`/events/${eventId}/pool`,'GET',undefined,u.token)));
  assert.ok(pools.every(p=>p.data.numbers.every(n=>Object.keys(n).sort().join(',')==='number,status')),'Pool must not leak recipient IDs.');
  let pair;for(let a=0;a<users.length&&!pair;a++)for(let b=a+1;b<users.length&&!pair;b++){const n=pools[a].data.numbers.find(n=>n.status==='available'&&pools[b].data.numbers.some(m=>m.number===n.number&&m.status==='available'));if(n)pair=[a,b,n.number];}assert.ok(pair);
  const results=await Promise.all(pair.slice(0,2).map(i=>call(`/events/${eventId}/pick`,'POST',{number:pair[2]},users[i].token)));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const winner=results[0].status===201?pair[0]:pair[1];
  const before=await call(`/events/${eventId}`,'GET',undefined,users[winner].token);assert.ok(before.data.recipient);assert.equal(before.data.recipient.number,pair[2]);
  const repeated=await call(`/events/${eventId}/pick`,'POST',{number:99},users[winner].token);assert.equal(repeated.data.number,pair[2]);assert.equal(repeated.data.alreadyPicked,true);
  assert.equal((await call(`/events/${eventId}/status`,'POST',{action:'reset'},organiser)).status,400);
  assert.equal((await call(`/events/${eventId}/status`,'POST',{action:'reset',acknowledge:true},organiser)).status,201);
  assert.equal((await call(`/events/${eventId}`,'GET',undefined,users[winner].token)).data.recipient,null,'Reset must hide previous assignments.');
  const detail=await call(`/events/${eventId}`,'GET',undefined,organiser);const members=detail.data.members;
  const exclusion={giverId:members[0].id,recipientId:members[1].id,mutual:true};
  assert.equal((await call(`/events/${eventId}/exclusions`,'POST',exclusion,organiser)).status,201);
  assert.equal((await call(`/events/${eventId}/exclusions`,'POST',exclusion,organiser)).status,201,'Duplicate exclusions are idempotent.');
  await call(`/events/${eventId}/status`,'POST',{action:'open_picking'},organiser);
  assert.equal((await call(`/events/${eventId}/reminders`,'POST',{},organiser)).status,201);
  assert.equal((await call(`/events/${eventId}/reminders`,'POST',{},organiser)).status,400);

  const recipients=[];
  for(const user of users){const pool=await call(`/events/${eventId}/pool`,'GET',undefined,user.token);const number=pool.data.numbers.find(n=>n.status==='available')?.number;assert.ok(number);const pick=await call(`/events/${eventId}/pick`,'POST',{number},user.token);assert.equal(pick.status,201);const detail=await call(`/events/${eventId}`,'GET',undefined,user.token);assert.notEqual(detail.data.recipient.name,user.user.name);recipients.push(detail.data.recipient.name);}
  assert.equal(new Set(recipients).size,users.length);
  assert.equal((await call(`/events/${eventId}`,'GET',undefined,organiser)).data.status,'exchange_active');
  assert.equal((await call(`/events/${eventId}/status`,'POST',{action:'complete'},organiser)).status,201);
 }finally{
  if(server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
  if(eventId){for(const table of ['notification_deliveries','audit_logs','selections','number_pool_entries','draw_exclusions','invitations','event_members'])await db.query(`DELETE FROM ${table} WHERE event_id=$1`,[eventId]);await db.query('DELETE FROM events WHERE id=$1',[eventId]);}
  for(const id of userIds){await db.query('DELETE FROM audit_logs WHERE actor_id=$1',[id]);await db.query('DELETE FROM sessions WHERE user_id=$1',[id]);await db.query('DELETE FROM users WHERE id=$1',[id]);}await db.end();
 }
});
