import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.css';

interface MarkdownProps {
  children: string;
  className?: string;
}

/**
 * Renders a Markdown string with OptiLearn typography.
 * Base size/color come from the parent via `className`.
 * All other elements (p, ul, code, etc.) are styled in Markdown.module.css.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={`${styles.md} ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
