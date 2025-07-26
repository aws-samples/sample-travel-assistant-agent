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

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Icon from '@cloudscape-design/components/icon';
import Link from '@cloudscape-design/components/link';
import Spinner from '@cloudscape-design/components/spinner';
import ChatBubbleLogo from 'chat-bubble-avatar-logo.png';
import cn from 'classnames';
import DOMPurify from 'dompurify';
import React from 'react';
import { marked } from 'marked';

import { useSessions } from '../../services/useChatSessions';

import { ChatSettingsModal } from './ChatSettingsModal';
import styles from './index.module.scss';

const isValidPrompt = (prompt: string): boolean => {
  return prompt !== '';
};

const MARKDOWN_LINK_REGEXP = /\[(?:.+)\]\((?:https?:\/\/.+)\)/;
const MARKDOWN_LINK_REGEXP_WITH_CAPTURE = /\[(.+)\]\((https?:\/\/.+)\)/;

const getVideoContent = (video_content: string): React.ReactNode => {
  // Safely render video content as plain text to prevent XSS
  // Remove any HTML tags and render as plain text
  const textContent = DOMPurify.sanitize(video_content, { ALLOWED_TAGS: [] });
  return <p>{textContent}</p>;
}

const getFormattedContent = (content: string, wordsToBold: string[]): React.ReactNode => {
  // Enhanced validation to prevent ReDoS attacks
  const safeWordsToBold = wordsToBold.filter(word => {
    // Strict validation: only alphanumeric, spaces, hyphens, underscores, and basic punctuation
    // Reject words that are too long or contain potentially dangerous regex patterns
    if (!word || typeof word !== 'string' || word.length > 50) return false;
    
    // Check for safe characters only
    if (!/^[a-zA-Z0-9\s\-_.,!?]+$/.test(word)) return false;
    
    // Reject words with repetitive patterns that could cause ReDoS
    if (/(.)\1{10,}/.test(word)) return false;
    
    return true;
  }).slice(0, 20); // Limit to maximum 20 words to prevent performance issues

  // Limit content length to prevent performance issues
  const limitedContent = content.length > 10000 ? content.substring(0, 10000) + '...' : content;

  // Use a safer approach without dynamic regex construction
  // First, parse markdown to handle links and other formatting
  let processedContent = limitedContent;

  // Process words to bold using simple string replacement (safer than regex)
  if (safeWordsToBold.length > 0) {
    const wordsToBoldSet = new Set(safeWordsToBold.map(word => word.toLowerCase()));
    
    // Split content into words and process each one
    const words = processedContent.split(/(\s+)/); // Keep whitespace
    processedContent = words.map(word => {
      const cleanWord = word.toLowerCase().replace(/[^\w\s]/g, ''); // Remove punctuation for matching
      if (wordsToBoldSet.has(cleanWord) && cleanWord.length > 0) {
        return `**${word}**`;
      }
      return word;
    }).join('');
  }

  // Parse the processed content as markdown
  const parsedContent = marked.parse(processedContent, { async: false }) as string;
  
  // Sanitize the HTML to prevent XSS attacks
  const sanitizedContent = DOMPurify.sanitize(parsedContent);

  return (
    <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
  );
};

interface ChatboxProps {
  onSubmit: (prompt: string) => void;
}

const Chatbox = ({ onSubmit }: ChatboxProps): JSX.Element => {
  const [prompt, setPrompt] = React.useState('');

  return (
    <form
      className={styles.chatboxForm}
      onSubmit={(e) => {
        e.preventDefault();

        const cleanedPrompt = prompt.trim();

        if (!isValidPrompt(cleanedPrompt)) return;

        onSubmit(cleanedPrompt);
        setPrompt('');
      }}
    >
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.currentTarget.value)}
        className={styles.chatboxInput}
        placeholder='Your prompt'
      />

      <button type='submit' aria-label='Submit' className={styles.chatboxSubmitButton}>
        <Icon alt='' name='angle-right-double' variant='subtle' />
      </button>
    </form>
  );
};

