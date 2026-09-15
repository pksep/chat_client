import { authedUser } from './useAuth';
import { getConfig } from '../services/useConfig';
import {
  loadInquiry,
  managerRequest,
  type ManagerInquiry
} from './useManagerInquiries';
import type {
  ErpContactCandidate,
  PendingErpContact
} from './interfaces/erp-contact';

const pending = new Map<string, PendingErpContact>();

/** Освобождает связь с закрытой вкладкой, не отменяя принятую сервером операцию. */
function forget(requestId: string): void {
  const entry = pending.get(requestId);
  if (entry) clearInterval(entry.cleanup);
  pending.delete(requestId);
}

/** Принимает результат только от открытой нами вкладки своей ЕРП. */
async function receiveContact(event: MessageEvent): Promise<void> {
  const message = event.data;
  if (
    !message ||
    typeof message !== 'object' ||
    typeof message.requestId !== 'string'
  )
    return;
  const entry = pending.get(message.requestId);
  if (!entry || event.origin !== entry.origin || event.source !== entry.popup)
    return;
  if (authedUser.value?.id !== entry.actorId) {
    forget(message.requestId);
    return;
  }
  if (message.type === 'sep:manager-contact:ready') {
    entry.popup.postMessage(
      {
        type: 'sep:manager-contact:open',
        requestId: message.requestId,
        contactId: entry.contactId,
        draft: {
          name: entry.inquiry.contacts.name || entry.inquiry.name,
          phone: entry.inquiry.contacts.phone || '',
          email: entry.inquiry.contacts.email || ''
        }
      },
      entry.origin
    );
    return;
  }
  if (
    message.type !== 'sep:manager-contact:saved' ||
    entry.saving ||
    !Number.isSafeInteger(message.contactId) ||
    message.contactId <= 0
  )
    return;
  // Идентификатор существующего контакта нельзя подменить ответом вкладки.
  if (entry.contactId && entry.contactId !== message.contactId) return;
  entry.saving = true;
  try {
    if (Number(entry.inquiry.erp_contact_id) !== message.contactId) {
      // Связываем уже сохранённый контакт через прежнюю очередь и её проверки прав.
      await managerRequest(`inquiries/${entry.inquiry.id}/erp/sync`, {
        operationId: message.requestId,
        contactId: message.contactId
      });
      for (let attempt = 0; attempt < 20; attempt++) {
        if (authedUser.value?.id !== entry.actorId)
          throw new Error('Сеанс чата изменился');
        const detail = await loadInquiry(entry.inquiry.id);
        if (Number(detail.inquiry.erp_contact_id) === message.contactId) break;
        const operation = detail.erpOperations.find(
          item => item.id === message.requestId
        );
        if (operation && ['failed', 'conflict'].includes(operation.state))
          throw new Error(
            'Контакт сохранён. Связь с обращением требует повторной синхронизации в чате.'
          );
        if (attempt === 19)
          throw new Error(
            'Контакт сохранён. Синхронизация обращения ещё выполняется.'
          );
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    entry.popup.postMessage(
      { type: 'sep:manager-contact:linked', requestId: message.requestId },
      entry.origin
    );
  } catch (error) {
    entry.popup.postMessage(
      {
        type: 'sep:manager-contact:link-error',
        requestId: message.requestId,
        message:
          error instanceof Error
            ? error.message
            : 'Не удалось связать контакт с обращением'
      },
      entry.origin
    );
  } finally {
    forget(message.requestId);
  }
}

window.addEventListener('message', event => {
  void receiveContact(event);
});

/** Открывает обычную ЕРП; создание происходит только после сохранения её формы. */
export async function openErpContact(
  inquiry: ManagerInquiry,
  selectedContactId?: number
): Promise<ErpContactCandidate[]> {
  const base = getConfig().CHAT_ERP_URL;
  if (!base) throw new Error('Адрес СЭП не настроен');
  const actorId = authedUser.value?.id;
  if (!actorId) throw new Error('Пользователь не авторизован');
  const url = new URL('contactbase', `${base.replace(/\/+$/, '')}/`);
  if (!['https:', 'http:'].includes(url.protocol))
    throw new Error('Некорректный адрес СЭП');
  // Окно резервируется в момент клика, до сетевого поиска совпадений.
  const popup = window.open('about:blank', '_blank');
  if (!popup) throw new Error('Разрешите открытие вкладки СЭП в браузере');
  try {
    let contactId =
      selectedContactId || Number(inquiry.erp_contact_id) || undefined;
    if (!contactId) {
      const candidates = await managerRequest<ErpContactCandidate[]>(
        `inquiries/${inquiry.id}/erp/candidates`
      );
      if (candidates.length > 1 || candidates.some(item => item.ban)) {
        popup.close();
        return candidates;
      }
      contactId = candidates[0]?.id;
    }
    if (authedUser.value?.id !== actorId)
      throw new Error('Сеанс чата изменился');
    const requestId = crypto.randomUUID();
    url.searchParams.set('managerContact', requestId);
    url.searchParams.set('managerOrigin', window.location.origin);
    const cleanup = setInterval(() => {
      if (popup.closed || authedUser.value?.id !== actorId) forget(requestId);
    }, 2000);
    pending.set(requestId, {
      popup,
      origin: url.origin,
      actorId,
      inquiry,
      contactId,
      saving: false,
      cleanup
    });
    // Контактные данные передаются только через проверенный postMessage, не в URL.
    popup.location.replace(url.href);
    return [];
  } catch (error) {
    popup.close();
    throw error;
  }
}
