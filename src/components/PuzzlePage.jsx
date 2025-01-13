// src/components/PuzzlePage.jsx
import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDatabase, ref, set, get } from 'firebase/database';
import { auth } from '../firebase';
import PuzzleViewer from './PuzzleViewer';
import PuzzleImageUploader from './PuzzleImageUploader';
import MultiplayerManager from './MultiplayerManager';

const PuzzlePage = () => {
  const [imageUrl, setImageUrl] = useState(null);
  const [dimensions, setDimensions] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [puzzleState, setPuzzleState] = useState({
    pieces: [],
    completed: false
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const { puzzleId } = useParams();
  const navigate = useNavigate();

  // Initialize puzzle or load existing one
  useEffect(() => {
    const initializePuzzle = async () => {
      try {
        setLoading(true);
        const db = getDatabase();
        const puzzleRef = ref(db, `puzzles/${puzzleId}`);
        
        const snapshot = await get(puzzleRef);
        const puzzleData = snapshot.val();

        if (puzzleData) {
          // Existing puzzle
          setImageUrl(puzzleData.imageUrl);
          setDimensions(puzzleData.dimensions);
          setPuzzleState({
            pieces: puzzleData.pieces || [],
            completed: puzzleData.completed || false
          });
          setIsHost(puzzleData.hostId === auth.currentUser?.uid);
        } else if (!puzzleId) {
          // New puzzle
          setIsHost(true);
          // Generate a new puzzleId
          const newPuzzleId = `puzzle-${Date.now()}`;
          navigate(`/puzzle/${newPuzzleId}`, { replace: true });
        } else {
          setError('Puzzle not found');
        }
      } catch (err) {
        console.error('Error initializing puzzle:', err);
        setError('Failed to load puzzle');
      } finally {
        setLoading(false);
      }
    };

    initializePuzzle();
  }, [puzzleId, navigate]);

  const handleImageProcessed = useCallback(async ({ imageUrl, dimensions }) => {
    try {
      setImageUrl(imageUrl);
      setDimensions(dimensions);

      // Save puzzle data to Firebase
      const db = getDatabase();
      const puzzleRef = ref(db, `puzzles/${puzzleId}`);
      
      await set(puzzleRef, {
        imageUrl,
        dimensions,
        hostId: auth.currentUser.uid,
        createdAt: Date.now(),
        status: 'active',
        pieces: [],
        players: [
          {
            id: auth.currentUser.uid,
            name: auth.currentUser.displayName || 'Anonymous',
            isHost: true
          }
        ]
      });
    } catch (err) {
      console.error('Error saving puzzle:', err);
      setError('Failed to save puzzle');
    }
  }, [puzzleId]);

  const handlePieceClick = useCallback((pieceData) => {
    if (!puzzleState.completed) {
      // Handle piece movement logic
      const updatedPieces = [...puzzleState.pieces];
      const pieceIndex = updatedPieces.findIndex(p => p.id === pieceData.id);
      
      if (pieceIndex >= 0) {
        updatedPieces[pieceIndex] = {
          ...updatedPieces[pieceIndex],
          ...pieceData
        };
      } else {
        updatedPieces.push(pieceData);
      }

      setPuzzleState(prev => ({
        ...prev,
        pieces: updatedPieces
      }));
    }
  }, [puzzleState.completed, puzzleState.pieces]);

  const handlePieceMove = useCallback((pieceId, position, rotation) => {
    setPuzzleState(prev => ({
      ...prev,
      pieces: prev.pieces.map(piece => 
        piece.id === pieceId 
          ? { ...piece, position, rotation }
          : piece
      )
    }));
  }, []);

  const handlePlayerJoin = useCallback((player) => {
    console.log(`Player joined: ${player.name}`);
    // Additional player join logic if needed
  }, []);

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">{error}</p>
        <button 
          onClick={() => navigate('/dashboard')}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="puzzle-page min-h-screen bg-gray-50">
      {isHost && !imageUrl && (
        <div className="max-w-xl mx-auto pt-8 px-4">
          <h2 className="text-2xl font-bold mb-4">Create New Puzzle</h2>
          <PuzzleImageUploader onImageProcessed={handleImageProcessed} />
        </div>
      )}

      {imageUrl && (
        <div className="puzzle-container relative">
          <PuzzleViewer
            imageUrl={imageUrl}
            dimensions={dimensions}
            onPieceClick={handlePieceClick}
            isMultiPlayer={true}
          />
          
          <div className="absolute top-4 right-4 z-10">
            <MultiplayerManager
              puzzleId={puzzleId}
              isHost={isHost}
              onPieceMove={handlePieceMove}
              onPlayerJoin={handlePlayerJoin}
            />
          </div>

          {puzzleState.completed && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="bg-white p-6 rounded-lg shadow-xl">
                <h3 className="text-2xl font-bold mb-4">Puzzle Completed!</h3>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PuzzlePage;