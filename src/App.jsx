import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Auth from './components/Auth';
import Home from './components/Home';
import PrivateRoute from './components/PrivateRoute';
import PuzzlePage from './components/PuzzlePage';
import PuzzleViewer from './components/PuzzleViewer';
import MultiplayerManager from './components/MultiplayerManager';
import Leaderboard from './components/Leaderboard';
import Navbar from './components/Navbar';
import { useParams } from 'react-router-dom';
import PuzzleImageUploader from './components/PuzzleImageUploader';

// Cultural puzzles data
const culturalPuzzles = [
  {
    id: 'african-pyramids',
    name: 'African Pyramids',
    thumbnail: '/assets/react.svg',
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

// Component for multiplayer puzzle view
const MultiplayerPuzzle = () => {
  const { sessionId } = useParams();
  return (
    <div className="puzzle-container">

      <MultiplayerManager 
        puzzleId={sessionId}
        isHost={false}
        isMultiPlayer={true}
        imageUrl="https://firebasestorage.googleapis.com/v0/b/nash-ac5c0.firebasestorage.app/o/puzzle-images%2F1736843575135-WhatsApp%20Image%202025-01-07%20at%2012.41.45_d81d1a26.jpg?alt=media&token=0e708d01-79d9-40b9-a403-8e4db66f34cb"
      />
    </div>
  );
};

// Component for cultural puzzle view
const CulturalPuzzle = () => {
  const { id } = useParams();
  const puzzle = culturalPuzzles.find(p => p.id === id);
  
  if (!puzzle) {
    return <Navigate to="/puzzle/cultural" replace />;
  }
  
  return (
    <div className="puzzle-container">
      <PuzzleViewer 
        modelUrl={puzzle.modelUrl}
        isPredesigned={true}
      />
      <MultiplayerManager puzzleId={id} />
      <Leaderboard puzzleId={id} />
    </div>
  );
};

// Component for cultural puzzles gallery
const CulturalPuzzlesGallery = () => (
  <div className="cultural-puzzles-container p-6">
    <h2 className="text-2xl font-bold mb-4">Cultural Puzzles</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {culturalPuzzles.map(puzzle => (
        <div 
          key={puzzle.id} 
          className="puzzle-card bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
        >
          <img 
            src={puzzle.thumbnail} 
            alt={puzzle.name} 
            className="w-full h-48 object-cover"
          />
          <div className="p-4">
            <h3 className="text-xl font-semibold">{puzzle.name}</h3>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Component for global leaderboard
const GlobalLeaderboard = () => (
  <div className="leaderboard-container p-6">
    <h2 className="text-2xl font-bold mb-4">Global Leaderboard</h2>
    <div className="space-y-6">
      {culturalPuzzles.map(puzzle => (
        <div key={puzzle.id} className="bg-white rounded-lg shadow p-4">
          <h3 className="text-xl font-semibold mb-2">{puzzle.name}</h3>
          <Leaderboard puzzleId={puzzle.id} />
        </div>
      ))}
    </div>
  </div>
);

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
    <Router>
      <div className="App min-h-screen bg-gray-50">
        {user && <Navbar user={user} />}
        <main className="container mx-auto px-4 py-8">
          <Routes>
            {/* Auth & Home Routes */}
            <Route 
              path="/" 
              element={user ? <Home user={user} /> : <Navigate to="/auth" replace />} 
            />
            <Route 
              path="/auth" 
              element={user ? <Navigate to="/" replace /> : <Auth />} 
            />

            <Route 
              path="/puzzle/multiplayer/:gameId" 
              element={<MultiplayerPuzzle />} 
            />

            {/* Puzzle Routes */}
            <Route
              path="/puzzle/cultural"
              element={<PrivateRoute element={CulturalPuzzlesGallery} />}
            />
            <Route
              path="/puzzle/cultural/:id"
              element={<PrivateRoute element={CulturalPuzzle} />}
            />
            <Route
              path="/puzzle/:puzzleId"
              element={<PrivateRoute element={PuzzlePage} />}
            />
            <Route
              path="/puzzle/multiplayer/:sessionId"
              // element={<PrivateRoute element={MultiplayerPuzzle} />}
              element={<MultiplayerPuzzle user={user} isHost={true} />} 
            />

            {/* Leaderboard Route */}
            <Route
              path="/leaderboard"
              element={<PrivateRoute element={GlobalLeaderboard} />}
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;