import React, { useState, useEffect, useRef } from 'react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update, get } from 'firebase/database';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Share2, Play, Users, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Home } from 'lucide-react';
import { handlePuzzleCompletion, isPuzzleComplete } from './PuzzleCompletionHandler';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import html2canvas from 'html2canvas';

const MultiplayerPuzzle = ({ puzzleId, gameId}) => {
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData.uid;
  const userName = userData.displayName || userData.email;

  const [gameState, setGameState] = useState({
    gameId: gameId || window.location.pathname.split('/').pop() || `game-${Date.now()}`,
    // gameId: window.location.pathname.split('/').pop() || `game-${userId}-${Date.now()}`,
    imageUrl: '',
    isHost: false,
    difficulty: 3, 
    timer: 0,
    imageSize: { width: 0, height: 0 }, 
    startTime: null, 
    lastUpdateTime: null
  });

  const isTimerRunning = useRef(false);
  const [winner, setWinner] = useState(null);

  // Function to get player with highest score
  const getHighestScoringPlayer = () => {
    return Object.values(players).reduce((highest, current) => {
      return (!highest || current.score > highest.score) ? current : highest;
    }, null);
  };

  const WinnerNotification = ({ winner }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h3 className="text-xl font-bold mb-4">🎉 Puzzle Completed!</h3>
        <p className="text-lg mb-4">
          Winner: <span className="font-bold">{winner.name}</span>
        </p>
        <p className="mb-4">Score: {winner.score}</p>
        <p className="mb-4">Time: {Math.floor(gameState.timer / 60)}:{String(gameState.timer % 60).padStart(2, '0')}</p>
        <button
          onClick={() => setWinner(null)}
          className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Close
        </button>
      </div>
    </div>
  );

  const [showShareModal, setShowShareModal] = useState(false);
  const puzzleContainerRef = useRef(null);

  const capturePuzzleImage = async () => {
    if (!puzzleContainerRef.current) return null;
    try {
      const canvas = await html2canvas(puzzleContainerRef.current);
      return canvas.toDataURL('image/png');
    } catch (err) {
      console.error('Failed to capture puzzle image:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to capture puzzle image' }
      }));
      return null;
    }
  };

  const downloadPuzzleImage = async () => {
    const imageData = await capturePuzzleImage();
    if (!imageData) return;

    const link = document.createElement('a');
    link.href = imageData;
    link.download = `puzzle-${gameState.gameId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const shareToFacebook = () => {
    const url = encodeURIComponent(`${window.location.origin}/#/puzzle/multiplayer/${gameState.gameId}`);
    const text = encodeURIComponent(`I just completed a ${gameState.difficulty}x${gameState.difficulty} puzzle in ${Math.floor(gameState.timer / 60)}:${String(gameState.timer % 60).padStart(2, '0')}! Try it yourself!`);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank');
  };

  const shareToTwitter = () => {
    const url = encodeURIComponent(`${window.location.origin}/#/puzzle/multiplayer/${gameState.gameId}`);
    const text = encodeURIComponent(`I just completed a ${gameState.difficulty}x${gameState.difficulty} puzzle in ${Math.floor(gameState.timer / 60)}:${String(gameState.timer % 60).padStart(2, '0')}! Try it yourself! #PuzzleGame`);
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
  };

  const shareToWhatsApp = () => {
    const url = encodeURIComponent(`${window.location.origin}/#/puzzle/multiplayer/${gameState.gameId}`);
    const text = encodeURIComponent(`I just completed a ${gameState.difficulty}x${gameState.difficulty} puzzle in ${Math.floor(gameState.timer / 60)}:${String(gameState.timer % 60).padStart(2, '0')}! Try it yourself!`);
    window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
  };


  const ShareModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h3 className="text-xl font-bold mb-4">Share Your Achievement</h3>
        <div className="space-y-4">
          <button
            onClick={shareToFacebook}
            className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Share on Facebook
          </button>
          <button
            onClick={shareToTwitter}
            className="w-full p-3 bg-sky-400 text-white rounded hover:bg-sky-500"
          >
            Share on Twitter
          </button>
          <button
            onClick={shareToWhatsApp}
            className="w-full p-3 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Share on WhatsApp
          </button>
          <button
            onClick={downloadPuzzleImage}
            className="w-full p-3 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Download Image
          </button>
        </div>
        <button
          onClick={() => setShowShareModal(false)}
          className="mt-4 w-full p-2 border border-gray-300 rounded hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  );

  const [pieces, setPieces] = useState([]);
  const [players, setPlayers] = useState({});
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [ui, setUi] = useState({
    zoom: 1,
    selectedPiece: null,
    draggedPiece: null,
    error: null,
    showPlayers: true,
    loading: true,
    gridDimensions: { width: 0, height: 0 },
    cellDimensions: { width: 0, height: 0 }
  });

  const storage = getStorage();
  const database = getDatabase();

  

  const user = { 
    id: userId || `user-${Date.now()}`, 
    name: userName || `Player ${Math.floor(Math.random() * 1000)}` 
  };

  const navigate = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => {
    let timerInterval;

    const updateTimer = async () => {
      if (!gameState.startTime || !isGameStarted || gameState.isCompleted) return;

      const newTimer = Math.floor((Date.now() - gameState.startTime) / 1000);

      try {
        await update(dbRef(database, `games/${gameState.gameId}`), { timer: newTimer });
        setGameState(prev => ({ ...prev, timer: newTimer }));
      } catch (err) {
        console.error('Failed to update timer:', err);
      }
    };

    if (isGameStarted && gameState.startTime && !gameState.isCompleted) {
      timerInterval = setInterval(updateTimer, 1000);
    }

    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [isGameStarted, gameState.startTime, gameState.isCompleted]);


  useEffect(() => {
    try {
      if (!localStorage.getItem('userId')) {
        localStorage.setItem('userId', user.id);
        localStorage.setItem('userName', user.name);
      }
    } catch (err) {
      console.error('Failed to save user info to localStorage:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to save user information' }
      }));
    }
  }, [user.id, user.name]);

  useEffect(() => {
    let unsubscribe;
    const gameRef = dbRef(database, `games/${gameState.gameId}`);
    
    const initializeGame = async () => {
      try {
        const snapshot = await get(gameRef);
        const data = snapshot.val();
        
        if (!data) {
          // New game - set up initial state with current difficulty
          await set(gameRef, {
            players: {
              [userId]: {
                id: userId,
                name: userName,
                score: 0,
                color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
                isHost: true
              }
            },
            imageUrl: '',
            isGameStarted: false,
            timer: 0,
            difficulty: gameState.difficulty, // Ensure difficulty is set in Firebase
            startTime: null, // Ensure startTime is set to null in Firebase
            imageSize: gameState.imageSize // Ensure imageSize is set in Firebase
          });
          setGameState(prev => ({ ...prev, isHost: true }));
        } else {
          // Join existing game - get difficulty from Firebase
          setGameState(prev => ({
            ...prev,
            difficulty: data.difficulty || 3,
            isHost: data.players?.[userId]?.isHost || false,
            startTime: data.startTime || null, // Get startTime from Firebase
            imageSize: data.imageSize || { width: 0, height: 0 } // Get imageSize from Firebase
          }));
          
          if (!data.players?.[userId]) {
            const playerUpdate = {
              [`players/${userId}`]: {
                id: userId,
                name: userName,
                score: 0,
                color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
                isHost: false
              }
            };
            await update(gameRef, playerUpdate);
          }
        }
        setUi(prev => ({ ...prev, loading: false }));
      } catch (err) {
        console.error('Failed to initialize game:', err);
        setUi(prev => ({
          ...prev,
          loading: false,
          error: { type: 'error', message: 'Failed to initialize game' }
        }));
      }
    };

    const setupListeners = () => {
      unsubscribe = onValue(gameRef, (snapshot) => {
        try {
          const data = snapshot.val();
          if (data) {
            setGameState(prev => ({
              ...prev,
              imageUrl: data.imageUrl || '',
              difficulty: data.difficulty || 3,
              timer: data.timer || 0
            }));
            setPlayers(data.players || {});
            setPieces(data.pieces || []);
            setIsGameStarted(data.isGameStarted || false);
          }
        } catch (err) {
          console.error('Error processing game update:', err);
          setUi(prev => ({
            ...prev,
            error: { type: 'error', message: 'Failed to process game update' }
          }));
        }
      }, (error) => {
        console.error('Database listener error:', error);
        setUi(prev => ({
          ...prev,
          error: { type: 'error', message: 'Lost connection to game' }
        }));
      });
    };

    initializeGame();
    setupListeners();

    // Cleanup
    return () => {
      if (unsubscribe) unsubscribe();
      if (timerRef.current) clearInterval(timerRef.current);
      try {
        // Remove player when they leave
        const updates = {};
        updates[`games/${gameState.gameId}/players/${userId}`] = null;
        update(dbRef(database), updates);
      } catch (err) {
        console.error('Error during cleanup:', err);
      }
    };
  }, [gameState.gameId, userId, database]);

  useEffect(() => {
    if (isGameStarted) {
      if (!gameState.startTime) {
        const startTime = Date.now();
        setGameState(prev => ({ ...prev, startTime }));
        timerRef.current = setInterval(() => {
          const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
          console.log(`Timer updated: ${elapsedSeconds} seconds`); // Log timer updates
          setGameState(prev => ({ ...prev, timer: elapsedSeconds }));
        }, 1000);
      }
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isGameStarted]);

  useEffect(() => {
  const checkCompletion = async () => {
    const totalPieces = pieces.length;
    const correctlyPlaced = pieces.filter(p => p.isPlaced).length;

    if (isGameStarted && totalPieces > 0 && totalPieces === correctlyPlaced) {
      if (isPuzzleComplete(pieces)) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        try {
          const highestScoringPlayer = getHighestScoringPlayer();

          if (highestScoringPlayer.id === userId) {
            const completionTime = Date.now() - gameState.startTime;

            // First, handle the puzzle completion record
            const completionData = {
              puzzleId: gameState.gameId,
              userId: userId,
              playerName: userName,
              startTime: gameState.startTime,
              difficulty: gameState.difficulty,
              imageUrl: gameState.imageUrl,
              timer: completionTime / 1000
            };

            console.log('Data sent to handlePuzzleCompletion:', completionData);
            await handlePuzzleCompletion(completionData);

            const gameRef = dbRef(database, `games/${gameState.gameId}`);
            const playerSnapshot = await get(dbRef(database, `games/${gameState.gameId}/players/${highestScoringPlayer.id}`));
            const currentScore = playerSnapshot.val()?.score || 0;

            console.log("current-score", currentScore);

            await update(gameRef, { 
              isGameStarted: false, 
              completionTime,
              winner: {
                name: highestScoringPlayer.name,
                score: currentScore + 1, // Use the fetched current score
                id: highestScoringPlayer.id
              }
            });

            await update(dbRef(database, `games/${gameState.gameId}/players/${highestScoringPlayer.id}`), {
              score: currentScore + 1
            });

            const playerScoreUpdate = {
              [`players/${highestScoringPlayer.id}/score`]: currentScore + 1
            };
            await update(gameRef, playerScoreUpdate);

            // Show winner notification
            setWinner(highestScoringPlayer);

            // Show share modal
            setShowShareModal(true);

            setUi(prev => ({
              ...prev,
              error: { 
                type: 'success', 
                message: `Puzzle completed by ${highestScoringPlayer.name}! They win with a score of ${highestScoringPlayer.score + 1}!` 
              }
            }));
          } else {
            // Notify other players they can't complete the puzzle
            setUi(prev => ({
              ...prev,
              error: { 
                type: 'info', 
                message: `Only ${highestScoringPlayer.name} (highest score) can complete the puzzle!` 
              }
            }));
          }
        } catch (err) {
          console.error('Failed to record completion:', err);
          setUi(prev => ({
            ...prev,
            error: { 
              type: 'error', 
              message: 'Failed to record puzzle completion' 
            }
          }));
        }
      }
    }
  };

  checkCompletion();
}, [pieces, isGameStarted, userId, players]);

  const clearSession = async () => {
    try {
      const updates = {};
      updates[`games/${gameState.gameId}/players/${userId}`] = null;
      await update(dbRef(database), updates);

      localStorage.removeItem('userId');
      localStorage.removeItem('userName');

      const gameRef = dbRef(database, `games/${gameState.gameId}`);
      const snapshot = await get(gameRef);
      const data = snapshot.val();
      
      if (gameState.isHost && (!data?.players || Object.keys(data.players).length === 0)) {
        await set(gameRef, null);
      }

      navigate('/');
    } catch (err) {
      console.error('Failed to clear session:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to clear session' }
      }));
    }
  };

  const leaveSession = async () => {
    try {
      const updates = {};
      updates[`games/${gameState.gameId}/players/${userId}`] = null;
      await update(dbRef(database), updates);

      navigate('/');
    } catch (err) {
      console.error('Failed to leave session:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to leave session' }
      }));
    }
  };
  
  const handleImageUpload = async (event) => {
    if (!gameState.isHost) return;
    
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUi(prev => ({ ...prev, loading: true, error: null }));
      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      const img = new Image();
      img.onload = async () => {
        try {
          const updates = {
            [`games/${gameState.gameId}/imageUrl`]: url,
            [`games/${gameState.gameId}/imageSize`]: {
              width: img.width,
              height: img.height
            }
          };
          await update(dbRef(database), updates);
          setUi(prev => ({ ...prev, loading: false }));
        } catch (err) {
          throw new Error('Failed to update game with image information');
        }
      };
      img.onerror = () => {
        throw new Error('Failed to load image');
      };
      img.src = url;
    } catch (err) {
      console.error('Image upload error:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: err.message || 'Failed to upload image' },
        loading: false
      }));
    }
  };

  const initializePuzzle = async () => {
    if (!gameState.imageUrl || !gameState.isHost) return;
  
    try {
      setUi(prev => ({ ...prev, loading: true, error: null }));
      const newPieces = [];
      const availablePositions = [];
  
      // Create a list of all possible positions
      for (let i = 0; i < gameState.difficulty; i++) {
        for (let j = 0; j < gameState.difficulty; j++) {
          availablePositions.push({ x: i, y: j });
        }
      }
  
      for (let i = 0; i < gameState.difficulty; i++) {
        for (let j = 0; j < gameState.difficulty; j++) {
          // Randomly select a position from the available positions
          const randomIndex = Math.floor(Math.random() * availablePositions.length);
          const position = availablePositions.splice(randomIndex, 1)[0];
          const isPlaced = position.x === i && position.y === j;
  
          newPieces.push({
            id: `piece-${i}-${j}`,
            correct: { x: i, y: j },
            current: { x: position.x, y: position.y },
            rotation: 0,
            isPlaced: isPlaced
          });
        }
      }
  
      const startTime = Date.now();
  
      const updates = {
        [`games/${gameState.gameId}/pieces`]: newPieces,
        [`games/${gameState.gameId}/isGameStarted`]: true,
        [`games/${gameState.gameId}/startTime`]: Date.now(), // Set startTime in Firebase
        [`games/${gameState.gameId}/timer`]: 0,
        [`games/${gameState.gameId}/lastUpdateTime`]: startTime
      };
      
      await update(dbRef(database), updates);
      setUi(prev => ({ ...prev, loading: false }));
    } catch (err) {
      console.error('Failed to initialize puzzle:', err);
      setUi(prev => ({
        ...prev,
        loading: false,
        error: { type: 'error', message: 'Failed to start game' }
      }));
    }
  };
  

  const handleDrop = async (x, y) => {
    if (!ui.draggedPiece) return;

    try {
      const updatedPieces = pieces.map(p => {
        if (p.id === ui.draggedPiece.id) {
          const isCorrect = x === p.correct.x && 
                           y === p.correct.y && 
                           p.rotation % 360 === 0;
          
          return { ...p, current: { x, y }, isPlaced: isCorrect };
        } else if (p.current.x === x && p.current.y === y) {
          // Swap the piece that was in the target cell
          return { ...p, current: { x: ui.draggedPiece.current.x, y: ui.draggedPiece.current.y } };
        }
        return p;
      });

      const updates = {};
      updates[`games/${gameState.gameId}/pieces`] = updatedPieces;
      
      if (updatedPieces.find(p => p.id === ui.draggedPiece.id)?.isPlaced) {
        updates[`games/${gameState.gameId}/players/${userId}/score`] = 
          ((players[userId]?.score || 0) + 1);
      }

      await update(dbRef(database), updates);
      setUi(prev => ({ ...prev, draggedPiece: null }));
    } catch (err) {
      console.error('Failed to update piece position:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to move piece' },
        draggedPiece: null
      }));
    }
  };

  const handleRotate = async (direction) => {
    if (!ui.selectedPiece) return;

    try {
      const updatedPieces = pieces.map(p => {
        if (p.id === ui.selectedPiece.id) {
          const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
          const isCorrect = p.correct.x === p.current.x && 
                           p.correct.y === p.current.y && 
                           newRotation % 360 === 0;
          
          return { ...p, rotation: newRotation, isPlaced: isCorrect };
        }
        return p;
      });

      const updates = {};
      updates[`games/${gameState.gameId}/pieces`] = updatedPieces;
      
      if (updatedPieces.find(p => p.id === ui.selectedPiece.id)?.isPlaced) {
        updates[`games/${gameState.gameId}/players/${userId}/score`] = 
          ((players[userId]?.score || 0) + 1);
      }

      await update(dbRef(database), updates);
    } catch (err) {
      console.error('Failed to rotate piece:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to rotate piece' }
      }));
    }
  };

  const copyGameLink = async () => {
    const link = `${window.location.origin}/#/puzzle/multiplayer/${gameState.gameId}`;
    console.log('Copying game link:', link);
    console.log('game_id:', gameState.gameId);
    try {
      await navigator.clipboard.writeText(link);
      setUi(prev => ({
        ...prev,
        error: { type: 'success', message: 'Game link copied! Share with friends to play.' }
      }));
    } catch (err) {
      console.error('Failed to copy game link:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to copy game link' }
      }));
    }
  };

  const handleDifficultyChange = async (event) => {
    if (!gameState.isHost) return;
    
    const newDifficulty = parseInt(event.target.value, 10);
    try {
      // Update difficulty in Firebase
      const updates = {
        [`games/${gameState.gameId}/difficulty`]: newDifficulty
      };
      await update(dbRef(database), updates);
      
      // Update local state
      setGameState(prev => ({ ...prev, difficulty: newDifficulty }));
      
      // If game hasn't started, clear any existing pieces
      if (!isGameStarted) {
        const clearPieces = {
          [`games/${gameState.gameId}/pieces`]: []
        };
        await update(dbRef(database), clearPieces);
      }
    } catch (err) {
      console.error('Failed to update difficulty:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to update difficulty' }
      }));
    }
  };

  const startNewGame = async () => {
    try {
      const newGameId = `game-${Date.now()}`;
      const newGameRef = dbRef(database, `games/${newGameId}`);
      
      await set(newGameRef, {
        players: {
          [userId]: {
            id: userId,
            name: userName,
            score: 0,
            color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
            isHost: true
          }
        },
        imageUrl: '',
        isGameStarted: false,
        timer: 0,
        difficulty: gameState.difficulty
      });
  
      navigate(`/puzzle/multiplayer/${newGameId}`);
    } catch (err) {
      console.error('Failed to start new game:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to start new game' }
      }));
    }
  };

  const calculateCompletionPercentage = () => {
    const totalPieces = pieces.length;
    const correctlyPlaced = pieces.filter(p => p.isPlaced).length;
    return totalPieces > 0 ? (correctlyPlaced / totalPieces) * 100 : 0;
  };

  const completionPercentage = calculateCompletionPercentage();
  const data = {
    labels: ['Completion'],
    datasets: [
      {
        label: 'Completion Percentage',
        data: [completionPercentage],
        backgroundColor: ['rgba(75, 192, 192, 0.6)'],
        borderColor: ['rgba(75, 192, 192, 1)'],
        borderWidth: 1,
      },
    ],
  };

  if (ui.loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-lg shadow-lg max-w-6xl mx-auto">
      <div className="flex items-center justify-between border-b pb-4">
        <h1 className="text-2xl font-bold">Multiplayer Puzzle</h1>
        <div className="text-lg font-semibold">{`Time: ${Math.floor(gameState.timer / 60)}:${String(gameState.timer % 60).padStart(2, '0')}`}</div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/')}
            className="p-2 border rounded hover:bg-gray-100 text-gray-600"
            title="Return Home"
          >
            <Home className="h-4 w-4" />
          </button>
          <button
            onClick={leaveSession}
            className="p-2 border rounded hover:bg-red-50 text-red-600"
            title="Leave Session"
          >
            <LogOut className="h-4 w-4" />
          </button>
          {gameState.isHost && (
            <button
              onClick={clearSession}
              className="px-3 py-2 border rounded hover:bg-red-50 text-red-600 text-sm"
              title="Clear Session"
            >
              Clear Session
            </button>
          )}
        </div>
      </div>

      {gameState.isHost && !isGameStarted && (
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <label htmlFor="difficulty" className="font-medium">
            Puzzle Size: {gameState.difficulty}x{gameState.difficulty}
          </label>
          <input
            type="range"
            id="difficulty"
            min="2"
            max="8"
            value={gameState.difficulty}
            onChange={handleDifficultyChange}
            className="flex-1"
          />
          <span className="text-sm text-gray-600">
            ({gameState.difficulty * gameState.difficulty} pieces)
          </span>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => setUi(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.1, 0.5) }))}
          className="p-2 border rounded hover:bg-gray-100"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => setUi(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.1, 2) }))}
          className="p-2 border rounded hover:bg-gray-100"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        {ui.selectedPiece && (
          <>
            <button
              onClick={() => handleRotate('left')}
              className="p-2 border rounded hover:bg-gray-100"
              title="Rotate Left"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleRotate('right')}
              className="p-2 border rounded hover:bg-gray-100"
              title="Rotate Right"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </>
        )}
        <button
          onClick={() => setUi(prev => ({ ...prev, showPlayers: !prev.showPlayers }))}
          className="p-2 border rounded hover:bg-gray-100"
          title="Toggle Players"
        >
          <Users className="h-4 w-4" />
        </button>
        <button
          onClick={copyGameLink}
          className="p-2 border rounded hover:bg-gray-100"
          title="Share Game"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <button
          onClick={startNewGame}
          className="p-2 border rounded hover:bg-gray-100"
          title="Start New Game"
        >
          <Play className="h-4 w-4" />
        </button>

        {gameState.isCompleted && (
          <button
            onClick={() => setShowShareModal(true)}
            className="p-2 border rounded hover:bg-gray-100"
            title="Share"
          >
            <Share2 className="h-4 w-4" />
          </button>
        )}

        {gameState.isHost && !isGameStarted && (
          <button
            onClick={initializePuzzle}
            className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!gameState.imageUrl}
            title="Start Game"
          >
            <Play className="h-4 w-4" />
          </button>
        )}
      </div>

      {ui.error && (
        <div 
          className={`p-3 rounded ${
            ui.error.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}
          role="alert"
        >
          {ui.error.message}
        </div>
      )}

      <div ref={puzzleContainerRef} className="flex gap-4"> 
      {/* <div className="flex gap-4"> */}
        <div className="flex-1">
          {gameState.isHost && !gameState.imageUrl ? (
            <div className="w-full p-8 border-2 border-dashed rounded-lg text-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full"
              />
              <p className="mt-2 text-sm text-gray-500">Upload an image to start the game</p>
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <img src={gameState.imageUrl} alt="Expected output" className="w-1/4 h-1/4 lg:w-1/6 lg:h-1/6 object-contain rounded border" />
              </div>
              <div 
                className="grid gap-1 transition-transform duration-200"
                style={{
                  gridTemplateColumns: `repeat(${gameState.difficulty}, 1fr)`,
                  transform: `scale(${ui.zoom})`,
                  transformOrigin: 'top left'
                }}
                ref={(el) => {
                  if (el && (ui.gridDimensions.width !== el.offsetWidth || ui.gridDimensions.height !== el.offsetHeight)) {
                    setUi(prev => ({ ...prev, gridDimensions: { width: el.offsetWidth, height: el.offsetHeight } }));
                  }
                }}
              >
                {Array.from({ length: gameState.difficulty * gameState.difficulty }).map((_, index) => {
                  const x = Math.floor(index / gameState.difficulty);
                  const y = index % gameState.difficulty;
                  
                  return (
                    <div
                      key={`cell-${x}-${y}`}
                      className="aspect-square bg-gray-100 rounded-lg relative"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(x, y)}
                      ref={(el) => {
                        if (el && (ui.cellDimensions.width !== el.offsetWidth || ui.cellDimensions.height !== el.offsetHeight)) {
                          setUi(prev => ({
                            ...prev,
                            cellDimensions: { width: el.offsetWidth, height: el.offsetHeight }
                          }));
                        }
                      }}
                    >
                      {pieces.map(piece => {
                        if (piece.current.x === x && piece.current.y === y) {
                          const gridWidth = ui.gridDimensions?.width || 0;
                          const gridHeight = ui.gridDimensions?.height || 0;
                          const cellWidth = ui.cellDimensions?.width || 0;
                          const cellHeight = ui.cellDimensions?.height || 0;
                          const backgroundSize = `${gridWidth}px ${gridHeight}px`;
                          const backgroundPosition = `${-piece.correct.y * cellWidth}px ${-piece.correct.x * cellHeight}px`;

                          return (
                            <div
                              key={piece.id}
                              draggable
                              className={`absolute inset-0 rounded-lg cursor-move bg-cover
                                ${piece.isPlaced ? 'ring-2 ring-green-500' : ''}
                                ${ui.selectedPiece?.id === piece.id ? 'ring-2 ring-blue-500' : ''}`}
                              style={{
                                backgroundImage: `url(${gameState.imageUrl})`,
                                backgroundSize,
                                backgroundPosition,
                                transform: `rotate(${piece.rotation}deg)`
                              }}
                              onDragStart={() => setUi(prev => ({ ...prev, draggedPiece: piece }))}
                              onClick={() => setUi(prev => ({
                                ...prev,
                                selectedPiece: prev.selectedPiece?.id === piece.id ? null : piece
                              }))}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-4 text-sm mt-4">
                <div>Total Pieces: {pieces.length}</div>
                <div>Correctly Placed: {pieces.filter(p => p.isPlaced).length}</div>
                <div>Remaining: {pieces.length - pieces.filter(p => p.isPlaced).length}</div>
                <div>Completion: {calculateCompletionPercentage().toFixed(2)}%</div>
              </div>
              <div className="mt-4">
                <Bar data={data} options={{ scales: { y: { beginAtZero: true, max: 100 } } }} />
              </div>
            </>
          )}
        </div>

        


        {ui.showPlayers && (
          <div className="w-64 bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-4">Players</h3>
            <div className="space-y-2">
              {Object.values(players).map(player => (
                <div 
                  key={player.id}
                  className="flex items-center gap-2 p-2 bg-white rounded"
                >
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: player.color }}
                  />
                  <span>{player.name}</span>
                  <span className="ml-auto">{player.score || 0}</span>
                  {player.isHost && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Host
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add winner notification */}
      {winner && <WinnerNotification winner={winner} />}
      
      {showShareModal && <ShareModal />}
    </div>
  );
};

export default MultiplayerPuzzle;