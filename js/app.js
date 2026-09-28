/* ========================================
   DLH NEXUS - Main Application v2.0
   ======================================== */

(function () {
  'use strict';

  let attachedFiles = [];
  let searchEnabled = false;
  let imageMode = false;
  let botMode = false;
  let currentView = 'chat';
  let mediaRecorder = null;
  let recordingChunks = [];
  let isRecording = false;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const el = (t, p = {}, c = []) => {
    const n = document.createElement(t);
    Object.entries(p).forEach(([k, v]) => {
      if (k === 'class') n.className = v;
      else if (k === 'style') n.style.cssText = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    });
    (Array.isArray(c) ? c : [c]).forEach(ch => {
      if (ch == null) return;
      n.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
    });
    return n;
  };

  // ---- Markdown renderer ----
  function renderMarkdown(text) {
    let html = text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
    // Code blocks
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
      const langLabel = lang || 'code';
      return `<div class="code-block-wrapper"><div class="code-block-header"><span>${langLabel}</span><button class="code-copy-btn" onclick="copyCodeBlock(this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button></div><pre><code class="language-${langLabel}">${code.trim()}</code></pre></div>`;
    });
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold/italic
    html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    // Lists
    html = html.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*?<\/li>(\n|$))+/g, (m) => `<ul>${m}</ul>`);
    // Tables
    html = html.replace(/^\|(.+)\|\n\|[-:| ]+\|\n((?:\|.*\|\n?)+)/gm, (m, h, r) => {
      const hc = h.split('|').map(c => `<th>${c.trim()}</th>`).join('');
      const br = r.trim().split('\n').map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${hc}</tr></thead><tbody>${br}</tbody></table>`;
    });
    // Paragraphs
    const blocks = html.split(/\n\n+/);
    html = blocks.map(b => {
      const t = b.trim();
      if (!t) return '';
      if (/^<(h[1-3]|pre|ul|ol|blockquote|table|img|div)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
    return html;
  }

  // Copy code block
  window.copyCodeBlock = function(btn) {
    const wrapper = btn.closest('.code-block-wrapper');
    if (!wrapper) return;
    const code = wrapper.querySelector('code');
    if (!code) return;
    navigator.clipboard.writeText(code.textContent).catch(() => {});
    btn.classList.add('copied');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Copied';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
    }, 2000);
  };

  // ---- Theme ----
  function initTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    updateThemeIcon();
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
    updateThemeIcon();
  }
  function updateThemeIcon() {
    const icon = $('#theme-icon');
    if (!icon) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    icon.innerHTML = dark
      ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
      : '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
  }

  // ---- Views ----
  function switchView(view) {
    currentView = view;
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${view}`)?.classList.add('active');
    $$('.nav-item').forEach(n => n.removeAttribute('data-active'));
    $(`.nav-item[data-view="${view}"]`)?.setAttribute('data-active', 'true');
    closeSidebar();
  }

  // ---- Sidebar ----
  function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebar-overlay').style.display = 'block'; }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebar-overlay').style.display = 'none'; }

  // ---- Conversations ----
  function renderConversations() {
    const list = $('#conversations-list');
    list.innerHTML = '';
    const convs = NexusModel.getConversations();
    if (convs.length === 0) {
      list.innerHTML = '<div style="padding:12px;color:var(--text-faint);font-size:var(--text-xs);text-align:center;">No conversations yet</div>';
      return;
    }
    convs.forEach(conv => {
      const item = el('div', {
        class: 'conversation-item' + (conv.id === NexusModel.getCurrentConversation()?.id ? ' active' : ''),
        onclick: () => { NexusModel.switchConversation(conv.id); renderConversations(); renderMessages(); closeSidebar(); }
      }, [
        el('span', { class: 'conv-icon' }, [el('svg', { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', stroke_width: '2', html: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' })]),
        el('span', { class: 'conv-text', text: conv.title })
      ]);
      list.appendChild(item);
    });
  }

  // ---- Messages ----
  function renderMessages() {
    const container = $('#messages');
    const conv = NexusModel.getCurrentConversation();
    if (!conv || conv.messages.length === 0) { showWelcomeScreen(); return; }
    container.innerHTML = '';
    conv.messages.forEach(msg => appendMessage(msg.role, msg.content, msg.attachments, false));
    scrollToBottom();
  }

  function showWelcomeScreen() {
    const container = $('#messages');
    container.innerHTML = `
      <div id="welcome-screen" class="welcome-screen">
        <div class="welcome-logo">
          <svg viewBox="0 0 120 120" fill="none" width="64" height="64">
            <path d="M60 4 L116 60 L60 116 L4 60 Z" stroke="currentColor" stroke-width="2.5" fill="none"/>
            <path d="M38 84 L38 36 L82 84 L82 36" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="square" stroke-linejoin="miter"/>
            <circle cx="60" cy="60" r="3" fill="currentColor"/>
          </svg>
        </div>
        <h1 class="welcome-title">DLH NEXUS</h1>
        <p class="welcome-subtitle">The world's most advanced AI model</p>
        <div class="welcome-suggestions">
          <button class="suggestion-card" data-prompt="Explain quantum computing in simple terms"><span class="suggestion-icon">⚡</span><span class="suggestion-text">Explain quantum computing</span></button>
          <button class="suggestion-card" data-prompt="Write a Python script for merge sort"><span class="suggestion-icon">💻</span><span class="suggestion-text">Write merge sort in Python</span></button>
          <button class="suggestion-card" data-prompt="What are the latest space exploration breakthroughs?"><span class="suggestion-icon">🚀</span><span class="suggestion-text">Space exploration news</span></button>
          <button class="suggestion-card" data-prompt="Create a healthy weekly meal plan"><span class="suggestion-icon">🍽️</span><span class="suggestion-text">Weekly meal plan</span></button>
        </div>
      </div>`;
    $$('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.dataset.prompt;
        const input = $('#input');
        input.value = prompt;
        autoResize(input);
        sendMessage();
      });
    });
  }

  function appendMessage(role, content, attachments = [], animate = true) {
    const welcome = $('#welcome-screen');
    if (welcome) welcome.remove();
    const container = $('#messages');
    const msg = el('div', { class: `message ${role}` });
    msg.appendChild(el('div', { class: 'message-avatar', text: role === 'user' ? 'YOU' : 'N' }));
    const contentDiv = el('div', { class: 'message-content' });
    const roleLabel = role === 'user' ? 'You' : role === 'bot' ? 'DLH NEXUS BOT' : 'DLH NEXUS';
    contentDiv.appendChild(el('div', { class: 'message-role', text: roleLabel }));
    if (attachments && attachments.length > 0) {
      attachments.forEach(att => {
        if (att.type === 'image') contentDiv.appendChild(el('img', { src: att.url, style: 'max-width:300px;border-radius:8px;margin-bottom:8px;' }));
      });
    }
    const textDiv = el('div', { class: 'message-text' });
    if (role === 'user') textDiv.textContent = content;
    else textDiv.innerHTML = renderMarkdown(content);
    contentDiv.appendChild(textDiv);
    if (role !== 'user') {
      const actions = el('div', { class: 'message-actions' });
      actions.appendChild(el('button', { class: 'msg-action-btn', title: 'Copy', onclick: () => navigator.clipboard.writeText(content).catch(() => {}), html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' }));
      actions.appendChild(el('button', { class: 'msg-action-btn', title: 'Retry', onclick: () => regenerateMessage(msg), html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>' }));
      contentDiv.appendChild(actions);
    }
    msg.appendChild(contentDiv);
    container.appendChild(msg);
    if (animate) scrollToBottom();
    return { msg, textDiv };
  }

  function appendThinkingMessage() {
    const welcome = $('#welcome-screen');
    if (welcome) welcome.remove();
    const container = $('#messages');
    const msg = el('div', { class: 'message assistant' });
    msg.appendChild(el('div', { class: 'message-avatar', text: 'N' }));
    const contentDiv = el('div', { class: 'message-content' });
    contentDiv.appendChild(el('div', { class: 'message-role', text: 'DLH NEXUS' }));
    const status = el('div', { class: 'processing-status', id: 'processing-status' });
    status.innerHTML = '<div class="status-line"><span class="status-dot active"></span><span class="thinking-text">DLH NEXUS MODEL is processing...</span></div>';
    contentDiv.appendChild(status);
    const textDiv = el('div', { class: 'message-text', style: 'display:none;' });
    contentDiv.appendChild(textDiv);
    msg.appendChild(contentDiv);
    container.appendChild(msg);
    scrollToBottom();
    return { msg, status, textDiv };
  }

  function scrollToBottom() {
    const c = $('#messages');
    c.scrollTop = c.scrollHeight;
  }

  // ---- Auto-resize textarea ----
  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }

  // ---- Send / Stop button toggle ----
  function setGenerating(isGen) {
    $('#send-btn').style.display = isGen ? 'none' : 'flex';
    $('#stop-btn').style.display = isGen ? 'flex' : 'none';
  }

  // ---- Send message ----
  async function sendMessage() {
    const input = $('#input');
    const text = input.value.trim();
    if (!text || NexusModel.isBusy()) return;

    // Image mode
    if (imageMode) {
      const welcome = $('#welcome-screen');
      if (welcome) welcome.remove();
      const container = $('#messages');
      const msg = el('div', { class: 'message user' });
      msg.appendChild(el('div', { class: 'message-avatar', text: 'YOU' }));
      const cd = el('div', { class: 'message-content' });
      cd.appendChild(el('div', { class: 'message-role', text: 'You' }));
      cd.appendChild(el('div', { class: 'message-text', text: text }));
      msg.appendChild(cd);
      container.appendChild(msg);
      input.value = ''; input.style.height = 'auto'; scrollToBottom();
      const { status, textDiv } = appendThinkingMessage();
      status.querySelector('.thinking-text').textContent = 'Generating image...';
      setGenerating(true);
      try {
        const url = await NexusModel.generateImage(text);
        status.style.display = 'none'; textDiv.style.display = 'block';
        if (url) textDiv.innerHTML = `<img src="${url}" alt="${text}" style="border-radius:8px;max-width:100%;">`;
        else textDiv.textContent = 'Failed to generate image. Please try again.';
      } catch (e) {
        status.style.display = 'none'; textDiv.style.display = 'block';
        textDiv.textContent = `Error: ${e.message || 'Failed to generate image'}`;
      }
      setGenerating(false);
      scrollToBottom();
      return;
    }

    // Get/create conversation
    let conv = NexusModel.getCurrentConversation();
    if (!conv || conv.messages.length === 0) {
      conv = NexusModel.createConversation('New Conversation');
      renderConversations();
    }

    // Add user message
    const userMsg = { role: 'user', content: text, attachments: attachedFiles.map(f => ({ type: 'image', url: f.url })) };
    conv.messages.push(userMsg);
    appendMessage('user', text, userMsg.attachments);
    input.value = ''; input.style.height = 'auto'; input.focus();

    // Generate title
    if (conv.messages.length === 1) {
      NexusModel.generateTitle(text).then(title => {
        NexusModel.setConversationTitle(conv.id, title);
        renderConversations();
      });
    }

    // Show thinking
    const { status, textDiv } = appendThinkingMessage();
    setGenerating(true);

    let fullResponse = '';
    let firstChunk = true;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      if (firstChunk) {
        timedOut = true;
        status.style.display = 'none';
        textDiv.style.display = 'block';
        textDiv.innerHTML = renderMarkdown("The request is taking longer than expected. Please sign in if you haven't already, then try again.");
        setGenerating(false);
      }
    }, 45000);

    try {
      const history = conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));

      if (botMode) {
        // BOT MODE: Ultra-advanced autonomous execution
        for await (const chunk of NexusModel.runBot(text, history)) {
          if (timedOut) break;
          if (firstChunk) { status.style.display = 'none'; textDiv.style.display = 'block'; firstChunk = false; }
          fullResponse += chunk;
          textDiv.innerHTML = renderMarkdown(fullResponse);
          scrollToBottom();
        }
      } else if (searchEnabled) {
        for await (const chunk of NexusModel.searchWeb(text)) {
          if (timedOut) break;
          if (firstChunk) { status.style.display = 'none'; textDiv.style.display = 'block'; firstChunk = false; }
          fullResponse += chunk;
          textDiv.innerHTML = renderMarkdown(fullResponse);
          scrollToBottom();
        }
      } else {
        for await (const chunk of NexusModel.generate(text, history)) {
          if (timedOut) break;
          if (firstChunk) { status.style.display = 'none'; textDiv.style.display = 'block'; firstChunk = false; }
          fullResponse += chunk;
          textDiv.innerHTML = renderMarkdown(fullResponse);
          scrollToBottom();
        }
      }

      clearTimeout(timeoutId);
      if (!fullResponse && !timedOut) {
        fullResponse = 'I apologize, but I was unable to generate a response. Please sign in and try again.';
        textDiv.style.display = 'block';
        textDiv.innerHTML = renderMarkdown(fullResponse);
      }

      conv.messages.push({ role: 'assistant', content: fullResponse });

      // Add actions
      const actions = el('div', { class: 'message-actions' });
      actions.appendChild(el('button', { class: 'msg-action-btn', title: 'Copy', onclick: () => navigator.clipboard.writeText(fullResponse).catch(() => {}), html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' }));
      actions.appendChild(el('button', { class: 'msg-action-btn', title: 'Retry', onclick: () => regenerateMessage(textDiv.parentElement.parentElement), html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>' }));
      textDiv.parentElement.appendChild(actions);

    } catch (err) {
      clearTimeout(timeoutId);
      status.style.display = 'none';
      textDiv.style.display = 'block';
      const msg = err.message || String(err);
      if (msg.includes('auth') || msg.includes('sign') || msg.includes('Sign') || msg.includes('popup'))
        textDiv.innerHTML = renderMarkdown('**Authentication required.**\n\nA sign-in window should appear. Complete sign-in and try again.');
      else
        textDiv.innerHTML = renderMarkdown(`Error: ${msg}`);
    }

    setGenerating(false);
    scrollToBottom();
  }

  // ---- Regenerate ----
  async function regenerateMessage(msgEl) {
    const conv = NexusModel.getCurrentConversation();
    if (!conv) return;
    const lastUserIdx = conv.messages.map(m => m.role).lastIndexOf('user');
    if (lastUserIdx === -1) return;
    const lastUserMsg = conv.messages[lastUserIdx];
    const lastAssistantIdx = conv.messages.map(m => m.role).lastIndexOf('assistant');
    if (lastAssistantIdx > lastUserIdx) conv.messages.splice(lastAssistantIdx, 1);
    msgEl.remove();

    const { status, textDiv } = appendThinkingMessage();
    setGenerating(true);
    let fullResponse = '';
    let firstChunk = true;

    try {
      const history = conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      for await (const chunk of NexusModel.generate(lastUserMsg.content, history)) {
        if (firstChunk) { status.style.display = 'none'; textDiv.style.display = 'block'; firstChunk = false; }
        fullResponse += chunk;
        textDiv.innerHTML = renderMarkdown(fullResponse);
        scrollToBottom();
      }
      if (!fullResponse) {
        fullResponse = 'I apologize, but I was unable to generate a response. Please try again.';
        textDiv.innerHTML = renderMarkdown(fullResponse);
      }
      conv.messages.push({ role: 'assistant', content: fullResponse });
    } catch (e) {
      status.style.display = 'none'; textDiv.style.display = 'block';
      textDiv.innerHTML = renderMarkdown(`Error: ${e.message || 'Something went wrong.'}`);
    }

    setGenerating(false);
    scrollToBottom();
  }

  // ---- Voice input ----
  async function startVoiceInput() {
    if (isRecording) { stopVoiceInput(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordingChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordingChunks, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        isRecording = false;
        $('#voice-btn').classList.remove('recording');
        $('#voice-btn').innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>';

        // Transcribe
        const input = $('#input');
        input.placeholder = 'Transcribing...';
        const text = await NexusModel.speechToText(blob);
        input.placeholder = 'Message DLH NEXUS...';
        if (text) {
          input.value = (input.value ? input.value + ' ' : '') + text;
          autoResize(input);
          input.focus();
        }
      };
      mediaRecorder.start();
      isRecording = true;
      $('#voice-btn').classList.add('recording');
      $('#voice-btn').innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    } catch (e) {
      // Fallback: Web Speech API
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SR();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (e) => {
          const text = e.results[0][0].transcript;
          const input = $('#input');
          input.value = (input.value ? input.value + ' ' : '') + text;
          autoResize(input);
          input.focus();
        };
        recognition.start();
        $('#voice-btn').classList.add('recording');
        recognition.onend = () => $('#voice-btn').classList.remove('recording');
      }
    }
  }

  function stopVoiceInput() {
    if (mediaRecorder && isRecording) { mediaRecorder.stop(); }
  }

  // ---- File attachments ----
  function handleFiles(files) {
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => { attachedFiles.push({ name: file.name, url: e.target.result, type: 'image', file }); renderAttachments(); };
        reader.readAsDataURL(file);
      } else {
        attachedFiles.push({ name: file.name, url: '', type: 'file', file });
        renderAttachments();
      }
    });
  }

  function renderAttachments() {
    const preview = $('#attachment-preview');
    preview.innerHTML = '';
    attachedFiles.forEach((file, idx) => {
      const chip = el('div', { class: 'attachment-chip' });
      if (file.type === 'image') chip.appendChild(el('img', { src: file.url }));
      chip.appendChild(el('span', { text: file.name }));
      chip.appendChild(el('span', { class: 'attachment-remove', text: '×', onclick: () => { attachedFiles.splice(idx, 1); renderAttachments(); } }));
      preview.appendChild(chip);
    });
  }

  // ---- Connectors (real apps) ----
  const CONNECTORS = [
    { name: 'GitHub', desc: 'Code repositories, issues, PRs', icon: '🐙', category: 'Developer' },
    { name: 'Google Drive', desc: 'Cloud storage & documents', icon: '📁', category: 'Productivity' },
    { name: 'Slack', desc: 'Team messaging & channels', icon: '💬', category: 'Communication' },
    { name: 'Notion', desc: 'Notes, docs & wikis', icon: '📝', category: 'Productivity' },
    { name: 'Gmail', desc: 'Email & communications', icon: '📧', category: 'Communication' },
    { name: 'Google Calendar', desc: 'Events & scheduling', icon: '📅', category: 'Productivity' },
    { name: 'Spotify', desc: 'Music & podcasts', icon: '🎵', category: 'Entertainment' },
    { name: 'YouTube', desc: 'Video & streaming', icon: '📺', category: 'Entertainment' },
    { name: 'X / Twitter', desc: 'Social media & posts', icon: '🐦', category: 'Social' },
    { name: 'Instagram', desc: 'Photo & video sharing', icon: '📸', category: 'Social' },
    { name: 'Facebook', desc: 'Social network', icon: '👥', category: 'Social' },
    { name: 'WhatsApp', desc: 'Messaging & calls', icon: '🟢', category: 'Communication' },
    { name: 'Telegram', desc: 'Secure messaging', icon: '✈️', category: 'Communication' },
    { name: 'Discord', desc: 'Community & voice chat', icon: '🎮', category: 'Communication' },
    { name: 'Zoom', desc: 'Video meetings', icon: '🎥', category: 'Communication' },
    { name: 'Google Maps', desc: 'Maps & navigation', icon: '🗺️', category: 'Utility' },
    { name: 'Weather', desc: 'Weather forecasts', icon: '🌤️', category: 'Utility' },
    { name: 'News API', desc: 'Latest news & headlines', icon: '📰', category: 'Information' },
    { name: 'Stock Market', desc: 'Stocks & trading data', icon: '📈', category: 'Finance' },
    { name: 'Stripe', desc: 'Payments & billing', icon: '💳', category: 'Finance' },
    { name: 'Shopify', desc: 'E-commerce store', icon: '🛒', category: 'E-commerce' },
    { name: 'Amazon', desc: 'Product search & shopping', icon: '📦', category: 'E-commerce' },
    { name: 'Netflix', desc: 'Movies & TV shows', icon: '🎬', category: 'Entertainment' },
    { name: 'ChatGPT', desc: 'AI chat integration', icon: '🤖', category: 'AI' },
    { name: 'Claude', desc: 'AI assistant', icon: '🧠', category: 'AI' },
    { name: 'Midjourney', desc: 'AI image generation', icon: '🎨', category: 'AI' },
    { name: 'Figma', desc: 'Design & prototyping', icon: '🖌️', category: 'Design' },
    { name: 'Adobe', desc: 'Creative suite', icon: '✨', category: 'Design' },
    { name: 'Canva', desc: 'Graphic design', icon: '🖼️', category: 'Design' },
    { name: 'VS Code', desc: 'Code editor integration', icon: '💻', category: 'Developer' },
    { name: 'Docker', desc: 'Container management', icon: '🐳', category: 'Developer' },
    { name: 'AWS', desc: 'Cloud computing', icon: '☁️', category: 'Cloud' },
    { name: 'Google Cloud', desc: 'Cloud infrastructure', icon: '🌩️', category: 'Cloud' },
    { name: 'Azure', desc: 'Microsoft cloud', icon: '🔷', category: 'Cloud' },
    { name: 'Vercel', desc: 'Deploy & hosting', icon: '▲', category: 'Developer' },
    { name: 'Linear', desc: 'Issue tracking', icon: '📐', category: 'Productivity' },
    { name: 'Jira', desc: 'Project management', icon: '🎯', category: 'Productivity' },
    { name: 'Trello', desc: 'Kanban boards', icon: '📋', category: 'Productivity' },
    { name: 'Asana', desc: 'Team tasks', icon: '✅', category: 'Productivity' },
    { name: 'Airtable', desc: 'Database & spreadsheets', icon: '📊', category: 'Productivity' },
    { name: 'Reddit', desc: 'Community forums', icon: '🔴', category: 'Social' },
    { name: 'LinkedIn', desc: 'Professional network', icon: '💼', category: 'Social' },
    { name: 'Pinterest', desc: 'Visual discovery', icon: '📌', category: 'Social' },
    { name: 'TikTok', desc: 'Short videos', icon: '🎵', category: 'Entertainment' },
    { name: 'Twitch', desc: 'Live streaming', icon: '🎮', category: 'Entertainment' },
    { name: 'Apple Music', desc: 'Music streaming', icon: '🎶', category: 'Entertainment' },
    { name: 'Yelp', desc: 'Business reviews', icon: '⭐', category: 'Utility' },
    { name: 'Uber', desc: 'Ride sharing', icon: '🚗', category: 'Utility' },
    { name: 'DoorDash', desc: 'Food delivery', icon: '🍽️', category: 'Utility' },
    { name: 'Wikipedia', desc: 'Encyclopedia', icon: '📚', category: 'Information' },
    { name: 'Stack Overflow', desc: 'Developer Q&A', icon: '💻', category: 'Developer' },
    { name: 'Medium', desc: 'Articles & blogs', icon: '✍️', category: 'Information' },
    { name: 'Substack', desc: 'Newsletter publishing', icon: '📧', category: 'Information' },
    { name: 'OpenAI', desc: 'AI models & API', icon: '🔬', category: 'AI' },
    { name: 'Hugging Face', desc: 'ML models', icon: '🤗', category: 'AI' },
    { name: 'Replicate', desc: 'AI model hosting', icon: '🔄', category: 'AI' },
    { name: 'Supabase', desc: 'Database & auth', icon: '⚡', category: 'Developer' },
    { name: 'Firebase', desc: 'App platform', icon: '🔥', category: 'Developer' },
    { name: 'MongoDB', desc: 'NoSQL database', icon: '🍃', category: 'Developer' },
    { name: 'PostgreSQL', desc: 'SQL database', icon: '🐘', category: 'Developer' },
    { name: 'Redis', desc: 'In-memory cache', icon: '🔴', category: 'Developer' },
    { name: 'Cloudflare', desc: 'CDN & security', icon: '🌐', category: 'Cloud' },
    { name: 'DigitalOcean', desc: 'Cloud servers', icon: '🌊', category: 'Cloud' },
    { name: 'Render', desc: 'App hosting', icon: '🎨', category: 'Cloud' },
    { name: 'Heroku', desc: 'PaaS hosting', icon: '💜', category: 'Cloud' },
    { name: 'Sentry', desc: 'Error tracking', icon: '🔍', category: 'Developer' },
    { name: 'Datadog', desc: 'Monitoring & logs', icon: '🐕', category: 'Developer' },
    { name: 'Postman', desc: 'API testing', icon: '📮', category: 'Developer' },
    { name: 'GitLab', desc: 'DevOps platform', icon: '🦊', category: 'Developer' },
    { name: 'Bitbucket', desc: 'Git repository', icon: '🪣', category: 'Developer' },
    { name: 'Vercel', desc: 'Frontend deployment', icon: '▲', category: 'Developer' },
    { name: 'Netlify', desc: 'Static hosting', icon: '🌐', category: 'Developer' }
  ];

  function renderConnectors() {
    const grid = $('#connectors-grid');
    grid.innerHTML = '';
    const search = $('#connector-search')?.value.toLowerCase() || '';
    const filtered = search
      ? CONNECTORS.filter(c => c.name.toLowerCase().includes(search) || c.desc.toLowerCase().includes(search) || c.category.toLowerCase().includes(search))
      : CONNECTORS;

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-faint);">No connectors found</div>';
      return;
    }

    filtered.forEach(c => {
      const card = el('div', { class: 'connector-card' });
      card.appendChild(el('div', { class: 'connector-icon', text: c.icon }));
      const info = el('div', { class: 'connector-info' });
      info.appendChild(el('div', { class: 'connector-name', text: c.name }));
      info.appendChild(el('div', { class: 'connector-desc', text: c.desc }));
      card.appendChild(info);
      card.appendChild(el('div', { class: 'connector-status' }, [
        el('span', { class: 'status-dot done' }),
        el('span', { text: 'Connect' })
      ]));
      grid.appendChild(card);
    });
  }

  // ---- Device Control ----
  const DEVICES = [
    { name: 'Camera', desc: 'Access device camera', icon: 'camera', action: async (o) => {
      try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); o.textContent = 'Camera active. Stream: ' + s.id.substring(0, 20) + '...'; o.classList.add('visible'); setTimeout(() => s.getTracks().forEach(t => t.stop()), 3000); }
      catch { o.textContent = 'Camera access denied'; o.classList.add('visible'); }
    }},
    { name: 'Microphone', desc: 'Record audio', icon: 'mic', action: async (o) => {
      try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); o.textContent = 'Microphone active'; o.classList.add('visible'); setTimeout(() => { s.getTracks().forEach(t => t.stop()); o.textContent = 'Microphone stopped'; }, 3000); }
      catch { o.textContent = 'Microphone access denied'; o.classList.add('visible'); }
    }},
    { name: 'Geolocation', desc: 'Get device location', icon: 'location', action: async (o) => {
      if (!navigator.geolocation) { o.textContent = 'Geolocation not supported'; o.classList.add('visible'); return; }
      navigator.geolocation.getCurrentPosition(p => { o.textContent = `Lat: ${p.coords.latitude.toFixed(4)}, Lng: ${p.coords.longitude.toFixed(4)}`; o.classList.add('visible'); }, () => { o.textContent = 'Location access denied'; o.classList.add('visible'); });
    }},
    { name: 'Screen Share', desc: 'Share device screen', icon: 'screen', action: async (o) => {
      try { const s = await navigator.mediaDevices.getDisplayMedia({ video: true }); o.textContent = 'Screen sharing started'; o.classList.add('visible'); setTimeout(() => { s.getTracks().forEach(t => t.stop()); o.textContent = 'Screen sharing stopped'; }, 5000); }
      catch { o.textContent = 'Screen share denied'; o.classList.add('visible'); }
    }},
    { name: 'Clipboard', desc: 'Read/write clipboard', icon: 'clipboard', action: async (o) => {
      try { await navigator.clipboard.writeText('DLH NEXUS'); const t = await navigator.clipboard.readText(); o.textContent = `Clipboard: "${t}"`; o.classList.add('visible'); }
      catch { o.textContent = 'Clipboard access denied'; o.classList.add('visible'); }
    }},
    { name: 'Notifications', desc: 'Send system notifications', icon: 'bell', action: async (o) => {
      if (!('Notification' in window)) { o.textContent = 'Not supported'; o.classList.add('visible'); return; }
      const p = await Notification.requestPermission();
      if (p === 'granted') { new Notification('DLH NEXUS', { body: 'Device control active', icon: 'assets/favicon.svg' }); o.textContent = 'Notification sent'; }
      else o.textContent = 'Permission denied';
      o.classList.add('visible');
    }},
    { name: 'Battery', desc: 'Check battery status', icon: 'battery', action: async (o) => {
      if (!navigator.getBattery) { o.textContent = 'Battery API not supported'; o.classList.add('visible'); return; }
      try { const b = await navigator.getBattery(); o.textContent = `Battery: ${Math.round(b.level * 100)}%${b.charging ? ' (charging)' : ''}`; o.classList.add('visible'); }
      catch { o.textContent = 'Battery info unavailable'; o.classList.add('visible'); }
    }},
    { name: 'Network', desc: 'Check connection status', icon: 'wifi', action: async (o) => {
      const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!c) { o.textContent = `Online: ${navigator.onLine}`; }
      else o.textContent = `Type: ${c.effectiveType || 'unknown'}, Downlink: ${c.downlink}Mbps, RTT: ${c.rtt}ms`;
      o.classList.add('visible');
    }},
    { name: 'Vibration', desc: 'Trigger vibration (mobile)', icon: 'vibrate', action: async (o) => {
      if (!navigator.vibrate) { o.textContent = 'Vibration not supported'; o.classList.add('visible'); return; }
      navigator.vibrate([100, 50, 100, 50, 200]); o.textContent = 'Vibration sent'; o.classList.add('visible');
    }},
    { name: 'Page Visibility', desc: 'Monitor tab focus state', icon: 'visibility', action: async (o) => {
      o.textContent = `Tab state: ${document.visibilityState}\nHidden: ${document.hidden ? 'Yes' : 'No'}`; o.classList.add('visible');
    }},
    { name: 'Device Info', desc: 'Get hardware & software info', icon: 'info', action: async (o) => {
      const info = [`Platform: ${navigator.platform || 'Unknown'}`, `Language: ${navigator.language}`, `Cores: ${navigator.hardwareConcurrency || 'Unknown'}`, `Memory: ${navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'Unknown'}`, `Screen: ${screen.width}x${screen.height}`, `Touch: ${'ontouchstart' in window ? 'Yes' : 'No'}`, `Online: ${navigator.onLine}`];
      o.textContent = info.join('\n'); o.classList.add('visible');
    }},
    { name: 'Wake Lock', desc: 'Prevent screen from sleeping', icon: 'lock', action: async (o) => {
      if (!navigator.wakeLock) { o.textContent = 'Wake Lock not supported'; o.classList.add('visible'); return; }
      try { const l = await navigator.wakeLock.request('screen'); o.textContent = 'Wake lock activated'; o.classList.add('visible'); setTimeout(() => { l.release(); o.textContent = 'Wake lock released'; }, 10000); }
      catch { o.textContent = 'Wake lock failed'; o.classList.add('visible'); }
    }}
  ];

  function renderDevices() {
    const grid = $('#device-grid');
    grid.innerHTML = '';
    const icons = {
      camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
      mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>',
      location: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
      screen: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
      clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
      bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
      battery: '<rect x="1" y="6" width="18" height="12" rx="2"/><path d="M23 13v-2"/><path d="M5 10v4M9 10v4M13 10v4"/>',
      wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/>',
      vibrate: '<path d="M2 8l2-3v14l-2-3M6 5v14M10 5v14M14 5v14M18 5v14M22 8l-2-3v14l2-3"/>',
      visibility: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
      info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
      lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
    };
    DEVICES.forEach(d => {
      const card = el('div', { class: 'device-card' });
      card.appendChild(el('div', { class: 'device-header' }, [
        el('div', { class: 'device-icon' }, [el('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', stroke_width: '2', html: icons[d.icon] || icons.info })]),
        el('div', { class: 'device-name', text: d.name })
      ]));
      card.appendChild(el('div', { class: 'device-desc', text: d.desc }));
      const output = el('div', { class: 'device-output' });
      const btn = el('button', { class: 'device-btn', text: 'Activate', onclick: async () => {
        btn.disabled = true; btn.textContent = 'Working...';
        await d.action(output);
        btn.disabled = false; btn.textContent = 'Activate';
      }});
      card.appendChild(btn);
      card.appendChild(output);
      grid.appendChild(card);
    });
  }

  // ---- Auth ----
  function updateAuthStatus() {
    const btn = $('#auth-btn');
    const signOutBtn = $('#sign-out-btn');
    if (!btn) return;
    const text = btn.querySelector('.auth-text');
    const status = NexusModel.getAuthStatus();
    if (status === 'offline') {
      btn.className = 'auth-btn disconnected'; text.textContent = 'AI Offline';
      signOutBtn.style.display = 'none';
      return;
    }
    btn.className = 'auth-btn connecting'; text.textContent = 'Connecting...';
    try {
      if (NexusModel.isSignedIn()) {
        btn.className = 'auth-btn connected'; text.textContent = 'Connected';
        signOutBtn.style.display = 'flex';
        return;
      }
    } catch {}
    btn.className = 'auth-btn ready'; text.textContent = 'Ready';
    signOutBtn.style.display = 'flex';
  }

  // ---- Init ----
  function init() {
    initTheme();
    setTimeout(updateAuthStatus, 1000);
    setInterval(updateAuthStatus, 10000);
    NexusModel.createConversation();
    renderConversations();
    renderConnectors();
    renderDevices();

    // Nav items
    $$('.nav-item').forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));

    // New chat
    $('#new-chat-btn').addEventListener('click', () => { NexusModel.createConversation(); renderConversations(); showWelcomeScreen(); switchView('chat'); });

    // Sidebar overlay
    $('#sidebar-overlay').addEventListener('click', closeSidebar);

    // Theme
    $('#theme-toggle').addEventListener('click', toggleTheme);

    // BOT MODE toggle
    $('#bot-mode-toggle').addEventListener('click', () => {
      botMode = !botMode;
      $('#bot-mode-toggle').classList.toggle('active', botMode);
      const input = $('#input');
      if (botMode) {
        input.placeholder = 'Give NEXUS BOT a task...';
        // Show BOT MODE indicator in messages
        let indicator = document.querySelector('.bot-mode-indicator');
        if (!indicator) {
          indicator = el('div', { class: 'bot-mode-indicator active' });
          indicator.innerHTML = '<span class="bot-dot"></span><span>BOT MODE ACTIVE — NEXUS BOT will execute tasks autonomously</span>';
          $('#messages').insertBefore(indicator, $('#messages').firstChild);
        }
        indicator.classList.add('active');
      } else {
        input.placeholder = 'Message DLH NEXUS...';
        const indicator = document.querySelector('.bot-mode-indicator');
        if (indicator) indicator.remove();
      }
    });

    // Sign out
    $('#sign-out-btn').addEventListener('click', async () => {
      await NexusModel.signOut();
      updateAuthStatus();
    });

    // Chat input
    const input = $('#input');
    input.addEventListener('input', () => autoResize(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    $('#send-btn').addEventListener('click', sendMessage);
    $('#stop-btn').addEventListener('click', () => NexusModel.stop());

    // Voice input
    $('#voice-btn').addEventListener('click', startVoiceInput);

    // File attachment
    $('#attach-btn').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });

    // Drag and drop
    $('#messages').addEventListener('dragover', (e) => e.preventDefault());
    $('#messages').addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); });

    // Search toggle
    $('#search-toggle').addEventListener('click', () => {
      searchEnabled = !searchEnabled;
      $('#search-toggle').classList.toggle('active', searchEnabled);
    });

    // Image toggle
    $('#image-toggle').addEventListener('click', () => {
      imageMode = !imageMode;
      $('#image-toggle').classList.toggle('active', imageMode);
      input.placeholder = imageMode ? 'Describe an image to generate...' : 'Message DLH NEXUS...';
    });

    // Connector search
    $('#connector-search')?.addEventListener('input', renderConnectors);

    // Settings
    const tempSlider = $('#temp-slider');
    if (tempSlider) tempSlider.addEventListener('input', (e) => NexusModel.updateSettings?.({ temperature: parseFloat(e.target.value) }));
    const maxTokens = $('#max-tokens-input');
    if (maxTokens) maxTokens.addEventListener('change', (e) => NexusModel.updateSettings?.({ maxTokens: parseInt(e.target.value) || 4096 }));
    const fontSize = $('#font-size-select');
    if (fontSize) fontSize.addEventListener('change', (e) => document.documentElement.setAttribute('data-font-size', e.target.value));
    const themeToggle = $('#settings-theme-toggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

    // Suggestion cards
    $$('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.dataset.prompt;
        input.value = prompt;
        autoResize(input);
        sendMessage();
      });
    });

    showWelcomeScreen();
    input.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
