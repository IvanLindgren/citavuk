import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Reader } from './Reader';
import { RouterProvider } from '../lib/router';

vi.mock('../lib/router', async original => ({...await original<typeof import('../lib/router')>(),useParams:()=>({id:'audio-scroll-fixture'})}));
vi.mock('../state/auth',()=>({useAuth:()=>({account:null})}));
vi.mock('../state/sync',()=>({useSync:()=>({revision:0,sync:vi.fn()})}));
vi.mock('../state/announcements',()=>({useAnnouncements:()=>({rewards:[]})}));
vi.mock('../lib/books',()=>({getBook:async()=>({id:'audio-scroll-fixture',title:'Проверка',sourceKey:'fixture',lastParagraph:0}),getParagraphs:async()=>['Prva rečenica. Druga rečenica. Treća rečenica.'],saveProgress:vi.fn()}));
vi.mock('../lib/readerQuotes',()=>({listReaderQuotes:async()=>[],quoteColor:()=>'',deleteReaderQuote:vi.fn(),saveReaderQuote:vi.fn(),recolorReaderQuote:vi.fn()}));
vi.mock('../components/BookLevelNotice',()=>({BookLevelNotice:()=>null}));
vi.mock('../components/ShareBook',()=>({ShareBook:()=>null}));
vi.mock('../components/Discussion',()=>({Discussion:()=>null}));
vi.mock('../components/Mascot',()=>({Mascot:()=>null}));
vi.mock('../components/WordReader',()=>({WordReader:({paragraphs}:{paragraphs:string[]})=><div>{paragraphs.join(' ')}</div>}));

const audioInstances: FakeAudio[]=[];
class FakeAudio {
  playbackRate=1;paused=true;ended=false;duration=10;currentTime=0;
  onplay:(()=>void)|null=null;onpause:(()=>void)|null=null;onended:(()=>void)|null=null;ontimeupdate:(()=>void)|null=null;
  constructor(){audioInstances.push(this);}
  play(){this.paused=false;this.onplay?.();return Promise.resolve();}
  pause(){this.paused=true;this.onpause?.();}
}
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();audioInstances.length=0;});

it.each([false,true])('does not rewind the same page at sentence boundaries, follow=%s',async follow=>{
  localStorage.setItem('citavuk-reader-settings',JSON.stringify({audioFollow:follow}));
  vi.stubGlobal('Audio',FakeAudio);
  const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {
    await act(async()=>{root.render(<RouterProvider><Reader /></RouterProvider>);});
    const start=host.querySelector<HTMLButtonElement>('button[title="Аудиокнига"]')!;
    expect(start).not.toBeNull();
    await act(async()=>start.click());
    scroll.mockClear();
    await act(async()=>audioInstances.at(-1)!.onended?.());
    await act(async()=>audioInstances.at(-1)!.onended?.());
    expect(audioInstances).toHaveLength(3);
    expect(scroll).not.toHaveBeenCalled();
    expect(host.querySelector('input[type="checkbox"]')).not.toBeNull();
    const toggle=[...host.querySelectorAll('label')].find(label=>label.textContent?.includes('Автопрокрутка при озвучке'))!.querySelector<HTMLInputElement>('input')!;
    expect(toggle.checked).toBe(follow);
    await act(async()=>toggle.click());
    expect(JSON.parse(localStorage.getItem('citavuk-reader-settings')!).audioFollow).toBe(!follow);
    expect(scroll).not.toHaveBeenCalled();
  } finally {act(()=>root.unmount());host.remove();scroll.mockRestore();}
});
