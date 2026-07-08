import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for persisting state to localStorage
 * Handles SSR safety, JSON serialization, and error handling
 * @param key localStorage key
 * @param defaultValue default value if nothing in localStorage
 * @returns [value, setValue] tuple like useState
 */
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);
  const [isMounted, setIsMounted] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const item = window.localStorage.getItem(key);
        if (item !== null) {
          const parsed = JSON.parse(item);
          // Convert null back to undefined for optional fields
          setValue(parsed === null ? (undefined as T) : parsed);
        }
      }
    } catch (error) {
      // Log error but don't crash - fall back to default
      console.warn(`Failed to read localStorage key "${key}":`, error);
    }
    setIsMounted(true);
  }, [key]);

  // Persist to localStorage when value changes
  const setStoredValue = useCallback(
    (newValue: T) => {
      try {
        if (typeof window !== 'undefined') {
          // Handle undefined by storing null, then parse it back as undefined
          if (newValue === undefined) {
            window.localStorage.setItem(key, 'null');
          } else {
            window.localStorage.setItem(key, JSON.stringify(newValue));
          }
        }
      } catch (error) {
        // Handle quota exceeded or other localStorage errors
        console.warn(`Failed to write to localStorage key "${key}":`, error);
      }
      setValue(newValue);
    },
    [key]
  );

  // Don't return hydrated value until mount to avoid SSR hydration mismatch
  return isMounted ? [value, setStoredValue] : [defaultValue, setStoredValue];
}
