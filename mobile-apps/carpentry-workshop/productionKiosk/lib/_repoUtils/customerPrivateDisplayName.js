const EMAIL_DISPLAY_NAMES = {
  'hassanawad18@gmail.com': 'Hassan Awad',
  'hassanboussi2000@gmail.com': 'Hassan El Boussi',
  'alielboussi00@gmail.com': 'Ali El Boussi',
};

export function displayNameForEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (EMAIL_DISPLAY_NAMES[normalized]) return EMAIL_DISPLAY_NAMES[normalized];
  if (normalized) return normalized.split('@')[0];
  return 'User';
}
