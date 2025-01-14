import React, { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, RefreshCw } from 'lucide-react';

const EnhancedPuzzle = ({ imageUrl, initialDifficulty = 3, onPiecePlace, onComplete, onSubmit, onReturnHome, onNewPuzzle }) => {
  const [pieces, setPieces] = useState([]);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [zoom, setZoom] = useState(1);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const showMessage = (text, type = 'info', duration = 3000) => {
    setMessage(text);
    setMessageType(type);
    if (duration) {
      setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, duration);
    }
  };

  const initializePuzzle = () => {
    setIsLoading(true);
    const img = new Image();
    img.onload = () => {
      const newPieces = [];
      for (let i = 0; i < difficulty; i++) {
        for (let j = 0; j < difficulty; j++) {
          newPieces.push({
            id: `piece-${i}-${j}`,
            correct: { x: i, y: j },
            current: { 
              x: Math.floor(Math.random() * difficulty), 
              y: Math.floor(Math.random() * difficulty) 
            },
            rotation: Math.floor(Math.random() / 0.25) * 90,
            isPlaced: false,
            zIndex: 1
          });
        }
      }
      setPieces(newPieces);
      setIsLoading(false);
      setCompleted(false);
      showMessage(`Started new ${difficulty}x${difficulty} puzzle!`, 'info');
    };
    img.onerror = () => {
      setIsLoading(false);
      showMessage('Failed to load image. Please try again.', 'error');
    };
    img.src = imageUrl;
  };

  useEffect(() => {
    initializePuzzle();
  }, [difficulty, imageUrl]);

  useEffect(() => {
    const correctlyPlaced = pieces.filter(p => p.isPlaced).length;
    const totalPieces = difficulty * difficulty;
    
    if (correctlyPlaced === totalPieces && correctlyPlaced > 0) {
      setCompleted(true);
      onComplete?.();
      showMessage('Congratulations! You\'ve completed the puzzle! 🎉', 'success', 0);
    } else {
      setCompleted(false);
    }
  }, [pieces, difficulty]);

  // ... [Previous drag and drop handlers remain the same]
  const handleDragStart = (e, piece) => {
    setDraggedPiece(piece);
    setSelectedPiece(piece);
    setPieces(prev => prev.map(p => ({
      ...p,
      zIndex: p.id === piece.id ? 100 : p.zIndex
    })));
    e.dataTransfer.setData('piece', JSON.stringify(piece));
  };

  const handleDragEnd = () => {
    setDraggedPiece(null);
    setPieces(prev => prev.map(p => ({
      ...p,
      zIndex: 1
    })));
  };

  const handleDrop = (e, targetX, targetY) => {
    e.preventDefault();
    const draggedPiece = JSON.parse(e.dataTransfer.getData('piece'));
    
    setPieces(prevPieces => {
      const newPieces = prevPieces.map(p => {
        if (p.id === draggedPiece.id) {
          const isCorrectPosition = targetX === p.correct.x && 
                                  targetY === p.correct.y && 
                                  p.rotation % 360 === 0;
          if (isCorrectPosition) {
            showMessage('Piece placed correctly!', 'success', 1500);
            onPiecePlace?.();
          }
          return { 
            ...p, 
            current: { x: targetX, y: targetY },
            isPlaced: isCorrectPosition
          };
        }
        if (p.current.x === targetX && p.current.y === targetY) {
          const isCorrectPosition = draggedPiece.current.x === p.correct.x && 
                                  draggedPiece.current.y === p.correct.y && 
                                  p.rotation % 360 === 0;
          return { 
            ...p, 
            current: draggedPiece.current,
            isPlaced: isCorrectPosition
          };
        }
        return p;
      });
      return newPieces;
    });
  };

  const handlePieceClick = (piece) => {
    setSelectedPiece(selectedPiece?.id === piece.id ? null : piece);
    if (selectedPiece?.id !== piece.id) {
      showMessage('Piece selected - use rotation controls to rotate', 'info');
    }
  };

  const handleRotateLeft = () => {
    if (!selectedPiece) return;
    setPieces(prev => prev.map(p => {
      if (p.id === selectedPiece.id) {
        const newRotation = p.rotation - 90;
        const isCorrectPosition = p.correct.x === p.current.x && 
                                p.correct.y === p.current.y && 
                                newRotation % 360 === 0;
        return { 
          ...p, 
          rotation: newRotation,
          isPlaced: isCorrectPosition
        };
      }
      return p;
    }));
  };

  const handleRotateRight = () => {
    if (!selectedPiece) return;
    setPieces(prev => prev.map(p => {
      if (p.id === selectedPiece.id) {
        const newRotation = p.rotation + 90;
        const isCorrectPosition = p.correct.x === p.current.x && 
                                p.correct.y === p.current.y && 
                                newRotation % 360 === 0;
        return { 
          ...p, 
          rotation: newRotation,
          isPlaced: isCorrectPosition
        };
      }
      return p;
    }));
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));
  const handleReset = () => {
    setSelectedPiece(null);
    initializePuzzle();
  };

  const basePieceSize = 100;
  const gap = 2;
  const thumbnailSize = 150;

  return (
    <div className="flex flex-col items-center gap-6 p-6 w-full max-w-4xl mx-auto bg-white rounded-lg shadow-lg">
      <div className="w-full flex flex-wrap justify-between items-center gap-4">
        <div className="flex gap-2">
          <button
            className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
            onClick={handleZoomIn}
            disabled={zoom >= 2}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
            onClick={handleRotateLeft}
            disabled={!selectedPiece}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
            onClick={handleRotateRight}
            disabled={!selectedPiece}
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            className="p-2 border rounded hover:bg-gray-100 flex items-center gap-2"
            onClick={handleReset}
          >
            <RefreshCw className="h-4 w-4" />
            <span>New Puzzle</span>
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Grid Size:</span>
          <input
            type="range"
            min="2"
            max="5"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            className="w-32"
          />
          <span className="text-sm font-medium">{difficulty}x{difficulty}</span>
        </div>
      </div>

      {message && (
        <div className={`w-full p-3 rounded text-center ${
          messageType === 'error' ? 'bg-red-100 text-red-700' :
          messageType === 'success' ? 'bg-green-100 text-green-700' :
          'bg-blue-100 text-blue-700'
        }`}>
          {message}
        </div>
      )}

      <div className="w-full flex justify-between items-start gap-4">
        {/* Thumbnail */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-medium mb-2">Target Image</div>
          <div 
            className="rounded-lg overflow-hidden shadow-md"
            style={{
              width: thumbnailSize,
              height: thumbnailSize,
              backgroundImage: `url(${imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          />
        </div>

        {/* Puzzle Grid */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="text-lg font-semibold text-center">Loading puzzle...</div>
          ) : (
            <div className="flex justify-center">
              <div 
                className="grid relative"
                style={{ 
                  gridTemplateColumns: `repeat(${difficulty}, ${basePieceSize}px)`,
                  gap: `${gap}px`,
                  width: difficulty * basePieceSize + (difficulty - 1) * gap,
                  height: difficulty * basePieceSize + (difficulty - 1) * gap,
                  transform: `scale(${zoom})`
                }}
              >
                {Array.from({ length: difficulty }).map((_, y) =>
                  Array.from({ length: difficulty }).map((_, x) => (
                    <div
                      key={`cell-${x}-${y}`}
                      className="relative bg-gray-200 rounded-lg shadow-md transition-transform hover:shadow-lg"
                      style={{ 
                        width: basePieceSize,
                        height: basePieceSize
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, x, y)}
                    >
                      {pieces.map(piece => {
                        if (piece.current.x === x && piece.current.y === y) {
                          return (
                            <div
                              key={piece.id}
                              draggable
                              onClick={() => handlePieceClick(piece)}
                              onDragStart={(e) => handleDragStart(e, piece)}
                              onDragEnd={handleDragEnd}
                              className={`absolute inset-0 cursor-move transition-all duration-200
                                ${piece.isPlaced ? 'ring-2 ring-green-500' : ''}
                                ${selectedPiece?.id === piece.id ? 'ring-2 ring-blue-500' : ''}
                                ${draggedPiece?.id === piece.id ? 'scale-105' : ''}`}
                              style={{
                                zIndex: piece.zIndex,
                                backgroundImage: `url(${imageUrl})`,
                                backgroundPosition: `${-piece.correct.x * 100}% ${-piece.correct.y * 100}%`,
                                backgroundSize: `${difficulty * 100}%`,
                                transform: `rotate(${piece.rotation}deg)`,
                                transformOrigin: 'center'
                              }}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="w-full flex justify-between items-center">
        <div className="flex gap-4 text-sm">
          <div>Total Pieces: {difficulty * difficulty}</div>
          <div>Correctly Placed: {pieces.filter(p => p.isPlaced).length}</div>
          <div>Remaining: {difficulty * difficulty - pieces.filter(p => p.isPlaced).length}</div>
        </div>
        
        {completed && (
          <button
            onClick={onSubmit}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          >
            Submit Puzzle
          </button>
        )}
      </div>

      {/* Completion Modal */}
      {completed && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl text-center">
            <h3 className="text-2xl font-bold mb-4">🎉 Puzzle Completed!</h3>
            <p className="mb-4 text-gray-600">
              Congratulations! You've completed the puzzle.
            </p>
            <div className="space-x-4">
              <button
                onClick={onReturnHome}
                className="px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Return Home
              </button>
              <button
                onClick={onNewPuzzle}
                className="px-6 py-3 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
              >
                Start New Puzzle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedPuzzle;