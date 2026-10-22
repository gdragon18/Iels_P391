/**
 * Pure text processing utilities extracted from AI validators
 * Used for counting words and sanitizing student essay responses.
 */

const sanitizeWritingText = (value, maxLength = 50000) => String(value || '')
  .replace(/\u0000/g, '')
  .trim()
  .slice(0, maxLength);

const countWords = (text) => {
  if (!text || typeof text !== 'string') return 0;
  const sanitized = sanitizeWritingText(text);
  const words = sanitized.match(/[a-zA-Z0-9]+(?:'[a-zA-Z0-9]+)?/g);
  return words ? words.length : 0;
};

module.exports = {
  sanitizeWritingText,
  countWords,
};
