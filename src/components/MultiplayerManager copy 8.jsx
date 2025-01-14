import React, { useState, useEffect } from 'react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update } from 'firebase/database';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Share2, Play, Users } from 'lucide-react';

const MultiplayerPuzzle = () => {
  const [gameState, setGameState] = useState({
    gameId: `game-${Date.now()}`,
    imageUrl: '',
    isHost: false,
    players: {},
    pieces: [],
    isGameStarted: false,
    difficulty: 3,
    timer: 0,
    imageSize: { width: 0, height: 0 }
  });

  const [ui, setUi] = useState({
    zoom: 1,
    selectedPiece: null,
    draggedPiece: null,
    error: null,
    showPlayers: false
  });

  const storage = getStorage();
  const database = getDatabase();
  const user = { id: `user-${Date.now()}`, name: `Player ${Math.floor(Math.random() * 1000)}` };

  useEffect(() => {
    const gameRef = dbRef(database, `games/${gameState.gameId}`);
    
    onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setGameState(prev => ({
          ...prev,
          isHost: true
        }));
        initializeGame();
      } else {
        setGameState(prev => ({
          ...prev,
          imageUrl: data.imageUrl || '',
          players: data.players || {},
          pieces: data.pieces || [],
          isGameStarted: data.isGameStarted || false,
          timer: data.timer || 0
        }));
      }
    });

    // Join game as player
    update(dbRef(database, `games/${gameState.gameId}/players/${user.id}`), {
      id: user.id,
      name: user.name,
      score: 0,
      color: `#${Math.floor(Math.random()*16777215).toString(16)}`
    });

    // Cleanup on disconnect
    return () => {
      update(dbRef(database, `games/${gameState.gameId}/players/${user.id}`), null);
    };
  }, [gameState.gameId]);

  const initializeGame = () => {
    set(dbRef(database, `games/${gameState.gameId}`), {
      players: {
        [user.id]: {
          id: user.id,
          name: user.name,
          score: 0,
          color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
          isHost: true
        }
      },
      imageUrl: '',
      isGameStarted: false,
      timer: 0,
      difficulty: gameState.difficulty
    });
  };

  const handleImageUpload = async (event) => {
    if (!gameState.isHost) return;
    
    const file = event.target.files[0];
    if (!file) return;

    try {
      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      const img = new Image();
      img.onload = () => {
        setGameState(prev => ({
          ...prev,
          imageSize: { width: img.width, height: img.height }
        }));
      };
      img.src = url;
      
      update(dbRef(database, `games/${gameState.gameId}`), {
        imageUrl: url
      });
    } catch (err) {
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to upload image' }
      }));
    }
  };

  const initializePuzzle = () => {
    if (!gameState.imageUrl || !gameState.isHost) return;

    const newPieces = [];
    const { width, height } = gameState.imageSize;
    const pieceWidth = width / gameState.difficulty;
    const pieceHeight = height / gameState.difficulty;

    for (let i = 0; i < gameState.difficulty; i++) {
      for (let j = 0; j < gameState.difficulty; j++) {
        newPieces.push({
          id: `piece-${i}-${j}`,
          correct: { x: i, y: j },
          current: { 
            x: Math.floor(Math.random() * gameState.difficulty), 
            y: Math.floor(Math.random() * gameState.difficulty) 
          },
          rotation: Math.floor(Math.random() * 4) * 90,
          isPlaced: false,
          dimensions: {
            width: pieceWidth,
            height: pieceHeight,
            offsetX: i * pieceWidth,
            offsetY: j * pieceHeight
          }
        });
      }
    }

    update(dbRef(database, `games/${gameState.gameId}`), {
      pieces: newPieces,
      isGameStarted: true,
      timer: 0
    });
  };

  const handleDragStart = (piece) => {
    setUi(prev => ({
      ...prev,
      draggedPiece: piece,
      selectedPiece: piece
    }));
  };

  const handleDrop = (x, y) => {
    if (!ui.draggedPiece) return;

    const updatedPieces = gameState.pieces.map(p => {
      if (p.id === ui.draggedPiece.id) {
        const isCorrect = x === p.correct.x && 
                         y === p.correct.y && 
                         p.rotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          update(dbRef(database, `games/${gameState.gameId}/players/${user.id}`), {
            score: (gameState.players[user.id]?.score || 0) + 1
          });
        }
        
        return { ...p, current: { x, y }, isPlaced: isCorrect };
      }
      return p;
    });

    update(dbRef(database, `games/${gameState.gameId}`), {
      pieces: updatedPieces
    });

    setUi(prev => ({ ...prev, draggedPiece: null }));
  };

  const handleRotate = (direction) => {
    if (!ui.selectedPiece) return;

    const updatedPieces = gameState.pieces.map(p => {
      if (p.id === ui.selectedPiece.id) {
        const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
        const isCorrect = p.correct.x === p.current.x && 
                         p.correct.y === p.current.y && 
                         newRotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          update(dbRef(database, `games/${gameState.gameId}/players/${user.id}`), {
            score: (gameState.players[user.id]?.score || 0) + 1
          });
        }
        
        return { ...p, rotation: newRotation, isPlaced: isCorrect };
      }
      return p;
    });

    update(dbRef(database, `games/${gameState.gameId}`), {
      pieces: updatedPieces
    });
  };

  const copyGameLink = async () => {
    const link = `${window.location.origin}/puzzle/multiplayer/${gameState.gameId}`;
    try {
      await navigator.clipboard.writeText(link);
      setUi(prev => ({
        ...prev,
        error: { type: 'success', message: 'Game link copied! Share with friends to play.' }
      }));
    } catch (err) {
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to copy game link' }
      }));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-lg shadow-lg max-w-6xl mx-auto">
      <div className="flex items-center justify-between border-b pb-4">
        <h1 className="text-2xl font-bold">Multiplayer Puzzle</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setUi(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.1, 0.5) }))}
            className="p-2 border rounded hover:bg-gray-100"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={() => setUi(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.1, 2) }))}
            className="p-2 border rounded hover:bg-gray-100"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={copyGameLink}
            className="p-2 border rounded hover:bg-gray-100"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setUi(prev => ({ ...prev, showPlayers: !prev.showPlayers }))}
            className="p-2 border rounded hover:bg-gray-100"
          >
            <Users className="h-4 w-4" />
          </button>
          {gameState.isHost && !gameState.isGameStarted && (
            <button
              onClick={initializePuzzle}
              className="p-2 border rounded hover:bg-gray-100"
              disabled={!gameState.imageUrl}
            >
              <Play className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {ui.error && (
        <div className={`p-3 rounded ${
          ui.error.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {ui.error.message}
        </div>
      )}

      <div className="flex gap-4">
        <div className="flex-1">
          {gameState.isHost && !gameState.imageUrl ? (
            <div className="w-full p-8 border-2 border-dashed rounded-lg text-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full"
              />
              <p className="mt-2 text-sm text-gray-500">Upload an image to start the game</p>
            </div>
          ) : (
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
                    onDrop={() => handleDrop(x, y)}
                  >
                    {gameState.pieces.map(piece => {
                      if (piece.current.x === x && piece.current.y === y) {
                        return (
                          <div
                            key={piece.id}
                            draggable
                            className={`absolute inset-0 rounded-lg cursor-move bg-cover
                              ${piece.isPlaced ? 'ring-2 ring-green-500' : ''}
                              ${ui.selectedPiece?.id === piece.id ? 'ring-2 ring-blue-500' : ''}`}
                            style={{
                              backgroundImage: `url(${gameState.imageUrl})`,
                              backgroundPosition: `-${piece.dimensions.offsetX}px -${piece.dimensions.offsetY}px`,
                              backgroundSize: `${gameState.imageSize.width}px ${gameState.imageSize.height}px`,
                              transform: `rotate(${piece.rotation}deg)`
                            }}
                            onDragStart={() => handleDragStart(piece)}
                            onClick={() => setUi(prev => ({
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
          )}
        </div>

        {ui.showPlayers && (
          <div className="w-64 bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-4">Players</h3>
            <div className="space-y-2">
              {Object.values(gameState.players).map(player => (
                <div 
                  key={player.id}
                  className="flex items-center gap-2 p-2 bg-white rounded"
                >
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: player.color }}
                  />
                  <span>{player.name}</span>
                  <span className="ml-auto">{player.score || 0}</span>
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
    </div>
  );
};

export default MultiplayerPuzzle;