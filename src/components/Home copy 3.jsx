import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { auth } from '../firebase'; // Ensure this is initialized correctly
import { useNavigate } from 'react-router-dom';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  doc,
  limit
} from 'firebase/firestore';
import { nanoid } from 'nanoid';
import QuickAccess from './QuickAccess';
import toast from 'react-hot-toast';
import { FaPuzzlePiece, FaTrophy, FaClock, FaSignOutAlt, FaChartBar, FaImage, FaGlobe, FaUsers } from 'react-icons/fa';
import { loadStripe } from '@stripe/stripe-js';
import { usePayment } from '../hooks/usePayment';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);


import { usePayment } from '../hooks/usePayment';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { Elements } from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js';


// Initialize Firestore
const db = getFirestore();

// Custom caching functions
const getCachedData = (key) => {
  const cachedData = localStorage.getItem(key);
  if (cachedData) {
    const { data, timestamp } = JSON.parse(cachedData);
    // Check if cache is still valid (e.g., 5 minutes)
    if (Date.now() - timestamp < 5 * 60 * 1000) {
      return data;
    }
  }
  return null;
};

const setCachedData = (key, data) => {
  const cache = {
    data,
    timestamp: Date.now()
  };
  localStorage.setItem(key, JSON.stringify(cache));
};

// Custom hook for user stats and puzzles
const useUserData = (userId) => {
  const [data, setData] = useState({
    recentPuzzles: [],
    stats: {
      completed: 0,
      bestTime: null,
      averageTime: null
    },
    loading: true,
    error: null
  });

  useEffect(() => {
    if (!userId) return;

    // Check local storage for cached data
    const cachedPuzzles = getCachedData(`recentPuzzles-${userId}`);
    const cachedStats = getCachedData(`userStats-${userId}`);

    if (cachedPuzzles && cachedStats) {
      setData({
        recentPuzzles: cachedPuzzles,
        stats: cachedStats,
        loading: false,
        error: null
      });
    }

    // Real-time listener for recent puzzles
    const puzzlesRef = collection(db, 'completed_puzzles');
    const puzzlesQuery = query(
      puzzlesRef,
      where('userId', '==', userId),
      orderBy('completionTime', 'desc'),
      limit(3)
    );

    const calculateAverageTime = (puzzles) => {
      if (!puzzles.length) return null;
      const totalTime = puzzles.reduce((sum, puzzle) => sum + puzzle.completionTime, 0);
      return Math.round(totalTime / puzzles.length);
    };

    const unsubscribePuzzles = onSnapshot(puzzlesQuery, (puzzleSnap) => {
      const puzzlesData = puzzleSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).reverse();

      // Calculate average time
      const averageTime = calculateAverageTime(puzzlesData);

      // Cache recent puzzles
      setCachedData(`recentPuzzles-${userId}`, puzzlesData);

      setData((prev) => ({
        ...prev,
        recentPuzzles: puzzlesData,
        stats: {
          ...prev.stats,
          averageTime
        },
        loading: false,
        error: null
      }));
    }, (error) => {
      console.error('Error fetching recent puzzles:', error);
      setData((prev) => ({
        ...prev,
        loading: false,
        error: 'Failed to load recent puzzles'
      }));
      toast.error('Failed to load recent puzzles');
    });

    // Real-time listener for user stats
    const userStatsRef = doc(db, 'user_stats', userId);
    const unsubscribeStats = onSnapshot(userStatsRef, (userStatsSnap) => {
      if (userStatsSnap.exists()) {
        const statsData = userStatsSnap.data();

        // Cache user stats
        setCachedData(`userStats-${userId}`, statsData);

        setData((prev) => ({
          ...prev,
          stats: {
            ...prev.stats,
            completed: statsData.completed || 0,
            bestTime: statsData.bestTime
          },
          loading: false,
          error: null
        }));
      }
    }, (error) => {
      console.error('Error fetching user stats:', error);
      setData((prev) => ({
        ...prev,
        loading: false,
        error: 'Failed to load user stats'
      }));
      toast.error('Failed to load user stats');
    });

    // Cleanup listeners on unmount or userId change
    return () => {
      unsubscribePuzzles();
      unsubscribeStats();
    };
  }, [userId]);

  return data;
};

