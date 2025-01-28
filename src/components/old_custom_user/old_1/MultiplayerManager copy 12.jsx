import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update, get } from 'firebase/database';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Share2, Play, Users, Download, CameraIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Home } from 'lucide-react';
import { handlePuzzleCompletion, isPuzzleComplete } from './PuzzleCompletionHandler';

const MultiplayerPuzzle3D = ({ puzzleId, gameId, isHost }) => {
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData.uid;
  const userName = userData.displayName || userData.email;

  // Three.js related refs
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const pieceGroupRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const animationFrameRef = useRef(null);
  const timerRef = useRef(null);

  // Game state
  const [gameState, setGameState] = useState({
    gameId: gameId || window.location.pathname.split('/').pop() || `game-${Date.now()}`,
    imageUrl: '',
    isHost: isHost || false,
    difficulty: 3,
    timer: 0,
    imageSize: { width: 0, height: 0, depth: 0.1 },
    startTime: null,
    lastUpdateTime: null,
    isCompleted: false
  });

  console.log(gameState);

  const [pieces, setPieces] = useState([]);
  const [players, setPlayers] = useState({});
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [winner, setWinner] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const [ui, setUi] = useState({
    selectedPiece: null,
    draggedPiece: null,
    error: null,
    showPlayers: true,
    loading: true
  });

  const storage = getStorage();
  const database = getDatabase();
  const navigate = useNavigate();

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Piece group
    const pieceGroup = new THREE.Group();
    scene.add(pieceGroup);
    pieceGroupRef.current = pieceGroup;

    // Event listeners
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const handleMouseMove = (event) => {
      event.preventDefault();
      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    const handleMouseDown = (event) => {
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(pieceGroup.children);
      
      if (intersects.length > 0) {
        const piece = pieces.find(p => p.mesh.id === intersects[0].object.id);
        if (piece) {
          handlePieceSelect(piece);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mousedown', handleMouseDown);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current && mountRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      scene.clear();
    };
  }, []);

  // Firebase real-time updates
  useEffect(() => {
    const gameRef = dbRef(database, `games/${gameState.gameId}`);
    
    try {
      // Set initial loading state
      setUi(prev => ({ ...prev, loading: false }));
      
      const handleGameUpdate = (snapshot) => {
        const data = snapshot.val();
        if (!data) {
          // If no game data, initialize basic state
          setUi(prev => ({ ...prev, loading: false }));
          return;
        }

      setGameState(prev => ({
        ...prev,
        imageUrl: data.imageUrl || '',
        difficulty: data.difficulty || 3,
        timer: data.timer || 0,
        startTime: data.startTime || null,
        isCompleted: data.isCompleted || false
      }));
      
      setPlayers(data.players || {});
      setPieces(data.pieces || []);
      setIsGameStarted(data.isGameStarted || false);

      if (data.winner) {
        setWinner(data.winner);
      }
    };

    const unsubscribe = onValue(gameRef, handleGameUpdate);
    return () => unsubscribe();
  } catch (error) {
    console.error('Firebase initialization error:', error);
    setUi(prev => ({ 
      ...prev, 
      loading: false,
      error: { type: 'error', message: 'Failed to connect to game' }
    }));
  }
}, [gameState.gameId]);

  // Timer management
  useEffect(() => {
    if (isGameStarted && !gameState.isCompleted) {
      timerRef.current = setInterval(() => {
        setGameState(prev => ({
          ...prev,
          timer: Math.floor((Date.now() - prev.startTime) / 1000)
        }));
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isGameStarted, gameState.isCompleted]);

  // Create 3D puzzle pieces
  const createPuzzlePieces = (texture) => {
    const { difficulty, imageSize } = gameState;
    const pieces = [];
    const pieceWidth = imageSize.width / difficulty;
    const pieceHeight = imageSize.height / difficulty;
    const pieceDepth = imageSize.depth;

    for (let i = 0; i < difficulty; i++) {
      for (let j = 0; j < difficulty; j++) {
        for (let k = 0; k < difficulty; k++) {
          const geometry = new THREE.BoxGeometry(pieceWidth, pieceHeight, pieceDepth);
          
          // Create UV mapping for the texture
          const uv = geometry.attributes.uv;
          for (let m = 0; m < uv.count; m++) {
            const u = uv.getX(m);
            const v = uv.getY(m);
            uv.setXY(
              m,
              (i + u) / difficulty,
              (j + v) / difficulty
            );
          }

          const material = new THREE.MeshPhongMaterial({
            map: texture,
            transparent: true
          });

          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(
            (i - difficulty / 2) * pieceWidth,
            (j - difficulty / 2) * pieceHeight,
            (k - difficulty / 2) * pieceDepth
          );
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          pieces.push({
            id: `piece-${i}-${j}-${k}`,
            mesh,
            correct: { x: i, y: j, z: k },
            current: { x: i, y: j, z: k },
            rotation: { x: 0, y: 0, z: 0 },
            isPlaced: false
          });
        }
      }
    }

    return pieces;
  };

  // Handle piece selection
  const handlePieceSelect = (piece) => {
    setUi(prev => ({
      ...prev,
      selectedPiece: prev.selectedPiece?.id === piece.id ? null : piece
    }));
  };

  // Handle piece rotation
  const handleRotate = async (axis, direction) => {
    if (!ui.selectedPiece) return;

    try {
      const rotationAmount = direction === 'left' ? -Math.PI / 2 : Math.PI / 2;
      const updatedPieces = pieces.map(piece => {
        if (piece.id === ui.selectedPiece.id) {
          const newRotation = { ...piece.rotation };
          newRotation[axis] += rotationAmount;
          
          piece.mesh.rotation[axis] += rotationAmount;

          const isCorrect = 
            piece.current.x === piece.correct.x &&
            piece.current.y === piece.correct.y &&
            piece.current.z === piece.correct.z &&
            Math.abs(newRotation.x % (Math.PI * 2)) < 0.1 &&
            Math.abs(newRotation.y % (Math.PI * 2)) < 0.1 &&
            Math.abs(newRotation.z % (Math.PI * 2)) < 0.1;

          return { ...piece, rotation: newRotation, isPlaced: isCorrect };
        }
        return piece;
      });

      await update(dbRef(database, `games/${gameState.gameId}/pieces`), updatedPieces);

      if (updatedPieces.every(p => p.isPlaced)) {
        handlePuzzleComplete();
      }
    } catch (err) {
      console.error('Failed to rotate piece:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to rotate piece' }
      }));
    }
  };

  // Handle puzzle completion
  const handlePuzzleComplete = async () => {
    try {
      const completionTime = Date.now() - gameState.startTime;
      const winner = {
        id: userId,
        name: userName,
        score: (players[userId]?.score || 0) + 1
      };

      await update(dbRef(database, `games/${gameState.gameId}`), {
        isCompleted: true,
        completionTime,
        winner
      });

      await handlePuzzleCompletion({
        puzzleId: gameState.gameId,
        userId,
        playerName: userName,
        startTime: gameState.startTime,
        completionTime,
        difficulty: gameState.difficulty
      });

      setWinner(winner);
      setShowShareModal(true);
    } catch (err) {
      console.error('Failed to handle puzzle completion:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to record completion' }
      }));
    }
  };

  // Initialize puzzle
  const initializePuzzle = async () => {
    if (!gameState.imageUrl || !gameState.isHost) return;

    try {
      setUi(prev => ({ ...prev, loading: true }));

      // Load texture
      const textureLoader = new THREE.TextureLoader();
      const texture = await new Promise((resolve, reject) => {
        textureLoader.load(gameState.imageUrl, resolve, undefined, reject);
      });

      // Create puzzle pieces
      const newPieces = createPuzzlePieces(texture);

      // Shuffle pieces
      const shuffledPieces = newPieces.map(piece => {
        const randomPosition = {
          x: Math.floor(Math.random() * gameState.difficulty),
          y: Math.floor(Math.random() * gameState.difficulty),
          z: Math.floor(Math.random() * gameState.difficulty)
        };

        piece.mesh.position.set(
          (randomPosition.x - gameState.difficulty / 2) * (gameState.imageSize.width / gameState.difficulty),
          (randomPosition.y - gameState.difficulty / 2) * (gameState.imageSize.height / gameState.difficulty),
          (randomPosition.z - gameState.difficulty / 2) * gameState.imageSize.depth
        );

        return {
          ...piece,
          current: randomPosition,
          isPlaced: false
        };
      });

      // Add pieces to scene
      pieceGroupRef.current.clear();
      shuffledPieces.forEach(piece => {
        pieceGroupRef.current.add(piece.mesh);
      });

      // Update game state in Firebase
      const updates = {
        [`games/${gameState.gameId}/pieces`]: shuffledPieces,
        [`games/${gameState.gameId}/isGameStarted`]: true,
        [`games/${gameState.gameId}/startTime`]: Date.now(),
        [`games/${gameState.gameId}/timer`]: 0,
        [`games/${gameState.gameId}/isCompleted`]: false
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

  // Handle image upload
  const handleImageUpload = async (event) => {
    if (!gameState.isHost) return;
    
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUi(prev => ({ ...prev, loading: true }));
      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      const img = new Image();
      img.onload = async () => {
        try {
          const updates = {
            [`games/${gameState.gameId}/imageUrl`]: url,
            [`games/${gameState.gameId}/imageSize`]: {
              width: Math.min(img.width, 1000), // Limit max width
              height: Math.min(img.height, 1000), // Limit max height
              depth: Math.min(img.width, img.height) * 0.1 // Set depth relative to image size
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
        error: { type: 'error', message: 'Failed to upload image' },
        loading: false
      }));
    }
  };

  // Handle leaving the game
  const leaveGame = async () => {
    try {
      const updates = {};
      updates[`games/${gameState.gameId}/players/${userId}`] = null;
      await update(dbRef(database), updates);
      navigate('/');
    } catch (err) {
      console.error('Failed to leave game:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to leave game' }
      }));
    }
  };

  // Clean up game session
  const cleanupSession = async () => {
    try {
      if (gameState.isHost) {
        await set(dbRef(database, `games/${gameState.gameId}`), null);
      } else {
        const updates = {};
        updates[`games/${gameState.gameId}/players/${userId}`] = null;
        await update(dbRef(database), updates);
      }
      navigate('/');
    } catch (err) {
      console.error('Failed to cleanup session:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to cleanup session' }
      }));
    }
  };

  // Copy game link to clipboard
  const shareGameLink = async () => {
    const link = `${window.location.origin}/puzzle/multiplayer/${gameState.gameId}`;
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
      await update(dbRef(database, `games/${gameState.gameId}/difficulty`), newDifficulty);
      setGameState(prev => ({ ...prev, difficulty: newDifficulty }));
    } catch (err) {
      console.error('Failed to update difficulty:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to update difficulty' }
      }));
    }
  };

  // Render main component
  return (
    <div className="w-full h-screen bg-white shadow-lg rounded-lg overflow-hidden">
      <div className="relative w-full h-full">
        {/* Game controls */}
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <button
            onClick={() => navigate('/')}
            className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
            title="Home"
          >
            <Home className="h-4 w-4" />
          </button>
          <button
            onClick={leaveGame}
            className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
            title="Leave Game"
          >
            <LogOut className="h-4 w-4" />
          </button>
          {gameState.isHost && (
            <button
              onClick={cleanupSession}
              className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
              title="Clear Session"
            >
              Clear Session
            </button>
          )}
        </div>

        {/* Game status */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow">
          <span className="font-medium">
            Time: {Math.floor(gameState.timer / 60)}:
            {String(gameState.timer % 60).padStart(2, '0')}
          </span>
        </div>

        {/* Game options */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          {gameState.isHost && !isGameStarted && (
            <>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                className="p-2 bg-white rounded-full shadow hover:bg-gray-100 cursor-pointer"
              >
                <CameraIcon className="h-4 w-4" />
              </label>
              <input
                type="range"
                min="2"
                max="6"
                value={gameState.difficulty}
                onChange={handleDifficultyChange}
                className="w-32"
              />
              {gameState.imageUrl && (
                <button
                  onClick={initializePuzzle}
                  className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
                  title="Start Game"
                >
                  <Play className="h-4 w-4" />
                </button>
              )}
            </>
          )}
          <button
            onClick={() => setUi(prev => ({ ...prev, showPlayers: !prev.showPlayers }))}
            className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
            title="Toggle Players"
          >
            <Users className="h-4 w-4" />
          </button>
          <button
            onClick={shareGameLink}
            className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
            title="Share Game"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        {/* 3D Canvas */}
        <div ref={mountRef} className="w-full h-full" />

        {/* Players list */}
        {ui.showPlayers && (
          <div className="absolute right-4 top-16 bg-white p-4 rounded-lg shadow-lg w-64">
            <h3 className="font-semibold mb-4">Players</h3>
            <div className="space-y-2">
              {Object.values(players).map(player => (
                <div 
                  key={player.id}
                  className="flex items-center gap-2 p-2 bg-gray-50 rounded"
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

        {/* Loading indicator */}
        {ui.loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white p-4 rounded-lg">Loading...</div>
          </div>
        )}

        {/* Error messages */}
        {ui.error && (
          <div 
            className={`absolute top-4 left-1/2 transform -translate-x-1/2 p-3 rounded ${
              ui.error.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}
          >
            {ui.error.message}
          </div>
        )}

        {/* Winner notification */}
        {winner && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">🎉 Puzzle Completed!</h3>
              <p className="text-lg mb-4">
                Winner: <span className="font-bold">{winner.name}</span>
              </p>
              <p className="mb-4">Score: {winner.score}</p>
              <p className="mb-4">
                Time: {Math.floor(gameState.timer / 60)}:
                {String(gameState.timer % 60).padStart(2, '0')}
              </p>
              <button
                onClick={() => setWinner(null)}
                className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Share modal */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Share Your Achievement</h3>
              <div className="space-y-4">
                <button
                  onClick={() => {
                    const url = encodeURIComponent(`${window.location.origin}/puzzle/multiplayer/${gameState.gameId}`);
                    const text = encodeURIComponent(
                      `I just completed a ${gameState.difficulty}x${gameState.difficulty}x${gameState.difficulty} 3D puzzle!`
                    );
                    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank');
                  }}
                  className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Share on Facebook
                </button>
                <button
                  onClick={() => {
                    const url = encodeURIComponent(`${window.location.origin}/puzzle/multiplayer/${gameState.gameId}`);
                    const text = encodeURIComponent(
                      `I just completed a ${gameState.difficulty}x${gameState.difficulty}x${gameState.difficulty} 3D puzzle! #3DPuzzle`
                    );
                    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
                  }}
                  className="w-full p-3 bg-sky-400 text-white rounded hover:bg-sky-500"
                >
                  Share on Twitter
                </button>
                <button
                  onClick={() => {
                    const url = encodeURIComponent(`${window.location.origin}/puzzle/multiplayer/${gameState.gameId}`);
                    const text = encodeURIComponent(
                      `I just completed a ${gameState.difficulty}x${gameState.difficulty}x${gameState.difficulty} 3D puzzle!`
                    );
                    window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
                  }}
                  className="w-full p-3 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  Share on WhatsApp
                </button>
                <button
                  onClick={() => {
                    const canvas = rendererRef.current.domElement;
                    const link = document.createElement('a');
                    link.download = `3d-puzzle-${gameState.gameId}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                  }}
                  className="w-full p-3 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 flex items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4" /> Download Screenshot
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
        )}
      </div>
    </div>
  );
};

export default MultiplayerPuzzle3D;