/* ========================================
   DLH NEXUS - Main Application v3.0
   ======================================== */

(function () {
  'use strict';

  var attachedFiles = [];
  var searchEnabled = false;
  var imageMode = false;
  var botMode = false;
  var currentView = 'chat';
  var mediaRecorder = null;
  var recordingChunks = [];
  var isRecording = false;

  function $(s) { return document.querySelector(s); }
  function $$(s) { return document.querySelectorAll(s); }
  function el(tag, props, children) {
    var node = document.createElement(tag);
    props = props || {};
    children = children || [];
    for (var k in props) {
      if (k === 'class') node.className = props[k];
      else if (k === 'style') node.style.cssText = props[k];
      else if (k === 'html') node.innerHTML = props[k];
      else if (k === 'text') node.textContent = props[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2).toLowerCase(), props[k]);
      else node.setAttribute(k, props[k]);
    }
    if (!Array.isArray(children)) children = [children];
    children.forEach(function(ch) {
      if (ch == null) return;
      node.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
    });
    return node;
  }

  // ---- Markdown ----
  function renderMarkdown(text) {
    var html = text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
    // Code blocks
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, function(m, lang, code) {
      var label = lang || 'code';
      return '<div class="code-block-wrapper"><div class="code-block-header"><span>' + label + '</span><button class="code-copy-btn" onclick="copyCodeBlock(this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button></div><pre><code>' + code.trim() + '</code></pre></div>';
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^\*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*?<\/li>(\n|$))+/g, function(m) { return '<ul>' + m + '</ul>'; });
    html = html.replace(/^\|(.+)\|\n\|[-:| ]+\|\n((?:\|.*\|\n?)+)/gm, function(m, h, r) {
      var hc = h.split('|').map(function(c) { return '<th>' + c.trim() + '</th>'; }).join('');
      var br = r.trim().split('\n').map(function(row) {
        var cells = row.split('|').filter(function(c) { return c.trim(); }).map(function(c) { return '<td>' + c.trim() + '</td>'; }).join('');
        return '<tr>' + cells + '</tr>';
      }).join('');
      return '<table><thead><tr>' + hc + '</tr></thead><tbody>' + br + '</tbody></table>';
    });
    var blocks = html.split(/\n\n+/);
    html = blocks.map(function(b) {
      var t = b.trim();
      if (!t) return '';
      if (/^<(h[1-3]|pre|ul|ol|blockquote|table|img|div)/.test(t)) return t;
      return '<p>' + t.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
    return html;
  }

  window.copyCodeBlock = function(btn) {
    var wrapper = btn.closest('.code-block-wrapper');
    if (!wrapper) return;
    var code = wrapper.querySelector('code');
    if (!code) return;
    navigator.clipboard.writeText(code.textContent).catch(function() {});
    btn.classList.add('copied');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Copied';
    setTimeout(function() {
      btn.classList.remove('copied');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
    }, 2000);
  };

  // ---- Theme ----
  function initTheme() {
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    updateThemeIcon();
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
    updateThemeIcon();
  }
  function updateThemeIcon() {
    var icon = document.getElementById('theme-icon');
    if (!icon) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    icon.innerHTML = dark
      ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
      : '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
  }

  // ---- Views ----
  function switchView(view) {
    currentView = view;
    $$('.view').forEach(function(v) { v.classList.remove('active'); });
    var target = document.getElementById('view-' + view);
    if (target) target.classList.add('active');
    $$('.nav-item').forEach(function(n) { n.removeAttribute('data-active'); });
    var navBtn = document.querySelector('.nav-item[data-view="' + view + '"]');
    if (navBtn) navBtn.setAttribute('data-active', 'true');
    closeSidebar();
  }

  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').style.display = 'block';
  }
  function closeSidebar() {
    var sb = document.getElementById('sidebar');
    if (sb) sb.classList.remove('open');
    var ov = document.getElementById('sidebar-overlay');
    if (ov) ov.style.display = 'none';
  }

  // ---- Conversations ----
  function renderConversations() {
    var list = document.getElementById('conversations-list');
    list.innerHTML = '';
    var convs = NexusModel.getConversations();
    if (convs.length === 0) {
      list.innerHTML = '<div style="padding:12px;color:var(--text-faint);font-size:var(--text-xs);text-align:center;">No conversations yet</div>';
      return;
    }
    convs.forEach(function(conv) {
      var isActive = conv.id === (NexusModel.getCurrentConversation() || {}).id;
      var item = el('div', {
        class: 'conversation-item' + (isActive ? ' active' : ''),
        onclick: function() {
          NexusModel.switchConversation(conv.id);
          renderConversations();
          renderMessages();
          closeSidebar();
        }
      }, [
        el('span', { class: 'conv-icon', html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' }),
        el('span', { class: 'conv-text', text: conv.title })
      ]);
      list.appendChild(item);
    });
  }

  // ---- Messages ----
  function renderMessages() {
    var container = document.getElementById('messages');
    var conv = NexusModel.getCurrentConversation();
    if (!conv || conv.messages.length === 0) { showWelcomeScreen(); return; }
    container.innerHTML = '';
    conv.messages.forEach(function(msg) { appendMessage(msg.role, msg.content, msg.attachments, false); });
    scrollToBottom();
  }

  function showWelcomeScreen() {
    var container = document.getElementById('messages');
    container.innerHTML =
      '<div id="welcome-screen" class="welcome-screen">' +
      '<div class="welcome-logo">' +
      '<svg viewBox="0 0 120 120" fill="none" width="64" height="64">' +
      '<path d="M60 4 L116 60 L60 116 L4 60 Z" stroke="currentColor" stroke-width="2.5" fill="none"/>' +
      '<path d="M38 84 L38 36 L82 84 L82 36" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="square" stroke-linejoin="miter"/>' +
      '<circle cx="60" cy="60" r="3" fill="currentColor"/>' +
      '</svg>' +
      '</div>' +
      '<h1 class="welcome-title">DLH NEXUS</h1>' +
      '<p class="welcome-subtitle">The world\'s most advanced AI model</p>' +
      '<div class="welcome-suggestions">' +
      '<button class="suggestion-card" data-prompt="Explain quantum computing in simple terms"><span class="suggestion-icon">⚡</span><span class="suggestion-text">Explain quantum computing</span></button>' +
      '<button class="suggestion-card" data-prompt="Write a Python script for merge sort"><span class="suggestion-icon">💻</span><span class="suggestion-text">Write merge sort in Python</span></button>' +
      '<button class="suggestion-card" data-prompt="What are the latest space exploration breakthroughs?"><span class="suggestion-icon">🚀</span><span class="suggestion-text">Space exploration news</span></button>' +
      '<button class="suggestion-card" data-prompt="Create a healthy weekly meal plan"><span class="suggestion-icon">🍽️</span><span class="suggestion-text">Weekly meal plan</span></button>' +
      '</div>' +
      '</div>';
    $$('.suggestion-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var prompt = card.dataset.prompt;
        var input = document.getElementById('input');
        input.value = prompt;
        autoResize(input);
        sendMessage();
      });
    });
  }

  function appendMessage(role, content, attachments, animate) {
    var welcome = document.getElementById('welcome-screen');
    if (welcome) welcome.remove();
    var container = document.getElementById('messages');
    var msg = el('div', { class: 'message ' + role });

    var avatarText = role === 'user' ? 'YOU' : 'N';
    msg.appendChild(el('div', { class: 'message-avatar', text: avatarText }));

    var contentDiv = el('div', { class: 'message-content' });
    var roleLabel = role === 'user' ? 'You' : (role === 'bot' ? 'DLH NEXUS BOT' : 'DLH NEXUS');
    contentDiv.appendChild(el('div', { class: 'message-role', text: roleLabel }));

    if (attachments && attachments.length > 0) {
      attachments.forEach(function(att) {
        if (att.type === 'image') contentDiv.appendChild(el('img', { src: att.url, style: 'max-width:300px;border-radius:8px;margin-bottom:8px;' }));
      });
    }

    var textDiv = el('div', { class: 'message-text' });
    if (role === 'user') textDiv.textContent = content;
    else textDiv.innerHTML = renderMarkdown(content);
    contentDiv.appendChild(textDiv);

    if (role !== 'user') {
      var actions = el('div', { class: 'message-actions' });
      actions.appendChild(el('button', {
        class: 'msg-action-btn', title: 'Copy',
        onclick: function() { navigator.clipboard.writeText(content).catch(function() {}); },
        html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
      }));
      actions.appendChild(el('button', {
        class: 'msg-action-btn', title: 'Retry',
        onclick: function() { regenerateMessage(msg); },
        html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>'
      }));
      contentDiv.appendChild(actions);
    }

    msg.appendChild(contentDiv);
    container.appendChild(msg);
    if (animate !== false) scrollToBottom();
    return { msg: msg, textDiv: textDiv };
  }

  function appendThinkingMessage() {
    var welcome = document.getElementById('welcome-screen');
    if (welcome) welcome.remove();
    var container = document.getElementById('messages');
    var msg = el('div', { class: 'message assistant' });
    msg.appendChild(el('div', { class: 'message-avatar', text: 'N' }));
    var contentDiv = el('div', { class: 'message-content' });
    contentDiv.appendChild(el('div', { class: 'message-role', text: 'DLH NEXUS' }));
    var status = el('div', { class: 'processing-status', id: 'processing-status' });
    status.innerHTML = '<div class="status-line"><span class="status-dot active"></span><span class="thinking-text">DLH NEXUS MODEL is processing...</span></div>';
    contentDiv.appendChild(status);
    var textDiv = el('div', { class: 'message-text', style: 'display:none;' });
    contentDiv.appendChild(textDiv);
    msg.appendChild(contentDiv);
    container.appendChild(msg);
    scrollToBottom();
    return { msg: msg, status: status, textDiv: textDiv };
  }

  function scrollToBottom() {
    var c = document.getElementById('messages');
    c.scrollTop = c.scrollHeight;
  }

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }

  function setGenerating(isGen) {
    var sendBtn = document.getElementById('send-btn');
    var stopBtn = document.getElementById('stop-btn');
    if (sendBtn) sendBtn.style.display = isGen ? 'none' : 'flex';
    if (stopBtn) stopBtn.style.display = isGen ? 'flex' : 'none';
  }

  // ---- Send message ----
  function sendMessage() {
    var input = document.getElementById('input');
    var text = input.value.trim();
    if (!text) return;
    if (NexusModel.isBusy()) return;

    // Image mode
    if (imageMode) {
      var welcome = document.getElementById('welcome-screen');
      if (welcome) welcome.remove();
      var container = document.getElementById('messages');
      var msg = el('div', { class: 'message user' });
      msg.appendChild(el('div', { class: 'message-avatar', text: 'YOU' }));
      var cd = el('div', { class: 'message-content' });
      cd.appendChild(el('div', { class: 'message-role', text: 'You' }));
      cd.appendChild(el('div', { class: 'message-text', text: text }));
      msg.appendChild(cd);
      container.appendChild(msg);
      input.value = ''; input.style.height = 'auto'; scrollToBottom();
      var think = appendThinkingMessage();
      think.status.querySelector('.thinking-text').textContent = 'Generating image...';
      setGenerating(true);
      NexusModel.generateImage(text).then(function(url) {
        think.status.style.display = 'none';
        think.textDiv.style.display = 'block';
        if (url) think.textDiv.innerHTML = '<img src="' + url + '" alt="' + text + '" style="border-radius:8px;max-width:100%;">';
        else think.textDiv.textContent = 'Failed to generate image. Please try again.';
        setGenerating(false);
        scrollToBottom();
      }).catch(function(e) {
        think.status.style.display = 'none';
        think.textDiv.style.display = 'block';
        think.textDiv.textContent = 'Error: ' + (e.message || 'Failed to generate image');
        setGenerating(false);
        scrollToBottom();
      });
      return;
    }

    // Get/create conversation
    var conv = NexusModel.getCurrentConversation();
    if (!conv || conv.messages.length === 0) {
      conv = NexusModel.createConversation('New Conversation');
      renderConversations();
    }

    var userMsg = { role: 'user', content: text, attachments: attachedFiles.map(function(f) { return { type: 'image', url: f.url }; }) };
    conv.messages.push(userMsg);
    appendMessage('user', text, userMsg.attachments);
    input.value = ''; input.style.height = 'auto'; input.focus();

    // Generate title
    if (conv.messages.length === 1) {
      NexusModel.generateTitle(text).then(function(title) {
        NexusModel.setConversationTitle(conv.id, title);
        renderConversations();
      });
    }

    // Show thinking
    var think = appendThinkingMessage();
    setGenerating(true);

    var fullResponse = '';
    var firstChunk = true;
    var timedOut = false;
    var timeoutId = setTimeout(function() {
      if (firstChunk) {
        timedOut = true;
        think.status.style.display = 'none';
        think.textDiv.style.display = 'block';
        think.textDiv.innerHTML = renderMarkdown("The request is taking longer than expected. A sign-in window may appear — please complete sign-in and try again.");
        setGenerating(false);
      }
    }, 45000);

    var history = conv.messages.slice(0, -1).map(function(m) { return { role: m.role, content: m.content }; });
    var opts = { botMode: botMode };

    var generator;
    if (botMode) {
      generator = NexusModel.generate(text, history, opts);
    } else if (searchEnabled) {
      generator = NexusModel.searchWeb(text);
    } else {
      generator = NexusModel.generate(text, history, opts);
    }

    function processChunk() {
      generator.next().then(function(step) {
        if (step.done) {
          clearTimeout(timeoutId);
          if (!fullResponse && !timedOut) {
            fullResponse = 'I apologize, but I was unable to generate a response. Please sign in and try again.';
            think.textDiv.style.display = 'block';
            think.textDiv.innerHTML = renderMarkdown(fullResponse);
          }
          conv.messages.push({ role: 'assistant', content: fullResponse });
          var actions = el('div', { class: 'message-actions' });
          actions.appendChild(el('button', {
            class: 'msg-action-btn', title: 'Copy',
            onclick: function() { navigator.clipboard.writeText(fullResponse).catch(function() {}); },
            html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
          }));
          actions.appendChild(el('button', {
            class: 'msg-action-btn', title: 'Retry',
            onclick: function() { regenerateMessage(think.msg); },
            html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>'
          }));
          think.textDiv.parentElement.appendChild(actions);
          setGenerating(false);
          scrollToBottom();
          return;
        }

        var chunk = step.value;
        if (timedOut) return;
        if (firstChunk) {
          think.status.style.display = 'none';
          think.textDiv.style.display = 'block';
          firstChunk = false;
        }
        if (chunk != null) {
          fullResponse += String(chunk);
          think.textDiv.innerHTML = renderMarkdown(fullResponse);
        }
        scrollToBottom();
        setTimeout(processChunk, 0);
      }).catch(function(e) {
        clearTimeout(timeoutId);
        if (!timedOut) {
          think.status.style.display = 'none';
          think.textDiv.style.display = 'block';
          think.textDiv.innerHTML = renderMarkdown('Error: ' + (e.message || e));
        }
        setGenerating(false);
        scrollToBottom();
      });
    }

    processChunk();
  }

  // ---- Regenerate ----
  function regenerateMessage(msgEl) {
    var conv = NexusModel.getCurrentConversation();
    if (!conv) return;
    var lastUserIdx = -1;
    for (var i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    var lastUserMsg = conv.messages[lastUserIdx];
    var lastAssistantIdx = -1;
    for (var j = conv.messages.length - 1; j > lastUserIdx; j--) {
      if (conv.messages[j].role === 'assistant') { lastAssistantIdx = j; break; }
    }
    if (lastAssistantIdx > lastUserIdx) conv.messages.splice(lastAssistantIdx, 1);
    if (msgEl) msgEl.remove();

    var think = appendThinkingMessage();
    setGenerating(true);
    var fullResponse = '';
    var firstChunk = true;

    var history = conv.messages.slice(0, -1).map(function(m) { return { role: m.role, content: m.content }; });
    var generator = NexusModel.generate(lastUserMsg.content, history, {});

    function processChunk() {
      generator.next().then(function(step) {
        if (step.done) {
          if (!fullResponse) {
            fullResponse = 'I apologize, but I was unable to generate a response. Please try again.';
            think.textDiv.style.display = 'block';
            think.textDiv.innerHTML = renderMarkdown(fullResponse);
          }
          conv.messages.push({ role: 'assistant', content: fullResponse });
          setGenerating(false);
          scrollToBottom();
          return;
        }
        var chunk = step.value;
        if (firstChunk) {
          think.status.style.display = 'none';
          think.textDiv.style.display = 'block';
          firstChunk = false;
        }
        if (chunk != null) {
          fullResponse += String(chunk);
          think.textDiv.innerHTML = renderMarkdown(fullResponse);
        }
        scrollToBottom();
        setTimeout(processChunk, 0);
      }).catch(function(e) {
        think.status.style.display = 'none';
        think.textDiv.style.display = 'block';
        think.textDiv.innerHTML = renderMarkdown('Error: ' + (e.message || e));
        setGenerating(false);
        scrollToBottom();
      });
    }
    processChunk();
  }

  // ---- Voice input ----
  async function startVoiceInput() {
    if (isRecording) { stopVoiceInput(); return; }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) recordingChunks.push(e.data); };
      mediaRecorder.onstop = async function() {
        var blob = new Blob(recordingChunks, { type: 'audio/webm' });
        stream.getTracks().forEach(function(t) { t.stop(); });
        isRecording = false;
        var voiceBtn = document.getElementById('voice-btn');
        voiceBtn.classList.remove('recording');
        voiceBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>';
        var input = document.getElementById('input');
        input.placeholder = 'Transcribing...';
        var text = await NexusModel.transcribeAudio(blob);
        input.placeholder = 'Message DLH NEXUS...';
        if (text) {
          input.value = (input.value ? input.value + ' ' : '') + text;
          autoResize(input);
          input.focus();
        }
      };
      mediaRecorder.start();
      isRecording = true;
      var voiceBtn = document.getElementById('voice-btn');
      voiceBtn.classList.add('recording');
      voiceBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    } catch (e) {
      // Fallback: Web Speech API
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        var recognition = new SR();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = function(e) {
          var text = e.results[0][0].transcript;
          var input = document.getElementById('input');
          input.value = (input.value ? input.value + ' ' : '') + text;
          autoResize(input);
          input.focus();
        };
        recognition.start();
        var vb = document.getElementById('voice-btn');
        vb.classList.add('recording');
        recognition.onend = function() { vb.classList.remove('recording'); };
      }
    }
  }

  function stopVoiceInput() {
    if (mediaRecorder && isRecording) mediaRecorder.stop();
  }

  // ---- File attachments ----
  function handleFiles(files) {
    Array.from(files).forEach(function(file) {
      if (file.type.startsWith('image/')) {
        var reader = new FileReader();
        reader.onload = function(e) { attachedFiles.push({ name: file.name, url: e.target.result, type: 'image', file: file }); renderAttachments(); };
        reader.readAsDataURL(file);
      } else {
        attachedFiles.push({ name: file.name, url: '', type: 'file', file: file });
        renderAttachments();
      }
    });
  }

  function renderAttachments() {
    var preview = document.getElementById('attachment-preview');
    preview.innerHTML = '';
    attachedFiles.forEach(function(file, idx) {
      var chip = el('div', { class: 'attachment-chip' });
      if (file.type === 'image') chip.appendChild(el('img', { src: file.url }));
      chip.appendChild(el('span', { text: file.name }));
      chip.appendChild(el('span', { class: 'attachment-remove', text: '×', onclick: function() { attachedFiles.splice(idx, 1); renderAttachments(); } }));
      preview.appendChild(chip);
    });
  }

  // ---- Connectors ----
  var CONNECTORS = [
    { name: 'GitHub', desc: 'Code repositories, issues, PRs', icon: '🐙' },
    { name: 'Google Drive', desc: 'Cloud storage & documents', icon: '📁' },
    { name: 'Slack', desc: 'Team messaging & channels', icon: '💬' },
    { name: 'Notion', desc: 'Notes, docs & wikis', icon: '📝' },
    { name: 'Gmail', desc: 'Email & communications', icon: '📧' },
    { name: 'Google Calendar', desc: 'Events & scheduling', icon: '📅' },
    { name: 'Spotify', desc: 'Music & podcasts', icon: '🎵' },
    { name: 'YouTube', desc: 'Video & streaming', icon: '📺' },
    { name: 'X / Twitter', desc: 'Social media & posts', icon: '🐦' },
    { name: 'Instagram', desc: 'Photo & video sharing', icon: '📸' },
    { name: 'Facebook', desc: 'Social network', icon: '👥' },
    { name: 'WhatsApp', desc: 'Messaging & calls', icon: '🟢' },
    { name: 'Telegram', desc: 'Secure messaging', icon: '✈️' },
    { name: 'Discord', desc: 'Community & voice chat', icon: '🎮' },
    { name: 'Zoom', desc: 'Video meetings', icon: '🎥' },
    { name: 'Google Maps', desc: 'Maps & navigation', icon: '🗺️' },
    { name: 'Weather', desc: 'Weather forecasts', icon: '🌤️' },
    { name: 'News API', desc: 'Latest news & headlines', icon: '📰' },
    { name: 'Stock Market', desc: 'Stocks & trading data', icon: '📈' },
    { name: 'Stripe', desc: 'Payments & billing', icon: '💳' },
    { name: 'Shopify', desc: 'E-commerce store', icon: '🛒' },
    { name: 'Amazon', desc: 'Product search & shopping', icon: '📦' },
    { name: 'Netflix', desc: 'Movies & TV shows', icon: '🎬' },
    { name: 'ChatGPT', desc: 'AI chat integration', icon: '🤖' },
    { name: 'Claude', desc: 'AI assistant', icon: '🧠' },
    { name: 'Midjourney', desc: 'AI image generation', icon: '🎨' },
    { name: 'Figma', desc: 'Design & prototyping', icon: '🖌️' },
    { name: 'Adobe', desc: 'Creative suite', icon: '✨' },
    { name: 'Canva', desc: 'Graphic design', icon: '🖼️' },
    { name: 'VS Code', desc: 'Code editor integration', icon: '💻' },
    { name: 'Docker', desc: 'Container management', icon: '🐳' },
    { name: 'AWS', desc: 'Cloud computing', icon: '☁️' },
    { name: 'Google Cloud', desc: 'Cloud infrastructure', icon: '🌩️' },
    { name: 'Azure', desc: 'Microsoft cloud', icon: '🔷' },
    { name: 'Vercel', desc: 'Deploy & hosting', icon: '▲' },
    { name: 'Linear', desc: 'Issue tracking', icon: '📐' },
    { name: 'Jira', desc: 'Project management', icon: '🎯' },
    { name: 'Trello', desc: 'Kanban boards', icon: '📋' },
    { name: 'Asana', desc: 'Team tasks', icon: '✅' },
    { name: 'Airtable', desc: 'Database & spreadsheets', icon: '📊' },
    { name: 'Reddit', desc: 'Community forums', icon: '🔴' },
    { name: 'LinkedIn', desc: 'Professional network', icon: '💼' },
    { name: 'Pinterest', desc: 'Visual discovery', icon: '📌' },
    { name: 'TikTok', desc: 'Short videos', icon: '🎵' },
    { name: 'Twitch', desc: 'Live streaming', icon: '🎮' },
    { name: 'Apple Music', desc: 'Music streaming', icon: '🎶' },
    { name: 'Yelp', desc: 'Business reviews', icon: '⭐' },
    { name: 'Uber', desc: 'Ride sharing', icon: '🚗' },
    { name: 'DoorDash', desc: 'Food delivery', icon: '🍽️' },
    { name: 'Wikipedia', desc: 'Encyclopedia', icon: '📚' },
    { name: 'Stack Overflow', desc: 'Developer Q&A', icon: '💻' },
    { name: 'Medium', desc: 'Articles & blogs', icon: '✍️' },
    { name: 'Substack', desc: 'Newsletter publishing', icon: '📧' },
    { name: 'OpenAI', desc: 'AI models & API', icon: '🔬' },
    { name: 'Hugging Face', desc: 'ML models', icon: '🤗' },
    { name: 'Replicate', desc: 'AI model hosting', icon: '🔄' },
    { name: 'Supabase', desc: 'Database & auth', icon: '⚡' },
    { name: 'Firebase', desc: 'App platform', icon: '🔥' },
    { name: 'MongoDB', desc: 'NoSQL database', icon: '🍃' },
    { name: 'PostgreSQL', desc: 'SQL database', icon: '🐘' },
    { name: 'Redis', desc: 'In-memory cache', icon: '🔴' },
    { name: 'Cloudflare', desc: 'CDN & security', icon: '🌐' },
    { name: 'DigitalOcean', desc: 'Cloud servers', icon: '🌊' },
    { name: 'Render', desc: 'App hosting', icon: '🎨' },
    { name: 'Heroku', desc: 'PaaS hosting', icon: '💜' },
    { name: 'Sentry', desc: 'Error tracking', icon: '🔍' },
    { name: 'Datadog', desc: 'Monitoring & logs', icon: '🐕' },
    { name: 'Postman', desc: 'API testing', icon: '📮' },
    { name: 'GitLab', desc: 'DevOps platform', icon: '🦊' },
    { name: 'Bitbucket', desc: 'Git repository', icon: '🪣' },
    { name: 'Netlify', desc: 'Static hosting', icon: '🌐' }
  ];

  function renderConnectors() {
    var grid = document.getElementById('connectors-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var searchInput = document.getElementById('connector-search');
    var search = searchInput ? searchInput.value.toLowerCase() : '';
    var filtered = search
      ? CONNECTORS.filter(function(c) { return c.name.toLowerCase().indexOf(search) >= 0 || c.desc.toLowerCase().indexOf(search) >= 0; })
      : CONNECTORS;

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-faint);">No connectors found</div>';
      return;
    }

    filtered.forEach(function(c) {
      var card = el('div', { class: 'connector-card' });
      card.appendChild(el('div', { class: 'connector-icon', text: c.icon }));
      var info = el('div', { class: 'connector-info' });
      info.appendChild(el('div', { class: 'connector-name', text: c.name }));
      info.appendChild(el('div', { class: 'connector-desc', text: c.desc }));
      card.appendChild(info);
      var connectBtn = el('div', { class: 'connector-status' }, [
        el('span', { class: 'status-dot done' }),
        el('span', { text: 'Connect' })
      ]);
      connectBtn.style.cursor = 'pointer';
      connectBtn.addEventListener('click', async function() {
        var statusSpan = connectBtn.querySelector('span:last-child');
        var dotSpan = connectBtn.querySelector('.status-dot');
        if (statusSpan) statusSpan.textContent = 'Connecting...';
        if (dotSpan) dotSpan.className = 'status-dot active';
        var success = await NexusModel.signIn();
        updateAuthStatus();
        if (success) {
          if (statusSpan) statusSpan.textContent = 'Connected';
          if (dotSpan) dotSpan.className = 'status-dot done';
          connectBtn.classList.add('connected');
        } else {
          if (statusSpan) statusSpan.textContent = 'Sign In Required';
          if (dotSpan) dotSpan.className = 'status-dot';
          setTimeout(function() {
            if (statusSpan) statusSpan.textContent = 'Connect';
            if (dotSpan) dotSpan.className = 'status-dot done';
          }, 3000);
        }
      });
      card.appendChild(connectBtn);
      grid.appendChild(card);
    });
  }

  // ---- Device Control ----
  var DEVICES = [
    { name: 'Camera', desc: 'Access device camera', icon: 'camera', action: async function(o) {
      try { var s = await navigator.mediaDevices.getUserMedia({ video: true }); o.textContent = 'Camera active'; o.classList.add('visible'); setTimeout(function() { s.getTracks().forEach(function(t) { t.stop(); }); }, 3000); }
      catch { o.textContent = 'Camera access denied'; o.classList.add('visible'); }
    }},
    { name: 'Microphone', desc: 'Record audio', icon: 'mic', action: async function(o) {
      try { var s = await navigator.mediaDevices.getUserMedia({ audio: true }); o.textContent = 'Microphone active'; o.classList.add('visible'); setTimeout(function() { s.getTracks().forEach(function(t) { t.stop(); }); o.textContent = 'Microphone stopped'; }, 3000); }
      catch { o.textContent = 'Microphone access denied'; o.classList.add('visible'); }
    }},
    { name: 'Geolocation', desc: 'Get device location', icon: 'location', action: async function(o) {
      if (!navigator.geolocation) { o.textContent = 'Not supported'; o.classList.add('visible'); return; }
      navigator.geolocation.getCurrentPosition(function(p) { o.textContent = 'Lat: ' + p.coords.latitude.toFixed(4) + ', Lng: ' + p.coords.longitude.toFixed(4); o.classList.add('visible'); }, function() { o.textContent = 'Location access denied'; o.classList.add('visible'); });
    }},
    { name: 'Screen Share', desc: 'Share device screen', icon: 'screen', action: async function(o) {
      try { var s = await navigator.mediaDevices.getDisplayMedia({ video: true }); o.textContent = 'Screen sharing started'; o.classList.add('visible'); setTimeout(function() { s.getTracks().forEach(function(t) { t.stop(); }); o.textContent = 'Screen sharing stopped'; }, 5000); }
      catch { o.textContent = 'Screen share denied'; o.classList.add('visible'); }
    }},
    { name: 'Clipboard', desc: 'Read/write clipboard', icon: 'clipboard', action: async function(o) {
      try { await navigator.clipboard.writeText('DLH NEXUS'); var t = await navigator.clipboard.readText(); o.textContent = 'Clipboard: "' + t + '"'; o.classList.add('visible'); }
      catch { o.textContent = 'Clipboard access denied'; o.classList.add('visible'); }
    }},
    { name: 'Notifications', desc: 'Send system notifications', icon: 'bell', action: async function(o) {
      if (!('Notification' in window)) { o.textContent = 'Not supported'; o.classList.add('visible'); return; }
      var p = await Notification.requestPermission();
      if (p === 'granted') { new Notification('DLH NEXUS', { body: 'Device control active' }); o.textContent = 'Notification sent'; }
      else o.textContent = 'Permission denied';
      o.classList.add('visible');
    }},
    { name: 'Battery', desc: 'Check battery status', icon: 'battery', action: async function(o) {
      if (!navigator.getBattery) { o.textContent = 'Not supported'; o.classList.add('visible'); return; }
      try { var b = await navigator.getBattery(); o.textContent = 'Battery: ' + Math.round(b.level * 100) + '%' + (b.charging ? ' (charging)' : ''); o.classList.add('visible'); }
      catch { o.textContent = 'Battery info unavailable'; o.classList.add('visible'); }
    }},
    { name: 'Network', desc: 'Check connection status', icon: 'wifi', action: async function(o) {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!c) { o.textContent = 'Online: ' + navigator.onLine; }
      else o.textContent = 'Type: ' + (c.effectiveType || 'unknown') + ', Downlink: ' + c.downlink + 'Mbps';
      o.classList.add('visible');
    }},
    { name: 'Vibration', desc: 'Trigger vibration (mobile)', icon: 'vibrate', action: async function(o) {
      if (!navigator.vibrate) { o.textContent = 'Not supported'; o.classList.add('visible'); return; }
      navigator.vibrate([100, 50, 100, 50, 200]); o.textContent = 'Vibration sent'; o.classList.add('visible');
    }},
    { name: 'Page Visibility', desc: 'Monitor tab focus state', icon: 'visibility', action: async function(o) {
      o.textContent = 'Tab state: ' + document.visibilityState + ', Hidden: ' + (document.hidden ? 'Yes' : 'No'); o.classList.add('visible');
    }},
    { name: 'Device Info', desc: 'Get hardware & software info', icon: 'info', action: async function(o) {
      var info = ['Platform: ' + (navigator.platform || 'Unknown'), 'Language: ' + navigator.language, 'Cores: ' + (navigator.hardwareConcurrency || 'Unknown'), 'Memory: ' + (navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'Unknown'), 'Screen: ' + screen.width + 'x' + screen.height, 'Touch: ' + ('ontouchstart' in window ? 'Yes' : 'No'), 'Online: ' + navigator.onLine];
      o.textContent = info.join('\n'); o.classList.add('visible');
    }},
    { name: 'Wake Lock', desc: 'Prevent screen from sleeping', icon: 'lock', action: async function(o) {
      if (!navigator.wakeLock) { o.textContent = 'Not supported'; o.classList.add('visible'); return; }
      try { var l = await navigator.wakeLock.request('screen'); o.textContent = 'Wake lock activated'; o.classList.add('visible'); setTimeout(function() { l.release(); o.textContent = 'Wake lock released'; }, 10000); }
      catch { o.textContent = 'Wake lock failed'; o.classList.add('visible'); }
    }}
  ];

  function renderDevices() {
    var grid = document.getElementById('device-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var icons = {
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
    DEVICES.forEach(function(d) {
      var card = el('div', { class: 'device-card' });
      card.appendChild(el('div', { class: 'device-header' }, [
        el('div', { class: 'device-icon', html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + (icons[d.icon] || icons.info) + '</svg>' }),
        el('div', { class: 'device-name', text: d.name })
      ]));
      card.appendChild(el('div', { class: 'device-desc', text: d.desc }));
      var output = el('div', { class: 'device-output' });
      var btn = el('button', { class: 'device-btn', text: 'Activate', onclick: async function() {
        btn.disabled = true; btn.textContent = 'Working...';
        await d.action(output);
        btn.disabled = false; btn.textContent = 'Activate';
      }});
      card.appendChild(btn);
      card.appendChild(output);
      grid.appendChild(card);
    });
  }

  // ---- Auth status ----
  function updateAuthStatus() {
    var btn = document.getElementById('auth-btn');
    var signOutBtn = document.getElementById('sign-out-btn');
    if (!btn) return;
    var text = btn.querySelector('.auth-text');
    var dot = btn.querySelector('.auth-dot');
    var status = NexusModel.getAuthStatus();
    if (status === 'offline') {
      btn.className = 'auth-btn disconnected';
      if (text) text.textContent = 'AI Offline';
      if (dot) dot.className = 'auth-dot';
      if (signOutBtn) signOutBtn.style.display = 'none';
      return;
    }
    if (status === 'signed-in') {
      btn.className = 'auth-btn ready';
      if (text) text.textContent = 'Signed In';
      if (dot) dot.className = 'auth-dot active';
      if (signOutBtn) signOutBtn.style.display = 'flex';
    } else {
      btn.className = 'auth-btn ready';
      if (text) text.textContent = 'Ready';
      if (dot) dot.className = 'auth-dot active';
      if (signOutBtn) signOutBtn.style.display = 'none';
    }
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
    $$('.nav-item').forEach(function(item) { item.addEventListener('click', function() { switchView(item.dataset.view); }); });

    // New chat
    document.getElementById('new-chat-btn').addEventListener('click', function() {
      NexusModel.createConversation();
      renderConversations();
      showWelcomeScreen();
      switchView('chat');
    });

    // Sidebar overlay
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    // Menu toggle (hamburger for mobile)
    var menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', function() {
        var sb = document.getElementById('sidebar');
        if (sb) sb.classList.toggle('open');
        var ov = document.getElementById('sidebar-overlay');
        if (ov) ov.style.display = sb && sb.classList.contains('open') ? 'block' : 'none';
      });
    }

    // Auth button (sign in)
    var authBtn = document.getElementById('auth-btn');
    if (authBtn) {
      authBtn.addEventListener('click', async function() {
        var status = NexusModel.getAuthStatus();
        if (status === 'signed-in') return; // Already signed in
        var text = authBtn.querySelector('.auth-text');
        var originalText = text ? text.textContent : '';
        if (text) text.textContent = 'Signing in...';
        var success = await NexusModel.signIn();
        updateAuthStatus();
        if (text && !success) {
          text.textContent = 'Sign In Required';
          setTimeout(function() { updateAuthStatus(); }, 3000);
        }
      });
    }

    // Theme
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // BOT MODE toggle
    document.getElementById('bot-mode-toggle').addEventListener('click', function() {
      botMode = !botMode;
      document.getElementById('bot-mode-toggle').classList.toggle('active', botMode);
      var input = document.getElementById('input');
      if (botMode) {
        input.placeholder = 'Give NEXUS BOT a task...';
        var indicator = document.querySelector('.bot-mode-indicator');
        if (!indicator) {
          indicator = el('div', { class: 'bot-mode-indicator active' });
          indicator.innerHTML = '<span class="bot-dot"></span><span>BOT MODE ACTIVE — NEXUS BOT will execute tasks autonomously</span>';
          document.getElementById('messages').insertBefore(indicator, document.getElementById('messages').firstChild);
        }
        indicator.classList.add('active');
      } else {
        input.placeholder = 'Message DLH NEXUS...';
        var ind = document.querySelector('.bot-mode-indicator');
        if (ind) ind.remove();
      }
    });

    // Sign out
    document.getElementById('sign-out-btn').addEventListener('click', async function() {
      var text = document.getElementById('auth-btn').querySelector('.auth-text');
      var originalText = text ? text.textContent : '';
      if (text) text.textContent = 'Signing out...';
      await NexusModel.signOut();
      updateAuthStatus();
    });

    // Chat input
    var input = document.getElementById('input');
    input.addEventListener('input', function() { autoResize(input); });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('stop-btn').addEventListener('click', function() { NexusModel.stop(); });

    // Voice input
    document.getElementById('voice-btn').addEventListener('click', startVoiceInput);

    // File attachment
    document.getElementById('attach-btn').addEventListener('click', function() { document.getElementById('file-input').click(); });
    document.getElementById('file-input').addEventListener('change', function(e) { handleFiles(e.target.files); e.target.value = ''; });

    // Drag and drop
    document.getElementById('messages').addEventListener('dragover', function(e) { e.preventDefault(); });
    document.getElementById('messages').addEventListener('drop', function(e) { e.preventDefault(); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); });

    // Search toggle
    document.getElementById('search-toggle').addEventListener('click', function() {
      searchEnabled = !searchEnabled;
      document.getElementById('search-toggle').classList.toggle('active', searchEnabled);
    });

    // Image toggle
    document.getElementById('image-toggle').addEventListener('click', function() {
      imageMode = !imageMode;
      document.getElementById('image-toggle').classList.toggle('active', imageMode);
      input.placeholder = imageMode ? 'Describe an image to generate...' : 'Message DLH NEXUS...';
    });

    // Connector search
    var cs = document.getElementById('connector-search');
    if (cs) cs.addEventListener('input', renderConnectors);

    // Settings
    var ts = document.getElementById('temp-slider');
    if (ts) ts.addEventListener('input', function(e) {});
    var mt = document.getElementById('max-tokens-input');
    if (mt) mt.addEventListener('change', function(e) {});
    var fs = document.getElementById('font-size-select');
    if (fs) fs.addEventListener('change', function(e) { document.documentElement.setAttribute('data-font-size', e.target.value); });
    var st = document.getElementById('settings-theme-toggle');
    if (st) st.addEventListener('click', toggleTheme);

    // Suggestion cards
    $$('.suggestion-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var prompt = card.dataset.prompt;
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
