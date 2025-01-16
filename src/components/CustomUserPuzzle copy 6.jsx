import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, update, get, onValue, off } from 'firebase/database';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Play, Home, LogOut, Share2, Download, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { handlePuzzleCompletion } from './PuzzleCompletionHandler';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import html2canvas from 'html2canvas';

const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData.uid;
  const userName = userData.displayName || userData.email;

  const user = { 
    id: userId || `user-${Date.now()}`, 
    name: userName || `Player ${Math.floor(Math.random() * 1000)}` 
  };

const storage = getStorage();

// Create a helper for 3D transformations
const createBasRelief = (imageData, depth = 2) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);
  
  const geometry = new THREE.PlaneGeometry(10, 10, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  
  // Create displacement map from grayscale values
  const displacementMap = new THREE.TextureLoader().load(canvas.toDataURL());
  
  const material = new THREE.MeshPhongMaterial({
    map: texture,
    displacementMap: displacementMap,
    displacementScale: depth,
    displacementBias: -0.5,
    side: THREE.DoubleSide
  });
  
  return { geometry, material };
};

// Create a piece class to handle 3D puzzle pieces
class PuzzlePiece extends THREE.Mesh {
  constructor(geometry, material, row, col, totalRows, totalCols) {
    super(geometry, material);
    this.row = row;
    this.col = col;
    this.correctPosition = new THREE.Vector3(
      (col - totalCols/2) * 10.5,
      (totalRows/2 - row) * 10.5,
      0
    );
    this.isPlaced = false;
  }
}

