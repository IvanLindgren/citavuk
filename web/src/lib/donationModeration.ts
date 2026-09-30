import type { AdminDonation } from '../api/donations';

export function donationMessageModeration(d: Pick<AdminDonation, 'message'|'showPublic'|'publicName'|'showMessage'|'messageApproved'|'isTest'|'status'>) {
  if (!d.message.trim()) return { label: 'Сообщения нет', canModerate: false };
  if (!d.showMessage) return { label: 'Только разработчику, автор не разрешил публикацию', canModerate: false };
  if (!d.showPublic || !d.publicName.trim()) return { label: 'Публикация недоступна, имя скрыто', canModerate: false };
  if (d.isTest) return { label: 'Тестовый платёж, сообщение не публикуется', canModerate: false };
  if (d.status !== 'succeeded') return { label: 'Публикация недоступна, оплата не подтверждена или возвращена', canModerate: false };
  return { label: d.messageApproved ? 'Публикация разрешена' : 'Ожидает твоей проверки', canModerate: true };
}
