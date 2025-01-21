import { useState, useEffect } from 'react';
import { database, ref, set, onValue, update, remove, onDisconnect, auth } from '../firebase';

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
    
    try {
      await update(ref(database, `games/${gameId}`), {
        ...newState,
        lastUpdated: Date.now()
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
    updateGameState
  };
};
