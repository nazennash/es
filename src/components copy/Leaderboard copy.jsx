import React, { useState, useEffect } from 'react';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  limit 
} from 'firebase/firestore';

const UserStats = ({ userId }) => {
  const [completedPuzzles, setCompletedPuzzles] = useState([]);
  const [currentPuzzles, setCurrentPuzzles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!userId) return;

      try {
        setLoading(true);
        setError(null);
        const db = getFirestore();

        // Fetch completed puzzles
        const completedRef = collection(db, 'puzzle_scores');
        const completedQuery = query(
          completedRef,
          where('userId', '==', userId),
          where('completed', '==', true),
          orderBy('completionTime', 'asc')
        );
        
        // Fetch current puzzles
        const currentRef = collection(db, 'user_puzzles');
        const currentQuery = query(
          currentRef,
          where('userId', '==', userId),
          orderBy('startedAt', 'desc')
        );

        // Execute queries
        const [completedSnap, currentSnap] = await Promise.all([
          getDocs(completedQuery),
          getDocs(currentQuery)
        ]);

        // Process completed puzzles and get global ranks
        const completedResults = await Promise.all(
          completedSnap.docs.map(async (doc) => {
            const data = doc.data();
            
            // Get global rank for this puzzle
            const rankQuery = query(
              completedRef,
              where('puzzleId', '==', data.puzzleId),
              where('completed', '==', true),
              orderBy('completionTime', 'asc')
            );
            const rankSnap = await getDocs(rankQuery);
            const globalRank = rankSnap.docs.findIndex(d => d.id === doc.id) + 1;

            return {
              id: doc.id,
              name: data.puzzleName,
              bestTime: data.completionTime,
              difficulty: data.difficulty,
              globalRank
            };
          })
        );

        // Process current puzzles
        const currentResults = currentSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.puzzleName,
            currentTime: data.currentTime || 0,
            difficulty: data.difficulty,
            startedAt: data.startedAt.toDate().toISOString()
          };
        });

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
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  };

  const getDifficultyStyle = (difficulty) => {
    switch(difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-red-100 text-red-800';
    }
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
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Difficulty</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Best Time</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Global Rank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {completedPuzzles.map((puzzle) => (
                  <tr key={puzzle.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{puzzle.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${getDifficultyStyle(puzzle.difficulty)}`}>
                        {puzzle.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatTime(puzzle.bestTime)}</td>
                    <td className="px-4 py-3">#{puzzle.globalRank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
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
                        {puzzle.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatTime(puzzle.currentTime)}</td>
                    <td className="px-4 py-3">
                      {new Date(puzzle.startedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserStats;