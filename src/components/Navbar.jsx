import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const Navbar = ({ user }) => {
  // State to manage the mobile menu visibility
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Toggle function for mobile menu
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

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
          <Link to="/" className="hover:text-yellow-400 transition-colors">
            Home
          </Link>
          <Link to="/leaderboard" className="hover:text-yellow-400 transition-colors">
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
            onClick={toggleMobileMenu}
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

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-gray-800 text-white p-4 space-y-4">
          <Link
            to="/"
            className="block hover:text-yellow-400 transition-colors"
            onClick={() => setIsMobileMenuOpen(false)} // Close menu on link click
          >
            Home
          </Link>
          <Link
            to="/leaderboard"
            className="block hover:text-yellow-400 transition-colors"
            onClick={() => setIsMobileMenuOpen(false)} // Close menu on link click
          >
            Leaderboard
          </Link>
          {user ? (
            <span className="block text-sm bg-gray-700 py-2 px-4 rounded-full">
              {user.email}
            </span>
          ) : (
            <Link
              to="/auth"
              className="block text-sm bg-yellow-500 hover:bg-yellow-600 py-2 px-4 rounded-full transition-colors"
              onClick={() => setIsMobileMenuOpen(false)} // Close menu on link click
            >
              Login
            </Link>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
