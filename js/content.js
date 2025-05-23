// Criar conexão com o background script
const port = chrome.runtime.connect({name: 'youtube-summarizer'});

// Verificar se estamos em uma página do YouTube
chrome.runtime.sendMessage({action: 'checkYouTube'}, function(response) {
  if (response && response.isYouTube) {
    console.log('YouTube Summarizer está ativo nesta página');
    
    // Extrair ID do vídeo da URL atual
    const videoId = extractVideoId(window.location.href);
    if (videoId) {
      // Informar o background script sobre o vídeo atual
      port.postMessage({
        action: 'getVideoInfo',
        videoId: videoId,
        url: window.location.href
      });
      
      // Verificar se deve adicionar botão à interface (função para uso futuro)
      checkAndAddButton(videoId);
    }
  }
});

// Monitorar mudanças na URL para detectar navegação entre vídeos
let lastUrl = location.href; 
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    
    // Verificar se ainda estamos em uma página de vídeo do YouTube
    if (isYouTubeVideoUrl(url)) {
      const videoId = extractVideoId(url);
      if (videoId) {
        // Atualizar informações do vídeo atual
        port.postMessage({
          action: 'getVideoInfo',
          videoId: videoId,
          url: url
        });
        
        // Atualizar botão na interface (função para uso futuro)
        checkAndAddButton(videoId);
      }
    }
  }
}).observe(document, {subtree: true, childList: true});

// Extrair ID do vídeo da URL
function extractVideoId(url) {
  let videoId = null;
  
  try {
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.includes('youtube.com/watch')) {
      const urlParams = new URLSearchParams(url.split('?')[1]);
      videoId = urlParams.get('v');
    }
  } catch (error) {
    console.error('Erro ao extrair ID do vídeo:', error);
  }
  
  return videoId;
}

// Verificar se a URL é de um vídeo do YouTube
function isYouTubeVideoUrl(url) {
  return url.includes('youtube.com/watch') || url.includes('youtu.be/');
}

// Adicionar botão à interface do YouTube (função para uso futuro)
function checkAndAddButton(videoId) {
  // Esta função pode ser expandida no futuro para adicionar
  // um botão diretamente na interface do YouTube para gerar resumos
  
  // Por exemplo:
  // setTimeout(() => {
  //   const menuContainer = document.querySelector('#menu-container');
  //   if (menuContainer && !document.querySelector('#yt-summarizer-btn')) {
  //     // Adicionar botão...
  //   }
  // }, 1500);
}

// Verificar se estamos em uma página de vídeo do YouTube
function isYouTubeVideoPage() {
  return window.location.href.includes('youtube.com/watch');
}

// Obter o ID do vídeo atual
function getVideoId() {
  const url = new URL(window.location.href);
  return url.searchParams.get('v');
}

// Adicionar botão "Gerar Resumo" na interface do YouTube
function addSummarizeButton() {
  // Verificar se o botão já existe
  if (document.querySelector('.yts-button')) {
    return;
  }

  // Encontrar o local para inserir o botão (abaixo da descrição)
  const targetElement = document.querySelector('#meta');
  if (!targetElement) {
    // Tentar novamente em 1 segundo (a interface do YouTube carrega dinamicamente)
    setTimeout(addSummarizeButton, 1000);
    return;
  }

  // Criar botão
  const button = document.createElement('button');
  button.className = 'yts-button';
  button.innerHTML = '<i class="fa fa-magic"></i> Gerar Resumo com IA';
  button.title = 'Gerar resumo deste vídeo em formato Markdown';
  
  // Adicionar Font Awesome se ainda não existir
  if (!document.querySelector('link[href*="font-awesome"]')) {
    const fontAwesome = document.createElement('link');
    fontAwesome.rel = 'stylesheet';
    fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(fontAwesome);
  }
  
  // Adicionar evento de clique
  button.addEventListener('click', function() {
    const videoId = getVideoId();
    if (videoId) {
      // Abrir popup ou enviar mensagem para a extensão
      chrome.runtime.sendMessage({
        action: 'openPopup',
        videoId: videoId
      });
      
      // Mostrar notificação
      showNotification('Clique no ícone da extensão para gerar o resumo');
    }
  });
  
  // Inserir botão
  targetElement.parentNode.insertBefore(button, targetElement.nextSibling);
}

// Mostrar notificação
function showNotification(message) {
  // Verificar se já existe uma notificação
  let notification = document.querySelector('.yts-notification');
  
  if (notification) {
    // Atualizar mensagem
    notification.querySelector('span').textContent = message;
  } else {
    // Criar notificação
    notification = document.createElement('div');
    notification.className = 'yts-notification';
    notification.innerHTML = `<i class="fa fa-info-circle"></i><span>${message}</span>`;
    document.body.appendChild(notification);
  }
  
  // Exibir
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  
  // Ocultar após 5 segundos
  setTimeout(() => {
    notification.classList.remove('show');
    
    // Remover do DOM após a animação
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 5000);
}

// Verificar mudanças na URL (o YouTube é uma SPA - Single Page Application)
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    if (isYouTubeVideoPage()) {
      setTimeout(addSummarizeButton, 1000);
    }
  }
}).observe(document, {subtree: true, childList: true});

// Inicializar
if (isYouTubeVideoPage()) {
  setTimeout(addSummarizeButton, 1000);
} 