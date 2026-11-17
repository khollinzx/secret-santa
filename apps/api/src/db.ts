import pg, {PoolClient} from 'pg';
if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL with the Supabase PostgreSQL session-pooler connection string.');
const connection=new URL(process.env.DATABASE_URL);
if(!['postgres:','postgresql:'].includes(connection.protocol))throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
// Preserve calendar dates; the event API compares YYYY-MM-DD strings.
pg.types.setTypeParser(1082,value=>value);
// Verify TLS certificates for Supabase and other hosted databases.
const ssl=connection.hostname==='localhost'||connection.hostname==='127.0.0.1'||(connection.hostname==='postgres'&&process.env.DATABASE_SSL==='disable')?undefined:{rejectUnauthorized:true,...(process.env.DATABASE_SSL_CA?{ca:process.env.DATABASE_SSL_CA}:{})};
// URL sslmode settings must not silently replace the explicit TLS verification config.
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])connection.searchParams.delete(key);
export const db=new pg.Pool({connectionString:connection.toString(),ssl,max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,options:'-c search_path=secret_santa,public -c timezone=UTC'});
export async function rows(sql:string,args:any[]=[],conn:any=db):Promise<any[]>{return (await conn.query(sql,args)).rows;}
export async function transaction<T>(fn:(conn:PoolClient)=>Promise<T>):Promise<T>{const conn=await db.connect();try{await conn.query('BEGIN');const result=await fn(conn);await conn.query('COMMIT');return result;}catch(error){await conn.query('ROLLBACK');throw error;}finally{conn.release();}}
