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

      // Cleanup function
      return () => {
        gameListener();
        playersListener();
        timerListener();
        progressListener();
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

    try {
      await update(ref(database, `games/${gameId}`), {
        ...newState,
        lastUpdated: Date.now()
      });
    } catch (error) {
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

    // Helper methods
    isGameComplete: checkGameCompletion(),
    isPlayerReady: players[userId]?.ready || false,
    playerCount: Object.keys(players).length,
    allPlayersReady: Object.values(players).every(player => player.ready)
  };
};

export default useMultiplayerGame;