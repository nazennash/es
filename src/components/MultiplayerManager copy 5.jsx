import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, set, onValue, update } from 'firebase/database';
import { Select } from '@/components/ui/select';

// Initialize Firebase (replace with your config)
const firebaseConfig = {
  // Add your Firebase config here
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

const MultiplayerPuzzle = () => {
  const [user, setUser] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [imageUrl, setImageUrl] = useState('/api/placeholder/600/600');
  const [difficulty, setDifficulty] = useState(3);
  const [pieces, setPieces] = useState([]);
  const [players, setPlayers] = useState([]);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [timer, setTimer] = useState(0);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [error, setError] = useState(null);

  // Anonymous Authentication
  useEffect(() => {
    signInAnonymously(auth)
      .then((userCred) => {
        setUser({
          id: userCred.user.uid,
          name: `Player ${userCred.user.uid.slice(0, 4)}`
        });
      })
      .catch((error) => {
        setError({ type: 'error', message: 'Authentication failed' });
      });
  }, []);

  // Game Setup
  useEffect(() => {
    if (!gameId) return;

    const gameRef = ref(database, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      setPieces(data.pieces || []);
      setPlayers(Object.values(data.players || {}));
      setTimer(data.timer || 0);
      setImageUrl(data.imageUrl || '/api/placeholder/600/600');
      setIsGameStarted(data.isGameStarted || false);
    });
  }, [gameId]);

  // Timer
  useEffect(() => {
    if (isGameStarted) {
      const interval = setInterval(() => {
        if (gameId) {
          update(ref(database, `games/${gameId}`), {
            timer: timer + 1
          });
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isGameStarted, timer, gameId]);

  const initializeGame = (newGameId = `game-${Date.now()}`) => {
    setGameId(newGameId);
    const gridSize = difficulty;
    const newPieces = [];

    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        newPieces.push({
          id: `piece-${i}-${j}`,
          correct: { x: i, y: j },
          current: { 
            x: Math.floor(Math.random() * gridSize), 
            y: Math.floor(Math.random() * gridSize) 
          },
          rotation: Math.floor(Math.random() * 4) * 90,
          isPlaced: false,
          zIndex: 1,
          backgroundPosition: `${-100 * j}% ${-100 * i}%`
        });
      }
    }

    set(ref(database, `games/${newGameId}`), {
      pieces: newPieces,
      players: {
        [user.id]: {
          id: user.id,
          name: user.name,
          color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
          score: 0,
          isHost: true
        }
      },
      imageUrl,
      difficulty,
      timer: 0,
      isGameStarted: true
    });
  };

  const joinGame = (joinGameId) => {
    if (!user) return;

    update(ref(database, `games/${joinGameId}/players/${user.id}`), {
      id: user.id,
      name: user.name,
      color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
      score: 0,
      isHost: false
    });

    setGameId(joinGameId);
  };

  const handlePieceDrop = (e, targetX, targetY) => {
    e.preventDefault();
    if (!draggedPiece || !gameId) return;

    const updatedPieces = pieces.map(p => {
      if (p.id === draggedPiece.id) {
        const isCorrect = targetX === p.correct.x && 
                         targetY === p.correct.y && 
                         p.rotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          update(ref(database, `games/${gameId}/players/${user.id}`), {
            score: (players.find(player => player.id === user.id)?.score || 0) + 1
          });
        }
        
        return {
          ...p,
          current: { x: targetX, y: targetY },
          isPlaced: isCorrect,
          zIndex: 1
        };
      }
      return p;
    });

    update(ref(database, `games/${gameId}`), {
      pieces: updatedPieces
    });
  };

  const handleRotate = (direction) => {
    if (!selectedPiece || !gameId) return;

    const updatedPieces = pieces.map(p => {
      if (p.id === selectedPiece.id) {
        const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
        const isCorrect = p.correct.x === p.current.x && 
                         p.correct.y === p.current.y && 
                         newRotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          update(ref(database, `games/${gameId}/players/${user.id}`), {
            score: (players.find(player => player.id === user.id)?.score || 0) + 1
          });
        }
        
        return {
          ...p,
          rotation: newRotation,
          isPlaced: isCorrect
        };
      }
      return p;
    });

    update(ref(database, `games/${gameId}`), {
      pieces: updatedPieces
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-50 min-h-screen">
      {/* Game Header */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Multiplayer Puzzle</h1>
            {isGameStarted && (
              <div className="font-mono">
                ⏱️ {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
              </div>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {!gameId && (
              <div className="flex items-center gap-2">
                <Select
                  value={difficulty}
                  onValueChange={(value) => setDifficulty(parseInt(value))}
                  className="w-24"
                >
                  {[2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n}x{n}</option>
                  ))}
                </Select>
                <button
                  onClick={() => initializeGame()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Start New Game
                </button>
              </div>
            )}
            
            {gameId && (
              <>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(gameId);
                    setError({ type: 'success', message: 'Game ID copied!' });
                    setTimeout(() => setError(null), 3000);
                  }}
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                >
                  🔗 Share Game ID
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))}
                    className="p-2 rounded-full hover:bg-gray-100"
                  >
                    ➖
                  </button>
                  <button
                    onClick={() => setZoom(z => Math.min(z + 0.1, 2))}
                    className="p-2 rounded-full hover:bg-gray-100"
                  >
                    ➕
                  </button>
                  <button
                    onClick={() => handleRotate('left')}
                    className="p-2 rounded-full hover:bg-gray-100"
                    disabled={!selectedPiece}
                  >
                    ↪️
                  </button>
                  <button
                    onClick={() => handleRotate('right')}
                    className="p-2 rounded-full hover:bg-gray-100"
                    disabled={!selectedPiece}
                  >
                    ↩️
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className={`p-4 rounded-lg ${
          error.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
        }`}>
          {error.message}
        </div>
      )}

      {!gameId && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Join Existing Game</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter Game ID"
              className="px-4 py-2 border rounded-lg flex-1"
              onChange={(e) => setGameId(e.target.value)}
            />
            <button
              onClick={() => joinGame(gameId)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Join Game
            </button>
          </div>
        </div>
      )}

      {gameId && (
        <div className="flex gap-4">
          {/* Puzzle Grid */}
          <div className="flex-1 bg-white rounded-lg shadow p-4">
            <div 
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${difficulty}, 1fr)`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left'
              }}
            >
              {Array.from({ length: difficulty * difficulty }).map((_, index) => {
                const x = Math.floor(index / difficulty);
                const y = index % difficulty;
                return (
                  <div
                    key={`cell-${x}-${y}`}
                    className="aspect-square bg-gray-100 rounded-lg relative"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handlePieceDrop(e, x, y)}
                  >
                    {pieces.map(piece => {
                      if (piece.current.x === x && piece.current.y === y) {
                        return (
                          <div
                            key={piece.id}
                            draggable
                            className={`absolute inset-0 rounded-lg cursor-move bg-cover
                              ${piece.isPlaced ? 'ring-2 ring-green-500' : ''}
                              ${selectedPiece?.id === piece.id ? 'ring-2 ring-blue-500' : ''}`}
                            style={{
                              transform: `rotate(${piece.rotation}deg)`,
                              zIndex: piece.zIndex,
                              backgroundImage: `url(${imageUrl})`,
                              backgroundPosition: piece.backgroundPosition,
                              backgroundSize: `${difficulty * 100}%`
                            }}
                            onDragStart={(e) => setDraggedPiece(piece)}
                            onDragEnd={() => setDraggedPiece(null)}
                            onClick={() => setSelectedPiece(
                              selectedPiece?.id === piece.id ? null : piece
                            )}
                          />
                        );
                      }
                      return null;
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Players List */}
          <div className="w-72 bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h3 className="font-semibold">👥 Players ({players.length})</h3>
            </div>
            <div className="p-4">
              <div className="space-y-2">
                {players.map(player => (
                  <div 
                    key={player.id}
                    className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
                  >
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: player.color }}
                    />
                    <span>{player.name}</span>
                    <span className="text-sm text-gray-500 ml-auto">
                      {player.score} pieces
                    </span>
                    {player.isHost && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        Host
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiplayerPuzzle;