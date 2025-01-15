import React, { useState, useEffect } from 'react';
import { 
  getFirestore, 
  collection, 
  query, 
  where,
  orderBy, 
  limit, 
  getDocs
} from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const Leaderboard = ({ puzzleId }) => {
  const [scores, setScores] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [difficulty, setDifficulty] = useState(3);

  useEffect(() => {
    const fetchScores = async () => {
      if (!puzzleId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const db = getFirestore();
        const scoresRef = collection(db, 'puzzle_scores');
        
        // Build query conditions
        const queryConditions = [
          where('puzzleId', '==', puzzleId),
          where('difficulty', '==', difficulty),
          orderBy('completionTime', 'asc'),
          limit(10)
        ];
        
        const scoresQuery = query(scoresRef, ...queryConditions);
        const snapshot = await getDocs(scoresQuery);
        
        if (snapshot.empty) {
          setScores([]);
          return;
        }

        const formattedScores = snapshot.docs.map(doc => ({
          id: doc.id,
          playerName: doc.data().playerName || 'Anonymous',
          completionTime: doc.data().completionTime || 0,
          timestamp: doc.data().timestamp?.toDate() || new Date(),
          difficulty: doc.data().difficulty
        }));

        setScores(formattedScores);
      } catch (err) {
        console.error('Error fetching leaderboard:', err);
        setError('Failed to load leaderboard scores. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchScores();
  }, [puzzleId, difficulty]);

  const formatTime = (seconds) => {
    if (typeof seconds !== 'number' || seconds < 0) return '--:--';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  };

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Top Times</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            <div className="animate-pulse">Loading scores...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Top Times</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <label htmlFor="difficulty" className="font-medium">
              Puzzle Size:
            </label>
            <select 
              id="difficulty" 
              value={difficulty} 
              onChange={(e) => setDifficulty(Number(e.target.value))}
              className="p-2 border rounded focus:ring-2 focus:ring-blue-500"
            >
              {[2, 3, 4, 5, 6, 7, 8].map(size => (
                <option key={size} value={size}>
                  {size}x{size}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <div className="text-red-500 p-4 rounded bg-red-50">
              {error}
              <button 
                onClick={() => window.location.reload()}
                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 w-full"
              >
                Retry
              </button>
            </div>
          ) : scores.length === 0 ? (
            <div className="text-gray-500 text-center p-4">
              No scores yet for {difficulty}x{difficulty} puzzle
            </div>
          ) : (
            <div className="space-y-2">
              {scores.map((score, index) => (
                <div 
                  key={score.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-gray-500 font-medium">#{index + 1}</span>
                    <span className="font-medium">{score.playerName}</span>
                  </div>
                  <span className="font-mono">{formatTime(score.completionTime)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default Leaderboard;