<<<<<<< HEAD
import { useState, useEffect } from 'react';
import { database, ref, set, onValue, update, remove, onDisconnect, auth } from '../firebase';
import { handlePuzzleCompletion } from '../components/PuzzleCompletionHandler';

export const useMultiplayerGame = (gameId) => {
  const [players, setPlayers] = useState({});
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!gameId || !currentUser) return;

    const gameRef = ref(database, `games/${gameId}`);
    const playerRef = ref(database, `games/${gameId}/players/${currentUser.uid}`);
    
    // Setup player presence
    const setupPresence = () => {
      const playerData = {
        id: currentUser.uid,
        name: currentUser.displayName || 'Anonymous',
        lastActive: Date.now(),
        connected: true
      };

      // Update player data
      update(playerRef, playerData);

      // Remove player data on disconnect
      onDisconnect(playerRef).remove();

      // Set up periodic presence updates
      const presenceInterval = setInterval(() => {
        update(playerRef, {
          lastActive: Date.now()
        });
      }, 5000);

      return () => clearInterval(presenceInterval);
    };

    // Listen for game state changes
    const gameStateUnsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setError('Game not found');
        return;
      }
      setGameState(data);
      setPlayers(data.players || {});
    }, (error) => {
      setError(error.message);
    });

    // Setup presence
    const cleanupPresence = setupPresence();

    // Cleanup function
    return () => {
      gameStateUnsubscribe();
      cleanupPresence();
      remove(playerRef);
    };
  }, [gameId, currentUser]);

  const updatePiecePosition = async (pieceId, position) => {
    if (!gameId || !currentUser) return;
    
    try {
      await update(ref(database, `games/${gameId}/puzzle/pieces/${pieceId}`), {
        position: position.toArray(),
        lastMoved: {
          by: currentUser.uid,
          at: Date.now()
        }
      });
    } catch (error) {
      setError(error.message);
    }
  };

  const updateGameState = async (newState) => {
    if (!gameId || !currentUser) return;
    
=======
// hooks/useMultiplayerGame.js
import { useState, useEffect, useCallback } from 'react';
import { database, ref, onValue, update, set, remove, onDisconnect } from '../firebase';
import toast from 'react-hot-toast';

export const useMultiplayerGame = (gameId, isHost = false) => {
  const [players, setPlayers] = useState({});
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timer, setTimer] = useState(0);
  const [progress, setProgress] = useState(0);
  const [difficulty, setDifficulty] = useState('easy'); // Add difficulty state

  // Get user data from localStorage
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData?.uid;

  // Initialize game listeners
  useEffect(() => {
    if (!gameId || !userId) return;

    setLoading(true);
    const gameRef = ref(database, `games/${gameId}`);
    const playersRef = ref(database, `games/${gameId}/players`);
    const userRef = ref(database, `games/${gameId}/players/${userId}`);

    try {
      // Set up player presence
      const playerData = {
        id: userId,
        name: userData.displayName || userData.email,
        isHost,
        lastActive: Date.now(),
        isOnline: true
      };

      // Update player data
      set(userRef, playerData);

      // Handle player disconnection
      onDisconnect(userRef).update({
        isOnline: false,
        lastActive: Date.now()
      });

      // Listen for game state changes
      const gameListener = onValue(gameRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setGameState(data);
          setLoading(false);
        } else {
          setError('Game not found');
          setLoading(false);
        }
      }, (error) => {
        console.error('Game state error:', error);
        setError('Failed to load game state');
        setLoading(false);
      });

      // Listen for player changes
      const playersListener = onValue(playersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setPlayers(data);
        }
      });

      // Listen for timer and progress updates
      const timerRef = ref(database, `games/${gameId}/timer`);
      const progressRef = ref(database, `games/${gameId}/progress`);

      const timerListener = onValue(timerRef, (snapshot) => {
        setTimer(snapshot.val() || 0);
      });

      const progressListener = onValue(progressRef, (snapshot) => {
        setProgress(snapshot.val() || 0);
      });

      // Listen for difficulty changes
      const difficultyRef = ref(database, `games/${gameId}/difficulty`);
      const difficultyListener = onValue(difficultyRef, (snapshot) => {
        setDifficulty(snapshot.val() || 'easy');
      });

      // Cleanup function
      return () => {
        gameListener();
        playersListener();
        timerListener();
        progressListener();
        difficultyListener();
        if (isHost) {
          // If host leaves, cleanup game
          remove(gameRef);
        } else {
          // If player leaves, just remove player
          remove(userRef);
        }
      };

    } catch (error) {
      console.error('Game initialization error:', error);
      setError('Failed to initialize game');
      setLoading(false);
    }
  }, [gameId, userId, isHost]);

  // Update game state
  const updateGameState = useCallback(async (newState) => {
    if (!gameId) return;

>>>>>>> new
    try {
      await update(ref(database, `games/${gameId}`), {
        ...newState,
        lastUpdated: Date.now()
      });
    } catch (error) {
<<<<<<< HEAD
      setError(error.message);
    }
  };

  const syncPieceState = async (pieces) => {
    if (!gameId || !currentUser) return;
    try {
      await update(ref(database, `games/${gameId}/puzzle/pieces`), pieces);
    } catch (error) {
      setError(error.message);
    }
  };

  const syncImageState = async (imageData) => {
    if (!gameId || !currentUser) return;
    await update(ref(database, `games/${gameId}/puzzle`), {
      image: imageData,
      lastUpdated: Date.now()
    });
  };

  const syncPuzzleState = async (puzzleData) => {
    if (!gameId || !currentUser) return;
    try {
      // Ensure atomic updates by using a transaction
      await set(ref(database, `games/${gameId}/puzzle`), {
        ...puzzleData,
        lastUpdated: Date.now(),
        updatedBy: currentUser.uid,
        // Add a random session ID to force refresh on re-upload
        sessionId: Math.random().toString(36).substring(7)
      });
    } catch (error) {
      setError(error.message);
    }
  };

  const syncPieceMovement = async (piece) => {
    if (!gameId || !currentUser) return;
    try {
      // Don't sync if piece is already placed
      if (piece.userData.isPlaced) return;

      await update(ref(database, `games/${gameId}/puzzle/pieces/${piece.userData.id}`), {
        position: {
          x: piece.position.x,
          y: piece.position.y,
          z: piece.position.z
        },
        rotation: piece.rotation.z,
        isPlaced: piece.userData.isPlaced,
        lastMoved: {
          by: currentUser.uid,
          at: Date.now()
        }
      });
    } catch (error) {
      setError(error.message);
    }
  };

  const lockPiece = async (pieceId) => {
    if (!gameId || !currentUser) return false;
    try {
      const pieceRef = ref(database, `games/${gameId}/puzzle/pieces/${pieceId}/lockedBy`);
      const result = await set(pieceRef, {
        userId: currentUser.uid,
        timestamp: Date.now()
      });
      return true;
    } catch (error) {
      setError(error.message);
      return false;
    }
  };

  const unlockPiece = async (pieceId) => {
    if (!gameId || !currentUser) return;
    try {
      const pieceRef = ref(database, `games/${gameId}/puzzle/pieces/${pieceId}/lockedBy`);
      await remove(pieceRef);
    } catch (error) {
      setError(error.message);
    }
  };

  const updateCursorPosition = async (position) => {
    if (!gameId || !currentUser) return;
    try {
      await update(ref(database, `games/${gameId}/cursors/${currentUser.uid}`), {
        position,
        timestamp: Date.now()
      });
    } catch (error) {
      setError(error.message);
    }
  };

  const handleGameCompletion = async (finalTime) => {
    try {
      // Update game completion state
      await update(ref(database, `games/${gameId}`), {
        isCompleted: true,
        completionTime: finalTime,
        completedBy: currentUser.uid,
        completedAt: Date.now()
      });

      // Record score and stats
      await handlePuzzleCompletion({
        puzzleId: `multiplayer_${gameId}`,
        userId: currentUser.uid,
        playerName: currentUser.displayName || 'Anonymous',
        startTime: gameState.startedAt,
        difficulty: gameState.difficulty || 4,
        imageUrl: gameState.puzzle?.imageUrl,
        timer: finalTime
      });
    } catch (error) {
      setError(error.message);
    }
  };

  return {
    players,
    gameState,
    error,
    updatePiecePosition,
    updateGameState,
    syncPieceState,
    syncImageState,
    syncPuzzleState,
    syncPieceMovement,
    lockPiece,
    unlockPiece,
    updateCursorPosition,
    handleGameCompletion
  };
};
=======
      console.error('Update game state error:', error);
      setError('Failed to update game state');
      toast.error('Failed to update game state');
    }
  }, [gameId]);

  // Update piece position
  const updatePiecePosition = useCallback(async (pieceId, position) => {
    if (!gameId || !userId) return;

    try {
      await update(ref(database, `games/${gameId}/pieces/${pieceId}`), {
        ...position,
        lastUpdatedBy: userId,
        lastUpdated: Date.now()
      });
    } catch (error) {
      console.error('Update piece position error:', error);
      setError('Failed to update piece position');
      toast.error('Failed to move piece');
    }
  }, [gameId, userId]);

  // Sync puzzle state
  const syncPuzzleState = useCallback(async (puzzleState) => {
    if (!gameId || !isHost) return;

    try {
      await set(ref(database, `games/${gameId}/puzzle`), {
        ...puzzleState,
        lastUpdated: Date.now()
      });
    } catch (error) {
      console.error('Sync puzzle state error:', error);
      setError('Failed to sync puzzle state');
      toast.error('Failed to sync puzzle');
    }
  }, [gameId, isHost]);

  // Sync piece state
  const syncPieceState = useCallback(async (piecesData) => {
    if (!gameId || !isHost) return;

    try {
      await set(ref(database, `games/${gameId}/pieces`), {
        ...piecesData,
        lastUpdated: Date.now()
      });
    } catch (error) {
      console.error('Sync piece state error:', error);
      setError('Failed to sync pieces');
      toast.error('Failed to sync pieces');
    }
  }, [gameId, isHost]);

  // Handle player ready state
  const setPlayerReady = useCallback(async (ready = true) => {
    if (!gameId || !userId) return;

    try {
      await update(ref(database, `games/${gameId}/players/${userId}`), {
        ready,
        lastUpdated: Date.now()
      });
    } catch (error) {
      console.error('Set player ready error:', error);
      setError('Failed to update ready state');
      toast.error('Failed to update ready state');
    }
  }, [gameId, userId]);

  // Start game
  const startGame = useCallback(async () => {
    if (!gameId || !isHost) return;

    try {
      await update(ref(database, `games/${gameId}`), {
        status: 'playing',
        startedAt: Date.now()
      });
    } catch (error) {
      console.error('Start game error:', error);
      setError('Failed to start game');
      toast.error('Failed to start game');
    }
  }, [gameId, isHost]);

  // End game
  const endGame = useCallback(async (winner = null) => {
    if (!gameId || !isHost) return;

    try {
      await update(ref(database, `games/${gameId}`), {
        status: 'completed',
        endedAt: Date.now(),
        winner,
      });
    } catch (error) {
      console.error('End game error:', error);
      setError('Failed to end game');
      toast.error('Failed to end game');
    }
  }, [gameId, isHost]);

  // Check if all pieces are placed
  const checkGameCompletion = useCallback(() => {
    if (!gameState?.pieces) return false;

    const allPieces = Object.values(gameState.pieces);
    return allPieces.length > 0 && allPieces.every(piece => piece.isPlaced);
  }, [gameState?.pieces]);

  // Update timer
  const updateTimer = useCallback(async (newTimer) => {
    if (!gameId) return;

    try {
      await update(ref(database, `games/${gameId}`), {
        timer: newTimer,
      });
    } catch (error) {
      console.error('Update timer error:', error);
      setError('Failed to update timer');
      toast.error('Failed to update timer');
    }
  }, [gameId]);

  // Update progress
  const updateProgress = useCallback(async (newProgress) => {
    if (!gameId) return;

    try {
      await update(ref(database, `games/${gameId}`), {
        progress: newProgress,
      });
    } catch (error) {
      console.error('Update progress error:', error);
      setError('Failed to update progress');
      toast.error('Failed to update progress');
    }
  }, [gameId]);

  // Update difficulty
  const updateDifficulty = useCallback(async (newDifficulty) => {
    if (!gameId) return;

    try {
      await update(ref(database, `games/${gameId}`), {
        difficulty: newDifficulty,
        lastUpdated: Date.now()
      });
    } catch (error) {
      console.error('Update difficulty error:', error);
      setError('Failed to update difficulty');
      toast.error('Failed to update difficulty');
    }
  }, [gameId]);

  return {
    // State
    players,
    gameState,
    error,
    loading,
    isHost,
    userId,
    timer,
    progress,
    difficulty,

    // Game actions
    updateGameState,
    updatePiecePosition,
    syncPuzzleState,
    syncPieceState,
    setPlayerReady,
    startGame,
    endGame,
    checkGameCompletion,
    updateTimer,
    updateProgress,
    updateDifficulty,

    // Helper methods
    isGameComplete: checkGameCompletion(),
    isPlayerReady: players[userId]?.ready || false,
    playerCount: Object.keys(players).length,
    allPlayersReady: Object.values(players).every(player => player.ready)
  };
};

export default useMultiplayerGame;
>>>>>>> new
