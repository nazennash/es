import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = ({ user }) => {
  return (
    <nav className="bg-gray-900 text-white p-4">
      <div className="container mx-auto flex items-center justify-between">
        {/* Brand Logo */}
        <div className="text-2xl font-bold">
          <Link to="/" className="hover:text-yellow-400 transition-colors">
            Puzzle App
          </Link>
        </div>

        {/* Links for navigation */}
        <div className="hidden md:flex space-x-6">
          <Link
            to="/"
            className="hover:text-yellow-400 transition-colors"
          >
            Home
          </Link>
          <Link
            to="/leaderboard"
            className="hover:text-yellow-400 transition-colors"
          >
            Leaderboard
          </Link>
        </div>

        {/* User Authentication */}
        <div className="flex items-center space-x-4">
          {user ? (
            <span className="hidden md:inline-block text-sm bg-gray-700 py-2 px-4 rounded-full">
              {user.email}
            </span>
          ) : (
            <Link
              to="/auth"
              className="text-sm bg-yellow-500 hover:bg-yellow-600 py-2 px-4 rounded-full transition-colors"
            >
              Login
            </Link>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden">
          <button
            className="text-yellow-400 focus:outline-none"
            aria-label="Open menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
