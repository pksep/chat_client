export const searchMessages = [
  { id: 'search-local-1', text: 'Локальный поиск: первое сообщение' },
  { id: 'search-local-2', text: 'Локальный поиск: второе сообщение' },
  { id: 'search-another', text: 'Другая строка для смены запроса' }
].map((item, index) => ({
  ...item,
  topicId: 'search-topic',
  senderUserId: 'search-peer',
  senderUser: { id: 'search-peer', initials: 'Собеседник' },
  createdAt: new Date(Date.UTC(2026, 9, 26, 0, 0, index)).toISOString(),
  type: 'TEXT',
  status: 'READ',
  media: [],
  isReadByMe: true
}));
