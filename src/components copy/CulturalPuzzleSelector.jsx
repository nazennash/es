// src/components/CulturalPuzzleSelector.jsx
import React from 'react';
import { culturalPuzzles } from '../data/culturalPuzzles';

const CulturalPuzzleSelector = ({ onSelect }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
      {culturalPuzzles.map(puzzle => (
        <div
          key={puzzle.id}
          className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
        >
          <img
            src={puzzle.thumbnail}
            alt={puzzle.name}
            className="w-full h-48 object-cover"
          />
          <div className="p-4">
            <h3 className="text-xl font-bold mb-2">{puzzle.name}</h3>
            <p className="text-gray-600 mb-4">{puzzle.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {puzzle.pieces} pieces • {puzzle.difficulty}
              </span>
              <button
                onClick={() => onSelect(puzzle)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Start Puzzle
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CulturalPuzzleSelector;