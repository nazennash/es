import React, { useState, useEffect } from 'react';
import PuzzleImageUploader from './PuzzleImageUploader';

const MultiplayerPuzzle = ({ 
  user = { id: 'demo-user', name: 'Demo Player' },
  isHost = false,
  onNavigate = () => {},
  imageUrl = '',
}) => {
  const [gameId] = useState(`game-${Date.now()}`);
  const [error, setError] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [difficulty] = useState(3);
  const [timer, setTimer] = useState(0);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [players, setPlayers] = useState([
    { id: user.id, name: user.name, color: '#4299e1', isHost, score: 0 }
  ]);
  
  useEffect(() => {
    if (isGameStarted) {
      const interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isGameStarted]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const generateGameLink = () => {
    const baseUrl = window.location.origin;
    const timestamp = Date.now();
    const currentTime = formatTime(timer);
    return `${baseUrl}/puzzle/${gameId}?t=${timestamp}&timer=${currentTime}`;
  };

  const copyGameLink = async () => {
    try {
      await navigator.clipboard.writeText(generateGameLink());
      setError({ type: 'success', message: 'Game link copied! Current time: ' + formatTime(timer) });
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      setError({ type: 'error', message: 'Failed to copy game link' });
    }
  };

  const initializePuzzle = () => {
    setIsGameStarted(true);
    setTimer(0);
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
    setPieces(newPieces);
  };

  const handleDragStart = (e, piece) => {
    setDraggedPiece(piece);
    setSelectedPiece(piece);
    setPieces(prev => prev.map(p => ({
      ...p,
      zIndex: p.id === piece.id ? 100 : p.zIndex
    })));
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
    if (!draggedPiece) return;

    setPieces(prev => prev.map(p => {
      if (p.id === draggedPiece.id) {
        const isCorrect = targetX === p.correct.x && 
                         targetY === p.correct.y && 
                         p.rotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          setPlayers(prev => prev.map(player => 
            player.id === user.id 
              ? { ...player, score: player.score + 1 }
              : player
          ));
        }
        
        return {
          ...p,
          current: { x: targetX, y: targetY },
          isPlaced: isCorrect,
          zIndex: 1
        };
      }
      return p;
    }));
  };

  const handleRotate = (direction) => {
    if (!selectedPiece) return;
    setPieces(prev => prev.map(p => {
      if (p.id === selectedPiece.id) {
        const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
        const isCorrect = p.correct.x === p.current.x && 
                         p.correct.y === p.current.y && 
                         newRotation % 360 === 0;
        
        if (isCorrect && !p.isPlaced) {
          setPlayers(prev => prev.map(player => 
            player.id === user.id 
              ? { ...player, score: player.score + 1 }
              : player
          ));
        }
        
        return {
          ...p,
          rotation: newRotation,
          isPlaced: isCorrect
        };
      }
      return p;
    }));
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-50">

      <PuzzleImageUploader />

      {/* retrieve the image URL from the server */}
      <div className="max-w-xl mx-auto pt-8">
        <h2 className="text-2xl font-bold mb-4">Image URL</h2>
        <p className="text-gray-600">{imageUrl}</p>
      </div>

      {/* Game Header */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">Multiplayer Puzzle</h2>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="font-mono">⏱️ {formatTime(timer)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyGameLink}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
            >
              🔗 Share ({formatTime(timer)})
            </button>
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
            <button
              onClick={initializePuzzle}
              className="p-2 rounded-full hover:bg-gray-100"
              title="Reset Puzzle"
            >
              🔄
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