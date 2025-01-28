import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  doc,
  getDoc,
  limit
} from 'firebase/firestore';
import { getDatabase, ref, get } from 'firebase/database';
import { ChevronUp, ChevronDown, Filter, Search } from 'lucide-react';

const UserStats = ({ userId }) => {
  const [data, setData] = useState({
    completedPuzzles: [],
    currentPuzzles: [],
    loading: true,
    error: null
  });

  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [sortConfig, setSortConfig] = useState({ field: 'timestamp', direction: 'desc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  const fetchUserData = useCallback(async () => {
    if (!userId) return;

    try {
      setData(prev => ({ ...prev, loading: true, error: null }));

      const db = getFirestore();
      const rtdb = getDatabase();

      // Fetch data in parallel
      const [completedSnap, gamesSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'completed_puzzles'),
          where('userId', '==', userId),
          orderBy('timestamp', 'desc'),
          limit(10) // Limit to 10 most recent puzzles
        )),
        get(ref(rtdb, 'games'))
      ]);

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
        Object.entries(gamesSnap.val()).forEach(([key, game]) => {
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

      setData({
        completedPuzzles: completedResults,
        currentPuzzles: currentResults,
        loading: false,
        error: null
      });
    } catch (err) {
      console.error('Error fetching user data:', err);
      setData(prev => ({ ...prev, loading: false, error: 'Failed to load user statistics' }));
    }
  }, [userId]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const formatTime = useCallback((seconds) => {
    if (seconds == null) return '--:--';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  }, []);

  const getDifficultyStyle = useCallback((difficulty) => {
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
  }, []);

  const handleSort = useCallback((field) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const getSortedPuzzles = useCallback((puzzles) => {
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
  }, [sortConfig]);

  const getFilteredPuzzles = useCallback((puzzles) => {
    let filtered = puzzles;
    if (selectedDifficulty !== 'all') {
      filtered = filtered.filter(puzzle => String(puzzle.difficulty) === selectedDifficulty);
    }
    if (searchQuery) {
      filtered = filtered.filter(puzzle => puzzle.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return filtered;
  }, [selectedDifficulty, searchQuery]);

  const filteredCompletedPuzzles = useMemo(() => 
    getFilteredPuzzles(getSortedPuzzles(data.completedPuzzles)), 
    [data.completedPuzzles, getFilteredPuzzles, getSortedPuzzles]
  );

  if (data.loading) {
    return (
      <div className={`p-4 ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'}`}>
        <div>Loading...</div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className={`p-4 ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'}`}>
        <p className="text-red-500">{data.error}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 p-6 ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'}`}>
      {/* Dark Mode Toggle */}
      <button
        onClick={() => setDarkMode(prev => !prev)}
        className="fixed top-4 right-4 p-2 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
      >
        {darkMode ? '🌙' : '☀️'}
      </button>

      {/* Filter Controls */}
      <div className={`rounded-lg shadow p-4 flex items-center gap-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <span className="font-medium">Filter:</span>
        </div>
        <select
          className={`border rounded-md px-3 py-1.5 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white'}`}
          value={selectedDifficulty}
          onChange={(e) => setSelectedDifficulty(e.target.value)}
        >
          <option value="all">All Difficulties</option>
          <option value="3">3x3</option>
          <option value="4">4x4</option>
          <option value="5">5x5</option>
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <Search className="w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search puzzles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`border rounded-md px-3 py-1.5 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white'}`}
          />
        </div>
      </div>

      {/* Completed Puzzles Section */}
      <div className={`rounded-lg shadow ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Completed Puzzles</h2>
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
                    Time <ChevronUp className="inline w-4 h-4" />
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer"
                    onClick={() => handleSort('timestamp')}
                  >
                    Completed <ChevronDown className="inline w-4 h-4" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCompletedPuzzles.map((puzzle) => (
                  <tr key={puzzle.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <img 
                        src={puzzle.thumbnail} 
                        alt={puzzle.name}
                        className="w-12 h-12 rounded object-cover"
                        loading="lazy"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">{puzzle.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${getDifficultyStyle(puzzle.difficulty)}`}>
                        {puzzle.difficulty}x{puzzle.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {puzzle.bestTime ? formatTime(puzzle.bestTime) : '--:--'}
                    </td>
                    <td className="px-4 py-3">
                      {new Date(puzzle.timestamp).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {data.completedPuzzles.length === 0 && (
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

      {/* Current Puzzles Section */}
      <div className={`rounded-lg shadow ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Current Puzzles</h2>
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
                {data.currentPuzzles.map((puzzle) => (
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
                {data.currentPuzzles.length === 0 && (
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