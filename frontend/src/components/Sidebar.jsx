import { NavLink } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import NotificationDropdown from './NotificationDropdown';

export default function Sidebar() {
  const { syncing } = useData();
  const { logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="logo-area">
        <i className="ph ph-brain logo-icon"></i>
        <h2>Cognify</h2>
      </div>

      <nav className="nav-menu">
        <NavLink to="/dashboard" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <i className="ph ph-squares-four"></i>
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/notes" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <i className="ph ph-notebook"></i>
          <span>Study Notes</span>
        </NavLink>
        <NavLink to="/flashcards" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <i className="ph ph-cards"></i>
          <span>Flashcards</span>
        </NavLink>
        <NavLink to="/plan" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <i className="ph ph-calendar-check"></i>
          <span>Study Plan</span>
        </NavLink>
        <NavLink to="/settings" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <i className="ph ph-gear"></i>
          <span>Settings</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className={`sync-indicator ${syncing ? 'syncing' : 'synced'}`}>
          <i className={`ph ${syncing ? 'ph-arrows-clockwise spin' : 'ph-cloud-check'}`}></i>
          <span>{syncing ? 'Syncing...' : 'Synced'}</span>
        </div>
        <NotificationDropdown />
        <button className="icon-btn logout-btn" onClick={logout} title="Sign out">
          <i className="ph ph-sign-out"></i>
        </button>
      </div>
    </aside>
  );
}
