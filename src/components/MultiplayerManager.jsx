import React, { useEffect, useState } from 'react';
import { getDatabase, ref, onValue, set, update, off } from 'firebase/database';
import { generateInviteLink } from '../utils/inviteHelper';

const MultiplayerManager = ({ puzzleId, isHost, onPieceMove, onPlayerJoin }) => {
  const [players, setPlayers] = useState([]);
  const [inviteLink, setInviteLink] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const db = getDatabase();
      const puzzleRef = ref(db, `puzzles/${puzzleId}`);
      const playersRef = ref(db, `puzzles/${puzzleId}/players`);
      const piecesRef = ref(db, `puzzles/${puzzleId}/pieces`);

      // Set up initial puzzle state if host
      if (isHost) {
        const link = generateInviteLink(puzzleId);
        setInviteLink(link);
        
        set(puzzleRef, {
          pieces: [],
          players: [],
          status: 'active'
        }).catch(err => {
          console.error('Error initializing puzzle state:', err);
          setError('Failed to initialize puzzle state');
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
            onPlayerJoin(lastPlayer);
          }
        }
      });

      // Listen for piece movements
      onValue(piecesRef, (snapshot) => {
        const piecesData = snapshot.val();
        if (piecesData) {
          Object.entries(piecesData).forEach(([pieceId, pieceData]) => {
            if (pieceData.lastUpdate > (Date.now() - 1000)) { // Only process recent updates
              onPieceMove(pieceId, pieceData.position, pieceData.rotation);
            }
          });
        }
      });

      // Cleanup listeners
      return () => {
        off(playersRef);
        off(piecesRef);
      };
    } catch (err) {
      console.error('Error setting up multiplayer:', err);
      setError('Failed to initialize multiplayer');
    }
  }, [puzzleId, isHost]);

  const movePiece = (pieceId, position, rotation) => {
    const db = getDatabase();
    const pieceRef = ref(db, `puzzles/${puzzleId}/pieces/${pieceId}`);
    
    update(pieceRef, {
      position,
      rotation,
      lastUpdate: Date.now()
    }).catch(err => {
      console.error('Error updating piece position:', err);
    });
  };

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="multiplayer-container">
      {isHost && (
        <div className="invite-section p-4 bg-white rounded-lg shadow mb-4">
          <h3 className="text-lg font-semibold mb-2">Invite Players</h3>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={inviteLink}
              readOnly
              className="flex-1 p-2 border rounded"
            />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteLink);
                  // Could add toast notification here
                } catch (err) {
                  console.error('Failed to copy:', err);
                }
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Copy
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
          <div className="space-y-2">
            {players.map(player => (
              <div
                key={player.id}
                className="flex items-center space-x-2 p-2 bg-gray-50 rounded"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: player.color }}
                  aria-hidden="true"
                />
                <span>{player.name || 'Anonymous Player'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiplayerManager;