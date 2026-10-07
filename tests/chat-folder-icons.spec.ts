import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { chatFolderIcons } from '../src/services/useChatSDK/chat-folder';

const svg = readFileSync(
  new URL('../src/assets/chat-folder-icons.svg', import.meta.url),
  'utf8'
);
const symbols = new Map(
  Array.from(
    svg.matchAll(
      /<symbol id="([^"]+)" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g
    ),
    match => [match[1], { viewBox: match[2], body: match[3] }]
  )
);

describe('SVG иконок папок', () => {
  it('содержит все 21 иконку без подмены и пустых символов', () => {
    assert.deepEqual([...symbols.keys()], [...chatFolderIcons]);
    for (const { viewBox, body } of symbols.values()) {
      const [, , width, height] = viewBox.split(' ').map(Number);
      assert.equal(width, height);
      assert.ok(width > 0);
      assert.match(body, /<path\s+d="[^"]+"/);
    }
  });

  it('сохраняет все маски исходных SVG и их ссылки', () => {
    const ids = Array.from(svg.matchAll(/\bid="([^"]+)"/g), match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const [, id] of svg.matchAll(/mask="url\(#([^)]+)\)"/g))
      assert.ok(ids.includes(id), `Отсутствует маска ${id}`);
    assert.match(symbols.get('paw')!.body, /<mask /);
  });

  it('использует цвета темы вместо жёстко заданной палитры', () => {
    for (const [, attribute, color] of svg.matchAll(
      /\b(fill|stroke)="([^"]+)"/g
    ))
      assert.ok(
        ['currentColor', 'none', 'white'].includes(color),
        `${attribute}: ${color}`
      );
  });

  it('шестерёнка использует цельный контур исходного компонента Figma', () => {
    const settings = symbols.get('settings')!;
    assert.equal(settings.viewBox, '0 0 24 24');
    assert.equal(Array.from(settings.body.matchAll(/<path /g)).length, 2);
    assert.doesNotMatch(settings.body, /\bstroke(?:-width)?=/);
    assert.match(settings.body, /M19\.6845 13\.0172/);
    assert.match(settings.body, /M11\.9999 16\.4998/);
  });

  it('сложные иконки сохраняют исходные контуры без артефактов экспортированной обводки', () => {
    const originals = {
      soccer: 'M12 2.25',
      lightbulb: 'M16.5 21.75',
      car: 'M22.5 9.75',
      'paint-brush': 'M21.6225 2.37746'
    };
    for (const [name, start] of Object.entries(originals)) {
      const icon = symbols.get(name)!;
      assert.equal(icon.viewBox, '0 0 24 24');
      assert.equal(Array.from(icon.body.matchAll(/<path /g)).length, 1);
      assert.doesNotMatch(icon.body, /\bstroke(?:-width)?=/);
      assert.ok(icon.body.includes(`d="${start}`), name);
    }
  });
});
