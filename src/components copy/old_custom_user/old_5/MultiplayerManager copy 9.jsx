// Imports
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { 
  Camera, Check, Clock, ZoomIn, ZoomOut, Maximize2,
  Play, Pause, Users, Copy, MessageCircle
} from 'lucide-react';
import { 
  getDatabase, ref, set, onValue, update, remove, 
  onDisconnect, push, get 
} from 'firebase/database';

// Helper Classes
class PlayerCursor extends THREE.Mesh {
  constructor(color) {
    const geometry = new THREE.RingGeometry(0.1, 0.12, 32);
    const material = new THREE.MeshBasicMaterial({ 
      color, transparent: true, opacity: 0.7, side: THREE.DoubleSide 
    });
    super(geometry, material);
    this.renderOrder = 999;
  }
}

// Shader Definitions
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
  // User Authentication
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const user = {
    id: userData?.uid || `user-${Date.now()}`,
    name: userData?.displayName || userData?.email || `Player ${Math.floor(Math.random() * 1000)}`
  };

  // State Management
  const [gameState, setGameState] = useState('initial');
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

  // Game Configuration
  const { gameId, isHost } = props;
  const database = getDatabase();

  // Three.js References
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const composerRef = useRef(null);
  const puzzlePiecesRef = useRef([]);
  const selectedPieceRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const playerCursorsRef = useRef({});
  const guideOutlinesRef = useRef([]);

  // Core Functions
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

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
      lastMoveTime: Date.now()
    });
  }, [gameId, user.id, database]);

  const createPlacementGuides = useCallback((gridSize, pieceSize) => {
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
        outline.position.set(
          (x - gridSize.x / 2 + 0.5) * pieceSize.x,
          (y - gridSize.y / 2 + 0.5) * pieceSize.y,
          -0.01
        );
        sceneRef.current.add(outline);
        guideOutlinesRef.current.push(outline);
      }
    }
  }, []);

  const createPuzzlePieces = useCallback(async (imageUrl) => {
    if (!sceneRef.current) return;
    const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
    const aspectRatio = texture.image.width / texture.image.height;
    const gridSize = { x: 4, y: 3 };
    const pieceSize = {
      x: 1 * aspectRatio / gridSize.x,
      y: 1 / gridSize.y
    };

    setTotalPieces(gridSize.x * gridSize.y);
    createPlacementGuides(gridSize, pieceSize);

    puzzlePiecesRef.current.forEach(piece => {
      sceneRef.current.remove(piece);
    });
    puzzlePiecesRef.current = [];

    // Create puzzle pieces
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
        piece.position.set(
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 4,
          Math.random() * 0.5
        );
        piece.rotation.z = (Math.random() - 0.5) * Math.PI / 2;
        piece.userData = {
          originalPosition: new THREE.Vector3(
            (x - gridSize.x / 2 + 0.5) * pieceSize.x,
            (y - gridSize.y / 2 + 0.5) * pieceSize.y,
            0
          ),
          gridPosition: { x, y },
          isPlaced: false,
          id: `piece_${x}_${y}`
        };

        sceneRef.current.add(piece);
        puzzlePiecesRef.current.push(piece);
        syncPiecePosition(piece);
      }
    }
  }, [createPlacementGuides, syncPiecePosition]);

  useEffect(() => {
    if (!gameId || !user.id) return;

    const gameRef = ref(database, `games/${gameId}`);
    const playerRef = ref(database, `games/${gameId}/players/${user.id}`);

    // Initialize game state
    onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameState(data.state);
        setPlayers(data.players || {});
        if (data.image && !image) {
          setImage(data.image);
          createPuzzlePieces(data.image);
        }
      }
    });

    // Handle piece movements
    const piecesRef = ref(database, `games/${gameId}/pieces`);
    onValue(piecesRef, (snapshot) => {
      const pieces = snapshot.val();
      if (pieces) {
        puzzlePiecesRef.current.forEach(piece => {
          const pieceData = pieces[piece.userData.id];
          if (pieceData && pieceData.lastMovedBy !== user.id) {
            piece.position.set(
              pieceData.position.x,
              pieceData.position.y,
              pieceData.position.z
            );
            piece.rotation.z = pieceData.rotation;
            piece.userData.isPlaced = pieceData.isPlaced;
          }
        });
      }
    });

    return () => {
      // Cleanup
      remove(playerRef);
    };
  }, [gameId, user.id, image, createPuzzlePieces]);

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const imageData = e.target.result;
      setImage(imageData);
      await createPuzzlePieces(imageData);
      setLoading(false);
      setGameState('playing');
      setIsTimerRunning(true);

      if (gameId) {
        update(ref(database, `games/${gameId}`), {
          image: imageData,
          state: 'playing'
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const togglePause = () => {
    const newState = gameState === 'playing' ? 'paused' : 'playing';
    setGameState(newState);
    setIsTimerRunning(newState === 'playing');
    
    if (gameId) {
      update(ref(database, `games/${gameId}`), { state: newState });
    }
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Game Header */}
      <div className="p-4 bg-gray-800 flex justify-between items-center">
        <div className="flex items-center gap-4">
          {/* Image Upload Button */}
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 
                          hover:bg-blue-700 rounded-lg text-white">
              <Camera className="w-5 h-5" />
              <span>Upload Image</span>
            </div>
          </label>

          {/* Game Controls */}
          {gameState !== 'initial' && (
            <button
              onClick={togglePause}
              className="p-2 bg-gray-700 text-white rounded-lg"
            >
              {gameState === 'playing' ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </button>
          )}

          {/* Timer and Progress */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-white">
              <Clock className="w-4 h-4" />
              <span>{formatTime(timeElapsed)}</span>
            </div>
            <div className="text-white">
              {completedPieces} / {totalPieces}
            </div>
          </div>
        </div>

        {/* Player Count */}
        <div className="text-white">
          <Users className="w-5 h-5 inline mr-2" />
          {Object.keys(players).length} Players
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />
        
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 
                         flex items-center justify-center">
            <div className="text-white text-xl">Loading puzzle...</div>
          </div>
        )}

        {/* Pause Overlay */}
        {gameState === 'paused' && (
          <div className="absolute inset-0 bg-black bg-opacity-50 
                         flex items-center justify-center">
            <div className="text-white text-3xl">PAUSED</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiplayerPuzzleGame;