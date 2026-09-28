import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkSupersub from 'remark-supersub';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import styles from './Markdown.module.css';

interface MarkdownProps {
  children: string;
  className?: string;
}

const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'sub',
    'sup',
    'u',
    'mark',
    'kbd',
    'input',
    'section',
    'details',
    'summary',
  ],
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-./, 'math-inline', 'math-display']],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ['className', 'math-inline', 'math-display'],
    ],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ['className', 'math', 'math-display'],
    ],
    section: [['className', 'footnotes']],
    li: [...(defaultSchema.attributes?.li ?? []), 'className'],
    ul: [...(defaultSchema.attributes?.ul ?? []), 'className'],
    ol: [...(defaultSchema.attributes?.ol ?? []), 'className', 'start'],
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      'className',
      'dataFootnoteRef',
      'dataFootnoteBackref',
    ],
    input: [['type', 'checkbox'], 'checked', 'disabled'],
    img: [...(defaultSchema.attributes?.img ?? []), 'src', 'alt', 'title'],
  },
};

export function normalizeExamMarkup(raw: string): string {
  if (!raw) return raw;
  const parts = raw.split(/($$[\s\S]*?$$|$[^$]*$)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      let text = part;
      text = text.replace(
        /([A-Za-z0-9]+)_\{([A-Za-z]+)\}/g,
        function (_m, token, word) {
          return '$' + token + '_{\\mathrm{' + word + '}}' + '$';
        },
      );
      text = text.replace(
        /([A-Za-z0-9]+)_\{(\d+)\}/g,
        function (_m, token, base) {
          return '$' + token + '_{' + base + '}' + '$';
        },
      );
      text = text.replace(
        /([A-Za-z0-9]+)_([A-Za-z]+)\b/g,
        function (_m, token, word) {
          return '$' + token + '_{\\mathrm{' + word + '}}' + '$';
        },
      );
      return text;
    })
    .join('');
}

export function Markdown({ children, className }: MarkdownProps) {
  const source = normalizeExamMarkup(children ?? '');
  const wrapClass = className ? styles.md + ' ' + className : styles.md;
  return (
    <div className={wrapClass}>
      <ReactMarkdown
        remarkPlugins={[
          [remarkGfm, { singleTilde: false }],
          remarkBreaks,
          remarkSupersub,
          remarkMath,
        ]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, SANITIZE_SCHEMA],
          rehypeKatex,
        ]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
