import { expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createReasoningSummaryReporter } from '../scripts/desktop-agent-reasoning-summary';
import { needsRussianTranslation } from '../src/services/agent-note-language';

test('язык публичного пояснения определяется отдельно от кода и имён файлов', (): void => {
  for (const source of [
    '**Preparing cat SVG paths**',
    '**Implementing path conversion**',
    'Checking котик.svg',
    'Готовлю файл.\n**Checking file contents**'
  ]) {
    expect(needsRussianTranslation(source)).toBe(true);
  }
  for (const source of [
    'Проверяю SVG-контуры кота',
    'Открываю `cat.svg` через OpenAI Responses API.',
    '`cat.svg`',
    'SVG',
    ''
  ]) {
    expect(needsRussianTranslation(source)).toBe(false);
  }
});

test('пояснения из итогового события сохраняют порядок и не дублируют уже показанные', (): void => {
  const published: string[] = [];
  const reporter = createReasoningSummaryReporter(summary =>
    published.push(summary.text)
  );
  const part = { type: 'summary_text', text: 'Первый шаг' };
  reporter.receiveEvent({
    type: 'response.reasoning_summary_part.done',
    item_id: 'step',
    summary_index: 0,
    part
  });
  const item = {
    type: 'reasoning',
    id: 'step',
    summary: [
      part,
      { type: 'summary_text', text: 'Второй шаг' },
      { type: 'reasoning_text', text: 'hidden' }
    ],
    content: [{ type: 'reasoning_text', text: 'hidden' }]
  };
  reporter.receiveEvent({
    type: 'response.completed',
    response: { output: [item, { ...item, id: 'other', type: 'message' }] }
  });
  reporter.receiveEvent({ type: 'response.output_item.done', item });
  expect(published).toEqual(['Первый шаг', 'Второй шаг']);
  expect(reporter.summaries()).toEqual(published);
});

