// src/components/Home.jsx
import React from 'react';
import { auth } from '../firebase';
import { useNavigate } from 'react-router-dom';

const Home = ({ user }) => {
  const navigate = useNavigate();
  
  const handleLogout = async () => {
    try {
      await auth.signOut();
      localStorage.removeItem('authUser');
      navigate('/auth');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">
          Welcome, {user?.displayName || user?.email}!
        </h1>
        <p className="text-xl mb-6">You are logged in!</p>
        <button
          onClick={handleLogout}
          className="bg-red-500 text-white py-2 px-6 rounded hover:bg-red-600 transition duration-200"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Home;