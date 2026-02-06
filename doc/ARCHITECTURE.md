# Chat Client Architecture

## Overview

This document describes the architecture of the Chat Client Vue 3 application, including component hierarchy, data flow, and service interactions.

## Component Hierarchy

```mermaid
graph TD
    App[App.vue]
    App --> CE[ChatContainer.ce.vue]
    CE --> CC[ChatContainer.vue]

    CC --> H[Header.vue]
    CC --> HM[HeaderMenu.vue]
    CC --> M[Menu.vue]
    CC --> Ch[Chat.vue]
    CC --> MI[MenuInfo.vue]
    CC --> NCM[NewContactModal.vue]
    CC --> NGM[NewGroupModal.vue]
    CC --> MM[MobileModal.vue]

    Ch --> ML[MessageList.vue]
    ML --> MB[MessageBubble.vue]
    ML --> MSI[MessageStatusIcons.vue]

    M --> CL[ContactList.vue]
    M --> UP[UserProfile.vue]

    NGM --> CS[ContactSelector.vue]
    NGM --> CLIM[ContactListInModal.vue]

    MI --> IM[InformationMenu.vue]
```

## Data Flow Architecture

```mermaid
sequenceDiagram
    participant U as User
    participant UI as ChatContainer.ce.vue
    participant Auth as useAuth
    participant SDK as ChatSDK
    participant WS as WebSocket
    participant API as REST API
    participant S3 as S3 Service

    Note over UI: Initialization Sequence
    UI->>Auth: useAuth(token)
    Auth->>API: POST /chat/token
    API-->>Auth: {token, user}
    Auth-->>UI: authData

    UI->>SDK: initializeChat(options)
    SDK->>WS: Connect WebSocket
    WS-->>SDK: Connected

    UI->>SDK: fetchAllUsers()
    UI->>SDK: fetchAllTopics()
    UI->>SDK: markSDKReady()
    UI->>UI: startPolling()

    Note over U,S3: Message Flow - User Sends Message
    U->>UI: Type message + click send
    UI->>SDK: sendMessageChat({text, file})

    alt Has File Attachment
        SDK->>S3: uploadFile(file)
        S3-->>SDK: fileUrl
    end

    SDK->>API: POST /messages
    API-->>SDK: message
    SDK->>WS: Emit newMessage
    WS-->>UI: newMessage event
    UI->>UI: appendMessageToLocal()
```

## Service Layer Architecture

```mermaid
graph TB
    subgraph Components
        CC[ChatContainer]
        M[Menu]
        Ch[Chat]
        ML[MessageList]
    end

    subgraph Composables
        UA[useAuth]
        UU[useUsers]
        UT[useTopics]
        UMP[useUnreadMessagePolling]
        URS[useResizeState]
        UM[useMastra]
    end

    subgraph Services
        UC[useChat]
        UG[useGroup]
        UCF[useConfig]
    end

    subgraph External
        SDK[ChatSDK]
        WS[WebSocket]
        API[REST API]
        S3[S3 Service]
        AI[Mastra AI]
    end

    CC --> UA
    CC --> UU
    CC --> UT
    CC --> UMP

    M --> UC
    M --> UCO
    M --> URS

    Ch --> UC
    Ch --> UM

    ML --> UC

    UA --> API
    UU --> SDK
    UT --> SDK
    UC --> SDK
    UC --> S3
    UCO --> SDK
    UG --> SDK
    UM --> AI

    SDK --> WS
    SDK --> API
```

## State Management Pattern

```mermaid
graph LR
    subgraph "Reactive State (Service-Level)"
        MS[messagesStore<br/>shallowRef]
        CS[conversionStore<br/>shallowRef]
        GS[groups<br/>ref]
        US[users<br/>shallowRef]
        AU[authedUser<br/>ref]
    end

    subgraph "Component State"
        RS[reactive state]
        LS[local refs]
    end

    subgraph "Subscriptions"
        CB[Callbacks]
    end

    MS --> CB
    CB --> ML[MessageList]
    CS --> M[Menu]
    GS --> M
    US --> CC[ChatContainer]
    AU --> CC

    RS --> CC
    LS --> Components[All Components]
```

## WebSocket Event Flow

```mermaid
sequenceDiagram
    participant Server as Chat Server
    participant WS as WebSocket
    participant SDK as ChatSDK
    participant Store as Message Store
    participant UI as Components

    Server->>WS: newMessage
    WS->>SDK: onNewMessage handler
    SDK->>Store: appendMessageToLocal()
    SDK->>SDK: notifyMessageChange(topicId)
    SDK->>UI: callback(topicId)
    UI->>UI: Re-render messages

    Server->>WS: messagesRead
    WS->>SDK: onMessagesRead handler
    SDK->>Store: Update message status
    SDK->>UI: callback(topicId)
    UI->>UI: Update read receipts
```

## AI Assistant Integration

```mermaid
sequenceDiagram
    participant U as User
    participant ML as MessageList
    participant M as useMastra
    participant AI as Mastra API
    participant DB as IndexedDB

    U->>ML: Send AI message
    ML->>M: sendMessage(input)

    M->>DB: getOrCreateChatHistory()
    DB-->>M: history

    M->>AI: POST /api/chat (stream)

    loop Streaming Response
        AI-->>M: text-delta chunk
        M->>ML: Update message content
    end

    AI-->>M: finish event
    M->>DB: saveMessages()
    M->>ML: onFinish callback
```

## Module Dependencies

```mermaid
graph TD
    subgraph Entry
        App[App.vue]
        CE[ChatContainer.ce.vue]
    end

    subgraph Core
        CC[ChatContainer.vue]
        UC[useChat.ts]
        SDK[useChatSDK/index.ts]
    end

    subgraph Auth
        UA[useAuth.ts]
        UCF[useConfig.ts]
    end

    subgraph Data
        UG[useGroup.ts]
        UU[useUsers.ts]
        UT[useTopics.ts]
    end

    subgraph AI
        UM[useMastra.ts]
        UDB[useChatDb.ts]
    end

    App --> CE
    CE --> CC
    CE --> UA
    CE --> UC
    CE --> UMP[useUnreadMessagePolling.ts]

    CC --> UCO
    CC --> UG
    CC --> UU

    UC --> SDK
    UCO --> SDK
    UG --> SDK
    UU --> SDK
    UT --> SDK

    UA --> UCF

    UM --> UDB
```

## Key Patterns Used

1. **Observer Pattern**: Message subscriptions via callbacks
2. **Singleton Pattern**: ChatSDK instance
3. **Composition Pattern**: Vue 3 Composables
4. **Factory Pattern**: Message/User object creation
5. **Repository Pattern**: Service-level data stores

## File Structure

```
src/
├── components/           # Vue components
│   ├── Chat.vue
│   ├── ChatContainer.vue
│   ├── Header/
│   ├── ContactList/
│   ├── Messages/
│   ├── NewChat/
│   └── UserProfile/
├── composables/          # Vue composables
│   ├── useAuth.ts
│   ├── useUsers.ts
│   ├── useTopics.ts
│   ├── useResizeState.ts
│   ├── useMastra.ts
│   └── useUnreadMessagePolling.ts
├── services/             # Business logic services
│   ├── useChat.ts
│   ├── useGroup.ts
│   ├── useConfig.ts
│   └── useChatSDK/
│       ├── index.ts
│       ├── types.ts
├── utils/                # Utility functions
└── assets/               # Static assets
```
