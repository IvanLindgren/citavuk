import { type BookMeta } from './books';
import { contentSha } from './content';
import { activeStorageName, openGuestStorage, get, getAll, getAllByIndex, getMeta, put, tx, STORE_BOOKS, STORE_CONTENT, STORE_META, STORE_QUOTES } from './db';
import type { ReaderQuote } from './readerQuotes';

const copiedKey=(book:BookMeta)=>`guest-book-copy:${book.id}:${book.contentSha}`;
const accountScope=(id:string)=>`citavuk-user-${encodeURIComponent(id)}`;

export async function listGuestBooks(accountId:string):Promise<BookMeta[]> {
  if(activeStorageName()!==accountScope(accountId))return [];
  const db=await openGuestStorage();
  try {
    const books=await getAll<BookMeta>(db.transaction(STORE_BOOKS,'readonly'),STORE_BOOKS);
    const result:BookMeta[]=[];
    for(const book of books){
      if(activeStorageName()!==accountScope(accountId))return [];
      if(!book.deleted&&!book.textMissing&&book.paragraphCount>0&&!await getMeta(copiedKey(book),''))result.push(book);
    }
    return result;
  } finally {db.close();}
}

/** Только явно выбранные книги; оригиналы остаются в гостевой библиотеке. */
export async function copyGuestBooks(accountId:string,ids:string[]):Promise<void> {
  const scope=accountScope(accountId);
  const checkScope=()=>{if(activeStorageName()!==scope)throw new Error('Аккаунт сменился Открой библиотеку и выбери книги снова');};
  checkScope();
  const db=await openGuestStorage();
  try {
    for(const id of new Set(ids)){
      checkScope();
      const read=db.transaction([STORE_BOOKS,STORE_CONTENT,STORE_QUOTES],'readonly');
      const [book,content,quotes]=await Promise.all([
        get<BookMeta>(read,STORE_BOOKS,id),
        get<{paragraphs:string[]}>(read,STORE_CONTENT,id),
        getAllByIndex<ReaderQuote>(read,STORE_QUOTES,'bookId',id),
      ]);
      if(!book||book.deleted||!content?.paragraphs?.length)throw new Error('Текст книги не найден в этом браузере');
      const hash=await contentSha(content.paragraphs);
      checkScope();
      const freshId=crypto.randomUUID(),now=Date.now();
      await tx([STORE_BOOKS,STORE_CONTENT,STORE_META,STORE_QUOTES],'readwrite',async transaction=>{
        checkScope();
        if(await get(transaction,STORE_META,copiedKey(book)))return;
        checkScope();
        await put(transaction,STORE_BOOKS,{...book,id:freshId,contentSha:hash,contentUploaded:false,contentTooLarge:false,textMissing:false,dirty:1,deleted:0,updatedAt:now});
        await put(transaction,STORE_CONTENT,{id:freshId,paragraphs:content.paragraphs});
        for(const quote of quotes.filter(q=>!q.deleted))await put(transaction,STORE_QUOTES,{...quote,id:crypto.randomUUID(),bookId:freshId,dirty:1,updatedAt:now});
        await put(transaction,STORE_META,{key:copiedKey(book),value:freshId});
      });
    }
  } finally {db.close();}
}
