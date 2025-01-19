import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { Canvas, useLoader, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { gsap } from 'gsap';

// Utility function to shuffle array
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Enhanced Cube Component with animations and correct position tracking
function Cube({ position, textureUrl, textureOffsetX, textureOffsetY, isActive, isCorrect, currentPosition, targetPosition, onClick, index }) {
  const meshRef = useRef();
  const texture = useLoader(THREE.TextureLoader, textureUrl);
  const { camera } = useThree();
  
  // Set up texture
  useEffect(() => {
    if (texture) {
      texture.repeat.set(1/3, 1/3);
      texture.offset.set(textureOffsetX, textureOffsetY);
      texture.needsUpdate = true;
    }
  }, [texture, textureOffsetX, textureOffsetY]);

  // Handle correct placement animation
  useEffect(() => {
    if (isCorrect && meshRef.current) {
      gsap.to(meshRef.current.scale, {
        x: 1.2,
        y: 1.2,
        z: 1.2,
        duration: 0.3,
        yoyo: true,
        repeat: 1,
      });
    }
  }, [isCorrect]);

  useFrame(() => {
    if (meshRef.current) {
      // Base scaling for active state
      const baseScale = isActive ? 1.1 : 1;
      
      // Add slight hover effect when active
      if (isActive) {
        meshRef.current.rotation.y += 0.01;
      }

      // Add glow effect for correct placement
      if (isCorrect) {
        meshRef.current.material.emissive = new THREE.Color(0x00ff00);
        meshRef.current.material.emissiveIntensity = 0.2;
      } else {
        meshRef.current.material.emissive = new THREE.Color(0x000000);
      }
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick(index, currentPosition);
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial 
        map={texture}
        metalness={0.5}
        roughness={0.5}
      />
      {isActive && (
        <mesh scale={[1.02, 1.02, 1.02]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#ffffff" wireframe={true} transparent={true} opacity={0.2} />
        </mesh>
      )}
    </mesh>
  );
}

// Loading screen with progress bar
function LoadingScreen() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50 text-white">
      <div className="text-xl mb-4">Loading Game Assets...</div>
      <div className="w-48 h-2 bg-gray-700 rounded-full">
        <div className="w-full h-full bg-blue-500 rounded-full animate-pulse"></div>
      </div>
    </div>
  );
}

// Enhanced Game Statistics Component
function GameStats({ score, timeRemaining, correctPlacements, totalCubes, maxScore }) {
  const completionPercentage = (correctPlacements / totalCubes) * 100;
  const timePercentage = (timeRemaining / 90) * 100;
  const averageTimePerPiece = correctPlacements ? ((90 - timeRemaining) / correctPlacements).toFixed(1) : 0;

  const stats = useMemo(() => [{
    name: 'Progress',
    correct: correctPlacements,
    remaining: totalCubes - correctPlacements
  }], [correctPlacements, totalCubes]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score and Progress Card */}
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-gray-700">Progress</h3>
            <div className="text-sm text-blue-600">{correctPlacements}/{totalCubes}</div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{Math.round(completionPercentage)}%</div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 rounded-full h-2 transition-all duration-300" 
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>

        {/* Time Card */}
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-gray-700">Time Remaining</h3>
            <div className="text-sm text-green-600">{formatTime(timeRemaining)}</div>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`rounded-full h-2 transition-all duration-300 ${
                timeRemaining < 30 ? 'bg-red-500' : 'bg-green-600'
              }`}
              style={{ width: `${timePercentage}%` }}
            />
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Avg. time per piece: {averageTimePerPiece}s
          </div>
        </div>

        {/* Score Card */}
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-gray-700">Score</h3>
            <div className="text-sm text-purple-600">{score}</div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {Math.round((score / maxScore) * 100)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Points per correct piece: 10
          </div>
        </div>
      </div>

      {/* Progress Chart */}
      <div className="bg-white p-4 rounded-lg shadow-md">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Puzzle Progress</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="correct" fill="#4CAF50" name="Correct Placements" />
              <Bar dataKey="remaining" fill="#FF9800" name="Remaining" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// Image Upload Component with preview
function ImageUpload({ onUpload }) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragOut = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    setError('');
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFiles = (files) => {
    const file = files[0];
    
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        if (img.width < 300 || img.height < 300) {
          setError('Image must be at least 300x300 pixels');
          return;
        }
        setPreview(e.target.result);
        onUpload(e.target.result);
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      setError('Error reading file');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="text-center max-w-md mx-auto">
      <div
        className={`w-full h-64 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors ${
          dragging ? 'border-blue-500 bg-blue-100 bg-opacity-10' : 'border-gray-300'
        } ${preview ? 'bg-contain bg-center bg-no-repeat' : ''}`}
        style={preview ? { backgroundImage: `url(${preview})` } : {}}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {!preview && (
          <>
            <svg className="w-12 h-12 text-gray-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p className="mb-4 text-center text-gray-300">
              Drag and drop an image here, or click to select
            </p>
          </>
        )}
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 relative transition-colors"
        >
          {preview ? 'Change Image' : 'Upload Image'}
          <input
            type="file"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            accept="image/*"
          />
        </button>
      </div>
      {error && (
        <p className="mt-2 text-red-500">{error}</p>
      )}
    </div>
  );
}

// Enhanced 3D Game Component with piece randomization
function Game3D({ imageUrl, activePiece, correctPlacements, onPieceClick }) {
  const [positions, setPositions] = useState([]);
  const targetPositions = useMemo(() => [
    [-1, 1, 0], [0, 1, 0], [1, 1, 0],
    [-1, 0, 0], [0, 0, 0], [1, 0, 0],
    [-1, -1, 0], [0, -1, 0], [1, -1, 0],
  ], []);

  // Initialize randomized positions
  useEffect(() => {
    const shuffledIndices = shuffleArray([...Array(9)].map((_, i) => i));
    setPositions(shuffledIndices.map(i => targetPositions[i]));
  }, [targetPositions]);

  const handlePieceClick = (index, currentPosition) => {
    if (activePiece === null) {
      onPieceClick(index);
    } else {
      // Swap positions
      const newPositions = [...positions];
      const temp = newPositions[index];
      newPositions[index] = newPositions[activePiece];
      newPositions[activePiece] = temp;
      setPositions(newPositions);
      onPieceClick(null);
    }
  };

  return (
    <group>
      {positions.map((position, index) => {
        const originalIndex = targetPositions.findIndex(
          pos => pos[0] === position[0] && pos[1] === position[1] && pos[2] === position[2]
        );
        const isCorrect = position === targetPositions[index];
        
        return (
          <Cube
            key={index}
            index={index}
            position={position}
            textureUrl={imageUrl}
            textureOffsetX={(originalIndex % 3) * (1/3)}
            textureOffsetY={Math.floor(originalIndex / 3) * (1/3)}
            isActive={index === activePiece}
            isCorrect={isCorrect}
            currentPosition={position}
            targetPosition={targetPositions[index]}
            onClick={handlePieceClick}
          />
        );
      })}
              <Text
        position={[0, 2, 0]}
        color="white"
        fontSize={0.5}
        maxWidth={200}
        lineHeight={1}
        letterSpacing={0.02}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
      >
        Click pieces to swap and solve the puzzle!
      </Text>
    </group>
  );
}

// Main App Component
export default function PuzzleGame() {
  const [imageUrl, setImageUrl] = useState('');
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(90);
  const [activePiece, setActivePiece] = useState(null);
  const [correctPlacements, setCorrectPlacements] = useState(0);
  const [gameState, setGameState] = useState('idle'); // 'idle', 'playing', 'paused', 'complete'
  const [moves, setMoves] = useState(0);

  useEffect(() => {
    let timer;
    if (gameState === 'playing' && time > 0) {
      timer = setInterval(() => {
        setTime((prevTime) => {
          const newTime = prevTime - 1;
          if (newTime <= 0) {
            setGameState('complete');
            return 0;
          }
          return newTime;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState, time]);

  const handleImageUpload = (url) => {
    setImageUrl(url);
    setScore(0);
    setTime(90);
    setActivePiece(null);
    setCorrectPlacements(0);
    setMoves(0);
    setGameState('playing');
  };

  const handlePieceClick = (index) => {
    if (gameState !== 'playing') return;
    
    if (activePiece === null) {
      setActivePiece(index);
    } else {
      setMoves(prev => prev + 1);
      // Check if the swap resulted in correct placements
      checkCorrectPlacements();
      setActivePiece(null);
    }
  };

  const checkCorrectPlacements = () => {
    const correct = 0; // This would be calculated based on current positions
    setCorrectPlacements(correct);
    setScore(correct * 10);
    
    if (correct === 9) {
      setGameState('complete');
    }
  };

  const resetGame = () => {
    setImageUrl('');
    setScore(0);
    setTime(90);
    setActivePiece(null);
    setCorrectPlacements(0);
    setMoves(0);
    setGameState('idle');
  };

  return (
    <div className="w-full min-h-screen bg-gray-900 text-white p-4">
      {!imageUrl ? (
        <div className="w-full h-screen flex items-center justify-center">
          <ImageUpload onUpload={handleImageUpload} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-[600px] bg-black rounded-lg relative">
            <Suspense fallback={<LoadingScreen />}>
              <Canvas camera={{ position: [0, 0, 5] }}>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} />
                <Game3D
                  imageUrl={imageUrl}
                  activePiece={activePiece}
                  correctPlacements={correctPlacements}
                  onPieceClick={handlePieceClick}
                />
                <OrbitControls enablePan={false} />
              </Canvas>
            </Suspense>
            
            {gameState === 'complete' && (
              <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                <div className="text-center">
                  <h2 className="text-3xl font-bold mb-4">
                    {correctPlacements === 9 ? 'Puzzle Complete!' : 'Time\'s Up!'}
                  </h2>
                  <p className="text-xl mb-2">Final Score: {score}</p>
                  <p className="text-lg mb-4">Moves Made: {moves}</p>
                  <button 
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    onClick={resetGame}
                  >
                    Play Again
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            <GameStats
              score={score}
              timeRemaining={time}
              correctPlacements={correctPlacements}
              totalCubes={9}
              maxScore={90}
            />
            
            <div className="flex justify-between items-center">
              <div className="text-sm">
                Moves: {moves}
              </div>
              <button 
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                onClick={resetGame}
              >
                New Puzzle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}