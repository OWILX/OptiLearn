import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import styles from './Markdown.module.css';

export type MarkdownVariant =
  | 'question'
  | 'option'
  | 'review-question'
  | 'review-option'
  | 'explanation'
  | 'article'
  | 'compact';

interface MarkdownProps {
  children: string;
  className?: string;
  variant?: MarkdownVariant;
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
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ['className', /^language-./, 'math-inline', 'math-display'],
    ],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ['className', 'math', 'math-display'],
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ['className', 'math', 'math-inline'],
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

const MATH_COMMANDS = new Set([
  'log',
  'ln',
  'lg',
  'sin',
  'cos',
  'tan',
  'sec',
  'csc',
  'cot',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'lim',
  'exp',
  'frac',
  'dfrac',
  'tfrac',
  'cfrac',
  'sqrt',
  'sum',
  'prod',
  'int',
  'oint',
  'pm',
  'mp',
  'cdot',
  'times',
  'div',
  'leq',
  'geq',
  'neq',
  'approx',
  'infty',
  'mathrm',
  'mathbf',
  'mathbb',
  'operatorname',
  'text',
  'left',
  'right',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'theta',
  'lambda',
  'mu',
  'pi',
  'sigma',
  'phi',
  'omega',
  'in',
  'subseteq',
  'forall',
  'exists',
  'Rightarrow',
  'Leftrightarrow',
  'mid',
  'bar',
  'hat',
  'vec',
  'overrightarrow',
  'angle',
  'triangle',
  'mathcal',
]);

const PLACEHOLDER_PREFIX = '\uE000AVELUNE_MATH_';
const PLACEHOLDER_SUFFIX = '\uE001';

function placeholder(index: number): string {
  return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
}

function isPlaceholderAt(source: string, index: number): boolean {
  return source.startsWith(PLACEHOLDER_PREFIX, index);
}

