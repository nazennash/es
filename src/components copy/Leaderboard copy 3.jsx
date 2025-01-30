// import React, { useState, useEffect, useMemo, useCallback } from 'react';
// import { 
//   getFirestore, 
//   collection, 
//   query, 
//   where, 
//   orderBy, 
//   getDocs,
//   doc,
//   getDoc
// } from 'firebase/firestore';
// import { getDatabase, ref, get } from 'firebase/database';
// import { ChevronUp, ChevronDown, Filter, Search, Info } from 'lucide-react';

// const UserStats = ({ userId }) => {
//   const [completedPuzzles, setCompletedPuzzles] = useState([]);
//   const [currentPuzzles, setCurrentPuzzles] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const [selectedDifficulty, setSelectedDifficulty] = useState('all');
//   const [sortConfig, setSortConfig] = useState({ field: 'timestamp', direction: 'desc' });
//   const [searchQuery, setSearchQuery] = useState('');
//   const [darkMode, setDarkMode] = useState(false);

//   const fetchUserData = useCallback(async () => {
//     if (!userId) return;

//     try {
//       setLoading(true);
//       setError(null);
//       const db = getFirestore();
//       const rtdb = getDatabase();

//       // Fetch user stats
//       const userStatsRef = doc(collection(db, 'user_stats'), userId);
//       const userStatsSnap = await getDoc(userStatsRef);
      
//       // Fetch completed puzzles
//       const completedRef = collection(db, 'completed_puzzles');
//       const completedQuery = query(
//         completedRef,
//         where('userId', '==', userId),
//         orderBy('timestamp', 'desc')
//       );

//       // Fetch current games from realtime database
//       const gamesRef = ref(rtdb, 'games');
//       const gamesSnap = await get(gamesRef);
      
//       const completedSnap = await getDocs(completedQuery);

//       // Process completed puzzles
//       const completedResults = completedSnap.docs.map(doc => {
//         const data = doc.data();
//         return {
//           id: doc.id,
//           name: data.name || `${data.difficulty}x${data.difficulty} Puzzle`,
//           bestTime: data.completionTime,
//           difficulty: data.difficulty,
//           thumbnail: data.thumbnail || `/api/placeholder/100/100`,
//           timestamp: data.timestamp?.toDate()?.toISOString()
//         };
//       });

//       // Process current games
//       const currentResults = [];
//       if (gamesSnap.exists()) {
//         const games = gamesSnap.val();
//         Object.entries(games).forEach(([key, game]) => {
//           if (game.userId === userId && !game.isCompleted) {
//             currentResults.push({
//               id: key,
//               name: `${game.difficulty}x${game.difficulty} Puzzle`,
//               currentTime: game.currentTime || 0,
//               difficulty: game.difficulty,
//               thumbnail: game.thumbnail || `/api/placeholder/100/100`,
//               startedAt: new Date(game.startTime).toISOString()
//             });
//           }
//         });
//       }

//       setCompletedPuzzles(completedResults);
//       setCurrentPuzzles(currentResults);
//     } catch (err) {
//       console.error('Error fetching user data:', err);
//       setError('Failed to load user statistics');
//     } finally {
//       setLoading(false);
//     }
//   }, [userId]);

//   useEffect(() => {
//     fetchUserData();
//   }, [fetchUserData]);

//   const formatTime = useCallback((seconds) => {
//     if (seconds == null) return '--:--';
//     const minutes = Math.floor(seconds / 60);
//     const remainingSeconds = String(seconds % 60).padStart(2, '0');
//     return `${minutes}:${remainingSeconds}`;
//   }, []);

//   const getDifficultyStyle = useCallback((difficulty) => {
//     const diffLevel = String(difficulty).toLowerCase();
//     switch(true) {
//       case diffLevel === '3':
//         return 'bg-green-100 text-green-800';
//       case diffLevel === '4':
//         return 'bg-yellow-100 text-yellow-800';
//       case diffLevel === '5':
//         return 'bg-red-100 text-red-800';
//       default:
//         return 'bg-gray-100 text-gray-800';
//     }
//   }, []);

//   const handleSort = useCallback((field) => {
//     setSortConfig(prev => ({
//       field,
//       direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
//     }));
//   }, []);

//   const getSortedPuzzles = useCallback((puzzles) => {
//     if (!sortConfig.field) return puzzles;

//     return [...puzzles].sort((a, b) => {
//       if (sortConfig.field === 'timestamp' || sortConfig.field === 'startedAt') {
//         const dateA = new Date(a[sortConfig.field]);
//         const dateB = new Date(b[sortConfig.field]);
//         return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
//       }
//       if (sortConfig.field === 'bestTime' || sortConfig.field === 'currentTime') {
//         return sortConfig.direction === 'asc' 
//           ? (a[sortConfig.field] || 0) - (b[sortConfig.field] || 0)
//           : (b[sortConfig.field] || 0) - (a[sortConfig.field] || 0);
//       }
//       return 0;
//     });
//   }, [sortConfig]);

