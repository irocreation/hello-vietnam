const {VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:key}=process.env;
let validKey=key?.startsWith('sb_publishable_');
if(!validKey&&key){try{validKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon'}catch{}}
if(!url?.startsWith('https://')||!validKey){console.error('Set VITE_SUPABASE_URL and a publishable/anon key. Never use a service_role or secret key.');process.exit(1)}
