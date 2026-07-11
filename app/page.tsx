'use client';

import { useEffect } from 'react';
import { EditorShell } from '@/components/editor/EditorShell';

export default function Home() {
  // Warn on unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      // Check store for changes
      const store = (window as any).__mangaStudioHasChanges?.();
      if (store) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return <EditorShell />;
}
