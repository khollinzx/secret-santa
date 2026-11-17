import {fetchJson} from './http.mjs';
// The hosted preview uses sample data in this browser. Production uses the API.
// @ts-ignore shared pure JavaScript domain
import {preparePool,eligibleNumbers} from '../../../packages/domain/draw.mjs';
export const API=process.env.NEXT_PUBLIC_API_URL||'';
const KEY='secret-santa-preview-v1';
const rid=()=>crypto.randomUUID();
export const statusLabel=(value:string)=>value.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
export const money=(amount:number,currency='NGN')=>new Intl.NumberFormat('en-NG',{style:'currency',currency,maximumFractionDigits:0}).format(amount);
export const dateLabel=(date:string)=>new Date(date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
function initial(){
 const users=[['Collins Benson','collins@example.com'],['Abigail Benson','abigail@example.com'],['Sarah Okafor','sarah@example.com'],['David Johnson','david@example.com'],['Mary Williams','mary@example.com'],['James Adeyemi','james@example.com'],['Tomi Adebayo','tomi@example.com'],['Daniel Peters','daniel@example.com']].map(([name,email],i)=>({id:`p${i+1}`,name,email,role:'participant',suspended:false}));
 const members=users.map((u,i)=>({id:`m${i+1}`,user_id:u.id,name:u.name,email:u.email,wishlist:['A good book, specialty coffee, or something thoughtful.','I love scented candles, journals, and chocolate.','A novel or a lovely houseplant.','Coffee gear and board games.'][i%4],gift_ready:false}));
 const entries=preparePool(members,[],(n:number)=>crypto.getRandomValues(new Uint32Array(1))[0]%n);
 const selections:any[]=[];
 for(const giver of ['m3','m4','m5']){const choices=eligibleNumbers(members,entries,selections,[],giver);selections.push({giverId:giver,number:choices[0]});}
 return {users,events:[{id:'event-office',organiser_id:'p1',name:'Christmas at Princeps',description:'A little festive cheer with the people who make every workday better. Pick a number, find your person, and make their Christmas.',budget:20000,currency:'NGN',exchange_date:'2026-12-20',registration_deadline:'2026-12-01',picking_deadline:'2026-12-15',status:'picking_open',round:1,members,entries,selections,exclusions:[],created_at:'2026-11-17'},{id:'event-family',organiser_id:'p1',name:'The Benson Christmas',description:'Thoughtful gifts, familiar faces, and a little Christmas magic. Our family gift exchange.',budget:15000,currency:'NGN',exchange_date:'2026-12-25',registration_deadline:'2026-12-10',picking_deadline:'2026-12-20',status:'registration_open',round:0,members:[{...members[0],id:'f1'},{...members[1],id:'f2'}],entries:[],selections:[],exclusions:[],created_at:'2026-11-17'}],invitations:[],logs:[{id:rid(),action:'event.open_picking',actor:'Collins Benson',event_name:'Christmas at Princeps',created_at:new Date().toISOString()}],notifications:[]};
}
function read(){const saved=localStorage.getItem(KEY);if(saved){try{return JSON.parse(saved);}catch{}}const state=initial();localStorage.setItem(KEY,JSON.stringify(state));return state;}
function save(state:any){localStorage.setItem(KEY,JSON.stringify(state));}
export function previewUsers(){return read().users;}
export function resetPreview(){localStorage.removeItem(KEY);}
export async function request(path:string,method='GET',body?:any,admin=false):Promise<any>{
 if(API){const token=sessionStorage.getItem(admin?'santa-admin-token':'santa-token');return fetchJson(API+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})},path==='/me'||path.startsWith('/auth/')?90000:20000);}
 const run=()=>demo(path,method,body,admin);
 if(navigator.locks)return navigator.locks.request('secret-santa-preview',run);
 return run();
}
function demo(path:string,method:string,body:any,admin:boolean){
 const state=read();const current=sessionStorage.getItem('santa-preview-user')||'p1';const user=state.users.find((u:any)=>u.id===current)||state.users[0];
 const log=(action:string,event?:any)=>state.logs.unshift({id:rid(),action,actor:admin?'Preview administrator':user.name,event_name:event?.name||'',created_at:new Date().toISOString()});
 const summary=(e:any)=>({...e,members:undefined,entries:undefined,selections:undefined,exclusions:undefined,member_preview:e.members.slice(0,3).map((m:any)=>m.name),member_count:e.members.length,picked_count:e.selections.length});
 const own=(e:any,m:any)=>{const pick=e.selections.find((s:any)=>s.giverId===m?.id);if(!pick)return null;const entry=e.entries.find((x:any)=>x.number===pick.number);const recipient=e.members.find((x:any)=>x.id===entry.recipientId);return {number:pick.number,name:recipient.name,wishlist:recipient.wishlist};};
 let result:any={ok:true};
 if(path==='/me')return user;
 if(path==='/auth/logout')return result;
 if(path==='/events'&&method==='GET')return state.events.filter((e:any)=>e.organiser_id===user.id||e.members.some((m:any)=>m.user_id===user.id)).map(summary);
 if(path==='/events'&&method==='POST'){
  const e={id:rid(),organiser_id:user.id,name:body.name,description:body.description,budget:body.budget,currency:body.currency,exchange_date:body.exchangeDate,registration_deadline:body.registrationDeadline,picking_deadline:body.pickingDeadline,status:'registration_open',round:0,members:[{id:rid(),user_id:user.id,name:user.name,email:user.email,wishlist:'',gift_ready:false}],entries:[],selections:[],exclusions:[],created_at:new Date().toISOString()};state.events.unshift(e);log('event.created',e);result={id:e.id};
 }else if(path==='/admin/overview')return {stats:{users:state.users.length,events:state.events.length,active:state.events.filter((e:any)=>['picking_open','exchange_active'].includes(e.status)).length,failed:0},events:state.events.map((e:any)=>({...summary(e),organiser_name:state.users.find((u:any)=>u.id===e.organiser_id)?.name})),users:state.users,logs:state.logs,notifications:state.notifications};
 else if(path.startsWith('/admin/users/')){const u=state.users.find((u:any)=>u.id===path.split('/')[3]);if(u){u.suspended=body.suspended;log(body.suspended?'user.suspended':'user.restored');}}
 else if(path==='/invitations/accept'){
  const invite=state.invitations.find((i:any)=>i.token===body.invitation);if(!invite)throw new Error('Invitation not found in this preview browser.');const e=state.events.find((e:any)=>e.id===invite.eventId);if(e.status!=='registration_open')throw new Error('Registration is closed.');if(invite.email&&invite.email.toLowerCase()!==user.email.toLowerCase())throw new Error('Switch to the invited participant in the preview profile menu.');if(!e.members.some((m:any)=>m.user_id===user.id))e.members.push({id:rid(),user_id:user.id,name:user.name,email:user.email,wishlist:'',gift_ready:false});result={id:e.id};log('member.joined',e);
 }else if(path.startsWith('/events/')){
  const [, ,eventId,action]=path.split('/');const e=state.events.find((e:any)=>e.id===eventId);if(!e)throw new Error('Event not found.');const m=e.members.find((m:any)=>m.user_id===user.id);if(!m&&e.organiser_id!==user.id)throw new Error('You are not a member of this exchange.');
  if(method!=='GET'&&!['pick','wishlist','gift'].includes(action)&&e.organiser_id!==user.id)throw new Error('Only the organiser can do this.');
  if(!action)return {...summary(e),members:e.members.map((m:any)=>({id:m.id,name:m.name,email:e.organiser_id===user.id?m.email:undefined,gift_ready:m.gift_ready,picked:e.selections.some((s:any)=>s.giverId===m.id)})),exclusions:e.organiser_id===user.id?e.exclusions:[],myMemberId:m?.id,myWishlist:m?.wishlist||'',giftReady:!!m?.gift_ready,recipient:own(e,m)};
  if(action==='pool'){
   const eligible=e.status==='picking_open'?eligibleNumbers(e.members,e.entries,e.selections,e.exclusions,m?.id):[];return {numbers:e.entries.map((entry:any)=>({number:entry.number,status:e.selections.some((s:any)=>s.number===entry.number)?'taken':eligible.includes(entry.number)?'available':'unavailable'})),recipient:own(e,m)};
  }
  if(action==='pick'){
   if(!m)throw new Error('Join the event first.');const old=e.selections.find((s:any)=>s.giverId===m.id);if(old)return {number:old.number,alreadyPicked:true};if(e.status!=='picking_open')throw new Error('Picking is closed.');const eligible=eligibleNumbers(e.members,e.entries,e.selections,e.exclusions,m.id);if(!eligible.includes(body.number))throw new Error('This number is no longer available for your selection.');e.selections.push({giverId:m.id,number:body.number});if(e.selections.length===e.members.length)e.status='exchange_active';log('number.picked',e);result={number:body.number};
  }else if(action==='wishlist'){if(!m)throw new Error('Join first.');m.wishlist=body.wishlist;}
  else if(action==='gift'){if(!m||!own(e,m))throw new Error('Pick a number first.');m.gift_ready=body.ready;}
  else if(action==='status'){
   const a=body.action;
   if(a==='close'&&e.status==='registration_open')e.status='registration_closed';
   else if(a==='reopen'&&e.status==='registration_closed')e.status='registration_open';
   else if(a==='open_picking'&&e.status==='registration_closed'){e.entries=preparePool(e.members,e.exclusions,(n:number)=>crypto.getRandomValues(new Uint32Array(1))[0]%n);e.selections=[];e.round++;e.status='picking_open';}
   else if(a==='complete'&&e.status==='exchange_active')e.status='completed';
   else if(a==='cancel'&&!['completed','cancelled'].includes(e.status))e.status='cancelled';
   else if(a==='reset'&&body.acknowledge&&['picking_open','exchange_active'].includes(e.status)){e.status='registration_closed';e.entries=[];e.selections=[];e.members.forEach((m:any)=>m.gift_ready=false);}
   else throw new Error('This action is unavailable at the current event stage.');log(`event.${a}`,e);
  }else if(action==='invitations'){if(e.status!=='registration_open')throw new Error('Registration is closed.');const token=rid();state.invitations.push({eventId:e.id,token,email:body.email});result={link:`${location.origin}/?invite=${token}`,emailQueued:false};log('invitation.created',e);}
  else if(action==='exclusions'){if(!['registration_open','registration_closed'].includes(e.status))throw new Error('Exclusions are locked.');if(method==='DELETE')e.exclusions=[];else{if(body.giverId===body.recipientId)throw new Error('Choose two different people.');e.exclusions.push({giverId:body.giverId,recipientId:body.recipientId});if(body.mutual)e.exclusions.push({giverId:body.recipientId,recipientId:body.giverId});}log('exclusions.updated',e);}
  else if(action==='reminders'){if(e.status!=='picking_open')throw new Error('Picking is closed.');result={queued:e.members.length-e.selections.length};log('reminders.queued',e);}
  else if(action==='deadline'){e.picking_deadline=body.pickingDeadline;log('deadline.updated',e);}
 }
 save(state);return result;
}
