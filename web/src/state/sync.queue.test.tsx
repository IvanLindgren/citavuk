import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({run:vi.fn(),account:{id:'fixture-account'}}));
vi.mock('../api/sync',()=>({runSync:mocks.run,resetForAccount:vi.fn(async()=>{}),pendingCount:vi.fn(async()=>0),lastSyncAt:vi.fn(async()=>0)}));
vi.mock('./auth',()=>({useAuth:()=>({account:mocks.account})}));
import {SyncProvider,useSync} from './sync';
function Probe(){const {sync}=useSync();return <button onClick={()=>void sync()}>Отправить книгу</button>;}
it('queues an import requested during an ongoing sync exactly once',async()=>{
 let finish:()=>void=()=>{};
 const report={sent:0,received:0,uploaded:0};
 mocks.run.mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve(report);})).mockResolvedValue(report);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<SyncProvider><Probe/></SyncProvider>));
  expect(mocks.run).toHaveBeenCalledTimes(1);
  await act(async()=>{host.querySelector('button')!.click();host.querySelector('button')!.click();});
  expect(mocks.run).toHaveBeenCalledTimes(1);
  await act(async()=>finish());
  expect(mocks.run).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());host.remove();}
});
