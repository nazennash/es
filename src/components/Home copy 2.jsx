import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

const Home = ({ user }) => {
  const navigate = useNavigate();
  const [recentPuzzles, setRecentPuzzles] = useState([]);
  const [userStats, setUserStats] = useState({
    completed: 0,
    bestTime: null,
    rank: null
  });
  
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const db = getFirestore();
        
        // Fetch recent puzzles
        const puzzlesRef = collection(db, 'user_stats');
        // const puzzlesQuery = query(
        //   puzzlesRef,
        //   where('userId', '==', user.uid),
        //   orderBy('completionTime', 'desc'),
        //   limit(3)
        // );
        const puzzleSnap = await getDocs(puzzlesRef);
        console.log('Puzzles:', puzzleSnap.docs.map(doc => doc.data()));
        setRecentPuzzles(puzzleSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })));
        
        // Fetch user stats
        const statsRef = collection(db, 'user_stats');
        const statsQuery = query(statsRef, where('userId', '==', user.uid));
        const statsSnap = await getDocs(statsQuery);
        if (!statsSnap.empty) {
          setUserStats(statsSnap.docs[0].data());
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };
    
    fetchUserData();
  }, [user.uid]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      localStorage.removeItem('authUser');
      navigate('/auth');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleStartPuzzle = (type) => {
    switch(type) {
      case 'custom':
        const newPuzzleId = `puzzle-${Date.now()}`;
        navigate(`/puzzle/${newPuzzleId}`, { replace: true });
        break;
      case 'cultural':
        navigate('/puzzle/cultural');
        break;
      case 'multiplayer':
        const sessionId = `session-${Date.now()}`;
        navigate(`/puzzle/multiplayer/${sessionId}`, { replace: true }, { state: { isHost: true, userId: user.uid } });
        // navigate('/puzzle/multiplayer/new', { 
          // state: { 
          //   isHost: true,
          //   userId: user.uid 
          // }
        // });
        break;
      default:
        break;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header Section */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome, {user?.displayName || user?.email}!
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Ready to solve some puzzles?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 transition duration-200"
              >
                Logout
              </button>
              <button
                onClick={() => navigate('/user-leaderboard')}
                className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition duration-200"
              >
                Leaderboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900">Puzzles Completed</h3>
            <p className="text-3xl font-bold text-blue-600">{userStats.completed}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900">Best Time</h3>
            <p className="text-3xl font-bold text-green-600">
              {userStats.bestTime ? `${Math.floor(userStats.bestTime / 60)}:${String(userStats.bestTime % 60).padStart(2, '0')}` : '--:--'}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900">Global Rank</h3>
            <p className="text-3xl font-bold text-purple-600">#{userStats.rank || '--'}</p>
          </div>
        </div>

        {/* Start New Puzzle Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Start New Puzzle</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => handleStartPuzzle('custom')}
                className="flex items-center justify-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition duration-200"
              >
                <div className="text-center">
                  <div className="text-blue-600 font-semibold">Custom Photo Puzzle</div>
                  <div className="text-sm text-gray-600">Upload your own image</div>
                </div>
              </button>
              <button
                onClick={() => handleStartPuzzle('cultural')}
                className="flex items-center justify-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition duration-200"
              >
                <div className="text-center">
                  <div className="text-green-600 font-semibold">Cultural Themes</div>
                  <div className="text-sm text-gray-600">Explore pre-designed puzzles</div>
                </div>
              </button>
              <button
                onClick={() => handleStartPuzzle('multiplayer')}
                className="flex items-center justify-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition duration-200"
              >
                <div className="text-center">
                  <div className="text-purple-600 font-semibold">Multiplayer</div>
                  <div className="text-sm text-gray-600">Solve with friends</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Recent Puzzles */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Puzzles</h2>
            {recentPuzzles.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {recentPuzzles.map(puzzle => (
                  <div key={puzzle.id} className="border rounded-lg p-4">
                    <img 
                      src={puzzle.thumbnail} 
                      alt={puzzle.name} 
                      className="w-full h-32 object-cover rounded mb-2"
                    />
                    <h3 className="font-semibold">{puzzle.name}</h3>
                    <p className="text-sm text-gray-600">
                      Completed in {Math.floor(puzzle.completionTime / 60)}:
                      {String(puzzle.completionTime % 60).padStart(2, '0')}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600">No puzzles completed yet. Start solving!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;