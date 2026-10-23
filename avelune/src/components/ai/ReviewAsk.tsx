import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { askAI, type AskAIContext } from '@/services/ai/askAi';
import { Markdown } from '@/components/ui/Markdown';
import { CapSheet } from '@/components/tiers/CapSheet';
import {
  entitlementService,
  type Gate,
} from '@/services/entitlements/entitlementService';
import { usageService } from '@/services/usage/usageService';
import { rewardedService } from '@/services/ads/rewardedService';

/**
 * Ask AI for Quiz and SEP review.
 *
 * The tier caps are the same as in the Study reader — Free has none,
 * Pro has a daily cap, Platinum has a per-topic daily cap, Diamond is
 * unlimited. `topicId` is the syllabus id for the question; the server
 * uses the same value when enforcing the cap, so counts agree across
 * every surface in the app.
 */
export function ReviewAsk({
  questionId,
  context,
  topicId,
  fetchOnMount = false,
}: {
  questionId: number;
  context: Extract<AskAIContext, 'quiz_review' | 'sep_review'>;
  topicId?: number | null;
  fetchOnMount?: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { limits } = useProfile();

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [capOpen, setCapOpen] = useState(false);
  const [adBusy, setAdBusy] = useState(false);

  const refreshGate = useCallback(async () => {
    if (!user) return;
    try {
      const g = await entitlementService.askAiGate(user.id, limits, topicId);
      setGate(g);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[REVIEW ASK] gate lookup failed:', err);
      }
    }
  }, [user, limits, topicId]);

  useEffect(() => {
    if (fetchOnMount) void refreshGate();
  }, [fetchOnMount, refreshGate]);

  async function send() {
    const message = text.trim();
    if (!message || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const currentHistory = history.slice(-8);
      const newHistory = [...currentHistory, { role: 'user', content: message }];
      const result = await askAI({ question_id: questionId, context, messages: newHistory });
      
      if (!result.ok) {
        setError(
          result.reason
            ? `Ask AI could not answer: ${result.reason}`
            : 'Ask AI could not answer that right now.',
        );
        return;
      }
      setHistory([...newHistory, { role: 'assistant', content: result.answer_markdown || '' }]);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      void refreshGate();
    }
  }

  async function watchAd() {
    if (!user || adBusy) return;
    setAdBusy(true);
    try {
      const result = await rewardedService.show();
      if (result !== 'rewarded') return;
      await usageService.record(user.id, 'ask_ai_ad');
      await refreshGate();
      setCapOpen(false);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[REVIEW ASK] ad failed:', err);
      }
    } finally {
      setAdBusy(false);
    }
  }

  const blocked = gate?.state === 'blocked';
  const atCap = gate?.state === 'at-cap';
  const remaining = gate?.remaining;
  const hint =
    remaining === undefined || !Number.isFinite(remaining)
      ? 'Ask about this question'
      : `${remaining} left today`;

  const buttonStyle = {
    minHeight: 40,
    padding: '0 14px',
    borderRadius: 10,
    border: '1px solid rgba(107, 33, 168, 0.35)',
    background: '#fff',
    color: '#6b21a8',
    font: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  } as const;

  if (blocked) {
    return (
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={() => navigate('/subscribe')}
          style={buttonStyle}
        >
          <Lock size={14} aria-hidden="true" />
          Ask AI — Upgrade
        </button>
      </div>
    );
  }

  if (atCap) {
    return (
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={() => setCapOpen(true)}
          style={buttonStyle}
        >
          <Sparkles size={14} aria-hidden="true" />
          Ask AI — Limit reached
        </button>
        <CapSheet
          open={capOpen}
          title="Ask AI limit reached"
          body={
            gate?.canWatchAd
              ? `Watch a short video to unlock ${gate.adReward} more Ask AI questions today.`
              : 'You\u2019ve used every unlock available today. Upgrade for unlimited Ask AI.'
          }
          onWatchAd={gate?.canWatchAd ? watchAd : undefined}
          watchLabel={gate ? `Watch for +${gate.adReward}` : undefined}
          onSeePlans={() => {
            setCapOpen(false);
            navigate('/subscribe');
          }}
          onDismiss={() => setCapOpen(false)}
          busy={adBusy}
        />
      </div>
    );
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
        onFocus={() => {
          if (!gate) void refreshGate();
        }}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || loading}
          style={buttonStyle}
        >
          {loading ? 'Thinking…' : 'Ask AI'}
        </button>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{hint}</span>
      </div>
      {error && <p style={{ color: '#8a4b4b', fontSize: 13 }}>{error}</p>}
      {history.map((msg, i) => (
        <div 
          key={i} 
          style={{ 
            marginTop: 12, 
            padding: 12, 
            borderRadius: 12, 
            background: msg.role === 'user' ? 'var(--color-brand-blue-soft)' : 'var(--color-surface)',
            border: msg.role === 'user' ? 'none' : '1px solid var(--color-border)',
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '90%'
          }}
        >
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: 4 }}>
            {msg.role === 'user' ? 'You' : 'Tutor'}
          </div>
          <Markdown variant="explanation">{msg.content}</Markdown>
        </div>
      ))}
    </div>
  );
}
