const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function emailHtml(job) {
 return `<!doctype html><html><body style="margin:0;background:#fff8ed;color:#432821;font:16px Arial,sans-serif"><main style="max-width:560px;margin:32px auto;background:white;border-top:6px solid #a62832;padding:28px"><p style="color:#a62832;font-weight:bold">SECRET SANTA ✦</p><h1 style="font-size:24px">${escape(job.subject)}</h1><div style="line-height:1.7;white-space:pre-wrap">${escape(job.body)}</div><p style="border-top:1px solid #d7b96b;margin-top:28px;padding-top:16px;color:#71605a;font-size:13px">Keep the surprise alive. Your recipient is revealed privately inside Secret Santa.</p></main></body></html>`;
}
export function createHttpMailSender(env, fetchImpl = fetch) {
 const provider = env.MAIL_PROVIDER || (env.RESEND_API_KEY ? 'resend' : 'sendgrid');
 const key = provider === 'resend' ? env.RESEND_API_KEY : env.SENDGRID_API_KEY;
 if (!['resend','sendgrid'].includes(provider) || !key || !env.MAIL_FROM) throw new Error('Configure MAIL_PROVIDER, its API key, and MAIL_FROM.');
 const sender = env.MAIL_FROM.match(/^(.*?)\s*<([^<>]+)>$/);
 const address = sender ? sender[2].trim() : env.MAIL_FROM.trim();
 if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) throw new Error('MAIL_FROM must contain a verified sender email address.');
 return async job => {
  const html = emailHtml(job);
  const payload = provider === 'resend'
   ? {from:env.MAIL_FROM,to:[job.recipient_email],subject:job.subject,text:job.body,html}
   : {personalizations:[{to:[{email:job.recipient_email}]}],from:{email:address,...(sender?{name:sender[1].trim()}: {})},subject:job.subject,content:[{type:'text/plain',value:job.body},{type:'text/html',value:html}]};
  let response;
  try {
   response = await fetchImpl(provider === 'resend' ? 'https://api.resend.com/emails' : 'https://api.sendgrid.com/v3/mail/send', {
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(provider==='resend'?{'Idempotency-Key':`secret-santa/${job.id}`}:{})},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),
   });
  } catch {throw Object.assign(new Error('Email provider could not be reached.'),{code:'MAIL_CONNECTION_FAILED'});}
  if (!response.ok) throw Object.assign(new Error('Email provider rejected the request.'),{code:`MAIL_HTTP_${response.status}`,permanent:[400,401,403,404,413,422].includes(response.status)});
  // Consume the response before marking the outbox job accepted.
  try {await response.text();} catch {throw Object.assign(new Error('Email response was interrupted.'),{code:'MAIL_RESPONSE_INTERRUPTED'});}
 };
}
