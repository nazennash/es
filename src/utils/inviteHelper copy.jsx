/**
 * Utility functions for managing puzzle invite links
 */

/**
 * Generates an invite link for a puzzle session
 * @param {string} puzzleId - The unique identifier for the puzzle
 * @returns {string} The complete invite link
 * @throws {Error} If puzzleId is invalid or missing
 */
export const generateInviteLink = (puzzleId) => {
  if (!puzzleId || typeof puzzleId !== 'string') {
    throw new Error('Invalid puzzle ID provided');
  }

  const baseUrl = window.location.origin;
  const inviteCode = encodeURIComponent(puzzleId);
  return `${baseUrl}/join/${inviteCode}`;
};

/**
 * Extracts the puzzle ID from an invite link
 * @param {string} inviteLink - The full invite URL
 * @returns {string|null} The puzzle ID or null if invalid
 */
export const extractPuzzleId = (inviteLink) => {
  if (!inviteLink || typeof inviteLink !== 'string') {
    console.error('Invalid invite link provided');
    return null;
  }

  try {
    const url = new URL(inviteLink);
    const pathParts = url.pathname.split('/');
    if (pathParts.length < 2) {
      return null;
    }
    const inviteCode = pathParts[pathParts.length - 1];
    return decodeURIComponent(inviteCode);
  } catch (err) {
    console.error('Error parsing invite link:', err);
    return null;
  }
};

/**
 * Validates if a given invite link is properly formatted
 * @param {string} inviteLink - The invite link to validate
 * @returns {boolean} Whether the link is valid
 */
export const isValidInviteLink = (inviteLink) => {
  if (!inviteLink || typeof inviteLink !== 'string') {
    return false;
  }

  try {
    const url = new URL(inviteLink);
    const puzzleId = extractPuzzleId(inviteLink);
    return url.pathname.startsWith('/join/') && 
           puzzleId !== null && 
           puzzleId.length > 0;
  } catch {
    return false;
  }
};

/**
 * Formats a puzzle ID for display
 * @param {string} puzzleId - The puzzle ID to format
 * @returns {string} The formatted puzzle ID
 */
export const formatPuzzleId = (puzzleId) => {
  if (!puzzleId || typeof puzzleId !== 'string') {
    return '';
  }
  return puzzleId.slice(0, 8) + '...';
};