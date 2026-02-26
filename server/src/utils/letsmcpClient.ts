/**
 * LetsMCP Client - HTTP client for generating AI-powered content via LetsMCP server
 */

const LETSMCP_URL = process.env.LETSMCP_URL || 'http://localhost:3002';

interface GenerateRequest {
  prompt: string;
  provider?: 'groq' | 'claude' | 'gemini';
}

interface GenerateResponse {
  success: boolean;
  text: string;
  provider: string;
  error?: string;
}

interface StatusResponse {
  status: string;
  version: string;
  providers: string[];
  hasAI: boolean;
}

// Cache for LetsMCP availability status
let letsmcpAvailable: boolean | null = null;
let lastStatusCheck = 0;
const STATUS_CHECK_INTERVAL = 60000; // Check availability every 60 seconds

/**
 * Check if LetsMCP server is available
 */
export async function checkLetsMCPStatus(): Promise<boolean> {
  const now = Date.now();

  // Use cached result if recent
  if (letsmcpAvailable !== null && (now - lastStatusCheck) < STATUS_CHECK_INTERVAL) {
    return letsmcpAvailable;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(`${LETSMCP_URL}/api/status`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json() as StatusResponse;
      letsmcpAvailable = data.hasAI;
      lastStatusCheck = now;
      return letsmcpAvailable;
    }

    letsmcpAvailable = false;
    lastStatusCheck = now;
    return false;
  } catch (error) {
    letsmcpAvailable = false;
    lastStatusCheck = now;
    return false;
  }
}

/**
 * Generate text using LetsMCP AI service
 * @param prompt - The prompt to send to the AI
 * @param provider - Optional AI provider (defaults to server default, usually groq)
 * @returns Generated text or null if unavailable
 */
export async function generateText(prompt: string, provider?: 'groq' | 'claude' | 'gemini'): Promise<string | null> {
  // Check if LetsMCP is available first
  const available = await checkLetsMCPStatus();
  if (!available) {
    console.log('[LetsMCP] Service unavailable, skipping generation');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout for generation

    const request: GenerateRequest = { prompt };
    if (provider) {
      request.provider = provider;
    }

    const response = await fetch(`${LETSMCP_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[LetsMCP] HTTP error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as GenerateResponse;

    if (!data.success) {
      console.error(`[LetsMCP] Generation failed: ${data.error}`);
      return null;
    }

    return data.text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[LetsMCP] Request timed out');
    } else {
      console.error('[LetsMCP] Generation error:', error);
    }
    return null;
  }
}

/**
 * Generate alien dialogue with automatic fallback
 * @param prompt - The dialogue prompt
 * @param fallbackMessage - Message to return if AI generation fails
 * @returns Generated dialogue or fallback
 */
export async function generateAlienDialogueWithFallback(
  prompt: string,
  fallbackMessage: string
): Promise<string> {
  const generated = await generateText(prompt);
  return generated || fallbackMessage;
}
