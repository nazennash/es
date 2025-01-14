import React, { useState, useEffect } from 'react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update, get } from 'firebase/database';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Share2, Play, Users } from 'lucide-react';

const MultiplayerPuzzle = () => {
  const [gameState, setGameState] = useState({
    gameId: window.location.pathname.split('/').pop() || `game-${Date.now()}`,
    imageUrl: '',
    isHost: false,
    difficulty: 3,
    timer: 0,
    imageSize: { width: 0, height: 0 }
  });

  const [pieces, setPieces] = useState([]);
  const [players, setPlayers] = useState({});
  const [isGameStarted, setIsGameStarted] = useState(false);
  
  const [ui, setUi] = useState({
    zoom: 1,
    selectedPiece: null,
    draggedPiece: null,
    error: null,
    showPlayers: true,
    loading: true
  });

  const storage = getStorage();
  const database = getDatabase();
  const user = { 
    id: localStorage.getItem('userId') || `user-${Date.now()}`, 
    name: localStorage.getItem('userName') || `Player ${Math.floor(Math.random() * 1000)}` 
  };

  // Save user info to localStorage
  useEffect(() => {
    if (!localStorage.getItem('userId')) {
      localStorage.setItem('userId', user.id);
      localStorage.setItem('userName', user.name);
    }
  }, []);

  // Initialize game and set up listeners
  useEffect(() => {
    const gameRef = dbRef(database, `games/${gameState.gameId}`);
    
    // First check if game exists
    get(gameRef).then((snapshot) => {
      const data = snapshot.val();
      if (!data) {
        // New game - set up initial state
        set(gameRef, {
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
        setGameState(prev => ({ ...prev, isHost: true }));
      } else {
        // Join existing game
        if (!data.players[user.id]) {
          const playerUpdate = {
            [`players/${user.id}`]: {
              id: user.id,
              name: user.name,
              score: 0,
              color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
              isHost: false
            }
          };
          update(gameRef, playerUpdate);
        }
      }
      setUi(prev => ({ ...prev, loading: false }));
    });

    // Set up real-time listeners
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameState(prev => ({
          ...prev,
          imageUrl: data.imageUrl || '',
          difficulty: data.difficulty || 3,
          timer: data.timer || 0
        }));
        setPlayers(data.players || {});
        setPieces(data.pieces || []);
        setIsGameStarted(data.isGameStarted || false);
      }
    });

    // Cleanup
    return () => {
      unsubscribe();
      // Remove player when they leave
      const updates = {};
      updates[`games/${gameState.gameId}/players/${user.id}`] = null;
      update(dbRef(database), updates);
    };
  }, [gameState.gameId]);

  const handleImageUpload = async (event) => {
    if (!gameState.isHost) return;
    
    const file = event.target.files[0];
    if (!file) return;

    try {
      setUi(prev => ({ ...prev, loading: true }));
      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      const img = new Image();
      img.onload = () => {
        const updates = {
          [`games/${gameState.gameId}/imageUrl`]: url,
          [`games/${gameState.gameId}/imageSize`]: {
            width: img.width,
            height: img.height
          }
        };
        update(dbRef(database), updates);
        setUi(prev => ({ ...prev, loading: false }));
      };
      img.src = url;
    } catch (err) {
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to upload image' },
        loading: false
      }));
    }
  };

  const initializePuzzle = () => {
    if (!gameState.imageUrl || !gameState.isHost) return;

    const newPieces = [];
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
          isPlaced: false
        });
      }
    }

    const updates = {
      [`games/${gameState.gameId}/pieces`]: newPieces,
      [`games/${gameState.gameId}/isGameStarted`]: true,
      [`games/${gameState.gameId}/timer`]: 0
    };
    update(dbRef(database), updates);
  };

  const handleDrop = (x, y) => {
    if (!ui.draggedPiece) return;

    const updatedPieces = pieces.map(p => {
      if (p.id === ui.draggedPiece.id) {
        const isCorrect = x === p.correct.x && 
                         y === p.correct.y && 
                         p.rotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          const updates = {};
          updates[`games/${gameState.gameId}/players/${user.id}/score`] = 
            (players[user.id]?.score || 0) + 1;
          update(dbRef(database), updates);
        }
        
        return { ...p, current: { x, y }, isPlaced: isCorrect };
      }
      return p;
    });

    const updates = {};
    updates[`games/${gameState.gameId}/pieces`] = updatedPieces;
    update(dbRef(database), updates);
    setUi(prev => ({ ...prev, draggedPiece: null }));
  };

  const handleRotate = (direction) => {
    if (!ui.selectedPiece) return;

    const updatedPieces = pieces.map(p => {
      if (p.id === ui.selectedPiece.id) {
        const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
        const isCorrect = p.correct.x === p.current.x && 
                         p.correct.y === p.current.y && 
                         newRotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          const updates = {};
          updates[`games/${gameState.gameId}/players/${user.id}/score`] = 
            (players[user.id]?.score || 0) + 1;
          update(dbRef(database), updates);
        }
        
        return { ...p, rotation: newRotation, isPlaced: isCorrect };
      }
      return p;
    });

    const updates = {};
    updates[`games/${gameState.gameId}/pieces`] = updatedPieces;
    update(dbRef(database), updates);
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

  if (ui.loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

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
            onClick={() => setUi(prev => ({ ...prev, showPlayers: !prev.showPlayers }))}
            className="p-2 border rounded hover:bg-gray-100"
          >
            <Users className="h-4 w-4" />
          </button>
          <button
            onClick={copyGameLink}
            className="p-2 border rounded hover:bg-gray-100"
          >
            <Share2 className="h-4 w-4" />
          </button>
          {gameState.isHost && !isGameStarted && (
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
                    {pieces.map(piece => {
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
                              backgroundSize: `${gameState.difficulty * 100}%`,
                              backgroundPosition: `${-piece.correct.y * 100}% ${-piece.correct.x * 100}%`,
                              transform: `rotate(${piece.rotation}deg)`
                            }}
                            onDragStart={() => setUi(prev => ({ ...prev, draggedPiece: piece }))}
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
              {Object.values(players).map(player => (
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