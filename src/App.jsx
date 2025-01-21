import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Auth from './components/Auth';
import Home from './components/Home';
import PrivateRoute from './components/PrivateRoute';
import MultiplayerManager from './components/MultiplayerManager';
import Leaderboard from './components/Leaderboard';
import Navbar from './components/Navbar';
import CustomUserPuzzle from './components/CustomUserPuzzle';
import CustomCulturalPuzzle from './components/CustomCulturalPuzzle';
import { useParams } from 'react-router-dom';

// Component for multiplayer puzzle view
const MultiplayerPuzzle = () => {
  const { gameId } = useParams();
  const isNewGame = !gameId.includes('join_');
  const actualGameId = isNewGame ? gameId : gameId.replace('join_', '');

  return (
    <div className="puzzle-container">
      <MultiplayerManager 
        gameId={actualGameId}
        isHost={isNewGame}
        isMultiPlayer={true}
      />
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        localStorage.setItem('authUser', JSON.stringify(user));
      } else {
        setUser(null);
        localStorage.removeItem('authUser');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <HashRouter>
      <div className="App min-h-screen bg-gray-50">
        {user && <Navbar user={user} />}
        <main className="container mx-auto px-4 py-8">
          <Routes>
            {/* Public Routes */}
            <Route 
              path="/auth" 
              element={user ? <Navigate to="/" replace /> : <Auth />} 
            />
            
            {/* Protected Routes */}
            <Route 
              path="/" 
              element={user ? <Home user={user} /> : <Navigate to="/auth" replace />} 
            />

            <Route 
              path="/puzzle/custom"
              element={<PrivateRoute element={CustomUserPuzzle} />}
            />

            <Route 
              path="/puzzle/cultural"
              element={<PrivateRoute element={CustomCulturalPuzzle} />}
            />

            <Route
              path="/puzzle/multiplayer/:gameId"
              element={<PrivateRoute element={MultiplayerPuzzle} />}
            />

            <Route
              path="/leaderboard"
              element={<PrivateRoute element={Leaderboard} />}
            />

            <Route
              path="/user-leaderboard"
              element={
                <PrivateRoute 
                  element={() => 
                    <Leaderboard 
                      puzzleId={user?.uid} 
                      userId={user?.uid} 
                    />
                  } 
                />
              }
            />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;