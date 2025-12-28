import { customRouter } from './CustomRouter';
import { getConversationList } from '../services/useConversions';
import { getGroupList } from '../services/useGroup';
import { loadMessagesForConversation } from '../services/useMessageLoader';

// Initialize default routes for the chat application
// These routes map to the different "chapters" or views in the application

const initializeRoutes = () => {
  // Define the main routes
  customRouter.registerRoute('/', () => {
    // Default route - assistant view
    console.log('Navigated to default route');
    // Update any necessary state for the default view
    updateNavigationState(null, null);
  });

  customRouter.registerRoute('/ai', () => {
    console.log('Navigated to AI assistant');
    updateNavigationState('ai', null);
  });

  customRouter.registerRoute('/assistant', () => {
    console.log('Navigated to assistant');
    updateNavigationState('assistant', null);
  });

  customRouter.registerRoute('/channels', () => {
    console.log('Navigated to channels');
    updateNavigationState('channels', null);
  });

  customRouter.registerRoute('/dialogs', () => {
    console.log('Navigated to dialogs');
    updateNavigationState('dialogs', null);
  });

  // Register dynamic routes for contacts and groups
  customRouter.registerDynamicRoute('/contact/:id', params => {
    console.log('Navigated to contact:', params?.id);
    if (params?.id) {
      updateNavigationState('contact', params.id);
    }
  });

  customRouter.registerDynamicRoute('/group/:id', params => {
    console.log('Navigated to group:', params?.id);
    if (params?.id) {
      updateNavigationState('group', params.id);
    }
  });
};

// Function to update navigation state when routes change
const updateNavigationState = (
  chapter: string | null,
  contactId: string | null
) => {
  // This function will be called when routes change to update the application state
  // It can trigger loading of messages for the specific contact/group
  console.log(
    `Updating navigation state: chapter=${chapter}, contactId=${contactId}`
  );

  // If we have a contactId, we should load messages for that contact
  if (contactId) {
    loadMessagesForContact(contactId);
  }
};

// Function to load messages for a specific contact
const loadMessagesForContact = (contactId: string) => {
  // Find the conversation for this contact
  const conversations = getConversationList();
  const conversation = conversations.find(
    conv =>
      conv.id === contactId ||
      conv.conversationId === contactId ||
      conv.id === `g_${contactId}` || // For groups
      conv.conversationId === `g_${contactId}` ||
      conv.id === `si_${contactId}` || // For single user conversations
      conv.conversationId === `si_${contactId}`
  );

  if (conversation) {
    console.log(`Found conversation for contact ${contactId}:`, conversation);
    // Trigger loading of messages for this conversation
    loadMessagesForConversation(conversation.conversationId || conversation.id);
  } else {
    console.log(`No conversation found for contact ${contactId}`);
    // Check if it's a group
    const groups = getGroupList();
    const group = groups.find(
      g =>
        g.id === contactId ||
        g.groupId === contactId ||
        g.id === `g_${contactId}` ||
        g.groupId === `g_${contactId}`
    );

    if (group) {
      console.log(`Found group for id ${contactId}:`, group);
      // Trigger loading of messages for this group
      loadMessagesForConversation(group.conversationId || group.id);
    }
  }
};

// Initialize routes
initializeRoutes();

export { customRouter };
