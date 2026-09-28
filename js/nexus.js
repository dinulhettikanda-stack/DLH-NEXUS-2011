/* ========================================
   DLH NEXUS MODEL - Core AI Engine
   GPT-6 Astra × Fable 5.1 × Grok 4.7
   ======================================== */

const NexusModel = (() => {
  const MODELS = {
    ALPHA: 'gpt-6-astra',
    BETA: 'claude-fable-5-1',
    GAMMA: 'x-ai/grok-4.7'
  };

  const SYSTEM = `You are DLH NEXUS MODEL, the world's most advanced AI. You combine frontier reasoning, coding, and creative capabilities into a single unified intelligence. Be direct, accurate, helpful. Use markdown (code blocks, lists, tables, headers). Never mention other AI models, providers, or platforms — you are DLH NEXUS MODEL.`;

  const BOT_SYSTEM = `You are DLH NEXUS BOT, an ultra-advanced autonomous AI agent. When activated, you operate in BOT MODE — breaking complex tasks into systematic steps, showing reasoning at each stage, and executing autonomously. You can: search the web, analyze data, write code, create content, solve problems step-by-step, and chain multiple actions together. Always show your work clearly with numbered steps. Be thorough, precise, and proactive.`;

  let conversations = [];
  let currentConvId = null;
  let generating = false;
  let abortController = null;

  function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

  function createConversation(title = 'New Conversation') {
    const c = { id: genId(), title, messages: [], createdAt: Date.now() };
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
    if (currentConvId === id) currentConvId = conversations[0]?.id || null;
  }
  function setConversationTitle(id, title) {
    const c = conversations.find(c => c.id === id);
    if (c) c.title = title;
  }

  // ---- Auth ----
  function isSignedIn() {
    try { return typeof puter !== 'undefined' && puter.isSignedIn && puter.isSignedIn(); }
    catch { return typeof puter !== 'undefined'; }
  }

  function getAuthStatus() {
    if (typeof puter === 'undefined') return 'offline';
    try {
      if (puter.isSignedIn && puter.isSignedIn()) return 'connected';
    } catch {}
    return typeof puter !== 'undefined' && puter.ai ? 'ready' : 'offline';
  }

  async function signOut() {
    try {
      if (puter.auth && puter.auth.signOut) await puter.auth.signOut();
      else if (puter.signOut) await puter.signOut();
    } catch (e) { console.error('Sign out error:', e); }
  }

  // ---- Build messages ----
  function buildMessages(history, systemPrompt) {
    const msgs = [{ role: 'system', content: systemPrompt || SYSTEM }];
    for (const m of history) msgs.push({ role: m.role, content: m.content });
    return msgs;
  }

  // ---- Extract text from response ----
  function extractText(response) {
    if (!response) return '';
    if (typeof response === 'string') return response;
    if (response.message) {
      if (typeof response.message.content === 'string') return response.message.content;
      if (Array.isArray(response.message.content)) {
        return response.message.content.filter(b => b.type === 'text').map(b => b.text).join('');
      }
    }
    if (response.text) return response.text;
    return JSON.stringify(response);
  }

  // ---- Call single model (non-streaming) ----
  async function callModel(model, messages, opts = {}) {
    try {
      const resp = await puter.ai.chat(messages, {
        model,
        stream: false,
        temperature: opts.temperature || 0.7,
        max_tokens: opts.maxTokens || 4096
      });
      return extractText(resp);
    } catch (e) {
      console.error(`${model} error:`, e);
      return null;
    }
  }

  // ---- Stream single model ----
  async function* streamModel(model, messages, opts = {}) {
    try {
      const resp = await puter.ai.chat(messages, {
        model,
        stream: true,
        temperature: opts.temperature || 0.7,
        max_tokens: opts.maxTokens || 4096
      });
      for await (const chunk of resp) {
        if (abortController?.signal.aborted) return;
        if (chunk) {
          if (chunk.type === 'text' && chunk.text) yield chunk.text;
          else if (chunk.text) yield chunk.text;
          else if (typeof chunk === 'string') yield chunk;
          else if (chunk.message?.content) yield typeof chunk.message.content === 'string' ? chunk.message.content : '';
        }
      }
    } catch (e) {
      console.error(`Stream ${model}:`, e);
      if (!abortController?.signal.aborted) {
        const msg = e.message || String(e);
        if (msg.includes('auth') || msg.includes('sign') || msg.includes('Sign'))
          yield '\n\n**Authentication required.** A sign-in window should appear. Complete sign-in and try again.';
        else
          yield `\n\nError: ${msg}`;
      }
    }
  }

  // ---- Stop generation ----
  function stop() {
    if (abortController) {
      abortController.signal.aborted = true;
      abortController = null;
    }
    generating = false;
  }

  // ---- DLH NEXUS MODEL: Ensemble generation ----
  async function* generate(userMessage, history, opts = {}) {
    if (generating) { yield 'Already generating...'; return; }
    generating = true;
    abortController = { signal: { aborted: false } };

    try {
      const messages = buildMessages(history, SYSTEM);

      // Phase 1: Call all 3 models in parallel
      const results = await Promise.allSettled([
        callModel(MODELS.ALPHA, messages, opts),
        callModel(MODELS.BETA, messages, opts),
        callModel(MODELS.GAMMA, messages, opts)
      ]);

      const responses = results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);

      if (abortController.signal.aborted) return;

      if (responses.length === 0) {
        // Fallback: stream directly from primary model
        yield* streamModel(MODELS.ALPHA, messages, opts);
        generating = false;
        return;
      }

      if (responses.length === 1) {
        // Single model response - stream it word by word
        const words = responses[0].split(' ');
        for (let i = 0; i < words.length; i++) {
          if (abortController.signal.aborted) return;
          yield (i === 0 ? '' : ' ') + words[i];
        }
        generating = false;
        return;
      }

      // Phase 2: Synthesize
      let prompt = `You are DLH NEXUS MODEL. Three AI systems generated responses. Synthesize them into one superior response combining the best insights, most accurate info, and clearest presentation.\n\nUSER QUERY: ${userMessage}\n\n`;
      responses.forEach((r, i) => { prompt += `--- ANALYSIS ${i + 1} ---\n${r}\n\n`; });
      prompt += `--- END ---\n\nProvide the definitive response. Combine the best elements. Do not reference analyses or multiple models — respond as DLH NEXUS MODEL.`;

      const synthMsgs = [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt }
      ];

      yield* streamModel(MODELS.ALPHA, synthMsgs, opts);

    } catch (e) {
      if (!abortController.signal.aborted)
        yield `\n\nError: ${e.message || e}`;
    } finally {
      generating = false;
      abortController = null;
    }
  }

  // ---- Generate title ----
  async function generateTitle(msg) {
    try {
      const r = await puter.ai.chat(
        `Generate a 3-5 word title (no quotes, no punctuation) for: "${msg.substring(0, 200)}"`,
        { model: MODELS.ALPHA, stream: false, max_tokens: 30, temperature: 0.3 }
      );
      let t = extractText(r).trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
      return t || msg.substring(0, 40);
    } catch { return msg.substring(0, 40); }
  }

  // ---- Image generation ----
  async function generateImage(prompt) {
    try {
      const resp = await puter.ai.txt2img(prompt);
      if (resp?.image_url) return resp.image_url;
      if (resp?.url) return resp.url;
      if (typeof resp === 'string') return resp;
      if (resp?.message?.images?.[0]?.image_url?.url) return resp.message.images[0].image_url.url;
      return null;
    } catch (e) { console.error('Image gen:', e); throw e; }
  }

  // ---- Voice: Text to Speech ----
  async function textToSpeech(text) {
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
      // Fallback to browser TTS
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(u);
        return true;
      }
    } catch (e) { console.error('TTS:', e); }
    return false;
  }

  // ---- Voice: Speech to Text ----
  async function speechToText(audioBlob) {
    try {
      const url = URL.createObjectURL(audioBlob);
      const result = await puter.ai.speech2txt(url);
      URL.revokeObjectURL(url);
      if (result) {
        if (typeof result === 'string') return result;
        if (result.text) return result.text;
      }
    } catch (e) { console.error('STT:', e); }
    return null;
  }

  // ---- Analyze image ----
  async function analyzeImage(url, prompt) {
    try {
      const r = await puter.ai.chat(prompt || 'Describe this image', url, { model: MODELS.ALPHA, stream: false });
      return extractText(r);
    } catch (e) { console.error('Image analysis:', e); throw e; }
  }

  // ---- NEXUS BOT: Ultra-advanced autonomous agent ----
  async function* runBot(task, history) {
    if (generating) { yield 'Already running...'; return; }
    generating = true;
    abortController = { signal: { aborted: false } };

    try {
      const messages = buildMessages(history, BOT_SYSTEM);
      messages.push({
        role: 'user',
        content: `BOT MODE ACTIVATED. Execute this task autonomously:\n\n${task}\n\nBreak into steps, show reasoning, execute each step, provide final summary.`
      });

      yield* streamModel(MODELS.ALPHA, messages, { temperature: 0.5, maxTokens: 8192 });

    } catch (e) {
      if (!abortController.signal.aborted)
        yield `\n\nError: ${e.message || e}`;
    } finally {
      generating = false;
      abortController = null;
    }
  }

  // ---- Web search ----
  async function* searchWeb(query) {
    try {
      const msgs = [
        { role: 'system', content: SYSTEM + ' Search the web for latest information.' },
        { role: 'user', content: query }
      ];
      const resp = await puter.ai.chat(msgs, {
        model: MODELS.ALPHA, stream: true,
        tools: [{ type: 'web_search' }]
      });
      for await (const chunk of resp) {
        if (abortController?.signal.aborted) return;
        if (chunk?.text) yield chunk.text;
        else if (chunk?.type === 'text' && chunk?.text) yield chunk.text;
      }
    } catch {
      yield* streamModel(MODELS.ALPHA, [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: query }
      ]);
    }
  }

  // ---- Analyze file ----
  async function analyzeFile(file, prompt) {
    try {
      const r = await puter.ai.chat(prompt || 'Analyze this file', file, { model: MODELS.ALPHA, stream: false });
      return extractText(r);
    } catch (e) { console.error('File:', e); throw e; }
  }

  function isBusy() { return generating; }

  return {
    MODELS, createConversation, getCurrentConversation, getConversations,
    switchConversation, deleteConversation, setConversationTitle,
    isSignedIn, getAuthStatus, signOut,
    generate, generateTitle, generateImage, textToSpeech, speechToText,
    analyzeImage, runBot, searchWeb, analyzeFile,
    isBusy, stop
  };
})();
