import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  doc,
  getDoc,
  limit,
  writeBatch
} from 'firebase/firestore';
import { nanoid } from 'nanoid';
import QuickAccess from './QuickAccess';
import toast from 'react-hot-toast';
import { Trophy, Clock, Target, Upload, Users, Puzzle, LogOut, Crown, 
         ChevronRight, ImagePlus, Gamepad2, Image } from 'lucide-react';

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
    const fetchData = async () => {
      if (!userId) return;
      try {
        const db = getFirestore();
        
        // Fetch recent puzzles and stats in parallel
        const [puzzlesData, statsData] = await Promise.all([
          fetchRecentPuzzles(db, userId),
          fetchUserStats(db, userId)
        ]);
        
        // Calculate stats
        const averageTime = calculateAverageTime(puzzlesData);
        
        setData({
          recentPuzzles: puzzlesData,
          stats: {
            completed: statsData.completed || 0,
            bestTime: statsData.bestTime,
            averageTime
          },
          loading: false,
          error: null
        });
      } catch (error) {
        console.error('Error fetching user data:', error);
        setData(prev => ({
          ...prev,
          loading: false,
          error: 'Failed to load user data'
        }));
        toast.error('Failed to load user data');
      }
    };
    fetchData();
  }, [userId]);

  return data;
};

// Helper Functions
const fetchRecentPuzzles = async (db, userId) => {
  const puzzlesRef = collection(db, 'completed_puzzles');
  const puzzlesQuery = query(
    puzzlesRef,
    where('userId', '==', userId),
    orderBy('completionTime', 'desc'),
    limit(3)
  );
  
  const puzzleSnap = await getDocs(puzzlesQuery);
  return puzzleSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })).reverse();
};

const fetchUserStats = async (db, userId) => {
  const userStatsRef = doc(collection(db, 'user_stats'), userId);
  const userStatsSnap = await getDoc(userStatsRef);
  return userStatsSnap.exists() ? userStatsSnap.data() : {};
};

const calculateAverageTime = (puzzles) => {
  if (!puzzles.length) return null;
  const totalTime = puzzles.reduce((sum, puzzle) => sum + puzzle.completionTime, 0);
  return Math.round(totalTime / puzzles.length);
};

const formatTime = (time) => {
  if (!time) return '--:--';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const milliseconds = String(time.toFixed(3).split('.')[1] || '000').slice(0, 2);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${milliseconds}`;
};

// Reusable Components
const PuzzlePiece = ({ className }) => (
  <div className={`absolute ${className} transform transition-all duration-1000`}>
    <div className="w-full h-full bg-white/10 backdrop-blur-sm rounded-lg shadow-xl" />
  </div>
);

const StatCard = ({ icon: Icon, title, value, color }) => (
  <div className="relative overflow-hidden group">
    <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-white/30 backdrop-blur-sm rounded-xl transform transition-all duration-300 group-hover:scale-105" />
    <div className={`relative bg-white/90 rounded-xl p-6 shadow-lg transform transition-all duration-300 
                    hover:translate-y-[-4px] hover:shadow-2xl border border-${color}-100`}>
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg bg-${color}-50`}>
          <Icon className={`w-6 h-6 text-${color}-500`} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className={`text-3xl font-bold text-${color}-600 mt-1`}>{value}</p>
        </div>
      </div>
    </div>
  </div>
);

