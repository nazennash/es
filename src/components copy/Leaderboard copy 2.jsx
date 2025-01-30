import React, { useState, useEffect } from 'react';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  doc,
  getDoc
} from 'firebase/firestore';
import { getDatabase, ref, get } from 'firebase/database';
import { ChevronUp, ChevronDown, Filter } from 'lucide-react';

const UserStats = ({ userId }) => {
  const [completedPuzzles, setCompletedPuzzles] = useState([]);
  const [currentPuzzles, setCurrentPuzzles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [sortConfig, setSortConfig] = useState({ field: 'timestamp', direction: 'desc' });
  const [summaryStats, setSummaryStats] = useState({
    totalCompleted: 0,
    bestTime: null,
    averageTime: null,
    completionRate: null,
    difficultyBreakdown: {},
  });

  useEffect(() => {
    const fetchUserData = async () => {
      if (!userId) return;

      try {
        setLoading(true);
        setError(null);
        const db = getFirestore();
        const rtdb = getDatabase();

        // Fetch user stats
        const userStatsRef = doc(collection(db, 'user_stats'), userId);
        const userStatsSnap = await getDoc(userStatsRef);
        
        // Fetch completed puzzles
        const completedRef = collection(db, 'completed_puzzles');
        const completedQuery = query(
          completedRef,
          where('userId', '==', userId),
          orderBy('timestamp', 'desc')
        );

        // Fetch current games from realtime database
        const gamesRef = ref(rtdb, 'games');
        const gamesSnap = await get(gamesRef);
        
        const completedSnap = await getDocs(completedQuery);

        // Process completed puzzles
        const completedResults = completedSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || `${data.difficulty}x${data.difficulty} Puzzle`,
            bestTime: data.completionTime,
            difficulty: data.difficulty,
            thumbnail: data.thumbnail || `/api/placeholder/100/100`,
            timestamp: data.timestamp?.toDate()?.toISOString()
          };
        });

        // Process current games
        const currentResults = [];
        if (gamesSnap.exists()) {
          const games = gamesSnap.val();
          Object.entries(games).forEach(([key, game]) => {
            if (game.userId === userId && !game.isCompleted) {
              currentResults.push({
                id: key,
                name: `${game.difficulty}x${game.difficulty} Puzzle`,
                currentTime: game.currentTime || 0,
                difficulty: game.difficulty,
                thumbnail: game.thumbnail || `/api/placeholder/100/100`,
                startedAt: new Date(game.startTime).toISOString()
              });
            }
          });
        }

        // Calculate additional statistics
        const difficultyBreakdown = completedResults.reduce((acc, puzzle) => {
          acc[puzzle.difficulty] = (acc[puzzle.difficulty] || 0) + 1;
          return acc;
        }, {});

        const totalTime = completedResults.reduce((sum, puzzle) => sum + puzzle.bestTime, 0);
        const averageTime = completedResults.length ? Math.round(totalTime / completedResults.length) : null;

        const completionRate = currentResults.length + completedResults.length > 0
          ? (completedResults.length / (currentResults.length + completedResults.length) * 100).toFixed(1)
          : 0;

        // Set summary stats
        if (userStatsSnap.exists()) {
          const statsData = userStatsSnap.data();
          setSummaryStats({
            totalCompleted: statsData.completed || 0,
            bestTime: statsData.bestTime,
            averageTime,
            completionRate,
            difficultyBreakdown,
          });
        }

        setCompletedPuzzles(completedResults);
        setCurrentPuzzles(currentResults);
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError('Failed to load user statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId]);

  const formatTime = (seconds) => {
    if (seconds == null) return '--:--';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  };

  const getDifficultyStyle = (difficulty) => {
    const diffLevel = String(difficulty).toLowerCase();
    switch(true) {
      case diffLevel === '3':
        return 'bg-green-100 text-green-800';
      case diffLevel === '4':
        return 'bg-yellow-100 text-yellow-800';
      case diffLevel === '5':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleSort = (field) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortedPuzzles = (puzzles) => {
    if (!sortConfig.field) return puzzles;

    return [...puzzles].sort((a, b) => {
      if (sortConfig.field === 'timestamp' || sortConfig.field === 'startedAt') {
        const dateA = new Date(a[sortConfig.field]);
        const dateB = new Date(b[sortConfig.field]);
        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
      }
      if (sortConfig.field === 'bestTime' || sortConfig.field === 'currentTime') {
        return sortConfig.direction === 'asc' 
          ? (a[sortConfig.field] || 0) - (b[sortConfig.field] || 0)
          : (b[sortConfig.field] || 0) - (a[sortConfig.field] || 0);
      }
      return 0;
    });
  };

  const getFilteredPuzzles = (puzzles) => {
    if (selectedDifficulty === 'all') return puzzles;
    return puzzles.filter(puzzle => String(puzzle.difficulty) === selectedDifficulty);
  };

  const SortIcon = ({ field }) => {
    if (sortConfig.field !== field) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp className="inline w-4 h-4" /> : <ChevronDown className="inline w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-gray-500">Loading user statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Total Completed</h3>
          <p className="text-3xl font-bold text-blue-600">{summaryStats.totalCompleted}</p>
          <p className="text-sm text-gray-500 mt-1">puzzles completed</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Best Time</h3>
            <p className="text-3xl font-bold text-blue-600">
            {summaryStats.bestTime ? `${Math.floor(summaryStats.bestTime / 60)}:${String(Math.floor(summaryStats.bestTime % 60)).padStart(2, '0')}.${String(summaryStats.bestTime.toFixed(3).split('.')[1]).padEnd(3, '0').slice(0, 2)}` : '--:--'}
          </p>
          <p className="text-sm text-gray-500 mt-1">best completion time</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Average Time</h3>
          <p className="text-3xl font-bold text-blue-600">{formatTime(summaryStats.averageTime)}</p>
          <p className="text-sm text-gray-500 mt-1">per puzzle</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Completion Rate</h3>
          <p className="text-3xl font-bold text-blue-600">{summaryStats.completionRate}%</p>
          <p className="text-sm text-gray-500 mt-1">puzzles finished</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Difficulty Split</h3>
          <div className="space-y-2">
            {Object.entries(summaryStats.difficultyBreakdown).map(([diff, count]) => (
              <div key={diff} className="flex justify-between items-center">
                <span className={`px-2 py-1 rounded-full text-xs ${getDifficultyStyle(diff)}`}>
                  {diff}x{diff}
                </span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <span className="font-medium">Filter:</span>
        </div>
        <select
          className="border rounded-md px-3 py-1.5"
          value={selectedDifficulty}
          onChange={(e) => setSelectedDifficulty(e.target.value)}
        >
          <option value="all">All Difficulties</option>
          <option value="3">3x3</option>
          <option value="4">4x4</option>
          <option value="5">5x5</option>
        </select>
      </div>

      {/* Completed Puzzles Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Completed Puzzles</h2>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Preview</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Puzzle</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Difficulty</th>
                  <th 
                    className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer"
                    onClick={() => handleSort('bestTime')}
                  >
                    Time <SortIcon field="bestTime" />
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer"
                    onClick={() => handleSort('timestamp')}
                  >
                    Completed <SortIcon field="timestamp" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {getFilteredPuzzles(getSortedPuzzles(completedPuzzles)).map((puzzle) => (
                  <tr key={puzzle.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <img 
                        src={puzzle.thumbnail} 
                        alt={puzzle.name}
                        className="w-12 h-12 rounded object-cover"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">{puzzle.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${getDifficultyStyle(puzzle.difficulty)}`}>
                        {puzzle.difficulty}x{puzzle.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {puzzle.bestTime ? `${Math.floor(puzzle.bestTime / 60)}:${String(Math.floor(puzzle.bestTime % 60)).padStart(2, '0')}.${String(puzzle.bestTime.toFixed(3).split('.')[1]).padEnd(3, '0').slice(0, 2)}` : '--:--'}
                    </td>
                    <td className="px-4 py-3">
                      {new Date(puzzle.timestamp).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {completedPuzzles.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-4 py-3 text-center text-gray-500">
                      No completed puzzles yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      
      {/* Current Puzzles Section
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Current Puzzles</h2>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Preview</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Puzzle</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Difficulty</th>
                  <th 
                    className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer"
                    onClick={() => handleSort('currentTime')}
                  >
                    Current Time <SortIcon field="currentTime" />
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer"
                    onClick={() => handleSort('  */}

      {/* Current Puzzles Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Current Puzzles</h2>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Puzzle</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Difficulty</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Current Time</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {currentPuzzles.map((puzzle) => (
                  <tr key={puzzle.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{puzzle.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${getDifficultyStyle(puzzle.difficulty)}`}>
                        {puzzle.difficulty}x{puzzle.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatTime(puzzle.currentTime)}</td>
                    <td className="px-4 py-3">
                      {new Date(puzzle.startedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {currentPuzzles.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-4 py-3 text-center text-gray-500">
                      No puzzles in progress
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserStats;