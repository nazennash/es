// CollaborativePuzzle.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { database, ref, set, onValue, update, remove, onDisconnect, get } from '../../../firebase';
import { Camera, Copy, Users } from 'lucide-react';
import PropTypes from 'prop-types';


const CollaborativePuzzle = ({ mode = 'play' }) => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [isHost, setIsHost] = useState(mode === 'create');
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);

  // Get authenticated user data
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData?.uid;
  const userName = userData?.displayName || userData?.email;

  // Initialize game based on mode
  useEffect(() => {
    const initializeGame = async () => {
      try {
        switch (mode) {
          case 'create':
            const newGameId = Math.random().toString(36).substr(2, 9);
            await createNewGame(newGameId);
            navigate(`/puzzle/${newGameId}`);
            break;

          case 'join':
            if (gameId) {
              await joinExistingGame(gameId);
              navigate(`/puzzle/${gameId}`);
            }
            break;

          case 'play':
            if (gameId) {
              const gameRef = ref(database, `games/${gameId}`);
              const snapshot = await get(gameRef);
              
              if (snapshot.exists()) {
                const game = snapshot.val();
                setIsHost(game.hostId === userId);
                await joinExistingGame(gameId);
              } else {
                setError('Game not found');
              }
            }
            break;

          default:
            setError('Invalid game mode');
        }
      } catch (err) {
        setError(err.message);
      }
    };

    if (userId) {
      initializeGame();
    }
  }, [mode, userId]);

  // Create new game
  const createNewGame = async (newGameId) => {
    await set(ref(database, `games/${newGameId}`), {
      createdAt: Date.now(),
      hostId: userId,
      hostName: userName,
      status: 'waiting',
      players: {
        [userId]: {
          id: userId,
          name: userName,
          isHost: true,
          joinedAt: Date.now()
        }
      }
    });
    setIsHost(true);
  };

  // Join existing game
  const joinExistingGame = async (gameId) => {
    const playerRef = ref(database, `games/${gameId}/players/${userId}`);
    
    await update(playerRef, {
      id: userId,
      name: userName,
      isHost: false,
      joinedAt: Date.now()
    });

    // Handle disconnection
    onDisconnect(playerRef).remove();
  };

  // Error handling
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center p-8 bg-gray-800 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Error</h2>
          <p className="mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  // Rest of the component implementation...
  // (Previous render logic remains the same)
};

// PropTypes
CollaborativePuzzle.propTypes = {
  mode: PropTypes.oneOf(['create', 'join', 'play'])
};

export default CollaborativePuzzle;