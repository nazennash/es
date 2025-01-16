import { getFirestore, collection, addDoc, updateDoc, doc, increment, getDoc, setDoc } from 'firebase/firestore';
import { getDatabase, ref, get, update } from 'firebase/database';

export const handlePuzzleCompletion = async ({ 
  puzzleId, 
  userId, 
  playerName, 
  startTime, 
  difficulty,
  imageUrl,
  timer // Include timer in the parameters
}) => {
  const db = getFirestore();
  const rtdb = getDatabase();
  
  try {
    // Calculate completion time
    const completionTime = timer;
    
    // Add score to puzzle_scores collection
    const scoreData = {
      puzzleId,
      userId,
      playerName,
      completionTime,
      difficulty,
      timestamp: new Date(),
      imageUrl
    };
    
    console.log('Score Data:', scoreData);
    await addDoc(collection(db, 'puzzle_scores'), scoreData);
    
    // Add to completed_puzzles collection
    const puzzleData = {
      puzzleId,
      userId,
      completionTime,
      difficulty,
      timestamp: new Date(),
      thumbnail: imageUrl,
      name: `${difficulty}x${difficulty} Puzzle`
    };
    
    console.log('Puzzle Data:', puzzleData);
    await addDoc(collection(db, 'completed_puzzles'), puzzleData);
    
    // Update user stats
    const userStatsRef = collection(db, 'user_stats');
    const userStatDoc = doc(userStatsRef, userId);
    const userStatSnap = await getDoc(userStatDoc);

    if (userStatSnap.exists()) {
      console.log('User Stats Update:', { completed: increment(1), bestTime: completionTime });
      await updateDoc(userStatDoc, {
        completed: increment(1),
        bestTime: completionTime,
        id: userId
      });
    } else {
      console.log('User stats document does not exist for user:', userId);
      console.log('Creating new user stats document');
      await setDoc(userStatDoc, {
        completed: 1,
        bestTime: completionTime,
        id: userId
      });
    }
    
    // Update realtime game state
    const gameRef = ref(rtdb, `games/${puzzleId}`);
    const gameSnap = await get(gameRef);
    const gameData = gameSnap.val();
    
    if (gameData) {
      const updates = {
        [`games/${puzzleId}/isCompleted`]: true,
        [`games/${puzzleId}/completionTime`]: completionTime,
        [`games/${puzzleId}/completedBy`]: userId
      };
      
      console.log('Realtime Database Updates:', updates);
      await update(ref(rtdb), updates);
    }
    
    return { success: true, completionTime };
  } catch (error) {
    console.error('Error handling puzzle completion:', error);
    throw new Error('Failed to record puzzle completion');
  }
};

export const isPuzzleComplete = (pieces) => {
  return pieces.every(piece => piece.isPlaced);
};