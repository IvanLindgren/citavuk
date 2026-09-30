import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FeedLevelPicker } from './FeedLevelPicker';

it('offers accessible A1-C1 choices and automatic account level', () => {
  const change = vi.fn();
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {
    act(() => root.render(<FeedLevelPicker value="A2" automatic="B2" onChange={change} />));
    const select=host.querySelector('select')!;
    expect(select.getAttribute('aria-label')).toBe('Уровень Вукотока');
    expect(select.querySelectorAll('option')).toHaveLength(6);
    act(() => { select.value='A1';select.dispatchEvent(new Event('change',{bubbles:true})); });
    expect(change).toHaveBeenLastCalledWith('A1');
    act(() => { select.value='';select.dispatchEvent(new Event('change',{bubbles:true})); });
    expect(change).toHaveBeenLastCalledWith(undefined);
  } finally {act(() => root.unmount());host.remove();}
});
