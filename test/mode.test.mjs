import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const modules=process.env.PI_NODE_MODULES;
const root=fileURLToPath(new URL('../',import.meta.url));
async function host(t,{active=['read','bash'],saved,registered=['read','bash','edit','write']}={}) {
 const base=resolve(modules,'@earendil-works/pi-coding-agent/dist');
 const {loadExtensions,createExtensionRuntime}=await import(pathToFileURL(resolve(base,'core/extensions/loader.js')).href);
 const {createEventBus}=await import(pathToFileURL(resolve(base,'core/event-bus.js')).href);
 const runtime=createExtensionRuntime(),bus=createEventBus();
 let tools=[...active],branch=saved?[{type:'custom',customType:'ro-rw-mode-state',data:saved}]:[];
 Object.assign(runtime,{getActiveTools:()=>tools,getAllTools:()=>registered.map(name=>({name})),setActiveTools:v=>tools=v,appendEntry:(customType,data)=>branch.push({type:'custom',customType,data}),sendMessage(){}});
 const loaded=await loadExtensions([resolve(root,'index.ts')],root,bus,runtime);assert.deepEqual(loaded.errors,[]);
 const extension=loaded.extensions[0];
 const ctx={sessionManager:{getBranch:()=>branch},ui:{setFooter(){},setStatus(){},notify(){}}};
 const emit=async(name)=>{for(const handler of extension.handlers.get(name)??[])await handler({},ctx);};
 t.after(async()=>{await emit('session_shutdown');runtime.invalidate();});
 return {start:()=>emit('session_start'),tree:data=>{branch=data?[{type:'custom',customType:'ro-rw-mode-state',data}]:[];return emit('session_tree');},command:name=>extension.commands.get(name).handler('',ctx),tools:()=>tools,setTools:v=>tools=v};
}

test('legacy RO and empty hiddenWrites recover available write tools', {skip:!modules}, async t=>{
 for(const saved of [{mode:'ro'},{mode:'ro',hiddenWrites:[]},{mode:'rw',hiddenWrites:[]}]) {
  const h=await host(t,{saved});await h.start();
  if(saved.mode==='ro'){assert.deepEqual(h.tools(),['read','bash']);await h.command('rw');}
  assert.deepEqual(h.tools(),['read','bash','edit','write']);
 }
});
test('repeated RW repairs missing tools and preserves new extension tools', {skip:!modules}, async t=>{
 const h=await host(t);await h.start();h.setTools(['read','bash','light_subagent']);await h.command('rw');
 assert.deepEqual(h.tools(),['read','bash','light_subagent','edit','write']);
 await h.command('ro');h.setTools([...h.tools(),'other']);await h.command('rw');
 assert.ok(h.tools().includes('other'));assert.ok(h.tools().includes('light_subagent'));assert.ok(h.tools().includes('edit'));
});
test('reload/resume in RO with tools already removed can still restore RW', {skip:!modules}, async t=>{
 const first=await host(t,{active:['read','bash','edit','write'],saved:{mode:'ro'}});await first.start();
 const second=await host(t,{active:first.tools(),saved:{mode:'ro',hiddenWrites:[]}});await second.start();await second.command('rw');
 assert.deepEqual(second.tools(),['read','bash','edit','write']);
});
test('tool registry boundaries and current branch are respected', {skip:!modules}, async t=>{
 const h=await host(t,{registered:['read','bash']});await h.start();await h.command('rw');assert.deepEqual(h.tools(),['read','bash']);
 const b=await host(t,{active:['read','bash','edit','write']});await b.start();await b.tree({mode:'ro'});assert.deepEqual(b.tools(),['read','bash']);
 await b.tree({mode:'rw',hiddenWrites:[]});assert.deepEqual(b.tools(),['read','bash','edit','write']);
});
