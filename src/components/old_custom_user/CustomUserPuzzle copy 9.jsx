// ImagePuzzle3D.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { gsap } from 'gsap';
import confetti from 'canvas-confetti';
import FirebaseService from '../../FirebaseService';

const GAME_MODES = {
  CLASSIC: 'classic',
  TIME_ATTACK: 'timeAttack',
  MULTIPLAYER: 'multiplayer',
  CHALLENGE: 'challenge'
};

const POWER_UPS = {
  HINT: 'hint',
  AUTO_ALIGN: 'autoAlign',
  EDGE_FINDER: 'edgeFinder',
  COLOR_SORT: 'colorSort'
};

const ImagePuzzle3D = () => {
  // Refs
  const mountRef = useRef(null);
  const composerRef = useRef(null);
  const roomIdRef = useRef(null);
  const playerIdRef = useRef(null);

  // Three.js state
  const [scene, setScene] = useState(null);
  const [camera, setCamera] = useState(null);
  const [renderer, setRenderer] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [dragControls, setDragControls] = useState(null);
  const [orbitControls, setOrbitControls] = useState(null);

  // Game state
  const [gameMode, setGameMode] = useState(GAME_MODES.CLASSIC);
  const [activePowerUp, setActivePowerUp] = useState(null);
  const [selectedPieces, setSelectedPieces] = useState([]);
  const [gameStats, setGameStats] = useState({
    totalPieces: 0,
    placedPieces: 0,
    startTime: null,
    elapsedTime: 0,
    score: 0,
    accuracy: 100
  });

  // Multiplayer state
  const [players, setPlayers] = useState([]);
  const [achievements, setAchievements] = useState([]);

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    const newScene = new THREE.Scene();
    newScene.background = new THREE.Color(0x1a1a2e);
    newScene.fog = new THREE.Fog(0x1a1a2e, 10, 50);

    const newCamera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.1, 1000
    );
    newCamera.position.set(0, 5, 10);

    const newRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      precision: 'highp'
    });
    newRenderer.setSize(window.innerWidth, window.innerHeight);
    newRenderer.setPixelRatio(window.devicePixelRatio);
    newRenderer.shadowMap.enabled = true;
    newRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    newRenderer.outputEncoding = THREE.sRGBEncoding;
    newRenderer.toneMapping = THREE.ACESFilmicToneMapping;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    const pointLight = new THREE.PointLight(0x4299e1, 1, 100);
    
    directionalLight.position.set(5, 5, 5);
    pointLight.position.set(0, 10, 0);
    
    [directionalLight, pointLight].forEach(light => {
      light.castShadow = true;
      light.shadow.mapSize.width = 2048;
      light.shadow.mapSize.height = 2048;
      newScene.add(light);
    });
    newScene.add(ambientLight);

    // Post-processing
    const composer = new EffectComposer(newRenderer);
    const renderPass = new RenderPass(newScene, newCamera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5, 0.4, 0.85
    );
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composerRef.current = composer;

    // Controls
    const newOrbitControls = new OrbitControls(newCamera, newRenderer.domElement);
    newOrbitControls.enableDamping = true;
    newOrbitControls.dampingFactor = 0.05;
    newOrbitControls.maxPolarAngle = Math.PI / 2;

    mountRef.current.appendChild(newRenderer.domElement);

    setScene(newScene);
    setCamera(newCamera);
    setRenderer(newRenderer);
    setOrbitControls(newOrbitControls);

    return () => {
      mountRef.current?.removeChild(newRenderer.domElement);
      newRenderer.dispose();
    };
  }, []);

  // Handle image upload and puzzle creation
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Upload image to Firebase Storage
      const imageUrl = await FirebaseService.uploadImage(file, roomIdRef.current);
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        const image = new Image();
        image.onload = () => {
          // Clear existing pieces
          pieces.forEach(piece => scene.remove(piece));
          setPieces([]);
          
          // Create new puzzle
          createPuzzlePieces(image);
          setGameStats(prev => ({
            ...prev,
            startTime: Date.now(),
            placedPieces: 0
          }));

          // Update game state in Firebase
          if (roomIdRef.current) {
            FirebaseService.updateGameState(roomIdRef.current, {
              imageUrl,
              status: 'active',
              startTime: Date.now()
            });
          }
        };
        image.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      // Handle error (show user feedback)
    }
  };

  // Create puzzle pieces with enhanced materials
  const createPuzzlePieces = useCallback(async (image, rows = 4, cols = 4) => {
    if (!scene || !camera || !renderer) return;

    const pieceWidth = image.width / cols;
    const pieceHeight = image.height / rows;
    const newPieces = [];
    const geometry = new THREE.BoxGeometry(1, 0.1, 1);


    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = pieceWidth;
        canvas.height = pieceHeight;
        
        context.drawImage(
          image,
          col * pieceWidth,
          row * pieceHeight,
          pieceWidth,
          pieceHeight,
          0,
          0,
          pieceWidth,
          pieceHeight
        );

        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        
        const materials = [
          new THREE.MeshPhysicalMaterial({
            color: 0x2c5282,
            metalness: 0.5,
            roughness: 0.5,
            clearcoat: 1.0
          }),
          new THREE.MeshPhysicalMaterial({
            color: 0x2c5282,
            metalness: 0.5,
            roughness: 0.5,
            clearcoat: 1.0
          }),
          new THREE.MeshPhysicalMaterial({
            map: texture,

            // map: texture,
            metalness: 0.1,
            roughness: 0.5,
            clearcoat: 0.5
          }),
          new THREE.MeshPhysicalMaterial({
            color: 0x2c5282,
            metalness: 0.5,
            roughness: 0.5,
            clearcoat: 1.0
          }),
          new THREE.MeshPhysicalMaterial({
            color: 0x2c5282,
            metalness: 0.5,
            roughness: 0.5,
            clearcoat: 1.0
          }),
          new THREE.MeshPhysicalMaterial({
            color: 0x2c5282,
            metalness: 0.5,
            roughness: 0.5,
            clearcoat: 1.0
          })
        ];

        const piece = new THREE.Mesh(geometry, materials);
        const pieceId = `piece_${row}_${col}`;
        piece.position.set(
            (col - cols / 2) * 1.1 + 0.5,
            3,
            (row - rows / 2) * 1.1 + 0.5
        );
        piece.castShadow = true;
        piece.receiveShadow = true;

        piece.userData = {
          correctPosition: new THREE.Vector3(
            (col - cols / 2) * 1.1 + 0.5,
            0,
            (row - rows / 2) * 1.1 + 0.5
          ),
          isPlaced: false,
          row,
          col,
          id: pieceId
        };

        scene.add(piece);
        newPieces.push(piece);

        // Save piece data to Firebase if in multiplayer mode
        if (roomIdRef.current) {
            try {
              await FirebaseService.createPiece(roomIdRef.current, {
                id: pieceId,
                position: {
                  x: piece.position.x,
                  y: piece.position.y,
                  z: piece.position.z
                },
                rotation: {
                  x: piece.rotation.x,
                  y: piece.rotation.y,
                  z: piece.rotation.z
                },
                row,
                col,
                isPlaced: false
              });
            } catch (error) {
              console.error('Error creating piece in Firebase:', error);
            }
          }
        }
      }

    // Initialize drag controls
    const newDragControls = new DragControls(newPieces, camera, renderer.domElement);
    
    newDragControls.addEventListener('dragstart', (event) => {
      orbitControls.enabled = false;
      handlePieceDragStart(event.object);
    });

    newDragControls.addEventListener('drag', (event) => {
      handlePieceDrag(event.object);
    });

    newDragControls.addEventListener('dragend', (event) => {
      orbitControls.enabled = true;
      handlePieceDragEnd(event.object);
    });

    setDragControls(newDragControls);
    setPieces(newPieces);
    setGameStats(prev => ({ ...prev, totalPieces: newPieces.length }));

    }, [scene, camera, renderer, orbitControls]);

  // Piece interaction handlers
  const handlePieceDragStart = useCallback((piece) => {
    gsap.to(piece.position, {
      y: piece.position.y + 0.5,
      duration: 0.2,
      ease: 'power2.out'
    });

    piece.material.forEach(mat => {
      if (mat.color) {
        gsap.to(mat.color, {
          r: 0.4,
          g: 0.6,
          b: 1.0,
          duration: 0.2
        });
      }
    });
  }, []);

  const handlePieceDrag = useCallback(async (piece) => {
    if (roomIdRef.current) {
      try {
        await FirebaseService.updatePiecePosition(roomIdRef.current, piece.userData.id, {
          x: piece.position.x,
          y: piece.position.y,
          z: piece.position.z
        }, {
          x: piece.rotation.x,
          y: piece.rotation.y,
          z: piece.rotation.z
        });
      } catch (error) {
        console.error('Error updating piece position:', error);
      }
    }
  }, []);

  const handlePieceDragEnd = useCallback((piece) => {
    checkPiecePlacement(piece);
  }, []);

  // Piece placement verification
  const checkPiecePlacement = useCallback((piece) => {
    const tolerance = 0.5;
    const correctPos = piece.userData.correctPosition;
    const distance = piece.position.distanceTo(correctPos);

    if (distance < tolerance && !piece.userData.isPlaced) {
      gsap.to(piece.position, {
        x: correctPos.x,
        y: correctPos.y,
        z: correctPos.z,
        duration: 0.3,
        ease: 'power2.out',
        onComplete: () => {
          createPlacementParticles(piece.position);
          checkPuzzleCompletion();
        }
      });

      piece.userData.isPlaced = true;
      setGameStats(prev => ({
        ...prev,
        placedPieces: prev.placedPieces + 1
      }));

      // Update Firebase if in multiplayer mode
      if (roomIdRef.current) {
        FirebaseService.updatePiecePosition(roomIdRef.current, piece.userData.id, {
          x: correctPos.x,
          y: correctPos.y,
          z: correctPos.z
        }, {
          x: piece.rotation.x,
          y: piece.rotation.y,
          z: piece.rotation.z
        });
      }
    }
  }, []);

  // Particle effects for correct placement
  const createPlacementParticles = useCallback((position) => {
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      colors[i * 3] = 0.4;
      colors[i * 3 + 1] = 0.6;
      colors[i * 3 + 2] = 1.0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    gsap.to(positions, {
      duration: 1,
      ease: 'power2.out',
      onUpdate: () => {
        for (let i = 0; i < particleCount; i++) {
          positions[i * 3] += (Math.random() - 0.5) * 0.1;
          positions[i * 3 + 1] += Math.random() * 0.1;
          positions[i * 3 + 2] += (Math.random() - 0.5) * 0.1;
        }
        geometry.attributes.position.needsUpdate = true;
      },
      onComplete: () => {
        scene.remove(particles);
        geometry.dispose();
        material.dispose();
      }
    });
  }, [scene]);

  // Check puzzle completion
  const checkPuzzleCompletion = useCallback(() => {
    const allPlaced = pieces.every(piece => piece.userData.isPlaced);
    if (allPlaced) {
      handlePuzzleComplete();
    }
  }, [pieces]);

  // Handle puzzle completion
  const handlePuzzleComplete = useCallback(() => {
    const endTime = Date.now();
    const timeElapsed = Math.floor((endTime - gameStats.startTime) / 1000);
    
    // Celebration effects
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Update game stats
    setGameStats(prev => ({
      ...prev,
      elapsedTime: timeElapsed
    }));

    // Save completion to Firebase if in multiplayer mode
    if (roomIdRef.current) {
      FirebaseService.updateGameState(roomIdRef.current, {
        status: 'completed',
        completionTime: timeElapsed
      });
    }
  }, [gameStats.startTime]);

  // Animation loop
  const animate = useCallback(() => {
    if (!renderer || !scene || !camera) return;

    requestAnimationFrame(animate);
    orbitControls?.update();
    composerRef.current.render();

    // Update game time
    if (gameStats.startTime && !gameStats.completionTime) {
      setGameStats(prev => ({
        ...prev,
        elapsedTime: Math.floor((Date.now() - prev.startTime) / 1000)
      }));
    }
  }, [renderer, scene, camera, orbitControls, gameStats.startTime, gameStats.completionTime]);

  // Window resize handler
  const handleWindowResize = useCallback(() => {
    if (!camera || !renderer) return;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composerRef.current.setSize(window.innerWidth, window.innerHeight);
  }, [camera, renderer]);

  // Initialize multiplayer room
  const initializeRoom = useCallback(async () => {
    if (gameMode !== GAME_MODES.MULTIPLAYER) return;
  
    try {
      const roomId = await FirebaseService.createRoom({
        gameMode,
        createdBy: playerIdRef.current,
        status: 'initializing',
        piecesCreated: false
      });
      roomIdRef.current = roomId;
  
      // Subscribe to room updates
      FirebaseService.subscribeToRoom(roomId, (roomData) => {
        if (roomData.status === 'active' && !roomData.piecesCreated) {
          // Initialize pieces collection
          FirebaseService.updateGameState(roomId, {
            piecesCreated: true
          });
        }
      });

      // Subscribe to piece updates
      FirebaseService.subscribeToPieces(roomId, (updatedPieces) => {
        updatePiecesFromFirebase(updatedPieces);
      });

      // Subscribe to player updates
      FirebaseService.subscribeToPieces(roomId, (players) => {
        setPlayers(players);
      });

    } catch (error) {
        console.error('Error initializing room:', error);
      }
    }, [gameMode]);

  // Update pieces from Firebase
  const updatePiecesFromFirebase = useCallback((updatedPieces) => {
    pieces.forEach(piece => {
      const updatedPiece = updatedPieces.find(p => p.id === piece.userData.id);
      if (updatedPiece && !piece.userData.isPlaced) {
        gsap.to(piece.position, {
          x: updatedPiece.position.x,
          y: updatedPiece.position.y,
          z: updatedPiece.position.z,
          duration: 0.3
        });
        gsap.to(piece.rotation, {
          x: updatedPiece.rotation.x,
          y: updatedPiece.rotation.y,
          z: updatedPiece.rotation.z,
          duration: 0.3
        });
      }
    });
  }, [pieces]);

  // Initialize everything
  useEffect(() => {
    initScene();
    if (gameMode === GAME_MODES.MULTIPLAYER) {
      initializeRoom();
    }

    return () => {
      if (roomIdRef.current) {
        FirebaseService.cleanupRoom(roomIdRef.current);
      }
    };
  }, [initScene, initializeRoom, gameMode]);

  // Start animation loop
  useEffect(() => {
    animate();
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [animate, handleWindowResize]);

  // Format time display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Common UI panel style
  const panelClasses = "absolute p-4 bg-blue-900 bg-opacity-80 rounded-lg text-white";
  
  // Button base style
  const buttonClasses = "px-4 py-2 rounded text-white transition-colors duration-200";


  return (
    <div className="relative w-full h-screen bg-slate-900">
      {/* Three.js container */}
      <div ref={mountRef} className="absolute inset-0" />

      UI Overlay
      <div className={`${panelClasses} top-4 left-4`}>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="block w-full text-sm mb-2 file:mr-4 file:py-2 file:px-4 
            file:rounded file:border-0 file:bg-blue-600 file:text-white
            hover:file:bg-blue-700"
        />
        <div className="space-y-1">
          <p>Pieces: {gameStats.placedPieces}/{gameStats.totalPieces}</p>
          <p>Time: {formatTime(gameStats.elapsedTime)}</p>
          <p>Mode: {gameMode}</p>
        </div>
      </div> 

      {/* Game Modes */}
      <div className={`${panelClasses} bottom-4 left-4 flex gap-2`}>
        {Object.values(GAME_MODES).map(mode => (
          <button
            key={mode}
            onClick={() => setGameMode(mode)}
            className={`${buttonClasses} ${
              gameMode === mode 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-blue-800 hover:bg-blue-900'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Multiplayer Status */}
      {gameMode === GAME_MODES.MULTIPLAYER && (
        <div className={`${panelClasses} top-4 right-4`}>
          <h3 className="font-medium mb-2">Players Online: {players.length}</h3>
          <ul className="space-y-1">
            {players.map(player => (
              <li key={player.id} className="text-sm">
                {player.name}
              </li>
            ))}
          </ul>
        </div>
      )} 

      {/* Instructions */}
      <div className={`${panelClasses} bottom-4 right-4`}>
        <ul className="space-y-1 text-sm">
          <li>Drag pieces to move them</li>
          <li>Right-click + drag to rotate view</li>
          <li>Scroll to zoom</li>
        </ul>
      </div> 
    </div>
  );
};

export default ImagePuzzle3D;