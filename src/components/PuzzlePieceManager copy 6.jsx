import React, { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw } from 'lucide-react';

const EnhancedPuzzle = ({ 
  imageUrl,
  initialDifficulty = 3,
  onPiecePlace,
  onComplete 
}) => {
  const [pieces, setPieces] = useState([]);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [zoom, setZoom] = useState(1);
  const [selectedPiece, setSelectedPiece] = useState(null);
  
  // Initialize puzzle pieces with rotation property
  useEffect(() => {
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
            rotation: 0,
            isPlaced: false,
            zIndex: 1
          });
        }
      }
      setPieces(newPieces);
      setIsLoading(false);
      setCompleted(false);
    };
    img.onerror = () => setIsLoading(false);
    img.src = imageUrl;
  }, [difficulty, imageUrl]);

  // Check puzzle completion
  useEffect(() => {
    const isComplete = pieces.every(piece => 
      piece.correct.x === piece.current.x && 
      piece.correct.y === piece.current.y &&
      piece.rotation % 360 === 0
    );
    if (isComplete && !completed) {
      setCompleted(true);
      onComplete?.();
    }
  }, [pieces, completed, onComplete]);

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
            onPiecePlace?.();
          }
          return { 
            ...p, 
            current: { x: targetX, y: targetY },
            isPlaced: isCorrectPosition
          };
        }
        if (p.current.x === targetX && p.current.y === targetY) {
          return { 
            ...p, 
            current: draggedPiece.current,
            isPlaced: p.correct.x === draggedPiece.current.x && 
                     p.correct.y === draggedPiece.current.y &&
                     p.rotation % 360 === 0
          };
        }
        return p;
      });
      return newPieces;
    });
  };

  const handlePieceClick = (piece) => {
    setSelectedPiece(selectedPiece?.id === piece.id ? null : piece);
  };

  const handleRotateLeft = () => {
    if (!selectedPiece) return;
    setPieces(prev => prev.map(p => 
      p.id === selectedPiece.id 
        ? { ...p, rotation: p.rotation - 90, isPlaced: false }
        : p
    ));
  };

  const handleRotateRight = () => {
    if (!selectedPiece) return;
    setPieces(prev => prev.map(p => 
      p.id === selectedPiece.id 
        ? { ...p, rotation: p.rotation + 90, isPlaced: false }
        : p
    ));
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));

  const basePieceSize = 100;
  const gap = 2;
  const pieceSize = basePieceSize * zoom;

  return (
    <div className="flex flex-col items-center gap-6 p-6 w-full max-w-4xl mx-auto bg-white rounded-lg shadow-lg">
      <div className="w-full flex justify-between items-center gap-4">
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
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Difficulty:</span>
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

      <div className="w-full overflow-auto p-4">
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

      {completed && (
        <div className="text-green-600 font-bold text-xl animate-bounce">
          Puzzle Completed! 🎉
        </div>
      )}
    </div>
  );
};

export default EnhancedPuzzle;