const SUPABASE_URL = "https://eoihzwzlrjlwpdgkaifc.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvaWh6d2pscmpsd3BkZ2thaWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Nzg1MTIsImV4cCI6MjA5ODA1NDUxMn0.OBupMEKHqTS8gwCulONONpet4HtCewmg8DhxRqxx5Sw";
const COMMENTS_TABLE = "comentarios_del_juego";

const gameCards = document.querySelectorAll("[data-game]");

const supabaseRequest = async (path, options = {}) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
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

  return response.json();
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

    const text = document.createElement("p");
    text.textContent = comment.comentario;

    const meta = document.createElement("div");
    meta.className = "comment-meta";

    const date = document.createElement("time");
    date.dateTime = comment.created_at;
    date.textContent = formatDate(comment.created_at);

    meta.append(date);
    item.append(text, meta);
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
      `${COMMENTS_TABLE}?select=id,juego,comentario,created_at&order=created_at.desc`,
    );
    const commentsByGame = groupCommentsByGame(comments);

    gameCards.forEach((card) => renderComments(card, commentsByGame));
  } catch (error) {
    console.error(error);
    renderErrorState("Revisa la consola del navegador.");
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
      const commentText = String(formData.get("comment") || "").trim();

      if (!commentText) {
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
loadComments();
