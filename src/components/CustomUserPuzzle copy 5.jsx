import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ZoomIn, ZoomOut, RotateCw, Play, Home, Camera, Share2 } from 'lucide-react';

// Constants
const EXTRUSION_DEPTH = 0.1;
const PIECE_GAP = 0.05;
const POSITION_TOLERANCE = 0.1;
const ROTATION_TOLERANCE = 0.1;
const DEFAULT_DIFFICULTY = 3;
const MIN_DIFFICULTY = 2;
const MAX_DIFFICULTY = 6;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const PhotoPuzzle3D = () => {
    // Game state
    const [gameState, setGameState] = useState({
        imageUrl: '',
        difficulty: DEFAULT_DIFFICULTY,
        timer: 0,
        isStarted: false,
        isCompleted: false,
        startTime: null
    });

    // 3D scene state
    const [scene3D, setScene3D] = useState({
        pieces: [],
        selectedPiece: null,
        hoveredPiece: null
    });

    // UI state
    const [ui, setUi] = useState({
        loading: false,
        error: null,
        showControls: true,
        showShareModal: false
    });

    // Refs for Three.js
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const rendererRef = useRef(null);
    const controlsRef = useRef(null);
    const animationFrameRef = useRef(null);
    const raycasterRef = useRef(new THREE.Raycaster());
    const mouseRef = useRef(new THREE.Vector2());

    // Timer ref
    const timerIntervalRef = useRef(null);

    // Initialize 3D scene
    const initScene = useCallback(() => {
        if (!mountRef.current) return;

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f0f0);
        sceneRef.current = scene;

        // Camera setup
        const camera = new THREE.PerspectiveCamera(
            75,
            mountRef.current.clientWidth / mountRef.current.clientHeight,
            0.1,
            1000
        );
        camera.position.set(0, 0, 5);
        cameraRef.current = camera;

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        renderer.shadowMap.enabled = true;
        mountRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 10);
        directionalLight.castShadow = true;
        scene.add(directionalLight);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controlsRef.current = controls;

        // Animation loop
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Window resize handler
        const handleResize = () => {
            if (!mountRef.current) return;
            const width = mountRef.current.clientWidth;
            const height = mountRef.current.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (mountRef.current && renderer.domElement) {
                mountRef.current.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, []);

    // Create puzzle pieces
    const createPuzzlePieces = useCallback((texture) => {
        if (!sceneRef.current) return;

        // Clear existing pieces
        sceneRef.current.children
            .filter(child => child.userData.isPuzzlePiece)
            .forEach(piece => sceneRef.current.remove(piece));

        const pieces = [];
        const { difficulty } = gameState;
        const pieceWidth = 1 / difficulty;
        const pieceHeight = 1 / difficulty;

        // Create puzzle piece geometry
        const geometry = new THREE.BoxGeometry(
            pieceWidth - PIECE_GAP,
            pieceHeight - PIECE_GAP,
            EXTRUSION_DEPTH
        );

        for (let i = 0; i < difficulty; i++) {
            for (let j = 0; j < difficulty; j++) {
                // Create material with mapped texture
                const material = new THREE.MeshPhongMaterial({
                    map: texture,
                    shininess: 50
                });

                // Create mesh
                const piece = new THREE.Mesh(geometry, material);
                
                // Set correct position
                const correctX = (i - difficulty/2 + 0.5) * pieceWidth;
                const correctY = (j - difficulty/2 + 0.5) * pieceHeight;
                
                // Set random initial position
                piece.position.set(
                    (Math.random() - 0.5) * 3,
                    (Math.random() - 0.5) * 3,
                    0
                );

                // UV mapping for texture
                const uvAttribute = piece.geometry.attributes.uv;
                const startU = i / difficulty;
                const startV = j / difficulty;
                
                for (let k = 0; k < uvAttribute.count; k++) {
                    uvAttribute.setXY(
                        k,
                        startU + (uvAttribute.getX(k) / difficulty),
                        1 - (startV + (uvAttribute.getY(k) / difficulty))
                    );
                }

                // Add metadata
                piece.userData = {
                    isPuzzlePiece: true,
                    isPlaced: false,
                    correctPosition: new THREE.Vector3(correctX, correctY, 0),
                    id: `piece-${i}-${j}`
                };

                sceneRef.current.add(piece);
                pieces.push(piece);
            }
        }

        setScene3D(prev => ({ ...prev, pieces }));
    }, [gameState.difficulty]);

    // Handle image upload
    const handleImageUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setUi(prev => ({ ...prev, loading: true, error: null }));

            if (file.size > MAX_IMAGE_SIZE) {
                throw new Error('Image must be smaller than 5MB');
            }

            if (!file.type.startsWith('image/')) {
                throw new Error('File must be an image');
            }

            // Create object URL
            const imageUrl = URL.createObjectURL(file);
            
            // Load texture
            const textureLoader = new THREE.TextureLoader();
            const texture = await new Promise((resolve, reject) => {
                textureLoader.load(
                    imageUrl,
                    resolve,
                    undefined,
                    reject
                );
            });

            setGameState(prev => ({ ...prev, imageUrl }));
            createPuzzlePieces(texture);

        } catch (err) {
            console.error('Image upload error:', err);
            setUi(prev => ({
                ...prev,
                error: err.message || 'Failed to upload image'
            }));
        } finally {
            setUi(prev => ({ ...prev, loading: false }));
        }
    };

    // Handle piece selection
    const handlePieceSelection = useCallback((event) => {
        if (!sceneRef.current || !cameraRef.current) return;

        const rect = event.currentTarget.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
        const intersects = raycasterRef.current.intersectObjects(scene3D.pieces);

        if (intersects.length > 0) {
            const selectedPiece = intersects[0].object;
            setScene3D(prev => ({
                ...prev,
                selectedPiece: prev.selectedPiece === selectedPiece ? null : selectedPiece
            }));
        } else {
            setScene3D(prev => ({ ...prev, selectedPiece: null }));
        }
    }, [scene3D.pieces]);

    // Check piece placement
    const checkPiecePlacement = useCallback((piece) => {
        if (!piece.userData?.correctPosition) return false;

        const positionCorrect = piece.position.distanceTo(piece.userData.correctPosition) < POSITION_TOLERANCE;
        const rotationCorrect = 
            Math.abs(piece.rotation.x % (Math.PI * 2)) < ROTATION_TOLERANCE &&
            Math.abs(piece.rotation.y % (Math.PI * 2)) < ROTATION_TOLERANCE &&
            Math.abs(piece.rotation.z % (Math.PI * 2)) < ROTATION_TOLERANCE;

        const isCorrect = positionCorrect && rotationCorrect;

        if (isCorrect !== piece.userData.isPlaced) {
            piece.userData.isPlaced = isCorrect;
            if (isCorrect) {
                piece.position.copy(piece.userData.correctPosition);
                piece.rotation.set(0, 0, 0);
            }
        }

        return isCorrect;
    }, []);

    // Start game
    const startGame = () => {
        if (!gameState.imageUrl) return;

        setGameState(prev => ({
            ...prev,
            isStarted: true,
            startTime: Date.now(),
            timer: 0,
            isCompleted: false
        }));
    };

    // Update timer
    useEffect(() => {
        if (gameState.isStarted && !gameState.isCompleted) {
            timerIntervalRef.current = setInterval(() => {
                setGameState(prev => ({
                    ...prev,
                    timer: Math.floor((Date.now() - prev.startTime) / 1000)
                }));
            }, 1000);
        }

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
            }
        };
    }, [gameState.isStarted, gameState.isCompleted]);

    // Initialize scene
    useEffect(() => {
        const cleanup = initScene();
        return cleanup;
    }, [initScene]);

    // Handle piece movement
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (!scene3D.selectedPiece) return;

            const moveStep = 0.1;
            const rotateStep = Math.PI / 2;

            switch(event.key) {
                case 'ArrowLeft':
                    scene3D.selectedPiece.position.x -= moveStep;
                    break;
                case 'ArrowRight':
                    scene3D.selectedPiece.position.x += moveStep;
                    break;
                case 'ArrowUp':
                    scene3D.selectedPiece.position.y += moveStep;
                    break;
                case 'ArrowDown':
                    scene3D.selectedPiece.position.y -= moveStep;
                    break;
                case 'r':
                    scene3D.selectedPiece.rotation.z += rotateStep;
                    break;
                default:
                    return;
            }

            checkPiecePlacement(scene3D.selectedPiece);

            // Check if puzzle is completed
            const isCompleted = scene3D.pieces.every(piece => piece.userData.isPlaced);
            if (isCompleted && !gameState.isCompleted) {
                setGameState(prev => ({ ...prev, isCompleted: true }));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [scene3D.selectedPiece, scene3D.pieces, checkPiecePlacement]);

    // Render component
    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Header */}
            <div className="flex justify-between items-center p-4 bg-white shadow">
                <h1 className="text-xl font-bold">3D Photo Puzzle</h1>
                <div className="flex items-center gap-4">
                    <div className="text-lg">
                        Time: {Math.floor(gameState.timer / 60)}:
                        {String(gameState.timer % 60).padStart(2, '0')}
                    </div>
                    <button
                        onClick={() => setUi(prev => ({ ...prev, showControls: !prev.showControls }))}
                        className="p-2 rounded hover:bg-gray-100"
                    >
                        <Home className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 relative">
                {/* 3D view */}
                <div
                    ref={mountRef}
                    className="w-full h-full"
                    onClick={handlePieceSelection}
                />

                {/* Controls panel */}
                {ui.showControls && (
                    <div className="absolute top-4 left-4 bg-white p-4 rounded shadow">
                        {!gameState.imageUrl ? (
                            <div className="space-y-4">
                                <label className="block">
                                    <span className="text-gray-700">Upload Image</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="mt-1 block w-full"
                                    />
                                </label>
                                <div className="text-sm text-gray-500">
                                    Max size: 5MB
                                </div>
                            </div>
                        ) : !gameState.isStarted ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-700">Difficulty:</span>
                                    <select
                                        value={gameState.difficulty}
                                        onChange={(e) => setGameState(prev => ({
                                            ...prev,
                                            difficulty: parseInt(e.target.value)
                                        }))}
                                        className="border rounded p-1"
                                    >
                                        {Array.from(
                                            { length: MAX_DIFFICULTY - MIN_DIFFICULTY + 1 },
                                            (_, i) => MIN_DIFFICULTY + i
                                        ).map(level => (
                                            <option key={level} value={level}>
                                                {level}x{level}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={startGame}
                                    className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                                >
                                    <Play className="h-4 w-4 inline mr-2" />
                                    Start Game
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="text-sm text-gray-600">
                                    Controls:
                                    <ul className="mt-1 list-disc list-inside">
                                        <li>Arrow keys: Move piece</li>
                                        <li>R: Rotate piece</li>
                                        <li>Click: Select piece</li>
                                        <li>Drag: Orbit view</li>
                                        <li>Scroll: Zoom</li>
                                    </ul>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            if (controlsRef.current) {
                                                controlsRef.current.zoom0();
                                            }
                                        }}
                                        className="p-2 rounded hover:bg-gray-100"
                                        title="Reset Zoom"
                                    >
                                        <ZoomIn className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (scene3D.selectedPiece) {
                                                scene3D.selectedPiece.rotation.z += Math.PI / 2;
                                                checkPiecePlacement(scene3D.selectedPiece);
                                            }
                                        }}
                                        className="p-2 rounded hover:bg-gray-100"
                                        title="Rotate Piece"
                                    >
                                        <RotateCw className="h-4 w-4" />
                                    </button>
                                </div>
                                <div className="text-sm">
                                    Pieces placed: {scene3D.pieces.filter(p => p.userData.isPlaced).length}
                                    /{scene3D.pieces.length}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Loading overlay */}
                {ui.loading && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                    </div>
                )}

                {/* Error message */}
                {ui.error && (
                    <div className="absolute top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                        {ui.error}
                    </div>
                )}

                {/* Completion modal */}
                {gameState.isCompleted && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
                            <h2 className="text-2xl font-bold mb-4">Puzzle Completed!</h2>
                            <p className="mb-4">
                                Time: {Math.floor(gameState.timer / 60)}:
                                {String(gameState.timer % 60).padStart(2, '0')}
                            </p>
                            <div className="space-y-2">
                                <button
                                    onClick={() => setUi(prev => ({ ...prev, showShareModal: true }))}
                                    className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                                >
                                    <Share2 className="h-4 w-4 inline mr-2" />
                                    Share Result
                                </button>
                                <button
                                    onClick={() => {
                                        setGameState({
                                            imageUrl: '',
                                            difficulty: DEFAULT_DIFFICULTY,
                                            timer: 0,
                                            isStarted: false,
                                            isCompleted: false,
                                            startTime: null
                                        });
                                        setScene3D({
                                            pieces: [],
                                            selectedPiece: null,
                                            hoveredPiece: null
                                        });
                                    }}
                                    className="w-full border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
                                >
                                    Start New Puzzle
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PhotoPuzzle3D;