const Custom3DPuzzle = () => {
  // State management
  const [gameState, setGameState] = useState({
    gameId: `game-${Date.now()}`,
    imageUrl: '',
    difficulty: 3,
    timer: 0,
    imageSize: { width: 0, height: 0 },
    startTime: null,
    isCompleted: false
  });

  const database = getDatabase();
  const gameRef = useRef(dbRef(database, `games/${gameState.gameId}`));

  const [isGameStarted, setIsGameStarted] = useState(false);

  // Add these near the beginning of the component, with other state definitions:

const [ui, setUi] = useState({
  loading: true,
  error: null,
  imageUploading: false
});

const navigate = useNavigate();

// Add relief depth state
const [reliefDepth, setReliefDepth] = useState(2);

// Add state for undo/redo functionality
const [history, setHistory] = useState([]);
const [redoStack, setRedoStack] = useState([]);

// Add state for hint system
const [showHint, setShowHint] = useState(false);

// Add state for piece grouping
const [selectedPieces, setSelectedPieces] = useState([]);

// Add state for view presets
const [viewPreset, setViewPreset] = useState('default');

// Add state for progress tracking
const [progress, setProgress] = useState(0);

// Add state for showing expected result image
const [showExpectedResult, setShowExpectedResult] = useState(false);

// Add state for timer
const [timer, setTimer] = useState(0);

// Save game progress
const saveGameProgress = async () => {
  try {
    const progress = {
      gameState,
      scene3D: {
        pieces: scene3D.pieces.map(piece => ({
          position: piece.position,
          rotation: piece.rotation,
          isPlaced: piece.isPlaced
        }))
      }
    };
    await set(gameRef.current, progress);
    setUi(prev => ({ ...prev, error: { type: 'success', message: 'Game progress saved' } }));
  } catch (err) {
    console.error('Failed to save game progress:', err);
    setUi(prev => ({ ...prev, error: { type: 'error', message: 'Failed to save game progress' } }));
  }
};

// Resume game progress
const resumeGameProgress = async () => {
  try {
    const snapshot = await get(gameRef.current);
    if (snapshot.exists()) {
      const progress = snapshot.val();
      setGameState(progress.gameState);
      setScene3D(prev => ({
        ...prev,
        pieces: progress.scene3D.pieces.map(pieceData => {
          const piece = new PuzzlePiece(
            new THREE.PlaneGeometry(10, 10, 32, 32),
            new THREE.MeshPhongMaterial(),
            0, 0, 0, 0
          );
          piece.position.copy(pieceData.position);
          piece.rotation.copy(pieceData.rotation);
          piece.isPlaced = pieceData.isPlaced;
          return piece;
        })
      }));
      setUi(prev => ({ ...prev, error: { type: 'success', message: 'Game progress resumed' } }));
    }
  } catch (err) {
    console.error('Failed to resume game progress:', err);
    setUi(prev => ({ ...prev, error: { type: 'error', message: 'Failed to resume game progress' } }));
  }
};

// Handle undo
const handleUndo = () => {
  if (history.length === 0) return;
  const lastState = history.pop();
  setRedoStack([...redoStack, { gameState, scene3D }]);
  setGameState(lastState.gameState);
  setScene3D(lastState.scene3D);
};

// Handle redo
const handleRedo = () => {
  if (redoStack.length === 0) return;
  const nextState = redoStack.pop();
  setHistory([...history, { gameState, scene3D }]);
  setGameState(nextState.gameState);
  setScene3D(nextState.scene3D);
};

// Handle hint
const handleHint = () => {
  setShowHint(true);
  setTimeout(() => setShowHint(false), 3000);
};

// Handle piece grouping
const handlePieceGrouping = () => {
  // Implement piece grouping logic
};

// Handle view preset change
const handleViewPresetChange = (preset) => {
  setViewPreset(preset);
  if (preset === 'top') {
    scene3D.camera.position.set(0, 50, 0);
    scene3D.camera.lookAt(0, 0, 0);
  } else if (preset === 'side') {
    scene3D.camera.position.set(50, 0, 0);
    scene3D.camera.lookAt(0, 0, 0);
  } else {
    scene3D.camera.position.set(0, 0, 30);
    scene3D.camera.lookAt(0, 0, 0);
  }
};

// Fetch initial game data
useEffect(() => {
  const fetchGameData = async () => {
    try {
      const snapshot = await get(gameRef.current);
      if (snapshot.exists()) {
        setGameState(snapshot.val());
      } else {
        await set(gameRef.current, gameState);
      }
    } catch (err) {
      console.error('Failed to fetch game data:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to fetch game data' }
      }));
    }
  };

  fetchGameData();

  // Listen for real-time updates
  const handleValueChange = (snapshot) => {
    if (snapshot.exists()) {
      setGameState(snapshot.val());
    }
  };

  onValue(gameRef.current, handleValueChange);

  // Cleanup listener on unmount
  return () => {
    off(gameRef.current, 'value', handleValueChange);
  };
}, []);

// Add the difficulty change handler
const handleDifficultyChange = async (event) => {
  const newDifficulty = parseInt(event.target.value, 10);
  try {
    await update(gameRef.current, { difficulty: newDifficulty });
    setGameState(prev => ({ ...prev, difficulty: newDifficulty }));
    
    if (!isGameStarted) {
      // Clear existing 3D pieces
      scene3D.pieces.forEach(piece => {
        sceneRef.current.remove(piece);
      });
      setScene3D(prev => ({ ...prev, pieces: [] }));
    }
  } catch (err) {
    console.error('Failed to update difficulty:', err);
    setUi(prev => ({
      ...prev,
      error: { type: 'error', message: 'Failed to update difficulty' }
    }));
  }
};

