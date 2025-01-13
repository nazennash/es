import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

const Leaderboard = ({ puzzleId }) => {
  const [scores, setScores] = useState([]);

  useEffect(() => {
    const fetchScores = async () => {
      const db = getFirestore();
      const scoresRef = collection(db, 'puzzle_scores');
      const scoresQuery = query(
        scoresRef,
        where('puzzleId', '==', puzzleId),
        orderBy('completionTime'),
        limit(10)
      );
      
      const scoresSnap = await getDocs(scoresQuery);
      setScores(
        scoresSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      );
    };

    fetchScores();
  }, [puzzleId]);

  return (
    <div className="leaderboard p-4">
      <h3 className="text-xl font-bold mb-4">Top Times</h3>
      <div className="space-y-2">
        {scores.map((score, index) => (
          <div key={score.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
            <span className="font-medium">#{index + 1} {score.playerName}</span>
            <span>{Math.floor(score.completionTime / 60)}:{score.completionTime % 60}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Leaderboard;
// export { PuzzleViewer, MultiplayerManager, ProgressTracker, Dashboard, Leaderboard };