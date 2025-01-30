import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { database, ref, set, update, onValue, remove } from '../firebase';
import { Camera, Copy, Users, ArrowLeft, Play, Mail, Share2 } from 'lucide-react';
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

  const handleEmailShare = () => {
    const subject = encodeURIComponent('Join my Puzzle Game!');
    const body = encodeURIComponent(`Hey! Join my puzzle game: ${inviteLink}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`Hey! Join my puzzle game: ${inviteLink}`);
    window.open(`https://wa.me/?text=${text}`);
  };

  const handleFacebookShare = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteLink)}`);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
        <div className="animate-bounce p-4 bg-white/10 backdrop-blur-lg rounded-full">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-t-blue-500 border-white"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-900 via-pink-900 to-orange-900">
        <div className="bg-white/10 backdrop-blur-lg p-8 rounded-xl shadow-2xl max-w-md w-full mx-4">
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-6 mb-8 transform hover:scale-[1.02] transition-all">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
              {isHost ? '🎮 Create New Game' : '🎮 Join Game'}
            </h1>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
            >
              <ArrowLeft size={20} />
              <span>Back</span>
            </button>
          </div>
        </div>

        {/* Game Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left column */}
          <div className="space-y-8">
            {/* Image Upload (host only) */}
            {isHost && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-6 transform hover:scale-[1.02] transition-all">
                <h2 className="text-xl font-bold text-white mb-4">Upload Puzzle Image</h2>
                {!image ? (
                  <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-white/30 rounded-xl cursor-pointer hover:bg-white/5 transition-all group">
                    <Camera size={32} className="text-white/70 mb-2 group-hover:scale-110 transition-all" />
                    <span className="text-white/70">Click to upload image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="relative rounded-xl overflow-hidden group">
                    <img
                      src={image}
                      alt="Puzzle"
                      className="w-full h-48 object-contain"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                      <button
                        onClick={() => setImage(null)}
                        className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transform hover:scale-110 transition-all"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Invite Link (host only) */}
            {isHost && inviteLink && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-6 transform hover:scale-[1.02] transition-all">
                <h2 className="text-xl font-bold text-white mb-4">Invite Players</h2>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inviteLink}
                      readOnly
                      className="flex-1 p-3 rounded-lg bg-white/5 border border-white/10 text-white"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transform hover:scale-105 transition-all"
                    >
                      <Copy size={20} />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={handleEmailShare}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white rounded-lg transform hover:scale-105 transition-all"
                    >
                      <Mail size={20} />
                      <span>Email</span>
                    </button>
                    
                    <button
                      onClick={handleWhatsAppShare}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white rounded-lg transform hover:scale-105 transition-all"
                    >
                      <Share2 size={20} />
                      <span>WhatsApp</span>
                    </button>
                    
                    <button
                      onClick={handleFacebookShare}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-lg transform hover:scale-105 transition-all"
                    >
                      <Share2 size={20} />
                      <span>Facebook</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-8">
            {/* Players List */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-6 transform hover:scale-[1.02] transition-all">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Players</h2>
                <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg">
                  <Users size={20} className="text-white" />
                  <span className="text-white">{Object.keys(players).length}</span>
                </div>
              </div>
              <div className="space-y-2">
                {Object.values(players).map(player => (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all"
                  >
                    <div className={`w-3 h-3 rounded-full ${
                      player.isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-400'
                    }`} />
                    <span className="flex-1 text-white">{player.name}</span>
                    {player.isHost && (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs font-medium rounded">HOST</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Start Game Button (host only) */}
            {isHost && image && (
              <button
                onClick={handleStartGame}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white rounded-xl transform hover:scale-105 transition-all shadow-lg hover:shadow-xl"
              >
                <Play size={24} />
                <span className="text-lg font-bold">Start Game</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollaborativePuzzle;