import {useEffect,useState} from 'react';
import type {BookMeta} from '../lib/books';
import {copyGuestBooks,listGuestBooks} from '../lib/guestBooks';
import {Button,Card,ErrorNote} from './ui';

export function GuestBooksImport({accountId,onImported}:{accountId:string;onImported:()=>Promise<void>}){
  const [books,setBooks]=useState<BookMeta[]>([]),[selected,setSelected]=useState<string[]>([]);
  const [expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let current=true;setBooks([]);setSelected([]);void listGuestBooks(accountId).then(list=>{if(current)setBooks(list);}).catch(()=>{});return()=>{current=false;};},[accountId]);
  async function copy(){
    setBusy(true);setError('');
    try{await copyGuestBooks(accountId,selected);await onImported();setBooks(await listGuestBooks(accountId));setSelected([]);}
    catch(e){setError(e instanceof Error?e.message:'Не удалось добавить книги');}
    finally{setBusy(false);}
  }
  if(!books.length)return null;
  return <Card className="mb-6 p-5"><h2 className="text-xl">Книги из этого браузера</h2>
    <p className="my-3 text-sm text-[var(--text-muted)]">Здесь остались книги, добавленные без входа Выбери свои, чтобы читать их с этого аккаунта на других устройствах</p>
    {!expanded?<Button variant="secondary" onClick={()=>setExpanded(true)}>Выбрать книги</Button>:<>
      <div className="max-h-64 space-y-3 overflow-auto py-3">{books.map(book=><label key={book.id} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={selected.includes(book.id)} disabled={busy} onChange={e=>setSelected(ids=>e.target.checked?[...ids,book.id]:ids.filter(id=>id!==book.id))} className="mt-1 size-4 shrink-0"/><span className="min-w-0 break-words">{book.title}</span></label>)}</div>
      <Button disabled={busy||!selected.length} onClick={()=>void copy()}>{busy?'Добавляем':'Добавить в мой аккаунт'}</Button>
    </>}
    {error&&<div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
  </Card>;
}
