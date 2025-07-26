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
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Toggle from '@cloudscape-design/components/toggle';
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import React from 'react';

interface ChatSettingsModalProps {
  initialUseRag: boolean;
  initialStrictPrompt: boolean;
  initialModelName: string;
  onSubmit: (useRag: boolean, strictPrompt: boolean, modelName: string) => void;
}

export const ChatSettingsModal = ({
  initialStrictPrompt,
  initialUseRag,
  initialModelName,
  onSubmit,
}: ChatSettingsModalProps): JSX.Element => {
  const [isVisible, setIsVisible] = React.useState(false);
  const [useRag, setUseRag] = React.useState(initialUseRag);
  const [strictPrompt, setStrictPrompt] = React.useState(initialStrictPrompt);
  const [modelName, setModelName] = React.useState(initialModelName);
  

  return (
    <>
      <Button variant='icon' iconName='settings' iconAlt='settings' onClick={() => setIsVisible(true)} />

      <Modal
        onDismiss={() => setIsVisible(false)}
        visible={isVisible}
        closeAriaLabel='Close modal'
        footer={
          <Box float='right'>
            <SpaceBetween direction='horizontal' size='xs'>
              <Button variant='link' onClick={() => setIsVisible(false)}>
                Cancel
              </Button>
              <Button
                variant='primary'
                onClick={() => {
                  onSubmit(useRag, strictPrompt, modelName);
                  setIsVisible(false);
                }}
              >
                Ok
              </Button>
            </SpaceBetween>
          </Box>
        }
        header='Modal title'
      >
        <Toggle onChange={({ detail }) => setUseRag(detail.checked)} checked={useRag}>
          Use RAG
        </Toggle>

        <Toggle onChange={({ detail }) => setStrictPrompt(detail.checked)} checked={strictPrompt}>
          Strict prompt
        </Toggle>

        <ButtonDropdown
          items={[
            { text: "Nova", id: "Nova", disabled: false },
          ]}
          onItemClick={({ detail }) => setModelName(detail.id)}
        >
          Model: {modelName}
        </ButtonDropdown>

      </Modal>
    </>
  );
};
