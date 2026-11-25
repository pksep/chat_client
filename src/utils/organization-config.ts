import type { IChatContainerConfig } from '../components/interfaces/interfaces';
import { withNetworkTimeout } from './network-timeout';

export class OrganizationConfigError extends Error {
  constructor(public readonly kind: 'not-found' | 'unavailable') {
    super(kind);
  }
}

export async function fetchOrganizationConfig(
  url: string,
  parse: (text: string) => Partial<IChatContainerConfig>
): Promise<IChatContainerConfig> {
  return withNetworkTimeout(async signal => {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new OrganizationConfigError(
        [404, 410].includes(response.status) ? 'not-found' : 'unavailable'
      );
    }
    const config = parse(await response.text());
    // SPA fallback и чужой сайт тоже могут вернуть HTTP 200.
    try {
      const api = new URL(config.CHAT_API_DOMAIN || '');
      if (!['https:', 'http:'].includes(api.protocol)) throw new Error();
    } catch {
      throw new OrganizationConfigError('not-found');
    }
    return config;
  });
}

export function organizationConfigErrorMessage(error: unknown): string {
  if (error instanceof OrganizationConfigError) {
    return error.kind === 'not-found'
      ? 'Сервер по этой ссылке не найден. Проверьте адрес.'
      : 'Сервер временно недоступен. Попробуйте позже.';
  }
  return 'Не удалось найти сервер или подключиться к нему. Проверьте ссылку и подключение к интернету.';
}
