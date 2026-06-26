const SUPABASE_URL = "https://eoihzwjlrjlwpdgkaifc.supabase.co";
const SUPABASE_KEY = "sb_publishable_Tat9TUjV-ALTJoL8RoT31Q_OKuLQZUx";
const COMMENTS_TABLE = "comentarios_del_juego";
const ADMIN_EMAIL = "ailenengelberger@gmail.com";
const SITE_URL = "https://eng-ai-app.github.io/sr_mancuso2/";

const gameCards = document.querySelectorAll("[data-game]");
const authClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentSession = null;

const isAdmin = () =>
  currentSession?.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

const supabaseRequest = async (path, options = {}) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${options.accessToken || SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Supabase respondio ${response.status}: ${errorText || response.statusText}`,
    );
  }

  if (response.status === 204) {
    return null;
  }

  const responseText = await response.text();

  if (!responseText.trim()) {
    return null;
  }

  return JSON.parse(responseText);
};

const formatDate = (dateValue) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateValue));

const groupCommentsByGame = (comments) =>
  comments.reduce((groupedComments, comment) => {
    const gameId = comment.juego;
    groupedComments[gameId] = groupedComments[gameId] || [];
    groupedComments[gameId].push(comment);
    return groupedComments;
  }, {});

const renderComments = (card, commentsByGame) => {
  const gameId = card.dataset.game;
  const commentsList = card.querySelector("[data-comments-list]");
  const comments = commentsByGame[gameId] || [];

  commentsList.innerHTML = "";

  if (comments.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "comments-empty";
    emptyMessage.textContent = "Todavia no hay comentarios.";
    commentsList.append(emptyMessage);
    return;
  }

  comments.forEach((comment) => {
    const item = document.createElement("article");
    item.className = "comment-item";

    const author = document.createElement("strong");
    author.className = "comment-author";
    author.textContent = comment.nombre || "Anonimo";

    const text = document.createElement("p");
    text.textContent = comment.comentario;

    const meta = document.createElement("div");
    meta.className = "comment-meta";

    const date = document.createElement("time");
    date.dateTime = comment.created_at;
    date.textContent = formatDate(comment.created_at);

    meta.append(date);

    if (isAdmin()) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Borrar";
      deleteButton.addEventListener("click", () => deleteComment(comment.id));
      meta.append(deleteButton);
    }

    item.append(author, text, meta);
    commentsList.append(item);
  });
};

const renderLoadingState = () => {
  gameCards.forEach((card) => {
    const commentsList = card.querySelector("[data-comments-list]");
    commentsList.innerHTML = '<p class="comments-empty">Cargando comentarios...</p>';
  });
};

const renderErrorState = (message) => {
  gameCards.forEach((card) => {
    const commentsList = card.querySelector("[data-comments-list]");
    const errorMessage = document.createElement("p");
    errorMessage.className = "comments-empty";
    errorMessage.textContent = `No se pudieron cargar los comentarios. ${message}`;
    commentsList.innerHTML = "";
    commentsList.append(errorMessage);
  });
};

const loadComments = async () => {
  renderLoadingState();

  try {
    const comments = await supabaseRequest(
      `${COMMENTS_TABLE}?select=id,juego,nombre,comentario,created_at&order=created_at.desc`,
    );
    const commentsByGame = groupCommentsByGame(comments);

    gameCards.forEach((card) => renderComments(card, commentsByGame));
  } catch (error) {
    console.error(error);
    renderErrorState("Revisa la consola del navegador.");
  }
};

const updateAdminControls = () => {
  const status = document.querySelector("[data-admin-status]");
  const loginButton = document.querySelector("[data-admin-login]");
  const logoutButton = document.querySelector("[data-admin-logout]");

  if (!status || !loginButton || !logoutButton) {
    return;
  }

  if (!authClient) {
    status.textContent = "Admin no disponible";
    loginButton.hidden = true;
    logoutButton.hidden = true;
    return;
  }

  if (isAdmin()) {
    status.textContent = "Admin activo";
    loginButton.hidden = true;
    logoutButton.hidden = false;
    return;
  }

  status.textContent = currentSession ? "No autorizado" : "Modo admin inactivo";
  loginButton.hidden = false;
  logoutButton.hidden = true;
};

const setupAdminControls = () => {
  const loginButton = document.querySelector("[data-admin-login]");
  const logoutButton = document.querySelector("[data-admin-logout]");

  if (!authClient || !loginButton || !logoutButton) {
    updateAdminControls();
    return;
  }

  loginButton.addEventListener("click", async () => {
    loginButton.disabled = true;
    loginButton.textContent = "Enviando...";

    const { error } = await authClient.auth.signInWithOtp({
      email: ADMIN_EMAIL,
      options: {
        emailRedirectTo: SITE_URL,
      },
    });

    loginButton.disabled = false;
    loginButton.textContent = "Entrar admin";

    if (error) {
      alert(`No se pudo enviar el acceso admin: ${error.message}`);
      return;
    }

    alert("Te envie un link de acceso al email admin.");
  });

  logoutButton.addEventListener("click", async () => {
    await authClient.auth.signOut();
  });
};

const initializeAuth = async () => {
  if (!authClient) {
    updateAdminControls();
    await loadComments();
    return;
  }

  const { data } = await authClient.auth.getSession();
  currentSession = data.session;
  updateAdminControls();

  authClient.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    updateAdminControls();
    loadComments();
  });

  await loadComments();
};

const deleteComment = async (commentId) => {
  if (!isAdmin()) {
    alert("Tenes que entrar como admin para borrar comentarios.");
    return;
  }

  const shouldDelete = confirm("Borrar este comentario?");

  if (!shouldDelete) {
    return;
  }

  try {
    await supabaseRequest(`${COMMENTS_TABLE}?id=eq.${commentId}`, {
      method: "DELETE",
      accessToken: currentSession.access_token,
      headers: {
        Prefer: "return=minimal",
      },
    });
    await loadComments();
  } catch (error) {
    console.error(error);
    alert(`No se pudo borrar el comentario: ${error.message}`);
  }
};

const setupCommentForms = () => {
  gameCards.forEach((card) => {
    const gameId = card.dataset.game;
    const form = card.querySelector("[data-comment-form]");
    const submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const formData = new FormData(form);
      const nameText = String(formData.get("name") || "").trim();
      const commentText = String(formData.get("comment") || "").trim();

      if (!nameText || !commentText) {
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Enviando...";

      try {
        await supabaseRequest(COMMENTS_TABLE, {
          method: "POST",
          headers: {
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            juego: gameId,
            nombre: nameText,
            comentario: commentText,
          }),
        });

        form.reset();
        await loadComments();
      } catch (error) {
        console.error(error);
        alert(`No se pudo guardar el comentario: ${error.message}`);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Enviar";
      }
    });
  });
};

setupCommentForms();
setupAdminControls();
initializeAuth();
