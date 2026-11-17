import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHttpMailSender,emailHtml} from '../apps/api/src/mail-delivery.mjs';
const job={id:'message-123',recipient_email:'receiver@example.com',subject:'An invitation <script>',body:'Join our exchange: https://example.com/?invite=abc\n<script>alert(1)</script>'};
test('Resend receives one private recipient and stable retry idempotency',async()=>{
 const calls=[];const send=createHttpMailSender({MAIL_PROVIDER:'resend',RESEND_API_KEY:'test-key',MAIL_FROM:'Secret Santa <santa@example.com>'},async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'accepted'}),{status:200});});
 await send(job);await send(job);
 assert.equal(calls[0].url,'https://api.resend.com/emails');assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);
 const payload=JSON.parse(calls[0].options.body);assert.deepEqual(payload.to,[job.recipient_email]);assert.equal(payload.text,job.body);assert.ok(!payload.html.includes('<script>'));assert.ok(payload.html.includes('&lt;script&gt;'));
});
test('SendGrid sends text and HTML with an authenticated sender',async()=>{
 let sent;const send=createHttpMailSender({MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-key',MAIL_FROM:'Secret Santa <santa@example.com>'},async(url,options)=>{sent={url,payload:JSON.parse(options.body)};return new Response(null,{status:202});});
 await send(job);assert.equal(sent.url,'https://api.sendgrid.com/v3/mail/send');assert.deepEqual(sent.payload.from,{email:'santa@example.com',name:'Secret Santa'});assert.deepEqual(sent.payload.personalizations,[{to:[{email:job.recipient_email}]}]);assert.equal(sent.payload.content.length,2);
});
test('provider rejections are safe and permanent errors do not retry',async()=>{
 for(const status of [401,403,429,500]){
  const send=createHttpMailSender({MAIL_PROVIDER:'resend',RESEND_API_KEY:'private-key',MAIL_FROM:'santa@example.com'},async()=>new Response('private-key provider details',{status}));
  await assert.rejects(send(job),error=>error.code===`MAIL_HTTP_${status}`&&error.permanent===[401,403].includes(status)&&!error.message.includes('private-key'));
 }
 assert.throws(()=>createHttpMailSender({MAIL_PROVIDER:'resend',MAIL_FROM:'santa@example.com'}),/Configure/);
 assert.ok(!emailHtml(job).includes('<script>'));
});