const PuzzleOption = ({ icon: Icon, title, description, color, onClick }) => (
  <button
    onClick={onClick}
    className={`group relative overflow-hidden rounded-xl transition-all duration-300 
                hover:scale-105 focus:outline-none focus:ring-2 focus:ring-${color}-400 focus:ring-offset-2`}
  >
    <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-white/30 backdrop-blur-sm" />
    <div className={`relative p-6 bg-${color}-50/90 h-full flex flex-col items-center text-center`}>
      <Icon className={`w-8 h-8 text-${color}-500 mb-3 transform transition-all duration-300 
                       group-hover:scale-110 group-hover:rotate-12`} />
      <h3 className={`font-bold text-${color}-700 mb-2`}>{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  </button>
);

const RecentPuzzleCard = ({ puzzle }) => (
  <div className="group relative overflow-hidden rounded-xl transform transition-all duration-300 hover:scale-105">
    <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-white/30 backdrop-blur-sm" />
    <div className="relative bg-white/90 p-4 shadow-lg">
      <div className="relative h-32 mb-3 overflow-hidden rounded-lg">
        <img 
          src={puzzle.thumbnail} 
          alt="Puzzle thumbnail" 
          className="w-full h-full object-cover transform transition-all duration-500 group-hover:scale-110"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-all duration-300" />
      </div>
      <h3 className="font-semibold text-gray-800">{puzzle.name || 'Puzzle'}</h3>
      <div className="flex items-center gap-2 mt-2">
        <Clock className="w-4 h-4 text-blue-500" />
        <p className="text-sm text-gray-600">
          Completed in {formatTime(puzzle.completionTime)}
        </p>
      </div>
    </div>
  </div>
);

// Add custom animations
const style = document.createElement('style');
style.textContent = `
  @keyframes float-slow {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-20px) rotate(5deg); }
  }
  
  @keyframes float-medium {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-15px) rotate(-5deg); }
  }
  
  @keyframes float-fast {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-10px) rotate(10deg); }
  }
  
  .animate-float-slow {
    animation: float-slow 8s ease-in-out infinite;
  }
  
  .animate-float-medium {
    animation: float-medium 6s ease-in-out infinite;
  }
  
  .animate-float-fast {
    animation: float-fast 4s ease-in-out infinite;
  }
`;
document.head.appendChild(style);

// Main Component
const Home = ({ user }) => {
  const navigate = useNavigate();
  const { recentPuzzles, stats, loading, error } = useUserData(user.uid);

  const StatsSection = useMemo(() => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <StatCard 
        icon={Trophy} 
        title="Puzzles Completed" 
        value={stats.completed} 
        color="blue"
      />
      <StatCard 
        icon={Clock} 
        title="Best Time" 
        value={formatTime(stats.bestTime)} 
        color="green"
      />
      <StatCard 
        icon={Target} 
        title="Average Time" 
        value={formatTime(stats.averageTime)} 
        color="purple"
      />
    </div>
  ), [stats]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="relative">
          <Puzzle className="w-12 h-12 text-blue-500 animate-spin" />
          <div className="absolute inset-0 bg-white/30 backdrop-blur-sm rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50">
        <div className="text-center bg-white/80 backdrop-blur-sm p-8 rounded-xl shadow-xl">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                     transform transition-all duration-300 hover:scale-105 hover:shadow-lg"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 relative">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <PuzzlePiece className="w-32 h-32 top-1/4 left-1/4 rotate-45 animate-float-slow" />
        <PuzzlePiece className="w-24 h-24 top-1/2 right-1/3 -rotate-12 animate-float-medium" />
        <PuzzlePiece className="w-40 h-40 bottom-1/4 left-1/3 rotate-90 animate-float-fast" />
      </div>

      {/* Header */}
      <header className="relative bg-white/80 backdrop-blur-md shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-50">
                <Puzzle className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Welcome, {user?.displayName || user?.email}!
                </h1>
                <p className="text-gray-600">Ready for your next puzzle challenge?</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/leaderboard')}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 
                         text-white rounded-lg hover:shadow-lg transform transition-all duration-300 
                         hover:translate-y-[-2px]"
              >
                <Crown className="w-5 h-5" />
                <span>Leaderboard</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 
                         text-white rounded-lg hover:shadow-lg transform transition-all duration-300 
                         hover:translate-y-[-2px]"
              >
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Stats Section */}
        {StatsSection}

        {/* Start New Puzzle Section */}
        <section className="bg-white/80 backdrop-blur-md rounded-xl shadow-xl p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-blue-500" />
            Start New Puzzle
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <PuzzleOption
              icon={ImagePlus}
              title="Custom Photo Puzzle"
              description="Upload your own image"
              color="blue"
              onClick={() => handleStartPuzzle('custom')}
            />
            <PuzzleOption
              icon={Image}
              title="Cultural Themes"
              description="Explore pre-designed puzzles"
              color="green"
              onClick={() => handleStartPuzzle('cultural')}
            />
            <PuzzleOption
              icon={Users}
              title="Multiplayer"
              description="Solve with friends"
              color="purple"
              onClick={() => handleStartPuzzle('multiplayer')}
            />
          </div>
        </section>

        {/* Quick Access Section */}
        <section className="mt-8">
          <QuickAccess userId={user.uid} />
        </section>

        {/* Recent Puzzles Section */}
        <section className="bg-white/80 backdrop-blur-md rounded-xl shadow-xl p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Clock className="w-6 h-6 text-blue-500" />
            Recent Puzzles
          </h2>
          {recentPuzzles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recentPuzzles.map(puzzle => (
                <RecentPuzzleCard key={puzzle.id} puzzle={puzzle} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Puzzle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No puzzles completed yet. Start your journey!</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Home;