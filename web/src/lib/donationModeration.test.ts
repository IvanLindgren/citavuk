import { expect, it } from 'vitest';
import { donationMessageModeration } from './donationModeration';

const donation={message:'Спасибо',showPublic:true,publicName:'Друг',showMessage:true,messageApproved:false,isTest:false,status:'succeeded' as const};
it('distinguishes private messages from the moderation queue',()=>{
  expect(donationMessageModeration({...donation,showMessage:false})).toEqual({label:'Только разработчику, автор не разрешил публикацию',canModerate:false});
  expect(donationMessageModeration(donation)).toEqual({label:'Ожидает твоей проверки',canModerate:true});
  expect(donationMessageModeration({...donation,messageApproved:true}).label).toBe('Публикация разрешена');
});
it('does not offer approval for blank, anonymous, test or refunded messages',()=>{
  for(const patch of [{message:' '},{showPublic:false},{publicName:''},{isTest:true},{status:'refunded' as const}])expect(donationMessageModeration({...donation,...patch}).canModerate).toBe(false);
});
