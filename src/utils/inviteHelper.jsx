export const generateInviteLink = (puzzleId) => {
  const baseUrl = window.location.origin;
  return `${baseUrl}/puzzle/multiplayer/${puzzleId}`;
};
