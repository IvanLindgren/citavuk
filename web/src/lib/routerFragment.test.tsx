import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { RouterProvider } from './router';

afterEach(() => { history.replaceState(null, '', '/'); });
it('preserves an email fragment until its lazy route reads it', async () => {
  history.replaceState(null, '', '/support/claim#token=fixture');
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {
    await act(async()=>root.render(<RouterProvider><div>Пока загружается экран</div></RouterProvider>));
    expect(location.hash).toBe('#token=fixture');
    expect(history.state.citavukIndex).toBe(0);
  } finally {await act(async()=>root.unmount());host.remove();}
});
