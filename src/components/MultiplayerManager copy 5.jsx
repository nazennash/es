import React, { useState, useEffect, useRef } from 'react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update } from 'firebase/database';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Play } from 'lucide-react';

// Constants for game configuration
const GRID_SIZES = {
  SMALL: 3,
  MEDIUM: 4,
  LARGE: 5
};

const ZOOM_SETTINGS = {
  MIN: 0.5,
  MAX: 2,
  STEP: 0.1
};

const PuzzleGame = () => {
  // Core state
  const [gameState, setGameState] = useState({
    gameId: `game-${Date.now()}`,
    imageUrl: '',
    gridSize: GRID_SIZES.MEDIUM,
    timer: 0,
    isStarted: false,
    isCompleted: false
  });

  // UI state
  const [ui, setUi] = useState({
    zoom: 1,
    selectedPiece: null,
    draggedPiece: null,
    error: null,
    loading: false,
    dimensions: {
      grid: { width: 0, height: 0 },
      cell: { width: 0, height: 0 }
    }
  });

  // Game pieces state
  const [pieces, setPieces] = useState([]);
  
  // References
  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Firebase instances
  const storage = getStorage();
  const database = getDatabase();

  // Calculate grid dimensions when container size changes
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current && gameState.imageUrl) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        
        // Calculate cell dimensions based on grid size
        const cellWidth = Math.floor(containerWidth / gameState.gridSize);
        const cellHeight = Math.floor(containerHeight / gameState.gridSize);

        setUi(prev => ({
          ...prev,
          dimensions: {
            grid: { width: containerWidth, height: containerHeight },
            cell: { width: cellWidth, height: cellHeight }
          }
        }));
      }
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    return () => window.removeEventListener('resize', updateDimensions);
  }, [gameState.imageUrl, gameState.gridSize]);

  // Timer management
  useEffect(() => {
    if (gameState.isStarted && !gameState.isCompleted) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setGameState(prev => ({ ...prev, timer: elapsed }));
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [gameState.isStarted, gameState.isCompleted]);

// Continue in Part 2...


// ... Part 1 code above

  // Piece generation and game initialization
  const initializePuzzle = async () => {
    if (!gameState.imageUrl) {
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Please upload an image first' }
      }));
      return;
    }

    try {
      setUi(prev => ({ ...prev, loading: true }));
      
      // Create randomized piece positions
      const totalPieces = gameState.gridSize * gameState.gridSize;
      const positions = Array.from({ length: totalPieces })
        .map((_, index) => index)
        .sort(() => Math.random() - 0.5);

      // Generate puzzle pieces with correct and current positions
      const newPieces = Array.from({ length: totalPieces }).map((_, index) => {
        const correctRow = Math.floor(index / gameState.gridSize);
        const correctCol = index % gameState.gridSize;
        const randomPosition = positions[index];
        const currentRow = Math.floor(randomPosition / gameState.gridSize);
        const currentCol = randomPosition % gameState.gridSize;

        return {
          id: `piece-${index}`,
          correct: { row: correctRow, col: correctCol },
          current: { row: currentRow, col: currentCol },
          rotation: Math.floor(Math.random() * 4) * 90,
          isPlaced: false
        };
      });

      // Update game state in Firebase
      await update(dbRef(database, `games/${gameState.gameId}`), {
        pieces: newPieces,
        isStarted: true,
        startTime: Date.now(),
        isCompleted: false
      });

      setPieces(newPieces);
      setGameState(prev => ({ 
        ...prev, 
        isStarted: true,
        isCompleted: false 
      }));
      startTimeRef.current = Date.now();

    } catch (error) {
      console.error('Failed to initialize puzzle:', error);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to start game' }
      }));
    } finally {
      setUi(prev => ({ ...prev, loading: false }));
    }
  };

  // Piece placement and validation
  const handlePiecePlacement = async (piece, targetRow, targetCol) => {
    if (!piece || gameState.isCompleted) return;

    try {
      const updatedPieces = pieces.map(p => {
        if (p.id === piece.id) {
          const isCorrectPosition = 
            targetRow === p.correct.row && 
            targetCol === p.correct.col && 
            p.rotation % 360 === 0;

          return {
            ...p,
            current: { row: targetRow, col: targetCol },
            isPlaced: isCorrectPosition
          };
        }
        return p;
      });

      // Update pieces in Firebase
      await update(dbRef(database, `games/${gameState.gameId}`), {
        pieces: updatedPieces
      });

      setPieces(updatedPieces);

      // Check if puzzle is completed
      const isCompleted = updatedPieces.every(p => p.isPlaced);
      if (isCompleted) {
        handlePuzzleCompletion();
      }

    } catch (error) {
      console.error('Failed to move piece:', error);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to move piece' }
      }));
    }
  };

  // Piece rotation
  const handlePieceRotation = async (piece, direction) => {
    if (!piece || gameState.isCompleted) return;

    try {
      const updatedPieces = pieces.map(p => {
        if (p.id === piece.id) {
          const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
          const isCorrectPosition = 
            p.current.row === p.correct.row && 
            p.current.col === p.correct.col && 
            newRotation % 360 === 0;

          return {
            ...p,
            rotation: newRotation,
            isPlaced: isCorrectPosition
          };
        }
        return p;
      });

      await update(dbRef(database, `games/${gameState.gameId}`), {
        pieces: updatedPieces
      });

      setPieces(updatedPieces);

      // Check if puzzle is completed
      const isCompleted = updatedPieces.every(p => p.isPlaced);
      if (isCompleted) {
        handlePuzzleCompletion();
      }

    } catch (error) {
      console.error('Failed to rotate piece:', error);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to rotate piece' }
      }));
    }
  };

  // Handle puzzle completion
  const handlePuzzleCompletion = async () => {
    try {
      clearInterval(timerRef.current);
      
      await update(dbRef(database, `games/${gameState.gameId}`), {
        isCompleted: true,
        completionTime: gameState.timer
      });

      setGameState(prev => ({ ...prev, isCompleted: true }));
      setUi(prev => ({
        ...prev,
        error: { type: 'success', message: 'Puzzle completed! 🎉' }
      }));

    } catch (error) {
      console.error('Failed to handle completion:', error);
    }
  };

  // Continue to Part 3...

  // ... Part 1 and 2 code above

  // Image upload handling
  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUi(prev => ({ ...prev, loading: true }));
      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);

      // Load image to get dimensions
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      await update(dbRef(database, `games/${gameState.gameId}`), {
        imageUrl: url,
        imageSize: {
          width: img.width,
          height: img.height
        }
      });

      setGameState(prev => ({ ...prev, imageUrl: url }));

    } catch (error) {
      console.error('Failed to upload image:', error);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to upload image' }
      }));
    } finally {
      setUi(prev => ({ ...prev, loading: false }));
    }
  };

  // Render puzzle grid
  const renderPuzzleGrid = () => {
    if (!gameState.imageUrl) return null;

    const gridStyle = {
      display: 'grid',
      gridTemplateColumns: `repeat(${gameState.gridSize}, 1fr)`,
      gap: '1px',
      transform: `scale(${ui.zoom})`,
      transformOrigin: 'top left',
      transition: 'transform 0.2s ease'
    };

    return (
      <div style={gridStyle}>
        {Array.from({ length: gameState.gridSize * gameState.gridSize }).map((_, index) => {
          const row = Math.floor(index / gameState.gridSize);
          const col = index % gameState.gridSize;
          
          return (
            <div
              key={`cell-${row}-${col}`}
              className={`aspect-square relative border ${
                pieces.some(p => p.current.row === row && p.current.col === col)
                  ? 'border-gray-300'
                  : 'border-dashed border-gray-200 bg-gray-50'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (ui.draggedPiece) {
                  handlePiecePlacement(ui.draggedPiece, row, col);
                  setUi(prev => ({ ...prev, draggedPiece: null }));
                }
              }}
            >
              {renderPuzzlePiece(row, col)}
            </div>
          );
        })}
      </div>
    );
  };

  // Render individual puzzle piece
  const renderPuzzlePiece = (row, col) => {
    const piece = pieces.find(p => p.current.row === row && p.current.col === col);
    if (!piece) return null;

    const isCorrect = piece.isPlaced;
    const isSelected = ui.selectedPiece?.id === piece.id;

    return (
      <div
        draggable={!gameState.isCompleted}
        className={`absolute inset-0 cursor-move transition-transform duration-200
          ${isCorrect ? 'ring-2 ring-green-500' : ''}
          ${isSelected ? 'ring-2 ring-blue-500' : ''}
          ${gameState.isCompleted ? 'cursor-default' : ''}`}
        style={{
          backgroundImage: `url(${gameState.imageUrl})`,
          backgroundSize: `${ui.dimensions.grid.width}px ${ui.dimensions.grid.height}px`,
          backgroundPosition: `-${piece.correct.col * ui.dimensions.cell.width}px -${piece.correct.row * ui.dimensions.cell.height}px`,
          transform: `rotate(${piece.rotation}deg)`,
          width: ui.dimensions.cell.width,
          height: ui.dimensions.cell.height
        }}
        onDragStart={(e) => {
          e.stopPropagation();
          if (!gameState.isCompleted) {
            setUi(prev => ({ ...prev, draggedPiece: piece }));
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!gameState.isCompleted) {
            setUi(prev => ({
              ...prev,
              selectedPiece: prev.selectedPiece?.id === piece.id ? null : piece
            }));
          }
        }}
      />
    );
  };

  // Continue to Part 4...


  // ... Part 1, 2, and 3 code above

  // Format timer display
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Main render
  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-lg shadow-lg max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <h1 className="text-2xl font-bold">Puzzle Game</h1>
        <div className="text-lg font-semibold">
          Time: {formatTime(gameState.timer)}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4">
        {/* Grid size selection */}
        {!gameState.isStarted && (
          <div className="flex items-center gap-2">
            <label htmlFor="gridSize" className="font-medium">
              Grid Size: {gameState.gridSize}x{gameState.gridSize}
            </label>
            <select
              id="gridSize"
              value={gameState.gridSize}
              onChange={(e) => setGameState(prev => ({
                ...prev,
                gridSize: parseInt(e.target.value)
              }))}
              className="border rounded p-1"
              disabled={gameState.isStarted}
            >
              <option value={GRID_SIZES.SMALL}>Small (3x3)</option>
              <option value={GRID_SIZES.MEDIUM}>Medium (4x4)</option>
              <option value={GRID_SIZES.LARGE}>Large (5x5)</option>
            </select>
          </div>
        )}

        {/* Zoom controls */}
        <div className="flex gap-2">
          <button
            onClick={() => setUi(prev => ({
              ...prev,
              zoom: Math.max(prev.zoom - ZOOM_SETTINGS.STEP, ZOOM_SETTINGS.MIN)
            }))}
            className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
            disabled={ui.zoom <= ZOOM_SETTINGS.MIN}
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={() => setUi(prev => ({
              ...prev,
              zoom: Math.min(prev.zoom + ZOOM_SETTINGS.STEP, ZOOM_SETTINGS.MAX)
            }))}
            className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
            disabled={ui.zoom >= ZOOM_SETTINGS.MAX}
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        {/* Rotation controls */}
        {ui.selectedPiece && !gameState.isCompleted && (
          <div className="flex gap-2">
            <button
              onClick={() => handlePieceRotation(ui.selectedPiece, 'left')}
              className="p-2 border rounded hover:bg-gray-100"
              title="Rotate Left"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={() => handlePieceRotation(ui.selectedPiece, 'right')}
              className="p-2 border rounded hover:bg-gray-100"
              title="Rotate Right"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Start game button */}
        {!gameState.isStarted && (
          <button
            onClick={initializePuzzle}
            className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
            disabled={!gameState.imageUrl}
            title="Start Game"
          >
            <Play className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Error/Success messages */}
      {ui.error && (
        <div 
          className={`p-3 rounded ${
            ui.error.type === 'error' 
              ? 'bg-red-100 text-red-700' 
              : 'bg-green-100 text-green-700'
          }`}
        >
          {ui.error.message}
        </div>
      )}

      {/* Main puzzle area */}
      <div 
        ref={containerRef}
        className="relative min-h-[500px] border rounded-lg overflow-hidden"
      >
        {!gameState.imageUrl ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-8">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="mb-4"
                disabled={ui.loading}
              />
              <p className="text-sm text-gray-500">
                Upload an image to start the game
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            {/* Preview */}
            <div className="mb-4 flex justify-end">
              <img 
                src={gameState.imageUrl}
                alt="Puzzle preview"
                className="w-32 h-32 object-contain border rounded"
              />
            </div>
            
            {/* Puzzle grid */}
            {renderPuzzleGrid()}

            {/* Loading overlay */}
            {ui.loading && (
              <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Game statistics */}
      {gameState.isStarted && (
        <div className="mt-4 flex gap-4 text-sm text-gray-600">
          <div>Total Pieces: {pieces.length}</div>
          <div>Correctly Placed: {pieces.filter(p => p.isPlaced).length}</div>
          <div>
            Progress: {Math.round((pieces.filter(p => p.isPlaced).length / pieces.length) * 100)}%
          </div>
        </div>
      )}
    </div>
  );
};

export default PuzzleGame;