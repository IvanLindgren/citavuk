const KEY='citavuk-donation-claim-link';
let memory='';
export function takeGuestDonationLink():string{
  const token=new URLSearchParams(location.hash.slice(1)).get('token');
  if(token!==null&&!/^ctv_[A-Za-z0-9_-]{43}$/.test(token)){clearGuestDonationLink();return '';}
  if(token&&/^ctv_[A-Za-z0-9_-]{43}$/.test(token)){
    memory=token;
    try{sessionStorage.setItem(KEY,token);history.replaceState(history.state,'',location.pathname+location.search);}catch{/* После входа можно снова открыть письмо. */}
  }
  // Новая ссылка важнее прежней, даже если браузер запретил запись в storage.
  if(memory)return memory;
  try{return sessionStorage.getItem(KEY)||'';}catch{return '';}
}
export function clearGuestDonationLink(){memory='';try{sessionStorage.removeItem(KEY);}catch{/* Приватное окно. */}history.replaceState(history.state,'',location.pathname+location.search);}
