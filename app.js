// Import necessary libraries
require('dotenv').config();
const express = require('express');
const axios = require('axios');

// --- Initialize External Services ---
const app = express();
app.use(express.json());

// --- In-memory store for user sessions ---
// Note: For production, you should use a database (like Redis or a SQL DB)
// to persist user state. This object will reset if the server restarts.
const userSessions = {};

// --- Global Variables from .env file ---
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const PORT = process.env.PORT || 3000;

// --- Webhook Setup for Meta Verification ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// --- Main Webhook to Receive Messages ---
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    const message = body.entry[0].changes[0].value.messages[0];
    const from = message.from; // User's phone number
    handleMessage(from, message);
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// --- Main Message Handler Logic ---
async function handleMessage(to, message) {
  // Case 1: User sent an interactive message (button or list reply)
  if (message.type === 'interactive') {
    const interactiveType = message.interactive.type;

    // A. User clicked a language selection button
    if (interactiveType === 'button_reply') {
      const buttonId = message.interactive.button_reply.id;
      if (buttonId === 'lang_ar') {
        userSessions[to] = { language: 'ar' };
        await sendArabicMenuList(to);
      } else if (buttonId === 'lang_fr') {
        userSessions[to] = { language: 'fr' };
        await sendFrenchMenuList(to);
      }
    }
    // B. User replied from a list
    else if (interactiveType === 'list_reply') {
      const listId = message.interactive.list_reply.id;
      const listTitle = message.interactive.list_reply.title;
      // You can add specific logic for each list item here based on its ID
      console.log(`User selected option: ${listId}`);
      // For now, we just acknowledge the selection.
      // You can replace this with specific functions for each option.
      const lang = userSessions[to]?.language || 'ar';
      const replyText = lang === 'ar' 
        ? `لقد اخترت: *${listTitle}*.\n\nسيقوم أحد موظفينا بالرد قريبًا.`
        : `Vous avez choisi : *${listTitle}*.\n\nUn de nos agents vous répondra bientôt.`;
      await sendMessage(to, replyText);
    }
  }
  // Case 2: User sent a text message
  else if (message.type === 'text') {
    // For any text message, we will start or restart the conversation
    // by sending the main welcome message.
    await sendWelcomeMessage(to);
  }
}

// --- Message Sending Functions ---

// 1. Sends the initial Welcome Message with Language Buttons
async function sendWelcomeMessage(to) {
  const messageData = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: "مرحبًا بك في موسيت! نحن نهتم براحتك ونقدم لك أفضل أنواع مراتب السرير. كيف يمكننا مساعدتك اليوم؟\n\nBonjour et bienvenue chez Maucit ! Nous prenons soin de votre confort et vous proposons les meilleurs matelas. Comment pouvons-nous vous aider aujourd'hui ?"
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'lang_ar',
              // *** FIXED: Shortened button title to be under 20 characters ***
              title: 'العربية' 
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'lang_fr',
              // *** FIXED: Shortened button title to be under 20 characters ***
              title: 'Français'
            }
          }
        ]
      }
    }
  };
  await sendApiRequest(messageData);
}

// 2. Sends the Arabic Menu List
async function sendArabicMenuList(to) {
  const messageData = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'القائمة الرئيسية' },
      body: { text: 'يرجى اختيار أحد الخيارات التالية:' },
      action: {
        button: 'عرض الخيارات',
        sections: [{
          title: 'خدماتنا',
          rows: [
            { id: 'ar_discover', title: 'اكتشف أنواع المراتب' },
            { id: 'ar_branches', title: 'مواقع الفروع' },
            { id: 'ar_hours', title: 'أوقات العمل' },
            { id: 'ar_find_perfect', title: 'ابحث عن مرتبتك المثالية' },
            { id: 'ar_tips', title: 'نصائح للنوم الصحي' },
            { id: 'ar_contact', title: 'تواصل معنا مباشرة' }
          ]
        }]
      }
    }
  };
  await sendApiRequest(messageData);
}

// 3. Sends the French Menu List
async function sendFrenchMenuList(to) {
    const messageData = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'Menu Principal' },
      body: { text: 'Veuillez choisir une des options suivantes :' },
      action: {
        button: 'Voir les options',
        sections: [{
          title: 'Nos Services',
          rows: [
            { id: 'fr_discover', title: 'nos matelas' },
            { id: 'fr_branches', title: 'Nos succursales' },
            { id: 'fr_hours', title: 'Horaires' },
            { id: 'fr_find_perfect', title: 'Trouvez le matelas' },
            { id: 'fr_tips', title: 'Conseils de sommeil' },
            { id: 'fr_contact', title: 'Nous contacter' }
          ]
        }]
      }
    }
  };
  await sendApiRequest(messageData);
}


// 4. Sends a simple text message
async function sendMessage(to, text) {
  const messageData = {
    messaging_product: 'whatsapp',
    to: to,
    text: { body: text }
  };
  await sendApiRequest(messageData);
}

// --- Generic API Request Function ---
// A centralized function to handle all API calls to Meta.
async function sendApiRequest(data) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      data,
      { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log('Message sent successfully!');
  } catch (error) {
    console.error('Failed to send message:', error.response ? error.response.data : error.message);
  }
}


// --- Start the Server ---
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
