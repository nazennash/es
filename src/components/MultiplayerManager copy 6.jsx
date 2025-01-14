import React, { useState, useEffect } from 'react';
import { getDatabase, ref, set, onValue, update } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase';

const MultiplayerManager = ({ puzzleId, isHost = false, isMultiPlayer = true, imageUrl }) => {
  const [user, setUser] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [players, setPlayers] = useState([]);
  const [difficulty, setDifficulty] = useState(3);
  const [timer, setTimer] = useState(0);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [draggedPiece, setDraggedPiece] = useState(null);

  const database = getDatabase();

  // Initialize user authentication
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser({
          id: user.uid,
          name: user.displayName || `Player ${user.uid.slice(0, 4)}`,
          email: user.email
        });
      } else if (isMultiPlayer) {
        // Fall back to anonymous auth for multiplayer
        signInAnonymously(auth)
          .then((userCred) => {
            setUser({
              id: userCred.user.uid,
              name: `Guest ${userCred.user.uid.slice(0, 4)}`
            });
          })
          .catch((error) => {
            setError({ type: 'error', message: 'Authentication failed' });
          });
      }
    });

    return () => unsubscribe();
  }, [isMultiPlayer]);

  // Game state listener
  useEffect(() => {
    if (!puzzleId || !user) return;

    const gameRef = ref(database, `games/${puzzleId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        if (isHost) {
          initializeGame();
        }
        return;
      }

      setGameState(data);
      setPieces(data.pieces || []);
      setPlayers(Object.values(data.players || {}));
      setTimer(data.timer || 0);
      setIsGameStarted(data.isGameStarted || false);
    });

    return () => unsubscribe();
  }, [puzzleId, user, isHost, database]);

  // Timer management
  useEffect(() => {
    if (isGameStarted) {
      const interval = setInterval(() => {
        update(ref(database, `games/${puzzleId}`), {
          timer: timer + 1
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isGameStarted, timer, puzzleId, database]);

  const initializeGame = () => {
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

    set(ref(database, `games/${puzzleId}`), {
      pieces: newPieces,
      players: {
        [user.id]: {
          id: user.id,
          name: user.name,
          color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
          score: 0,
          isHost
        }
      },
      imageUrl,
      difficulty,
      timer: 0,
      isGameStarted: true
    });
  };

  const handlePieceDrop = (e, targetX, targetY) => {
    e.preventDefault();
    if (!draggedPiece || !puzzleId) return;

    const updatedPieces = pieces.map(p => {
      if (p.id === draggedPiece.id) {
        const isCorrect = targetX === p.correct.x && 
                         targetY === p.correct.y && 
                         p.rotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          update(ref(database, `games/${puzzleId}/players/${user.id}`), {
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

    update(ref(database, `games/${puzzleId}`), {
      pieces: updatedPieces
    });
  };

  const handleRotate = (direction) => {
    if (!selectedPiece || !puzzleId) return;

    const updatedPieces = pieces.map(p => {
      if (p.id === selectedPiece.id) {
        const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
        const isCorrect = p.correct.x === p.current.x && 
                         p.correct.y === p.current.y && 
                         newRotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          update(ref(database, `games/${puzzleId}/players/${user.id}`), {
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

    update(ref(database, `games/${puzzleId}`), {
      pieces: updatedPieces
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Game Controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            {isGameStarted && (
              <div className="font-mono">
                ⏱️ {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Game Area */}
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
    </div>
  );
};

export default MultiplayerManager;