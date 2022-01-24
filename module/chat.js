export const displayChatActionButtons = function(message, html, data) {
  const chatCard = html.find(".dw.chat-card");

  if ( chatCard.length > 0 ) {
    // If the user is the message author or the actor owner, proceed.
    let actor = game.actors.get(data.message.speaker.actor);
    // Exit early from further operations if this is a GM user.
    if ( game.user.isGM ) return;
    if ((data.author.id === game.user.id) || ( actor && actor.owner )) return;
    // Otherwise conceal action buttons.
    chatCard.find("button[data-action], .button-disabled").each((i, btn) => {
      btn.style.display = "none"
    });
  }
}

export const activateChatListeners = function(html) {
  html.on('click', 'button[data-action]', (event) => _onChatCardAction(event));
}

function _onChatCardAction(event) {
  event.preventDefault();

  // Extract card data
  const button = event.currentTarget;
  const card = button.closest(".chat-card");
  const messageId = button.closest(".message").dataset.messageId;
  const message =  game.messages.get(messageId);
  const action = button.dataset.action;

  // Perform the action.
  if (action == 'xp') {
    // Recover the actor for the chat card
    const actor = card ? _getChatCardActor(card) : null;
    if ( !actor ) return;

    button.disabled = true;
    _chatActionMarkXp(actor, message);
  }

  // Validate permission to proceed with the roll
  if ( !( game.user.isGM ) ) return;
}

/**
 * Get the Actor which is the author of a chat card
 * @param {HTMLElement} card    The chat card being used
 * @return {Actor|null}         The Actor entity or null
 * @private
 */
function _getChatCardActor(card) {

  // Case 1 - a synthetic actor from a Token
  const tokenKey = card.dataset.tokenId;
  if (tokenKey) {
    const [sceneId, tokenId] = tokenKey.split(".");
    const scene = game.scenes.get(sceneId);
    if (!scene) return null;
    const tokenData = scene.getEmbeddedDocument("Token", tokenId);
    if (!tokenData) return null;
    const token = new Token(tokenData);
    return token.actor;
  }

  // Case 2 - use Actor ID directory
  const actorId = card.dataset.actorId;
  return game.actors.get(actorId) || null;
}

async function _chatActionMarkXp(actor, message) {
  if (!actor.data || !actor.data.data.attributes.xp) return;

  let xp = actor.data.data.attributes.xp.value ?? 0;
  let updates = {
    'data.attributes.xp.value': Number(xp) + 1
  };

  // Update the actor.
  await actor.update(updates);

  // Update the chat message.
  let $content = $(message.data.content);
  let $button = $content.find('.xp-button');

  // Replace the button.
  let newButton = `<span class="xp-button button button-disabled">${game.i18n.localize("DW.XpMarked")} <i class="fas fa-check"></i></span>`;
  $button.replaceWith($(newButton));

  if (message.isAuthor || game.user.isGM) {
    await message.update({'content': $content[0].outerHTML});
  }
  else {
    game.socket.emit('system.paranoidworld', {
      message: message.id,
      content: $content[0].outerHTML
    });
  }
}
