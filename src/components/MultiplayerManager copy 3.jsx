// 1. Imports
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Share2, Download, Copy } from 'lucide-react';
import { database, ref, set, onValue, update, remove, onDisconnect, push, auth } from '../firebase';
import { useParams } from 'react-router-dom';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from 'react-tooltip';
import DifficultyBar, { difficulties } from './DifficultyBar';

// Add error boundary component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-100 text-red-700">
          <h2>Something went wrong!</h2>
          <p>{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// 2. Constants
const DIFFICULTY_SETTINGS = {
  easy: { grid: { x: 3, y: 2 }, snapDistance: 0.4, rotationEnabled: false },
  medium: { grid: { x: 4, y: 3 }, snapDistance: 0.3, rotationEnabled: true },
  hard: { grid: { x: 5, y: 4 }, snapDistance: 0.2, rotationEnabled: true },
  expert: { grid: { x: 6, y: 5 }, snapDistance: 0.15, rotationEnabled: true }
};

const ACHIEVEMENTS = [
  { id: 'speed_demon', name: 'Speed Demon', description: 'Complete puzzle under 2 minutes', icon: '⚡' },
  { id: 'perfectionist', name: 'Perfectionist', description: 'Complete without misplacing pieces', icon: '✨' },
  { id: 'persistent', name: 'Persistent', description: 'Complete on expert difficulty', icon: '🏆' }
];

// 3. Helper Classes
class SoundSystem {
  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.sounds = {};
    this.enabled = true;
  }

  async initialize() {
    this.sounds.pickup = this.createToneBuffer(440, 0.1);
    this.sounds.place = this.createToneBuffer(880, 0.15);
    this.sounds.complete = this.createToneBuffer([523.25, 659.25, 783.99], 0.3);
  }

  createToneBuffer(frequency, duration) {
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    const frequencies = Array.isArray(frequency) ? frequency : [frequency];

    for (let i = 0; i < buffer.length; i++) {
      let sample = 0;
      frequencies.forEach(freq => {
        sample += Math.sin(2 * Math.PI * freq * i / sampleRate);
      });
      data[i] = sample / frequencies.length * Math.exp(-3 * i / buffer.length);
    }
    return buffer;
  }

  play(soundName) {
    if (!this.enabled || !this.sounds[soundName]) return;
    const source = this.context.createBufferSource();
    source.buffer = this.sounds[soundName];
    source.connect(this.context.destination);
    source.start();
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

class ParticleSystem {
  constructor(scene) {
    this.particles = [];
    this.scene = scene;
    
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 0.05,
      map: new THREE.TextureLoader().load('/api/placeholder/32/32'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.particleSystem = new THREE.Points(geometry, material);
    scene.add(this.particleSystem);
  }
  
  emit(position, count = 20) {
    // Increase particle count and add color variation
    for (let i = 0; i < count; i++) {
      this.particles.push({
        position: position.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.3, // Increased spread
          (Math.random() - 0.5) * 0.3,
          Math.random() * 0.3
        ),
        life: 1.0,
        color: new THREE.Color(
          0.5 + Math.random() * 0.5,
          0.8 + Math.random() * 0.2,
          0.5 + Math.random() * 0.5
        )
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

// 4. Shader Definitions
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
      float correctStrength = correctPosition * 0.5 * (0.5 + 0.5 * sin(time * 2.0));
      
      vec3 finalColor = texColor.rgb * (vec3(0.3) + vec3(0.7) * diff);
      finalColor += highlightColor * highlightStrength + correctColor * correctStrength;
      
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
};

// 5. Helper Components
const ShareModal = ({ onClose, timeElapsed, downloadPuzzleImage, players }) => {
  return (
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
};

const DifficultyModal = ({ selectedDifficulty, onSelect, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-4xl w-full p-6">
        <h2 className="text-2xl font-bold text-white mb-4">Select Difficulty</h2>
        <DifficultyBar
          selectedDifficulty={selectedDifficulty}
          onSelect={(difficulty) => {
            handleDifficultyChange(difficulty);
            setShowDifficultyModal(false);
          }}
        />
      </div>
    </div>
  );
};

// Add this new component for better organization
const ControlGroup = ({ children, label }) => (
  <div className="flex flex-col items-start">
    <span className="text-xs text-gray-400 mb-1">{label}</span>
    <div className="flex items-center gap-2">
      {children}
    </div>
  </div>
);

// Add achievement handler
const handleAchievement = (achievementId) => {
  const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
  if (!achievement) return;

  // Show achievement notification
  const notification = document.createElement('div');
  notification.className = 'achievement-notification';
  notification.innerHTML = `
    <div class="flex items-center gap-2 bg-gray-800 text-white p-4 rounded-lg shadow-lg">
      <span class="text-2xl">${achievement.icon}</span>
      <div>
        <h3 class="font-bold">${achievement.name}</h3>
        <p class="text-sm text-gray-300">${achievement.description}</p>
      </div>
    </div>
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
};

// 6. Main Component
const PuzzleGame = ({ gameId: propGameId, isHost: propIsHost, user }) => {
  // State declarations
  const { 
    players, 
    gameState: multiplayerGameState, 
    error, 
    updatePiecePosition, 
    updateGameState,
    syncPuzzleState,  // Add this line
    syncPieceState,   // Add this line if needed
    // syncPieceMovement // Add this line if needed
  } = useMultiplayerGame(propGameId);

  // Add currentUser from auth
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  
  // Update your existing states
  const [isHost, setIsHost] = useState(propIsHost);
  const { gameId } = useParams() || { gameId: propGameId };

  // State management
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [gameState, setGameState] = useState('initial'); // 'initial', 'playing', 'paused'
  const [showThumbnail, setShowThumbnail] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [cursors, setCursors] = useState({});
  const [lockedPieces, setLockedPieces] = useState({});
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulties[0]);
  const [difficulty, setDifficulty] = useState('easy');
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);
  const [misplacedPieces, setMisplacedPieces] = useState(0);

  // Add loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(null);

  // Refs
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const composerRef = useRef(null);
  const controlsRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const particleSystemRef = useRef(null);
  const puzzlePiecesRef = useRef([]);
  const selectedPieceRef = useRef(null);
  const timerRef = useRef(null);
  const guideOutlinesRef = useRef([]);
  const puzzleContainerRef = useRef(null);

  const defaultCameraPosition = { x: 0, y: 0, z: 5 };
  const defaultControlsTarget = new THREE.Vector3(0, 0, 0);

  // Timer formatting
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Game state management
  const startGame = () => {
    setGameState('playing');
    setIsTimerRunning(true);

  };

  // Then modify the togglePause function to use it
  const togglePause = useCallback(() => {
    if (gameState === 'playing') {
      setGameState('paused');
      setIsTimerRunning(false);
      if (gameId) {
        updateGameState({ state: 'paused' });
      }
    } else if (gameState === 'paused') {
      setGameState('playing');
      setIsTimerRunning(true);
      if (gameId) {
        updateGameState({ state: 'playing' });
      }
    }
  }, [gameState, gameId, updateGameState]);

  // Camera controls
  const handleZoomIn = () => {
    if (cameraRef.current) {
      const newZ = Math.max(cameraRef.current.position.z - 1, 2);
      cameraRef.current.position.setZ(newZ);
    }
  };

  const handleZoomOut = () => {
    if (cameraRef.current) {
      const newZ = Math.min(cameraRef.current.position.z + 1, 10);
      cameraRef.current.position.setZ(newZ);
    }
  };

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(
        defaultCameraPosition.x,
        defaultCameraPosition.y,
        defaultCameraPosition.z
      );
      controlsRef.current.target.copy(defaultControlsTarget);
      controlsRef.current.update();
    }
  };

  const handleResetGame = () => {
    if (!sceneRef.current || !image) return;
    
    setTimeElapsed(0);
    setCompletedPieces(0);
    setProgress(0);
    setIsTimerRunning(true);
    
    puzzlePiecesRef.current.forEach(piece => {
      piece.position.x = piece.userData.originalPosition.x + (Math.random() - 0.5) * 2;
      piece.position.y = piece.userData.originalPosition.y + (Math.random() - 0.5) * 2;
      piece.position.z = Math.random() * 0.5;
      piece.rotation.z = (Math.random() - 0.5) * 0.5;
      piece.userData.isPlaced = false;
      if (piece.material.uniforms) {
        piece.material.uniforms.correctPosition.value = 0;
      }
    });

    handleResetView();
  };

  // Create placement guides
  const createPlacementGuides = (gridSize, pieceSize) => {
    guideOutlinesRef.current.forEach(guide => sceneRef.current.remove(guide));
    guideOutlinesRef.current = [];

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
  };

  // Create puzzle pieces
  const createPuzzlePieces = async (imageUrl) => {
    if (!sceneRef.current) return;

    puzzlePiecesRef.current.forEach(piece => {
      sceneRef.current.remove(piece);
    });
    puzzlePiecesRef.current = [];

    try {
      const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
      const aspectRatio = texture.image.width / texture.image.height;
      
      const baseSize = 2.5;
      const gridSize = DIFFICULTY_SETTINGS[difficulty].grid;
      const pieceSize = {
        x: (baseSize * aspectRatio) / gridSize.x,
        y: baseSize / gridSize.y
      };

      setTotalPieces(gridSize.x * gridSize.y);
      createPlacementGuides(gridSize, pieceSize);

      for (let y = 0; y < gridSize.y; y++) {
        for (let x = 0; x < gridSize.x; x++) {
          const geometry = new THREE.PlaneGeometry(
            pieceSize.x * 0.95,
            pieceSize.y * 0.95,
            32,
            32
          );

          const material = new THREE.ShaderMaterial({
            uniforms: {
              map: { value: texture },
              heightMap: { value: texture },
              uvOffset: { value: new THREE.Vector2(x / gridSize.x, y / gridSize.y) },
              uvScale: { value: new THREE.Vector2(1 / gridSize.x, 1 / gridSize.y) },
              extrusionScale: { value: 0.15 },
              selected: { value: 0.0 },
              correctPosition: { value: 0.0 },
              time: { value: 0.0 }
            },
            vertexShader: puzzlePieceShader.vertexShader,
            fragmentShader: puzzlePieceShader.fragmentShader,
            side: THREE.DoubleSide
          });

          const piece = new THREE.Mesh(geometry, material);
          
          piece.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
          piece.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
          piece.position.z = 0;

          piece.userData.originalPosition = piece.position.clone();
          piece.userData.gridPosition = { x, y };
          piece.userData.isPlaced = false;

          // Add difficulty-based rotation if enabled
          if (DIFFICULTY_SETTINGS[difficulty].rotationEnabled) {
            piece.rotation.z = (Math.random() - 0.5) * Math.PI;
          }
          
          // Adjust snap distance based on difficulty
          piece.userData.snapDistance = DIFFICULTY_SETTINGS[difficulty].snapDistance;

          sceneRef.current.add(piece);
          puzzlePiecesRef.current.push(piece);
        }
      }

      setTimeElapsed(0);
      setIsTimerRunning(true);

      // Scramble pieces
      puzzlePiecesRef.current.forEach(piece => {
        piece.position.x += (Math.random() - 0.5) * 2;
        piece.position.y += (Math.random() - 0.5) * 2;
        piece.position.z += Math.random() * 0.5;
        piece.rotation.z = (Math.random() - 0.5) * 0.5;
        piece.userData.isPlaced = false; // Ensure pieces start as not placed
        if (piece.material.uniforms) {
          piece.material.uniforms.correctPosition.value = 0;
        }
      });

      // After creating pieces, if host, sync the initial piece positions
      if (isHost) {
        const piecesData = {};
        puzzlePiecesRef.current.forEach((piece, index) => {
          piecesData[`piece_${index}`] = {
            id: `piece_${index}`,
            position: {
              x: piece.position.x,
              y: piece.position.y,
              z: piece.position.z
            },
            rotation: piece.rotation.z,
            isPlaced: piece.userData.isPlaced,
            gridPosition: piece.userData.gridPosition
          };
          // Add the id to the piece's userData for future reference
          piece.userData.id = `piece_${index}`;
        });

        await syncPieceState(piecesData);
      }
    } catch (error) {
      console.error('Failed to create puzzle pieces:', error);
    }
  };

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
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5, // Bloom strength
      0.4, // Radius
      0.85 // Threshold
    ));
    composerRef.current = composer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 10;
    controls.minDistance = 2;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Particle system
    particleSystemRef.current = new ParticleSystem(scene);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      const deltaTime = clockRef.current.getDelta();
      
      // Update controls
      controls.update();
      
      // Update particles
      particleSystemRef.current.update(deltaTime);
      
      // Update shader uniforms
      puzzlePiecesRef.current.forEach(piece => {
        if (piece.material.uniforms) {
          piece.material.uniforms.time.value = clockRef.current.getElapsedTime();
        }
      });
      
      // Render scene
      composer.render();
    };
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Timer effect
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning]);

  // Stop timer when puzzle is complete
  useEffect(() => {
    if (progress === 100) {
      setIsTimerRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setShowShareModal(true);
    }
  }, [progress]);

  // Add these functions before the piece movement useEffect
  const lockPiece = async (pieceId) => {
    if (!gameId || !currentUser) return false;
    
    try {
      const lockRef = ref(database, `games/${gameId}/locks/${pieceId}`);
      const lockData = {
        userId: currentUser.uid,
        timestamp: Date.now()
      };
      
      await set(lockRef, lockData);
      setLockedPieces(prev => ({
        ...prev,
        [pieceId]: lockData
      }));
      
      // Set up automatic unlock on disconnection
      onDisconnect(lockRef).remove();
      
      return true;
    } catch (error) {
      console.error('Failed to lock piece:', error);
      return false;
    }
  };

  const unlockPiece = async (pieceId) => {
    if (!gameId || !currentUser) return false;
    
    try {
      const lockRef = ref(database, `games/${gameId}/locks/${pieceId}`);
      await remove(lockRef);
      
      setLockedPieces(prev => {
        const newLocks = { ...prev };
        delete newLocks[pieceId];
        return newLocks;
      });
      
      return true;
    } catch (error) {
      console.error('Failed to unlock piece:', error);
      return false;
    }
  };

  // Add listener for piece locks
  useEffect(() => {
    if (!gameId) return;

    const locksRef = ref(database, `games/${gameId}/locks`);
    const unsubscribe = onValue(locksRef, (snapshot) => {
      const locks = snapshot.val() || {};
      setLockedPieces(locks);
    });

    return () => unsubscribe();
  }, [gameId]);

  // Handle piece selection and movement
  useEffect(() => {
    if (!rendererRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let dragPlane = new THREE.Plane();
    let dragOffset = new THREE.Vector3();
    
    const handleMouseDown = async (event) => {
      event.preventDefault();
      
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        const piece = intersects[0].object;
        
        // Prevent interaction if piece is already placed
        if (piece.userData.isPlaced) return;

        const pieceId = piece.userData.id;

        // Check if piece is locked by another user
        if (lockedPieces[pieceId] && lockedPieces[pieceId].userId !== currentUser.uid) {
          return;
        }

        // Try to lock the piece
        const locked = await lockPiece(pieceId);
        if (!locked) return;

        isDragging = true;
        selectedPieceRef.current = piece;
        controlsRef.current.enabled = false;

        // Calculate drag offset and update shader
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(0, 0, 1)),
          intersectPoint
        );
        dragOffset.subVectors(selectedPieceRef.current.position, intersectPoint);

        if (selectedPieceRef.current.material.uniforms) {
          selectedPieceRef.current.material.uniforms.selected.value = 1.0;
        }
      }
    };

    const handleMouseMove = (event) => {
      if (!isDragging || !selectedPieceRef.current) return;

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 0, 1)),
        intersectPoint
      );
      
      // Apply the original offset to maintain grab point
      selectedPieceRef.current.position.copy(intersectPoint.add(dragOffset));
      
      // Sync piece movement with other players
      syncPieceMovement(selectedPieceRef.current);
      
      // Update cursor position in Firebase
      updateCursorPosition({
        x: mouse.x,
        y: mouse.y
      });
    };

    const handleMouseUp = async () => {
      if (!selectedPieceRef.current) return;

      isDragging = false;
      const originalPos = selectedPieceRef.current.userData.originalPosition;
      const distance = originalPos.distanceTo(selectedPieceRef.current.position);

      if (distance < 0.3 && !selectedPieceRef.current.userData.isPlaced) {
        selectedPieceRef.current.position.copy(originalPos);
        selectedPieceRef.current.rotation.z = 0;
        selectedPieceRef.current.userData.isPlaced = true;
        
        // Sync the final position
        syncPieceMovement(selectedPieceRef.current);
        
        // Only increment completed pieces if this is a newly placed piece
        setCompletedPieces(prev => {
          const newCount = prev + 1;
          setProgress((newCount / totalPieces) * 100);
          return newCount;
        });

        if (particleSystemRef.current) {
          particleSystemRef.current.emit(selectedPieceRef.current.position, 30);
        }
      }

      if (selectedPieceRef.current.material.uniforms) {
        selectedPieceRef.current.material.uniforms.selected.value = 0.0;
        selectedPieceRef.current.material.uniforms.correctPosition.value = 
          selectedPieceRef.current.userData.isPlaced ? 1.0 : 0.0;
      }
      
      const pieceId = selectedPieceRef.current.userData.id;
      await unlockPiece(pieceId);
      
      selectedPieceRef.current = null;
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
  }, [totalPieces, lockedPieces, currentUser]);

  // Handle image upload
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file || !isHost) return;
  
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const imageData = e.target.result;
      setImage(imageData);
      
      try {
        // First sync the image with other players
        await syncPuzzleState({
          imageUrl: imageData,
          createdAt: Date.now(),
          settings: {
            gridSize: { x: 4, y: 3 } // You can make this configurable
          }
        });
    
        // Then create puzzle pieces
        await createPuzzlePieces(imageData);
        setLoading(false);
        setIsTimerRunning(false);
        setCompletedPieces(0);
        setProgress(0);
      } catch (error) {
        console.error('Failed to upload image:', error);
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!gameId || !currentUser) return;

    // Create game reference
    const gameRef = ref(database, `games/${gameId}`);
    
    // If host, initialize game state
    if (window.location.hash.includes(gameId) && !window.location.hash.includes('join')) {
      setIsHost(true);
      set(gameRef, {
        host: currentUser.uid,
        state: 'waiting',
        players: {
          [currentUser.uid]: {
            id: currentUser.uid,
            name: currentUser.displayName || currentUser.email || 'Anonymous',
            isHost: true,
            lastActive: Date.now()
          }
        },
        puzzle: {
          pieces: [],
          completed: false
        },
        created: Date.now()
      });

      // Generate invite link
      const baseUrl = window.location.origin + window.location.pathname;
      setInviteLink(`${baseUrl}#/puzzle/multiplayer/join_${gameId}`);
    }

    // Listen for game state changes
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameState(data);
        // setPlayers(data.players || {});
      }
    });

    // Handle player disconnection
    const playerRef = ref(database, `games/${gameId}/players/${currentUser.uid}`);
    onDisconnect(playerRef).remove();

    // Add current player
    if (!isHost) {
      update(ref(database, `games/${gameId}/players/${currentUser.uid}`), {
        id: currentUser.uid,
        name: currentUser.displayName || 'Anonymous',
        isHost: false,
        lastActive: Date.now()
      });
    }

    return () => {
      unsubscribe();
      remove(playerRef);
    };
  }, [gameId, currentUser]);

  // Modify piece movement handler to sync with other players
  const handlePieceMove = (piece, position) => {
    if (!gameId || !currentUser) return;
    
    update(ref(database, `games/${gameId}/puzzle/pieces/${piece.id}`), {
      position: position.toArray(),
      lastMoved: {
        by: currentUser.uid,
        at: Date.now()
      }
    });
  };

  // Add cursor position sharing
  const handleMouseMove = (event) => {
    if (!gameId || !currentUser) return;
    
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    update(ref(database, `games/${gameId}/players/${currentUser.uid}/cursor`), {
      x, y,
      timestamp: Date.now()
    });
  };

  // Add listener for piece updates from other players
  useEffect(() => {
    if (!gameId || !multiplayerGameState?.puzzle?.pieces) return;

    const pieces = multiplayerGameState.puzzle.pieces;
    Object.entries(pieces).forEach(([pieceId, pieceData]) => {
      const piece = puzzlePiecesRef.current.find(p => p.userData.id === pieceId);
      if (piece && pieceData.lastMoved?.by !== currentUser.uid) {
        piece.position.set(
          pieceData.position.x,
          pieceData.position.y,
          pieceData.position.z
        );
        piece.rotation.z = pieceData.rotation;
        piece.userData.isPlaced = pieceData.isPlaced;
        piece.material.uniforms.correctPosition.value = pieceData.isPlaced ? 1.0 : 0.0;
      }
    });
  }, [multiplayerGameState?.puzzle?.pieces, currentUser.uid]);

  // Sync initial puzzle state when host uploads image
  useEffect(() => {
    if (isHost && image) {
      syncPuzzleState({
        imageUrl: image,
        createdAt: Date.now(),
        pieces: puzzlePiecesRef.current.map(piece => ({
          id: piece.userData.id,
          position: {
            x: piece.position.x,
            y: piece.position.y,
            z: piece.position.z
          },
          rotation: piece.rotation.z,
          isPlaced: piece.userData.isPlaced
        }))
      });
    }
  }, [isHost, image]);

  // Load puzzle state for non-host players
  useEffect(() => {
    if (!isHost && multiplayerGameState?.puzzle?.imageUrl) {
      setImage(multiplayerGameState.puzzle.imageUrl);
      createPuzzlePieces(multiplayerGameState.puzzle.imageUrl);
    }
  }, [isHost, multiplayerGameState?.puzzle?.imageUrl]);

  // Add image sync listener for non-host players
  useEffect(() => {
    if (!gameId || !currentUser || isHost) return;

    const puzzleRef = ref(database, `games/${gameId}/puzzle`);
    const imageListener = onValue(puzzleRef, async (snapshot) => {
      const puzzleData = snapshot.val();
      if (puzzleData?.imageUrl && puzzleData.imageUrl !== image) {
        setLoading(true);
        setImage(puzzleData.imageUrl);
        await createPuzzlePieces(puzzleData.imageUrl);
        setLoading(false);
      }
    });

    return () => imageListener();
  }, [gameId, currentUser, isHost]);

  // Modify syncPieceMovement function first
  const syncPieceMovement = async (piece) => {
    if (!gameId || !currentUser) return;
    try {
      await update(ref(database, `games/${gameId}/puzzle/pieces/${piece.userData.id}`), {
        position: {
          x: piece.position.x,
          y: piece.position.y,
          z: piece.position.z
        },
        rotation: piece.rotation.z,
        isPlaced: piece.userData.isPlaced,
        lastMoved: {
          by: currentUser.uid,
          at: Date.now()
        }
      });
    } catch (error) {
      setError(error.message);
    }
  };

  const capturePuzzleImage = async () => {
    if (!puzzleContainerRef.current) return null;
    try {
      const canvas = await html2canvas(puzzleContainerRef.current);
      return canvas.toDataURL('image/png');
    } catch (err) {
      console.error('Failed to capture puzzle image:', err);
      return null;
    }
  };

  const downloadPuzzleImage = async () => {
    const imageData = await capturePuzzleImage();
    if (!imageData) return;

    const link = document.createElement('a');
    link.href = imageData;
    link.download = `multiplayer-puzzle-${gameId}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const shareToFacebook = () => {
    const url = encodeURIComponent(window.location.href);
    const playerCount = Object.keys(players).length;
    const text = encodeURIComponent(`I just completed a multiplayer puzzle with ${playerCount} players in ${formatTime(timeElapsed)}! Join me for another round!`);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank');
  };

  const shareToTwitter = () => {
    const url = encodeURIComponent(window.location.href);
    const playerCount = Object.keys(players).length;
    const text = encodeURIComponent(`Just finished a ${playerCount}-player puzzle challenge in ${formatTime(timeElapsed)}! #MultiplayerPuzzle #GameNight`);
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
  };

  const shareToWhatsApp = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`Join me for a multiplayer puzzle challenge! We just completed one in ${formatTime(timeElapsed)}. Click here to play: `);
    window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
  };

  // Add cursor effect
  useEffect(() => {
    if (!gameId) return;

    const cursorsRef = ref(database, `games/${gameId}/cursors`);
    const unsubscribe = onValue(cursorsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setCursors(data);
    });

    return () => unsubscribe();
  }, [gameId]);

  // Add cursor rendering
  useEffect(() => {
    if (!sceneRef.current) return;

    // Create cursor meshes
    Object.entries(cursors).forEach(([userId, data]) => {
      if (userId === currentUser.uid) return;

      let cursorMesh = sceneRef.current.getObjectByName(`cursor-${userId}`);
      if (!cursorMesh) {
        const geometry = new THREE.CircleGeometry(0.05, 32);
        const material = new THREE.MeshBasicMaterial({ 
          color: 0x00ff00,
          transparent: true,
          opacity: 0.5 
        });
        cursorMesh = new THREE.Mesh(geometry, material);
        cursorMesh.name = `cursor-${userId}`;
        sceneRef.current.add(cursorMesh);
      }

      // Update cursor position
      cursorMesh.position.set(data.position.x, data.position.y, 1);
    });
  }, [cursors, currentUser]);

  // Add completion celebration effect
  useEffect(() => {
    if (progress === 100) {
      // Create celebratory particle burst
      const center = new THREE.Vector3(0, 0, 0);
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          particleSystemRef.current.emit(center, 50);
        }, i * 100);
      }
    }
  }, [progress]);

  // Timer management
  useEffect(() => {
    if (!gameState || !isTimerRunning) return;

    const timer = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, isTimerRunning]);

  // Add game state synchronization
  useEffect(() => {
    if (!gameId || !currentUser) return;

    const gameStateRef = ref(database, `games/${gameId}/state`);
    const unsubscribe = onValue(gameStateRef, (snapshot) => {
      const state = snapshot.val();
      if (state) {
        setGameState(state);
        setIsTimerRunning(state === 'playing');
      }
    });

    return () => unsubscribe();
  }, [gameId, currentUser]);

  // Implement all initialized systems
  useEffect(() => {
    // Initialize sound system
    const soundSystem = new SoundSystem();
    soundSystem.initialize().then(() => {
      // Add sound effects to piece interactions
      const addSoundEffects = () => {
        puzzlePiecesRef.current.forEach(piece => {
          piece.userData.onPickup = () => soundSystem.play('pickup');
          piece.userData.onPlace = () => soundSystem.play('place');
        });
      };
      addSoundEffects();
    });

    // Initialize particle system
    if (sceneRef.current) {
      particleSystemRef.current = new ParticleSystem(sceneRef.current);
    }

    // Setup achievement tracking
    const checkAchievements = () => {
      if (progress === 100) {
        if (timeElapsed < 120) {
          // Speed demon achievement
          handleAchievement('speed_demon');
        }
        if (!misplacedPieces) {
          // Perfectionist achievement
          handleAchievement('perfectionist');
        }
        if (difficulty === 'expert') {
          // Persistent achievement
          handleAchievement('persistent');
        }
      }
    };

    return () => {
      soundSystem.context.close();
    };
  }, []);

  // Add difficulty change handler
  const handleDifficultyChange = async (newDifficulty) => {
    if (!isHost) {
      alert('Only the host can change difficulty');
      return;
    }

    if (gameState === 'playing') {
      const confirmChange = window.confirm('Changing difficulty will reset the puzzle for all players. Continue?');
      if (!confirmChange) return;
    }
    
    setSelectedDifficulty(newDifficulty);
    setDifficulty(newDifficulty.id);

    // Sync difficulty change with other players
    try {
      await update(ref(database, `games/${gameId}`), {
        difficulty: newDifficulty,
        lastUpdated: Date.now()
      });

      if (image) {
        setLoading(true);
        await createPuzzlePieces(image);
        setLoading(false);
        setGameState('playing');
        setIsTimerRunning(true);
        setCompletedPieces(0);
        setProgress(0);
        setTimeElapsed(0);
      }
    } catch (error) {
      console.error('Error updating difficulty:', error);
    }
  };

  // Add difficulty sync listener
  useEffect(() => {
    if (!gameId) return;

    const difficultyRef = ref(database, `games/${gameId}/difficulty`);
    const unsubscribe = onValue(difficultyRef, (snapshot) => {
      const newDifficulty = snapshot.val();
      if (newDifficulty && newDifficulty.id !== selectedDifficulty.id) {
        setSelectedDifficulty(newDifficulty);
        setDifficulty(newDifficulty.id);
        
        if (image) {
          setLoading(true);
          createPuzzlePieces(image).then(() => {
            setLoading(false);
            setGameState('playing');
            setIsTimerRunning(true);
            setCompletedPieces(0);
            setProgress(0);
            setTimeElapsed(0);
          });
        }
      }
    });

    return () => unsubscribe();
  }, [gameId, selectedDifficulty?.id, image]);

  // Add resource cleanup
  useEffect(() => {
    return () => {
      // Cleanup Three.js resources
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss();
      }
      if (particleSystemRef.current) {
        particleSystemRef.current.dispose();
      }
      puzzlePiecesRef.current.forEach(piece => {
        piece.geometry.dispose();
        piece.material.dispose();
      });
    };
  }, []);

  // Add performance optimization
  const debouncedSync = useCallback(
    debounce((piece) => syncPieceMovement(piece), 50),
    [syncPieceMovement]
  );

  // Modify piece movement handler
  // const handlePieceMove = useCallback((piece, position) => {
  //   piece.position.copy(position);
  //   debouncedSync(piece);
  // }, [debouncedSync]);

  // Wrap the return with ErrorBoundary
  return (
    <ErrorBoundary>
      <div className="w-full h-screen flex flex-col bg-gray-900">
        {/* Top Navigation Bar - Highest z-index for UI controls */}
        <div className="p-4 bg-gray-800 flex items-center justify-between relative z-[60] border-b border-gray-700">
          <div className="flex items-center gap-6">
            {/* Game Controls Group */}
            <ControlGroup label="Game Controls">
              <label className="relative cursor-pointer" data-tooltip-id="upload-tip">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                              rounded-lg text-white transition-colors">
          
          {progress === 100 && (
            <button
              onClick={() => setShowShareModal(true)}
              className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              data-tooltip-id="share-tip"
            >
              <Share2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 relative">
        {/* Sidebar - High z-index but below modals */}
        <div className="w-64 bg-gray-800 p-4 border-r border-gray-700 relative z-[40]">
          <h3 className="text-white font-semibold mb-4">Players</h3>
          <div className="space-y-3">
            {Object.values(players).map(player => (
              <div key={player.id} className="flex items-center gap-2 p-2 rounded bg-gray-700">
                <div className={`w-2 h-2 rounded-full ${
                  Date.now() - player.lastActive < 5000 ? 'bg-green-500' : 'bg-gray-500'
                }`} />
                <span className="text-white">{player.name}</span>
                {player.isHost && (
                  <span className="text-xs text-blue-400 ml-auto">Host</span>
                )}
              </div>
            ))}
          </div>
          
          {isHost && (
            <div className="mt-6 p-3 bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-400 mb-2">Invite Players</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="text-xs bg-gray-900 text-white p-2 rounded flex-1"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                    // Add toast notification here if you want
                  }}
                  className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Puzzle Container - Lower z-index for base layer */}
        <div className="flex-1 relative">
          {/* Main puzzle area - Base layer */}
          <div ref={puzzleContainerRef} className="w-full h-full relative" style={{ 
            isolation: 'isolate',
            zIndex: 1 
          }}>
            {/* THREE.js canvas container */}
            <div ref={containerRef} className="w-full h-full absolute inset-0" style={{
              zIndex: 10
            }} />

            {/* Camera controls - Above canvas */}
            <div className="absolute right-4 top-4 flex flex-col gap-2 z-[30]">
              <button
                onClick={handleZoomIn}
                className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <button
                onClick={handleResetView}
                className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                title="Reset View"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
              <button
                onClick={handleResetGame}
                className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                title="Reset Puzzle"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowThumbnail(!showThumbnail)}
                className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                title="Toggle Reference Image"
              >
                <Image className="w-5 h-5" />
              </button>
            </div>

            {/* Thumbnail overlay - Above canvas but below controls */}
            {showThumbnail && image && (
              <div className="absolute left-4 top-4 p-2 bg-gray-800 rounded-lg shadow-lg z-[20]">
                <div className="relative">
                  <img
                    src={image}
                    alt="Reference"
                    className="w-48 h-auto rounded border border-gray-600"
                  />
                </div>
              </div>
            )}

            {/* Loading overlay - Above everything in puzzle area */}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center 
                            bg-gray-900 bg-opacity-75 z-[50]">
                <div className="text-xl text-white">Loading puzzle...</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tooltips - Always on top */}
      <div className="z-[70]">
        <Tooltip id="upload-tip" content="Upload a new puzzle image" />
        <Tooltip id="pause-tip" content={gameState === 'playing' ? 'Pause Game' : 'Resume Game'} />
        <Tooltip id="start-tip" content="Start Game" />
        <Tooltip id="reset-tip" content="Reset Puzzle" />
        <Tooltip id="reference-tip" content="Toggle Reference Image" />
        <Tooltip id="share-tip" content="Share Achievement" />
      </div>

      {/* Modals - Highest z-index */}
      {showShareModal && (
        <div className="fixed inset-0 z-[100]">
          <ShareModal />
        </div>
      )}
      {showDifficultyModal && (
        <div className="fixed inset-0 z-[100]">
          <DifficultyModal />
        </div>
      )}
    </div>
  );
};

const MultiplayerManager = ({ gameId, isHost, user }) => {
  const { 
    players, 
    gameState, 
    handleGameCompletion,
    error,
    updatePiecePosition,
    updateGameState,
    syncPuzzleState,
    syncPieceState,
    syncPieceMovement
  } = useMultiplayerGame(gameId);

  const [progress, setProgress] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);

  // Add completion handler
  useEffect(() => {
    if (progress === 100) {
      handleGameCompletion({
        timeElapsed,
        playerId: user?.uid,
        gameId
      });
    }
  }, [progress, timeElapsed, user, gameId, handleGameCompletion]);

  // Render the PuzzleGame component with multiplayer props
  return (
    <PuzzleGame
      gameId={gameId}
      isHost={isHost}
      user={user}
      players={players}
      gameState={gameState}
      onPieceMove={updatePiecePosition}
      onGameStateChange={updateGameState}
      onPuzzleSync={syncPuzzleState}
      onPieceSync={syncPieceState}
      onProgress={setProgress}
      onTimeUpdate={setTimeElapsed}
      error={error}
    />
  );
};

// Change the default export to MultiplayerManager
export default MultiplayerManager;
