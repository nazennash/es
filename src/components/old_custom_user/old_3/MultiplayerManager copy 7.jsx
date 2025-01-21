// MultiplayerPuzzle.jsx
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Users, Share2, LogOut, Home } from 'lucide-react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update, get } from 'firebase/database';
import { useNavigate } from 'react-router-dom';

// Shader definitions
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
      vec3 lightDir = normalize(vec3(5.0, 5.0, 5.0));
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

// Particle System for visual effects
class ParticleSystem {
  constructor(scene) {
    this.particles = [];
    this.scene = scene;
    
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 0.05,
      map: new THREE.TextureLoader().load('/particle.png'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.particleSystem = new THREE.Points(geometry, material);
    scene.add(this.particleSystem);
  }
  
  emit(position, count = 20) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        position: position.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
          Math.random() * 0.2
        ),
        life: 1.0
      });
    }
    this.updateGeometry();
  }
  
  update(deltaTime) {
    this.particles = this.particles.filter(particle => {
      particle.life -= deltaTime;
      particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
      return particle.life > 0;
    });
    this.updateGeometry();
  }
  
  updateGeometry() {
    const positions = new Float32Array(this.particles.length * 3);
    this.particles.forEach((particle, i) => {
      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = particle.position.y;
      positions[i * 3 + 2] = particle.position.z;
    });
    this.particleSystem.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
  }
}

