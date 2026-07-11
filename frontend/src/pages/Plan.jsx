import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function Plan() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [newEvent, setNewEvent] = useState({ title: '', description: '', type: 'study' });

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchEvents = useCallback(async () => {
    try {
      const res = await api.get('/events');
      setEvents(res.data.events || []);
    } catch (err) { console.error('Events fetch error:', err.message); }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay   = new Date(year, month, 1).getDay();

  const eventsOnDay = (day) => {
    const d = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return events.filter(e => e.date === d);
  };

  const handleDayClick = (day) => {
    const d = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    setSelectedDate(d);
    setShowModal(true);
  };

  const handleSaveEvent = async () => {
    if (!newEvent.title) return;
    try {
      await api.post('/events', { ...newEvent, date: selectedDate });
      setNewEvent({ title: '', description: '', type: 'study' });
      setShowModal(false);
      fetchEvents();
    } catch (err) {
      console.error('Failed to save event:', err);
      alert('Failed to save event.');
    }
  };

  return (
    <div className="tab-pane active" id="plan">
      <header className="top-header">
        <h1>Study Plan</h1>
        <div className="calendar-nav">
          <button className="icon-btn" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>
            <i className="ph ph-caret-left"></i>
          </button>
          <span className="month-label">{MONTHS[month]} {year}</span>
          <button className="icon-btn" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>
            <i className="ph ph-caret-right"></i>
          </button>
        </div>
      </header>

      <div className="calendar-grid-container">
        <div className="calendar-weekdays">
          {DAYS.map(d => <div key={d} className="weekday-label">{d}</div>)}
        </div>

        <div className="calendar-days">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="calendar-cell empty"></div>
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayEvents = eventsOnDay(day);
            const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
            return (
              <div
                key={day}
                className={`calendar-cell ${isToday ? 'today' : ''} ${dayEvents.length ? 'has-events' : ''}`}
                onClick={() => handleDayClick(day)}
              >
                <span className="day-number">{day}</span>
                {dayEvents.slice(0, 2).map((ev, ei) => (
                  <div key={ei} className={`event-chip type-${ev.type}`}>{ev.title}</div>
                ))}
                {dayEvents.length > 2 && <div className="event-chip more">+{dayEvents.length - 2}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>Add Event — {selectedDate}</h3>
            <div className="form-group">
              <label>Title</label>
              <input type="text" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} placeholder="e.g., Biology Study Session" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} placeholder="Optional notes..." rows={3}></textarea>
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={newEvent.type} onChange={e => setNewEvent({...newEvent, type: e.target.value})}>
                <option value="study">Study Session</option>
                <option value="exam">Exam</option>
                <option value="assignment">Assignment</option>
                <option value="review">Review</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="primary-btn" onClick={handleSaveEvent}>Save Event</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
