import React, { useEffect, useState, useCallback } from 'react';
import { getDatabase, ref, onValue, set, update, off } from 'firebase/database';
import { generateInviteLink } from '../utils/inviteHelper';

const MultiplayerManager = ({ 
  puzzleId, 
  isHost, 
  imageUrl,  // Add imageUrl as a required prop
  onPieceMove, 
  onPlayerJoin,
  onError 
}) => {
  const [players, setPlayers] = useState([]);
  const [inviteLink, setInviteLink] = useState('');
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [gameState, setGameState] = useState(null);

  // Validate required props
  useEffect(() => {
    if (!puzzleId) {
      setError('Puzzle ID is required');
      onError?.('Puzzle ID is required');
      return;
    }
    if (!imageUrl) {
      setError('Image URL is required');
      onError?.('Image URL is required');
      return;
    }
  }, [puzzleId, imageUrl, onError]);

  // Initialize puzzle pieces based on image
  const initializePuzzlePieces = useCallback(async () => {
    if (!imageUrl) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Calculate puzzle grid based on image dimensions
        const { width, height } = img;
        const gridSize = calculateGridSize(width, height);
        const pieces = generatePuzzlePieces(gridSize, width, height);
        resolve(pieces);
      };
      img.onerror = () => {
        setError('Failed to load puzzle image');
        onError?.('Failed to load puzzle image');
        resolve(null);
      };
      img.src = imageUrl;
    });
  }, [imageUrl, onError]);

  // Calculate appropriate grid size based on image dimensions
  const calculateGridSize = (width, height) => {
    const aspect = width / height;
    if (aspect > 1.5) return { cols: 6, rows: 4 };
    if (aspect < 0.67) return { cols: 4, rows: 6 };
    return { cols: 5, rows: 5 };
  };

  // Generate initial puzzle pieces data
  const generatePuzzlePieces = (gridSize, width, height) => {
    const { cols, rows } = gridSize;
    const pieceWidth = width / cols;
    const pieceHeight = height / rows;
    const pieces = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        pieces.push({
          id: `piece-${row}-${col}`,
          originalPosition: {
            x: col * pieceWidth,
            y: row * pieceHeight,
          },
          currentPosition: {
            x: Math.random() * (width - pieceWidth),
            y: Math.random() * (height - pieceHeight),
          },
          width: pieceWidth,
          height: pieceHeight,
          rotation: 0,
          isPlaced: false
        });
      }
    }

    return pieces;
  };

  // Memoize the movePiece function
  const movePiece = useCallback(async (pieceId, position, rotation) => {
    try {
      const db = getDatabase();
      const pieceRef = ref(db, `puzzles/${puzzleId}/pieces/${pieceId}`);
      
      await update(pieceRef, {
        currentPosition: position,
        rotation,
        lastUpdate: Date.now()
      });
    } catch (err) {
      console.error('Error updating piece position:', err);
      setError('Failed to update piece position');
      onError?.('Failed to update piece position');
    }
  }, [puzzleId, onError]);

  // Initialize multiplayer connection
  useEffect(() => {
    let playersRef;
    let piecesRef;
    let stateRef;

    const initializeMultiplayer = async () => {
      if (!puzzleId || !imageUrl) return;

      try {
        setIsLoading(true);
        const db = getDatabase();
        const puzzleRef = ref(db, `puzzles/${puzzleId}`);
        playersRef = ref(db, `puzzles/${puzzleId}/players`);
        piecesRef = ref(db, `puzzles/${puzzleId}/pieces`);
        stateRef = ref(db, `puzzles/${puzzleId}/state`);

        // Set up initial puzzle state if host
        if (isHost) {
          const link = generateInviteLink(puzzleId);
          setInviteLink(link);
          
          const pieces = await initializePuzzlePieces();
          if (!pieces) return;

          await set(puzzleRef, {
            imageUrl,
            pieces,
            players: [],
            state: {
              status: 'active',
              createdAt: Date.now(),
              lastUpdate: Date.now()
            }
          });
        }

        // Listen for player changes
        onValue(playersRef, (snapshot) => {
          const playersData = snapshot.val();
          if (playersData) {
            const playersList = Object.values(playersData);
            setPlayers(playersList);
            
            const lastPlayer = playersList[playersList.length - 1];
            if (lastPlayer) {
              onPlayerJoin?.(lastPlayer);
            }
          }
        });

        // Listen for piece movements
        let lastUpdate = {};
        onValue(piecesRef, (snapshot) => {
          const piecesData = snapshot.val();
          if (piecesData) {
            Object.entries(piecesData).forEach(([pieceId, pieceData]) => {
              if (!lastUpdate[pieceId] || 
                  (pieceData.lastUpdate > lastUpdate[pieceId] && 
                   pieceData.lastUpdate > (Date.now() - 1000))) {
                lastUpdate[pieceId] = pieceData.lastUpdate;
                onPieceMove?.(pieceId, pieceData.currentPosition, pieceData.rotation);
              }
            });
          }
        });

        // Listen for game state changes
        onValue(stateRef, (snapshot) => {
          const stateData = snapshot.val();
          if (stateData) {
            setGameState(stateData);
          }
        });

        setIsLoading(false);
      } catch (err) {
        console.error('Error setting up multiplayer:', err);
        setError('Failed to initialize multiplayer');
        onError?.('Failed to initialize multiplayer');
        setIsLoading(false);
      }
    };

    initializeMultiplayer();

    // Cleanup listeners
    return () => {
      if (playersRef) off(playersRef);
      if (piecesRef) off(piecesRef);
      if (stateRef) off(stateRef);
    };
  }, [puzzleId, imageUrl, isHost, onPieceMove, onPlayerJoin, onError, initializePuzzlePieces]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
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
              aria-label="Copy invite link"
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
              </li>
            ))}
          </ul>
        )}
      </div>

      {gameState && gameState.status === 'completed' && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-600">Puzzle completed! 🎉</p>
        </div>
      )}
    </div>
  );
};

export default MultiplayerManager;