//   const getFilteredPuzzles = useCallback((puzzles) => {
//     let filtered = puzzles;
//     if (selectedDifficulty !== 'all') {
//       filtered = filtered.filter(puzzle => String(puzzle.difficulty) === selectedDifficulty);
//     }
//     if (searchQuery) {
//       filtered = filtered.filter(puzzle => puzzle.name.toLowerCase().includes(searchQuery.toLowerCase()));
//     }
//     return filtered;
//   }, [selectedDifficulty, searchQuery]);

//   const SortIcon = useCallback(({ field }) => {
//     if (sortConfig.field !== field) return null;
//     return sortConfig.direction === 'asc' ? <ChevronUp className="inline w-4 h-4" /> : <ChevronDown className="inline w-4 h-4" />;
//   }, [sortConfig]);

//   const toggleDarkMode = useCallback(() => {
//     setDarkMode(prev => !prev);
//   }, []);

//   const filteredCompletedPuzzles = useMemo(() => getFilteredPuzzles(getSortedPuzzles(completedPuzzles)), [completedPuzzles, getFilteredPuzzles, getSortedPuzzles]);

//   if (loading) {
//     return (
//       <div className={`p-4 ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'}`}>
//         <div>Loading...</div>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div className={`p-4 ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'}`}>
//         <p className="text-red-500">{error}</p>
//       </div>
//     );
//   }

//   return (
//     <div className={`space-y-6 p-6 ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'}`}>
//       {/* Dark Mode Toggle */}
//       <button
//         onClick={toggleDarkMode}
//         className="fixed top-4 right-4 p-2 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
//       >
//         {darkMode ? '🌙' : '☀️'}
//       </button>

//       {/* Summary Statistics */}
//       <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
//         {/* Total Completed */}
//         <div className={`rounded-lg shadow p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
//           <h3 className="text-lg font-semibold mb-4">Total Completed</h3>
//           <p className="text-3xl font-bold text-blue-600">123</p>
//           <p className="text-sm text-gray-500 mt-1">puzzles completed</p>
//         </div>
//         {/* Best Time */}
//         <div className={`rounded-lg shadow p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
//           <h3 className="text-lg font-semibold mb-4">Best Time</h3>
//           <p className="text-3xl font-bold text-blue-600">01:23</p>
//           <p className="text-sm text-gray-500 mt-1">best completion time</p>
//         </div>
//         {/* Average Time */}
//         <div className={`rounded-lg shadow p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
//           <h3 className="text-lg font-semibold mb-4">Average Time</h3>
//           <p className="text-3xl font-bold text-blue-600">02:34</p>
//           <p className="text-sm text-gray-500 mt-1">per puzzle</p>
//         </div>
//         {/* Completion Rate */}
//         <div className={`rounded-lg shadow p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
//           <h3 className="text-lg font-semibold mb-4">Completion Rate</h3>
//           <p className="text-3xl font-bold text-blue-600">75%</p>
//           <p className="text-sm text-gray-500 mt-1">puzzles finished</p>
//         </div>
//         {/* Difficulty Split */}
//         <div className={`rounded-lg shadow p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
//           <h3 className="text-lg font-semibold mb-4">Difficulty Split</h3>
//           <div className="space-y-2">
//             <div className="flex justify-between items-center">
//               <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">3x3</span>
//               <span className="font-medium">50</span>
//             </div>
//             <div className="flex justify-between items-center">
//               <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">4x4</span>
//               <span className="font-medium">30</span>
//             </div>
//             <div className="flex justify-between items-center">
//               <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">5x5</span>
//               <span className="font-medium">20</span>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Filter Controls */}
//       <div className={`rounded-lg shadow p-4 flex items-center gap-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
//         <div className="flex items-center gap-2">
//           <Filter className="w-5 h-5 text-gray-500" />
//           <span className="font-medium">Filter:</span>
//         </div>
//         <select
//           className={`border rounded-md px-3 py-1.5 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white'}`}
//           value={selectedDifficulty}
//           onChange={(e) => setSelectedDifficulty(e.target.value)}
//         >
//           <option value="all">All Difficulties</option>
//           <option value="3">3x3</option>
//           <option value="4">4x4</option>
//           <option value="5">5x5</option>
//         </select>
//         <div className="flex items-center gap-2 ml-auto">
//           <Search className="w-5 h-5 text-gray-500" />
//           <input
//             type="text"
//             placeholder="Search puzzles..."
//             value={searchQuery}
//             onChange={(e) => setSearchQuery(e.target.value)}
//             className={`border rounded-md px-3 py-1.5 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white'}`}
//           />
//         </div>
//       </div>

