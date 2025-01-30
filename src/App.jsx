import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { Elements } from '@stripe/stripe-elements';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import { loadStripe } from '@stripe/stripe-js';
import { auth } from './firebase';
import { nanoid } from 'nanoid';

// Components
import Auth from './components/Auth';
import Home from './components/Home';
import PrivateRoute from './components/PrivateRoute';
import MultiplayerManager from './components/MultiplayerManager';
import Leaderboard from './components/Leaderboard';
import Navbar from './components/Navbar';
import CustomUserPuzzle from './components/CustomUserPuzzle';
import CustomCulturalPuzzle from './components/CustomCulturalPuzzle';
import ErrorBoundary from './components/ErrorBoundary';
import CollaborativePuzzle from './components/CollaborativePuzzle';
import PaymentForm from './components/PaymentForm';
import PaymentSuccess from './components/PaymentSuccess';
import { Toaster } from 'react-hot-toast';

// Initialize Stripe with environment variable
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

// PayPal configuration with environment variable
const paypalOptions = {
  "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID,
  currency: "USD",
  intent: "capture",
  // For development - use sandbox
  "enable-funding": "card",
  "disable-funding": "paylater,venmo",
};

// Multiplayer Puzzle Component
const MultiplayerPuzzle = () => {
  const { gameId } = useParams();
  const userData = JSON.parse(localStorage.getItem('authUser'));
  
  const isJoining = gameId.startsWith('join_');
  const actualGameId = isJoining ? gameId.replace('join_', '') : gameId;
  
  return (
    <ErrorBoundary>
      <div className="puzzle-container">
        <MultiplayerManager 
          gameId={actualGameId}
          isHost={!isJoining}
          isMultiPlayer={true}
          user={userData}
          key={actualGameId}
        />
      </div>
    </ErrorBoundary>
  );
};

// New Multiplayer Game Component
const NewMultiplayerGame = () => {
  const gameId = nanoid(6);
  const userData = JSON.parse(localStorage.getItem('authUser'));
  return (
    <ErrorBoundary>
      <div className="puzzle-container">
        <MultiplayerManager 
          gameId={gameId}
          isHost={true}
          isMultiPlayer={true}
          user={userData}
          key={gameId}
        />
      </div>
    </ErrorBoundary>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        };
        setUser(userData);
        localStorage.setItem('authUser', JSON.stringify(userData));
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
    <PayPalScriptProvider options={paypalOptions}>
      <Elements stripe={stripePromise}>
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

                {/* Payment Routes */}
                <Route
                  path="/payment"
                  element={
                    <PrivateRoute
                      element={() => (
                        <PaymentForm
                          amount={999}
                          onSuccess={(details) => {
                            console.log('Payment successful:', details);
                            // Handle successful payment
                          }}
                          onError={(error) => {
                            console.error('Payment failed:', error);
                            // Handle payment error
                          }}
                        />
                      )}
                    />
                  }
                />
                <Route
                  path="/payment/success"
                  element={<PrivateRoute element={PaymentSuccess} />}
                />

                {/* Puzzle Routes */}
                <Route 
                  path="/puzzle/custom"
                  element={<PrivateRoute element={CustomUserPuzzle} />}
                />
                <Route 
                  path="/puzzle/cultural"
                  element={<PrivateRoute element={CustomCulturalPuzzle} />}
                />

                {/* Multiplayer Routes */}
                <Route
                  path="/puzzle/multiplayer/new"
                  element={<PrivateRoute element={NewMultiplayerGame} />}
                />
                <Route
                  path="/puzzle/multiplayer/:gameId"
                  element={
                    <CollaborativePuzzle 
                      mode="play"
                    />
                  }
                />

                {/* Leaderboard Routes */}
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

                {/* Catch-all redirect */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
          <Toaster position="top-right" />
        </HashRouter>
      </Elements>
    </PayPalScriptProvider>
  );
};

export default App;