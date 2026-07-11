import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function NotificationDropdown() {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const { currentUser } = useAuth();
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!currentUser) return;
    fetchNotifications();
  }, [currentUser]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('cognify_token');
      const res = await fetch('http://localhost:3000/api/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications);
      }
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  };

  const markAsRead = async (id) => {
    try {
      const token = localStorage.getItem('cognify_token');
      await fetch(`http://localhost:3000/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchNotifications();
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="notification-dropdown" ref={dropdownRef} style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => setIsOpen(!isOpen)} title="Notifications">
        <i className="ph ph-bell"></i>
        {unreadCount > 0 && <span className="notification-badge" style={badgeStyle}>{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="dropdown-menu" style={menuStyle}>
          <h4 style={{ margin: '0 0 10px 0' }}>Notifications</h4>
          {notifications.length === 0 ? (
            <p style={{ padding: '10px', fontSize: '0.9rem', color: '#888', margin: 0 }}>No notifications yet.</p>
          ) : (
            <ul style={listStyle}>
              {notifications.map(n => (
                <li key={n.id} style={{ ...itemStyle, opacity: n.is_read ? 0.6 : 1 }}>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>{n.message}</p>
                  {!n.is_read && (
                    <button style={readBtnStyle} onClick={() => markAsRead(n.id)}>
                      Mark read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const badgeStyle = {
  position: 'absolute',
  top: '-2px',
  right: '-2px',
  background: '#e74c3c',
  color: '#fff',
  borderRadius: '50%',
  padding: '2px 6px',
  fontSize: '0.7rem',
  fontWeight: 'bold'
};

const menuStyle = {
  position: 'absolute',
  bottom: '40px', // since sidebar footer is at bottom
  left: '40px',
  width: '250px',
  background: 'var(--surface-color, #1e1e2d)',
  border: '1px solid var(--border-color, #2d2d3f)',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  zIndex: 1000,
  padding: '15px',
  color: 'var(--text-color, #fff)'
};

const listStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  maxHeight: '300px',
  overflowY: 'auto'
};

const itemStyle = {
  padding: '10px 0',
  borderBottom: '1px solid var(--border-color, #2d2d3f)',
  display: 'flex',
  flexDirection: 'column',
  gap: '5px'
};

const readBtnStyle = {
  alignSelf: 'flex-start',
  background: 'transparent',
  border: '1px solid #4a4a6a',
  color: '#aaa',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  padding: '2px 8px'
};
