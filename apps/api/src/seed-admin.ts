import 'reflect-metadata';
import {randomUUID} from 'node:crypto';
import {db,rows} from './db.js';
import {passwordHash} from './security.js';
const {ADMIN_EMAIL,ADMIN_PASSWORD,ADMIN_TOTP_SECRET}=process.env;
if(!ADMIN_EMAIL||!ADMIN_PASSWORD||ADMIN_PASSWORD.length<12||!ADMIN_TOTP_SECRET||!/^[A-Z2-7]{32}$/.test(ADMIN_TOTP_SECRET))throw new Error('Set ADMIN_EMAIL, ADMIN_PASSWORD (12+ characters), and ADMIN_TOTP_SECRET (32 base32 characters from your authenticator setup).');
await rows('INSERT INTO users(id,name,email,password_hash,role,totp_secret) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),'Platform admin',ADMIN_EMAIL.toLowerCase(),await passwordHash(ADMIN_PASSWORD),'super_admin',ADMIN_TOTP_SECRET]);
console.log('Admin created. Sign in at /admin/login/ with your password and authenticator code.');await db.end();
