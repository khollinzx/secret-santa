import 'reflect-metadata';
import {db} from './db.js';
import {startNotificationWorker} from './notifications.js';
const worker=startNotificationWorker();
let closing=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await worker.stop();await db.end();});
