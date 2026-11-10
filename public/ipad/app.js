/* DCAM CRM for Safari / iOS 9. ES5 only; same-origin NextAuth session. */
(function () {
  'use strict';

  var state = { contacts: [], selectedId: null, tab: 'chat', contactLimit: 70,
    messageLimit: 70, session: null, busy: false, timer: null, generation: 0,
    messageKey: '', filterKey: '', filterValue: '', searchTimer: null,
    drafts: {}, sendStatus: {}, sending: false, sendingId: null };
  var ids = ['login', 'app', 'login-form', 'username', 'password', 'login-error',
    'login-button', 'sync', 'refresh', 'menu-button', 'menu', 'user-name',
    'logout', 'total', 'quoted', 'closed', 'notice', 'workspace', 'search',
    'filter', 'result-count', 'contacts', 'more-contacts', 'list-info',
    'welcome', 'selected', 'client-avatar', 'client-name', 'client-phone',
    'client-status', 'chat-tab', 'file-tab', 'sol-state', 'messages',
    'client-file', 'back', 'install-login', 'install-app', 'install-dialog',
    'close-install', 'reply-form', 'reply-text', 'send-button', 'send-status'];
  var ui = {}, i;
  for (i = 0; i < ids.length; i += 1) { ui[ids[i]] = document.getElementById(ids[i]); }

  function text(node, value) { node.textContent = value === null || value === undefined ? '' : String(value); }
  function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }
  function show(node, yes) { node.className = node.className.replace(/\s*hidden\b/g, '') + (yes ? '' : ' hidden'); }
  function make(tag, className, value) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (value !== undefined) { text(node, value); }
    return node;
  }
  function lower(value) { return String(value || '').toLowerCase(); }
  function initial(name) {
    var parts = String(name || '?').replace(/^\s+|\s+$/g, '').split(/\s+/);
    return ((parts[0] || '?').charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
  }
  function statusClass(status) {
    var value = lower(status);
    return value.indexOf('cotiz') !== -1 ? 'status quote' :
      (value.indexOf('falt') !== -1 || value.indexOf('entr') !== -1 || value.indexOf('nuevo') !== -1 ? 'status pending' : 'status');
  }
  function formEncode(data) {
    var pairs = [], key;
    for (key in data) { if (Object.prototype.hasOwnProperty.call(data, key)) {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key]));
    } }
    return pairs.join('&');
  }
  function request(method, path, data, callback, options) {
    var xhr = new XMLHttpRequest(), ended = false, watchdog, timeout = options && options.timeout || 22000;
    function finish(error, value) {
      if (!ended) { ended = true; if (watchdog) { window.clearTimeout(watchdog); } callback(error, value); }
    }
    /* Safari 9 may cache GET responses aggressively. Keep session and CRM reads fresh. */
    if (method === 'GET') { path += (path.indexOf('?') === -1 ? '?' : '&') + '_dcam=' + new Date().getTime(); }
    xhr.open(method, path, true);
    xhr.timeout = timeout;
    xhr.setRequestHeader('Accept', 'application/json');
    if (data !== null) { xhr.setRequestHeader('Content-Type', options && options.json ? 'application/json' : 'application/x-www-form-urlencoded'); }
    xhr.onreadystatechange = function () {
      var parsed;
      if (xhr.readyState !== 4) { return; }
      if (xhr.status === 401 || xhr.status === 403) {
        finish({ auth: true, message: 'Tu sesión venció. Ingresá nuevamente.' }); return;
      }
      try { parsed = JSON.parse(xhr.responseText); } catch (ignore) {
        finish({ message: 'El CRM no devolvió una respuesta válida. Comprobá que crm.dechinaalmundo.com.ar esté disponible.', uncertain: !!(options && options.json) || xhr.status === 0 }); return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        finish({ message: 'El CRM devolvió un error (' + xhr.status + '). Intentá nuevamente.', status: xhr.status, uncertain: xhr.status >= 500 }); return;
      }
      finish(null, parsed);
    };
    xhr.onerror = function () { finish({ message: 'Sin conexión con el CRM. Revisá Internet y tocá Actualizar.', uncertain: true }); };
    xhr.ontimeout = function () { finish({ message: 'El CRM está tardando en responder. Intentá nuevamente.', uncertain: true }); };
    /* A second deadline also covers old WebKit versions that miss XHR timeout events. */
    watchdog = window.setTimeout(function () {
      finish({ message: 'El CRM está tardando en responder. Intentá nuevamente.', uncertain: true });
      xhr.abort();
    }, timeout + 1000);
    xhr.send(data === null ? null : options && options.json ? JSON.stringify(data) : formEncode(data));
  }
  function loginScreen(message) {
    state.generation += 1;
    state.session = null;
    state.contacts = [];
    state.selectedId = null;
    state.messageKey = '';
    state.filterKey = '';
    state.busy = false;
    state.drafts = {}; state.sendStatus = {}; state.sending = false; state.sendingId = null;
    ui['reply-text'].value = '';
    if (state.timer) { window.clearTimeout(state.timer); state.timer = null; }
    clear(ui.contacts); clear(ui.messages); clear(ui['client-file']);
    text(ui['client-name'], ''); text(ui['client-phone'], ''); text(ui['user-name'], '');
    text(ui.total, '—'); text(ui.quoted, '—'); text(ui.closed, '—');
    ui.search.value = ''; state.filterValue = ''; ui['menu-button'].setAttribute('aria-expanded', 'false');
    show(ui.menu, false); show(ui.app, false); show(ui.login, true);
    ui['login-button'].disabled = false; text(ui['login-button'], 'Ingresar al CRM');
    text(ui['login-error'], message || ''); ui.password.value = '';
  }
  function enter(session) {
    state.session = session;
    show(ui.login, false); show(ui.app, true);
    text(ui['user-name'], session.user.name || session.user.email || 'Mi cuenta');
    loadContacts(false);
  }
  function schedule() {
    if (state.timer) { window.clearTimeout(state.timer); }
    if (state.session && !document.hidden) {
      state.timer = window.setTimeout(function () { loadContacts(false); }, 30000);
    }
  }
  function notify(message) {
    text(ui.notice, message || ''); show(ui.notice, !!message);
    ui.app.className = message ? 'app has-notice' : 'app';
  }
  function loadContacts(manual) {
    var generation = state.generation;
    if (state.busy || !state.session || (!manual && document.hidden)) { schedule(); return; }
    state.busy = true; ui.refresh.disabled = true;
    text(ui.sync, 'Actualizando…');
    request('GET', '/api/conversations', null, function (error, data) {
      var now;
      if (generation !== state.generation) { return; }
      state.busy = false; ui.refresh.disabled = false;
      if (error && error.auth) { loginScreen(error.message); return; }
      if (error || Object.prototype.toString.call(data) !== '[object Array]') {
        notify((error && error.message) || 'No se pudieron cargar las conversaciones.');
        text(ui.sync, 'Sin actualizar'); ui.sync.className = 'sync error';
        if (!state.contacts.length) { clear(ui.contacts); ui.contacts.appendChild(make('p', 'empty', 'No se pudieron cargar los clientes. Tocá Actualizar para reintentar.')); }
        /* Failed requests require explicit retry; do not hammer the server. */
        if (state.timer) { window.clearTimeout(state.timer); state.timer = null; }
        return;
      }
      state.contacts = data;
      notify(''); renderSummary(); renderFilters(); renderContacts(); renderSelected(false);
      now = new Date();
      text(ui.sync, 'Actualizado ' + pad(now.getHours()) + ':' + pad(now.getMinutes()));
      ui.sync.className = 'sync'; schedule();
    });
  }
  function pad(value) { return value < 10 ? '0' + value : String(value); }
  function renderSummary() {
    var quoted = 0, closed = 0, j, status;
    for (j = 0; j < state.contacts.length; j += 1) {
      status = lower(state.contacts[j].status);
      if (status.indexOf('cotiz') !== -1) { quoted += 1; }
      if (status === 'cliente cerrado' || status === 'cliente finalizado' || status === 'cerrado') { closed += 1; }
    }
    text(ui.total, state.contacts.length); text(ui.quoted, quoted); text(ui.closed, closed);
  }
  function renderFilters() {
    var list = [], j, status, option, key;
    for (j = 0; j < state.contacts.length; j += 1) {
      status = state.contacts[j].status;
      if (status && list.indexOf(status) === -1) { list.push(status); }
    }
    list.sort(); key = JSON.stringify(list);
    if (key === state.filterKey) { return; }
    state.filterKey = key; clear(ui.filter);
    option = make('option', '', 'Todos los estados'); option.value = ''; ui.filter.appendChild(option);
    for (j = 0; j < list.length; j += 1) {
      option = make('option', '', list[j]); option.value = list[j]; ui.filter.appendChild(option);
    }
    if (list.indexOf(state.filterValue) === -1) { state.filterValue = ''; }
    ui.filter.value = state.filterValue;
  }
  function filteredContacts() {
    var result = [], q = lower(ui.search.value).replace(/^\s+|\s+$/g, ''), j, c;
    for (j = 0; j < state.contacts.length; j += 1) {
      c = state.contacts[j];
      if (state.filterValue && c.status !== state.filterValue) { continue; }
      if (q && lower((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.lastMessage || '')).indexOf(q) === -1) { continue; }
      result.push(c);
    }
    return result;
  }
  function renderContacts() {
    var data = filteredContacts(), j, c, button, oldTop = ui.contacts.scrollTop;
    clear(ui.contacts); text(ui['result-count'], data.length);
    for (j = 0; j < Math.min(data.length, state.contactLimit); j += 1) {
      c = data[j]; button = make('button', 'contact' + (String(c.id) === state.selectedId ? ' active' : ''));
      button.type = 'button'; button.setAttribute('data-id', String(c.id));
      button.setAttribute('aria-pressed', String(c.id) === state.selectedId ? 'true' : 'false');
      button.appendChild(make('span', 'avatar', initial(c.name || c.phone)));
      button.appendChild(make('strong', '', c.name || c.phone || 'Sin nombre'));
      button.appendChild(make('time', '', c.time || ''));
      button.appendChild(make('span', 'snippet', c.lastMessage || 'Sin mensajes'));
      button.appendChild(make('span', statusClass(c.status), c.status || 'Sin estado'));
      ui.contacts.appendChild(button);
    }
    if (!data.length) { ui.contacts.appendChild(make('p', 'empty', state.contacts.length ? 'No hay clientes que coincidan con la búsqueda.' : 'Todavía no hay conversaciones para tu cuenta.')); }
    show(ui['more-contacts'], data.length > state.contactLimit);
    text(ui['list-info'], data.length > state.contactLimit ? '' : data.length + (data.length === 1 ? ' conversación' : ' conversaciones'));
    ui.contacts.scrollTop = oldTop;
  }
  function selectedContact() {
    var j;
    for (j = 0; j < state.contacts.length; j += 1) {
      if (String(state.contacts[j].id) === state.selectedId) { return state.contacts[j]; }
    }
    return null;
  }
  function choose(id) {
    if (id !== state.selectedId) { state.messageLimit = 70; state.messageKey = ''; }
    state.selectedId = id; state.tab = 'chat';
    ui.workspace.className = 'workspace show-detail';
    renderContacts(); renderSelected(true);
  }
  function renderSelected(force) {
    var c = selectedContact();
    show(ui.welcome, !c); show(ui.selected, !!c);
    if (!c) { clear(ui.messages); clear(ui['client-file']); state.messageKey = ''; show(ui['reply-form'], false); return; }
    text(ui['client-avatar'], initial(c.name || c.phone));
    text(ui['client-name'], c.name || c.phone || 'Sin nombre');
    text(ui['client-phone'], c.phone ? '+' + String(c.phone).replace(/^\+/, '') : 'Teléfono no informado');
    text(ui['client-status'], c.status || 'Sin estado'); ui['client-status'].className = statusClass(c.status);
    text(ui['sol-state'], c.botActive === false ? 'SOL pausada' : 'SOL activa');
    ui['chat-tab'].className = state.tab === 'chat' ? 'active' : '';
    ui['file-tab'].className = state.tab === 'file' ? 'active' : '';
    ui['chat-tab'].setAttribute('aria-pressed', state.tab === 'chat' ? 'true' : 'false');
    ui['file-tab'].setAttribute('aria-pressed', state.tab === 'file' ? 'true' : 'false');
    show(ui.messages, state.tab === 'chat'); show(ui['client-file'], state.tab === 'file');
    show(ui['reply-form'], state.tab === 'chat'); renderComposer(c);
    if (state.tab === 'chat') { renderMessages(c, force); } else { renderFile(c); }
  }
  function renderComposer(c) {
    var id = String(c.id), status = state.sendStatus[id], value = state.drafts[id] || '', canSend = !!(c.phone || c.jid);
    if (ui['reply-text'].value !== value) { ui['reply-text'].value = value; }
    ui['reply-text'].disabled = !canSend || state.sending && state.sendingId === id;
    ui['send-button'].disabled = !canSend || state.sending || !value.replace(/^\s+|\s+$/g, '');
    text(ui['send-button'], state.sending && state.sendingId === id ? 'Enviando…' : 'Enviar');
    text(ui['send-status'], !canSend ? 'Este cliente no tiene un número de WhatsApp registrado.' : status ? status.message : 'Tu respuesta se envía por WhatsApp.');
    ui['send-status'].className = 'send-status' + (status && status.kind ? ' ' + status.kind : '');
  }
  ui['reply-text'].oninput = function () {
    var c = selectedContact(), id;
    if (!c) { return; }
    id = String(c.id); state.drafts[id] = ui['reply-text'].value;
    if (!state.sending && state.sendStatus[id] && state.sendStatus[id].kind === 'success') { delete state.sendStatus[id]; }
    renderComposer(c);
  };
  ui['reply-form'].onsubmit = function (event) {
    var c = selectedContact(), id, message, generation = state.generation;
    event.preventDefault();
    if (!c || state.sending || (!c.phone && !c.jid)) { return; }
    id = String(c.id); message = (state.drafts[id] || '').replace(/^\s+|\s+$/g, '');
    if (!message || message.length > 12000) { return; }
    state.sending = true; state.sendingId = id;
    state.sendStatus[id] = { message: 'Enviando por WhatsApp…' }; renderComposer(c);
    request('POST', '/api/send-message', {
      phone: c.phone || c.jid, jid: c.jid || null, message: message, contactId: c.id
    }, function (error, result) {
      var current;
      if (generation !== state.generation) { return; }
      state.sending = false; state.sendingId = null;
      if (error && error.auth) { loginScreen('Tu sesión venció. Ingresá nuevamente para responder.'); return; }
      if (error || !result || result.success !== true) {
        state.sendStatus[id] = { kind: 'error', message: error && error.uncertain ?
          'No pudimos confirmar el envío. Revisá el historial antes de reintentar.' :
          'No se pudo enviar. Tu respuesta sigue guardada acá; revisá la conexión de WhatsApp y reintentá.' };
      } else {
        state.drafts[id] = '';
        state.sendStatus[id] = { kind: 'success', message: 'Mensaje enviado. El historial se actualizará con la confirmación del servidor.' };
        /* The webhook records the sent message once. Do not insert or PATCH a second copy. */
        c.lastMessage = message; renderContacts(); loadContacts(true);
      }
      current = selectedContact(); if (current) { renderComposer(current); }
    }, { json: true, timeout: 45000 });
  };
  function dateLabel(value) {
    var date;
    if (!value) { return ''; }
    date = new Date(value);
    if (isNaN(date.getTime())) { return ''; }
    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear();
  }
  function media(message, bubble) {
    var path, link, audio, type, note, retry, compatible;
    if (!message.mediaId) { return; }
    path = '/api/media-file?id=' + encodeURIComponent(message.mediaId);
    type = lower(message.mediaType);
    if (type === 'image' || type.indexOf('image/') === 0) {
      link = make('a', 'media-link'); link.href = path; link.target = '_blank'; link.rel = 'noopener noreferrer';
      /* Images load only when explicitly requested, avoiding 70 downloads on an old iPad. */
      text(link, 'Ver imagen: ' + (message.mediaName || 'Abrir adjunto'));
      bubble.appendChild(link);
    } else if (type === 'audio' || type.indexOf('audio/') === 0) {
      compatible = '/api/media-audio?id=' + encodeURIComponent(message.mediaId);
      audio = make('audio'); audio.controls = true; audio.preload = 'none'; audio.src = compatible;
      audio.setAttribute('aria-label', 'Audio de WhatsApp');
      note = make('p', 'media-note', 'Tocá reproducir. La primera vez puede tardar unos segundos en preparar el MP3.');
      retry = make('button', 'small-button hidden', 'Reintentar audio'); retry.type = 'button';
      audio.onloadedmetadata = function () { text(note, 'Audio compatible con iPad.'); show(retry, false); };
      audio.onerror = function () { text(note, 'No se pudo abrir el audio. Reintentá o tocá Abrir MP3 para ver el detalle.'); show(retry, true); };
      retry.onclick = function () { text(note, 'Preparando audio…'); show(retry, false); audio.src = compatible + '&_audio=' + new Date().getTime(); audio.load(); var result = audio.play(); if (result && result['catch']) { result['catch'](function () {}); } };
      bubble.appendChild(audio);
      bubble.appendChild(note); bubble.appendChild(retry);
      link = make('a', 'media-link', 'Abrir MP3 compatible'); link.href = compatible; link.target = '_blank'; link.rel = 'noopener noreferrer'; bubble.appendChild(link);
    }
    link = make('a', 'media-link', (type === 'audio' || type.indexOf('audio/') === 0 ? 'Archivo original: ' : '') + (message.mediaName || 'Abrir archivo adjunto'));
    link.href = path; link.target = '_blank'; link.rel = 'noopener noreferrer';
    if (!(type === 'image' || type.indexOf('image/') === 0)) { bubble.appendChild(link); }
  }
  function renderMessages(c, force) {
    var all = c.messages || [], start = Math.max(0, all.length - state.messageLimit),
      key = c.id + ':' + start + ':' + JSON.stringify(all.slice(start)), j, m, row, bubble,
      day = '', label, oldTop = ui.messages.scrollTop, oldHeight = ui.messages.scrollHeight,
      atBottom = oldHeight - oldTop - ui.messages.clientHeight < 100, more;
    if (!force && key === state.messageKey) { return; }
    state.messageKey = key; clear(ui.messages);
    if (start > 0) {
      more = make('button', 'small-button load-older', 'Ver mensajes anteriores (' + start + ')'); more.type = 'button';
      more.onclick = function () {
        var before = ui.messages.scrollHeight, pos = ui.messages.scrollTop;
        state.messageLimit += 70; renderMessages(c, false);
        ui.messages.scrollTop = pos + ui.messages.scrollHeight - before;
      };
      ui.messages.appendChild(more);
    }
    if (!all.length) { ui.messages.appendChild(make('p', 'empty', 'Este cliente todavía no tiene mensajes.')); }
    for (j = start; j < all.length; j += 1) {
      m = all[j]; label = dateLabel(m.createdAt);
      if (label && label !== day) { ui.messages.appendChild(make('div', 'day', label)); day = label; }
      row = make('div', 'message-row' + (m.sender === 'me' ? ' mine' : ''));
      bubble = make('div', 'bubble');
      bubble.appendChild(make('span', 'sender', m.sender === 'me' ? 'Equipo DCAM' : m.sender === 'bot' || m.sender === 'ai' ? 'SOL' : c.name || 'Cliente'));
      if (m.text) { bubble.appendChild(make('p', '', m.text)); }
      media(m, bubble);
      if (!m.text && !m.mediaId) { bubble.appendChild(make('p', 'media-note', 'Mensaje sin texto ni archivo disponible.')); }
      bubble.appendChild(make('time', '', m.time || '')); row.appendChild(bubble); ui.messages.appendChild(row);
    }
    if (force || atBottom) { ui.messages.scrollTop = ui.messages.scrollHeight; }
    else { ui.messages.scrollTop = oldTop; }
  }
  function section(title) {
    var wrapper = make('section', 'file-section'); wrapper.appendChild(make('h3', '', title));
    wrapper.appendChild(make('dl')); ui['client-file'].appendChild(wrapper); return wrapper.lastChild;
  }
  function field(target, label, value, suffix) {
    var row = make('div', 'field'), available = value !== undefined && value !== null && value !== '';
    row.appendChild(make('dt', '', label));
    if (available && typeof value === 'object') { value = JSON.stringify(value); }
    row.appendChild(make('dd', '', available ? String(value) + (suffix || '') : 'Sin informar'));
    target.appendChild(row);
  }
  function renderFile(c) {
    var q = c.quoteData || {}, list;
    clear(ui['client-file']); list = section('Datos del cliente');
    field(list, 'Nombre', c.name); field(list, 'Teléfono', c.phone); field(list, 'Estado', c.status);
    field(list, 'Asistente SOL', c.botActive === false ? 'Pausada' : 'Activa');
    list = section('Datos de la importación');
    field(list, 'Producto / mercadería', q.product); field(list, 'Peso', q.weightKg, ' kg');
    field(list, 'Volumen', q.cbm, ' m³'); field(list, 'Valor FOB', q.goodsValue, ' USD');
    field(list, 'Modalidad de envío', q.shippingMode); field(list, 'Posición arancelaria', q.hscode);
    list = section('Cotización registrada');
    field(list, 'Flete', q.freightUSD, ' USD'); field(list, 'Seguro', q.insuranceUSD, ' USD');
    field(list, 'Derechos', q.dutiesUSD, ' USD'); field(list, 'Impuestos', q.taxesUSD, ' USD');
    field(list, 'Total logístico', q.totalLogisticsUSD, ' USD');
    if (q.notes || q.operationalNotes || q.notas) {
      list = section('Notas'); field(list, 'Observaciones', q.notes || q.operationalNotes || q.notas);
    }
  }
  ui['login-form'].onsubmit = function (event) {
    var username = ui.username.value.replace(/^\s+|\s+$/g, ''), password = ui.password.value;
    event.preventDefault();
    if (!username || !password || ui['login-button'].disabled) { return; }
    ui['login-button'].disabled = true; text(ui['login-button'], 'Ingresando…'); text(ui['login-error'], '');
    request('GET', '/api/auth/csrf', null, function (error, csrf) {
      if (error || !csrf || !csrf.csrfToken) { password = ''; loginScreen((error && error.message) || 'No se pudo iniciar el acceso.'); return; }
      request('POST', '/api/auth/callback/credentials', { csrfToken: csrf.csrfToken,
        email: username, password: password, callbackUrl: window.location.protocol + '//' + window.location.host + '/ipad/index.html', json: 'true' }, function (loginError, result) {
        password = ''; ui.password.value = '';
        if (loginError) { loginScreen(loginError.auth ? 'Usuario o contraseña incorrectos.' : loginError.message); return; }
        if (result && (result.error || /[?&]error=/.test(result.url || ''))) { loginScreen('Usuario o contraseña incorrectos.'); return; }
        request('GET', '/api/auth/session', null, function (sessionError, session) {
          if (sessionError || !session || !session.user) { loginScreen('No se pudo iniciar sesión. Comprobá tu usuario y contraseña.'); return; }
          enter(session);
        });
      });
      password = '';
    });
  };
  ui.refresh.onclick = function () { loadContacts(true); };
  ui.contacts.onclick = function (event) {
    var node = event.target;
    while (node && node !== ui.contacts) {
      if (node.getAttribute && node.getAttribute('data-id') !== null) { choose(node.getAttribute('data-id')); return; }
      node = node.parentNode;
    }
  };
  ui.search.oninput = function () {
    if (state.searchTimer) { window.clearTimeout(state.searchTimer); }
    state.searchTimer = window.setTimeout(function () { state.contactLimit = 70; ui.contacts.scrollTop = 0; renderContacts(); }, 160);
  };
  ui.filter.onchange = function () { state.filterValue = ui.filter.value; state.contactLimit = 70; ui.contacts.scrollTop = 0; renderContacts(); };
  ui['more-contacts'].onclick = function () { state.contactLimit += 70; renderContacts(); };
  ui['chat-tab'].onclick = function () { state.tab = 'chat'; renderSelected(true); };
  ui['file-tab'].onclick = function () { state.tab = 'file'; renderSelected(false); };
  ui.back.onclick = function () { ui.workspace.className = 'workspace'; };
  ui['menu-button'].onclick = function () {
    var open = ui.menu.className.indexOf('hidden') !== -1;
    show(ui.menu, open); ui['menu-button'].setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  function install() {
    show(ui['install-dialog'], true); show(ui.menu, false);
    ui['menu-button'].setAttribute('aria-expanded', 'false'); ui['close-install'].focus();
  }
  ui['install-login'].onclick = install; ui['install-app'].onclick = install;
  ui['close-install'].onclick = function () { show(ui['install-dialog'], false); (state.session ? ui['install-app'] : ui['install-login']).focus(); };
  ui.logout.onclick = function () {
    ui.logout.disabled = true;
    request('GET', '/api/auth/csrf', null, function (error, csrf) {
      if (error || !csrf || !csrf.csrfToken) { ui.logout.disabled = false; notify('No se pudo cerrar la sesión. Intentá nuevamente.'); return; }
      request('POST', '/api/auth/signout', { csrfToken: csrf.csrfToken, callbackUrl: '/ipad/index.html', json: 'true' }, function (signoutError) {
        ui.logout.disabled = false;
        if (signoutError) { notify('No se pudo cerrar la sesión. Intentá nuevamente.'); return; }
        loginScreen('');
      });
    });
  };
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (state.timer) { window.clearTimeout(state.timer); state.timer = null; } }
    else if (state.session) { loadContacts(true); }
  }, false);
  window.addEventListener('online', function () { if (state.session) { loadContacts(true); } }, false);
  window.addEventListener('offline', function () { if (state.session) { notify('Sin Internet. Estás viendo la última consulta; los datos pueden haber cambiado.'); } }, false);
  document.addEventListener('keydown', function (event) { if (event.keyCode === 27) { show(ui['install-dialog'], false); show(ui.menu, false); } }, false);
  if (window.location.protocol === 'file:') {
    loginScreen('Esta app debe subirse a la carpeta public/ipad del CRM. Abrí después https://crm.dechinaalmundo.com.ar/ipad/index.html en Safari.');
    ui['login-button'].disabled = true;
  } else {
    request('GET', '/api/auth/session', null, function (error, session) {
      if (error) { loginScreen(error.auth ? '' : error.message); }
      else if (session && session.user) { enter(session); }
      else { loginScreen(''); }
    });
  }
}());
