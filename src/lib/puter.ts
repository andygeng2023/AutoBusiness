/**
 * Puter adapter boundary for the next stage's AI employee runtime.
 * Puter is deliberately not called during Stage 1: creating a workspace
 * should not trigger model usage or incur AI costs.
 */
export type PuterChatOptions = { model?: string; stream?: boolean };

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (prompt: string, options?: PuterChatOptions) => Promise<unknown>;
      };
    };
  }
}

export function isPuterAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.puter?.ai?.chat);
}

export async function puterChat(prompt: string, options?: PuterChatOptions): Promise<unknown> {
  if (!isPuterAvailable()) {
    throw new Error('Puter.js is not available yet. AI employee execution will be enabled in a later stage.');
  }
  return window.puter!.ai.chat(prompt, options);
}