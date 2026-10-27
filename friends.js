(() => {
  "use strict";

  const authHash = new URLSearchParams(location.hash.slice(1));
  let recoveryMode = authHash.get("type") === "recovery";
  const invalidAuthLink = authHash.has("error") || new URLSearchParams(location.search).has("error");

  const config = window.RFL_FRIENDS_BACKEND || {};
  const hasServerSettings = Boolean(config.url && config.publishableKey);
  const configured = Boolean(hasServerSettings && window.supabase?.createClient);
  const client = configured
    ? window.supabase.createClient(config.url, config.publishableKey, {
        auth: {
          storageKey: "rfl-friends-auth-v1",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

  window.RflPush?.init(client);

  const dialog = document.getElementById("friendsDialog");
  const notificationsDialog = document.getElementById("notificationsDialog");
  const openButton = document.getElementById("openFriends");
  const notificationsButton = document.getElementById("openNotifications");
  const notificationsList = document.getElementById("notificationsList");
  const authForm = document.getElementById("friendsAuthForm");
  const resetForm = document.getElementById("friendsResetForm");
  const newPasswordInput = document.getElementById("friendsNewPassword");
  const confirmPasswordInput = document.getElementById("friendsConfirmPassword");
  const forgotPasswordButton = document.getElementById("friendsForgotPassword");
  const resendButton = document.getElementById("friendsResendConfirmation");
  const usernameMessage = document.getElementById("friendsUsernameMessage");
  const authModeButton = document.getElementById("friendsAuthMode");
  const authSubmit = document.getElementById("friendsAuthSubmit");
  const authMessage = document.getElementById("friendsAuthMessage");
  const statusMessage = document.getElementById("friendsStatusMessage");
  const authPanel = document.getElementById("friendsAuth");
  const signedPanel = document.getElementById("friendsSigned");
  const emailInput = document.getElementById("friendsEmail");
  const passwordInput = document.getElementById("friendsPassword");
  const displayNameInput = document.getElementById("friendsDisplayName");
  const signupUsernameInput = document.getElementById("friendsUsernameSignup");
  const usernameLabel = document.querySelector(".friends-username-signup-label");
  const friendUsernameForm = document.getElementById("friendUsernameForm");
  const friendUsernameInput = document.getElementById("friendUsername");
  const nameLabel = document.querySelector(".friends-name-label");
  const searchResult = document.getElementById("friendsSearchResult");
  const EMPTY = { friends: [], incoming: [], outgoing: [] };
  let mode = "signin";
  let activeUserId = null;
  let activityTimer = 0;
  let refreshTimer = 0;
  let modalOpen = false;
  let incomingRequestIds = null;
  let pendingIncoming = [];
  let lastMailRequestAt = 0;

  const t = (key, vars = {}) => {
    let value = words[lang]?.[key] || words.de?.[key] || key;
    for (const [name, replacement] of Object.entries(vars)) value = value.replace("{" + name + "}", String(replacement));
    return value;
  };

  const showMessage = (node, message, isError = false) => {
    node.textContent = message || "";
    node.classList.toggle("error", isError);
  };

  const showError = (error) => {
    const message = String(error?.message || "").toLowerCase();
    if (error?.status === 429 || /rate limit|too many|over_email_send_rate_limit/.test(message)) return lang === "de" ? "Zu viele Anfragen. Bitte warte kurz und versuche es später erneut." : "Too many requests. Please wait and try again later.";
    if (message.includes("error sending") || message.includes("smtp")) return lang === "de" ? "Die E-Mail konnte nicht verschickt werden. Der Mailversand der RFL-App muss vom Betreiber geprüft werden." : "The email could not be sent. The RFL app operator needs to check the mail service.";
    if (message.includes("friend code not found")) return t("friendsInvalidCode");
    if (message.includes("already friends")) return lang === "de" ? "Ihr seid bereits befreundet." : "You are already friends.";
    if (message.includes("request already pending")) return lang === "de" ? "Für diesen Fahrer gibt es bereits eine offene Anfrage." : "There is already an open request for this driver.";
    if (message.includes("invalid login credentials")) return lang === "de" ? "E-Mail oder Passwort ist nicht richtig." : "Email or password is incorrect.";
    if (message.includes("email not confirmed")) return t("friendsConfirmEmail");
    if (message.includes("user already registered")) return lang === "de" ? "Für diese E-Mail gibt es bereits ein Konto. Melde dich an." : "An account already exists for this email. Sign in instead.";
    if (message.includes("username") && (message.includes("duplicate") || message.includes("already taken") || error?.code === "23505")) return t("friendsUsernameTaken");
    if (message.includes("invalid username") || message.includes("username must")) return t("friendsUsernameInvalid");
    if (message.includes("password should be at least")) return lang === "de" ? "Das Passwort muss mindestens 8 Zeichen haben." : "Password must be at least 8 characters.";
    if (error?.code === "unexpected_failure" || error?.status >= 500) return lang === "de" ? "Der Server konnte die Anfrage nicht abschließen. Bitte später erneut versuchen. Der Betreiber kann den genauen Fehler im Protokoll prüfen." : "The server could not complete the request. Please try again later. The operator can check the server log.";
    return t("friendsNetworkError");
  };

  function setAuthMode(next) {
    mode = next;
    const signingUp = mode === "signup";
    authForm.hidden = false;
    resetForm.hidden = true;
    nameLabel.hidden = !signingUp;
    displayNameInput.hidden = !signingUp;
    displayNameInput.required = signingUp;
    usernameLabel.hidden = !signingUp;
    signupUsernameInput.hidden = !signingUp;
    signupUsernameInput.required = signingUp;
    passwordInput.autocomplete = signingUp ? "new-password" : "current-password";
    authSubmit.textContent = t(signingUp ? "friendsCreateAccount" : "friendsSignIn");
    authModeButton.textContent = t(signingUp ? "friendsSignIn" : "friendsCreateAccount");
    authModeButton.dataset.mode = mode;
    document.getElementById("friendsForgotPassword").hidden = signingUp;
    document.getElementById("friendsForgotUsername").hidden = signingUp;
    resendButton.hidden = signingUp;
    document.getElementById("friendsUsernameHelp").hidden = true;
    showMessage(authMessage, "");
  }

  function setSessionView(user) {
    window.RflPush?.setAccount(user);
    window.RflUpdates?.setAccount(user?.id || null);
    if (recoveryMode && user) {
      showRecovery();
      return;
    }
    const signedIn = Boolean(user);
    authPanel.hidden = signedIn;
    signedPanel.hidden = !signedIn;
    if (!signedIn) {
      activeUserId = null;
      incomingRequestIds = null;
      clearInterval(activityTimer);
      clearInterval(refreshTimer);
      document.getElementById("myFriendCode").textContent = "········";
      pendingIncoming = [];
      notificationsList.replaceChildren(emptyLine("notificationsEmpty"));
      notificationsList.hidden = true;
      renderNotifications([]);
      document.getElementById("friendsList").replaceChildren(emptyLine("friendsEmpty"));
      document.getElementById("friendsRequests").replaceChildren(emptyLine("friendsNoRequests"));
      document.getElementById("friendsOutgoing").replaceChildren(emptyLine("friendsNoOutgoing"));
      return;
    }
    if (activeUserId !== user.id) {
      activeUserId = user.id;
      incomingRequestIds = null;
      void loadAccountProfile(true);
    }
    clearInterval(activityTimer);
    activityTimer = window.setInterval(() => { void heartbeat(); }, 60000);
    clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (activeUserId) void refreshFriends();
    }, 30000);
    void heartbeat();
    void refreshFriends();
  }

  function emptyLine(key) {
    const p = document.createElement("p");
    p.className = "friends-empty";
    p.textContent = t(key);
    return p;
  }

  async function loadAccountProfile(useServerProfile) {
    if (!client || !activeUserId) return;
    const { data, error } = await client.from("rfl_profiles")
      .select("user_id,username,display_name,friend_code,avatar_data,activity_visible")
      .eq("user_id", activeUserId)
      .maybeSingle();
    if (error || !data) {
      showMessage(statusMessage, error ? showError(error) : t("friendsNoProfile"), true);
      return;
    }
    document.getElementById("myFriendCode").textContent = data.friend_code;
    document.getElementById("shareActivity").checked = data.activity_visible !== false;
    friendUsernameInput.value = data.username || "";
    try { localStorage.setItem(profileUsernameKey, data.username || ""); } catch {}
    if (useServerProfile) {
      try {
        localStorage.setItem(profileNameKey, data.display_name || "RFL Driver");
        localStorage.setItem(profileAvatarKey, data.avatar_data || "");
      } catch {}
      updateProfile();
    }
  }

  async function syncProfile(name, avatar, username, feedback = statusMessage) {
    if (!client) return false;
    const { data } = await client.auth.getSession();
    if (!data.session) return false;
    const normalizedUsername = String(username ?? readSetting(profileUsernameKey, ""))
      .trim().replace(/^@/, "").toLowerCase();
    const { error } = await client.rpc("rfl_update_profile", {
      p_display_name: name,
      p_avatar_data: avatar || null,
      p_username: normalizedUsername || null
    });
    if (error) {
      const message = error.code === "23505" ? t("friendsUsernameTaken") : showError(error);
      if (modalOpen) showMessage(feedback, message, true);
      else tell(message);
      return false;
    }
    if (normalizedUsername) {
      try { localStorage.setItem(profileUsernameKey, normalizedUsername); } catch {}
      friendUsernameInput.value = normalizedUsername;
    }
    if (modalOpen) await refreshFriends();
    return true;
  }

  window.syncRflFriendsProfile = syncProfile;

  async function heartbeat() {
    if (!client || !activeUserId) return;
    const { error } = await client.rpc("rfl_heartbeat");
    if (error && modalOpen) showMessage(statusMessage, showError(error), true);
  }

  function formatLastSeen(value) {
    const date = new Date(value);
    const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
    if (minutes < 1) return t("friendsNow");
    if (minutes < 60) return t("friendsMinutes", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("friendsHours", { n: hours });
    return t("friendsDays", { n: Math.floor(hours / 24) });
  }

  function safeAvatar(parent, data, name) {
    const avatar = document.createElement("span");
    avatar.className = "friend-avatar";
    if (typeof data === "string" && /^data:image\/(?:jpeg|png|webp);base64,/i.test(data)) {
      const image = document.createElement("img");
      image.src = data;
      image.alt = "";
      avatar.append(image);
    } else {
      avatar.textContent = profileInitials(name);
    }
    parent.append(avatar);
  }

  function friendStatus(profile) {
    const status = document.createElement("small");
    const line = document.createElement("span");
    line.className = "friend-status";
    if (profile.activity_visible === false) {
      line.textContent = t("friendsHiddenStatus");
    } else {
      const recent = profile.last_seen_at && Date.now() - new Date(profile.last_seen_at).getTime() < 120000;
      line.classList.toggle("online", Boolean(recent));
      line.textContent = recent ? t("friendsOnline") : `${t("friendsLastSeen")} · ${formatLastSeen(profile.last_seen_at)}`;
    }
    status.append(line);
    return status;
  }

  function makeProfileCard(profile, options = {}) {
    const card = document.createElement("article");
    card.className = "friend-card";
    safeAvatar(card, profile.avatar_data, profile.display_name);
    const main = document.createElement("div");
    main.className = "friend-main";
    const name = document.createElement("strong");
    name.textContent = profile.display_name || t("friendsNoProfile");
    main.append(name);
    if (profile.username) {
      const username = document.createElement("small");
      username.className = "friend-username";
      username.textContent = `@${profile.username}`;
      main.append(username);
    }
    if (options.status) main.append(friendStatus(profile));
    else {
      const code = document.createElement("small");
      code.textContent = profile.friend_code || "";
      main.append(code);
    }
    card.append(main);
    if (options.buttons?.length) {
      const actions = document.createElement("div");
      actions.className = "friend-card-actions";
      for (const action of options.buttons) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `btn ghost small ${action.className || ""}`;
        button.textContent = t(action.label);
        button.addEventListener("click", action.run);
        actions.append(button);
      }
      card.append(actions);
    }
    return card;
  }

  async function refreshFriends() {
    if (!client || !activeUserId) return;
    const list = document.getElementById("friendsList");
    list.replaceChildren(emptyLine("friendsLoading"));
    const { data: links, error: linkError } = await client.from("rfl_friend_requests")
      .select("id,from_id,to_id")
      .eq("status", "accepted")
      .or(`from_id.eq.${activeUserId},to_id.eq.${activeUserId}`);
    if (linkError) {
      list.replaceChildren(emptyLine("friendsNetworkError"));
      showMessage(statusMessage, showError(linkError), true);
      return;
    }
    const friendIds = (links || []).map((link) => link.from_id === activeUserId ? link.to_id : link.from_id);
    let profiles = [];
    if (friendIds.length) {
      const result = await client.from("rfl_profiles")
        .select("user_id,username,display_name,friend_code,avatar_data,activity_visible,last_seen_at")
        .in("user_id", friendIds);
      if (result.error) {
        list.replaceChildren(emptyLine("friendsNetworkError"));
        showMessage(statusMessage, showError(result.error), true);
        return;
      }
      profiles = result.data || [];
    }
    list.replaceChildren(...(profiles.length ? profiles.map((profile) => makeProfileCard(profile, {
      status: true,
      buttons: [{ label: "friendsRemove", className: "friend-remove", run: () => removeFriend(profile.user_id) }]
    })) : [emptyLine("friendsEmpty")]));
    document.getElementById("friendsListCount").textContent = String(profiles.length);

    const { data: requests, error: requestError } = await client.rpc("rfl_list_pending_requests");
    if (requestError) {
      showMessage(statusMessage, showError(requestError), true);
      return;
    }
    const incoming = (requests || []).filter((request) => request.direction === "incoming");
    const outgoing = (requests || []).filter((request) => request.direction === "outgoing");
    const requestNodes = incoming.map((request) => makeProfileCard(request, {
      buttons: [
        { label: "friendsAccept", run: () => answerRequest(request.request_id, true) },
        { label: "friendsDecline", className: "friend-remove", run: () => answerRequest(request.request_id, false) }
      ]
    }));
    document.getElementById("friendsRequests").replaceChildren(...(requestNodes.length ? requestNodes : [emptyLine("friendsNoRequests")]));
    const outgoingNodes = outgoing.map((request) => makeProfileCard(request));
    document.getElementById("friendsOutgoing").replaceChildren(...(outgoingNodes.length ? outgoingNodes : [emptyLine("friendsNoOutgoing")]));
    document.getElementById("friendsRequestCount").textContent = String(incoming.length);
    const badge = document.getElementById("friendCount");
    badge.textContent = String(incoming.length);
    badge.hidden = incoming.length === 0;
    pendingIncoming = incoming;
    renderNotifications(incoming);
    if (incomingRequestIds) {
      const fresh = incoming.filter((request) => !incomingRequestIds.has(request.request_id));
      if (fresh.length && document.visibilityState === "visible") {
        tell(fresh.length === 1
          ? t("friendsNewRequestToast", { name: fresh[0].display_name || `@${fresh[0].username}` })
          : t("friendsNewRequestsToast", { n: fresh.length }));
      }
    }
    incomingRequestIds = new Set(incoming.map((request) => request.request_id));
  }

  function renderNotifications(incoming) {
    const signedIn = Boolean(client && activeUserId);
    notificationsList.hidden = !signedIn;
    notificationsList.replaceChildren(...(incoming.length ? incoming.map((request) => makeProfileCard(request, {
      buttons: [
        { label: "friendsAccept", run: () => answerRequest(request.request_id, true) },
        { label: "friendsDecline", className: "friend-remove", run: () => answerRequest(request.request_id, false) }
      ]
    })) : [emptyLine("notificationsEmpty")]));
    const unread = (window.RflUpdates?.getUnreadCount() || 0) + incoming.length;
    const notificationBadge = document.getElementById("notificationCount");
    notificationBadge.textContent = String(unread);
    notificationBadge.hidden = unread === 0;
    const newsList = document.getElementById("notificationsNewsList");
    const items = window.RflUpdates?.getItems() || [];
    newsList.replaceChildren();
    for (const item of items) {
      const article = document.createElement("article");
      article.className = `app-news-item${item.unread ? " unread" : ""}`;
      const time = document.createElement("time");
      time.dateTime = item.publishedAt;
      time.textContent = new Date(item.publishedAt).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB");
      const title = document.createElement("h4");
      title.textContent = item.title[lang] || item.title.de;
      const body = document.createElement("p");
      body.textContent = item.body[lang] || item.body.de;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn ghost small";
      button.textContent = t({ home: "navHome", calendar: "navCalendar", about: "navAbout", apply: "navApply", settings: "settingsTitle" }[item.action] || "navHome");
      button.addEventListener("click", () => {
        closeNotifications();
        if (item.action === "settings") openSettings();
        else showScreen(item.action);
      });
      article.append(time, title, body, button);
      newsList.append(article);
    }
    if (!items.length) newsList.append(emptyLine("notificationsNewsEmpty"));
    document.getElementById("notificationsMarkRead").disabled = !(window.RflUpdates?.getUnreadCount());
  }

  async function answerRequest(id, accept) {
    const { error } = await client.rpc(accept ? "rfl_accept_friend_request" : "rfl_reject_friend_request", { p_request_id: id });
    if (error) showMessage(statusMessage, showError(error), true);
    else {
      showMessage(statusMessage, t(accept ? "friendsRequestAccepted" : "friendsRequestDeclined"));
      await refreshFriends();
    }
  }

  async function removeFriend(id) {
    const confirmed = window.confirm(lang === "de" ? "Diesen Fahrer aus deiner Freundesliste entfernen?" : "Remove this driver from your friends list?");
    if (!confirmed) return;
    const { error } = await client.rpc("rfl_remove_friend", { p_friend_id: id });
    if (error) showMessage(statusMessage, showError(error), true);
    else {
      showMessage(statusMessage, t("friendsFriendRemoved"));
      await refreshFriends();
    }
  }

  function openFriends() {
    modalOpen = true;
    dialog.classList.add("open");
    dialog.setAttribute("aria-hidden", "false");
    openButton.setAttribute("aria-expanded", "true");
    if (!hasServerSettings) {
      document.getElementById("friendsConfigNote").hidden = false;
      authPanel.hidden = true;
      signedPanel.hidden = true;
      return;
    }
    if (!client) {
      document.getElementById("friendsConfigNote").hidden = true;
      authPanel.hidden = false;
      signedPanel.hidden = true;
      showMessage(authMessage, t("friendsNetworkError"), true);
      return;
    }
    document.getElementById("friendsConfigNote").hidden = true;
    client.auth.getSession().then(({ data }) => setSessionView(data.session?.user || null));
    showMessage(authMessage, "");
    showMessage(statusMessage, "");
    setTimeout(() => {
      const focusTarget = signedPanel.hidden ? emailInput : document.getElementById("friendCodeInput");
      focusTarget.focus();
    }, 40);
  }

  function closeFriends() {
    modalOpen = false;
    dialog.classList.remove("open");
    dialog.setAttribute("aria-hidden", "true");
    openButton.setAttribute("aria-expanded", "false");
    openButton.focus();
  }

  function openNotifications() {
    notificationsDialog.classList.add("open");
    notificationsDialog.setAttribute("aria-hidden", "false");
    notificationsButton.setAttribute("aria-expanded", "true");
    const needsSetup = !client || !activeUserId;
    document.getElementById("notificationsSetup").hidden = !needsSetup;
    notificationsList.hidden = needsSetup;
    renderNotifications(pendingIncoming);
    window.RflUpdates?.markAllRead();
    if (activeUserId) void refreshFriends();
    setTimeout(() => notificationsDialog.querySelector("[data-close-notifications]").focus(), 30);
  }

  function closeNotifications() {
    notificationsDialog.classList.remove("open");
    notificationsDialog.setAttribute("aria-hidden", "true");
    notificationsButton.setAttribute("aria-expanded", "false");
    notificationsButton.focus();
  }

  openButton.addEventListener("click", openFriends);
  notificationsButton.addEventListener("click", openNotifications);
  window.addEventListener("rfl:news-changed", () => renderNotifications(pendingIncoming));
  window.addEventListener("rfl:language-changed", () => {
    authSubmit.textContent = t(mode === "signup" ? "friendsCreateAccount" : "friendsSignIn");
    authModeButton.textContent = t(mode === "signup" ? "friendsSignIn" : "friendsCreateAccount");
    renderNotifications(pendingIncoming);
  });
  document.getElementById("notificationsMarkRead").addEventListener("click", () => window.RflUpdates?.markAllRead());
  notificationsDialog.querySelectorAll("[data-close-notifications]").forEach((button) => button.addEventListener("click", closeNotifications));
  document.getElementById("notificationsGoFriends").addEventListener("click", () => {
    closeNotifications();
    openFriends();
  });
  dialog.querySelectorAll("[data-close-friends]").forEach((button) => button.addEventListener("click", closeFriends));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dialog.classList.contains("open")) closeFriends();
    if (event.key === "Escape" && notificationsDialog.classList.contains("open")) closeNotifications();
  });

  authModeButton.addEventListener("click", () => setAuthMode(mode === "signin" ? "signup" : "signin"));
  setAuthMode("signin");

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    authSubmit.disabled = true;
    authModeButton.disabled = true;
    showMessage(authMessage, t("friendsLoading"));
    try {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (mode === "signup") {
        const username = signupUsernameInput.value.trim().replace(/^@/, "").toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(username)) {
          showMessage(authMessage, t("friendsUsernameInvalid"), true);
          signupUsernameInput.focus();
          return;
        }
        const availability = await client.rpc("rfl_username_available", { p_username: username });
        if (availability.error) throw availability.error;
        if (availability.data !== true) {
          showMessage(authMessage, t("friendsUsernameTaken"), true);
          signupUsernameInput.focus();
          return;
        }
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayNameInput.value.trim(), username },
            emailRedirectTo: config.emailRedirectTo || "https://niiklasmea.github.io/rfl-mobile-app/"
          }
        });
        if (error) throw error;
        if (!data.session) {
          showMessage(authMessage, t("friendsConfirmEmail"));
        } else {
          setSessionView(data.user);
          await syncProfile(displayNameInput.value.trim(), readSetting(profileAvatarKey, ""), username);
          showMessage(statusMessage, t("friendsChangeSent"));
        }
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setSessionView(data.user);
        await loadAccountProfile(true);
        await refreshFriends();
      }
    } catch (error) {
      showMessage(authMessage, showError(error), true);
    } finally {
      authSubmit.disabled = false;
      authModeButton.disabled = false;
    }
  });

  async function requestAccountMail(kind, button) {
    if (!client) { showMessage(authMessage, t("friendsNetworkError"), true); return; }
    const email = emailInput.value.trim();
    if (!email || !emailInput.checkValidity()) {
      showMessage(authMessage, lang === "de" ? "Trage zuerst eine gültige E-Mail-Adresse ein." : "Enter a valid email address first.", true);
      emailInput.focus();
      return;
    }
    if (Date.now() - lastMailRequestAt < 60000) {
      showMessage(authMessage, t("friendsMailWait"), true);
      return;
    }
    lastMailRequestAt = Date.now();
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    showMessage(authMessage, t("friendsLoading"));
    try {
      const redirectTo = config.emailRedirectTo || "https://niiklasmea.github.io/rfl-mobile-app/";
      const { error } = kind === "recovery"
        ? await client.auth.resetPasswordForEmail(email, { redirectTo })
        : await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      showMessage(authMessage, t(kind === "recovery" ? "friendsResetSent" : "friendsConfirmationResent"));
    } catch (error) { showMessage(authMessage, showError(error), true); }
    finally {
      button.removeAttribute("aria-busy");
      setTimeout(() => { button.disabled = false; }, 60000);
    }
  }
  forgotPasswordButton.addEventListener("click", () => requestAccountMail("recovery", forgotPasswordButton));
  resendButton.addEventListener("click", () => requestAccountMail("signup", resendButton));
  document.getElementById("friendsForgotUsername").addEventListener("click", () => {
    const help = document.getElementById("friendsUsernameHelp");
    help.hidden = !help.hidden;
  });

  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const message = document.getElementById("friendsResetMessage");
    if (newPasswordInput.value !== confirmPasswordInput.value) {
      showMessage(message, t("friendsPasswordsDiffer"), true);
      confirmPasswordInput.focus();
      return;
    }
    const submit = resetForm.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const { data, error } = await client.auth.updateUser({ password: newPasswordInput.value });
      if (error) throw error;
      recoveryMode = false;
      resetForm.hidden = true;
      authForm.hidden = false;
      newPasswordInput.value = "";
      confirmPasswordInput.value = "";
      if (data.user) setSessionView(data.user);
      showMessage(statusMessage, lang === "de" ? "Passwort erfolgreich geändert." : "Password successfully updated.");
      tell(lang === "de" ? "Passwort erfolgreich geändert." : "Password successfully updated.");
    } catch (error) { showMessage(message, showError(error), true); }
    finally { submit.disabled = false; }
  });

  document.getElementById("friendsAddForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const input = document.getElementById("friendCodeInput");
    const code = input.value.trim().replace(/^@/, "");
    if (!code || code.length > 30) {
      showMessage(statusMessage, t("friendsUsernameInvalid"), true);
      return;
    }
    searchResult.hidden = false;
    searchResult.replaceChildren(emptyLine("friendsLoading"));
    const { data, error } = await client.rpc("rfl_lookup_player", { p_code: code });
    if (error) {
      searchResult.replaceChildren(emptyLine(showError(error)));
      return;
    }
    const player = data?.[0];
    if (!player) {
      searchResult.replaceChildren(emptyLine(t("friendsInvalidCode")));
      return;
    }
    const row = makeProfileCard(player, {
      buttons: [{ label: "friendsSendRequest", run: () => sendRequest(code) }]
    });
    searchResult.replaceChildren(row);
  });

  friendUsernameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = friendUsernameInput.value.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      showMessage(usernameMessage, t("friendsUsernameInvalid"), true);
      friendUsernameInput.focus();
      return;
    }
    const submit = friendUsernameForm.querySelector("button[type=submit]");
    submit.disabled = true;
    showMessage(usernameMessage, t("friendsLoading"));
    try {
      const saved = await syncProfile(readSetting(profileNameKey, "RFL Driver"), readSetting(profileAvatarKey, ""), username, usernameMessage);
      if (saved) {
        const message = lang === "de" ? `Dein Benutzername wurde erfolgreich zu @${username} geändert.` : `Your username was successfully changed to @${username}.`;
        showMessage(usernameMessage, message);
        tell(message);
      }
    } catch (error) { showMessage(usernameMessage, showError(error), true); }
    finally { submit.disabled = false; }
  });

  async function sendRequest(code) {
    const { error } = await client.rpc("rfl_send_friend_request", { p_code: code });
    if (error) showMessage(statusMessage, showError(error), true);
    else {
      showMessage(statusMessage, t("friendsRequestSent"));
      searchResult.hidden = true;
      searchResult.replaceChildren();
      document.getElementById("friendCodeInput").value = "";
      await refreshFriends();
    }
  }

  document.getElementById("shareActivity").addEventListener("change", async (event) => {
    if (!client) return;
    const { error } = await client.rpc("rfl_set_activity_visible", { p_visible: event.currentTarget.checked });
    if (error) {
      event.currentTarget.checked = !event.currentTarget.checked;
      showMessage(statusMessage, showError(error), true);
    } else {
      showMessage(statusMessage, t("friendsChangeSent"));
      await heartbeat();
      await refreshFriends();
    }
  });

  document.getElementById("copyFriendCode").addEventListener("click", async () => {
    const code = document.getElementById("myFriendCode").textContent;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const input = document.createElement("textarea");
      input.value = code;
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    showMessage(statusMessage, t("friendsCopied"));
  });

  document.getElementById("friendsSignOut").addEventListener("click", async () => {
    if (!client) return;
    await window.RflPush?.beforeSignOut().catch(()=>{});
    const { error } = await client.auth.signOut();
    if (error) showMessage(statusMessage, showError(error), true);
    else {
      setSessionView(null);
      setAuthMode("signin");
      showMessage(authMessage, "");
    }
  });

  document.getElementById("friendsDeleteAccount").addEventListener("click", async () => {
    if (!client || !window.confirm(t("friendsDeleteConfirm"))) return;
    const { error } = await client.rpc("rfl_delete_account");
    if (error) {
      showMessage(statusMessage, t("friendsDeleteError"), true);
      return;
    }
    await client.auth.signOut();
    setSessionView(null);
    setAuthMode("signin");
    showMessage(authMessage, lang === "de" ? "Dein Freundeskonto wurde gelöscht." : "Your friends account has been deleted.");
  });

  function showRecovery() {
    recoveryMode = true;
    modalOpen = true;
    dialog.classList.add("open");
    dialog.setAttribute("aria-hidden", "false");
    document.getElementById("gate")?.classList.add("hidden");
    document.getElementById("friendsConfigNote").hidden = true;
    authPanel.hidden = false;
    signedPanel.hidden = true;
    authForm.hidden = true;
    resetForm.hidden = false;
    window.setTimeout(() => newPasswordInput.focus(), 40);
  }
  if (client) {
    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        showRecovery();
        return;
      }
      window.setTimeout(() => setSessionView(session?.user || null), 0);
    });
    client.auth.getSession().then(({ data }) => {
      if (data.session?.user) setSessionView(data.session.user);
    });
  }
  renderNotifications([]);
  if (invalidAuthLink) {
    recoveryMode = false;
    openFriends();
    const message = lang === "de" ? "Dieser Anmeldelink ist abgelaufen oder ungültig. Fordere bitte eine neue E-Mail an und öffne den neuesten Link." : "This sign-in link has expired or is invalid. Request a new email and open the newest link.";
    showMessage(authMessage, message, true);
    tell(message);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void heartbeat();
  });
})();
