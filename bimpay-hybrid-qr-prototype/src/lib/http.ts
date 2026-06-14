export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `The server returned an empty response (${response.status} ${response.statusText || "Unknown status"}).`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `The server returned a non-JSON response (${response.status} ${response.statusText || "Unknown status"}).`
    );
  }
}

export async function readJsonOrError<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      text.trim() ||
        `The request failed (${response.status} ${response.statusText || "Unknown status"}).`
    );
  }

  return readJsonResponse<T>(response);
}
