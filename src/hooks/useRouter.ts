import { useState, useEffect, useMemo, useCallback } from 'react';

export function cleanRoomId(input?: string | null): string | undefined {
  if (!input) return undefined;
  let str = input.trim();
  if (str.includes('/room/')) {
    str = str.split('/room/')[1]?.split('/')[0]?.split('?')[0]?.split('#')[0] || str;
  } else if (str.startsWith('/')) {
    str = str.replace(/^\/+/, '');
  }
  const clean = str.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  return clean.length > 0 ? clean : undefined;
}

function extractRoomIdFromLocation(): string | undefined {
  if (typeof window === 'undefined') return undefined;

  const path = window.location.pathname;
  if (path.startsWith('/room/')) {
    const raw = path.split('/room/')[1]?.split('/')[0]?.split('?')[0]?.split('#')[0]?.trim();
    if (raw) return cleanRoomId(decodeURIComponent(raw));
  }

  // Also check query params like ?room=ABC123 or ?roomId=ABC123
  const searchParams = new URLSearchParams(window.location.search);
  const queryRoom = searchParams.get('room') || searchParams.get('roomId') || searchParams.get('code');
  if (queryRoom && queryRoom.trim()) {
    return cleanRoomId(queryRoom);
  }

  // Also check hash like #/room/ABC123 or #ABC123
  const hash = window.location.hash;
  if (hash) {
    if (hash.startsWith('#/room/')) {
      const raw = hash.split('#/room/')[1]?.split('/')[0]?.split('?')[0]?.trim();
      if (raw) return cleanRoomId(decodeURIComponent(raw));
    } else if (hash.startsWith('#') && hash.length > 1 && !hash.includes('/')) {
      const raw = hash.substring(1).trim();
      if (raw && !['features', 'active-rooms', 'about'].includes(raw)) {
        return cleanRoomId(raw);
      }
    }
  }

  return undefined;
}

export function useRouter() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  const [extractedId, setExtractedId] = useState<string | undefined>(() => extractRoomIdFromLocation());

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
      setExtractedId(extractRoomIdFromLocation());
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const navigate = useCallback((path: string) => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
        setCurrentPath(path);
        setExtractedId(extractRoomIdFromLocation());
      }
    }
  }, []);

  const roomId = useMemo(() => {
    return extractedId;
  }, [extractedId]);

  return {
    currentPath,
    navigate,
    params: { roomId },
    roomId,
  };
}
