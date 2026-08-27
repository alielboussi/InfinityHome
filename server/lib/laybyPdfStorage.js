export async function resolveStoredLaybyPdfUrl(laybyId, customerId, filename = 'layby-statement.pdf') {
  const candidates = [
    `laybys/${String(laybyId || '').trim()}.pdf`,
    `laybys/${String(customerId || '').trim()}.pdf`,
  ].filter((path) => path !== 'laybys/.pdf');

  try {
    const { getStorageClient } = await import('./firebaseStorage.js');
    const storage = getStorageClient();
    for (const bucket of ['laybypdfs', 'labels']) {
      for (const objectPath of candidates) {
        try {
          const { data, error } = await storage
            .from(bucket)
            .createSignedUrl(objectPath, 3600, { download: filename });
          if (!error && data?.signedUrl) return data.signedUrl;
        } catch {
          // try next path/bucket
        }
      }
    }
  } catch {
    // storage not configured
  }
  return '';
}
