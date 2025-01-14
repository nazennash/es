import React, { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, RefreshCw } from 'lucide-react';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

const EnhancedPuzzle = ({ imageUrl, initialDifficulty = 3, onPiecePlace, onComplete }) => {
  const [pieces, setPieces] = useState([]);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [zoom, setZoom] = useState(1);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [gridDimensions, setGridDimensions] = useState({ width: 0, height: 0 });
  const [cellDimensions, setCellDimensions] = useState({ width: 0, height: 0 });
  
  // Add state for tracking correctly placed pieces
  const [correctPlacements, setCorrectPlacements] = useState(new Set());

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

  const isPieceCorrect = (piece, currentX, currentY) => {
    return (
      currentX === piece.correct.x &&
      currentY === piece.correct.y &&
      piece.rotation % 360 === 0
    );
  };

  const initializePuzzle = () => {
    setIsLoading(true);
    setCorrectPlacements(new Set()); // Reset correct placements
    
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      const pieceWidth = img.width / difficulty;
      const pieceHeight = img.height / difficulty;
      
      const newPieces = [];
      for (let y = 0; y < difficulty; y++) {
        for (let x = 0; x < difficulty; x++) {
          if ((x * pieceWidth < img.width) && (y * pieceHeight < img.height)) {
            newPieces.push({
              id: `piece-${x}-${y}`,
              correct: { x, y },
              current: { 
                x: Math.floor(Math.random() * difficulty), 
                y: Math.floor(Math.random() * difficulty) 
              },
              rotation: Math.floor(Math.random() * 4) * 90,
              dimensions: {
                width: pieceWidth,
                height: pieceHeight,
                offsetX: x * pieceWidth,
                offsetY: y * pieceHeight
              }
            });
          }
        }
      }
      setPieces(newPieces);
      setIsLoading(false);
      setCompleted(false);
      showMessage(`Started new puzzle with ${newPieces.length} pieces!`, 'info');
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
    if (correctPlacements.size === pieces.length && pieces.length > 0) {
      setCompleted(true);
      onComplete?.();
      showMessage('Puzzle completed! Congratulations!', 'success', 0);
    }
  }, [correctPlacements, pieces.length, onComplete]);

  const handleDragStart = (e, piece) => {
    setDraggedPiece(piece);
    setSelectedPiece(piece);
    e.dataTransfer.setData('piece', JSON.stringify(piece));
  };

  const handleDragEnd = () => {
    setDraggedPiece(null);
  };

  const handleDrop = (e, targetX, targetY) => {
    e.preventDefault();
    const draggedPiece = JSON.parse(e.dataTransfer.getData('piece'));
    
    setPieces(prevPieces => {
      const newPieces = prevPieces.map(p => {
        if (p.id === draggedPiece.id) {
          const isCorrect = isPieceCorrect(p, targetX, targetY);
          
          // Update correct placements set
          if (isCorrect) {
            setCorrectPlacements(prev => new Set(prev.add(p.id)));
            showMessage('Piece placed correctly!', 'success');
            onPiecePlace?.();
          } else {
            setCorrectPlacements(prev => {
              const newSet = new Set(prev);
              newSet.delete(p.id);
              return newSet;
            });
          }
          
          return {
            ...p,
            current: { x: targetX, y: targetY }
          };
        }
        
        // Handle piece that was in the target position
        if (p.current.x === targetX && p.current.y === targetY) {
          const isCorrect = isPieceCorrect(p, draggedPiece.current.x, draggedPiece.current.y);
          
          if (!isCorrect) {
            setCorrectPlacements(prev => {
              const newSet = new Set(prev);
              newSet.delete(p.id);
              return newSet;
            });
          }
          
          return {
            ...p,
            current: draggedPiece.current
          };
        }
        return p;
      });
      return newPieces;
    });
  };

  const handleRotate = (direction) => {
    if (!selectedPiece) return;
    
    setPieces(prev => prev.map(p => {
      if (p.id === selectedPiece.id) {
        const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
        const isCorrect = isPieceCorrect(p, p.current.x, p.current.y);
        
        // Update correct placements based on rotation
        if (isCorrect) {
          setCorrectPlacements(prev => new Set(prev.add(p.id)));
        } else {
          setCorrectPlacements(prev => {
            const newSet = new Set(prev);
            newSet.delete(p.id);
            return newSet;
          });
        }
        
        return {
          ...p,
          rotation: newRotation
        };
      }
      return p;
    }));
  };

  const renderPiece = (piece, x, y) => {
    if (piece.current.x !== x || piece.current.y !== y) return null;
    
    const isCorrectlyPlaced = correctPlacements.has(piece.id);
    
    return (
      <div
        key={piece.id}
        draggable
        onClick={() => setSelectedPiece(selectedPiece?.id === piece.id ? null : piece)}
        onDragStart={(e) => handleDragStart(e, piece)}
        onDragEnd={handleDragEnd}
        className={`absolute inset-0 cursor-move transition-all duration-200
          ${isCorrectlyPlaced ? 'ring-2 ring-green-500' : ''}
          ${selectedPiece?.id === piece.id ? 'ring-2 ring-blue-500' : ''}
          ${draggedPiece?.id === piece.id ? 'opacity-50' : ''}`}
        style={{
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: `${gridDimensions.width}px ${gridDimensions.height}px`,
          backgroundPosition: `-${piece.dimensions.offsetX}px -${piece.dimensions.offsetY}px`,
          transform: `rotate(${piece.rotation}deg)`,
          transformOrigin: 'center',
          width: '100%',
          height: '100%'
        }}
      />
    );
  };

  // Rest of the component remains the same...
  // Include the UI rendering code with grid, controls, etc.

  return (
    <div className="flex flex-col items-center gap-6 p-6 w-full max-w-4xl mx-auto bg-white rounded-lg shadow-lg">
      {/* Controls section */}
      <div className="w-full flex flex-wrap justify-between items-center gap-4">
        {/* ... existing controls ... */}
      </div>

      {/* Messages */}
      {message && (
        <div className={`w-full p-3 rounded text-center ${
          messageType === 'error' ? 'bg-red-100 text-red-700' :
          messageType === 'success' ? 'bg-green-100 text-green-700' :
          'bg-blue-100 text-blue-700'
        }`}>
          {message}
        </div>
      )}

      {/* Puzzle grid */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div>Loading puzzle...</div>
        ) : (
          <div className="grid gap-1" style={{
            gridTemplateColumns: `repeat(${difficulty}, 100px)`,
            transform: `scale(${zoom})`
          }}>
            {Array.from({ length: difficulty * difficulty }).map((_, index) => {
              const x = index % difficulty;
              const y = Math.floor(index / difficulty);
              return (
                <div
                  key={`cell-${x}-${y}`}
                  className="relative bg-gray-100 aspect-square"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, x, y)}
                >
                  {pieces.map(piece => renderPiece(piece, x, y))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status section */}
      <div className="w-full flex justify-between items-center">
        <div className="flex gap-4 text-sm">
          <div>Correctly Placed: {correctPlacements.size}</div>
          <div>Remaining: {pieces.length - correctPlacements.size}</div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedPuzzle;