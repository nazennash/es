import React, { useEffect, useState, useCallback } from 'react';
import { getDatabase, ref, onValue, set, update, off } from 'firebase/database';
import { generateInviteLink } from '../utils/inviteHelper';

const MultiplayerManager = ({ puzzleId, isHost, onPieceMove, onPlayerJoin }) => {
  const [players, setPlayers] = useState([]);
  const [inviteLink, setInviteLink] = useState('');
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Memoize the movePiece function to prevent unnecessary re-renders
  const movePiece = useCallback(async (pieceId, position, rotation) => {
    try {
      const db = getDatabase();
      const pieceRef = ref(db, `puzzles/${puzzleId}/pieces/${pieceId}`);
      
      await update(pieceRef, {
        position,
        rotation,
        lastUpdate: Date.now()
      });
    } catch (err) {
      console.error('Error updating piece position:', err);
      setError('Failed to update piece position');
    }
  }, [puzzleId]);

  useEffect(() => {
    let playersRef;
    let piecesRef;

    const initializeMultiplayer = async () => {
      try {
        const db = getDatabase();
        const puzzleRef = ref(db, `puzzles/${puzzleId}`);
        playersRef = ref(db, `puzzles/${puzzleId}/players`);
        piecesRef = ref(db, `puzzles/${puzzleId}/pieces`);

        // Set up initial puzzle state if host
        if (isHost) {
          const link = generateInviteLink(puzzleId);
          setInviteLink(link);
          
          await set(puzzleRef, {
            pieces: [],
            players: [],
            status: 'active',
            createdAt: Date.now()
          });
        }

        // Listen for player changes
        onValue(playersRef, (snapshot) => {
          const playersData = snapshot.val();
          if (playersData) {
            const playersList = Object.values(playersData);
            setPlayers(playersList);
            
            // Notify about new players
            const lastPlayer = playersList[playersList.length - 1];
            if (lastPlayer) {
              onPlayerJoin?.(lastPlayer);
            }
          }
        });

        // Listen for piece movements with debouncing
        let lastUpdate = {};
        onValue(piecesRef, (snapshot) => {
          const piecesData = snapshot.val();
          if (piecesData) {
            Object.entries(piecesData).forEach(([pieceId, pieceData]) => {
              if (!lastUpdate[pieceId] || 
                  (pieceData.lastUpdate > lastUpdate[pieceId] && 
                   pieceData.lastUpdate > (Date.now() - 1000))) {
                lastUpdate[pieceId] = pieceData.lastUpdate;
                onPieceMove?.(pieceId, pieceData.position, pieceData.rotation);
              }
            });
          }
        });

      } catch (err) {
        console.error('Error setting up multiplayer:', err);
        setError('Failed to initialize multiplayer');
      }
    };

    initializeMultiplayer();

    // Cleanup listeners
    return () => {
      if (playersRef) off(playersRef);
      if (piecesRef) off(piecesRef);
    };
  }, [puzzleId, isHost, onPieceMove, onPlayerJoin]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setError('Failed to copy invite link');
    }
  };

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">{error}</p>
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
              onClick={handleCopyLink}
              className={`px-4 py-2 rounded transition-colors ${
                copySuccess 
                  ? 'bg-green-500 hover:bg-green-600' 
                  : 'bg-blue-500 hover:bg-blue-600'
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
    </div>
  );
};

export default MultiplayerManager;