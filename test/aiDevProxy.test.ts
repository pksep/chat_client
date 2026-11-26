import { expect, test } from 'bun:test';
import { aiDevProxyBase } from '../src/utils/ai-dev-proxy';

const target = 'https://ai.example.com';
test('локальный opt-in сохраняет /api и общий адрес всех ИИ-сервисов', () => {
  expect(aiDevProxyBase(target, target, 'http://localhost:5174')).toBe(
    'http://localhost:5174/__chat-ai'
  );
  expect(
    aiDevProxyBase(target + '/api/', target, 'http://127.0.0.1:5174')
  ).toBe('http://127.0.0.1:5174/__chat-ai/api');
});
test('production, чужой сервер и отсутствие opt-in не меняют адрес', () => {
  expect(aiDevProxyBase(target, target, 'https://chat.example.com')).toBe(
    target
  );
  expect(aiDevProxyBase(target, target, 'tauri://localhost')).toBe(target);
  expect(aiDevProxyBase(target, target, 'file://localhost')).toBe(target);
  expect(aiDevProxyBase(target, undefined, 'http://localhost:5174')).toBe(
    target
  );
  expect(
    aiDevProxyBase(target, 'https://other.example.com', 'http://localhost:5174')
  ).toBe(target);
  expect(
    aiDevProxyBase(target + '/private', target, 'http://localhost:5174')
  ).toBe(target + '/private');
});
