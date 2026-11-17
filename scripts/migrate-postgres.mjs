import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {db} from '../apps/api/dist/db.js';
const sql=await readFile(new URL('../database/001_initial.sql',import.meta.url),'utf8');
const checksum=createHash('sha256').update(sql).digest('hex');
let client;
try{
 for(let attempt=0;;attempt++){try{client=await db.connect();break;}catch{if(attempt>=29)throw new Error('PostgreSQL connection failed. Check DATABASE_URL and Supabase availability.');await new Promise(r=>setTimeout(r,2000));}}
 await client.query('SELECT pg_advisory_lock(17311001)');
 await client.query('BEGIN');
 await client.query('CREATE SCHEMA IF NOT EXISTS secret_santa');
 await client.query('CREATE TABLE IF NOT EXISTS secret_santa.schema_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 await client.query('ALTER TABLE secret_santa.schema_migrations ENABLE ROW LEVEL SECURITY');
 const previous=await client.query('SELECT checksum FROM secret_santa.schema_migrations WHERE version=$1',['001_initial']);
 if(previous.rows.length&&previous.rows[0].checksum!==checksum)throw new Error('The applied initial migration has changed. Create a new version instead of overwriting the database schema.');
 if(!previous.rows.length){await client.query(sql);await client.query('INSERT INTO secret_santa.schema_migrations(version,checksum) VALUES($1,$2)',['001_initial',checksum]);}
 await client.query('COMMIT');
 console.log('PostgreSQL schema is up to date.');
}catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});console.error(error instanceof Error?error.message:'Database migration failed.');process.exitCode=1;}
finally{if(client){await client.query('SELECT pg_advisory_unlock(17311001)').catch(()=>{});client.release();}await db.end();}
