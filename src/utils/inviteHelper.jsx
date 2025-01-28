// utils/inviteHelper.js

/**
 * Generates an invite link for a puzzle session
 * @param {string} puzzleId - The unique identifier for the puzzle
 * @returns {string} The complete invite link
 */
export const generateInviteLink = (puzzleId) => {
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
  try {
    const url = new URL(inviteLink);
    const pathParts = url.pathname.split('/');
    const inviteCode = pathParts[pathParts.length - 1];
    return decodeURIComponent(inviteCode);
  } catch (err) {
    console.error('Invalid invite link:', err);
    return null;
  }
};

/**
 * Validates if a given invite link is properly formatted
 * @param {string} inviteLink - The invite link to validate
 * @returns {boolean} Whether the link is valid
 */
export const isValidInviteLink = (inviteLink) => {
  try {
    const url = new URL(inviteLink);
    return url.pathname.startsWith('/join/') && extractPuzzleId(inviteLink) !== null;
  } catch {
    return false;
  }
};