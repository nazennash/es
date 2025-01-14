import React, { useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCw, RefreshCw } from 'lucide-react';

// Custom icon components for flip operations
const FlipHIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    width="20" 
    height="20" 
    stroke="currentColor" 
    strokeWidth="2" 
    fill="none"
  >
    <path d="M12 3L12 21M9 6L3 12L9 18M15 6L21 12L15 18" />
  </svg>
);

const FlipVIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    width="20" 
    height="20" 
    stroke="currentColor" 
    strokeWidth="2" 
    fill="none"
  >
    <path d="M3 12H21M6 9L12 3L18 9M6 15L12 21L18 15" />
  </svg>
);

// Control Button component
const ControlButton = ({ onClick, title, children, disabled }) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`p-2 rounded transition-colors ${
      disabled 
        ? 'bg-gray-200 cursor-not-allowed' 
        : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300'
    }`}
    title={title}
  >
    {children}
  </button>
);

const PuzzleGame = ({ 
  imageUrl, 
  difficulty = 3,
  onComplete 
}) => {
  // ... [Previous state declarations remain the same] ...
  const [pieces, setPieces] = useState([]);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [time, setTime] = useState(0);
  const [stats, setStats] = useState({
    moves: 0,
    correctPieces: 0
  });
  
  // Transform states
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState({ x: 1, y: 1 });

  // ... [Previous useEffects and helper functions remain the same until the return statement] ...

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* Stats Panel */}
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-md p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-sm text-gray-500">Time</div>
            <div className="text-lg font-bold">{formatTime(time)}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500">Moves</div>
            <div className="text-lg font-bold">{stats.moves}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500">Correct Pieces</div>
            <div className="text-lg font-bold">{stats.correctPieces}/{difficulty * difficulty}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500">Progress</div>
            <div className="text-lg font-bold">
              {Math.round((stats.correctPieces / (difficulty * difficulty)) * 100)}%
            </div>
          </div>
        </div>
      </div>

      {/* Controls Panel */}
      <div className="flex flex-wrap gap-2 justify-center mb-4">
        <ControlButton
          onClick={() => setScale(prev => Math.min(prev + 0.1, 2))}
          title="Zoom In"
          disabled={scale >= 2}
        >
          <ZoomIn size={20} />
        </ControlButton>
        
        <ControlButton
          onClick={() => setScale(prev => Math.max(prev - 0.1, 0.5))}
          title="Zoom Out"
          disabled={scale <= 0.5}
        >
          <ZoomOut size={20} />
        </ControlButton>
        
        <ControlButton
          onClick={() => setRotation(prev => (prev + 90) % 360)}
          title="Rotate 90°"
        >
          <RotateCw size={20} />
        </ControlButton>
        
        <ControlButton
          onClick={() => setFlip(prev => ({ ...prev, x: -prev.x }))}
          title="Flip Horizontally"
        >
          <FlipHIcon />
        </ControlButton>
        
        <ControlButton
          onClick={() => setFlip(prev => ({ ...prev, y: -prev.y }))}
          title="Flip Vertically"
        >
          <FlipVIcon />
        </ControlButton>
        
        <ControlButton
          onClick={() => {
            setScale(1);
            setRotation(0);
            setFlip({ x: 1, y: 1 });
          }}
          title="Reset Transforms"
        >
          <RefreshCw size={20} />
        </ControlButton>

        <button
          onClick={handleSubmit}
          disabled={isSubmitted}
          className={`px-4 py-2 rounded font-semibold transition-colors ${
            isSubmitted 
              ? 'bg-gray-300 cursor-not-allowed'
              : isComplete 
                ? 'bg-green-500 hover:bg-green-600 active:bg-green-700 text-white'
                : 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white'
          }`}
        >
          {isSubmitted ? 'Submitted' : 'Submit'}
        </button>
      </div>

      {/* Puzzle Grid */}
      {isLoading ? (
        <div className="text-lg font-semibold">Loading puzzle...</div>
      ) : (
        <div className="relative overflow-hidden p-4">
          <div 
            className="grid relative transition-transform duration-200"
            style={{ 
              transform: `scale(${scale}) rotate(${rotation}deg) scaleX(${flip.x}) scaleY(${flip.y})`,
              transformOrigin: 'center',
              gridTemplateColumns: `repeat(${difficulty}, ${pieceSize}px)`,
              gap: `${gap}px`,
              width: difficulty * pieceSize + (difficulty - 1) * gap,
              height: difficulty * pieceSize + (difficulty - 1) * gap
            }}
          >
            {/* ... [Grid and piece rendering code remains the same] ... */}
          </div>
        </div>
      )}

      {/* Results Panel */}
      {isSubmitted && (
        <div className="mt-4 p-4 bg-white rounded-lg shadow-md w-full max-w-2xl">
          <h2 className="text-xl font-bold mb-2 text-center">
            {isComplete ? '🎉 Puzzle Completed! 🎉' : '❌ Not quite right - Keep trying!'}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-gray-600">Total Time: <span className="font-bold">{formatTime(time)}</span></div>
            <div className="text-gray-600">Total Moves: <span className="font-bold">{stats.moves}</span></div>
            <div className="text-gray-600">Correct Pieces: <span className="font-bold">{stats.correctPieces}/{difficulty * difficulty}</span></div>
            <div className="text-gray-600">Accuracy: <span className="font-bold">{Math.round((stats.correctPieces / (difficulty * difficulty)) * 100)}%</span></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PuzzleGame;