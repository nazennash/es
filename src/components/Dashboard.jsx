// src/components/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

const Dashboard = ({ userId }) => {
  const [completedPuzzles, setCompletedPuzzles] = useState([]);
  const [savedPuzzles, setSavedPuzzles] = useState([]);

  useEffect(() => {
    const fetchPuzzles = async () => {
      const db = getFirestore();
      
      // Fetch completed puzzles
      const completedRef = collection(db, 'completed_puzzles');
      const completedQuery = query(completedRef, where('userId', '==', userId));
      const completedSnap = await getDocs(completedQuery);
      
      setCompletedPuzzles(
        completedSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      );
      
      // Fetch saved puzzles
      const savedRef = collection(db, 'saved_puzzles');
      const savedQuery = query(savedRef, where('userId', '==', userId));
      const savedSnap = await getDocs(savedQuery);
      
      setSavedPuzzles(
        savedSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      );
    };

    fetchPuzzles();
  }, [userId]);

  return (
    <div className="dashboard-container p-6">
      <h2 className="text-2xl font-bold mb-4">Your Puzzles</h2>
      
      <div className="completed-puzzles mb-6">
        <h3 className="text-xl font-semibold mb-2">Completed Puzzles</h3>
        <div className="grid grid-cols-3 gap-4">
          {completedPuzzles.map(puzzle => (
            <div key={puzzle.id} className="puzzle-card p-4 border rounded">
              <img src={puzzle.thumbnail} alt={puzzle.name} className="w-full h-32 object-cover mb-2" />
              <p className="font-medium">{puzzle.name}</p>
              <p className="text-sm text-gray-600">Completed in: {puzzle.completionTime}</p>
            </div>
          ))}
        </div>
      </div>
      
      <div className="saved-puzzles">
        <h3 className="text-xl font-semibold mb-2">Saved Puzzles</h3>
        <div className="grid grid-cols-3 gap-4">
          {savedPuzzles.map(puzzle => (
            <div key={puzzle.id} className="puzzle-card p-4 border rounded">
              <img src={puzzle.thumbnail} alt={puzzle.name} className="w-full h-32 object-cover mb-2" />
              <p className="font-medium">{puzzle.name}</p>
              <p className="text-sm text-gray-600">Progress: {puzzle.progress}%</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;