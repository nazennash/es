import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { nanoid } from 'nanoid';
import { 
  Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2,
  Play, Pause, Users, Link, Copy, MessageCircle, CheckCircle2
} from 'lucide-react';
import { 
  getDatabase, ref, set, onValue, update, remove, 
  onDisconnect, push, get 
} from 'firebase/database';

// Player cursor visualization
class PlayerCursor extends THREE.Mesh {
  constructor(color) {
    const geometry = new THREE.RingGeometry(0.1, 0.12, 32);
    const material = new THREE.MeshBasicMaterial({ 
      color, 
      transparent: true, 
      opacity: 0.7,
      side: THREE.DoubleSide 
    });
    super(geometry, material);
    this.renderOrder = 999;
  }
}

// Shader for puzzle pieces
const puzzlePieceShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    
    uniform vec2 uvOffset;
    uniform vec2 uvScale;
    
    void main() {
      vUv = uvOffset + uv * uvScale;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform float selected;
    uniform float correctPosition;
    uniform float time;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    
    void main() {
      vec4 texColor = texture2D(map, vUv);
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
      float diff = max(dot(normal, lightDir), 0.0);
      
      vec3 highlightColor = vec3(0.3, 0.6, 1.0);
      float highlightStrength = selected * 0.5 * (0.5 + 0.5 * sin(time * 3.0));
      
      vec3 correctColor = vec3(0.2, 1.0, 0.3);
      float correctStrength = correctPosition * 0.5;
      
      vec3 finalColor = texColor.rgb * (vec3(0.3) + vec3(0.7) * diff);
      finalColor += highlightColor * highlightStrength + correctColor * correctStrength;
      
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
};

const MultiplayerPuzzleGame = (props) => {

  console.log(props);
  // Get authenticated user data
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData?.uid;
  const userName = userData?.displayName || userData?.email;

  const user = {
    id: userId || `user-${Date.now()}`,
    name: userName || `Player ${Math.floor(Math.random() * 1000)}`
  };

  // State management
  const [gameState, setGameState] = useState('initial'); // initial, playing, paused, completed
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [players, setPlayers] = useState({});
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showThumbnail, setShowThumbnail] = useState(false);
  const [localPlayerId, setLocalPlayerId] = useState(null);

  // Game IDs and player info
  const gameId = props.gameId;
  // const [localPlayerId] = useState(nanoid());
  const [playerName, setPlayerName] = useState(`Player ${nanoid(4)}`);

  // Update local player info based on auth
  useEffect(() => {
    if (user) {
      setLocalPlayerId(user.id);
      setPlayerName(user.name);
    }
  }, [user]);

  // Refs for Three.js
  const containerRef = useRef(null);
  const guideOutlinesRef = useRef([]);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const composerRef = useRef(null);
  const puzzlePiecesRef = useRef([]);
  const selectedPieceRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const playerCursorsRef = useRef({});

  const isHost = props.isHost;

  // Database reference
  const database = getDatabase();

  // Create placement guides for puzzle pieces
  const createPlacementGuides = useCallback((gridSize, pieceSize) => {
    // Remove existing guides
    guideOutlinesRef.current.forEach(guide => sceneRef.current.remove(guide));
    guideOutlinesRef.current = [];

    // Create new guides
    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        const outlineGeometry = new THREE.EdgesGeometry(
          new THREE.PlaneGeometry(pieceSize.x * 0.95, pieceSize.y * 0.95)
        );
        const outlineMaterial = new THREE.LineBasicMaterial({ 
          color: 0x4a90e2,
          transparent: true,
          opacity: 0.5
        });
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);

        outline.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
        outline.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
        outline.position.z = -0.01;

        sceneRef.current.add(outline);
        guideOutlinesRef.current.push(outline);
      }
    }
  }, []);

  // Initialize game and Firebase connections
  useEffect(() => {
    if (!gameId) return;

    const gameRef = ref(database, `games/${gameId}`);
    const playerRef = ref(database, `games/${gameId}/players/${localPlayerId}`);

    // Set initial game state
    set(gameRef, {
      state: 'waiting',
      createdAt: Date.now(),
      settings: {
        difficulty: 'medium'
      },
      creator: {
        id: user.id,
        name: user.name
      }
    });

    // Set player data with auth info
    set(playerRef, {
      id: user.id,
      name: user.name,
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      joinedAt: Date.now(),
      isAuthenticated: !!userData,
      lastActive: Date.now()
    });

    // Handle disconnection
    onDisconnect(playerRef).remove();

    // Listen for game state changes
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameState(data.state);
        setPlayers(data.players || {});
      }
    });

    return () => {
      unsubscribe();
      remove(playerRef);
    };
  }, [gameId, localPlayerId, playerName, database]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.5,
        0.4,
        0.85
      )
    );
    composerRef.current = composer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      composer.render();
    };
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Puzzle piece creation
  const createPuzzlePieces = async (imageUrl) => {
    if (!sceneRef.current) return;

    // Clear existing pieces
    puzzlePiecesRef.current.forEach(piece => {
      sceneRef.current.remove(piece);
    });
    puzzlePiecesRef.current = [];

    // Load image texture
    const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
    const aspectRatio = texture.image.width / texture.image.height;
    
    // Grid setup
    const gridSize = { x: 4, y: 3 }; // Default medium difficulty
    const pieceSize = {
      x: 1 * aspectRatio / gridSize.x,
      y: 1 / gridSize.y
    };

    setTotalPieces(gridSize.x * gridSize.y);
    createPlacementGuides(gridSize, pieceSize);

    // Create pieces
    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        const geometry = new THREE.PlaneGeometry(
          pieceSize.x * 0.95,
          pieceSize.y * 0.95
        );

        const material = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: texture },
            uvOffset: { value: new THREE.Vector2(x / gridSize.x, y / gridSize.y) },
            uvScale: { value: new THREE.Vector2(1 / gridSize.x, 1 / gridSize.y) },
            selected: { value: 0.0 },
            correctPosition: { value: 0.0 },
            time: { value: 0.0 }
          },
          vertexShader: puzzlePieceShader.vertexShader,
          fragmentShader: puzzlePieceShader.fragmentShader,
          side: THREE.DoubleSide
        });

        const piece = new THREE.Mesh(geometry, material);
        
        // Set initial position
        piece.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
        piece.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
        piece.position.z = 0;

        // Store metadata
        piece.userData = {
          originalPosition: piece.position.clone(),
          gridPosition: { x, y },
          isPlaced: false,
          id: `piece_${x}_${y}`
        };

        sceneRef.current.add(piece);
        puzzlePiecesRef.current.push(piece);
      }
    }

    // Scramble pieces
    puzzlePiecesRef.current.forEach(piece => {
      piece.position.x += (Math.random() - 0.5) * 2;
      piece.position.y += (Math.random() - 0.5) * 2;
      piece.position.z += Math.random() * 0.5;
      piece.rotation.z = (Math.random() - 0.5) * Math.PI / 2;

      // Sync initial positions in multiplayer
      syncPiecePosition(piece);
    });
  };

  // Piece movement synchronization
  const syncPiecePosition = useCallback((piece) => {
    if (!gameId || !user.id) return;
  
    const pieceRef = ref(database, `games/${gameId}/pieces/${piece.userData.id}`);
    set(pieceRef, {
      position: {
        x: piece.position.x,
        y: piece.position.y,
        z: piece.position.z
      },
      rotation: piece.rotation.z,
      isPlaced: piece.userData.isPlaced,
      lastMovedBy: user.id,
      lastMoveTime: Date.now(),
      lastMovedByName: user.name
    });
  }, [gameId, user, database]);

  // Mouse interaction handlers
  useEffect(() => {
    if (!rendererRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let dragPlane = new THREE.Plane();

    const handleMouseDown = (event) => {
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        const piece = intersects[0].object;
        isDragging = true;
        selectedPieceRef.current = piece;
        controlsRef.current.enabled = false;

        piece.material.uniforms.selected.value = 1.0;
        dragPlane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 0, 1),
          piece.position
        );
      }
    };

    const handleMouseMove = (event) => {
      if (!isDragging || !selectedPieceRef.current) return;

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, intersectPoint);
      
      selectedPieceRef.current.position.copy(intersectPoint);
      syncPiecePosition(selectedPieceRef.current);
    };

    const handleMouseUp = () => {
      if (!selectedPieceRef.current) return;

      const piece = selectedPieceRef.current;
      const originalPos = piece.userData.originalPosition;
      const distance = originalPos.distanceTo(piece.position);

      if (distance < 0.3) {
        piece.position.copy(originalPos);
        piece.rotation.z = 0;
        piece.userData.isPlaced = true;
        piece.userData.placedBy = user.id;

        // Update player stats for piece placement
        updatePlayerStats(user.id, true);

        setCompletedPieces(prev => {
          const newCount = prev + 1;
          setProgress((newCount / totalPieces) * 100);
          return newCount;
        });

        // Sync piece placement in multiplayer
        const pieceRef = ref(database, `games/${gameId}/pieces/${piece.userData.id}`);
        set(pieceRef, {
          position: {
            x: originalPos.x,
            y: originalPos.y,
            z: originalPos.z
          },
          rotation: 0,
          isPlaced: true,
          placedBy: user.id,
          placedAt: Date.now()
        });
      } else if (piece.userData.isPlaced) {
        // If piece was previously placed but now moved away
        piece.userData.isPlaced = false;
        updatePlayerStats(piece.userData.placedBy, false);
        piece.userData.placedBy = null;
      }

      piece.material.uniforms.selected.value = 0.0;
      piece.material.uniforms.correctPosition.value = piece.userData.isPlaced ? 1.0 : 0.0;

      syncPiecePosition(piece);
      selectedPieceRef.current = null;
      isDragging = false;
      controlsRef.current.enabled = true;
    };

    const element = rendererRef.current.domElement;
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('mouseleave', handleMouseUp);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [syncPiecePosition, totalPieces]);

  // Timer management
  useEffect(() => {
    let interval;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Game controls
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      setImage(e.target.result);
      await createPuzzlePieces(e.target.result);
      setLoading(false);
      setGameState('playing');
      setIsTimerRunning(true);

      // Sync image to other players
      if (gameId) {
        update(ref(database, `games/${gameId}`), {
          image: e.target.result,
          state: 'playing'
        });
      }
    };

    reader.readAsDataURL(file);
  };

  const togglePause = () => {
    setGameState(prev => prev === 'playing' ? 'paused' : 'playing');
    setIsTimerRunning(prev => !prev);

    if (gameId) {
      update(ref(database, `games/${gameId}`), {
        state: gameState === 'playing' ? 'paused' : 'playing'
      });
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Camera controls
  const handleZoomIn = () => {
    if (cameraRef.current) {
      cameraRef.current.position.z = Math.max(cameraRef.current.position.z - 1, 2);
    }
  };

  const handleZoomOut = () => {
    if (cameraRef.current) {
      cameraRef.current.position.z = Math.min(cameraRef.current.position.z + 1, 10);
    }
  };

  const handleResetView = () => {
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, 5);
      controlsRef.current?.target.set(0, 0, 0);
      controlsRef.current?.update();
    }
  };

  // Chat functionality
  const sendMessage = () => {
    if (!newMessage.trim() || !gameId) return;

    const messagesRef = ref(database, `games/${gameId}/messages`);
    push(messagesRef, {
      text: newMessage.trim(),
      playerId: localPlayerId,
      playerName,
      timestamp: Date.now()
    });

    setNewMessage('');
  };

  const handleCopyGameLink = async () => {
    try {
      const currentUrl = window.location.origin;
      const baseUrl = currentUrl.includes('github.io') 
        ? `${currentUrl}/${window.location.pathname.split('/')[1]}` 
        : currentUrl;
      
      const gameLink = `${baseUrl}/#/puzzle/multiplayer/${gameId}`;
      
      await navigator.clipboard.writeText(gameLink);
      
      // You can add a toast/notification here if you have a notification system
      console.log('Game link copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy link:', error);
      
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      const gameLink = `${window.location.origin}/#/puzzle/multiplayer/${gameId}`;
      textArea.value = gameLink;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        console.log('Game link copied to clipboard! (fallback)');
      } catch (err) {
        console.error('Fallback copying failed:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  // Inside MultiplayerPuzzleGame component
  const joinExistingGame = useCallback(async () => {
    if (!gameId || !user.id) return;

    try {
      const gameRef = ref(database, `games/${gameId}`);
      const gameSnapshot = await get(gameRef);
      
      if (!gameSnapshot.exists()) {
        console.error('Game not found');
        return;
      }

      const gameData = gameSnapshot.val();
      
      // Add new player to the game
      const playerRef = ref(database, `games/${gameId}/players/${user.id}`);
      await set(playerRef, {
        id: user.id,
        name: user.name,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        joinedAt: Date.now(),
        isAuthenticated: true,
        stats: {
          piecesPlaced: 0,
          lastActive: Date.now()
        }
      });

      // Set up presence system for new player
      const presenceRef = ref(database, `.info/connected`);
      onValue(presenceRef, (snapshot) => {
        if (snapshot.val()) {
          const playerPresenceRef = ref(
            database, 
            `games/${gameId}/players/${user.id}/presence`
          );
          onDisconnect(playerPresenceRef).remove();
          set(playerPresenceRef, true);
        }
      });

      // If the game is already in progress, sync the current state
      if (gameData.image) {
        setImage(gameData.image);
        await createPuzzlePieces(gameData.image);
      }

      // Update game metadata
      await update(ref(database, `games/${gameId}`), {
        lastJoinedAt: Date.now(),
        playerCount: (gameData.playerCount || 0) + 1
      });

    } catch (error) {
      console.error('Error joining game:', error);
    }
  }, [gameId, user, database, createPuzzlePieces]);

  // Use this effect to handle initial join
  useEffect(() => {
    if (gameId && !isHost) {
      joinExistingGame();
    }
  }, [gameId, isHost, joinExistingGame]);

  // useEffect(() => {
  //   if (!gameId) return;
  
  //   const playersRef = ref(database, `games/${gameId}/players`);
  //   return onValue(playersRef, (snapshot) => {
  //     const players = snapshot.val() || {};
  //     const playerCount = Object.keys(players).length;
  
  //     // Update local players state
  //     setPlayers(players);
  
  //     // If this is a new player (not the host), notify others
  //     if (playerCount > Object.keys(players).length && !isHost) {
  //       const messagesRef = ref(database, `games/${gameId}/messages`);
  //       push(messagesRef, {
  //         type: 'system',
  //         text: `${user.name} joined the game`,
  //         timestamp: Date.now()
  //       });
  //     }
  //   });
  // }, [gameId, user, isHost]);

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Game header */}
      <div className="p-4 bg-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
          {/* Image upload */}
          <label className="relative cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                        rounded-lg text-white transition-colors">
              <Camera className="w-5 h-5" />
              <span>Upload Image</span>
            </div>
          </label>

          {/* Game controls */}
          <div className="flex items-center gap-2">
            {gameState !== 'initial' && (
              <button
                onClick={togglePause}
                className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
                title={gameState === 'playing' ? 'Pause' : 'Resume'}
              >
                {gameState === 'playing' ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </button>
            )}

            {/* Timer */}
            <div className="flex items-center gap-2 text-white bg-gray-700 px-3 py-1 rounded-lg">
              <Clock className="w-4 h-4" />
              <span>{formatTime(timeElapsed)}</span>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              <div className="text-white">
                {completedPieces} / {totalPieces}
              </div>
              <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Camera controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomIn}
              className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
              title="Zoom In"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
              title="Zoom Out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <button
              onClick={handleResetView}
              className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
              title="Reset View"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Multiplayer info */}
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 bg-gray-700 rounded-lg text-white flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span>{Object.keys(players).length} Players</span>
          </div>
          
          {/* <button
            onClick={() => {
              const gameLink = `${window.location.origin}/puzzle/${gameId}`;
              navigator.clipboard.writeText(gameLink);
            }}
            className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
            title="Copy game link"
          >
            <Copy className="w-5 h-5" />
          </button> */}
          <button
            onClick={handleCopyGameLink}
            className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 group relative"
            // title="Copy game link"
          >
            <Copy className="w-5 h-5" />
            <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 
                          bg-black text-white text-xs px-2 py-1 rounded opacity-0 
                          group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {/* <Copy className="w-5 h-5" /> */}
              copy link
            </span>
          </button>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center 
                       bg-gray-900 bg-opacity-75 z-10">
          <div className="text-xl text-white">Loading puzzle...</div>
        </div>
      )}

      {/* Pause overlay */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 bg-black bg-opacity-50 
                       flex items-center justify-center z-20 flex-col">
          <div className="text-3xl text-white font-bold">PAUSED</div>
          <br />
          <button
            onClick={togglePause}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg mt-4"
          >
            Resume
          </button>
        </div>
      )}

      {/* Reference image thumbnail */}
      {showThumbnail && image && (
        <div className="absolute left-4 bottom-4 p-2 bg-gray-800 
                       rounded-lg shadow-lg z-10">
          <img
            src={image}
            alt="Reference"
            className="w-48 h-auto rounded border border-gray-600"
          />
        </div>
      )}

      {/* Main game area */}
      <div className="flex-1 flex">
        {/* Puzzle canvas */}
        <div className="flex-1 relative">
          <div ref={containerRef} className="w-full h-full" />
        </div>

        {/* Player sidebar */}
        <div className="w-64 bg-gray-800 p-4">
          {/* Player list */}
          <div className="bg-gray-700 rounded-lg p-3 mb-4">
            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Players
            </h3>
            <div className="space-y-2">
              {Object.entries(players).map(([playerId, player]) => (
                <div 
                  key={playerId} 
                  className="flex items-center gap-2 text-sm"
                  style={{ color: player.color }}
                >
                  <div className={`w-2 h-2 rounded-full ${
                    Date.now() - (player.stats?.lastActive || 0) < 10000 
                      ? 'bg-green-500' 
                      : 'bg-gray-500'
                  }`} />
                  <span>{player.name}</span>
                  {playerId === user.id && <span className="text-xs">(You)</span>}
                  <span className="text-gray-400 text-xs ml-auto">
                    {player.stats?.piecesPlaced || 0} pieces
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat system */}
          <div className="flex-1 flex flex-col bg-gray-700 rounded-lg overflow-hidden">
            <div className="p-2 bg-gray-600 text-white font-bold flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              Chat
            </div>
            
            {/* Messages area */}
            {messages.map((message, index) => (
              <div key={index} className={`text-sm ${
                message.type === 'system' ? 'text-gray-500 italic' : ''
              }`}>
                {message.type === 'system' ? (
                  <span>{message.text}</span>
                ) : (
                  <>
                    <span 
                      className="font-bold"
                      style={{ color: players[message.playerId]?.color || '#ffffff' }}
                    >
                      {message.playerName}:
                    </span>
                    <span className="text-white ml-2">{message.text}</span>
                  </>
                )}
              </div>
            ))}

            {/* Message input */}
            <div className="p-2 bg-gray-800">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                className="w-full px-2 py-1 rounded bg-gray-900 text-white 
                         border border-gray-700 focus:border-blue-500 
                         focus:outline-none"
              />
            </div>
          </div>

          {/* Game completion stats */}
          {progress === 100 && (
            <div className="mt-4 bg-gray-700 rounded-lg p-3">
              <h3 className="text-white font-bold mb-2">Game Completed!</h3>
              <div className="text-sm text-white">
                Time: {formatTime(timeElapsed)}
              </div>
              {/* Game completion scoreboard */}
              <div className="mt-2 space-y-1">
                {Object.entries(players)
                  .sort((a, b) => (
                    (b[1].stats?.piecesPlaced || 0) - (a[1].stats?.piecesPlaced || 0)
                  ))
                  .map(([playerId, player], index) => (
                    <div 
                      key={playerId} 
                      className="flex items-center gap-2 text-sm"
                      style={{ color: player.color }}
                    >
                      <span>{index + 1}.</span>
                      <span>{player.name}</span>
                      {playerId === user.id && <span className="text-xs">(You)</span>}
                      <span className="text-gray-400 ml-auto">
                        {player.stats?.piecesPlaced || 0} pieces
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
              
        </div>
      </div>
    </div>
  );
};

export default MultiplayerPuzzleGame;