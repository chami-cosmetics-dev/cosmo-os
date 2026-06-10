import { useCallback, useEffect } from "react";
import { useFocusEffect } from "expo-router";

export function useRefreshOnFocus(refresh: () => void | Promise<void>, deps: unknown[] = []) {
  const stableRefresh = useCallback(() => {
    void refresh();
  }, deps);

  useEffect(() => {
    void refresh();
  }, [stableRefresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [stableRefresh])
  );
}