const ChatWindow = (): JSX.Element => {
  const {
    chatSessions,
    useRag,
    strictPrompt,
    modelName,
    clearChatSessions,
    createChatSession,
    currentChatSessionId,
    removeChatSession,
    setCurrentChatSessionId,
    submitPrompt,
    setStrictPrompt,
    setUseRag,
    setModelName,
  } = useSessions();

  const currentChatSession = chatSessions[currentChatSessionId];
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [currentChatSession.conversation]);

  return (
    <Container disableContentPaddings>
      <div className={styles.chatWindow}>
        <div className={styles.recentActivityContainer}>
          <Box padding='l'>
            <div className={styles.recentActivityHeader}>
              <Box fontWeight='bold'>Recent Activity</Box>

              <div>
                <Button onClick={createChatSession} variant='icon' iconName='add-plus' />
                <Button onClick={clearChatSessions} variant='icon' iconName='remove' />
                <ChatSettingsModal
                  initialUseRag={useRag}
                  initialStrictPrompt={strictPrompt}
                  initialModelName={modelName}
                  onSubmit={(useRag, strictPrompt, modelName) => {
                    setUseRag(useRag);
                    setStrictPrompt(strictPrompt);
                    setModelName(modelName);
                  }}
                />
              </div>
            </div>

            {Object.values(chatSessions)
              .reverse()
              .map((chatSession) => (
                <div key={chatSession.id} className={styles.sessionNameContainer}>
                  <div>{chatSession.name ?? 'New session'}</div>

                  <div>
                    <Button onClick={() => removeChatSession(chatSession.id)} variant='icon' iconName='close' />
                    <Button
                      onClick={() => setCurrentChatSessionId(chatSession.id)}
                      variant='icon'
                      iconSvg={
                        <svg
                          className={cn(chatSession.id === currentChatSessionId && styles.selectSessionButtonSelected)}
                          xmlns='http://www.w3.org/2000/svg'
                          viewBox='0 0 16 16'
                          focusable='false'
                          aria-hidden='true'
                        >
                          <path d='m4 1 7 7-7 7'></path>
                        </svg>
                      }
                    />
                  </div>
                </div>
              ))}
          </Box>
        </div>

        <div className={styles.chatContainer}>
          <div className={styles.messagesContainer}>
            {currentChatSession.conversation.map((message) => {
              switch (message.type) {
                case 'Model':
                  return (
                    <div key={message.id} className={cn(styles.message, styles.modelMessage)}>
                      <div className={styles.modelMessageAvatar} >
                        <img
                          src={ChatBubbleLogo}
                          alt=''
                          className={styles.modelMessageAvatarImage}
                        />
                      </div>

                      <div className={styles.modelMessageBubbleContainer}>
                        <div className={cn(styles.messageBubble, styles.modelMessageBubble)}>
                          {message.state === 'Loading' ? (
                            <Spinner />
                          ) : message.state === 'Error' ? (
                            'Error!'
                          ) : (
                            <>
                              {getFormattedContent(message.content, message.wordsToBold)}
                              {message.content_title && (
                                getVideoContent(message.content_title)
                              )}
                              {message.content_link && (
                                <a href={message.content_link}>Source</a>
                              )}
                              {message.cartItemsList !== undefined && message.cartItemsList.length > 0 && (
                                <form target="_blank" method="GET" action='https://www.amazon.com/gp/aws/cart/add.html?'>
                                  {message.cartItemsList.map(
                                    ({ asin, qty }, i) => <><input type='hidden' name={`ASIN.${(i + 1).toFixed()}`} value={asin} /><input type='hidden' name={`Quantity.${(i + 1).toFixed()}`} value={qty.toFixed()} /></>)}
                                  <Button>Add to Amazon Cart</Button>
                                </form>
                              )}                                </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                case 'User':
                  return (
                    <div key={message.id} className={cn(styles.message, styles.userMessage)}>
                      <div className={cn(styles.messageBubble, styles.userMessageBubble)}>{message.content}</div>
                    </div>
                  );
              }
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.chatInputContainer}>
            <Chatbox onSubmit={submitPrompt} />
          </div>
        </div>
      </div>
    </Container>
  );
};

export const ChatPage = (): JSX.Element => {
  return (
    <ContentLayout>
      <ChatWindow />
    </ContentLayout>
  );
};
