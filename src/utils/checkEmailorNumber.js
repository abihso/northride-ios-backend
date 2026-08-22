function checkEmailOrPhone(input) {
  if (typeof input !== 'string') return 'Neither';

  // Trim whitespace
  const trimmed = input.trim();

  // Standard email regex pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Flexible phone number regex pattern (supports optional +, country codes, dashes, spaces, and brackets)
  const phoneRegex = /^(\+?\d{1,4}[\s.-]?)?(\(?\d{1,4}\)?[\s.-]?)?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}$/;

  if (emailRegex.test(trimmed)) {
    return 'Email';
  } else if (phoneRegex.test(trimmed) && trimmed.replace(/\D/g, '').length >= 7) {
    return 'Phone';
  }

  return 'Neither';
}

export default checkEmailOrPhone;