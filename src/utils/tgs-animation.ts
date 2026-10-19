import { gunzipSync, strFromU8 } from 'fflate';

type TgsData = Record<string, unknown>;
const parsed = new Map<string, TgsData>();
const pending = new Map<string, Promise<TgsData>>();
const maxCached = 32;

export const loadTgsAnimation = async (url: string): Promise<TgsData> => {
  let data = parsed.get(url);
  if (data) {
    parsed.delete(url);
    parsed.set(url, data);
  } else {
    let request = pending.get(url);
    if (!request) {
      request = (async () => {
        const response = await fetch(url);
        if (!response.ok)
          throw new Error('Не удалось загрузить анимацию стикера');
        const bytes = new Uint8Array(await response.arrayBuffer());
        const json = JSON.parse(strFromU8(gunzipSync(bytes))) as TgsData;
        parsed.set(url, json);
        while (parsed.size > maxCached)
          parsed.delete(parsed.keys().next().value!);
        return json;
      })().finally(() => pending.delete(url));
      pending.set(url, request);
    }
    data = await request;
  }
  // Lottie изменяет данные при подготовке кадров: экземплярам нужны отдельные копии.
  return structuredClone(data);
};

export const loadTgsPlayer = () =>
  import('lottie-web/build/player/lottie_light');
