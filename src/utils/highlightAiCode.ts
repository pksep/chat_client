import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import type { AiCodeSnippet } from './renderAiMarkdown';

const grammars = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  go,
  java,
  javascript,
  json,
  powershell,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml
};
for (const [name, grammar] of Object.entries(grammars))
  hljs.registerLanguage(name, grammar);
hljs.registerAliases('shell', { languageName: 'bash' });

const labels = new Map(
  Object.entries({
    html: 'HTML',
    svg: 'SVG',
    xml: 'XML',
    jsx: 'JSX',
    tsx: 'TSX'
  })
);

export function highlightAiCode({ language, source }: AiCodeSnippet): {
  label: string;
  html?: string;
} {
  let name = language.toLowerCase();
  if (!name && /^\s*(?:[A-Za-z]+-[A-Z][A-Za-z]+\b|\$env:)/m.test(source))
    name = 'powershell';
  if (!name && /^#![^\n]*\b(?:bash|sh)\b/.test(source)) name = 'bash';
  if (['text', 'txt', 'plaintext'].includes(name)) return { label: 'Текст' };

  const grammar = hljs.getLanguage(name);
  const label = labels.get(name) ?? grammar?.name ?? language;
  if (!grammar) return { label: label || 'Код' };

  return {
    label,
    html: hljs.highlight(source, { language: name, ignoreIllegals: true }).value
  };
}
