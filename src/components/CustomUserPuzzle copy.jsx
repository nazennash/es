import React, { useState, useEffect, useRef } from 'react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, update, get } from 'firebase/database';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Home } from 'lucide-react';
import { handlePuzzleCompletion, isPuzzleComplete } from './PuzzleCompletionHandler';

const CustomUserPuzzle = () => {
  const [gameState, setGameState] = useState({
    gameId: `game-${Date.now()}`,
    imageUrl: '',
    difficulty: 3,
    timer: 0,
    imageSize: { width: 0, height: 0 },
    startTime: null
  });

  const [pieces, setPieces] = useState([]);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [ui, setUi] = useState({
    zoom: 1,
    selectedPiece: null,
    draggedPiece: null,
    error: null,
    loading: true,
    gridDimensions: { width: 0, height: 0 },
    cellDimensions: { width: 0, height: 0 },
    imageUploading: false
  });

  const storage = getStorage();
  const database = getDatabase();
  const navigate = useNavigate();
  const timerRef = useRef(null);
  const gameRef = useRef(dbRef(database, `games/${gameState.gameId}`));

  // Initialize game and set up Firebase listeners
  useEffect(() => {
    const initializeGame = async () => {
      try {
        setUi(prev => ({ ...prev, loading: true }));
        
        // Check if game exists
        const snapshot = await get(gameRef.current);
        if (!snapshot.exists()) {
          await set(gameRef.current, {
            imageUrl: '',
            isGameStarted: false,
            timer: 0,
            difficulty: gameState.difficulty,
            startTime: null
          });
        } else {
          // Sync with existing game data
          const data = snapshot.val();
          setGameState(prev => ({
            ...prev,
            ...data
          }));
          if (data.pieces) setPieces(data.pieces);
          if (data.isGameStarted) setIsGameStarted(true);
        }
        
        // Set up real-time listeners
        const unsubscribe = gameRef.current.on('value', (snapshot) => {
          const data = snapshot.val();
          if (data) {
            setGameState(prev => ({ ...prev, ...data }));
            if (data.pieces) setPieces(data.pieces);
            if (data.isGameStarted !== isGameStarted) {
              setIsGameStarted(data.isGameStarted);
            }
          }
        });

        setUi(prev => ({ ...prev, loading: false }));
        
        // Cleanup
        return () => {
          unsubscribe();
          if (timerRef.current) clearInterval(timerRef.current);
        };
      } catch (err) {
        console.error('Failed to initialize game:', err);
        setUi(prev => ({
          ...prev,
          loading: false,
          error: { type: 'error', message: 'Failed to initialize game' }
        }));
      }
    };

    initializeGame();
  }, [gameState.gameId]);

  // Timer management
  useEffect(() => {
    if (isGameStarted && !gameState.startTime) {
      const startTime = Date.now();
      
      // Update both local state and Firebase
      setGameState(prev => ({ ...prev, startTime }));
      update(gameRef.current, { startTime });
      
      timerRef.current = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        setGameState(prev => {
          const newState = { ...prev, timer: elapsedSeconds };
          update(gameRef.current, { timer: elapsedSeconds });
          return newState;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isGameStarted, gameState.startTime]);

  // Puzzle completion check
  useEffect(() => {
    const checkCompletion = async () => {
      if (isGameStarted && pieces.length > 0 && isPuzzleComplete(pieces)) {
        try {
          const completionTime = Date.now() - gameState.startTime;
          await handlePuzzleCompletion({
            puzzleId: gameState.gameId,
            startTime: gameState.startTime,
            difficulty: gameState.difficulty,
            imageUrl: gameState.imageUrl,
            timer: completionTime / 1000
          });

          await update(gameRef.current, {
            isGameStarted: false,
            completionTime
          });

          setIsGameStarted(false);
          if (timerRef.current) clearInterval(timerRef.current);

          setUi(prev => ({
            ...prev,
            error: { type: 'success', message: 'Puzzle completed! Score recorded.' }
          }));
        } catch (err) {
          console.error('Failed to record completion:', err);
          setUi(prev => ({
            ...prev,
            error: { type: 'error', message: 'Failed to record puzzle completion' }
          }));
        }
      }
    };
    
    checkCompletion();
  }, [pieces, isGameStarted]);

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUi(prev => ({ ...prev, loading: true, error: null, imageUploading: true }));
      
      // Validate file size and type
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image must be smaller than 5MB');
      }
      
      if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
      }

      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      // Load image and get dimensions
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = async () => {
          try {
            await update(gameRef.current, {
              imageUrl: url,
              imageSize: {
                width: img.width,
                height: img.height
              }
            });
            
            setGameState(prev => ({
              ...prev,
              imageUrl: url,
              imageSize: { width: img.width, height: img.height }
            }));
            
            setUi(prev => ({ ...prev, loading: false, imageUploading: false }));
            resolve();
          } catch (err) {
            reject(new Error('Failed to update game with image information'));
          }
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
      });
    } catch (err) {
      console.error('Image upload error:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: err.message || 'Failed to upload image' },
        loading: false,
        imageUploading: false
      }));
    }
  };

  const initializePuzzle = async () => {
    if (!gameState.imageUrl) return;

    try {
      setUi(prev => ({ ...prev, loading: true, error: null }));
      
      // Create shuffled array of positions
      const positions = Array.from(
        { length: gameState.difficulty * gameState.difficulty },
        (_, i) => i
      );
      
      // Fisher-Yates shuffle
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      
      const newPieces = [];
      let posIndex = 0;
      
      for (let i = 0; i < gameState.difficulty; i++) {
        for (let j = 0; j < gameState.difficulty; j++) {
          const pos = positions[posIndex++];
          const currentX = Math.floor(pos / gameState.difficulty);
          const currentY = pos % gameState.difficulty;
          
          newPieces.push({
            id: `piece-${i}-${j}`,
            correct: { x: i, y: j },
            current: { x: currentX, y: currentY },
            rotation: Math.floor(Math.random() * 4) * 90,
            isPlaced: false
          });
        }
      }

      const updates = {
        pieces: newPieces,
        isGameStarted: true,
        startTime: Date.now(),
        timer: 0
      };
      
      await update(gameRef.current, updates);
      setPieces(newPieces);
      setIsGameStarted(true);
      setUi(prev => ({ ...prev, loading: false }));
    } catch (err) {
      console.error('Failed to initialize puzzle:', err);
      setUi(prev => ({
        ...prev,
        loading: false,
        error: { type: 'error', message: 'Failed to start game' }
      }));
    }
  };

  const handleDrop = async (x, y) => {
    if (!ui.draggedPiece) return;
    
    try {
      // Find piece at target position (if any)
      const targetPiece = pieces.find(p => p.current.x === x && p.current.y === y);
      
      const updatedPieces = pieces.map(p => {
        if (p.id === ui.draggedPiece.id) {
          const isCorrect = x === p.correct.x && 
                           y === p.correct.y && 
                           p.rotation % 360 === 0;
          return { ...p, current: { x, y }, isPlaced: isCorrect };
        }
        
        // If there was a piece at the target location, swap positions
        if (targetPiece && p.id === targetPiece.id) {
          return { 
            ...p, 
            current: { 
              x: ui.draggedPiece.current.x, 
              y: ui.draggedPiece.current.y 
            }
          };
        }
        
        return p;
      });

      await update(gameRef.current, { pieces: updatedPieces });
      setPieces(updatedPieces);
      setUi(prev => ({ ...prev, draggedPiece: null }));
    } catch (err) {
      console.error('Failed to update piece position:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to move piece' },
        draggedPiece: null
      }));
    }
  };

  const handleRotate = async (direction) => {
    if (!ui.selectedPiece) return;

    try {
      const updatedPieces = pieces.map(p => {
        if (p.id === ui.selectedPiece.id) {
          const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
          const isCorrect = p.correct.x === p.current.x && 
                           p.correct.y === p.current.y && 
                           newRotation % 360 === 0;
          
          return { ...p, rotation: newRotation, isPlaced: isCorrect };
        }
        return p;
      });

      await update(gameRef.current, { pieces: updatedPieces });
      setPieces(updatedPieces);
    } catch (err) {
      console.error('Failed to rotate piece:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to rotate piece' }
      }));
    }
  };

  const handleDifficultyChange = async (event) => {
    const newDifficulty = parseInt(event.target.value, 10);
    try {
      await update(gameRef.current, { difficulty: newDifficulty });
      setGameState(prev => ({ ...prev, difficulty: newDifficulty }));
      
      if (!isGameStarted) {
        await update(gameRef.current, { pieces: [] });
        setPieces([]);
      }
    } catch (err) {
      console.error('Failed to update difficulty:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to update difficulty' }
      }));
    }
  };

  if (ui.loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-lg shadow-lg max-w-6xl mx-auto">
      <div className="flex items-center justify-between border-b pb-4">
        <h1 className="text-2xl font-bold">Custom User Puzzle</h1>
        <div className="text-lg font-semibold">
          {`Time: ${String(Math.floor(gameState.timer / 60)).padStart(2, '0')}:${String(gameState.timer % 60).padStart(2, '0')}`}
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
            onClick={() => navigate('/')}
            className="p-2 border rounded hover:bg-red-50 text-red-600"
            title="Leave Session"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isGameStarted && (
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <label htmlFor="difficulty" className="font-medium">
            Puzzle Size: {gameState.difficulty}x{gameState.difficulty}
          </label>
          <input
            type="range"
            id="difficulty"
            min="2"
            max="8"
            value={gameState.difficulty}
            onChange={handleDifficultyChange}
            className="flex-1"
          />
          <span className="text-sm text-gray-600">
            ({gameState.difficulty * gameState.difficulty} pieces)
          </span>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => setUi(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.1, 0.5) }))}
          className="p-2 border rounded hover:bg-gray-100"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => setUi(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.1, 2) }))}
          className="p-2 border rounded hover:bg-gray-100"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        {ui.selectedPiece && (
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
        {!isGameStarted && (
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
            ui.error.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}
          role="alert"
        >
          {ui.error.message}
        </div>
      )}

      <div className="flex gap-4">
        <div className="flex-1">
          {!gameState.imageUrl ? (
            <div className="w-full p-8 border-2 border-dashed rounded-lg text-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full"
              />
              <p className="mt-2 text-sm text-gray-500">
                {ui.imageUploading ? 'Uploading image...' : 'Upload an image to start the game'}
              </p>
            </div>
          ) : (
            <>
              <div 
                className="grid gap-1 transition-transform duration-200"
                style={{
                  gridTemplateColumns: `repeat(${gameState.difficulty}, 1fr)`,
                  transform: `scale(${ui.zoom})`,
                  transformOrigin: 'top left'
                }}
                ref={(el) => {
                  if (el && (ui.gridDimensions.width !== el.offsetWidth || ui.gridDimensions.height !== el.offsetHeight)) {
                    setUi(prev => ({ ...prev, gridDimensions: { width: el.offsetWidth, height: el.offsetHeight } }));
                  }
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
                      ref={(el) => {
                        if (el && (ui.cellDimensions.width !== el.offsetWidth || ui.cellDimensions.height !== el.offsetHeight)) {
                          setUi(prev => ({
                            ...prev,
                            cellDimensions: { width: el.offsetWidth, height: el.offsetHeight }
                          }));
                        }
                      }}
                    >
                      {pieces.map(piece => {
                        if (piece.current.x === x && piece.current.y === y) {
                          const gridWidth = ui.gridDimensions?.width || 0;
                          const gridHeight = ui.gridDimensions?.height || 0;
                          const cellWidth = ui.cellDimensions?.width || 0;
                          const cellHeight = ui.cellDimensions?.height || 0;
                          const backgroundSize = `${gridWidth}px ${gridHeight}px`;
                          const backgroundPosition = `${-piece.correct.y * cellWidth}px ${-piece.correct.x * cellHeight}px`;

                          return (
                            <div
                              key={piece.id}
                              draggable
                              className={`absolute inset-0 rounded-lg cursor-move bg-cover
                                ${piece.isPlaced ? 'ring-2 ring-green-500' : ''}
                                ${ui.selectedPiece?.id === piece.id ? 'ring-2 ring-blue-500' : ''}`}
                              style={{
                                backgroundImage: `url(${gameState.imageUrl})`,
                                backgroundSize,
                                backgroundPosition,
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

              <div className="flex gap-4 text-sm mt-4">
                <div>Total Pieces: {pieces.length}</div>
                <div>Correctly Placed: {pieces.filter(p => p.isPlaced).length}</div>
                <div>Remaining: {pieces.length - pieces.filter(p => p.isPlaced).length}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomUserPuzzle;
