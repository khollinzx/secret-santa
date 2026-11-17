import {randomBytes, scrypt as rawScrypt, timingSafeEqual, createHash, createHmac} from 'node:crypto';
import {promisify} from 'node:util';
import {CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException} from '@nestjs/common';
import {rows} from './db.js';
const scrypt=promisify(rawScrypt);
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export async function passwordHash(password:string){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64) as Buffer;return `${salt}:${key.toString('hex')}`;}
export async function passwordMatches(password:string,stored:string){const [salt,key]=stored.split(':');if(!salt||!key)return false;const actual=await scrypt(password,salt,64) as Buffer;const expected=Buffer.from(key,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export function totpMatches(secret:string,code:string){
 if(!/^\d{6}$/.test(code))return false;
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.toUpperCase()){const i=alphabet.indexOf(c);if(i<0)return false;bits+=i.toString(2).padStart(5,'0');}
 const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));
 const key=Buffer.from(bytes);for(let offset=-1;offset<=1;offset++){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)+offset));const digest=createHmac('sha1',key).update(counter).digest();const index=digest[19]&15;const number=((digest.readUInt32BE(index)&0x7fffffff)%1000000).toString().padStart(6,'0');if(timingSafeEqual(Buffer.from(number),Buffer.from(code)))return true;}return false;
}
@Injectable()
export class SessionGuard implements CanActivate {async canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest();const bearer=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!bearer)throw new UnauthorizedException('Please sign in.');const [user]=await rows('SELECT u.id,u.name,u.email,u.role,u.suspended,s.audience FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP',[hash(bearer)]);if(!user||user.suspended)throw new UnauthorizedException('Session expired or account unavailable.');req.user=user;return true;}}
export function requireAdmin(user:any){if(user.audience!=='admin'||!['support','super_admin'].includes(user.role))throw new ForbiddenException('Administrator access required.');}
