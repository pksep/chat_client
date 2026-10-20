export const TOPICS_PAGE_SIZE = 50;

export interface TopicPage<T> {
  data: T[];
  total?: number;
  totalPages?: number;
  meta?: { totalItems?: number; totalPages?: number; currentPage?: number };
  unreadTopics?: T[];
}

export const hasNextTopicPage = (
  response: TopicPage<unknown>,
  page: number,
  limit: number
): boolean => {
  const totalPages = response.meta?.totalPages ?? response.totalPages;
  if (Number.isFinite(totalPages)) return page < totalPages!;
  const total = response.meta?.totalItems ?? response.total;
  if (Number.isFinite(total)) return page * limit < total!;
  return response.data.length >= limit;
};

export const collectTopicPages = async <T extends { id: string }>(
  fetchPage: (page: number, limit: number) => Promise<TopicPage<T>>,
  options?: {
    onPage?: (topics: T[], complete: boolean) => void | Promise<void>;
    isCurrent?: () => boolean;
  }
): Promise<T[]> => {
  const topics = new Map<string, T>();
  for (let page = 1; ; page++) {
    if (options?.isCurrent && !options.isCurrent())
      throw new Error('Загрузка чатов отменена: сессия изменилась');
    const response = await fetchPage(page, TOPICS_PAGE_SIZE);
    if (options?.isCurrent && !options.isCurrent())
      throw new Error('Загрузка чатов отменена: сессия изменилась');
    const previousSize = topics.size;
    response.data.forEach(topic => topics.set(topic.id, topic));
    const hasNext = hasNextTopicPage(response, page, TOPICS_PAGE_SIZE);
    if (hasNext && topics.size === previousSize)
      throw new Error('Сервер вернул повторную или пустую страницу чатов');
    await options?.onPage?.([...topics.values()], !hasNext);
    if (!hasNext) return [...topics.values()];
  }
};