//       {/* Completed Puzzles Section */}
//       <div className={`rounded-lg shadow ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
//         <div className="px-6 py-4 border-b border-gray-200">
//           <h2 className="text-xl font-semibold">Completed Puzzles</h2>
//         </div>
//         <div className="p-6">
//           <div className="overflow-x-auto">
//             <table className="w-full text-sm">
//               <thead className="bg-gray-50">
//                 <tr>
//                   <th className="px-4 py-3 text-left font-medium text-gray-600">Preview</th>
//                   <th className="px-4 py-3 text-left font-medium text-gray-600">Puzzle</th>
//                   <th className="px-4 py-3 text-left font-medium text-gray-600">Difficulty</th>
//                   <th 
//                     className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer"
//                     onClick={() => handleSort('bestTime')}
//                   >
//                     Time <SortIcon field="bestTime" />
//                   </th>
//                   <th 
//                     className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer"
//                     onClick={() => handleSort('timestamp')}
//                   >
//                     Completed <SortIcon field="timestamp" />
//                   </th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-gray-200">
//                 {filteredCompletedPuzzles.map((puzzle) => (
//                   <tr key={puzzle.id} className="hover:bg-gray-50">
//                     <td className="px-4 py-3">
//                       <img 
//                         src={puzzle.thumbnail} 
//                         alt={puzzle.name}
//                         className="w-12 h-12 rounded object-cover"
//                       />
//                     </td>
//                     <td className="px-4 py-3 font-medium">{puzzle.name}</td>
//                     <td className="px-4 py-3">
//                       <span className={`px-2 py-1 rounded-full text-xs ${getDifficultyStyle(puzzle.difficulty)}`}>
//                         {puzzle.difficulty}x{puzzle.difficulty}
//                       </span>
//                     </td>
//                     <td className="px-4 py-3">
//                       {puzzle.bestTime ? `${Math.floor(puzzle.bestTime / 60)}:${String(Math.floor(puzzle.bestTime % 60)).padStart(2, '0')}.${String(puzzle.bestTime.toFixed(3).split('.')[1]).padEnd(3, '0').slice(0, 2)}` : '--:--'}
//                     </td>
//                     <td className="px-4 py-3">
//                       {new Date(puzzle.timestamp).toLocaleDateString()}
//                     </td>
//                   </tr>
//                 ))}
//                 {completedPuzzles.length === 0 && (
//                   <tr>
//                     <td colSpan="5" className="px-4 py-3 text-center text-gray-500">
//                       No completed puzzles yet
//                     </td>
//                   </tr>
//                 )}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       </div>

//       {/* Current Puzzles Section */}
//       <div className={`rounded-lg shadow ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
//         <div className="px-6 py-4 border-b border-gray-200">
//           <h2 className="text-xl font-semibold">Current Puzzles</h2>
//         </div>
//         <div className="p-6">
//           <div className="overflow-x-auto">
//             <table className="w-full text-sm">
//               <thead className="bg-gray-50">
//                 <tr>
//                   <th className="px-4 py-3 text-left font-medium text-gray-600">Puzzle</th>
//                   <th className="px-4 py-3 text-left font-medium text-gray-600">Difficulty</th>
//                   <th className="px-4 py-3 text-left font-medium text-gray-600">Current Time</th>
//                   <th className="px-4 py-3 text-left font-medium text-gray-600">Started</th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-gray-200">
//                 {currentPuzzles.map((puzzle) => (
//                   <tr key={puzzle.id} className="hover:bg-gray-50">
//                     <td className="px-4 py-3 font-medium">{puzzle.name}</td>
//                     <td className="px-4 py-3">
//                       <span className={`px-2 py-1 rounded-full text-xs ${getDifficultyStyle(puzzle.difficulty)}`}>
//                         {puzzle.difficulty}x{puzzle.difficulty}
//                       </span>
//                     </td>
//                     <td className="px-4 py-3">{formatTime(puzzle.currentTime)}</td>
//                     <td className="px-4 py-3">
//                       {new Date(puzzle.startedAt).toLocaleDateString()}
//                     </td>
//                   </tr>
//                 ))}
//                 {currentPuzzles.length === 0 && (
//                   <tr>
//                     <td colSpan="4" className="px-4 py-3 text-center text-gray-500">
//                       No puzzles in progress
//                     </td>
//                   </tr>
//                 )}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default UserStats;

import React from 'react'

const Leaderboard = () => {
  return (
    <div>Leaderboard</div>
  )
}

export default Leaderboard