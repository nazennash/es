import React, { useState, useEffect } from 'react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update } from 'firebase/database';
import { useNavigate, useParams } from 'react-router-dom';

const MultiplayerPuzzle = ({ 
  user = { id: 'demo-user', name: 'Demo Player' },
  isHost = false,
}) => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [gameId] = useState(sessionId || `game-${Date.now()}`);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [error, setError] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [difficulty] = useState(3);
  const [timer, setTimer] = useState(0);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [players, setPlayers] = useState([]);

  const storage = getStorage();
  const database = getDatabase();

  useEffect(() => {
    if (!gameId) return;

    const gameRef = dbRef(database, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data && isHost) {
        // Initialize new game if host
        set(gameRef, {
          players: {
            [user.id]: {
              id: user.id,
              name: user.name,
              color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
              score: 0,
              isHost
            }
          },
          timer: 0,
          isGameStarted: false
        });
      } else if (data) {
        // Join existing game
        if (!data.players[user.id]) {
          update(dbRef(database, `games/${gameId}/players/${user.id}`), {
            id: user.id,
            name: user.name,
            color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
            score: 0,
            isHost: false
          });
        }
        
        setImageUrl(data.imageUrl || '');
        setPieces(data.pieces || []);
        setPlayers(Object.values(data.players || {}));
        setTimer(data.timer || 0);
        setIsGameStarted(data.isGameStarted || false);
      }
    });

    return () => unsubscribe();
  }, [gameId, database, user, isHost]);

  useEffect(() => {
    if (isGameStarted) {
      const interval = setInterval(() => {
        update(dbRef(database, `games/${gameId}`), {
          timer: timer + 1
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isGameStarted, timer, gameId, database]);

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const imageRef = storageRef(storage, `puzzle-images/${gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      setImageUrl(url);
      setUploadedImage(file.name);
      
      if (gameId) {
        update(dbRef(database, `games/${gameId}`), {
          imageUrl: url
        });
      }
    } catch (err) {
      setError({ type: 'error', message: 'Failed to upload image' });
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const copyGameLink = async () => {
    const link = `${window.location.origin}/puzzle/multiplayer/${gameId}`;
    try {
      await navigator.clipboard.writeText(link);
      setError({ type: 'success', message: 'Game link copied! Share with friends to play together.' });
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      setError({ type: 'error', message: 'Failed to copy game link' });
    }
  };

  const initializePuzzle = () => {
    if (!imageUrl) {
      setError({ type: 'error', message: 'Please upload an image first' });
      return;
    }

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

    update(dbRef(database, `games/${gameId}`), {
      pieces: newPieces,
      isGameStarted: true,
      timer: 0
    });
  };

  const handleDragStart = (e, piece) => {
    setDraggedPiece(piece);
    setSelectedPiece(piece);
    update(dbRef(database, `games/${gameId}/pieces`), pieces.map(p => ({
      ...p,
      zIndex: p.id === piece.id ? 100 : p.zIndex
    })));
  };

  const handleDragEnd = () => {
    setDraggedPiece(null);
    update(dbRef(database, `games/${gameId}/pieces`), pieces.map(p => ({
      ...p,
      zIndex: 1
    })));
  };

  const handleDrop = (e, targetX, targetY) => {
    e.preventDefault();
    if (!draggedPiece) return;

    const updatedPieces = pieces.map(p => {
      if (p.id === draggedPiece.id) {
        const isCorrect = targetX === p.correct.x && 
                         targetY === p.correct.y && 
                         p.rotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          update(dbRef(database, `games/${gameId}/players/${user.id}`), {
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

    update(dbRef(database, `games/${gameId}`), {
      pieces: updatedPieces
    });
  };

  const handleRotate = (direction) => {
    if (!selectedPiece) return;
    
    const updatedPieces = pieces.map(p => {
      if (p.id === selectedPiece.id) {
        const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
        const isCorrect = p.correct.x === p.current.x && 
                         p.correct.y === p.current.y && 
                         newRotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          update(dbRef(database, `games/${gameId}/players/${user.id}`), {
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

    update(dbRef(database, `games/${gameId}/pieces`), updatedPieces);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-50">
      {/* Image Upload */}
      {/* {isHost && !imageUrl && ( */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-8 h-8 mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mb-2 text-sm text-gray-500">Click to upload puzzle image</p>
              </div>
              <input 
                type="file" 
                className="hidden" 
                accept="image/*"
                onChange={handleImageUpload}
              />
            </label>
          </div>
        </div>
      {/* )} */}

    {/* retrive image url after upload */}
      <p>{imageUrl}</p>

      {/* Game Header */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">Multiplayer Puzzle</h2>
            {isGameStarted && (
              <div className="font-mono">⏱️ {formatTime(timer)}</div>
            )}
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={copyGameLink}
              className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
            >
              🔗 Share Game
            </button>
            {isHost && imageUrl && !isGameStarted && (
              <button
                onClick={initializePuzzle}
                className="px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
              >
                🎮 Start Game
              </button>
            )}
            <button
              onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))}
              className="p-2 rounded-full hover:bg-gray-100"
              title="Zoom Out"
            >
              ➖
            </button>
            <button
              onClick={() => setZoom(z => Math.min(z + 0.1, 2))}
              className="p-2 rounded-full hover:bg-gray-100"
              title="Zoom In"
            >
              ➕
            </button>
            <button
              onClick={() => handleRotate('left')}
              className="p-2 rounded-full hover:bg-gray-100"
              disabled={!selectedPiece}
              title="Rotate Left"
            >
              ↪️
            </button>
            <button
              onClick={() => handleRotate('right')}
              className="p-2 rounded-full hover:bg-gray-100"
              disabled={!selectedPiece}
              title="Rotate Right"
            >
              ↩️
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className={`p-4 rounded-lg ${
          error.type === 'error' 
            ? 'bg-red-50 text-red-600' 
            : 'bg-green-50 text-green-600'
        }`}>
          {error.message}
        </div>
      )}

      {/* Game Content */}
      <div className="flex gap-4">
        {/* Puzzle Grid */}
        <div className="flex-1 bg-white rounded-lg shadow p-4">
          <div 
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${difficulty}, 1fr)`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              transition: 'transform 0.2s'
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
                  onDrop={(e) => handleDrop(e, x, y)}
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
                            backgroundImage: `url(${imageUrl || '/api/placeholder/400/400'})`,
                            backgroundPosition: piece.backgroundPosition,
                            backgroundSize: `${difficulty * 100}%`
                          }}
                          onDragStart={(e) => handleDragStart(e, piece)}
                          onDragEnd={handleDragEnd}
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
            <div className="flex items-center gap-2">
              👥 <h3 className="font-semibold">Players ({players.length})</h3>
            </div>
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

export default MultiplayerPuzzle;