// Add the handle puzzle complete function
const handlePuzzleComplete = async () => {
  if (!isGameStarted || gameState.isCompleted) return;

  try {
    const finalTime = Math.floor((Date.now() - gameState.startTime) / 1000);

    const updates = {
      isCompleted: true,
      isGameStarted: false,
      completionTime: finalTime,
      finalTimer: finalTime
    };

    await update(gameRef.current, updates);
    
    setGameState(prev => ({
      ...prev,
      ...updates,
      timer: finalTime
    }));
    
    setIsGameStarted(false);

    await handlePuzzleCompletion({
      puzzleId: gameState.gameId,
      startTime: gameState.startTime,
      timer: finalTime,
      difficulty: gameState.difficulty,
      imageUrl: gameState.imageUrl,
      userId: userId, 
      playerName: userName,
    });

    setUi(prev => ({
      ...prev,
      error: { 
        type: 'success', 
        message: `Puzzle completed! Time: ${Math.floor(finalTime / 60)}:${String(finalTime % 60).padStart(2, '0')}` 
      }
    }));

    setShowShareModal(true);

  } catch (err) {
    console.error('Failed to handle puzzle completion:', err);
    setUi(prev => ({
      ...prev,
      error: { type: 'error', message: 'Failed to record puzzle completion' }
    }));
  }
};

  // Add image upload handler
  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUi(prev => ({ ...prev, loading: true, error: null, imageUploading: true }));
      
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image must be smaller than 5MB');
      }
      
      if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
      }

      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = async () => {
          try {
            await update(gameRef.current, {
              imageUrl: url,
              imageSize: {
                width: img.width,
                height: img.height
              }
            });
            
            setGameState(prev => ({
              ...prev,
              imageUrl: url,
              imageSize: { width: img.width, height: img.height }
            }));
            
            setUi(prev => ({ ...prev, loading: false, imageUploading: false }));
            resolve();
          } catch (err) {
            reject(new Error('Failed to update game with image information'));
          }
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
      });
    } catch (err) {
      console.error('Image upload error:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: err.message || 'Failed to upload image' },
        loading: false,
        imageUploading: false
      }));
    }
  };
  
  const [showShareModal, setShowShareModal] = useState(false);

  // New 3D-specific state
  const [scene3D, setScene3D] = useState({
    pieces: [],
    selectedPiece: null,
    camera: null,
    controls: null,
    isDragging: false,
    mouse: new THREE.Vector2(),
    raycaster: new THREE.Raycaster()
  });

  // Refs for Three.js
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(new THREE.Scene());
  const frameIdRef = useRef(null);

  // Initialize 3D scene
  const initializeScene = useCallback(() => {
    if (!mountRef.current) return;

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 30;

    // Setup lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 20);
    directionalLight.castShadow = true;
    sceneRef.current.add(ambientLight, directionalLight);

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 100;
    controls.minDistance = 10;

    // Add grid lines
    const gridHelper = new THREE.GridHelper(100, 10);
    sceneRef.current.add(gridHelper);

    // Add visible boxes for piece placement
    const boxMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
    const exactBoxMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    for (let row = 0; row < gameState.difficulty; row++) {
      for (let col = 0; col < gameState.difficulty; col++) {
        const boxGeometry = new THREE.BoxGeometry(10, 10, 0.1);
        const edges = new THREE.EdgesGeometry(boxGeometry);
        const line = new THREE.LineSegments(edges, boxMaterial);
        line.position.set(
          (col - gameState.difficulty / 2) * 10.5,
          (gameState.difficulty / 2 - row) * 10.5,
          0
        );
        sceneRef.current.add(line);

        // Add exact position box
        const exactLine = new THREE.LineSegments(edges, exactBoxMaterial);
        exactLine.position.set(
          (col - gameState.difficulty / 2) * 10.5,
          (gameState.difficulty / 2 - row) * 10.5,
          0.05 // Slightly above the general box
        );
        sceneRef.current.add(exactLine);
      }
    }

    setScene3D(prev => ({
      ...prev,
      camera,
      controls
    }));

    // Animation loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(sceneRef.current, camera);
    };
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(frameIdRef.current);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, [gameState.difficulty]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !scene3D.camera) return;

      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;

      scene3D.camera.aspect = width / height;
      scene3D.camera.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [scene3D.camera]);

  // Mouse interaction handlers
  const handleMouseDown = useCallback((event) => {
    if (!scene3D.camera || !rendererRef.current) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    scene3D.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    scene3D.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    scene3D.raycaster.setFromCamera(scene3D.mouse, scene3D.camera);
    const intersects = scene3D.raycaster.intersectObjects(scene3D.pieces);

    if (intersects.length > 0) {
      setScene3D(prev => ({
        ...prev,
        selectedPiece: intersects[0].object,
        isDragging: true
      }));
      
      // Disable orbit controls while dragging
      if (scene3D.controls) {
        scene3D.controls.enabled = false;
      }
    }
  }, [scene3D]);

  // ... (previous imports and code remain the same)

  // Add mouse move handler
  const handleMouseMove = useCallback((event) => {
    if (!scene3D.isDragging || !scene3D.selectedPiece || !scene3D.camera) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    scene3D.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    scene3D.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Project mouse position to 3D space
    scene3D.raycaster.setFromCamera(scene3D.mouse, scene3D.camera);
    const intersectPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersection = new THREE.Vector3();
    scene3D.raycaster.ray.intersectPlane(intersectPlane, intersection);

    // Move selected piece
    scene3D.selectedPiece.position.x = intersection.x;
    scene3D.selectedPiece.position.y = intersection.y;
  }, [scene3D]);

  // Add mouse up handler
  const handleMouseUp = useCallback(() => {
    if (!scene3D.selectedPiece || !scene3D.isDragging) return;

    // Check if piece is near its correct position
    const piece = scene3D.selectedPiece;
    const distance = piece.position.distanceTo(piece.correctPosition);

    // Define a tolerance for snapping to the correct position
    const tolerance = 0.5;

    if (distance < tolerance) {
      // Snap to correct position
      piece.position.copy(piece.correctPosition);
      piece.isPlaced = true;

      // Animate piece placement with green border
      piece.material.color.set(0x00ff00);
      setTimeout(() => piece.material.color.set(0xffffff), 500);

      // Update progress
      const placedPieces = scene3D.pieces.filter(p => p.isPlaced).length;
      const totalPieces = scene3D.pieces.length;
      setProgress((placedPieces / totalPieces) * 100);

      // Check if puzzle is complete
      const isComplete = scene3D.pieces.every(p => p.isPlaced);
      if (isComplete) {
        handlePuzzleComplete();
      }
    } else {
      // Animate piece placement with red border
      piece.material.color.set(0xff0000);
      setTimeout(() => piece.material.color.set(0xffffff), 500);
    }

    // Save current state to history for undo functionality
    setHistory(prev => [...prev, { gameState, scene3D: { ...scene3D, pieces: [...scene3D.pieces] } }]);
    setRedoStack([]);

    // Re-enable orbit controls
    if (scene3D.controls) {
      scene3D.controls.enabled = true;
    }

    setScene3D(prev => ({
      ...prev,
      selectedPiece: null,
      isDragging: false
    }));
  }, [scene3D, gameState]);

  // Generate 3D puzzle pieces
  const generate3DPuzzlePieces = async (imageUrl, difficulty) => {
    // Load image and create texture
    const textureLoader = new THREE.TextureLoader();
    const texture = await new Promise((resolve) => {
      textureLoader.load(imageUrl, (tex) => {
        resolve(tex);
      });
    });

    // Clear existing pieces
    scene3D.pieces.forEach(piece => {
      sceneRef.current.remove(piece);
    });

    const newPieces = [];
    const pieceWidth = 10;
    const pieceHeight = 10;

    // Create pieces with bas-relief effect
    for (let row = 0; row < difficulty; row++) {
      for (let col = 0; col < difficulty; col++) {
        // Create geometry for piece
        const geometry = new THREE.PlaneGeometry(pieceWidth * 0.95, pieceHeight * 0.95);

        // Create material with clipped texture
        const material = new THREE.MeshPhongMaterial({
          map: texture,
          side: THREE.DoubleSide,
          displacementMap: texture,
          displacementScale: reliefDepth,
          displacementBias: -0.5
        });

        // Set UV mapping for the piece
        const uvs = geometry.attributes.uv;
        const uvArray = uvs.array;
        for (let i = 0; i < uvArray.length; i += 2) {
          uvArray[i] = (uvArray[i] + col) / difficulty;
          uvArray[i + 1] = (uvArray[i + 1] + row) / difficulty;
        }
        uvs.needsUpdate = true;

        // Create piece and add to scene
        const piece = new PuzzlePiece(geometry, material, row, col, difficulty, difficulty);
        
        // Randomize initial position
        piece.position.set(
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 30,
          0
        );

        // Add to scene and pieces array
        sceneRef.current.add(piece);
        newPieces.push(piece);
      }
    }

    setScene3D(prev => ({
      ...prev,
      pieces: newPieces
    }));
  };

  // Initialize puzzle
  const initializePuzzle = async () => {
    if (!gameState.imageUrl) return;

    try {
      setUi(prev => ({ ...prev, loading: true, error: null }));
      
      const startTime = Date.now();
      await generate3DPuzzlePieces(gameState.imageUrl, gameState.difficulty);
      
      const updates = {
        isGameStarted: true,
        startTime,
        timer: 0,
        isCompleted: false
      };
      
      await update(gameRef.current, updates);
      
      setGameState(prev => ({
        ...prev,
        startTime,
        timer: 0,
        isCompleted: false
      }));
      setIsGameStarted(true);
      setUi(prev => ({ ...prev, loading: false }));

      initializeScene(); // Initialize the scene when the play button is pressed

      // Start the timer
      const timerInterval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);

      return () => clearInterval(timerInterval);
      
    } catch (err) {
      console.error('Failed to initialize puzzle:', err);
      setUi(prev => ({
        ...prev,
        loading: false,
        error: { type: 'error', message: 'Failed to start game' }
      }));
    }
  };


  // ... (previous code remains the same)

  // Add camera controls
  const handleCameraReset = useCallback(() => {
    if (!scene3D.camera || !scene3D.controls) return;
    
    scene3D.camera.position.set(0, 0, 30);
    scene3D.camera.lookAt(0, 0, 0);
    scene3D.controls.reset();
  }, [scene3D]);

  const handleZoom = useCallback((direction) => {
    if (!scene3D.camera) return;
    
    const zoomSpeed = 5;
    const newZ = scene3D.camera.position.z + (direction === 'in' ? -zoomSpeed : zoomSpeed);
    scene3D.camera.position.z = THREE.MathUtils.clamp(newZ, 10, 50);
  }, [scene3D]);

  const handleRotate = useCallback((direction) => {
    if (!scene3D.selectedPiece) return;

    const angle = direction === 'cw' ? Math.PI / 2 : -Math.PI / 2;
    scene3D.selectedPiece.rotation.z += angle;
  }, [scene3D]);

  // Add share functionality
  const handleShare = useCallback(async () => {
    try {
      const canvas = await html2canvas(mountRef.current);
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'puzzle.png';
      link.click();
    } catch (err) {
      console.error('Failed to share puzzle:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to share puzzle' }
      }));
    }
  }, []);

  // Component rendering
  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-lg shadow-lg max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <h1 className="text-2xl font-bold">3D Photo Puzzle</h1>
        <p>Welcome {user.name}</p>
        <div className="text-lg font-semibold">
          {`Time: ${String(Math.floor(timer / 60)).padStart(2, '0')}:${String(timer % 60).padStart(2, '0')}`}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/')}
            className="p-2 border rounded hover:bg-gray-100 text-gray-600"
            title="Return Home"
          >
            <Home className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate('/')}
            className="p-2 border rounded hover:bg-red-50 text-red-600"
            title="Leave Session"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Game Controls */}
      {!isGameStarted && (
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

      {/* Relief Depth Controls */}
      {!isGameStarted && (
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <label htmlFor="reliefDepth" className="font-medium">
            Relief Depth: {reliefDepth}
          </label>
          <input
            type="range"
            id="reliefDepth"
            min="1"
            max="10"
            value={reliefDepth}
            onChange={(e) => setReliefDepth(parseInt(e.target.value, 10))}
            className="flex-1"
          />
          <span className="text-sm text-gray-600">
            ({reliefDepth})
          </span>
        </div>
      )}

      {/* Camera Controls */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => handleZoom('out')}
          className="p-2 border rounded hover:bg-gray-100"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleZoom('in')}
          className="p-2 border rounded hover:bg-gray-100"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={handleCameraReset}
          className="p-2 border rounded hover:bg-gray-100"
          title="Reset Camera"
        >
          <Camera className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleRotate('cw')}
          className="p-2 border rounded hover:bg-gray-100"
          title="Rotate Clockwise"
        >
          <RotateCw className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleRotate('ccw')}
          className="p-2 border rounded hover:bg-gray-100"
          title="Rotate Counterclockwise"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        {!isGameStarted && (
          <button
            onClick={initializePuzzle}
            className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!gameState.imageUrl}
            title="Start Game"
          >
            <Play className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={handleShare}
          className="p-2 border rounded hover:bg-gray-100"
          title="Share Puzzle"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <button
          onClick={handleShare}
          className="p-2 border rounded hover:bg-gray-100"
          title="Download Puzzle"
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          onClick={saveGameProgress}
          className="p-2 border rounded hover:bg-gray-100"
          title="Save Game"
        >
          Save
        </button>
        <button
          onClick={resumeGameProgress}
          className="p-2 border rounded hover:bg-gray-100"
          title="Resume Game"
        >
          Resume
        </button>
        <button
          onClick={handleUndo}
          className="p-2 border rounded hover:bg-gray-100"
          title="Undo"
        >
          Undo
        </button>
        <button
          onClick={handleRedo}
          className="p-2 border rounded hover:bg-gray-100"
          title="Redo"
        >
          Redo
        </button>
        <button
          onClick={handleHint}
          className="p-2 border rounded hover:bg-gray-100"
          title="Hint"
        >
          Hint
        </button>
        <button
          onClick={handlePieceGrouping}
          className="p-2 border rounded hover:bg-gray-100"
          title="Group Pieces"
        >
          Group
        </button>
        <select
          value={viewPreset}
          onChange={(e) => handleViewPresetChange(e.target.value)}
          className="p-2 border rounded hover:bg-gray-100"
          title="View Preset"
        >
          <option value="default">Default</option>
          <option value="top">Top View</option>
          <option value="side">Side View</option>
        </select>
        <button
          onClick={() => setShowExpectedResult(!showExpectedResult)}
          className="p-2 border rounded hover:bg-gray-100"
          title="Show Expected Result"
        >
          {showExpectedResult ? 'Hide' : 'Show'} Expected Result
        </button>
      </div>

      {/* 3D Puzzle Container */}
      <div 
        ref={mountRef}
        className="w-full aspect-square bg-gray-50 rounded-lg relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {!gameState.imageUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              id="imageUpload"
            />
            <label 
              htmlFor="imageUpload"
              className="cursor-pointer p-6 border-2 border-dashed rounded-lg text-center"
            >
              <p className="text-lg font-medium">Upload an image to create a 3D puzzle</p>
              <p className="text-sm text-gray-500 mt-2">Click or drag an image here</p>
            </label>
          </div>
        )}
        {showExpectedResult && gameState.imageUrl && (
          <img 
            src={gameState.imageUrl} 
            alt="Expected Result" 
            className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none"
          />
        )}
      </div>

      {/* Progress Display */}
      {isGameStarted && (
        <div className="mt-4">
          <div className="flex gap-4 text-sm">
            <div>Total Pieces: {scene3D.pieces.length}</div>
            <div>Correctly Placed: {scene3D.pieces.filter(p => p.isPlaced).length}</div>
            <div>Remaining: {scene3D.pieces.length - scene3D.pieces.filter(p => p.isPlaced).length}</div>
          </div>
          <div className="mt-2">
            <Bar 
              data={{
                labels: ['Progress'],
                datasets: [{
                  label: 'Completion',
                  data: [progress],
                  backgroundColor: 'rgba(75, 192, 192, 0.6)'
                }]
              }}
              options={{
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 100
                  }
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Error Messages */}
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

      {/* Share Modal */}
      {showShareModal && <ShareModal />}
    </div>
  );
};

export default Custom3DPuzzle;