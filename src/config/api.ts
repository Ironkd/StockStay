// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

// Helper function to get auth token from session/cookie
const getAuthToken = (): string | null => {
  // In a real app, this might come from a cookie or session storage
  // For now, we'll use sessionStorage (not localStorage) for the token only
  return sessionStorage.getItem("auth_token");
};

// Base fetch wrapper with error handling
export const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = getAuthToken();
  const url = `${API_BASE_URL}${endpoint}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    const msg =
      networkErr instanceof Error
        ? networkErr.message
        : "Network error";
    throw new Error(
      `${msg}. Request URL: ${url}. Check VITE_API_BASE_URL and CORS (backend must allow this origin).`
    );
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "An error occurred" }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
};
