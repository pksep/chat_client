import { Marked } from 'marked';
import { sanitizeMessageHtml } from './sanitizeMessageHtml';

export interface AiCodeSnippet {
  source: string;
  language: string;
}

export function renderAiMarkdown(text: string): {
  html: string;
  snippets: AiCodeSnippet[];
} {
  const snippets: AiCodeSnippet[] = [];
  const markdown = new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      html({ text }): string {
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      },
      code({ text, lang }): string {
        snippets.push({
          source: text,
          language: lang?.trim().split(/\s+/, 1)[0] ?? ''
        });
        // Место блока сохраняется и внутри списков и цитат.
        return '<pre></pre>';
      }
    }
  });

  return {
    html: sanitizeMessageHtml(
      markdown.parse(text, { async: false }),
      'ai-markdown'
    ),
    snippets
  };
}
