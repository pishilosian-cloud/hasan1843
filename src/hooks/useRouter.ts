import { useState, useEffect, useMemo, useCallback } from 'react';

export function useRouter() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: string) => {
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
    }
  }, []);

  const roomId = useMemo(() => {
    if (currentPath.startsWith('/room/')) {
      const parts = currentPath.split('/room/');
      const raw = parts[1]?.split('/')[0]?.trim();
      return raw ? decodeURIComponent(raw) : undefined;
    }
    return undefined;
  }, [currentPath]);

  return {
    currentPath,
    navigate,
    params: { roomId },
    roomId,
  };
}
