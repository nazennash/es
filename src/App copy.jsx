// src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Auth from './components/Auth';
import Home from './components/Home';
import PrivateRoute from './components/PrivateRoute';

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
      <div className="App">
        <Routes>
          <Route 
            path="/" 
            element={
              user ? (
                <Navigate to="/home" replace />
              ) : (
                <Navigate to="/auth" replace />
              )
            } 
          />
          <Route 
            path="/auth" 
            element={user ? <Navigate to="/home" replace /> : <Auth />} 
          />
          <Route
            path="/home"
            element={<PrivateRoute element={() => <Home user={user} />} />}
          />
        </Routes>
      </div>
    </Router>
  );
};

export default App;