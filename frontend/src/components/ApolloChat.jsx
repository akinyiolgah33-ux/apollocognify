import { useState, useRef, useEffect } from 'react';
import { apiSummarize, apiExtractFlashcards } from '../services/api';

const INITIAL_MESSAGES = [
  { role: 'ai', text: "Hi! I'm Apollo 🌟 — your AI study assistant. Paste or write your notes and I'll summarize them or generate flashcards for you!" }
];

export default function ApolloChat() {
  const [isOpen, setIsOpen]   = useState(false);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const pushMsg = (role, text) =>
    setMessages(prev => [...prev, { role, text }]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    pushMsg('user', text);
    setLoading(true);

    // Route by keyword
    const lower = text.toLowerCase();
    try {
      if (lower.includes('flashcard') || lower.includes('card')) {
        const content = text.replace(/generate flashcards from|extract flashcards|flashcards/gi, '').trim();
        const res = await apiExtractFlashcards(content || text, 'Apollo Deck');
        const count = res.flashcards?.length || 0;
        pushMsg('ai', `I generated ${count} flashcard${count !== 1 ? 's' : ''} for you! Head to the Flashcards tab to review them. 🃏`);
      } else {
        const res = await apiSummarize(text);
        pushMsg('ai', `📝 Here's your summary:\n\n${res.summary || 'Could not generate a summary.'}`);
      }
    } catch (err) {
      console.error('Apollo chat processing failed:', err);
      pushMsg('ai', `❌ Sorry, I couldn't process that. Make sure the backend is running at http://localhost:3000.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`apollo-container ${isOpen ? 'open' : ''}`}>

      {/* Floating Orb Button */}
      <button className="apollo-orb-btn" onClick={() => setIsOpen(!isOpen)} title="Ask Apollo AI">
        <div className="orb-core">
          <i className="ph ph-sparkle"></i>
        </div>
        <div className="orb-ring ring-1"></div>
        <div className="orb-ring ring-2"></div>
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="apollo-panel">
          <div className="apollo-header">
            <div className="apollo-title">
              <i className="ph ph-sparkle"></i>
              <span>Apollo AI</span>
            </div>
            <button className="icon-btn" onClick={() => setIsOpen(false)}>
              <i className="ph ph-x"></i>
            </button>
          </div>

          <div className="apollo-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                {msg.text.split('\n').map((line, j) => (
                  <p key={j} style={{ margin: '0.2rem 0' }}>{line}</p>
                ))}
              </div>
            ))}
            {loading && (
              <div className="message ai">
                <span className="typing-dots"><span></span><span></span><span></span></span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="apollo-input">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Paste text to summarize, or ask to generate flashcards..."
              rows={3}
              disabled={loading}
            />
            <button className="primary-btn" onClick={handleSend} disabled={loading || !input.trim()}>
              <i className="ph ph-paper-plane-right"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
