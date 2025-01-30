import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMultiplayerGame } from '../../../hooks/useMultiplayerGame';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { getFirestore, doc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Medal } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Puzzle shaders and utility functions
import { puzzlePieceShader, outlineShader } from '../../../shaders/puzzleShaders';
import { ParticleSystem } from '../../../utils/ParticleSystem';
import { formatTime } from '../../../utils/formatTime';

const DIFFICULTY_SETTINGS = {
  easy: { grid: { x: 3, y: 2 }, snapDistance: 0.4 },
  medium: { grid: { x: 4, y: 3 }, snapDistance: 0.3 },
  hard: { grid: { x: 5, y: 4 }, snapDistance: 0.2 },
  expert: { grid: { x: 6, y: 5 }, snapDistance: 0.15 }
};

const MultiplayerManager = ({ gameId, isHost, user, image }) => {
  const navigate = useNavigate();

  console.log('MultiplayerManager mounted with:', {
    gameId,
    isHost,
    hasImage: !!image,
    user
  });
  
  // Refs for Three.js objects
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
  const guideOutlinesRef = useRef([]);
  const [sceneReady, setSceneReady] = useState(false); // Add this

  // Game state
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [showThumbnail, setShowThumbnail] = useState(false);
  const [gameStats, setGameStats] = useState({
    startTime: Date.now(),
    moveCount: 0,
    accurateDrops: 0,
    points: 0
  });
  const [winner, setWinner] = useState(null);

  // Use multiplayer game hook
  const {
    players,
    gameState,
    error,
    updatePiecePosition,
    syncPieceState,
    updateGameState
  } = useMultiplayerGame(gameId);

  // Create placement guides with enhanced visuals
  const createPlacementGuides = useCallback((gridSize, pieceSize) => {
    guideOutlinesRef.current.forEach(guide => sceneRef.current.remove(guide));
    guideOutlinesRef.current = [];

    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        // Create main outline
        const outlineGeometry = new THREE.EdgesGeometry(
          new THREE.PlaneGeometry(pieceSize.x * 0.95, pieceSize.y * 0.95)
        );
        const outlineMaterial = new THREE.ShaderMaterial({
          uniforms: {
            color: { value: new THREE.Color(0x4a90e2) },
            opacity: { value: 0.3 },
            time: { value: 0.0 }
          },
          vertexShader: outlineShader.vertexShader,
          fragmentShader: outlineShader.fragmentShader,
          transparent: true
        });
        
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
        outline.position.set(
          (x - gridSize.x / 2 + 0.5) * pieceSize.x,
          (y - gridSize.y / 2 + 0.5) * pieceSize.y,
          -0.01
        );

        // Add glow plane behind outline
        const glowGeometry = new THREE.PlaneGeometry(
          pieceSize.x * 1.0,
          pieceSize.y * 1.0
        );
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: 0x4a90e2,
          transparent: true,
          opacity: 0.1
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.copy(outline.position);
        glow.position.z = -0.02;

        sceneRef.current.add(outline);
        sceneRef.current.add(glow);
        guideOutlinesRef.current.push(outline, glow);
      }
    }
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    console.log('Initializing scene...');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    cameraRef.current = camera;

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
      0.5,
      0.4,
      0.85
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

    // Initialize particle system
    particleSystemRef.current = new ParticleSystem(scene);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      const deltaTime = clockRef.current.getDelta();
      const time = clockRef.current.getElapsedTime();

      // Update controls
      controls.update();

      // Update particles
      particleSystemRef.current.update(deltaTime);

      // Update shader uniforms
      puzzlePiecesRef.current.forEach(piece => {
        if (piece.material.uniforms) {
          piece.material.uniforms.time.value = time;
        }
      });

      // Update guide outlines
      guideOutlinesRef.current.forEach(guide => {
        if (guide.material.uniforms) {
          guide.material.uniforms.time.value = time;
        }
      });

      composer.render();
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
      composer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

  //   return () => {
  //     window.removeEventListener('resize', handleResize);
  //     renderer.dispose();
  //     containerRef.current?.removeChild(renderer.domElement);
  //   };
  // }, []);
  setSceneReady(true);
    console.log('Scene initialized');

    return () => {
      console.log('Cleaning up scene');
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (sceneReady && image && sceneRef.current) {
      console.log('Creating puzzle pieces now that scene is ready');
      createPuzzlePieces(image);
    }
  }, [sceneReady, image]);

  // Create puzzle pieces with enhanced features
  const createPuzzlePieces = useCallback(async (imageUrl) => {
    console.log('Starting piece creation');
    if (!sceneRef.current){
      console.error('Scene not initialized');
      return;
    } 

    // Clear existing pieces
    puzzlePiecesRef.current.forEach(piece => {
      sceneRef.current.remove(piece);
    });
    puzzlePiecesRef.current = [];

    try {
      const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
      console.log('Texture loaded:', texture);
      const aspectRatio = texture.image.width / texture.image.height;
      
      // Use difficulty settings
      const difficulty = gameState?.difficulty || 'medium';
      const gridSize = DIFFICULTY_SETTINGS[difficulty].grid;
      const snapDistance = DIFFICULTY_SETTINGS[difficulty].snapDistance;

      const pieceSize = {
        x: 1 * aspectRatio / gridSize.x,
        y: 1 / gridSize.y
      };

      setTotalPieces(gridSize.x * gridSize.y);
      createPlacementGuides(gridSize, pieceSize);

      // Create pieces with enhanced materials
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
          
          piece.userData = {
            id: `piece_${x}_${y}`,
            originalPosition: piece.position.clone(),
            gridPosition: { x, y },
            isPlaced: false,
            snapDistance
          };

          sceneRef.current.add(piece);
          puzzlePiecesRef.current.push(piece);
        }
      }

      // Scramble pieces
      puzzlePiecesRef.current.forEach(piece => {
        if (!piece.userData.isPlaced) {
          piece.position.x += (Math.random() - 0.5) * 2;
          piece.position.y += (Math.random() - 0.5) * 2;
          piece.position.z = Math.random() * 0.1;
          piece.rotation.z = (Math.random() - 0.5) * 0.2;
        }
      });

      // Sync initial piece positions if host
      if (isHost) {
        const piecesData = {};
        puzzlePiecesRef.current.forEach(piece => {
          piecesData[piece.userData.id] = {
            position: {
              x: piece.position.x,
              y: piece.position.y,
              z: piece.position.z
            },
            rotation: piece.rotation.z,
            isPlaced: piece.userData.isPlaced
          };
        });
        await syncPieceState(piecesData);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error creating puzzle pieces:', error);
      toast.error('Failed to create puzzle pieces');
      setLoading(false);
    }
  }, [gameState?.difficulty, isHost, syncPieceState, createPlacementGuides]);

  // Initialize puzzle when image is received
  useEffect(() => {
    console.log('Creating puzzle pieces with image:', image)
    if (image) {
      createPuzzlePieces(image);
    }
  }, [image, createPuzzlePieces]);

  // Handle piece movement with enhanced features
  useEffect(() => {
    if (!sceneRef.current || !rendererRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let moveStartPosition = null;

    const onMouseDown = (event) => {
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        const piece = intersects[0].object;
        if (!piece.userData.isPlaced) {
          selectedPieceRef.current = piece;
          isDragging = true;
          controlsRef.current.enabled = false;
          piece.material.uniforms.selected.value = 1.0;
          moveStartPosition = piece.position.clone();

          // Add hover effect to guide
          const guide = guideOutlinesRef.current.find(g => 
            g.position.x === piece.userData.originalPosition.x &&
            g.position.y === piece.userData.originalPosition.y
          );
          if (guide?.material.uniforms) {
            guide.material.uniforms.opacity.value = 0.6;
          }
        }
      }
    };

    const onMouseMove = (event) => {
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

      selectedPieceRef.current.position.copy(intersectPoint);
      
      // Sync piece position
      updatePiecePosition(selectedPieceRef.current.userData.id, {
        x: intersectPoint.x,
        y: intersectPoint.y,
        z: intersectPoint.z,
        rotation: selectedPieceRef.current.rotation.z
      });
    };

    const onMouseUp = () => {
      if (!selectedPieceRef.current) return;

      const piece = selectedPieceRef.current;
      const originalPos = piece.userData.originalPosition;
      const distance = originalPos.distanceTo(piece.position);

      // Update stats
      setGameStats(prev => ({
        ...prev,
        moveCount: prev.moveCount + 1
      }));

      if (distance < piece.userData.snapDistance && !piece.userData.isPlaced) {
        // Correct placement
        piece.position.copy(originalPos);
        piece.rotation.z = 0;
        piece.userData.isPlaced = true;
        piece.material.uniforms.correctPosition.value = 1.0;

        // Update stats
        setGameStats(prev => ({
          ...prev,
          accurateDrops: prev.accurateDrops + 1,
          points: prev.points + 100
        }));
        
        // Update completion progress
        setCompletedPieces(prev => {
          const newCount = prev + 1;
          const newProgress = (newCount / totalPieces) * 100;
          setProgress(newProgress);

          // Check for game completion
          if (newProgress === 100) {
            handleGameCompletion();
          }
          return newCount;
        });

        // Emit particles
        particleSystemRef.current.emit(piece.position, 30);

        // Sync final piece position
        updatePiecePosition(piece.userData.id, {
          x: originalPos.x,
          y: originalPos.y,
          z: originalPos.z,
          rotation: 0,
          isPlaced: true
        });
      }

      // Reset piece and controls state
      piece.material.uniforms.selected.value = 0.0;
      selectedPieceRef.current = null;
      isDragging = false;
      controlsRef.current.enabled = true;

      // Reset guide highlight
      guideOutlinesRef.current.forEach(guide => {
        if (guide.material.uniforms) {
          guide.material.uniforms.opacity.value = 0.3;
        }
      });
    };

    const element = rendererRef.current.domElement;
    element.addEventListener('mousedown', onMouseDown);
    element.addEventListener('mousemove', onMouseMove);
    element.addEventListener('mouseup', onMouseUp);
    element.addEventListener('mouseleave', onMouseUp);

    return () => {
      element.removeEventListener('mousedown', onMouseDown);
      element.removeEventListener('mousemove', onMouseMove);
      element.removeEventListener('mouseup', onMouseUp);
      element.removeEventListener('mouseleave', onMouseUp);
    };
  }, [updatePiecePosition, totalPieces]);

  // Handle game completion
  const handleGameCompletion = async () => {
    const completionTime = Date.now() - gameStats.startTime;
    const winData = {
      userId: user.uid,
      userName: user.displayName || user.email,
      completionTime,
      moveCount: gameStats.moveCount,
      accuracy: (gameStats.accurateDrops / gameStats.moveCount) * 100,
      points: gameStats.points,
      timestamp: Date.now()
    };

    try {
      // Update game state
      await updateGameState({
        status: 'completed',
        winner: winData,
        endedAt: Date.now()
      });

      // Save to leaderboard
      const db = getFirestore();
      await addDoc(collection(db, 'leaderboard'), {
        ...winData,
        gameId,
        difficulty: gameState?.difficulty || 'medium'
      });

      setWinner(winData);
      toast.success('Puzzle completed! 🎉');
    } catch (error) {
      console.error('Error handling game completion:', error);
      toast.error('Failed to save game results');
    }
  };

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
      cameraRef.current.position.set(0, 0, 5);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-white">Loading puzzle...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Player count */}
          <div className="text-white flex items-center gap-2">
            <Users size={20} />
            <span>{Object.keys(players).length} Players</span>
          </div>

          {/* Game stats */}
          <div className="text-white flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Clock size={18} />
              <span>{formatTime(Date.now() - gameStats.startTime)}</span>
            </div>
            <div>Moves: {gameStats.moveCount}</div>
            <div>Points: {gameStats.points}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-4">
          <div className="text-white">Progress: {Math.round(progress)}%</div>
          <div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowThumbnail(!showThumbnail)}
            className="p-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            title="Toggle Reference Image"
          >
            <Image size={20} />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            title="Zoom In"
          >
            <ZoomIn size={20} />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            title="Zoom Out"
          >
            <ZoomOut size={20} />
          </button>
          <button
            onClick={handleResetView}
            className="p-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            title="Reset View"
          >
            <Maximize2 size={20} />
          </button>
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />

        {/* Thumbnail overlay */}
        {showThumbnail && image && (
          <div className="absolute left-4 top-4 p-2 bg-gray-800 rounded-lg shadow-lg">
            <img
              src={image}
              alt="Reference"
              className="w-48 h-auto rounded border border-gray-600"
            />
          </div>
        )}

        {/* Players list */}
        <div className="absolute left-4 top-20 p-4 bg-gray-800 rounded-lg shadow-lg">
          <h3 className="text-white font-semibold mb-2">Players</h3>
          <div className="space-y-2">
            {Object.values(players).map(player => (
              <div key={player.id} className="flex items-center gap-2 text-white">
                <div className={`w-2 h-2 rounded-full ${
                  player.isOnline ? 'bg-green-500' : 'bg-gray-500'
                }`} />
                <span>{player.name}</span>
                {player.isHost && (
                  <span className="text-xs text-blue-400">(Host)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Winner modal */}
      {winner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <Medal className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-4">
                🎉 Puzzle Completed! 🎉
              </h2>
              <div className="space-y-2 mb-6">
                <p>Winner: {winner.userName}</p>
                <p>Time: {formatTime(winner.completionTime)}</p>
                <p>Moves: {winner.moveCount}</p>
                <p>Accuracy: {Math.round(winner.accuracy)}%</p>
                <p>Points: {winner.points}</p>
              </div>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiplayerManager;