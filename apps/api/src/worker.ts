import nodemailer from 'nodemailer';
import {db,rows,transaction} from './db.js';
const {SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASSWORD,MAIL_FROM}=process.env;
if(!SMTP_HOST||!MAIL_FROM)throw new Error('Configure SMTP_HOST and MAIL_FROM before starting the email worker.');
const transport=nodemailer.createTransport({host:SMTP_HOST,port:Number(SMTP_PORT||587),secure:Number(SMTP_PORT||587)===465,...(SMTP_USER?{auth:{user:SMTP_USER,pass:SMTP_PASSWORD}}:{}),connectionTimeout:10000,socketTimeout:20000});
let stopped=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;});
console.log('Notification worker started.');
while(!stopped){
 try{
  // Recover jobs if a worker stopped after claiming one. Delivery is at least once.
  await rows("UPDATE notification_deliveries SET status='pending' WHERE status='sending' AND available_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)");
  const job=await transaction(async conn=>{const [job]=await rows("SELECT * FROM notification_deliveries WHERE status='pending' AND available_at<=UTC_TIMESTAMP() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",[],conn);if(!job)return null;await rows("UPDATE notification_deliveries SET status='sending',attempts=attempts+1,available_at=UTC_TIMESTAMP() WHERE id=?",[job.id],conn);return job;});
  if(job){try{await transport.sendMail({from:MAIL_FROM,to:job.recipient_email,subject:job.subject,text:job.body,messageId:`<${job.id}@secret-santa.local>`});await rows("UPDATE notification_deliveries SET status='sent',sent_at=UTC_TIMESTAMP(),last_error=NULL WHERE id=?",[job.id]);}catch(error:any){const attempts=job.attempts+1;const status=attempts>=5?'failed':'pending';await rows('UPDATE notification_deliveries SET status=?,available_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND),last_error=? WHERE id=?',[status,Math.min(3600,30*2**attempts),String(error.code||'SMTP_DELIVERY_FAILED').slice(0,500),job.id]);console.error('Notification delivery failed; retry scheduled.',error.code||'SMTP_DELIVERY_FAILED');}}
  else await new Promise(resolve=>setTimeout(resolve,5000));
 }catch(error:any){console.error('Worker database error',error.code||error.name);await new Promise(resolve=>setTimeout(resolve,5000));}
}
await db.end();transport.close();
