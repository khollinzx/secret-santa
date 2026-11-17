import nodemailer from 'nodemailer';
import {Injectable,OnApplicationBootstrap,OnApplicationShutdown} from '@nestjs/common';
import {rows,transaction} from './db.js';
// @ts-ignore The JavaScript adapter is tested directly and copied into dist during build.
import {createHttpMailSender,emailHtml} from './mail-delivery.mjs';
type Job={id:string;recipient_email:string;subject:string;body:string;attempts:number};
type Sender=(job:Job)=>Promise<unknown>;
export function configuredSender(){
 const env=process.env;
 if(env.MAIL_PROVIDER!=='smtp')return {send:createHttpMailSender(env) as Sender,close:()=>{}};
 if(!env.SMTP_HOST||!env.MAIL_FROM)throw new Error('Configure SMTP_HOST and MAIL_FROM.');
 const transport=nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:Number(env.SMTP_PORT||587)===465,...(env.SMTP_USER?{auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}}:{}),connectionTimeout:10000,socketTimeout:20000});
 return {send:(job:Job)=>transport.sendMail({from:env.MAIL_FROM,to:job.recipient_email,subject:job.subject,text:job.body,html:emailHtml(job),messageId:`<${job.id}@secret-santa.local>`}),close:()=>transport.close()};
}
export async function deliverNextNotification(send:Sender){
 await rows("UPDATE notification_deliveries SET status='pending' WHERE status='sending' AND available_at<(CURRENT_TIMESTAMP - INTERVAL '5 minutes')");
 const job=await transaction(async conn=>{const [job]=await rows("SELECT * FROM notification_deliveries WHERE status='pending' AND available_at<=CURRENT_TIMESTAMP ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",[],conn);if(!job)return null;await rows("UPDATE notification_deliveries SET status='sending',attempts=attempts+1,available_at=CURRENT_TIMESTAMP WHERE id=$1",[job.id],conn);return job;});
 if(!job)return false;
 try{
  await send(job);
  await rows("UPDATE notification_deliveries SET status='sent',sent_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=$1",[job.id]);
 }catch(error:any){
  const code=/^[A-Z0-9_]{1,80}$/.test(error?.code||'')?error.code:'MAIL_DELIVERY_FAILED';
  const status=error?.permanent||job.attempts+1>=5?'failed':'pending';
  await rows("UPDATE notification_deliveries SET status=$1,available_at=(CURRENT_TIMESTAMP + ($2 * INTERVAL '1 second')),last_error=$3 WHERE id=$4",[status,Math.min(3600,30*2**(job.attempts+1)),code,job.id]);
  console.error('Notification delivery failed.',code);
 }
 return true;
}
export function startNotificationWorker(sender=configuredSender()){
 let stopped=false;let wake:(()=>void)|undefined;
 const sleep=(ms=5000)=>new Promise<void>(resolve=>{const timer=setTimeout(resolve,ms);wake=()=>{clearTimeout(timer);resolve();};});
 const done=(async()=>{
  console.log('Notification worker started.');
  while(!stopped){
   try{const worked=await deliverNextNotification(sender.send);if(!stopped)await sleep(worked?600:5000);}
   catch(error:any){console.error('Notification worker database error.',/^[A-Z0-9_]{1,80}$/.test(error?.code||'')?error.code:'DATABASE_ERROR');if(!stopped)await sleep();}
  }
  sender.close();
 })();
 return {async stop(){stopped=true;wake?.();await done;}};
}
@Injectable()
export class EmailNotifications implements OnApplicationBootstrap,OnApplicationShutdown{
 private worker?:ReturnType<typeof startNotificationWorker>;
 onApplicationBootstrap(){
  if(process.env.MAIL_WORKER_ENABLED!=='true')return;
  try{this.worker=startNotificationWorker();}catch{console.warn('Email delivery is disabled: configure the mail provider API key and verified MAIL_FROM.');}
 }
 async onApplicationShutdown(){await this.worker?.stop();}
}
