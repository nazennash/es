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

const Leaderboard = ({ puzzleId }) => {
  const [scores, setScores] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchScores = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const db = getFirestore();
        const scoresRef = collection(db, 'puzzle_scores');
        const scoresQuery = query(
          scoresRef,
          where('puzzleId', '==', puzzleId),
          orderBy('completionTime'),
          limit(10)
        );
        
        const scoresSnap = await getDocs(scoresQuery);
        const formattedScores = scoresSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setScores(formattedScores);
      } catch (err) {
        console.error('Error fetching scores:', err);
        setError('Failed to load leaderboard scores');
      } finally {
        setLoading(false);
      }
    };

    if (puzzleId) {
      fetchScores();
    }
  }, [puzzleId]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  };

  if (loading) {
    return (
      <div className="leaderboard p-4">
        <h3 className="text-xl font-bold mb-4">Top Times</h3>
        <div className="text-gray-500">Loading scores...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="leaderboard p-4">
        <h3 className="text-xl font-bold mb-4">Top Times</h3>
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="leaderboard p-4">
        <h3 className="text-xl font-bold mb-4">Top Times</h3>
        <div className="text-gray-500">No scores yet for this puzzle!</div>
      </div>
    );
  }

  return (
    <div className="leaderboard p-4">
      <h3 className="text-xl font-bold mb-4">Top Times</h3>
      <div className="space-y-2">
        {scores.map((score, index) => (
          <div 
            key={score.id} 
            className="flex justify-between items-center p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
          >
            <span className="font-medium">
              #{index + 1} {score.playerName || 'Anonymous'}
            </span>
            <span>{formatTime(score.completionTime)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Leaderboard;