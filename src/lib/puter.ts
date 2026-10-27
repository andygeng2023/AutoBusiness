import puter from '@heyputer/puter.js';

export type PuterChatOptions = {
  model?: string;
  stream?: boolean;
};

export function isPuterAvailable(): boolean {
  return typeof window !== 'undefined';
}

/** Call only in response to an explicit user action; Puter may prompt for sign-in. */
export async function puterChat(prompt: string, options?: PuterChatOptions): Promise<unknown> {
  if (typeof window === 'undefined') {
    throw new Error('Puter AI is available only in a browser session.');
  }
  return puter.ai.chat(prompt, options ?? {});
}
