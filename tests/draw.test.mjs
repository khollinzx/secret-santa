import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canFinish,eligibleNumbers,preparePool} from '../packages/domain/draw.mjs';
const members=['a','b','c','d','e'].map(id=>({id}));
const pool=members.map((m,i)=>({number:i+1,recipientId:m.id}));
test('every possible allowed selection path finishes without self or duplicate picks',()=>{
 function walk(selections){if(selections.length===members.length){assert.equal(new Set(selections.map(s=>s.number)).size,5);return;}
 for(const m of members.filter(m=>!selections.some(s=>s.giverId===m.id))){const choices=eligibleNumbers(members,pool,selections,[],m.id);assert.ok(choices.length);for(const n of choices){assert.notEqual(pool[n-1].recipientId,m.id);walk([...selections,{giverId:m.id,number:n}]);}}
 }walk([]);
});
test('blocks a locally valid choice that strands the remaining participant',()=>{
 const three=members.slice(0,3), entries=pool.slice(0,3);
 assert.deepEqual(eligibleNumbers(three,entries,[{giverId:'a',number:2}],[],'b'),[3]);
});
test('exclusions are directional and impossible rules fail',()=>{
 const exclusions=[{giverId:'a',recipientId:'b'}];assert.ok(!eligibleNumbers(members,pool,[],exclusions,'a').includes(2));
 assert.throws(()=>preparePool(members,members.slice(1).map(m=>({giverId:'a',recipientId:m.id})),()=>0),/prevent/);
});
test('taken numbers and repeat pickers are unavailable',()=>{
 const selections=[{giverId:'a',number:2}];assert.deepEqual(eligibleNumbers(members,pool,selections,[],'a'),[]);assert.ok(!eligibleNumbers(members,pool,selections,[],'c').includes(2));
});
test('pool is a permutation and supports large exchanges',()=>{
 const large=Array.from({length:100},(_,i)=>({id:String(i)}));const entries=preparePool(large,[],max=>max-1);assert.equal(new Set(entries.map(e=>e.recipientId)).size,100);assert.ok(canFinish(large,entries));
});
test('rejects small groups and nonmember selections',()=>{assert.throws(()=>preparePool(members.slice(0,2),[],()=>0),/three/);assert.deepEqual(eligibleNumbers(members,pool,[],[],'outsider'),[]);});
