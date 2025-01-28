import React, { useState, useEffect, useRef } from 'react';
import { database, ref, set, onValue, update, remove, onDisconnect } from '../../../firebase';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, Copy, Users } from 'lucide-react';

// Core game state management
const useGameState = (gameId, userId, userName) => {
  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!gameId || !userId) return;

    // Set up real-time listeners
    const gameRef = ref(database, `games/${gameId}`);
    const playersRef = ref(database, `games/${gameId}/players`);

    // Listen for game state changes
    const gameListener = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setGameState(data);
    });

    // Listen for player changes
    const playersListener = onValue(playersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setPlayers(data);
    });

    // Handle player disconnection
    const playerRef = ref(database, `games/${gameId}/players/${userId}`);
    onDisconnect(playerRef).remove();

    return () => {
      gameListener();
      playersListener();
    };
  }, [gameId, userId]);

  return { gameState, players, error };
};

// Puzzle piece interaction with real-time sync
const usePuzzlePieces = (gameId, userId) => {
  const [pieces, setPieces] = useState({});

  const updatePiecePosition = async (pieceId, position) => {
    if (!gameId || !userId) return;
    
    try {
      await update(ref(database, `games/${gameId}/pieces/${pieceId}`), {
        position,
        lastUpdatedBy: userId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error updating piece position:', error);
    }
  };

  useEffect(() => {
    if (!gameId) return;

    const piecesRef = ref(database, `games/${gameId}/pieces`);
    const listener = onValue(piecesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setPieces(data);
    });

    return () => listener();
  }, [gameId]);

  return { pieces, updatePiecePosition };
};

// Main game component
const CollaborativePuzzle = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [isHost, setIsHost] = useState(false);
  const [image, setImage] = useState(null);
  const containerRef = useRef();
  const [authError, setAuthError] = useState(null);

  // Get user data from localStorage
  const [userData, setUserData] = useState(() => {
    try {
      const data = JSON.parse(localStorage.getItem('authUser'));
      if (!data?.uid) throw new Error('No user data found');
      return data;
    } catch (error) {
      setAuthError('Please log in to continue');
      return null;
    }
  });

  const userId = userData?.uid;
  const userName = userData?.displayName || userData?.email;

  // Game state and pieces management
  const { gameState, players, error } = useGameState(gameId, userId, userName);
  const { pieces, updatePiecePosition } = usePuzzlePieces(gameId, userId);

  // Create new game session
  const createGame = async () => {
    if (!userId || !userName) {
      setAuthError('Please log in to create a game');
      return;
    }

    const newGameId = Math.random().toString(36).substr(2, 9);
    
    try {
      await set(ref(database, `games/${newGameId}`), {
        createdAt: Date.now(),
        hostId: userId,
        hostName: userName,
        status: 'waiting'
      });

      await set(ref(database, `games/${newGameId}/players/${userId}`), {
        id: userId,
        name: userName,
        isHost: true,
        joinedAt: Date.now()
      });

      setIsHost(true);
      navigate(`/puzzle/${newGameId}`);
    } catch (error) {
      console.error('Error creating game:', error);
    }
  };

  // Join existing game
  const joinGame = async () => {
    if (!gameId || !userId || !userName) {
      setAuthError('Please log in to join the game');
      return;
    }

    try {
      await update(ref(database, `games/${gameId}/players/${userId}`), {
        id: userId,
        name: userName,
        isHost: false,
        joinedAt: Date.now()
      });
    } catch (error) {
      console.error('Error joining game:', error);
    }
  };

  // Handle image upload (host only)
  const handleImageUpload = async (event) => {
    if (!isHost || !event.target.files[0]) return;

    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      const imageData = e.target.result;
      setImage(imageData);

      try {
        await update(ref(database, `games/${gameId}`), {
          image: imageData,
          status: 'playing',
          updatedAt: Date.now()
        });
      } catch (error) {
        console.error('Error uploading image:', error);
      }
    };

    reader.readAsDataURL(file);
  };

  // Copy invitation link
  const copyInviteLink = () => {
    const link = `${window.location.origin}/puzzle/join/${gameId}`;
    navigator.clipboard.writeText(link);
  };

  // Component mounting
  useEffect(() => {
    if (gameId && userId) {
      joinGame();
    }
  }, [gameId, userId]);

  // Show auth error if no user data
  if (authError) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center p-8 bg-gray-800 rounded-lg">
          <h2 className="text-xl font-bold mb-4">{authError}</h2>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="p-4 bg-gray-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Collaborative Puzzle</h1>
          
          <div className="flex items-center gap-4">
            {/* Player count */}
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <span>{Object.keys(players).length} players</span>
            </div>
            
            {/* User info */}
            <div className="text-sm">
              Logged in as <span className="font-semibold">{userName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto p-4">
        {!gameId ? (
          // Create new game
          <div className="text-center py-12">
            <button
              onClick={createGame}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Create New Game
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Host controls */}
            {isHost && !image && (
              <div className="text-center py-6">
                <label className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg">
                  <Camera className="w-5 h-5" />
                  <span>Upload Puzzle Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {/* Invitation link */}
            {gameState?.status === 'waiting' && (
              <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-lg">
                <span>Share this link to invite players:</span>
                <button
                  onClick={copyInviteLink}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy Link</span>
                </button>
              </div>
            )}

            {/* Players list */}
            <div className="p-4 bg-gray-800 rounded-lg">
              <h2 className="text-lg font-semibold mb-4">Players</h2>
              <div className="space-y-2">
                {Object.values(players).map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span>{player.name}</span>
                    {player.isHost && (
                      <span className="text-xs text-blue-400">(Host)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Puzzle area */}
            {image && (
              <div
                ref={containerRef}
                className="aspect-video bg-gray-800 rounded-lg overflow-hidden"
              >
                {/* Puzzle rendering would go here */}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CollaborativePuzzle;