import { useNavigate, Link } from 'react-router-dom';
import { useData } from '../contexts/DataContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { flashcards, stats } = useData();

  const formatFocusTime = (minutes = 0) => {
    if (minutes < 60) return `${minutes}m`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  };

  return (
    <div className="tab-pane active" id="dashboard">
      <header className="top-header">
        <h1>Dashboard</h1>
        <div className="header-actions">
          <div className="sync-status active">
            <i className="ph ph-cloud-check"></i> Synced to React
          </div>
          <button className="icon-btn"><i className="ph ph-bell"></i></button>
          <div className="user-avatar">
            <img src="https://ui-avatars.com/api/?name=User&background=2dd4bf&color=fff" alt="User" />
          </div>
        </div>
      </header>

      <div className="dashboard-grid">
        {/* Progress Ring Card */}
        <div className="dash-card col-span-2 progress-card">
          <div className="card-header">
            <h3>Today's Focus</h3>
            <button className="icon-btn"><i className="ph ph-dots-three"></i></button>
          </div>
          <div className="progress-content">
            <div className="progress-ring-container">
              <svg className="progress-ring" width="120" height="120">
                <circle className="progress-ring__circle bg" stroke="var(--border)" strokeWidth="8" fill="transparent" r="52" cx="60" cy="60"/>
                <circle className="progress-ring__circle fg" stroke="var(--primary)" strokeWidth="8" fill="transparent" r="52" cx="60" cy="60" strokeDasharray="326" strokeDashoffset="100"/>
              </svg>
              <div className="progress-text">
                <span className="time">{formatFocusTime(stats?.focusMinutes)}</span>
                <span className="label">Focused</span>
              </div>
            </div>
            <div className="progress-stats">
              <div className="stat">
                <i className="ph ph-fire text-orange"></i>
                <div className="stat-info">
                  <span className="val">{stats?.streak || 1} Day{stats?.streak !== 1 ? 's' : ''}</span>
                  <span className="lbl">Streak</span>
                </div>
              </div>
              <div className="stat">
                <i className="ph ph-cards text-primary"></i>
                <div className="stat-info">
                  <span className="val">{stats?.cardsReviewed || 0}</span>
                  <span className="lbl">Cards Reviewed</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="dash-card quick-actions">
          <button className="action-btn" onClick={() => navigate('/notes')}>
            <div className="btn-icon"><i className="ph ph-plus"></i></div>
            <span>New Note</span>
          </button>
          <button className="action-btn" onClick={() => navigate('/flashcards')}>
            <div className="btn-icon"><i className="ph ph-play"></i></div>
            <span>Study Now</span>
          </button>
        </div>

        {/* Due Cards */}
        <div className="dash-card col-span-2">
          <div className="card-header">
            <h3>Upcoming Reviews</h3>
            <Link to="/flashcards" className="see-all">See all</Link>
          </div>
          <div className="flashcard-list" id="due-flashcards-list">
            {flashcards.length === 0 ? (
              <div className="empty-state">
                <i className="ph ph-check-circle"></i>
                <p>You're all caught up!</p>
              </div>
            ) : (
              flashcards.map((fc, i) => (
                <div key={i} className="fc-item">
                  <span className="fc-q">{fc.question}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

