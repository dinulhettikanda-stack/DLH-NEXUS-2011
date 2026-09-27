/* ========================================
   DLH NEXUS - Main Application
   ======================================== */

(function () {
  'use strict';

  // ---- State ----
  let attachedFiles = [];
  let searchEnabled = false;
  let imageMode = false;
  let currentView = 'chat';

  // ---- DOM helpers ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'data') Object.entries(v).forEach(([dk, dv]) => node.dataset[dk] = dv);
      else node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  // ---- Markdown renderer (simple) ----
  function renderMarkdown(text) {
    let html = text;

    // Escape HTML
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Code blocks (triple backtick)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Images in markdown
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Lists
    html = html.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>');

    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>.*?<\/li>(\n|$))+/g, (match) => `<ul>${match}</ul>`);

    // Tables (simple)
    html = html.replace(/^\|(.+)\|\n\|[-:| ]+\|\n((?:\|.*\|\n?)+)/gm, (match, header, rows) => {
      const hCells = header.split('|').map(c => `<th>${c.trim()}</th>`).join('');
      const bodyRows = rows.trim().split('\n').map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${hCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    });

    // Paragraphs (split by double newlines, skip block elements)
    const blocks = html.split(/\n\n+/);
    html = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<(h[1-3]|pre|ul|ol|blockquote|table|img|div)/.test(trimmed)) {
        return trimmed;
      }
      // Single newlines become <br>
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return html;
  }

  // ---- Theme ----
  function initTheme() {
    const saved = null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    const icon = $('#theme-icon');
    if (!icon) return;
    if (theme === 'dark') {
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    } else {
      icon.innerHTML = '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
    }
  }

  // ---- View switching ----
  function switchView(view) {
    currentView = view;
    $$('.view').forEach(v => v.classList.remove('active'));
    const target = $(`#view-${view}`);
    if (target) target.classList.add('active');

    $$('.nav-item').forEach(n => n.removeAttribute('data-active'));
    const navBtn = $(`.nav-item[data-view="${view}"]`);
    if (navBtn) navBtn.setAttribute('data-active', 'true');

    // Close sidebar on mobile
    closeSidebar();
  }

  // ---- Sidebar ----
  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#sidebar-overlay').style.display = 'block';
  }

  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#sidebar-overlay').style.display = 'none';
  }

  // ---- Conversations ----
  function renderConversations() {
    const list = $('#conversations-list');
    list.innerHTML = '';
    const convs = NexusModel.getConversations();

    if (convs.length === 0) {
      list.innerHTML = '<div style="padding: 12px; color: var(--text-faint); font-size: var(--text-xs); text-align: center;">No conversations yet</div>';
      return;
    }

    convs.forEach(conv => {
      const item = el('div', {
        class: 'conversation-item' + (conv.id === NexusModel.getCurrentConversation()?.id ? ' active' : ''),
        onclick: () => {
          NexusModel.switchConversation(conv.id);
          renderConversations();
          renderMessages();
          closeSidebar();
        }
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

    if (!conv || conv.messages.length === 0) {
      showWelcomeScreen();
      return;
    }

    container.innerHTML = '';
    conv.messages.forEach(msg => {
      appendMessage(msg.role, msg.content, msg.attachments, false);
    });
    scrollToBottom();
  }

  function showWelcomeScreen() {
    const container = $('#messages');
    container.innerHTML = `
      <div id="welcome-screen" class="welcome-screen">
        <div class="welcome-logo">
          <svg viewBox="0 0 120 120" fill="none" width="72" height="72">
            <path d="M60 4 L116 60 L60 116 L4 60 Z" stroke="currentColor" stroke-width="2.5" fill="none"/>
            <path d="M38 84 L38 36 L82 84 L82 36" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="square" stroke-linejoin="miter"/>
            <circle cx="60" cy="60" r="3" fill="currentColor"/>
          </svg>
        </div>
        <h1 class="welcome-title">DLH NEXUS</h1>
        <p class="welcome-subtitle">The world's most advanced AI model</p>
        <div class="welcome-suggestions">
          <button class="suggestion-card" data-prompt="Explain quantum computing in simple terms">
            <span class="suggestion-icon">⚡</span>
            <span class="suggestion-text">Explain quantum computing</span>
          </button>
          <button class="suggestion-card" data-prompt="Write a Python script to sort a list using merge sort">
            <span class="suggestion-icon">💻</span>
            <span class="suggestion-text">Write merge sort in Python</span>
          </button>
          <button class="suggestion-card" data-prompt="What are the latest breakthroughs in space exploration?">
            <span class="suggestion-icon">🚀</span>
            <span class="suggestion-text">Space exploration breakthroughs</span>
          </button>
          <button class="suggestion-card" data-prompt="Create a healthy meal plan for a week">
            <span class="suggestion-icon">🍽️</span>
            <span class="suggestion-text">Weekly healthy meal plan</span>
          </button>
        </div>
      </div>
    `;

    // Re-bind suggestion cards
    $$('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.dataset.prompt;
        const input = $('#input');
        input.value = prompt;
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
        sendMessage();
      });
    });
  }

  function appendMessage(role, content, attachments = [], animate = true) {
    // Remove welcome screen if present
    const welcome = $('#welcome-screen');
    if (welcome) welcome.remove();

    const container = $('#messages');
    const msg = el('div', { class: `message ${role}` });

    // Avatar
    const avatarText = role === 'user' ? 'YOU' : 'N';
    const avatar = el('div', { class: 'message-avatar', text: avatarText });
    msg.appendChild(avatar);

    // Content
    const contentDiv = el('div', { class: 'message-content' });
    const roleLabel = role === 'user' ? 'You' : 'DLH NEXUS';
    contentDiv.appendChild(el('div', { class: 'message-role', text: roleLabel }));

    // Attachments
    if (attachments && attachments.length > 0) {
      attachments.forEach(att => {
        if (att.type === 'image') {
          contentDiv.appendChild(el('img', { src: att.url, style: 'max-width: 300px; border-radius: 8px; margin-bottom: 8px;' }));
        }
      });
    }

    // Message text
    const textDiv = el('div', { class: 'message-text' });
    if (role === 'assistant') {
      textDiv.innerHTML = renderMarkdown(content);
    } else {
      textDiv.textContent = content;
    }
    contentDiv.appendChild(textDiv);

    // Actions (for assistant messages)
    if (role === 'assistant') {
      const actions = el('div', { class: 'message-actions' });
      actions.appendChild(el('button', {
        class: 'msg-action-btn',
        title: 'Copy',
        onclick: () => {
          navigator.clipboard.writeText(content).catch(() => {});
        },
        html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
      }));
      actions.appendChild(el('button', {
        class: 'msg-action-btn',
        title: 'Regenerate',
        onclick: () => regenerateMessage(msg),
        html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>'
      }));
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

    const status = el('div', { class: 'processing-status' });
    status.id = 'processing-status';
    status.innerHTML = `
      <div class="status-line">
        <span class="status-dot active"></span>
        <span class="thinking-text">DLH NEXUS MODEL is processing...</span>
      </div>
    `;
    contentDiv.appendChild(status);

    const textDiv = el('div', { class: 'message-text', style: 'display:none;' });
    contentDiv.appendChild(textDiv);

    msg.appendChild(contentDiv);
    container.appendChild(msg);
    scrollToBottom();

    return { msg, status, textDiv };
  }

  function scrollToBottom() {
    const container = $('#messages');
    container.scrollTop = container.scrollHeight;
  }

  // ---- Send message ----
  async function sendMessage() {
    const input = $('#input');
    const text = input.value.trim();

    if (!text || NexusModel.isBusy()) return;

    // Handle image generation mode
    if (imageMode) {
      const welcome = $('#welcome-screen');
      if (welcome) welcome.remove();
      const container = $('#messages');
      const msg = el('div', { class: 'message user' });
      msg.appendChild(el('div', { class: 'message-avatar', text: 'YOU' }));
      const contentDiv = el('div', { class: 'message-content' });
      contentDiv.appendChild(el('div', { class: 'message-role', text: 'You' }));
      contentDiv.appendChild(el('div', { class: 'message-text', text: text }));
      msg.appendChild(contentDiv);
      container.appendChild(msg);

      input.value = '';
      input.style.height = 'auto';
      scrollToBottom();

      // Generate image
      const { status, textDiv } = appendThinkingMessage();
      status.querySelector('.thinking-text').textContent = 'Generating image...';

      try {
        const imageUrl = await NexusModel.generateImage(text);
        status.style.display = 'none';
        textDiv.style.display = 'block';
        if (imageUrl) {
          textDiv.innerHTML = `<img src="${imageUrl}" alt="${text}" style="border-radius: 8px; max-width: 100%;">`;
        } else {
          textDiv.innerHTML = 'Failed to generate image. Please try again.';
        }
      } catch (err) {
        status.style.display = 'none';
        textDiv.style.display = 'block';
        textDiv.innerHTML = `Error: ${err.message || 'Failed to generate image'}`;
      }
      scrollToBottom();
      return;
    }

    // Get or create conversation
    let conv = NexusModel.getCurrentConversation();
    if (!conv || conv.messages.length === 0) {
      conv = NexusModel.createConversation('New Conversation');
      renderConversations();
    }

    // Add user message
    const userMsg = { role: 'user', content: text, attachments: attachedFiles.map(f => ({ type: 'image', url: f.url })) };
    conv.messages.push(userMsg);

    // Add to UI
    appendMessage('user', text, userMsg.attachments);

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    input.focus();

    // Generate title if first message
    if (conv.messages.length === 1) {
      NexusModel.generateTitle(text).then(title => {
        NexusModel.setConversationTitle(conv.id, title);
        renderConversations();
      });
    }

    // Show thinking indicator
    const { msg, status, textDiv } = appendThinkingMessage();

    // Generate response
    let fullResponse = '';
    let firstChunk = true;

    try {
      // Check if web search is enabled
      if (searchEnabled) {
        for await (const chunk of NexusModel.searchWeb(text)) {
          if (firstChunk) {
            status.style.display = 'none';
            textDiv.style.display = 'block';
            firstChunk = false;
          }
          fullResponse += chunk;
          textDiv.innerHTML = renderMarkdown(fullResponse);
          scrollToBottom();
        }
      } else {
        // Use ensemble model
        const history = conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));

        for await (const chunk of NexusModel.generateResponse(text, history)) {
          if (firstChunk) {
            status.style.display = 'none';
            textDiv.style.display = 'block';
            firstChunk = false;
          }
          fullResponse += chunk;
          textDiv.innerHTML = renderMarkdown(fullResponse);
          scrollToBottom();
        }
      }

      // If we got no response
      if (!fullResponse) {
        fullResponse = 'I apologize, but I was unable to generate a response. Please try again.';
        textDiv.innerHTML = renderMarkdown(fullResponse);
      }

      // Add to conversation
      conv.messages.push({ role: 'assistant', content: fullResponse });

      // Add actions
      const actions = el('div', { class: 'message-actions' });
      actions.appendChild(el('button', {
        class: 'msg-action-btn',
        title: 'Copy',
        onclick: () => navigator.clipboard.writeText(fullResponse).catch(() => {}),
        html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
      }));
      textDiv.parentElement.appendChild(actions);

    } catch (err) {
      status.style.display = 'none';
      textDiv.style.display = 'block';
      textDiv.innerHTML = renderMarkdown(`Error: ${err.message || 'Something went wrong. Please try again.'}`);
    }

    scrollToBottom();
  }

  // ---- Regenerate ----
  async function regenerateMessage(msgEl) {
    const conv = NexusModel.getCurrentConversation();
    if (!conv) return;

    // Find the last user message
    const lastUserIdx = conv.messages.map(m => m.role).lastIndexOf('user');
    if (lastUserIdx === -1) return;

    const lastUserMsg = conv.messages[lastUserIdx];

    // Remove last assistant message
    const lastAssistantIdx = conv.messages.map(m => m.role).lastIndexOf('assistant');
    if (lastAssistantIdx > lastUserIdx) {
      conv.messages.splice(lastAssistantIdx, 1);
    }

    // Remove the message from UI
    msgEl.remove();

    // Re-generate
    const { status, textDiv } = appendThinkingMessage();
    let fullResponse = '';
    let firstChunk = true;

    try {
      const history = conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      for await (const chunk of NexusModel.generateResponse(lastUserMsg.content, history)) {
        if (firstChunk) {
          status.style.display = 'none';
          textDiv.style.display = 'block';
          firstChunk = false;
        }
        fullResponse += chunk;
        textDiv.innerHTML = renderMarkdown(fullResponse);
        scrollToBottom();
      }

      if (!fullResponse) {
        fullResponse = 'I apologize, but I was unable to generate a response. Please try again.';
        textDiv.innerHTML = renderMarkdown(fullResponse);
      }

      conv.messages.push({ role: 'assistant', content: fullResponse });
    } catch (err) {
      status.style.display = 'none';
      textDiv.style.display = 'block';
      textDiv.innerHTML = renderMarkdown(`Error: ${err.message || 'Something went wrong.'}`);
    }
  }

  // ---- File attachment ----
  function handleFiles(files) {
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          attachedFiles.push({ name: file.name, url: e.target.result, type: 'image', file: file });
          renderAttachments();
        };
        reader.readAsDataURL(file);
      } else {
        attachedFiles.push({ name: file.name, url: '', type: 'file', file: file });
        renderAttachments();
      }
    });
  }

  function renderAttachments() {
    const preview = $('#attachment-preview');
    preview.innerHTML = '';
    attachedFiles.forEach((file, idx) => {
      const chip = el('div', { class: 'attachment-chip' });
      if (file.type === 'image') {
        chip.appendChild(el('img', { src: file.url }));
      }
      chip.appendChild(el('span', { text: file.name }));
      chip.appendChild(el('span', { class: 'attachment-remove', text: '×', onclick: () => {
        attachedFiles.splice(idx, 1);
        renderAttachments();
      }}));
      preview.appendChild(chip);
    });
  }

  // ---- Image Generation ----
  async function generateImage() {
    const prompt = $('#image-prompt').value.trim();
    if (!prompt || NexusModel.isBusy()) return;

    const gallery = $('#image-gallery');
    const empty = gallery.querySelector('.image-empty');
    if (empty) empty.remove();

    // Show loading
    const loading = el('div', { class: 'image-loading' }, [
      el('div', { class: 'thinking-dots' }, [
        el('div', { class: 'thinking-dot' }),
        el('div', { class: 'thinking-dot' }),
        el('div', { class: 'thinking-dot' })
      ])
    ]);
    gallery.appendChild(loading);

    $('#image-prompt').value = '';

    try {
      const imageUrl = await NexusModel.generateImage(prompt);
      loading.remove();

      if (imageUrl) {
        const item = el('div', { class: 'image-item' });
        item.appendChild(el('img', { src: imageUrl, alt: prompt }));
        item.appendChild(el('div', { class: 'image-prompt', text: prompt }));
        gallery.appendChild(item);
      } else {
        gallery.appendChild(el('div', { class: 'image-item', text: 'Failed to generate image. Please try again.' }));
      }
    } catch (err) {
      loading.remove();
      gallery.appendChild(el('div', { class: 'image-item', text: `Error: ${err.message || 'Failed to generate image'}` }));
    }
  }

  // ---- NEXUS BOT ----
  async function runBot() {
    const prompt = $('#bot-prompt').value.trim();
    if (!prompt || NexusModel.isBusy()) return;

    const log = $('#bot-log');
    const empty = log.querySelector('.bot-empty');
    if (empty) empty.remove();

    const entry = el('div', { class: 'bot-entry' });
    entry.appendChild(el('div', { class: 'bot-entry-header' }, [
      el('svg', { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', stroke_width: '2', html: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/>' }),
      el('span', { text: 'NEXUS BOT' })
    ]));

    const step = el('div', { class: 'bot-step' });
    step.appendChild(el('div', { class: 'bot-step-num', text: '▶' }));
    const stepContent = el('div', { class: 'bot-step-content' });
    stepContent.appendChild(el('strong', { text: 'Task: ' }));
    stepContent.appendChild(el('span', { text: prompt }));
    step.appendChild(stepContent);
    entry.appendChild(step);

    const responseStep = el('div', { class: 'bot-step' });
    responseStep.appendChild(el('div', { class: 'bot-step-num', text: '⚡' }));
    const responseContent = el('div', { class: 'bot-step-content' });
    responseContent.appendChild(el('strong', { text: 'Executing...' }));
    responseStep.appendChild(responseContent);
    entry.appendChild(responseStep);

    log.appendChild(entry);

    $('#bot-prompt').value = '';

    let fullResponse = '';
    try {
      for await (const chunk of NexusModel.runBot(prompt, [])) {
        fullResponse += chunk;
        responseContent.innerHTML = renderMarkdown(fullResponse);
        log.scrollTop = log.scrollHeight;
      }
    } catch (err) {
      responseContent.innerHTML = renderMarkdown(`Error: ${err.message || 'Bot execution failed'}`);
    }
  }

  // ---- Connectors ----
  const CONNECTORS = [
    { name: 'Web Search', desc: 'Search the internet for real-time information and current events', icon: 'search', enabled: true },
    { name: 'Image Generation', desc: 'Create stunning images from text descriptions using advanced AI', icon: 'image', enabled: true },
    { name: 'File Analysis', desc: 'Upload and analyze images, documents, and code files', icon: 'file', enabled: true },
    { name: 'Code Execution', desc: 'Generate, debug, and explain code in 50+ programming languages', icon: 'code', enabled: true },
    { name: 'Math Solver', desc: 'Solve complex mathematical problems and show step-by-step work', icon: 'math', enabled: true },
    { name: 'Translation', desc: 'Translate text between 100+ languages with natural fluency', icon: 'translate', enabled: true },
    { name: 'Data Analysis', desc: 'Analyze data, create visualizations, and extract insights', icon: 'chart', enabled: true },
    { name: 'Writing Assistant', desc: 'Draft, edit, and refine any type of written content', icon: 'pen', enabled: true },
    { name: 'Research Agent', desc: 'Conduct deep multi-source research on any topic', icon: 'research', enabled: true },
    { name: 'Task Automation', desc: 'Automate repetitive tasks with multi-step workflows', icon: 'automation', enabled: true }
  ];

  function renderConnectors() {
    const grid = $('#connectors-grid');
    grid.innerHTML = '';

    const icons = {
      search: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
      file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
      code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
      math: '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
      translate: '<path d="M5 8h14M9 3v5M7 21l4-8 4 8M11 13h6M14 13l4 8"/>',
      chart: '<path d="M3 3v18h18M7 16V8M12 16v-5M17 16v-9"/>',
      pen: '<path d="M12 19l7-7 3 3-7 7-3-3zM2 2l7 7M5 5l7 7"/>',
      research: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
      automation: '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>'
    };

    CONNECTORS.forEach(c => {
      const card = el('div', { class: 'connector-card' });
      card.appendChild(el('div', { class: 'connector-header' }, [
        el('div', { class: 'connector-icon' }, [
          el('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', stroke_width: '2', html: icons[c.icon] || icons.search })
        ]),
        el('div', { class: 'connector-name', text: c.name })
      ]));
      card.appendChild(el('div', { class: 'connector-desc', text: c.desc }));
      card.appendChild(el('div', { class: 'connector-status' }, [
        el('span', { class: `status-dot ${c.enabled ? 'done' : ''}` }),
        el('span', { text: c.enabled ? 'Active' : 'Inactive' })
      ]));
      grid.appendChild(card);
    });
  }

  // ---- Device Control ----
  const DEVICES = [
    {
      name: 'Camera',
      desc: 'Access device camera for photos and video',
      icon: 'camera',
      action: async (output) => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          output.textContent = 'Camera activated. Stream ID: ' + stream.id.substring(0, 20) + '...';
          output.classList.add('visible');
          // Stop after 3 seconds for privacy
          setTimeout(() => {
            stream.getTracks().forEach(t => t.stop());
          }, 3000);
        } catch (err) {
          output.textContent = 'Camera access denied or unavailable';
          output.classList.add('visible');
        }
      }
    },
    {
      name: 'Microphone',
      desc: 'Record audio from device microphone',
      icon: 'mic',
      action: async (output) => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          output.textContent = 'Microphone activated. Recording...';
          output.classList.add('visible');
          setTimeout(() => {
            stream.getTracks().forEach(t => t.stop());
            output.textContent = 'Microphone stopped';
          }, 3000);
        } catch (err) {
          output.textContent = 'Microphone access denied or unavailable';
          output.classList.add('visible');
        }
      }
    },
    {
      name: 'Geolocation',
      desc: 'Get current device location coordinates',
      icon: 'location',
      action: async (output) => {
        if (!navigator.geolocation) {
          output.textContent = 'Geolocation not supported';
          output.classList.add('visible');
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            output.textContent = `Lat: ${pos.coords.latitude.toFixed(4)}, Lng: ${pos.coords.longitude.toFixed(4)}, Accuracy: ±${pos.coords.accuracy}m`;
            output.classList.add('visible');
          },
          () => {
            output.textContent = 'Location access denied';
            output.classList.add('visible');
          }
        );
      }
    },
    {
      name: 'Screen Share',
      desc: 'Share device screen for collaboration',
      icon: 'screen',
      action: async (output) => {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          output.textContent = 'Screen sharing started. Stream active.';
          output.classList.add('visible');
          setTimeout(() => {
            stream.getTracks().forEach(t => t.stop());
            output.textContent = 'Screen sharing stopped';
          }, 5000);
        } catch (err) {
          output.textContent = 'Screen share denied or unavailable';
          output.classList.add('visible');
        }
      }
    },
    {
      name: 'Clipboard',
      desc: 'Read from and write to system clipboard',
      icon: 'clipboard',
      action: async (output) => {
        try {
          await navigator.clipboard.writeText('DLH NEXUS was here');
          const text = await navigator.clipboard.readText();
          output.textContent = `Clipboard content: "${text}"`;
          output.classList.add('visible');
        } catch (err) {
          output.textContent = 'Clipboard access denied';
          output.classList.add('visible');
        }
      }
    },
    {
      name: 'Notifications',
      desc: 'Send system notifications to the device',
      icon: 'bell',
      action: async (output) => {
        if (!('Notification' in window)) {
          output.textContent = 'Notifications not supported';
          output.classList.add('visible');
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification('DLH NEXUS', {
            body: 'Device control active',
            icon: 'assets/favicon.svg'
          });
          output.textContent = 'Notification sent successfully';
        } else {
          output.textContent = 'Notification permission denied';
        }
        output.classList.add('visible');
      }
    },
    {
      name: 'Battery',
      desc: 'Check device battery status and level',
      icon: 'battery',
      action: async (output) => {
        if (!navigator.getBattery) {
          output.textContent = 'Battery API not supported on this device';
          output.classList.add('visible');
          return;
        }
        try {
          const battery = await navigator.getBattery();
          const level = Math.round(battery.level * 100);
          const charging = battery.charging ? ' (charging)' : '';
          output.textContent = `Battery: ${level}%${charging}`;
          output.classList.add('visible');
        } catch {
          output.textContent = 'Battery info unavailable';
          output.classList.add('visible');
        }
      }
    },
    {
      name: 'Network',
      desc: 'Check network connection status and type',
      icon: 'wifi',
      action: async (output) => {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!conn) {
          output.textContent = `Online: ${navigator.onLine}`;
        } else {
          output.textContent = `Type: ${conn.effectiveType || 'unknown'}, Downlink: ${conn.downlink}Mbps, RTT: ${conn.rtt}ms`;
        }
        output.classList.add('visible');
      }
    },
    {
      name: 'Vibration',
      desc: 'Trigger device vibration (mobile only)',
      icon: 'vibrate',
      action: async (output) => {
        if (!navigator.vibrate) {
          output.textContent = 'Vibration not supported on this device';
          output.classList.add('visible');
          return;
        }
        navigator.vibrate([100, 50, 100, 50, 200]);
        output.textContent = 'Vibration pattern sent';
        output.classList.add('visible');
      }
    },
    {
      name: 'Page Visibility',
      desc: 'Monitor page visibility and tab focus state',
      icon: 'visibility',
      action: async (output) => {
        const state = document.visibilityState;
        const hidden = document.hidden;
        output.textContent = `Tab state: ${state}\nHidden: ${hidden ? 'Yes' : 'No'}`;
        output.classList.add('visible');
      }
    },
    {
      name: 'Device Info',
      desc: 'Get device hardware and software information',
      icon: 'info',
      action: async (output) => {
        const info = [
          `Platform: ${navigator.platform || 'Unknown'}`,
          `Language: ${navigator.language}`,
          `Cookies: ${navigator.cookieEnabled ? 'Enabled' : 'Disabled'}`,
          `Cores: ${navigator.hardwareConcurrency || 'Unknown'}`,
          `Memory: ${navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'Unknown'}`,
          `Screen: ${screen.width}x${screen.height}`,
          `Touch: ${'ontouchstart' in window ? 'Yes' : 'No'}`,
          `Online: ${navigator.onLine}`
        ];
        output.textContent = info.join('\n');
        output.classList.add('visible');
      }
    },
    {
      name: 'Wake Lock',
      desc: 'Prevent device screen from dimming or sleeping',
      icon: 'lock',
      action: async (output) => {
        if (!navigator.wakeLock) {
          output.textContent = 'Wake Lock API not supported';
          output.classList.add('visible');
          return;
        }
        try {
          const lock = await navigator.wakeLock.request('screen');
          output.textContent = 'Screen wake lock activated';
          output.classList.add('visible');
          setTimeout(() => {
            lock.release();
            output.textContent = 'Wake lock released';
          }, 10000);
        } catch {
          output.textContent = 'Wake lock request failed';
          output.classList.add('visible');
        }
      }
    }
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
        el('div', { class: 'device-icon' }, [
          el('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', stroke_width: '2', html: icons[d.icon] || icons.info })
        ]),
        el('div', { class: 'device-name', text: d.name })
      ]));
      card.appendChild(el('div', { class: 'device-desc', text: d.desc }));

      const output = el('div', { class: 'device-output' });
      const btn = el('button', { class: 'device-btn', text: 'Activate', onclick: async () => {
        btn.disabled = true;
        btn.textContent = 'Working...';
        await d.action(output);
        btn.disabled = false;
        btn.textContent = 'Activate';
      }});
      card.appendChild(btn);
      card.appendChild(output);
      grid.appendChild(card);
    });
  }

  // ---- Settings ----
  function initSettings() {
    const settings = NexusModel.getSettings();

    const tempSlider = $('#temp-slider');
    if (tempSlider) {
      tempSlider.value = settings.temperature;
      tempSlider.addEventListener('input', (e) => {
        NexusModel.updateSettings({ temperature: parseFloat(e.target.value) });
      });
    }

    const maxTokens = $('#max-tokens-input');
    if (maxTokens) {
      maxTokens.value = settings.maxTokens;
      maxTokens.addEventListener('change', (e) => {
        NexusModel.updateSettings({ maxTokens: parseInt(e.target.value) || 4096 });
      });
    }

    const fontSize = $('#font-size-select');
    if (fontSize) {
      fontSize.addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-font-size', e.target.value);
      });
    }

    const themeToggle = $('#settings-theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
    }
  }

  // ---- Auto-resize textarea ----
  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }

  // ---- Init ----
  function init() {
    // Theme
    initTheme();

    // Create initial conversation
    NexusModel.createConversation();

    // Render UI
    renderConversations();
    renderConnectors();
    renderDevices();
    initSettings();

    // Nav items
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        switchView(item.dataset.view);
      });
    });

    // New chat button
    $('#new-chat-btn').addEventListener('click', () => {
      NexusModel.createConversation();
      renderConversations();
      showWelcomeScreen();
      switchView('chat');
    });

    // Menu toggle (mobile)
    $('#menu-toggle').addEventListener('click', openSidebar);
    $('#sidebar-overlay').addEventListener('click', closeSidebar);

    // Theme toggle
    $('#theme-toggle').addEventListener('click', toggleTheme);

    // Chat input
    const input = $('#input');
    input.addEventListener('input', () => autoResize(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    $('#send-btn').addEventListener('click', sendMessage);

    // File attachment
    $('#attach-btn').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', (e) => {
      handleFiles(e.target.files);
      e.target.value = '';
    });

    // Drag and drop
    const messagesContainer = $('#messages');
    messagesContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    messagesContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    });

    // Search toggle
    $('#search-toggle').addEventListener('click', () => {
      searchEnabled = !searchEnabled;
      $('#search-toggle').classList.toggle('active', searchEnabled);
    });

    // Image toggle (for image mode in chat)
    $('#image-toggle').addEventListener('click', () => {
      imageMode = !imageMode;
      $('#image-toggle').classList.toggle('active', imageMode);
      if (imageMode) {
        input.placeholder = 'Describe an image to generate...';
      } else {
        input.placeholder = 'Message DLH NEXUS...';
      }
    });

    // Image gen view
    const imagePrompt = $('#image-prompt');
    imagePrompt.addEventListener('input', () => autoResize(imagePrompt));
    imagePrompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        generateImage();
      }
    });
    $('#image-gen-btn').addEventListener('click', generateImage);

    // Bot view
    const botPrompt = $('#bot-prompt');
    botPrompt.addEventListener('input', () => autoResize(botPrompt));
    botPrompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        runBot();
      }
    });
    $('#bot-run-btn').addEventListener('click', runBot);

    // Suggestion cards
    $$('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.dataset.prompt;
        input.value = prompt;
        autoResize(input);
        sendMessage();
      });
    });

    // Handle image mode in chat
    const originalSend = sendMessage;
    // Override is handled by checking imageMode in the click handler

    // Welcome screen
    showWelcomeScreen();

    // Focus input
    input.focus();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
