// 解説 Markdown の表示。[[id]] / [[id|表示名]] を用語のホバー解説に変える。
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Term } from './glossary';

const TERM = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function preprocess(md: string): string {
  return md.replace(TERM, (_, id: string, label?: string) => `[${label ?? id}](term:${encodeURIComponent(id)})`);
}

export function Markdown({ text, inline }: { text: string; inline?: boolean }) {
  return (
    <div className={inline ? 'prose-lesson [&>p]:my-0' : 'prose-lesson'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith('term:') ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) =>
            href?.startsWith('term:') ? (
              <Term id={decodeURIComponent(href.slice(5))}>{children}</Term>
            ) : (
              <a href={href} className="text-sky-600 underline" target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {preprocess(text)}
      </ReactMarkdown>
    </div>
  );
}