test('агент продолжает после обрывов до и после записи файла', async (): Promise<void> => {
  const directory = await mkdtemp(join(tmpdir(), 'sep-agent-recovery-'));
  await writeFile(
    join(directory, 'sep-chat-communication.md'),
    'Отвечайте по-русски.'
  );
  const child = spawn(
    process.execPath,
    [
      '--preload',
      resolve('test/fixtures/pi-interrupted-response.ts'),
      resolve('scripts/desktop-pi-agent.ts')
    ],
    {
      env: {
        ...process.env,
        SEP_CHAT_PI_DATA_DIR: directory,
        SEP_CHAT_CODEX_API_KEY: 'test'
      },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore']
    }
  );
  const exited = once(child, 'exit');
  const lines = createInterface({ input: child.stdout });
  let permissions = 0;
  let sessionId = '';
  let answer = '';
  const stages: string[] = [];
  const notes: string[] = [];
  const summaries: string[] = [];
  let translated = false;

  const send = (value: object): void => {
    child.stdin.write(JSON.stringify(value) + '\n');
  };
  const timeout = setTimeout(() => child.kill(), 25_000);

  try {
    send({ id: 1, method: 'session/new', params: { cwd: directory } });
    for await (const line of lines) {
      expect(line).not.toContain('PRIVATE_TEST_MARKER');
      // Предупреждения зависимостей пропускаем, как и нативный транспорт.
      if (!line.startsWith('{')) continue;
      const message = JSON.parse(line);
      expect(message.error).toBeUndefined();
      if (message.method === 'session/update' && message.params.update.title) {
        stages.push(message.params.update.title);
      }
      if (message.method === 'session/update') {
        const summary = message.params.update.reasoningSummary;
        if (summary) {
          summaries.push(summary.text);
          if (summaries.length === 1)
            send({
              id: 99,
              method: 'notes/translate',
              params: {
                texts: [
                  'Preparing cat SVG paths',
                  'Implementing path conversion'
                ]
              }
            });
        }
      }
      if (
        message.method === 'session/update' &&
        message.params.update.commentary
      ) {
        notes.push(message.params.update.commentary);
      }
      if (message.id === 99) {
        expect(message.result).toEqual([
          'Готовлю SVG-контуры кота',
          'Реализую преобразование контуров'
        ]);
        translated = true;
      } else if (message.id === 1) {
        sessionId = message.result.sessionId;
        send({
          id: 2,
          method: 'session/prompt',
          params: {
            sessionId,
            prompt: [{ type: 'text', text: 'Нарисуйте котика' }]
          }
        });
      } else if (message.method === 'session/request_permission') {
        permissions++;
        send({
          id: message.id,
          result: { outcome: { outcome: 'selected', optionId: 'allow' } }
        });
      } else if (message.id === 2) {
        const work = message.result
          .workLog as import('../src/types/agent-work').AgentWorkEntry[];
        expect(work.filter(entry => entry.kind === 'action')).toEqual([
          expect.objectContaining({
            kind: 'action',
            state: 'done',
            text: 'Записал файл · kotik.svg'
          })
        ]);
        expect(
          work
            .filter(entry => entry.kind === 'commentary')
            .map(entry => entry.text)
        ).toEqual(notes);
        expect(
          work.findIndex(entry => entry.kind === 'commentary')
        ).toBeLessThan(work.findIndex(entry => entry.kind === 'action'));
        expect(new Set(work.map(entry => entry.id)).size).toBe(work.length);
        expect(message.result.outputFiles).toEqual([
          { path: join(directory, 'kotik.svg'), relativePath: 'kotik.svg' }
        ]);
        expect(summaries).toEqual([
          'Проверяю формат',
          'Проверяю формат рисунка.'
        ]);
        expect(message.result.reasoningSummaries).toEqual([
          'Проверяю формат рисунка.'
        ]);
        answer = message.result.responseText;
        send({
          id: 3,
          method: 'session/resume',
          params: { sessionId, cwd: directory, requireApproved: true }
        });
      } else if (message.id === 3) {
        expect(message.result.sessionId).toBe(sessionId);
        expect(message.result.restored).toBe(true);
        send({
          id: 4,
          method: 'session/prompt',
          params: {
            sessionId,
            prompt: [{ type: 'text', text: 'Файл сохранён?' }]
          }
        });
      } else if (message.id === 4) {
        expect(message.result.outputFiles).toEqual([
          {
            path: join(directory, 'kotik.svg'),
            relativePath: 'kotik.svg',
            linkOnly: true
          }
        ]);
        expect(message.result.reasoningSummaries).toEqual([]);
        expect(message.result.responseText).toBe('Да, `./kotik.svg`.');
        send({
          id: 5,
          method: 'session/prompt',
          params: {
            sessionId,
            prompt: [{ type: 'text', text: 'Пришли уже готовый рисунок.' }]
          }
        });
      } else if (message.id === 5) {
        expect(message.result.outputFiles).toEqual([
          { path: join(directory, 'kotik.svg'), relativePath: 'kotik.svg' }
        ]);
        break;
      }
    }

    expect(answer).toBe('Готово.');
    expect(notes).toEqual([
      'Сохраню рисунок в проекте.',
      'Проверка закончена.'
    ]);
    expect(stages).toContain('Обдумываю запрос');
    expect(stages).toContain('Готовлю содержимое файла');
    expect(stages).toContain('Записываю файл · kotik.svg');
    expect(stages).toContain('Изменения записаны');
    expect(stages.some(stage => stage.startsWith('Восстанавливаю связь'))).toBe(
      true
    );
    expect(permissions).toBe(2);
    expect(await readFile(join(directory, 'kotik.svg'), 'utf8')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"/>'
    );
    expect(translated).toBe(true);
    const trace = (await readFile(join(directory, 'requests.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(trace.map(row => row.results)).toEqual([0, 0, 1, 1, 1, 1, 1, 2]);
    expect(trace.every(row => row.effort === trace[0].effort)).toBe(true);
    for (const row of trace) {
      expect(row.session).toBeNull();
      expect(row.cache).toBeUndefined();
      expect(row.previousResponse).toBeUndefined();
    }
  } finally {
    clearTimeout(timeout);
    child.stdin.end();
    child.kill();
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
