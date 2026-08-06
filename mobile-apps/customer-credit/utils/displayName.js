const EMAIL_DISPLAY_NAMES = {
  'hassanawad18@gmail.com': 'Hassan Awad',
  'hassanboussi2000@gmail.com': 'Hassan El Boussi',
  'alielboussi00@gmail.com': 'Ali El Boussi',
};

export function displayNameForUser(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (EMAIL_DISPLAY_NAMES[email]) return EMAIL_DISPLAY_NAMES[email];
  if (user?.displayName) return user.displayName;
  if (email) return email.split('@')[0];
  return 'User';
}
