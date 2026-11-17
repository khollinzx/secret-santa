import mysql, {PoolConnection} from 'mysql2/promise';
const databaseOptions=process.env.DATABASE_URL?{uri:process.env.DATABASE_URL}:{
 host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),database:process.env.DB_DATABASE,
 user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,
};
if(!process.env.DATABASE_URL&&(!process.env.DB_HOST||!process.env.DB_DATABASE||!process.env.DB_USERNAME||!process.env.DB_PASSWORD))throw new Error('Configure DATABASE_URL or DB_HOST, DB_DATABASE, DB_USERNAME, and DB_PASSWORD.');
export const db = mysql.createPool({...databaseOptions,connectionLimit:10,dateStrings:true,timezone:'Z',connectTimeout:10000});
export async function rows(sql:string, args:any[] = [], conn:any = db):Promise<any[]> {return (await conn.execute(sql,args))[0] as any[];}
export async function transaction<T>(fn:(conn:PoolConnection)=>Promise<T>):Promise<T>{const conn=await db.getConnection();try{await conn.beginTransaction();const result=await fn(conn);await conn.commit();return result;}catch(error){await conn.rollback();throw error;}finally{conn.release();}}
