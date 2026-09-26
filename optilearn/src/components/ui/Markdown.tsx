import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import styles from './Markdown.module.css';

interface MarkdownProps {
  children: string;
  className?: string;
}

/**
 * Renders a Markdown string with OptiLearn typography.
 * Also renders inline/block LaTeX via KaTeX ($...$ and $$...$$).
 * Base size/color come from the parent via `className`.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={`${styles.md} ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
