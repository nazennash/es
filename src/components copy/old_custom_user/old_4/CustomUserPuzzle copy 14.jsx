import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { Canvas, useLoader, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Cube Component with texture handling
function Cube({ position, textureUrl, textureOffsetX, textureOffsetY, isActive, onClick }) {
  const meshRef = useRef();
  const texture = useLoader(THREE.TextureLoader, textureUrl);
  
  useEffect(() => {
    if (texture) {
      texture.repeat.set(1/3, 1/3);
      texture.offset.set(textureOffsetX, textureOffsetY);
      texture.needsUpdate = true;
    }
  }, [texture, textureOffsetX, textureOffsetY]);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.scale.setScalar(isActive ? 1.1 : 1);
    }
  });

  return (
    <mesh ref={meshRef} position={position} onClick={onClick}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
}

// Loading screen component
function LoadingScreen() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
      <div className="text-xl">Loading...</div>
    </div>
  );
}

// Game Statistics Component
function GameStats({ score, timeRemaining, activeCubes, totalCubes, maxScore }) {
  const completionPercentage = (score / maxScore) * 100;
  const timePercentage = (timeRemaining / 90) * 100;
  const remainingCubes = totalCubes - activeCubes.length;

  const stats = useMemo(() => [{
    name: 'Progress',
    completed: activeCubes.length,
    remaining: remainingCubes
  }], [activeCubes.length, remainingCubes]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score Card */}
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-gray-700">Score</h3>
            <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
          <div className="text-2xl font-bold text-gray-900">{score}</div>
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
            <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatTime(timeRemaining)}</div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 rounded-full h-2 transition-all duration-300" 
              style={{ width: `${timePercentage}%` }}
            />
          </div>
        </div>

        {/* Completion Card */}
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-gray-700">Completion</h3>
            <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div className="text-2xl font-bold text-gray-900">{Math.round(completionPercentage)}%</div>
          <p className="text-xs text-gray-500 mt-2">
            {activeCubes.length} of {totalCubes} cubes activated
          </p>
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
              <Bar dataKey="completed" fill="#4CAF50" name="Completed" />
              <Bar dataKey="remaining" fill="#FF9800" name="Remaining" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// Image Upload Component
function ImageUpload({ onUpload }) {
  const [dragging, setDragging] = useState(false);
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
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      // Create an image to check dimensions
      const img = new Image();
      img.onload = () => {
        if (img.width < 300 || img.height < 300) {
          setError('Image must be at least 300x300 pixels');
          return;
        }
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
    <div className="text-center">
      <div
        className={`w-64 h-64 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors ${
          dragging ? 'border-blue-500 bg-blue-100 bg-opacity-10' : 'border-gray-300'
        }`}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <svg className="w-12 h-12 text-gray-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p className="mb-4 text-center text-gray-300">
          Drag and drop an image here, or click to select
        </p>
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 relative transition-colors"
        >
          Upload Image
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

// 3D Game Component
function Game3D({ imageUrl, activeCubes, onCubeClick }) {
  const cubePositions = [
    [-1, 1, 0], [0, 1, 0], [1, 1, 0],
    [-1, 0, 0], [0, 0, 0], [1, 0, 0],
    [-1, -1, 0], [0, -1, 0], [1, -1, 0],
  ];

  return (
    <group>
      {cubePositions.map((position, index) => (
        <Cube
          key={index}
          position={position}
          textureUrl={imageUrl}
          textureOffsetX={(index % 3) * (1/3)}
          textureOffsetY={Math.floor(index / 3) * (1/3)}
          isActive={activeCubes.includes(index)}
          onClick={(e) => {
            e.stopPropagation();
            onCubeClick(index);
          }}
        />
      ))}
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
        Click cubes to solve the puzzle!
      </Text>
    </group>
  );
}

// Main App Component
export default function PuzzleGame() {
  const [imageUrl, setImageUrl] = useState('');
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(90);
  const [activeCubes, setActiveCubes] = useState([]);
  const [gameState, setGameState] = useState('idle'); // 'idle', 'playing', 'paused', 'complete'

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
    setActiveCubes([]);
    setGameState('playing');
  };

  const handleCubeClick = (index) => {
    if (gameState !== 'playing') return;
    
    setActiveCubes((prev) => {
      const newActiveCubes = prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index];
      
      const newScore = newActiveCubes.length * 10;
      setScore(newScore);
      
      if (newActiveCubes.length === 9) {
        setGameState('complete');
      }
      
      return newActiveCubes;
    });
  };

  const resetGame = () => {
    setImageUrl('');
    setScore(0);
    setTime(90);
    setActiveCubes([]);
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
                  activeCubes={activeCubes}
                  onCubeClick={handleCubeClick}
                />
                <OrbitControls enablePan={false} />
              </Canvas>
            </Suspense>
            
            {gameState === 'complete' && (
              <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                <div className="text-center">
                  <h2 className="text-3xl font-bold mb-4">
                    {activeCubes.length === 9 ? 'Puzzle Complete!' : 'Time\'s Up!'}
                  </h2>
                  <p className="text-xl mb-4">Final Score: {score}</p>
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
              activeCubes={activeCubes}
              totalCubes={9}
              maxScore={90}
            />
            
            <div className="flex justify-end">
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