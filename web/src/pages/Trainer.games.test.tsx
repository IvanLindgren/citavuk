import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TopicPicker } from './Trainer';
const auth=vi.hoisted(()=>({account:null as {supporterSince?:string;isAdmin?:boolean}|null}));
vi.mock('../state/auth',()=>({useAuth:()=>auth}));
vi.mock('../lib/router',()=>({Link:({to,children,...props}:{to:string;children:React.ReactNode})=><a href={to} {...props}>{children}</a>}));
vi.mock('../course/CourseSprite',()=>({CourseSprite:()=>null}));
const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
afterEach(()=>{act(()=>root.unmount());root=createRoot(host);auth.account=null;});
it('shows supporter games only in the correct trainer domain',()=>{
 auth.account={supporterSince:'2026-09-30'};act(()=>root.render(<TopicPicker topics={[]}/>));
 expect(host.querySelector('a[href="/padezi"]')).not.toBeNull();
 const buttons=host.querySelectorAll('button');act(()=>buttons[1]!.click());
 expect(host.querySelector('a[href="/govori?mode=speak"]')).not.toBeNull();expect(host.querySelector('a[href="/padezi"]')).toBeNull();
 act(()=>buttons[2]!.click());expect(host.querySelector('a[href="/govori?mode=write"]')).not.toBeNull();
});
it('does not advertise locked games to guests or ordinary accounts',()=>{
 for(const account of [null,{}]){auth.account=account;act(()=>root.render(<TopicPicker topics={[]}/>));expect(host.querySelector('a[href="/padezi"],a[href^="/govori"]')).toBeNull();}
});
it('keeps the game entry for administrators without a donation',()=>{
 auth.account={isAdmin:true};act(()=>root.render(<TopicPicker topics={[]}/>));expect(host.querySelector('a[href="/padezi"]')).not.toBeNull();
 auth.account={};act(()=>root.render(<TopicPicker topics={[]}/>));expect(host.querySelector('a[href="/padezi"]')).toBeNull();
});
