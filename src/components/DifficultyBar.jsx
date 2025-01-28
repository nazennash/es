import React from 'react';

const difficulties = [
  { id: 'easy', label: 'Easy', grid: { x: 3, y: 2 }, color: 'bg-green-500' },
  { id: 'medium', label: 'Medium', grid: { x: 4, y: 3 }, color: 'bg-blue-500' },
  { id: 'hard', label: 'Hard', grid: { x: 5, y: 4 }, color: 'bg-orange-500' },
  { id: 'expert', label: 'Expert', grid: { x: 6, y: 5 }, color: 'bg-red-500' }
];

const DifficultyBar = ({ selectedDifficulty, onSelect, className }) => {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 bg-gray-700/50 rounded-lg ${className}`}>
      <span className="text-gray-400 text-sm">Difficulty:</span>
      <div className="flex gap-1">
        {difficulties.map((diff) => (
          <button
            key={diff.id}
            onClick={() => onSelect(diff)}
            className={`px-3 py-1 rounded text-sm font-medium transition-all
              ${selectedDifficulty?.id === diff.id
                ? `${diff.color} text-white scale-105`
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
          >
            {diff.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default DifficultyBar;
export { difficulties };
