/*
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

# Permission is hereby granted, free of charge, to any person obtaining a copy of
# this software and associated documentation files (the "Software"), to deal in
# the Software without restriction, including without limitation the rights to
# use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
# the Software, and to permit persons to whom the Software is furnished to do so.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
# FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
# COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
# IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
# CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. 
*/

import React from 'react';
import { useMutation } from 'react-query';
import { useLocalStorage } from 'usehooks-ts';

import type { ChatSession } from '../../domain/ChatSession';
import { getRequestHeaders } from '../getRequestHeaders';
import { getRequestURL } from '../getRequestURL';

// import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
// import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";

interface GetPromptResponseInput {
  prompt: string;
  useRag: boolean;
  strictPrompt: boolean;
  modelName: string;
}

export interface GetPromptResponseOutput {
  promptResponse: string;
  promptTitle: string;
  promptS3URI: string;
  wordsToBold: string[];
  cartItemsList: {asin: string, qty: number}[];

}

const getPromptResponse = async ({
  prompt,
  useRag,
  strictPrompt,
  modelName,
}: GetPromptResponseInput): Promise<GetPromptResponseOutput> => {
  
  const body = JSON.stringify({
    prompt,
    useRag,
    strictPrompt,
    modelName,
  });

  const requestHeaders = await getRequestHeaders();

  const response = await fetch(getRequestURL('/prompt'), {
    method: 'POST',
    headers: { ...requestHeaders, 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) throw new Error('Prompt request failed');

  const data = await response.json();
  return data;
};

interface UseChatSessionOutput {
  chatSessions: Record<string, ChatSession>;
  currentChatSessionId: string;
  useRag: boolean;
  strictPrompt: boolean;
  modelName: string;
  submitPrompt: (prompt: string) => void;
  setCurrentChatSessionId: (id: string) => void;
  removeChatSession: (id: string) => void;
  clearChatSessions: () => void;
  createChatSession: () => void;
  setUseRag: (useRag: boolean) => void;
  setStrictPrompt: (strictPrompt: boolean) => void;
  setModelName: (modelName: string) => void;
}

const initialSessionId = crypto.randomUUID();

const initialSessionMap: Record<string, ChatSession> = {
  [initialSessionId]: {
    conversation: [],
    id: initialSessionId,
  },
};

const getSessionNameFromPrompt = (prompt: string): string =>
  prompt.length <= 20 ? prompt : `${prompt.slice(0, 17)}...`;

export const useSessions = (): UseChatSessionOutput => {
  const [chatSessions, setChatSessions] = useLocalStorage('CHAT_SESSIONS', initialSessionMap);
  const [useRag, setUseRag] = useLocalStorage('USE_RAG', true);
  const [strictPrompt, setStrictPrompt] = useLocalStorage('STRICT_PROMPT', false);
  const [modelName, setModelName] = useLocalStorage('MODEL_NAME', 'Claude');

  const initialCurrentChatSessionIdRef = React.useRef<string>('');
  if (!initialCurrentChatSessionIdRef.current) initialCurrentChatSessionIdRef.current = Object.keys(chatSessions)[0];

  const [currentChatSessionId, setCurrentChatSessionId] = useLocalStorage<string>(
    'CURRENT_CHAT_SESSION_ID',
    initialCurrentChatSessionIdRef.current,
  );

  const { mutate } = useMutation(getPromptResponse, {
    onMutate: () => {
      setChatSessions((prevChatSessions) => {
        const chatSession = prevChatSessions[currentChatSessionId];

        return {
          ...prevChatSessions,
          [currentChatSessionId]: {
            ...chatSession,
            conversation: [...chatSession.conversation, { id: crypto.randomUUID(), type: 'Model', state: 'Loading' }],
          },
        };
      });
    },
    onError: () => {
      setChatSessions((prevChatSessions) => {
        const chatSession = prevChatSessions[currentChatSessionId];

        return {
          ...prevChatSessions,
          [currentChatSessionId]: {
            ...chatSession,
            conversation: [
              ...chatSession.conversation.slice(0, chatSession.conversation.length - 1),
              { ...chatSession.conversation[chatSession.conversation.length - 1], type: 'Model', state: 'Error' },
            ],
          },
        };
      });
    },
    onSuccess: ({ wordsToBold, promptResponse, promptTitle, promptS3URI, cartItemsList}) => {
      setChatSessions((prevChatSessions) => {
        const chatSession = prevChatSessions[currentChatSessionId];

        return {
          ...prevChatSessions,
          [currentChatSessionId]: {
            ...chatSession,
            conversation: [
              ...chatSession.conversation.slice(0, chatSession.conversation.length - 1),
              {
                ...chatSession.conversation[chatSession.conversation.length - 1],
                type: 'Model',
                state: 'Success',
                content: promptResponse,
                content_title: promptTitle,
                content_link: promptS3URI,
                wordsToBold,
                cartItemsList
              },
            ],
          },
        };
      });
    },
  });

  const submitPrompt = (prompt: string): void => {
    setChatSessions((prevChatSessions) => {
      const chatSession = prevChatSessions[currentChatSessionId];

      return {
        ...prevChatSessions,
        [currentChatSessionId]: {
          ...chatSession,
          name: chatSession.name ?? getSessionNameFromPrompt(prompt),
          conversation: [...chatSession.conversation, { id: crypto.randomUUID(), type: 'User', content: prompt }],
        },
      };
    });

    mutate({ prompt, strictPrompt, useRag, modelName });
  };

  const createChatSession = (): void => {
    const newSessionId = crypto.randomUUID();

    setChatSessions((prevChatSessions) => ({
      ...prevChatSessions,
      [newSessionId]: { id: newSessionId, conversation: [] },
    }));

    setCurrentChatSessionId(newSessionId);
  };

  const clearChatSessions = (): void => {
    const newSessionId = crypto.randomUUID();

    setChatSessions({ [newSessionId]: { id: newSessionId, conversation: [] } });
    setCurrentChatSessionId(newSessionId);
  };

  const removeChatSession = (id: string): void => {
    if (id in chatSessions && Object.keys(chatSessions).length === 1) {
      clearChatSessions();
      return;
    }

    setChatSessions((prevChatSessions) =>
      Object.fromEntries(Object.entries(prevChatSessions).filter(([entryId]) => entryId !== id)),
    );

    let newCurrentChatSessionId = '-1';
    for (const key of Object.keys(chatSessions)) {
      if (key !== id) newCurrentChatSessionId = key;
    }

    setCurrentChatSessionId(newCurrentChatSessionId);
  };

  return {
    chatSessions,
    currentChatSessionId,
    useRag,
    strictPrompt,
    modelName,
    submitPrompt,
    clearChatSessions,
    createChatSession,
    removeChatSession,
    setCurrentChatSessionId,
    setUseRag,
    setStrictPrompt,
    setModelName,
  };
};
