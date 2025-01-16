import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update, get, runTransaction } from 'firebase/database';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Share2, Play, Users, Download, LogOut, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import html2canvas from 'html2canvas';
import { handlePuzzleCompletion, isPuzzleComplete } from './PuzzleCompletionHandler';

// Constants
const MAX_PLAYERS = 8;
const MIN_DIFFICULTY = 2;
const MAX_DIFFICULTY = 8;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

const MultiplayerPuzzle = () => {
  // Core state
  const [gameState, setGameState] = useState({
    gameId: window.location.pathname.split('/').pop() || `game-${Date.now()}`,
    imageUrl: '',
    isHost: false,
    difficulty: 3,
    timer: 0,
    imageSize: { width: 0, height: 0 },
    startTime: null,
    lastUpdateTime: null,
    isCompleted: false
  });

  // UI state
  const [ui, setUi] = useState({
    zoom: 1,
    selectedPiece: null,
    draggedPiece: null,
    error: null,
    showPlayers: true,
    loading: true,
    gridDimensions: { width: 0, height: 0 },
    cellDimensions: { width: 0, height: 0 }
  });

  // Game state
  const [pieces, setPieces] = useState([]);
  const [players, setPlayers] = useState({});
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [winner, setWinner] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);

  // Refs
  const timerRef = useRef(null);
  const puzzleContainerRef = useRef(null);
  const isTimerRunning = useRef(false);

  // Firebase instances
  const storage = getStorage();
  const database = getDatabase();

  // Navigation
  const navigate = useNavigate();

  // User data
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData?.uid || `user-${Date.now()}`;
  const userName = userData?.displayName || userData?.email || `Player ${Math.floor(Math.random() * 1000)}`;

  // Memoized helper functions
  const getHighestScoringPlayer = useCallback(() => {
    return Object.values(players).reduce((highest, current) => {
      return (!highest || current.score > highest.score) ? current : highest;
    }, null);
  }, [players]);

  const calculateCompletionPercentage = useCallback(() => {
    const totalPieces = pieces.length;
    const correctlyPlaced = pieces.filter(p => p.isPlaced).length;
    return totalPieces > 0 ? (correctlyPlaced / totalPieces) * 100 : 0;
  }, [pieces]);

  // Error handling wrapper
  const withErrorHandling = async (operation, errorMessage) => {
    try {
      return await operation();
    } catch (err) {
      console.error(`${errorMessage}:`, err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: errorMessage }
      }));
      throw err;
    }
  };

  // Transaction wrapper for Firebase updates
  const withTransaction = async (ref, updateFn) => {
    return await runTransaction(ref, (current) => {
      if (current === null) return current;
      return updateFn(current);
    });
  };

  // Continue to Part 2...


  // Game initialization and cleanup
  useEffect(() => {
    let unsubscribe;
    const gameRef = dbRef(database, `games/${gameState.gameId}`);
    
    const initializeGame = async () => {
      await withErrorHandling(async () => {
        const snapshot = await get(gameRef);
        const data = snapshot.val();
        
        if (!data) {
          // New game setup
          await set(gameRef, {
            players: {
              [userId]: {
                id: userId,
                name: userName,
                score: 0,
                color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
                isHost: true,
                lastActive: Date.now()
              }
            },
            imageUrl: '',
            isGameStarted: false,
            timer: 0,
            difficulty: gameState.difficulty,
            startTime: null,
            imageSize: gameState.imageSize,
            maxPlayers: MAX_PLAYERS
          });
          setGameState(prev => ({ ...prev, isHost: true }));
        } else {
          // Join existing game
          if (Object.keys(data.players || {}).length >= (data.maxPlayers || MAX_PLAYERS)) {
            throw new Error('Game is full');
          }

          setGameState(prev => ({
            ...prev,
            difficulty: data.difficulty || 3,
            isHost: data.players?.[userId]?.isHost || false,
            startTime: data.startTime || null,
            imageSize: data.imageSize || { width: 0, height: 0 }
          }));
          
          if (!data.players?.[userId]) {
            await update(gameRef, {
              [`players/${userId}`]: {
                id: userId,
                name: userName,
                score: 0,
                color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
                isHost: false,
                lastActive: Date.now()
              }
            });
          }
        }
      }, 'Failed to initialize game');

      setUi(prev => ({ ...prev, loading: false }));
    };

    const setupListeners = () => {
      const handleGameUpdate = (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        setGameState(prev => ({
          ...prev,
          imageUrl: data.imageUrl || '',
          difficulty: data.difficulty || 3,
          timer: data.timer || 0,
          isCompleted: data.isCompleted || false
        }));
        setPlayers(data.players || {});
        setPieces(data.pieces || []);
        setIsGameStarted(data.isGameStarted || false);

        // Handle host disconnection
        const currentHost = Object.values(data.players || {}).find(p => p.isHost);
        if (!currentHost && gameState.isHost) {
          const oldestPlayer = Object.values(data.players || {})
            .sort((a, b) => a.lastActive - b.lastActive)[0];
          if (oldestPlayer?.id === userId) {
            update(gameRef, {
              [`players/${userId}/isHost`]: true
            });
            setGameState(prev => ({ ...prev, isHost: true }));
          }
        }
      };

      unsubscribe = onValue(gameRef, handleGameUpdate, (error) => {
        console.error('Database listener error:', error);
        setUi(prev => ({
          ...prev,
          error: { type: 'error', message: 'Lost connection to game' }
        }));
      });

      // Keep-alive ping
      const pingInterval = setInterval(() => {
        if (userId) {
          update(dbRef(database, `games/${gameState.gameId}/players/${userId}`), {
            lastActive: Date.now()
          });
        }
      }, 30000);

      return () => clearInterval(pingInterval);
    };

    initializeGame();
    const cleanup = setupListeners();

    return () => {
      if (unsubscribe) unsubscribe();
      if (cleanup) cleanup();
      if (timerRef.current) clearInterval(timerRef.current);
      
      // Cleanup player data
      if (userId) {
        const updates = {};
        updates[`games/${gameState.gameId}/players/${userId}`] = null;
        update(dbRef(database), updates).catch(console.error);
      }
    };
  }, [gameState.gameId, userId, database]);

  // Timer management
  useEffect(() => {
    if (!isGameStarted || gameState.isCompleted) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        isTimerRunning.current = false;
      }
      return;
    }

    if (!isTimerRunning.current && gameState.startTime) {
      isTimerRunning.current = true;
      timerRef.current = setInterval(async () => {
        const newTimer = Math.floor((Date.now() - gameState.startTime) / 1000);
        await withTransaction(dbRef(database, `games/${gameState.gameId}`), (game) => {
          if (game) {
            game.timer = newTimer;
            return game;
          }
          return null;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        isTimerRunning.current = false;
      }
    };
  }, [isGameStarted, gameState.startTime, gameState.isCompleted]);

  // Update grid and cell dimensions when image is loaded
  useEffect(() => {
    if (gameState.imageUrl && puzzleContainerRef.current) {
      const img = new Image();
      img.onload = () => {
        const containerWidth = puzzleContainerRef.current.clientWidth;
        const containerHeight = puzzleContainerRef.current.clientHeight;
        const cellWidth = containerWidth / gameState.difficulty;
        const cellHeight = containerHeight / gameState.difficulty;
        setUi(prev => ({
          ...prev,
          gridDimensions: { width: containerWidth, height: containerHeight },
          cellDimensions: { width: cellWidth, height: cellHeight }
        }));
      };
      img.src = gameState.imageUrl;
    }
  }, [gameState.imageUrl, gameState.difficulty]);

  // Continue to Part 3...

  // Game actions
  const handleImageUpload = async (event) => {
    if (!gameState.isHost) return;
    const file = event.target.files?.[0];
    if (!file) return;

    await withErrorHandling(async () => {
      setUi(prev => ({ ...prev, loading: true }));
      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      await update(dbRef(database), {
        [`games/${gameState.gameId}/imageUrl`]: url,
        [`games/${gameState.gameId}/imageSize`]: {
          width: img.width,
          height: img.height
        }
      });
      
      setUi(prev => ({ ...prev, loading: false }));
    }, 'Failed to upload image');
  };

  const startNewGame = async () => {
      try {
        const newGameId = `game-${Date.now()}`;
        const newGameRef = dbRef(database, `games/${newGameId}`);
        
        await set(newGameRef, {
          players: {
            [userId]: {
              id: userId,
              name: userName,
              score: 0,
              color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
              isHost: true
            }
          },
          imageUrl: '',
          isGameStarted: false,
          timer: 0,
          difficulty: gameState.difficulty
        });
    
        navigate(`/puzzle/multiplayer/${newGameId}`);
      } catch (err) {
        console.error('Failed to start new game:', err);
        setUi(prev => ({
          ...prev,
          error: { type: 'error', message: 'Failed to start new game' }
        }));
      }
    };

  const initializePuzzle = async () => {
    if (!gameState.imageUrl || !gameState.isHost) return;

    await withErrorHandling(async () => {
      setUi(prev => ({ ...prev, loading: true }));
      
      const piecePositions = Array.from({ length: gameState.difficulty * gameState.difficulty })
        .map((_, i) => i)
        .sort(() => Math.random() - 0.5);

      const newPieces = Array.from({ length: gameState.difficulty * gameState.difficulty })
        .map((_, index) => {
          const i = Math.floor(index / gameState.difficulty);
          const j = index % gameState.difficulty;
          const randomPos = piecePositions[index];
          return {
            id: `piece-${i}-${j}`,
            correct: { x: i, y: j },
            current: { 
              x: Math.floor(randomPos / gameState.difficulty), 
              y: randomPos % gameState.difficulty 
            },
            rotation: Math.floor(Math.random() * 4) * 90,
            isPlaced: false,
            lastModifiedBy: null,
            lastModifiedTime: null
          };
        });

      await update(dbRef(database), {
        [`games/${gameState.gameId}/pieces`]: newPieces,
        [`games/${gameState.gameId}/isGameStarted`]: true,
        [`games/${gameState.gameId}/startTime`]: Date.now(),
        [`games/${gameState.gameId}/timer`]: 0,
        [`games/${gameState.gameId}/isCompleted`]: false
      });

      setUi(prev => ({ ...prev, loading: false }));
    }, 'Failed to start game');
  };

  

  const handleDrop = async (x, y) => {
    if (!ui.draggedPiece || gameState.isCompleted) return;

    await withErrorHandling(async () => {
      const piece = pieces.find(p => p.id === ui.draggedPiece.id);
      if (!piece) return;

      const isCorrect = x === piece.correct.x && 
                       y === piece.correct.y && 
                       piece.rotation % 360 === 0;

      await withTransaction(dbRef(database, `games/${gameState.gameId}`), (game) => {
        if (!game || !game.pieces) return null;

        const updatedPieces = game.pieces.map(p => 
          p.id === piece.id ? {
            ...p,
            current: { x, y },
            isPlaced: isCorrect,
            lastModifiedBy: userId,
            lastModifiedTime: Date.now()
          } : p
        );

        const playerScore = (game.players[userId]?.score || 0) + (isCorrect ? 1 : 0);

        return {
          ...game,
          pieces: updatedPieces,
          players: {
            ...game.players,
            [userId]: {
              ...game.players[userId],
              score: playerScore
            }
          }
        };
      });

      setUi(prev => ({ ...prev, draggedPiece: null }));
    }, 'Failed to move piece');
  };

  const handleRotate = async (direction) => {
    if (!ui.selectedPiece || gameState.isCompleted) return;

    await withErrorHandling(async () => {
      const piece = pieces.find(p => p.id === ui.selectedPiece.id);
      if (!piece) return;

      await withTransaction(dbRef(database, `games/${gameState.gameId}`), (game) => {
        if (!game || !game.pieces) return null;

        const newRotation = piece.rotation + (direction === 'left' ? -90 : 90);
        const isCorrect = piece.correct.x === piece.current.x && 
                         piece.correct.y === piece.current.y && 
                         newRotation % 360 === 0;

        const updatedPieces = game.pieces.map(p => 
          p.id === piece.id ? {
            ...p,
            rotation: newRotation,
            isPlaced: isCorrect,
            lastModifiedBy: userId,
            lastModifiedTime: Date.now()
          } : p
        );

        const playerScore = (game.players[userId]?.score || 0) + (isCorrect ? 1 : 0);

        return {
          ...game,
          pieces: updatedPieces,
          players: {
            ...game.players,
            [userId]: {
              ...game.players[userId],
              score: playerScore
            }
          }
        };
      });
    }, 'Failed to rotate piece');
  };

  // JSX rendering (similar to original but with updated props and handlers)
  // ... [Previous render code remains largely the same, just updated with new state/handlers]
  
  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-lg shadow-lg max-w-6xl mx-auto">
      <div className="flex items-center justify-between border-b pb-4">
        <h1 className="text-2xl font-bold">Multiplayer Puzzle</h1>
        <div className="text-lg font-semibold">
          Time: {Math.floor(gameState.timer / 60)}:{String(gameState.timer % 60).padStart(2, '0')}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/')}
            className="p-2 border rounded hover:bg-gray-100 text-gray-600"
            title="Return Home"
          >
            <Home className="h-4 w-4" />
          </button>
          <button
            onClick={async () => {
              await withErrorHandling(async () => {
                await update(dbRef(database, `games/${gameState.gameId}/players/${userId}`), null);
                navigate('/');
              }, 'Failed to leave game');
            }}
            className="p-2 border rounded hover:bg-red-50 text-red-600"
            title="Leave Game"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {gameState.isHost && !isGameStarted && (
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <label htmlFor="difficulty" className="font-medium">
            Puzzle Size: {gameState.difficulty}x{gameState.difficulty}
          </label>
          <input
            type="range"
            id="difficulty"
            min={MIN_DIFFICULTY}
            max={MAX_DIFFICULTY}
            value={gameState.difficulty}
            onChange={async (e) => {
              const newDifficulty = parseInt(e.target.value, 10);
              await withErrorHandling(async () => {
                await update(dbRef(database, `games/${gameState.gameId}`), {
                  difficulty: newDifficulty,
                  pieces: [] // Clear pieces when difficulty changes
                });
              }, 'Failed to update difficulty');
            }}
            className="flex-1"
          />
          <span className="text-sm text-gray-600">
            ({gameState.difficulty * gameState.difficulty} pieces)
          </span>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => setUi(prev => ({
            ...prev,
            zoom: Math.max(prev.zoom - ZOOM_STEP, ZOOM_MIN)
          }))}
          className="p-2 border rounded hover:bg-gray-100"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => setUi(prev => ({
            ...prev,
            zoom: Math.min(prev.zoom + ZOOM_STEP, ZOOM_MAX)
          }))}
          className="p-2 border rounded hover:bg-gray-100"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        {ui.selectedPiece && !gameState.isCompleted && (
          <>
            <button
              onClick={() => handleRotate('left')}
              className="p-2 border rounded hover:bg-gray-100"
              title="Rotate Left"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleRotate('right')}
              className="p-2 border rounded hover:bg-gray-100"
              title="Rotate Right"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </>
        )}
        <button
          onClick={() => setUi(prev => ({ ...prev, showPlayers: !prev.showPlayers }))}
          className="p-2 border rounded hover:bg-gray-100"
          title="Toggle Players"
        >
          <Users className="h-4 w-4" />
        </button>
        <button
          onClick={async () => {
            const link = `${window.location.origin}/puzzle/multiplayer/${gameState.gameId}`;
            await navigator.clipboard.writeText(link);
            setUi(prev => ({
              ...prev,
              error: { type: 'success', message: 'Game link copied!' }
            }));
          }}
          className="p-2 border rounded hover:bg-gray-100"
          title="Share Game"
        >
          <Share2 className="h-4 w-4" />
        </button>
        {gameState.isHost && !isGameStarted && (
                  <button
                    onClick={initializePuzzle}
                    className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!gameState.imageUrl}
                    title="Start Game"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                )}
      </div>

      {ui.error && (
        <div 
          className={`p-3 rounded ${
            ui.error.type === 'error' 
              ? 'bg-red-100 text-red-700' 
              : ui.error.type === 'success'
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-100 text-blue-700'
          }`}
          role="alert"
        >
          {ui.error.message}
        </div>
      )}

      <div ref={puzzleContainerRef} className="flex gap-4">
        <div className="flex-1">
          {gameState.isHost && !gameState.imageUrl ? (
            <div className="w-full p-8 border-2 border-dashed rounded-lg text-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full"
                disabled={ui.loading}
              />
              <p className="mt-2 text-sm text-gray-500">
                Upload an image to start the game
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <img 
                  src={gameState.imageUrl} 
                  alt="Puzzle preview" 
                  className="w-1/4 h-1/4 lg:w-1/6 lg:h-1/6 object-contain rounded border"
                />
              </div>
              <div 
                className="grid gap-1 transition-transform duration-200"
                style={{
                  gridTemplateColumns: `repeat(${gameState.difficulty}, 1fr)`,
                  transform: `scale(${ui.zoom})`,
                  transformOrigin: 'top left'
                }}
              >
                {Array.from({ length: gameState.difficulty * gameState.difficulty }).map((_, index) => {
                  const x = Math.floor(index / gameState.difficulty);
                  const y = index % gameState.difficulty;
                  
                  return (
                    <div
                      key={`cell-${x}-${y}`}
                      className="aspect-square bg-gray-100 rounded-lg relative"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => !gameState.isCompleted && handleDrop(x, y)}
                    >
                      {pieces.map(piece => {
                        if (piece.current.x === x && piece.current.y === y) {
                          const player = players[piece.lastModifiedBy];
                          return (
                            <div
                              key={piece.id}
                              draggable={!gameState.isCompleted}
                              className={`absolute inset-0 rounded-lg cursor-move bg-cover
                                ${piece.isPlaced ? 'ring-2 ring-green-500' : ''}
                                ${ui.selectedPiece?.id === piece.id ? 'ring-2 ring-blue-500' : ''}
                                ${gameState.isCompleted ? 'cursor-default' : ''}`}
                              style={{
                                backgroundImage: `url(${gameState.imageUrl})`,
                                backgroundSize: `${ui.gridDimensions.width}px ${ui.gridDimensions.height}px`,
                                backgroundPosition: `-${piece.correct.y * ui.cellDimensions.width}px -${piece.correct.x * ui.cellDimensions.height}px`,
                                transform: `rotate(${piece.rotation}deg)`,
                                boxShadow: player ? `0 0 0 2px ${player.color}` : 'none'
                              }}
                              onDragStart={() => !gameState.isCompleted && setUi(prev => ({ 
                                ...prev, 
                                draggedPiece: piece 
                              }))}
                              onClick={() => !gameState.isCompleted && setUi(prev => ({
                                ...prev,
                                selectedPiece: prev.selectedPiece?.id === piece.id ? null : piece
                              }))}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 space-y-4">
                <div className="flex gap-4 text-sm">
                  <div>Total Pieces: {pieces.length}</div>
                  <div>Correctly Placed: {pieces.filter(p => p.isPlaced).length}</div>
                  <div>Remaining: {pieces.length - pieces.filter(p => p.isPlaced).length}</div>
                  <div>Completion: {calculateCompletionPercentage().toFixed(1)}%</div>
                </div>
                <div className="h-32">
                  <Bar
                    data={{
                      labels: ['Progress'],
                      datasets: [{
                        label: 'Completion Percentage',
                        data: [calculateCompletionPercentage()],
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                      }]
                    }}
                    options={{
                      scales: {
                        y: {
                          beginAtZero: true,
                          max: 100
                        }
                      },
                      maintainAspectRatio: false
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {ui.showPlayers && (
          <div className="w-64 bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-4">Players</h3>
            <div className="space-y-2">
              {Object.values(players).map(player => (
                <div 
                  key={player.id}
                  className="flex items-center gap-2 p-2 bg-white rounded"
                >
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="flex-1 truncate">
                    {player.name}
                    {player.id === userId && ' (You)'}
                  </span>
                  <span className="font-medium">{player.score || 0}</span>
                  {player.isHost && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Host
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {winner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">🎉 Puzzle Completed!</h3>
            <p className="text-lg mb-4">
              Winner: <span className="font-bold">{winner.name}</span>
            </p>
            <p className="mb-4">Score: {winner.score}</p>
            <p className="mb-4">
              Time: {Math.floor(gameState.timer / 60)}:{String(gameState.timer % 60).padStart(2, '0')}
            </p>
            <button
              onClick={() => setWinner(null)}
              className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Share Your Achievement</h3>
            <div className="space-y-4">
              {['Facebook', 'Twitter', 'WhatsApp'].map(platform => (
                <button
                  key={platform}
                  onClick={() => {
                    const url = encodeURIComponent(window.location.href);
                    const text = encodeURIComponent(
                      `I just completed a ${gameState.difficulty}x${gameState.difficulty} puzzle in ` +
                      `${Math.floor(gameState.timer / 60)}:${String(gameState.timer % 60).padStart(2, '0')}! Try it yourself!`
                    );
                    const shareUrls = {
                      Facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`,
                      Twitter: `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
                      WhatsApp: `https://wa.me/?text=${text}%20${url}`
                    };
                    window.open(shareUrls[platform], '_blank');
                  }}
                  className={`w-full p-3 text-white rounded hover:opacity-90 ${
                    platform === 'Facebook' ? 'bg-blue-600' :
                    platform === 'Twitter' ? 'bg-sky-400' :
                    'bg-green-500'
                  }`}
                >
                  Share on {platform}
                </button>
              ))}
              <button
                onClick={async () => {
                  const canvas = await html2canvas(puzzleContainerRef.current);
                  const link = document.createElement('a');
                  link.download = `puzzle-${gameState.gameId}.png`;
                  link.href = canvas.toDataURL('image/png');
                  link.click();
                }}
                className="w-full p-3 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" /> Download Image
              </button>
            </div>
            <button
              onClick={() => setShowShareModal(false)}
              className="mt-4 w-full p-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiplayerPuzzle;