import { getFirestore, collection, addDoc, updateDoc, doc, increment, getDoc, setDoc } from 'firebase/firestore';
import { getDatabase, ref, get, update } from 'firebase/database';

export const handlePuzzleCompletion = async ({ 
  puzzleId, 
  userId, 
  playerName, 
  startTime, 
  difficulty,
  imageUrl,
  timer
}) => {
  const db = getFirestore();
  const rtdb = getDatabase();
  
  try {
    const completionTime = timer;
    const timestamp = new Date();

    // Add score to puzzle_scores collection with more detailed data
    const scoreData = {
      puzzleId,
      userId,
      playerName,
      completionTime,
      difficulty,
      timestamp,
      imageUrl,
      gameMode: puzzleId.startsWith('multiplayer_') ? 'multiplayer' : 'single',
      // Add rank calculation data
      timePerPiece: completionTime / (difficulty * difficulty),
      difficultyMultiplier: Math.pow(difficulty, 1.5)
    };
    console.log('Score Data:', scoreData);
    await addDoc(collection(db, 'puzzle_scores'), scoreData);

    // Add to completed_puzzles collection
    let puzzleData = {
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

    // Add additional metadata for better history tracking
    puzzleData = {
      ...puzzleData,
      mode: puzzleId.split('_')[0], // 'custom', 'cultural', or 'multiplayer'
      attemptCount: 1,
      dateCompleted: new Date(),
      category: puzzleId.startsWith('cultural_') ? 'cultural' : 'custom',
      savedThumbnail: imageUrl, // For quick access later
      hasBeenFavorited: false
    };

    // Create quick access entry
    await setDoc(doc(db, `user_puzzles/${userId}/saved/${puzzleId}`), {
      ...puzzleData,
      lastPlayed: new Date(),
      bestTime: completionTime,
      timesPlayed: increment(1)
    }, { merge: true });

    // Update user stats
    const userStatsRef = collection(db, 'user_stats');
    const userStatDoc = doc(userStatsRef, userId);
    const userStatSnap = await getDoc(userStatDoc);

    if (userStatSnap.exists()) {
      const currentStats = userStatSnap.data();
      const updates = {
        completed: increment(1),
        totalPlayTime: increment(completionTime),
        id: userId,
        lastPlayed: timestamp,
        // Track best scores per difficulty
        [`bestTimes.${difficulty}`]: !currentStats.bestTimes?.[difficulty] || 
          completionTime < currentStats.bestTimes[difficulty] 
            ? completionTime 
            : currentStats.bestTimes[difficulty]
      };

      // Update achievements
      if (completionTime < 120) { // 2 minutes
        updates['achievements.speed_demon'] = true;
      }
      if (difficulty >= 5) {
        updates['achievements.persistent'] = true;
      }

      await updateDoc(userStatDoc, updates);
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

    return { success: true, completionTime, score: scoreData };
  } catch (error) {
    console.error('Error handling puzzle completion:', error);
    throw new Error('Failed to record puzzle completion');
  }
};

export const isPuzzleComplete = (pieces) => {
  return pieces.every(piece => piece.isPlaced);
};