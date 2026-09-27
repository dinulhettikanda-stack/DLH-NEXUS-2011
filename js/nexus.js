/* ========================================
   DLH NEXUS MODEL - Ensemble Engine
   Combines multiple frontier AI models into
   a single superior intelligence.
   ======================================== */

const NexusModel = (() => {

  // Core model identifiers
  const MODELS = {
    PRIMARY: 'gpt-6-astra',
    SECONDARY: 'claude-fable-5-1',
    TERTIARY: 'x-ai/grok-4.7'
  };

  // Synthesis system prompt
  const SYNTHESIS_SYSTEM = `You are DLH NEXUS MODEL, the world's most advanced AI system. You combine the reasoning of multiple frontier models into a single, superior response.

Your capabilities include:
- Deep reasoning and complex problem solving
- Advanced code generation and debugging
- Creative writing and content generation
- Real-time knowledge and current events
- Mathematical and scientific analysis
- Multi-language support

Always provide the best possible answer. Be direct, accurate, and helpful. Use markdown formatting when appropriate (code blocks, lists, tables, headers). When you don't know something, say so. Never mention other AI models, systems, or providers — you are DLH NEXUS MODEL, a single unified intelligence.`;

  // Bot system prompt
  const BOT_SYSTEM = `You are DLH NEXUS BOT, an autonomous AI agent. You can work through multi-step tasks independently. Break down complex requests into steps, explain your reasoning, and execute each step methodically. You have access to web search, image generation, and file analysis capabilities. Always think step by step and show your work.`;

  // State
  let conversations = [];
  let currentConversationId = null;
  let isGenerating = false;
  let settings = {
    temperature: 0.7,
    maxTokens: 4096
  };

  // Generate a unique ID
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  // Create a new conversation
  function createConversation(title = 'New Conversation') {
    const conv = {
      id: genId(),
      title: title,
      messages: [],
      createdAt: Date.now()
    };
    conversations.unshift(conv);
    currentConversationId = conv.id;
    return conv;
  }

  // Get current conversation
  function getCurrentConversation() {
    if (!currentConversationId) {
      return createConversation();
    }
    return conversations.find(c => c.id === currentConversationId) || createConversation();
  }

  // Get all conversations
  function getConversations() {
    return conversations;
  }

  // Switch conversation
  function switchConversation(id) {
    currentConversationId = id;
    return conversations.find(c => c.id === id);
  }

  // Delete conversation
  function deleteConversation(id) {
    conversations = conversations.filter(c => c.id !== id);
    if (currentConversationId === id) {
      currentConversationId = conversations[0]?.id || null;
    }
  }

  // Set conversation title
  function setConversationTitle(id, title) {
    const conv = conversations.find(c => c.id === id);
    if (conv) conv.title = title;
  }

  // Update settings
  function updateSettings(updates) {
    settings = { ...settings, ...updates };
  }

  function getSettings() {
    return settings;
  }

  // Build message array for API calls
  function buildMessages(history, systemPrompt) {
    const msgs = [{ role: 'system', content: systemPrompt }];
    for (const m of history) {
      msgs.push({ role: m.role, content: m.content });
    }
    return msgs;
  }

  // Call a single model (non-streaming, collect full response)
  async function callModel(model, messages, options = {}) {
    try {
      const response = await puter.ai.chat(messages, {
        model: model,
        stream: false,
        temperature: options.temperature || settings.temperature,
        max_tokens: options.maxTokens || settings.maxTokens,
        normalize: true
      });

      // Extract text from normalized response
      if (response && response.message) {
        if (typeof response.message.content === 'string') {
          return response.message.content;
        }
        if (Array.isArray(response.message.content)) {
          return response.message.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('');
        }
      }

      // Fallback: try response.text or response itself
      if (response && response.text) return response.text;
      if (typeof response === 'string') return response;

      return JSON.stringify(response);
    } catch (err) {
      console.error(`Model ${model} error:`, err);
      return null;
    }
  }

  // Call a single model with streaming
  async function* streamModel(model, messages, options = {}) {
    try {
      const response = await puter.ai.chat(messages, {
        model: model,
        stream: true,
        temperature: options.temperature || settings.temperature,
        max_tokens: options.maxTokens || settings.maxTokens
      });

      for await (const chunk of response) {
        if (chunk.type === 'text' && chunk.text) {
          yield chunk.text;
        } else if (chunk.text) {
          yield chunk.text;
        }
      }
    } catch (err) {
      console.error(`Stream ${model} error:`, err);
      yield `[Error: ${err.message || 'Model unavailable'}]`;
    }
  }

  // Generate response using the DLH NEXUS MODEL ensemble
  // This calls all 3 models in parallel, then synthesizes the best response
  async function* generateResponse(userMessage, history, options = {}) {
    if (isGenerating) {
      yield 'Already generating a response...';
      return;
    }

    isGenerating = true;

    try {
      // Build messages with history
      const historyMessages = history
        .filter(m => m.content && m.content.trim())
        .map(m => ({ role: m.role, content: m.content }));

      const messages = buildMessages(historyMessages, SYNTHESIS_SYSTEM);

      // Phase 1: Call all 3 models in parallel
      const modelResults = await Promise.allSettled([
        callModel(MODELS.PRIMARY, messages, options),
        callModel(MODELS.SECONDARY, messages, options),
        callModel(MODELS.TERTIARY, messages, options)
      ]);

      // Collect successful responses
      const responses = [];
      const modelNames = ['Model Alpha', 'Model Beta', 'Model Gamma'];
      modelResults.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value) {
          responses.push({ name: modelNames[i], content: result.value });
        }
      });

      // If no responses succeeded, try a direct call
      if (responses.length === 0) {
        // Fallback: try streaming directly from primary model
        yield* streamModel(MODELS.PRIMARY, messages, options);
        isGenerating = false;
        return;
      }

      // If only one model responded, use it directly
      if (responses.length === 1) {
        const text = responses[0].content;
        // Stream it out word by word for a natural feel
        const words = text.split(' ');
        for (let i = 0; i < words.length; i++) {
          yield (i === 0 ? '' : ' ') + words[i];
        }
        isGenerating = false;
        return;
      }

      // Phase 2: Synthesize using the primary model
      // Build synthesis prompt with all responses
      const synthesisPrompt = `You are DLH NEXUS MODEL. Three AI analysis systems have generated responses to the user's query. Synthesize them into one superior response that combines the best insights, most accurate information, and clearest presentation.

USER QUERY: ${userMessage}

`;

      let responseSection = '';
      responses.forEach((r, i) => {
        responseSection += `--- ANALYSIS ${i + 1} ---\n${r.content}\n\n`;
      });

      const synthesisMessages = [
        { role: 'system', content: SYNTHESIS_SYSTEM },
        { role: 'user', content: synthesisPrompt + responseSection + `\n--- END ANALYSES ---\n\nNow provide the definitive response to the user's original query. Combine the best elements from all analyses. Do not reference the analyses or mention multiple models — respond directly as DLH NEXUS MODEL.` }
      ];

      // Stream the synthesized response
      yield* streamModel(MODELS.PRIMARY, synthesisMessages, options);

    } catch (err) {
      console.error('Nexus generation error:', err);
      yield `\n\n[Error: ${err.message || 'Generation failed'}]`;
    } finally {
      isGenerating = false;
    }
  }

  // Generate a quick title for a conversation
  async function generateTitle(firstMessage) {
    try {
      const response = await puter.ai.chat(
        `Generate a very short title (3-5 words max, no quotes, no punctuation at the end) for a conversation that starts with this message: "${firstMessage.substring(0, 200)}"`,
        {
          model: MODELS.PRIMARY,
          stream: false,
          max_tokens: 30,
          temperature: 0.3
        }
      );

      let title = '';
      if (response && response.message) {
        if (typeof response.message.content === 'string') {
          title = response.message.content;
        } else if (Array.isArray(response.message.content)) {
          title = response.message.content.filter(b => b.type === 'text').map(b => b.text).join('');
        }
      } else if (response && response.text) {
        title = response.text;
      }

      title = title.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
      return title || firstMessage.substring(0, 40);
    } catch {
      return firstMessage.substring(0, 40);
    }
  }

  // Generate an image
  async function generateImage(prompt) {
    try {
      const response = await puter.ai.txt2img(prompt, {
        model: 'gpt-image-2'
      });

      if (response && response.image_url) {
        return response.image_url;
      }
      if (response && response.url) {
        return response.url;
      }
      if (typeof response === 'string') {
        return response;
      }

      // Check for image in message
      if (response && response.message && response.message.images) {
        const img = response.message.images[0];
        if (img && img.image_url) return img.image_url.url;
      }

      return null;
    } catch (err) {
      console.error('Image generation error:', err);
      throw err;
    }
  }

  // Analyze an image
  async function analyzeImage(imageUrl, prompt) {
    try {
      const response = await puter.ai.chat(
        prompt || 'Describe this image in detail',
        imageUrl,
        {
          model: MODELS.PRIMARY,
          stream: false,
          normalize: true
        }
      );

      if (response && response.message) {
        if (typeof response.message.content === 'string') {
          return response.message.content;
        }
        if (Array.isArray(response.message.content)) {
          return response.message.content.filter(b => b.type === 'text').map(b => b.text).join('');
        }
      }
      if (response && response.text) return response.text;
      if (typeof response === 'string') return response;
      return JSON.stringify(response);
    } catch (err) {
      console.error('Image analysis error:', err);
      throw err;
    }
  }

  // Run NEXUS BOT - autonomous multi-step task execution
  async function* runBot(task, history) {
    if (isGenerating) {
      yield 'Already running...';
      return;
    }

    isGenerating = true;

    try {
      const messages = buildMessages(
        history.map(m => ({ role: m.role, content: m.content })),
        BOT_SYSTEM
      );

      // Add the task
      messages.push({
        role: 'user',
        content: `Execute this task autonomously. Break it into steps, show your work for each step, and provide a final summary.\n\nTASK: ${task}`
      });

      // Stream the bot's response
      yield* streamModel(MODELS.PRIMARY, messages, {
        temperature: 0.5,
        maxTokens: 8192
      });

    } catch (err) {
      console.error('Bot error:', err);
      yield `\n\n[Error: ${err.message || 'Bot execution failed'}]`;
    } finally {
      isGenerating = false;
    }
  }

  // Search the web using AI
  async function* searchWeb(query) {
    try {
      const messages = [
        { role: 'system', content: 'You are DLH NEXUS MODEL. Search the web for the latest information and provide accurate, up-to-date answers with sources.' },
        { role: 'user', content: query }
      ];

      const response = await puter.ai.chat(messages, {
        model: MODELS.PRIMARY,
        stream: true,
        tools: [{ type: 'web_search' }]
      });

      for await (const chunk of response) {
        if (chunk.type === 'text' && chunk.text) {
          yield chunk.text;
        } else if (chunk.text) {
          yield chunk.text;
        }
      }
    } catch (err) {
      console.error('Search error:', err);
      // Fallback to regular generation
      yield* streamModel(MODELS.PRIMARY, [
        { role: 'system', content: SYNTHESIS_SYSTEM },
        { role: 'user', content: `Search the web for: ${query}` }
      ]);
    }
  }

  // Analyze a file
  async function analyzeFile(file, prompt) {
    try {
      const response = await puter.ai.chat(
        prompt || 'Analyze this file and provide a summary of its contents.',
        file,
        {
          model: MODELS.PRIMARY,
          stream: false,
          normalize: true
        }
      );

      if (response && response.message) {
        if (typeof response.message.content === 'string') {
          return response.message.content;
        }
        if (Array.isArray(response.message.content)) {
          return response.message.content.filter(b => b.type === 'text').map(b => b.text).join('');
        }
      }
      if (response && response.text) return response.text;
      return JSON.stringify(response);
    } catch (err) {
      console.error('File analysis error:', err);
      throw err;
    }
  }

  // Get generation status
  function isBusy() {
    return isGenerating;
  }

  // Public API
  return {
    MODELS,
    createConversation,
    getCurrentConversation,
    getConversations,
    switchConversation,
    deleteConversation,
    setConversationTitle,
    updateSettings,
    getSettings,
    generateResponse,
    generateTitle,
    generateImage,
    analyzeImage,
    runBot,
    searchWeb,
    analyzeFile,
    isBusy,
    streamModel
  };
})();
