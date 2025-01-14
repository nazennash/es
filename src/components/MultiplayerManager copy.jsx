// MultiplayerManager.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { getDatabase, ref, onValue, set, update, off } from 'firebase/database';
import { generateInviteLink } from '../utils/inviteHelper';

const MultiplayerManager = ({ 
  puzzleId, 
  isHost, 
  imageUrl,  
  onPieceMove, 
  onPlayerJoin,
  onError,
  onGameStateChange // Added callback for game state changes
}) => {
  const [players, setPlayers] = useState([]);
  const [inviteLink, setInviteLink] = useState('');
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [gameState, setGameState] = useState(null);

  // Validate props and set up error handling
  useEffect(() => {
    const validateProps = () => {
      if (!puzzleId) {
        throw new Error('Puzzle ID is required');
      }
      if (!imageUrl) {
        throw new Error('Image URL is required');
      }
    };

    try {
      validateProps();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    }
  }, [puzzleId, imageUrl, onError]);

  // Improved puzzle piece initialization with error handling
  const initializePuzzlePieces = useCallback(async () => {
    if (!imageUrl) return null;

    return new Promise((resolve, reject) => {
      const img = new Image();
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Image loading timeout'));
      }, 30000); // 30 second timeout

      img.onload = () => {
        clearTimeout(timeoutId);
        const { width, height } = img;
        const gridSize = calculateGridSize(width, height);
        const pieces = generatePuzzlePieces(gridSize, width, height);
        resolve(pieces);
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error('Failed to load puzzle image'));
      };

      img.src = imageUrl;
    });
  }, [imageUrl]);

  // Improved grid size calculation
  const calculateGridSize = (width, height) => {
    const aspect = width / height;
    const baseSize = Math.min(Math.max(Math.floor(Math.sqrt(width * height / 10000)), 3), 8);
    
    if (aspect > 1.5) return { cols: baseSize + 1, rows: baseSize };
    if (aspect < 0.67) return { cols: baseSize, rows: baseSize + 1 };
    return { cols: baseSize, rows: baseSize };
  };

  // Improved piece generation with better randomization
  const generatePuzzlePieces = (gridSize, width, height) => {
    const { cols, rows } = gridSize;
    const pieceWidth = width / cols;
    const pieceHeight = height / rows;
    const pieces = [];
    
    const margin = 50; // Prevent pieces from being placed too close to edges
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const randomX = margin + Math.random() * (width - pieceWidth - 2 * margin);
        const randomY = margin + Math.random() * (height - pieceHeight - 2 * margin);
        const randomRotation = Math.floor(Math.random() * 4) * 90; // Snap to 90-degree rotations

        pieces.push({
          id: `piece-${row}-${col}`,
          originalPosition: {
            x: col * pieceWidth,
            y: row * pieceHeight,
          },
          currentPosition: {
            x: randomX,
            y: randomY,
          },
          width: pieceWidth,
          height: pieceHeight,
          rotation: randomRotation,
          isPlaced: false,
          lastUpdate: Date.now()
        });
      }
    }

    return pieces;
  };

  // Improved piece movement with debouncing and validation
  const movePiece = useCallback(async (pieceId, position, rotation) => {
    if (!pieceId || !position) return;

    try {
      const db = getDatabase();
      const pieceRef = ref(db, `puzzles/${puzzleId}/pieces/${pieceId}`);
      
      // Validate position is within bounds
      const piece = (await onValue(pieceRef, (snapshot) => snapshot.val()));
      if (!piece) throw new Error('Piece not found');

      // Ensure position is within game bounds
      const boundedPosition = {
        x: Math.max(0, Math.min(position.x, window.innerWidth - piece.width)),
        y: Math.max(0, Math.min(position.y, window.innerHeight - piece.height))
      };

      await update(pieceRef, {
        currentPosition: boundedPosition,
        rotation: rotation || 0,
        lastUpdate: Date.now(),
        isPlaced: false // Reset placed state on move
      });
    } catch (err) {
      console.error('Error updating piece position:', err);
      setError('Failed to update piece position');
      onError?.('Failed to update piece position');
    }
  }, [puzzleId, onError]);

  // Improved multiplayer initialization and state management
  useEffect(() => {
    let unsubscribe = [];
    
    const initializeMultiplayer = async () => {
      if (!puzzleId || !imageUrl || error) return;

      try {
        setIsLoading(true);
        const db = getDatabase();
        const puzzleRef = ref(db, `puzzles/${puzzleId}`);
        
        // Initialize as host
        if (isHost) {
          const link = generateInviteLink(puzzleId);
          setInviteLink(link);
          
          try {
            const pieces = await initializePuzzlePieces();
            if (!pieces) throw new Error('Failed to initialize puzzle pieces');

            await set(puzzleRef, {
              imageUrl,
              pieces,
              players: {},
              state: {
                status: 'active',
                createdAt: Date.now(),
                lastUpdate: Date.now()
              }
            });
          } catch (err) {
            throw new Error(`Host initialization failed: ${err.message}`);
          }
        }

        // Set up listeners
        const setupListener = (path, callback) => {
          const reference = ref(db, `puzzles/${puzzleId}/${path}`);
          onValue(reference, callback);
          unsubscribe.push(() => off(reference));
        };

        // Players listener
        setupListener('players', (snapshot) => {
          const playersData = snapshot.val() || {};
          const playersList = Object.values(playersData);
          setPlayers(playersList);
          
          const lastPlayer = playersList[playersList.length - 1];
          if (lastPlayer) {
            onPlayerJoin?.(lastPlayer);
          }
        });

        // Pieces listener with throttling
        let lastUpdateTimes = {};
        setupListener('pieces', (snapshot) => {
          const piecesData = snapshot.val() || {};
          Object.entries(piecesData).forEach(([pieceId, pieceData]) => {
            const lastUpdate = lastUpdateTimes[pieceId] || 0;
            if (pieceData.lastUpdate > lastUpdate + 50) { // 50ms throttle
              lastUpdateTimes[pieceId] = pieceData.lastUpdate;
              onPieceMove?.(pieceId, pieceData.currentPosition, pieceData.rotation);
            }
          });
        });

        // Game state listener
        setupListener('state', (snapshot) => {
          const stateData = snapshot.val();
          if (stateData) {
            setGameState(stateData);
            onGameStateChange?.(stateData);
          }
        });

        setIsLoading(false);
      } catch (err) {
        console.error('Multiplayer initialization error:', err);
        setError(err.message);
        onError?.(err.message);
        setIsLoading(false);
      }
    };

    initializeMultiplayer();

    return () => {
      unsubscribe.forEach(unsub => unsub());
    };
  }, [puzzleId, imageUrl, isHost, onPieceMove, onPlayerJoin, onError, onGameStateChange, initializePuzzlePieces, error]);

  // Component render remains the same but with improved accessibility
  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg" role="status">
        <p className="text-gray-600">Loading puzzle...</p>
      </div>
    );
  }

  return (
    <div className="multiplayer-container space-y-4">
      {isHost && (
        <div className="invite-section p-4 bg-white rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Invite Players</h3>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={inviteLink}
              readOnly
              className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Invite link"
            />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteLink);
                  setCopySuccess(true);
                  setTimeout(() => setCopySuccess(false), 2000);
                } catch (err) {
                  console.error('Failed to copy:', err);
                  setError('Failed to copy invite link');
                }
              }}
              className={`px-4 py-2 rounded transition-colors ${
                copySuccess ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'
              } text-white`}
              disabled={copySuccess}
              aria-label={copySuccess ? 'Link copied!' : 'Copy invite link'}
            >
              {copySuccess ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div className="players-list p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-2">
          Current Players ({players.length})
        </h3>
        {players.length === 0 ? (
          <p className="text-gray-500">No other players yet</p>
        ) : (
          <ul className="space-y-2" role="list">
            {players.map(player => (
              <li
                key={player.id}
                className="flex items-center space-x-2 p-2 bg-gray-50 rounded"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: player.color }}
                  aria-label={`${player.name || 'Anonymous Player'}'s color`}
                />
                <span>{player.name || 'Anonymous Player'}</span>
                {player.isHost && (
                  <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    Host
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {gameState && gameState.status === 'completed' && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg" role="alert">
          <p className="text-green-600">Puzzle completed! 🎉</p>
          <p className="text-sm text-green-500 mt-1">
            Completed in {((gameState.completedAt - gameState.createdAt) / 1000 / 60).toFixed(1)} minutes
          </p>
        </div>
      )}
    </div>
  );
};

export default MultiplayerManager;