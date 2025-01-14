import React, { useState, useEffect } from 'react';

const EnhancedPuzzle = ({ 
  imageUrl, 
  difficulty = 3,
  onPiecePlace,
  onComplete 
}) => {
  const [pieces, setPieces] = useState([]);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  
  // Initialize puzzle pieces
  useEffect(() => {
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
            isPlaced: false,
            zIndex: 1
          });
        }
      }
      setPieces(newPieces);
      setIsLoading(false);
    };
    img.onerror = () => setIsLoading(false);
    img.src = imageUrl;
  }, [difficulty, imageUrl]);

  // Check puzzle completion
  useEffect(() => {
    const isComplete = pieces.every(piece => 
      piece.correct.x === piece.current.x && 
      piece.correct.y === piece.current.y
    );
    if (isComplete && !completed) {
      setCompleted(true);
      onComplete?.();
    }
  }, [pieces, completed, onComplete]);

  // Handle mouse movement for 3D effect
  const handleMouseMove = (e) => {
    if (draggedPiece) return; // Don't rotate while dragging
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientY - rect.top) / rect.height - 0.5;
    const y = (e.clientX - rect.left) / rect.width - 0.5;
    setRotation({ 
      x: x * -20, // Limit rotation to 20 degrees
      y: y * 20 
    });
  };

  const handleDragStart = (e, piece) => {
    setDraggedPiece(piece);
    // Increase z-index of dragged piece
    setPieces(prev => prev.map(p => ({
      ...p,
      zIndex: p.id === piece.id ? 100 : p.zIndex
    })));
    e.dataTransfer.setData('piece', JSON.stringify(piece));
  };

  const handleDragEnd = () => {
    setDraggedPiece(null);
    // Reset z-index after drag
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
          const isCorrectPosition = targetX === p.correct.x && targetY === p.correct.y;
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
                     p.correct.y === draggedPiece.current.y
          };
        }
        return p;
      });
      return newPieces;
    });
  };

  const pieceSize = 100; // size in pixels
  const gap = 2; // gap between pieces

  return (
    <div className="flex flex-col items-center gap-4">
      {isLoading ? (
        <div className="text-lg font-semibold">Loading puzzle...</div>
      ) : (
        <div 
          className="relative perspective-1000"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setRotation({ x: 0, y: 0 })}
        >
          <div 
            className="grid relative transition-transform duration-200 ease-out preserve-3d"
            style={{ 
              transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
              gridTemplateColumns: `repeat(${difficulty}, ${pieceSize}px)`,
              gap: `${gap}px`,
              width: difficulty * pieceSize + (difficulty - 1) * gap,
              height: difficulty * pieceSize + (difficulty - 1) * gap
            }}
          >
            {Array.from({ length: difficulty }).map((_, y) =>
              Array.from({ length: difficulty }).map((_, x) => (
                <div
                  key={`cell-${x}-${y}`}
                  className="relative bg-gray-200 rounded-lg shadow-md transition-transform hover:shadow-lg"
                  style={{ 
                    width: pieceSize,
                    height: pieceSize
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
                          onDragStart={(e) => handleDragStart(e, piece)}
                          onDragEnd={handleDragEnd}
                          className={`absolute inset-0 cursor-move transition-transform duration-200
                            ${piece.isPlaced ? 'ring-2 ring-green-500' : 'hover:scale-105'}
                            ${draggedPiece?.id === piece.id ? 'scale-105' : ''}`}
                          style={{
                            zIndex: piece.zIndex,
                            backgroundImage: `url(${imageUrl})`,
                            backgroundPosition: `${-piece.correct.x * 100}% ${-piece.correct.y * 100}%`,
                            backgroundSize: `${difficulty * 100}%`,
                            transform: piece.isPlaced ? 'scale(0.95)' : undefined
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
      
      {completed && (
        <div className="text-green-600 font-bold text-xl animate-bounce">
          Puzzle Completed! 🎉
        </div>
      )}
    </div>
  );
};

export default EnhancedPuzzle;