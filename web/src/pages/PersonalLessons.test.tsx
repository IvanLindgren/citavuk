import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Questionnaire } from './PersonalLessons';

let host: HTMLDivElement, root: Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it('даёт выбрать несколько целей, отменить выбор и отправляет их модели',async()=>{
 const onCreate=vi.fn().mockResolvedValue(undefined);
 await act(()=>root.render(<Questionnaire defaultLevel="B1" disabled={false} questions={[{id:'goal',title:'Цели',multiple:true,options:['Работа','Культура']}]} onCreate={onCreate}/>));
 const choices=host.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
 expect(choices).toHaveLength(2);
 await act(()=>choices[0]!.click());await act(()=>choices[1]!.click());
 expect(choices[0]!.checked&&choices[1]!.checked).toBe(true);
 await act(()=>choices[0]!.click());expect(choices[1]!.checked).toBe(true);
 await act(()=>choices[0]!.click());
 await act(()=>host.querySelectorAll<HTMLButtonElement>('button')[1]!.click());
 expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({level:'B1',answers:{goal:'Работа\nКультура'}}));
});
it('вопрос с одним ответом остаётся радиогруппой',async()=>{
 await act(()=>root.render(<Questionnaire defaultLevel="A1" disabled={false} questions={[{id:'pace',title:'Темп',options:['Тихо','Быстро']}]} onCreate={vi.fn()}/>));
 expect(host.querySelectorAll('input[type=radio]')).toHaveLength(2);
 expect(host.querySelector('input[type=checkbox]')).toBeNull();
});
