import { ArrowUpRight, LayoutGrid, UserRound } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { REVIEW_PATH, REVIEW_YEAR } from '../features/rowingReview/reviewConfig';
import { AppFooter, Brand } from './Brand';

export function Layout() {
  const { user } = useAuth();

  return (
    <div className="pb-app">
      <header className="pb-header">
        <div className="pb-wrap pb-mast">
          <Brand to="/dashboard" />
          <nav className="pb-nav" aria-label="Main navigation">
            <NavLink to="/dashboard"><LayoutGrid size={15} aria-hidden="true" /> Dashboard</NavLink>
            <NavLink to={REVIEW_PATH}>{REVIEW_YEAR} Review <ArrowUpRight size={14} aria-hidden="true" /></NavLink>
          </nav>
          <NavLink className="pb-account" to="/profile">
            <span className="pb-avatar">
              {user?.photoURL ? <img src={user.photoURL} alt="" /> : <UserRound size={16} aria-hidden="true" />}
            </span>
            <span>Profile</span>
          </NavLink>
        </div>
      </header>
      <main className="pb-wrap pb-main">
        <Outlet />
      </main>
      <AppFooter />
    </div>
  );
}
