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

const D = String.fromCharCode(36);
const LATEX_CMD =
  /\\(log|ln|lg|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|lim|exp|frac|dfrac|sqrt|sum|prod|int|pm|cdot|times|div|leq|geq|neq|approx|infty|mathrm|mathbf|text|left|right|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|phi|omega)\b/;

function wrapLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return line;
  if (trimmed.indexOf(D) !== -1) return line;
  if (LATEX_CMD.test(trimmed) || /[_^]\{/.test(trimmed)) {
    return D + trimmed + D;
  }
  return line;
}

export function normalizeExamMarkup(raw: string): string {
  if (!raw) return raw;
  let text = raw.replace(/\r\n/g, '\n');
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, function (_m, inner: string) {
    return D + inner + D;
  });
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, function (_m, inner: string) {
    return D + D + inner + D + D;
  });
  return text.split('\n').map(wrapLine).join('\n');
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
          remarkMath,
          remarkSupersub,
        ]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, SANITIZE_SCHEMA],
          [rehypeKatex, { throwOnError: false, strict: 'ignore' }],
        ]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
