const SUPABASE_URL = "https://eoihzwjlrjlwpdgkaifc.supabase.co";
const SUPABASE_KEY = "sb_publishable_Tat9TUjV-ALTJoL8RoT31Q_OKuLQZUx";
const COMMENTS_TABLE = "comentarios_del_juego";
const ADMIN_EMAIL = "ailenengelberger@gmail.com";
const SITE_URL = "https://eng-ai-app.github.io/sr_mancuso2/";
const LIKED_COMMENTS_KEY = "srMancusoLikedComments";

const gameCards = document.querySelectorAll("[data-game]");
const authClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentSession = null;

const isAdmin = () =>
  currentSession?.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

const getLikedComments = () => {
  try {
    return JSON.parse(localStorage.getItem(LIKED_COMMENTS_KEY)) || [];
  } catch {
    return [];
  }
};

const saveLikedComment = (commentId) => {
  const likedComments = new Set(getLikedComments());
  likedComments.add(commentId);
  localStorage.setItem(LIKED_COMMENTS_KEY, JSON.stringify([...likedComments]));
};

const hasLikedComment = (commentId) => getLikedComments().includes(commentId);

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

const buildCommentTree = (comments) => {
  const commentsById = new Map();
  const rootComments = [];

  comments.forEach((comment) => {
    commentsById.set(comment.id, {
      ...comment,
      replies: [],
    });
  });

  commentsById.forEach((comment) => {
    if (comment.parent_id && commentsById.has(comment.parent_id)) {
      commentsById.get(comment.parent_id).replies.push(comment);
      return;
    }

    rootComments.push(comment);
  });

  commentsById.forEach((comment) => {
    comment.replies.sort(
      (firstReply, secondReply) =>
        new Date(firstReply.created_at) - new Date(secondReply.created_at),
    );
  });

  return rootComments;
};

const saveComment = ({ gameId, nameText, commentText, parentId = null }) =>
  supabaseRequest(COMMENTS_TABLE, {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      juego: gameId,
      nombre: nameText,
      comentario: commentText,
      parent_id: parentId,
    }),
  });

const createReplyForm = (card, parentComment) => {
  const form = document.createElement("form");
  form.className = "reply-form";
  form.hidden = true;

  form.innerHTML = `
    <label>
      Nombre
      <input
        name="name"
        type="text"
        maxlength="32"
        placeholder="Tu nombre..."
        required
      />
    </label>
    <label>
      Respuesta
      <textarea
        name="comment"
        rows="2"
        maxlength="240"
        placeholder="Responder comentario..."
        required
      ></textarea>
    </label>
    <button type="submit">Responder</button>
  `;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const nameText = String(formData.get("name") || "").trim();
    const commentText = String(formData.get("comment") || "").trim();
    const submitButton = form.querySelector('button[type="submit"]');

    if (!nameText || !commentText) {
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Enviando...";

    try {
      await saveComment({
        gameId: card.dataset.game,
        nameText,
        commentText,
        parentId: parentComment.id,
      });
      form.reset();
      form.hidden = true;
      await loadComments();
    } catch (error) {
      console.error(error);
      alert(`No se pudo guardar la respuesta: ${error.message}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Responder";
    }
  });

  return form;
};

const renderCommentItem = (card, comment, depth = 0) => {
  const item = document.createElement("article");
  item.className = comment.parent_id ? "comment-item reply-item" : "comment-item";
  item.style.setProperty("--reply-depth", Math.min(depth, 3));

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

  const actions = document.createElement("div");
  actions.className = "comment-actions";

  const likeButton = document.createElement("button");
  likeButton.type = "button";
  likeButton.className = "like-button";
  likeButton.setAttribute("aria-label", "Dar corazon al comentario");
  likeButton.textContent = `\u2665 ${comment.likes || 0}`;

  if (hasLikedComment(comment.id)) {
    likeButton.classList.add("is-liked");
    likeButton.disabled = true;
    likeButton.setAttribute("aria-label", "Ya diste corazon a este comentario");
  }

  likeButton.addEventListener("click", () => likeComment(comment));
  actions.append(likeButton);

  const replyButton = document.createElement("button");
  replyButton.type = "button";
  replyButton.textContent = "Responder";
  actions.append(replyButton);

  meta.append(date, actions);

  if (isAdmin()) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Borrar";
    deleteButton.addEventListener("click", () => deleteComment(comment.id));
    actions.append(deleteButton);
  }

  item.append(author, text, meta);

  const replyForm = createReplyForm(card, comment);
  replyButton.addEventListener("click", () => {
    replyForm.hidden = !replyForm.hidden;
  });
  item.append(replyForm);

  if (comment.replies.length > 0) {
    const repliesList = document.createElement("div");
    repliesList.className = "replies-list";
    comment.replies.forEach((reply) => {
      repliesList.append(renderCommentItem(card, reply, depth + 1));
    });
    item.append(repliesList);
  }

  return item;
};

const renderComments = (card, commentsByGame) => {
  const gameId = card.dataset.game;
  const commentsList = card.querySelector("[data-comments-list]");
  const comments = buildCommentTree(commentsByGame[gameId] || []);

  commentsList.innerHTML = "";

  if (comments.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "comments-empty";
    emptyMessage.textContent = "Todavia no hay comentarios.";
    commentsList.append(emptyMessage);
    return;
  }

  comments.forEach((comment) => {
    commentsList.append(renderCommentItem(card, comment));
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
    let comments;

    try {
      comments = await supabaseRequest(
        `${COMMENTS_TABLE}?select=id,parent_id,juego,nombre,comentario,likes,created_at&order=created_at.desc`,
      );
    } catch (error) {
      console.warn("No se pudo cargar parent_id, usando comentarios simples.", error);
      comments = await supabaseRequest(
        `${COMMENTS_TABLE}?select=id,juego,nombre,comentario,likes,created_at&order=created_at.desc`,
      );
    }

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

const likeComment = async (comment) => {
  if (hasLikedComment(comment.id)) {
    return;
  }

  try {
    saveLikedComment(comment.id);
    await supabaseRequest(`${COMMENTS_TABLE}?id=eq.${comment.id}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        likes: (comment.likes || 0) + 1,
      }),
    });
    await loadComments();
  } catch (error) {
    console.error(error);
    alert(`No se pudo sumar el corazon: ${error.message}`);
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
        await saveComment({
          gameId,
          nameText,
          commentText,
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

const setupShareButton = () => {
  const shareButton = document.querySelector("[data-share-page]");

  if (!shareButton) {
    return;
  }

  shareButton.addEventListener("click", async () => {
    const shareUrl = SITE_URL;
    const shareData = {
      title: "SR_MANCUSO",
      text: "Mira la pagina de SR_MANCUSO.",
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      shareButton.textContent = "Link copiado";
      setTimeout(() => {
        shareButton.textContent = "Compartir pagina";
      }, 1800);
    } catch (error) {
      console.error(error);
      alert("No se pudo compartir la pagina.");
    }
  });
};

setupCommentForms();
setupAdminControls();
setupShareButton();
initializeAuth();
