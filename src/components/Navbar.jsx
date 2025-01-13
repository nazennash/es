import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = ({ user }) => {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">Puzzle App</Link>
      </div>
      <div className="navbar-links">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/leaderboard">Leaderboard</Link>
      </div>
      <div className="navbar-user">
        {user ? (
          <span>{user.email}</span>
        ) : (
          <Link to="/auth">Login</Link>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
