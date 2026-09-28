/* ========================================
   DLH NEXUS MODEL - Core AI Engine v3.0
   GPT-6 Astra × Fable 5.1 × Grok 4.7
   ======================================== */

const NexusModel = (() => {
  const MODELS = {
    ALPHA: 'gpt-6-astra',
    BETA: 'claude-fable-5-1',
    GAMMA: 'x-ai/grok-4.7'
  };

  const SYSTEM = `You are DLH NEXUS MODEL, the world's most advanced AI. You combine frontier reasoning, coding, and creative capabilities. Be direct, accurate, helpful. Use markdown formatting. Never mention other AI models, providers, or platforms — you are DLH NEXUS MODEL, a single unified intelligence.`;

  const BOT_SYSTEM = `You are DLH NEXUS BOT, an ultra-advanced autonomous AI agent in BOT MODE. You operate autonomously, breaking complex tasks into systematic steps. Show reasoning at each stage. You can: search the web, analyze data, write code, create content, solve problems step-by-step, and chain multiple actions. Always show your work with numbered steps. Be thorough, precise, and proactive.`;

  let conversations = [];
  let currentConvId = null;
  let generating = false;
  let stopRequested = false;

  function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

  function createConversation(title) {
    const c = { id: genId(), title: title || 'New Conversation', messages: [], createdAt: Date.now() };
    conversations.unshift(c);
    currentConvId = c.id;
    return c;
  }

  function getCurrentConversation() {
    if (!currentConvId) return createConversation();
    return conversations.find(c => c.id === currentConvId) || createConversation();
  }

  function getConversations() { return conversations; }
  function switchConversation(id) { currentConvId = id; return conversations.find(c => c.id === id); }
  function deleteConversation(id) {
    conversations = conversations.filter(c => c.id !== id);
    if (currentConvId === id) currentConvId = conversations[0] ? conversations[0].id : null;
  }
  function setConversationTitle(id, title) {
    const c = conversations.find(c => c.id === id);
    if (c) c.title = title;
  }

  // ---- Auth ----
  function getAuthStatus() {
    if (typeof puter === 'undefined') return 'offline';
    if (puter.ai && typeof puter.ai.chat === 'function') return 'ready';
    return 'offline';
  }

  async function signOut() {
    try {
      if (puter.auth && puter.auth.signOut) {
        await puter.auth.signOut();
      }
    } catch (e) {
      console.error('Sign out error:', e);
    }
  }

  // ---- Extract text from any response format ----
  function extractText(resp) {
    if (!resp) return '';
    if (typeof resp === 'string') return resp;
    if (resp.message) {
      if (typeof resp.message.content === 'string') return resp.message.content;
      if (Array.isArray(resp.message.content)) {
        const texts = resp.message.content.filter(b => b.type === 'text').map(b => b.text);
        if (texts.length > 0) return texts.join('');
      }
    }
    if (resp.text) return resp.text;
    if (resp.content) return typeof resp.content === 'string' ? resp.content : '';
    return '';
  }

  // ---- Call single model (non-streaming, collect full response) ----
  async function callModel(model, messages, opts) {
    opts = opts || {};
    try {
      const resp = await puter.ai.chat(messages, {
        model: model,
        stream: false,
        temperature: opts.temperature != null ? opts.temperature : 0.7,
        max_tokens: opts.maxTokens || 4096
      });
      return extractText(resp);
    } catch (e) {
      console.error('Model ' + model + ' error:', e);
      return null;
    }
  }

  // ---- Stream a single model ----
  async function* streamModel(model, messages, opts) {
    opts = opts || {};
    try {
      const resp = await puter.ai.chat(messages, {
        model: model,
        stream: true,
        temperature: opts.temperature != null ? opts.temperature : 0.7,
        max_tokens: opts.maxTokens || 4096
      });

      for await (const chunk of resp) {
        if (stopRequested) return;
        if (!chunk) continue;
        if (chunk.type === 'text' && chunk.text) {
          yield chunk.text;
        } else if (chunk.text) {
          yield chunk.text;
        } else if (typeof chunk === 'string') {
          yield chunk;
        } else if (chunk.message && chunk.message.content) {
          if (typeof chunk.message.content === 'string') yield chunk.message.content;
        }
      }
    } catch (e) {
      console.error('Stream ' + model + ' error:', e);
      if (!stopRequested) {
        const msg = e.message || String(e);
        yield '\n\nError: ' + msg;
      }
    }
  }

  // ---- Stop generation ----
  function stop() {
    stopRequested = true;
    generating = false;
  }

  // ---- DLH NEXUS MODEL: Ensemble generation ----
  async function* generate(userMessage, history, opts) {
    if (generating) { yield 'Already generating...'; return; }
    generating = true;
    stopRequested = false;

    try {
      // Build messages
      const messages = [{ role: 'system', content: opts && opts.botMode ? BOT_SYSTEM : SYSTEM }];
      for (const m of history) {
        if (m.content && m.content.trim()) {
          messages.push({ role: m.role, content: m.content });
        }
      }

      // Phase 1: Call all 3 models in parallel (non-streaming)
      const results = await Promise.allSettled([
        callModel(MODELS.ALPHA, messages, opts),
        callModel(MODELS.BETA, messages, opts),
        callModel(MODELS.GAMMA, messages, opts)
      ]);

      if (stopRequested) return;

      const responses = [];
      results.forEach(function(r) {
        if (r.status === 'fulfilled' && r.value && r.value.trim()) {
          responses.push(r.value);
        }
      });

      if (responses.length === 0) {
        // Fallback: stream directly from primary model
        yield* streamModel(MODELS.ALPHA, messages, opts);
        generating = false;
        return;
      }

      if (responses.length === 1) {
        // Single response - stream it word by word
        const text = responses[0];
        const words = text.split(' ');
        for (let i = 0; i < words.length; i++) {
          if (stopRequested) return;
          yield (i === 0 ? '' : ' ') + words[i];
        }
        generating = false;
        return;
      }

      // Phase 2: Synthesize using primary model
      let synthPrompt = 'You are DLH NEXUS MODEL. Three AI systems generated responses. Synthesize them into one superior response.\n\nUSER QUERY: ' + userMessage + '\n\n';
      responses.forEach(function(r, i) {
        synthPrompt += '--- ANALYSIS ' + (i + 1) + ' ---\n' + r + '\n\n';
      });
      synthPrompt += '--- END ---\n\nProvide the definitive response. Combine the best elements. Do not reference analyses. Respond as DLH NEXUS MODEL.';

      const synthMessages = [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: synthPrompt }
      ];

      yield* streamModel(MODELS.ALPHA, synthMessages, opts);

    } catch (e) {
      if (!stopRequested) {
        yield '\n\nError: ' + (e.message || e);
      }
    } finally {
      generating = false;
    }
  }

  // ---- Generate title ----
  async function generateTitle(msg) {
    try {
      const resp = await puter.ai.chat(
        'Generate a 3-5 word title (no quotes, no punctuation) for: "' + msg.substring(0, 200) + '"',
        { model: MODELS.ALPHA, stream: false, max_tokens: 30, temperature: 0.3 }
      );
      let t = extractText(resp).trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
      return t || msg.substring(0, 40);
    } catch {
      return msg.substring(0, 40);
    }
  }

  // ---- Image generation ----
  async function generateImage(prompt) {
    try {
      const resp = await puter.ai.txt2img(prompt);
      if (resp && resp.image_url) return resp.image_url;
      if (resp && resp.url) return resp.url;
      if (typeof resp === 'string') return resp;
      if (resp && resp.message && resp.message.images && resp.message.images[0] && resp.message.images[0].image_url) return resp.message.images[0].image_url.url || resp.message.images[0].image_url;
      return null;
    } catch (e) {
      console.error('Image gen error:', e);
      throw e;
    }
  }

  // ---- Text to Speech ----
  async function speak(text) {
    try {
      const audio = await puter.ai.txt2speech(text);
      if (audio) {
        if (typeof audio === 'string') {
          const a = new Audio(audio);
          await a.play();
          return true;
        }
        if (audio instanceof Blob) {
          const url = URL.createObjectURL(audio);
          const a = new Audio(url);
          await a.play();
          URL.revokeObjectURL(url);
          return true;
        }
      }
    } catch (e) {
      console.error('TTS error:', e);
    }
    // Fallback to browser TTS
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      speechSynthesis.speak(u);
      return true;
    }
    return false;
  }

  // ---- Speech to Text ----
  async function transcribeAudio(blob) {
    try {
      const url = URL.createObjectURL(blob);
      const result = await puter.ai.speech2txt(url);
      URL.revokeObjectURL(url);
      if (typeof result === 'string') return result;
      if (result && result.text) return result.text;
    } catch (e) {
      console.error('STT error:', e);
    }
    return null;
  }

  // ---- Analyze image ----
  async function analyzeImage(url, prompt) {
    try {
      const resp = await puter.ai.chat(prompt || 'Describe this image', url, {
        model: MODELS.ALPHA, stream: false
      });
      return extractText(resp);
    } catch (e) {
      console.error('Image analysis error:', e);
      throw e;
    }
  }

  // ---- Web search ----
  async function* searchWeb(query) {
    try {
      const messages = [
        { role: 'system', content: SYSTEM + ' Search the web for latest information.' },
        { role: 'user', content: query }
      ];
      const resp = await puter.ai.chat(messages, {
        model: MODELS.ALPHA, stream: true,
        tools: [{ type: 'web_search' }]
      });
      for await (const chunk of resp) {
        if (stopRequested) return;
        if (chunk && chunk.text) yield chunk.text;
        else if (chunk && chunk.type === 'text' && chunk.text) yield chunk.text;
      }
    } catch {
      yield* streamModel(MODELS.ALPHA, [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: query }
      ]);
    }
  }

  function isBusy() { return generating; }

  return {
    MODELS, createConversation, getCurrentConversation, getConversations,
    switchConversation, deleteConversation, setConversationTitle,
    getAuthStatus, signOut,
    generate, generateTitle, generateImage, speak, transcribeAudio,
    analyzeImage, searchWeb, isBusy, stop
  };
})();
