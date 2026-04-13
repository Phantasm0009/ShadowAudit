"use client";

import { useEffect, useState } from "react";

export function useNetworkStatus() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [didReceiveOfflineEvent, setDidReceiveOfflineEvent] = useState(false);

  useEffect(() => {
    setHasMounted(true);

    const markOnline = () => {
      setIsOnline(true);
      setDidReceiveOfflineEvent(false);
    };
    const markOffline = () => {
      setIsOnline(false);
      setDidReceiveOfflineEvent(true);
    };

    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);

    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  return { isOnline, hasMounted, didReceiveOfflineEvent };
}
