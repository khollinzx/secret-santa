import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),args=process.argv.slice(2);
const value=(flag,fallback)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:fallback;};
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev','apps/web','--hostname',value('--host','0.0.0.0'),'--port',value('--port','3000')],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code||0));
