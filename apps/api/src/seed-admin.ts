import 'reflect-metadata';
import {randomUUID} from 'node:crypto';
import {db,rows} from './db.js';
import {passwordHash} from './security.js';
const {ADMIN_EMAIL,ADMIN_PASSWORD}=process.env;
if(!ADMIN_EMAIL||!ADMIN_PASSWORD||ADMIN_PASSWORD.length<12)throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters).');
await rows('INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)',[randomUUID(),'Platform admin',ADMIN_EMAIL.toLowerCase(),await passwordHash(ADMIN_PASSWORD),'super_admin']);
console.log('Admin created. Sign in at /admin/login/ with your email and password.');await db.end();