const MultiplayerPuzzle = ({ gameId, isHost }) => {
  // Firebase setup
  const storage = getStorage();
  const database = getDatabase();
  const navigate = useNavigate();

  // Get user data
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData?.uid || `user-${Date.now()}`;
  const userName = userData?.displayName || userData?.email || `Player ${Math.floor(Math.random() * 1000)}`;

  // State management
  const [gameState, setGameState] = useState({
    gameId: gameId || `game-${Date.now()}`,
    imageUrl: '',
    isHost: isHost || false,
    difficulty: 3,
    timer: 0,
    gameStatus: 'waiting' // 'waiting', 'playing', 'paused', 'completed'
  });

  const [pieces, setPieces] = useState([]);
  const [players, setPlayers] = useState({});
  const [activePiece, setActivePiece] = useState(null);
  const [progress, setProgress] = useState(0);

  // Refs for Three.js
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const puzzlePiecesRef = useRef([]);
  const particleSystemRef = useRef(null);

  // Initialize game session
  useEffect(() => {
    const gameRef = dbRef(database, `games/${gameState.gameId}`);
    
    const initializeGame = async () => {
      try {
        const snapshot = await get(gameRef);
        const data = snapshot.val();
        
        if (!data) {
          // New game setup
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
            gameStatus: 'waiting',
            pieces: []
          });
        } else {
          // Join existing game
          await update(gameRef, {
            [`players/${userId}`]: {
              id: userId,
              name: userName,
              score: 0,
              color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
              isHost: false
            }
          });
        }
      } catch (err) {
        console.error('Failed to initialize game:', err);
      }
    };

    // Set up real-time listeners
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        updateGameState(data);
      }
    });

    initializeGame();

    return () => {
      unsubscribe();
      cleanupGame();
    };
  }, [gameState.gameId]);

  // Update game state from Firebase
  const updateGameState = (data) => {
    setGameState(prev => ({
      ...prev,
      imageUrl: data.imageUrl || '',
      gameStatus: data.gameStatus || 'waiting'
    }));
    setPlayers(data.players || {});
    if (data.pieces) {
      setPieces(data.pieces);
      updatePuzzlePieces(data.pieces);
    }
  };

  // Update 3D puzzle pieces
  const updatePuzzlePieces = (piecesData) => {
    puzzlePiecesRef.current.forEach(piece => {
      const pieceData = piecesData.find(p => p.id === piece.userData.id);
      if (pieceData && pieceData.lastUpdatedBy !== userId) {
        piece.position.copy(new THREE.Vector3(
          pieceData.position.x,
          pieceData.position.y,
          pieceData.position.z
        ));
        piece.rotation.copy(new THREE.Euler(
          pieceData.rotation.x,
          pieceData.rotation.y,
          pieceData.rotation.z
        ));
      }
    });
  };

  // Handle piece movement
  const handlePieceMove = async (piece, position, rotation) => {
    try {
      await update(dbRef(database, `games/${gameState.gameId}/pieces/${piece.userData.id}`), {
        position: { x: position.x, y: position.y, z: position.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
        lastUpdatedBy: userId
      });
    } catch (err) {
      console.error('Failed to update piece position:', err);
    }
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.z = 5;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Particle system
    particleSystemRef.current = new ParticleSystem(scene);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      particleSystemRef.current.update(0.016);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Handle piece interaction
  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;

    const handleMouseDown = (event) => {
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        isDragging = true;
        setActivePiece(intersects[0].object);
        controlsRef.current.enabled = false;
      }
    };

    const handleMouseMove = (event) => {
      if (!isDragging || !activePiece) return;

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersectPoint = new THREE.Vector3();
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
      raycaster.ray.intersectPlane(plane, intersectPoint);

      handlePieceMove(activePiece, intersectPoint, activePiece.rotation);
    };

    const handleMouseUp = () => {
      if (isDragging && activePiece) {
        isDragging = false;
        setActivePiece(null);
        controlsRef.current.enabled = true;
      }
    };

    const element = rendererRef.current.domElement;
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activePiece]);

  // Handle game cleanup
  const cleanupGame = async () => {
    try {
      const updates = {};
      updates[`games/${gameState.gameId}/players/${userId}`] = null;
      await update(dbRef(database), updates);

      if (gameState.isHost) {
        const otherPlayers = Object.values(players).filter(p => p.id !== userId);
        if (otherPlayers.length > 0) {
          const newHost = otherPlayers[0];
          await update(dbRef(database, `games/${gameState.gameId}/players/${newHost.id}`), {
            isHost: true
          });
        } else {
          await set(dbRef(database, `games/${gameState.gameId}`), null);
        }
      }
    } catch (err) {
      console.error('Failed to cleanup game:', err);
    }
  };

  // UI Components
  const PlayerList = () => (
    <div className="absolute right-4 top-4 bg-gray-800 p-4 rounded-lg">
      <h3 className="text-white font-bold mb-2">Players</h3>
      {Object.values(players).map(player => (
        <div key={player.id} className="flex items-center gap-2 text-white">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: player.color }}
          />
          <span>{player.name}</span>
          <span className="ml-auto">{player.score || 0}</span>
          {player.isHost && (
            <span className="text-xs bg-blue-500 px-2 py-1 rounded">Host</span>
          )}
        </div>
      ))}
    </div>
  );

  const GameControls = () => (
    <div className="absolute bottom-4 left-4 flex gap-2">
      {gameState.isHost && (
        <button
          onClick={() => {
            update(dbRef(database, `games/${gameState.gameId}`), {
              gameStatus: gameState.gameStatus === 'playing' ? 'paused' : 'playing'
            });
          }}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {gameState.gameStatus === 'playing' ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5" />
          )}
        </button>
      )}
    </div>
  );

  // Copy game link functionality
  const copyGameLink = async () => {
    const link = `${window.location.origin}/#/puzzle/multiplayer/${gameState.gameId}`;
    try {
      await navigator.clipboard.writeText(link);
      alert('Game link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy game link:', err);
    }
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Header with controls */}
      <div className="p-4 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {gameState.isHost && gameState.gameStatus === 'waiting' && (
            <label className="relative cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const imageRef = storageRef(storage, `puzzles/${gameState.gameId}`);
                    const snapshot = await uploadBytes(imageRef, file);
                    const url = await getDownloadURL(snapshot.ref);
                    await update(dbRef(database, `games/${gameState.gameId}`), {
                      imageUrl: url
                    });
                  }
                }}
                className="hidden"
              />
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                            rounded-lg text-white transition-colors">
                <Camera className="w-5 h-5" />
                <span>Upload Image</span>
              </div>
            </label>
          )}

          <button
            onClick={copyGameLink}
            className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-white">
            Players: {Object.keys(players).length}
          </div>
          {gameState.gameStatus === 'playing' && (
            <div className="text-white">
              Progress: {Math.round(progress)}%
            </div>
          )}
        </div>
      </div>

      {/* Main puzzle area */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />
        <PlayerList />
        <GameControls />

        {/* Camera controls */}
        <div className="absolute left-4 top-4 flex flex-col gap-2">
          <button
            onClick={() => cameraRef.current.position.z -= 1}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={() => cameraRef.current.position.z += 1}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              cameraRef.current.position.set(0, 0, 5);
              controlsRef.current.reset();
            }}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation buttons */}
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={() => navigate('/')}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            <Home className="w-5 h-5" />
          </button>
          <button
            onClick={async () => {
              await cleanupGame();
              navigate('/');
            }}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultiplayerPuzzle;