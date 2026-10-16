import { useState } from 'react';
import { askAI, type AskAIContext } from '@/services/ai/askAi';
import { Markdown } from '@/components/ui/Markdown';

export function ReviewAsk({
  questionId,
  context,
}: {
  questionId: number;
  context: Extract<AskAIContext, 'quiz_review' | 'sep_review'>;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const message = text.trim();
    if (!message || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await askAI({ question_id: questionId, context, message });
      if (!result.ok) {
        setError(result.reason ? `Ask AI could not answer: ${result.reason}` : 'Ask AI could not answer that right now.');
        return;
      }
      setAnswer(result.answer_markdown || 'The answer came back empty.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ask something about this question..."
        maxLength={500}
        rows={3}
        disabled={loading}
        autoCorrect="off"
        spellCheck={false}
        style={{
          width: '100%',
          resize: 'vertical',
          boxSizing: 'border-box',
          padding: 10,
          borderRadius: 10,
          border: '1px solid rgba(128, 128, 128, 0.35)',
          font: 'inherit',
        }}
      />
      <button
        type="button"
        onClick={send}
        disabled={!text.trim() || loading}
        style={{ marginTop: 8, minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(107, 33, 168, 0.35)', background: '#fff', color: '#6b21a8', font: 'inherit' }}
      >
        {loading ? 'Thinking…' : 'Ask AI'}
      </button>
      {error && <p style={{ color: '#8a4b4b', fontSize: 13 }}>{error}</p>}
      {answer && <Markdown variant="explanation">{answer}</Markdown>}
    </div>
  );
}
