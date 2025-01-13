// src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Auth from './components/Auth';
import Home from './components/Home';
import PrivateRoute from './components/PrivateRoute';
import Dashboard from './components/Dashboard';
import PuzzleViewer from './components/PuzzleViewer';
import MultiplayerManager from './components/MultiplayerManager';
import Leaderboard from './components/Leaderboard';
import Navbar from './components/Navbar';
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

  // Pre-defined cultural theme puzzles
  const culturalPuzzles = [
    {
      id: 'african-pyramids',
      name: 'African Pyramids',
      thumbnail: '/assets/pyramids-thumb.jpg',
      modelUrl: '/assets/pyramids-3d.glb'
    },
    {
      id: 'elephant',
      name: 'African Elephant',
      thumbnail: '/assets/elephant-thumb.jpg',
      modelUrl: '/assets/elephant-3d.glb'
    },
    {
      id: 'mask',
      name: 'Traditional Mask',
      thumbnail: '/assets/mask-thumb.jpg',
      modelUrl: '/assets/mask-3d.glb'
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        {user && <Navbar user={user} />}
        <Routes>
          <Route 
            path="/" 
            element={
              user ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Navigate to="/auth" replace />
              )
            } 
          />
          <Route 
            path="/auth" 
            element={user ? <Navigate to="/dashboard" replace /> : <Auth />} 
          />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute 
                element={() => (
                  <Dashboard 
                    user={user} 
                    culturalPuzzles={culturalPuzzles}
                  />
                )} 
              />
            }
          />
          <Route
            path="/puzzle/custom"
            element={
              <PrivateRoute 
                element={() => (
                  <div className="puzzle-container">
                    <PuzzleViewer />
                    <MultiplayerManager puzzleId="custom" />
                    <Leaderboard puzzleId="custom" />
                  </div>
                )} 
              />
            }
          />
          <Route
            path="/puzzle/cultural/:id"
            element={
              <PrivateRoute 
                element={({ params }) => {
                  const puzzle = culturalPuzzles.find(p => p.id === params.id);
                  return (
                    <div className="puzzle-container">
                      <PuzzleViewer 
                        modelUrl={puzzle.modelUrl}
                        isPredesigned={true}
                      />
                      <MultiplayerManager puzzleId={params.id} />
                      <Leaderboard puzzleId={params.id} />
                    </div>
                  );
                }} 
              />
            }
          />
          <Route
            path="/puzzle/multiplayer/:sessionId"
            element={
              <PrivateRoute 
                element={({ params }) => (
                  <div className="puzzle-container">
                    <PuzzleViewer isMultiPlayer={true} />
                    <MultiplayerManager 
                      puzzleId={params.sessionId}
                      isHost={false}
                    />
                  </div>
                )} 
              />
            }
          />
          <Route
            path="/leaderboard"
            element={
              <PrivateRoute 
                element={() => (
                  <div className="leaderboard-container">
                    <h2 className="text-2xl font-bold mb-4">Global Leaderboard</h2>
                    {culturalPuzzles.map(puzzle => (
                      <div key={puzzle.id} className="mb-6">
                        <h3 className="text-xl font-semibold mb-2">{puzzle.name}</h3>
                        <Leaderboard puzzleId={puzzle.id} />
                      </div>
                    ))}
                  </div>
                )} 
              />
            }
          />
        </Routes>
      </div>
    </Router>
  );
};

export default App;