import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {RouterProvider,useRouter} from './router';
function Page(){const {path,navigate}=useRouter();return <><span>{path}</span><button onClick={()=>navigate('/course')}>Курс</button></>;}
it('отмена перехода сохраняет адрес и текущую страницу',async()=>{
 window.history.replaceState(null,'','/personal');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const block=(event:Event)=>event.preventDefault();
 try{
  await act(async()=>root.render(<RouterProvider><Page/></RouterProvider>));
  window.addEventListener('citavuk-before-navigate',block);
  await act(async()=>host.querySelector('button')!.click());
  expect(location.pathname).toBe('/personal');expect(host.querySelector('span')!.textContent).toBe('/personal');
  window.removeEventListener('citavuk-before-navigate',block);
  await act(async()=>host.querySelector('button')!.click());expect(location.pathname).toBe('/course');
 }finally{window.removeEventListener('citavuk-before-navigate',block);await act(async()=>root.unmount());host.remove();}
});