function readBalanced(source: string, start: number, open: string, close: string): number {
  if (source[start] !== open) return -1;
  let depth = 0;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

function readBalancedBraces(source: string, start: number): number {
  return readBalanced(source, start, '{', '}');
}

function readBalancedParens(source: string, start: number): number {
  return readBalanced(source, start, '(', ')');
}

function readBalancedBrackets(source: string, start: number): number {
  return readBalanced(source, start, '[', ']');
}

function readInlineCode(source: string, start: number): number {
  let ticks = 0;
  while (source[start + ticks] === '`') ticks += 1;
  if (ticks === 0) return -1;

  const marker = '`'.repeat(ticks);
  const end = source.indexOf(marker, start + ticks);
  return end === -1 ? -1 : end + ticks;
}

function readFencedCode(source: string, start: number): number {
  if (source[start] !== '`' || source.slice(start, start + 3) !== '```') return -1;
  const lineEnd = source.indexOf('\n', start + 3);
  const searchFrom = lineEnd === -1 ? start + 3 : lineEnd + 1;
  const closing = source.indexOf('```', searchFrom);
  return closing === -1 ? source.length : closing + 3;
}

function readMathDollar(source: string, start: number): { end: number; value: string } | null {
  if (source[start] !== '$') return null;

  const display = source[start + 1] === '$';
  const delimiter = display ? '$$' : '$';
  const searchFrom = start + delimiter.length;

  for (let i = searchFrom; i < source.length; i += 1) {
    if (source[i] !== '$') continue;
    if (!display && source[i - 1] === '\\') continue;
    if (display) {
      if (source.slice(i, i + 2) === '$$') {
        return { end: i + 2, value: source.slice(start, i + 2) };
      }
    } else {
      return { end: i + 1, value: source.slice(start, i + 1) };
    }
  }

  return null;
}

function readEscapedMath(source: string, start: number): { end: number; value: string } | null {
  const inline = source.startsWith('\\(', start);
  const display = source.startsWith('\\[', start);
  if (!inline && !display) return null;

  const close = inline ? '\\)' : '\\]';
  const closeAt = source.indexOf(close, start + 2);
  if (closeAt === -1) return null;

  const inner = source.slice(start + 2, closeAt);
  return {
    end: closeAt + 2,
    value: display ? `$$\n${inner}\n$$` : `$${inner}$`,
  };
}

function readMarkdownLinkOrImage(source: string, start: number): number {
  const isImage = source[start] === '!' && source[start + 1] === '[';
  const isLink = source[start] === '[';
  if (!isImage && !isLink) return -1;

  const labelStart = isImage ? start + 1 : start;
  const labelEnd = readBalancedBrackets(source, labelStart);
  if (labelEnd === -1 || source[labelEnd] !== '(') return -1;

  const destinationEnd = readBalancedParens(source, labelEnd);
  if (destinationEnd === -1) return -1;
  return destinationEnd;
}

function protect(source: string): { text: string; restore: Map<string, string> } {
  const restore = new Map<string, string>();
  let output = '';
  let i = 0;
  let index = 0;

  const save = (value: string) => {
    const token = placeholder(index);
    index += 1;
    restore.set(token, value);
    output += token;
  };

  while (i < source.length) {
    if (source[i] === '`') {
      const end = readFencedCode(source, i);
      if (end !== -1) {
        save(source.slice(i, end));
        i = end;
        continue;
      }

      const endInline = readInlineCode(source, i);
      if (endInline !== -1) {
        save(source.slice(i, endInline));
        i = endInline;
        continue;
      }
    }

    if (source[i] === '$') {
      const math = readMathDollar(source, i);
      if (math) {
        save(math.value);
        i = math.end;
        continue;
      }
    }

    if (source[i] === '\\') {
      const math = readEscapedMath(source, i);
      if (math) {
        save(math.value);
        i = math.end;
        continue;
      }
    }

    const linkEnd = readMarkdownLinkOrImage(source, i);
    if (linkEnd !== -1) {
      save(source.slice(i, linkEnd));
      i = linkEnd;
      continue;
    }

    output += source[i];
    i += 1;
  }

  return { text: output, restore };
}

function restorePlaceholders(source: string, restore: Map<string, string>): string {
  let result = source;
  for (const [token, value] of restore) {
    result = result.split(token).join(value);
  }
  return result;
}

function isScriptStart(source: string, index: number): boolean {
  const char = source[index];
  if (char !== '^' && char !== '_') return false;
  const next = source[index + 1];
  return Boolean(next && (next === '{' || next === '(' || next === '[' || /[A-Za-z0-9\\]/.test(next)));
}

function readScript(source: string, start: number): number {
  if (!isScriptStart(source, start)) return -1;
  const next = source[start + 1];
  if (next === '{') return readBalancedBraces(source, start + 1);
  if (next === '(') return readBalancedParens(source, start + 1);
  if (next === '[') return readBalancedBrackets(source, start + 1);
  if (next === '\\') {
    const match = source.slice(start + 1).match(/^\\[A-Za-z]+/);
    if (match) return start + 1 + match[0].length;
  }
  return start + 2;
}

function readCommand(source: string, start: number): { name: string; end: number } | null {
  if (source[start] !== '\\') return null;
  const match = source.slice(start).match(/^\\([A-Za-z]+)/);
  if (!match) return null;
  return { name: match[1], end: start + match[0].length };
}

function isBoundary(source: string, index: number): boolean {
  const char = source[index];
  if (!char) return true;
  if (char === '\n' || char === '\r') return true;
  if (/[.!?,;:]/.test(char)) {
    const next = source[index + 1];
    return next === undefined || /\s/.test(next);
  }
  return false;
}

function isMathOperatorStart(char: string): boolean {
  return '+-=*/<>|&'.includes(char);
}

function isSingleMathIdentifier(source: string, start: number): number {
  const match = source.slice(start).match(/^[A-Za-z]+/);
  if (!match) return -1;
  const word = match[0];
  if (word.length === 1) return start + 1;
  if (MATH_COMMANDS.has(word)) return start + word.length;
  return -1;
}

function readMathAtom(source: string, start: number): number {
  if (start >= source.length) return -1;

  const char = source[start];

  if (char === '\\') {
    const command = readCommand(source, start);
    if (!command || !MATH_COMMANDS.has(command.name)) return -1;
    return command.end;
  }

  if (/[0-9]/.test(char)) {
    const match = source.slice(start).match(/^\d+(?:\.\d+)?/);
    return match ? start + match[0].length : start + 1;
  }

  if (/[A-Za-z]/.test(char)) {
    return isSingleMathIdentifier(source, start);
  }

  if (char === '(') return readBalancedParens(source, start);
  if (char === '[') return readBalancedBrackets(source, start);
  if (char === '{') return readBalancedBraces(source, start);
  return -1;
}

function expandLegacyExpressionEnd(source: string, end: number): number {
  let i = end;

  while (i < source.length) {
    while (/\s/.test(source[i] ?? '')) i += 1;

    if (isBoundary(source, i)) break;

    if (source[i] === '^' || source[i] === '_') {
      const scriptEnd = readScript(source, i);
      if (scriptEnd === -1) break;
      i = scriptEnd;
      continue;
    }

    const char = source[i];
    if (char === '\\') {
      const command = readCommand(source, i);
      if (!command || !MATH_COMMANDS.has(command.name)) break;
      i = command.end;
      continue;
    }

    if (isMathOperatorStart(char)) {
      i += 1;
      continue;
    }

    const atomEnd = readMathAtom(source, i);
    if (atomEnd !== -1) {
      i = atomEnd;
      continue;
    }

    if (char === '(' || char === '[' || char === '{') {
      const opener = char;
      const closer = char === '(' ? ')' : char === '[' ? ']' : '}';
      const balanced = readBalanced(source, i, opener, closer);
      if (balanced !== -1) {
        i = balanced;
        continue;
      }
    }

    break;
  }

  return i;
}

function convertLegacyExponentParens(expression: string): string {
  let result = '';
  let i = 0;

  while (i < expression.length) {
    const char = expression[i];
    if ((char === '^' || char === '_') && expression[i + 1] === '(') {
      const end = readBalancedParens(expression, i + 1);
      if (end !== -1) {
        const inner = expression.slice(i + 2, end - 1);
        result += `${char}{${inner}}`;
        i = end;
        continue;
      }
    }
    result += char;
    i += 1;
  }

  return result;
}

function looksLikeLegacyMath(expression: string): boolean {
  return /\\(?:[A-Za-z]+)|(?:\^|_)\{?|[=+\-*/<>]/.test(expression);
}

function normalizeLegacyBareMath(source: string): string {
  let output = '';
  let i = 0;

  while (i < source.length) {
    if (isPlaceholderAt(source, i)) {
      const end = source.indexOf(PLACEHOLDER_SUFFIX, i + PLACEHOLDER_PREFIX.length);
      if (end !== -1) {
        const tokenEnd = end + PLACEHOLDER_SUFFIX.length;
        output += source.slice(i, tokenEnd);
        i = tokenEnd;
        continue;
      }
    }

    let start = -1;
    let end = -1;
    const command = source[i] === '\\' ? readCommand(source, i) : null;

    if (command && MATH_COMMANDS.has(command.name)) {
      start = i;
      end = expandLegacyExpressionEnd(source, command.end);
    } else {
      const atomEnd = readMathAtom(source, i);
      if (atomEnd !== -1 && isScriptStart(source, atomEnd)) {
        start = i;
        end = expandLegacyExpressionEnd(source, atomEnd);
      }
    }

    if (start !== -1 && end > start) {
      const expression = source.slice(start, end).trim();
      if (looksLikeLegacyMath(expression)) {
        output += `$${convertLegacyExponentParens(expression)}$`;
        i = end;
        continue;
      }
    }

    output += source[i];
    i += 1;
  }

  return output;
}

export function normalizeExamMarkup(raw: string): string {
  if (!raw) return raw;

  const normalized = raw.replace(/\r\n?/g, '\n');
  const protectedSource = protect(normalized);
  const converted = normalizeLegacyBareMath(protectedSource.text);
  return restorePlaceholders(converted, protectedSource.restore);
}

const VARIANT_CLASS: Record<MarkdownVariant, string> = {
  question: styles.question,
  option: styles.option,
  'review-question': styles.reviewQuestion,
  'review-option': styles.reviewOption,
  explanation: styles.explanation,
  article: styles.article,
  compact: styles.compact,
};

export function Markdown({ children, className, variant = 'explanation' }: MarkdownProps) {
  const source = normalizeExamMarkup(children ?? '');
  const classes = [styles.md, VARIANT_CLASS[variant], className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} data-markdown-dev={import.meta.env.DEV ? 'true' : 'false'}>
      <ReactMarkdown
        remarkPlugins={[
          [remarkGfm, { singleTilde: false }],
          remarkBreaks,
          remarkMath,
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
