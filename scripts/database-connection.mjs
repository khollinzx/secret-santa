const hints = {
 ENETUNREACH: 'The database network is unreachable. Use the Supabase session pooler from Connect when the direct host requires IPv6.',
 EHOSTUNREACH: 'The database host is unreachable. Check the selected Supabase connection endpoint.',
 ENOTFOUND: 'The database hostname could not be resolved. Check the hostname from Supabase Connect.',
 EAI_AGAIN: 'Database DNS lookup failed temporarily.',
 ECONNREFUSED: 'The database refused the connection. Check the endpoint, port, and project status.',
 ETIMEDOUT: 'The database connection timed out. Check the connection endpoint and database network restrictions.',
 SELF_SIGNED_CERT_IN_CHAIN: 'TLS certificate verification failed. Configure DATABASE_SSL_CA with the trusted Supabase CA certificate.',
 DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS certificate verification failed. Configure DATABASE_SSL_CA with the trusted Supabase CA certificate.',
 UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS certificate verification failed. Configure DATABASE_SSL_CA with the trusted Supabase CA certificate.',
 CERT_HAS_EXPIRED: 'The database TLS certificate has expired. Check the certificate chain.',
 ERR_TLS_CERT_ALTNAME_INVALID: 'The database TLS certificate does not match the hostname. Use the exact hostname from Supabase Connect.',
 '28P01': 'Database authentication failed. Check the database password and pooler username; URL-encode special password characters.',
 '28000': 'Database authentication was rejected. Check the configured database user.',
 '3D000': 'The configured database does not exist. Check the database name in DATABASE_URL.',
};
const permanent = new Set(['28P01','28000','3D000','ENOTFOUND','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID']);
export function connectionDiagnostic(error, connectionString) {
 let host = 'unknown', port = '5432';
 try {const url = new URL(connectionString);host = url.hostname;port = url.port || port;} catch {}
 const failures = error?.errors?.length ? error.errors : [error];
 const codes = [...new Set(failures.map(item => /^[A-Z0-9_]{2,64}$/.test(item?.code || '') ? item.code : 'CONNECTION_FAILED'))];
 const hint = codes.map(code => hints[code]).find(Boolean) || 'Check DATABASE_URL, TLS certificate configuration, and Supabase network access.';
 // Never log the URL, username, password, or arbitrary error message.
 return {message: `PostgreSQL connection failed: ${codes.join(', ')}; endpoint ${host}:${port}. ${hint}`, retryable: !codes.some(code => permanent.has(code))};
}
export async function connectDatabase(pool, connectionString, {attempts = 5, delayMs = 2000, log = console.error} = {}) {
 for (let attempt = 0; attempt < attempts; attempt++) {
  try {return await pool.connect();}
  catch (error) {
   const diagnostic = connectionDiagnostic(error, connectionString);
   if (attempt === 0) log(diagnostic.message);
   if (!diagnostic.retryable || attempt === attempts - 1) throw new Error(diagnostic.message);
   await new Promise(resolve => setTimeout(resolve, delayMs));
  }
 }
}
