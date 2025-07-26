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

import { Authenticator } from '@aws-amplify/ui-react';
import AppLayout from '@cloudscape-design/components/app-layout';
import { QueryClient, QueryClientProvider } from 'react-query';

import { Navigation } from './component/Navigation';
import { ChatPage } from './pages/ChatPage';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

export const App = (): JSX.Element => {
  return (
    <Authenticator hideSignUp>
      {({ signOut }) => (
        <QueryClientProvider client={queryClient}>
          <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0 }}>
              <Navigation signOut={() => signOut?.()} />
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <AppLayout content={<ChatPage />} toolsHide navigationHide />
            </div>
          </div>
        </QueryClientProvider>
      )}
    </Authenticator>
  );
};
