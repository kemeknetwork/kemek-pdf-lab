/**
 * Save a PDF to disk. Uses the File System Access API on Chromium for a native
 * save dialog; falls back to a blob download link on Firefox/Safari.
 */
export async function savePdf(
  bytes: Uint8Array,
  suggestedName: string
): Promise<void> {
  // File System Access API — Chromium only (native save-in-place dialog)
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'PDF Document',
            accept: { 'application/pdf': ['.pdf'] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return;
    } catch (e: any) {
      // User cancelled the picker
      if (e.name === 'AbortError') return;
      // Fall through to download fallback
    }
  }

  // Fallback: blob download
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