// Memoized time formatter utility
const formatTime = (time) => {
  if (!time) return '--:--';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const milliseconds = String(time.toFixed(3).split('.')[1] || '000').slice(0, 2);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${milliseconds}`;
};

// Main component
const Home = ({ user }) => {
  const navigate = useNavigate();
  const { recentPuzzles, stats, loading, error } = useUserData(user?.uid);

  // const { handleStripePayment, handlePayPalPayment, loading:paymentLoading } = usePayment();
  const { handleStripePayment, handlePayPalPayment, handlePayPalCapture, loading:paymentLoading } = usePayment();


  // const { recentPuzzles, stats, loading, error } = useUserData(user?.uid);
  // const { handleStripePayment, handlePayPalPayment, loading, error } = usePayment();
  // const { handleStripePayment, handlePayPalPayment, loading: paymentLoading } = usePayment();
  
  
  const handlePayment = async (method) => {
    const amount = 9.99; // Your premium plan amount

    try {
      if (method === 'stripe') {
        const result = await handleStripePayment(amount);
        if (result.status === 'succeeded') {
          // Handle successful payment
          console.log('Payment successful!');
        }
      } else if (method === 'paypal') {
        const order = await handlePayPalPayment(amount);
        // PayPal will handle the rest through its button component
      }
    } catch (err) {
      console.error('Payment failed:', err);
    }
  };

  

  // Memoized Stats Section to prevent unnecessary re-renders
  const StatsSection = useMemo(() => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="bg-white rounded-lg shadow-lg p-6 transform transition-transform hover:scale-105 hover:shadow-2xl">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <FaPuzzlePiece className="mr-2 text-blue-600" /> Puzzles Completed
        </h3>
        <p className="text-3xl font-bold text-blue-600">{stats.completed}</p>
      </div>
      <div className="bg-white rounded-lg shadow-lg p-6 transform transition-transform hover:scale-105 hover:shadow-2xl">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <FaTrophy className="mr-2 text-green-600" /> Best Time
        </h3>
        <p className="text-3xl font-bold text-green-600">
          {formatTime(stats.bestTime)}
        </p>
      </div>
      <div className="bg-white rounded-lg shadow-lg p-6 transform transition-transform hover:scale-105 hover:shadow-2xl">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <FaClock className="mr-2 text-purple-600" /> Average Time
        </h3>
        <p className="text-3xl font-bold text-purple-600">
          {formatTime(stats.averageTime)}
        </p>
      </div>
    </div>
  ), [stats.completed, stats.bestTime, stats.averageTime]);

  // Memoized handlers to prevent unnecessary re-renders
  const handleLogout = useCallback(async () => {
    try {
      await auth.signOut();
      localStorage.removeItem('authUser');
      navigate('/auth');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  }, [navigate]);

  const handleStartPuzzle = useCallback((type) => {
    switch(type) {
      case 'custom':
        navigate('/puzzle/custom');
        break;
      case 'cultural':
        navigate('/puzzle/cultural');
        break;
      case 'multiplayer':
        const gameId = nanoid(6);
        navigate(`/puzzle/multiplayer/${gameId}`);
        break;
      default:
        break;
    }
  }, [navigate]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-500 to-purple-600 relative overflow-hidden">
      {/* Background Animation */}
      <div className="absolute inset-0 z-0">
        <div className="puzzle-bg"></div>
      </div>

      {/* Header Section */}
      <div className="bg-white shadow-sm md:flex md:items-center md:justify-between md:py-6 md:px-4 relative z-10">
        <div className="flex flex-col md:flex-row md:items-center md:gap-4 pb-5 md:pb-0">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome, {user?.displayName || user?.email}!
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Ready to solve some puzzles?
            </p>
          </div>
          <div className="hidden md:flex md:gap-2 mt-4 md:mt-0">
            <button
              onClick={handleLogout}
              className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 transition duration-200 flex items-center transform hover:scale-105"
            >
              <FaSignOutAlt className="mr-2" /> Logout
            </button>
            <button
              onClick={() => navigate('/user-leaderboard')}
              className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition duration-200 flex items-center transform hover:scale-105"
            >
              <FaChartBar className="mr-2" /> Leaderboard
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        {/* Stats Section */}
        {StatsSection}

        {/* Start New Puzzle Section */}
        <div className="bg-white rounded-lg shadow-lg mb-8 transform transition-transform hover:scale-102 hover:shadow-2xl">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Start New Puzzle</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  type: 'custom',
                  title: 'Custom Photo Puzzle',
                  description: 'Upload your own image',
                  bgColor: 'bg-blue-50',
                  hoverColor: 'hover:bg-blue-100',
                  textColor: 'text-blue-600',
                  icon: <FaImage className="text-4xl mb-2 text-blue-600" />
                },
                {
                  type: 'cultural',
                  title: 'Cultural Themes',
                  description: 'Explore pre-designed puzzles',
                  bgColor: 'bg-green-50',
                  hoverColor: 'hover:bg-green-100',
                  textColor: 'text-green-600',
                  icon: <FaGlobe className="text-4xl mb-2 text-green-600" />
                },
                {
                  type: 'multiplayer',
                  title: 'Multiplayer',
                  description: 'Solve with friends',
                  bgColor: 'bg-purple-50',
                  hoverColor: 'hover:bg-purple-100',
                  textColor: 'text-purple-600',
                  icon: <FaUsers className="text-4xl mb-2 text-purple-600" />
                }
              ].map(({ type, title, description, bgColor, hoverColor, textColor, icon }) => (
                <button
                  key={type}
                  onClick={() => handleStartPuzzle(type)}
                  className={`flex flex-col items-center justify-center p-6 ${bgColor} rounded-lg ${hoverColor} transition duration-200 transform hover:scale-105 hover:shadow-lg`}
                >
                  {icon}
                  <div className={`font-semibold ${textColor}`}>{title}</div>
                  <div className="text-sm text-gray-600">{description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Access Section */}
        <div className="mt-8">
          <QuickAccess userId={user.uid} />
        </div>

        {/* Recent Puzzles Section */}
        <div className="bg-white rounded-lg shadow-lg transform transition-transform hover:scale-102 hover:shadow-2xl mt-5">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Puzzles</h2>
            {recentPuzzles.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {recentPuzzles.map(puzzle => (
                  <div 
                    key={puzzle.id} 
                    className="border rounded-lg p-4 hover:shadow-md transition duration-200 transform hover:scale-105"
                  >
                    <img 
                      src={puzzle.thumbnail} 
                      alt="Puzzle thumbnail" 
                      className="w-full h-32 object-contain rounded mb-2"
                      loading="lazy"
                    />
                    <h3 className="font-semibold">{puzzle.name || 'Puzzle'}</h3>
                    <p className="text-sm text-gray-600">
                      Completed in {formatTime(puzzle.completionTime)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600">No puzzles completed yet. Start solving!</p>
            )}
          </div>
        </div>

        {/* Payment Section */}
        
        <div className="bg-white rounded-lg shadow-lg transform transition-transform hover:scale-102 hover:shadow-2xl mt-5">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Premium Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Premium Plan Card */}
              <div className="border rounded-lg p-6 bg-gradient-to-br from-purple-50 to-blue-50">
                <h3 className="text-lg font-semibold mb-2">Premium Plan</h3>
                <p className="text-gray-600 mb-4">Unlock all premium features and puzzles</p>
                <div className="text-2xl font-bold text-blue-600 mb-4">$9.99/month</div>
                <div className="space-y-3">
                  {/* PayPal Button */}
                  <button 
                    onClick={() => handlePayment('paypal')}
                    disabled={paymentLoading}
                    className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 
                              transition duration-200 flex items-center justify-center 
                              disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {paymentLoading ? (
                      <span className="animate-spin mr-2">⌛</span>
                    ) : (
                      <img 
                        src="https://www.paypalobjects.com/webstatic/en_US/i/buttons/PP_logo_h_100x26.png" 
                        alt="PayPal" 
                        className="h-6 mr-2"
                      />
                    )}
                    Pay with PayPal
                  </button>

                  {/* Stripe Button */}
                  <button 
                    onClick={() => handlePayment('stripe')}
                    disabled={paymentLoading}
                    className="w-full bg-purple-500 text-white py-2 px-4 rounded hover:bg-purple-600 
                              transition duration-200 flex items-center justify-center
                              disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {paymentLoading ? (
                      <span className="animate-spin mr-2">⌛</span>
                    ) : (
                      <svg className="h-6 w-6 mr-2" viewBox="0 0 32 32">
                        <path fill="#ffffff" d="M32 16c0 8.837-7.163 16-16 16S0 24.837 0 16 7.163 0 16 0s16 7.163 16 16"/>
                      </svg>
                    )}
                    Pay with Card
                  </button>
                </div>

                {/* Features List */}
                <div className="mt-4">
                  <h4 className="font-semibold mb-2">Included Features:</h4>
                  <ul className="space-y-2">
                    <li className="flex items-center text-gray-600">
                      <span className="mr-2">✓</span> Unlimited puzzles
                    </li>
                    <li className="flex items-center text-gray-600">
                      <span className="mr-2">✓</span> Custom difficulty levels
                    </li>
                    <li className="flex items-center text-gray-600">
                      <span className="mr-2">✓</span> Ad-free experience
                    </li>
                    <li className="flex items-center text-gray-600">
                      <span className="mr-2">✓</span> Priority support
                    </li>
                  </ul>
                </div>
              </div>

              {/* Benefits Section */}
              <div className="border rounded-lg p-6 bg-gradient-to-br from-green-50 to-blue-50">
                <h3 className="text-lg font-semibold mb-4">Why Go Premium?</h3>
                <div className="space-y-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <FaPuzzlePiece className="h-6 w-6 text-blue-500" />
                    </div>
                    <div className="ml-3">
                      <h4 className="font-semibold">Enhanced Puzzle Library</h4>
                      <p className="text-gray-600">Access to exclusive puzzle collections and themes</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <FaUsers className="h-6 w-6 text-green-500" />
                    </div>
                    <div className="ml-3">
                      <h4 className="font-semibold">Multiplayer Features</h4>
                      <p className="text-gray-600">Create private rooms and customize game settings</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <FaTrophy className="h-6 w-6 text-yellow-500" />
                    </div>
                    <div className="ml-3">
                      <h4 className="font-semibold">Advanced Statistics</h4>
                      <p className="text-gray-600">Detailed progress tracking and achievements</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    
      </div>
    </div>
  );
};

export default Home;