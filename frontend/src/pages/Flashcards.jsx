import { useState, useEffect } from 'react';
import { apiGetDueFlashcards, apiUpdateFlashcard } from '../services/api';
import { useData } from '../contexts/DataContext';

export default function Flashcards() {
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const { incrementCardsReviewed } = useData();

  useEffect(() => {
    const fetchCards = async () => {
      try {
        const res = await apiGetDueFlashcards();
        setCards(res.due_flashcards || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCards();
  }, []);

  const handleNext = () => {
    setShowAnswer(false);
    setCurrentIndex(prev => prev + 1);
  };

  const handleReview = async (quality) => {
    let daysToAdd = 1;
    if (quality === 'good') daysToAdd = 3;
    if (quality === 'easy') daysToAdd = 7;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysToAdd);
    const reviewDateStr = futureDate.toISOString().split('T')[0];

    try {
      await apiUpdateFlashcard(currentCard.id, reviewDateStr);
      incrementCardsReviewed();
    } catch (err) {
      console.error('Failed to update flashcard review date:', err);
    }

    handleNext();
  };

  if (loading) return <div className="tab-pane active"><p>Loading flashcards...</p></div>;

  if (cards.length === 0 || currentIndex >= cards.length) {
    return (
      <div className="tab-pane active" id="flashcards">
        <div className="fc-empty-state">
          <i className="ph ph-check-circle" style={{ fontSize: '4rem', color: 'var(--primary)', marginBottom: '1rem' }}></i>
          <h2>All caught up!</h2>
          <p>You have reviewed all your scheduled flashcards for today.</p>
        </div>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <div className="tab-pane active" id="flashcards">
      <header className="top-header">
        <h1>Flashcard Review</h1>
        <div className="fc-progress">
          Card {currentIndex + 1} of {cards.length}
        </div>
      </header>

      <div className="fc-review-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '2rem' }}>
        <div 
          className={`fc-card ${showAnswer ? 'flipped' : ''}`} 
          onClick={() => setShowAnswer(!showAnswer)}
          style={{
            width: '600px', height: '400px', backgroundColor: 'var(--surface)', 
            borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', border: '1px solid var(--border)', padding: '2rem', textAlign: 'center',
            fontSize: '1.5rem', transition: 'transform 0.6s'
          }}
        >
          <div className="content">
            {showAnswer ? currentCard.answer : currentCard.question}
          </div>
        </div>

        <div className="fc-controls" style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
          {!showAnswer ? (
            <button className="primary-btn" onClick={() => setShowAnswer(true)}>Show Answer</button>
          ) : (
            <>
              <button className="action-btn" onClick={() => handleReview('hard')} style={{ borderColor: 'var(--red)' }}>Hard</button>
              <button className="action-btn" onClick={() => handleReview('good')} style={{ borderColor: 'var(--orange)' }}>Good</button>
              <button className="action-btn" onClick={() => handleReview('easy')} style={{ borderColor: 'var(--primary)' }}>Easy</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
