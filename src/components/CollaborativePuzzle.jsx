import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { database, ref, set, update, onValue, remove } from '../firebase';
import { Camera, Copy, Users, ArrowLeft, Play } from 'lucide-react';
import MultiplayerManager from './MultiplayerManager';
import { toast } from 'react-hot-toast';
import ErrorBoundary from './ErrorBoundary';

const CollaborativePuzzle = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState({});
  const [image, setImage] = useState(null);
  const [inviteLink, setInviteLink] = useState('');
  const [showThumbnail, setShowThumbnail] = useState(false);
  
  // Get current user data
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData?.uid;
  const userName = userData?.displayName || userData?.email;

  // Determine if host based on URL
  const isJoining = gameId.includes('join_');
  const actualGameId = isJoining ? gameId.replace('join_', '') : gameId;
  const isHost = !isJoining;

  // Initialize game session
  useEffect(() => {
    if (!actualGameId || !userId) return;

    setLoading(true);
    const gameRef = ref(database, `games/${actualGameId}`);
    const playersRef = ref(database, `games/${actualGameId}/players`);

    // Set up game listeners
    const gameListener = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameState(data);
        if (data.image) setImage(data.image);
      }
      setLoading(false);
    }, (error) => {
      console.error('Game fetch error:', error);
      setError('Failed to load game');
      setLoading(false);
    });

    // Set up players listener
    const playersListener = onValue(playersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setPlayers(data);
    });

    // Initialize game if host
    const initializeGame = async () => {
      if (isHost) {
        try {
          await set(gameRef, {
            createdAt: Date.now(),
            hostId: userId,
            status: 'waiting',
            players: {
              [userId]: {
                id: userId,
                name: userName,
                isHost: true,
                joinedAt: Date.now(),
                isOnline: true
              }
            }
          });

          // Generate invite link
          const baseUrl = window.location.origin + window.location.pathname;
          setInviteLink(`${baseUrl}#/puzzle/multiplayer/join_${actualGameId}`);
        } catch (error) {
          console.error('Game creation error:', error);
          setError('Failed to create game');
        }
      }
    };

    // Join existing game if not host
    const joinGame = async () => {
      if (!isHost) {
        try {
          const playerRef = ref(database, `games/${actualGameId}/players/${userId}`);
          await set(playerRef, {
            id: userId,
            name: userName,
            isHost: false,
            joinedAt: Date.now(),
            isOnline: true
          });
        } catch (error) {
          console.error('Join game error:', error);
          setError('Failed to join game');
        }
      }
    };

    // Initialize or join game
    if (isHost) {
      initializeGame();
    } else {
      joinGame();
    }

    // Cleanup function
    return () => {
      gameListener();
      playersListener();
      
      // Remove player when leaving
      if (!isHost) {
        remove(ref(database, `games/${actualGameId}/players/${userId}`));
      }
    };
  }, [actualGameId, userId, isHost, userName]);

  // Handle image upload (host only)
  const handleImageUpload = async (event) => {
    if (!isHost || !event.target.files[0]) return;

    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      const imageData = e.target.result;
      try {
        await update(ref(database, `games/${actualGameId}`), {
          image: imageData,
          uploadedAt: Date.now()
        });
        setImage(imageData);
        toast.success('Image uploaded successfully');
      } catch (error) {
        console.error('Image upload error:', error);
        toast.error('Failed to upload image');
      }
    };

    reader.readAsDataURL(file);
  };

  // Start game (host only)
  const handleStartGame = async () => {
    if (!isHost || !image) return;

    try {
      await update(ref(database, `games/${actualGameId}`), {
        status: 'playing',
        startedAt: Date.now()
      });
      toast.success('Game started!');
    } catch (error) {
      console.error('Game start error:', error);
      toast.error('Failed to start game');
    }
  };

  // Copy invite link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied!');
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/puzzle/multiplayer')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            <ArrowLeft size={20} />
            <span>Back to Games</span>
          </button>
        </div>
      </div>
    );
  }

  // Show puzzle manager if game is playing
  if (gameState?.status === 'playing' && image) {
    // console.log('Transitioning to game with image:', image); // Add this
    return (
      <ErrorBoundary>
        <MultiplayerManager
          gameId={actualGameId}
          isHost={isHost}
          user={userData}
          image={image}
        />
      </ErrorBoundary>
    );
  }

  // Lobby UI
  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              {isHost ? 'Create New Game' : 'Join Game'}
            </h1>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft size={20} />
              <span>Back</span>
            </button>
          </div>
        </div>

        {/* Game Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Left column */}
          <div className="space-y-8">
            {/* Image Upload (host only) */}
            {isHost && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold mb-4">Upload Puzzle Image</h2>
                {!image ? (
                  <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <Camera size={32} className="text-gray-400 mb-2" />
                    <span className="text-gray-500">Click to upload image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="relative">
                    <img
                      src={image}
                      alt="Puzzle"
                      className="w-full h-48 object-contain rounded-lg"
                    />
                    <button
                      onClick={() => setImage(null)}
                      className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Invite Link (host only) */}
            {isHost && inviteLink && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold mb-4">Invite Players</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteLink}
                    readOnly
                    className="flex-1 p-2 border rounded bg-gray-50"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    <Copy size={20} />
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-8">
            {/* Players List */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Players</h2>
                <div className="flex items-center gap-2 text-gray-600">
                  <Users size={20} />
                  <span>{Object.keys(players).length}</span>
                </div>
              </div>
              <div className="space-y-2">
                {Object.values(players).map(player => (
                  <div
                    key={player.id}
                    className="flex items-center gap-2 p-2 bg-gray-50 rounded"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      player.isOnline ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <span className="flex-1">{player.name}</span>
                    {player.isHost && (
                      <span className="text-xs text-blue-600 font-medium">HOST</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Start Game Button (host only) */}
            {isHost && image && (
              <button
                onClick={handleStartGame}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition duration-200"
              >
                <Play size={20} />
                <span>Start Game</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollaborativePuzzle;