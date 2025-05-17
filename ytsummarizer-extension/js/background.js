// Evento de instalação da extensão
chrome.runtime.onInstalled.addListener(function() {
  console.log('YouTube Summarizer instalado');
  
  // Definir URL do servidor no armazenamento local
  chrome.storage.sync.get('apiUrl', function(data) {
    if (!data.apiUrl) {
      // Usar o endereço IP da VPS (212.85.23.16) com a porta 5050
      chrome.storage.sync.set({apiUrl: 'http://212.85.23.16:5050'});
    }
  });
});

// Habilitar a extensão apenas em páginas do YouTube
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'checkYouTube') {
    // Verifica se a URL é do YouTube
    const isYouTube = sender.tab.url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/);
    sendResponse({isYouTube: isYouTube});
  } else if (request.action === 'getApiUrl') {
    // Retorna a URL da API configurada
    chrome.storage.sync.get('apiUrl', function(data) {
      sendResponse({apiUrl: data.apiUrl || 'http://localhost:5000'});
    });
    return true; // Necessário para resposta assíncrona
  }
});

// Adicionar listener para mensagens do content script
chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === 'youtube-summarizer') {
    port.onMessage.addListener(function(msg) {
      if (msg.action === 'getVideoInfo') {
        // Pode ser usado para ações no futuro
        console.log('Solicitação de informações do vídeo recebida:', msg.videoId);
      }
    });
  }
});

// Armazenamento em memória para status e resultados dos resumos
const summaries = {};

// Função para atualizar o status do resumo e notificar
function updateSummaryStatus(url, status, markdown = null, erro = null) {
  summaries[url] = { status, markdown, erro };
  // Salvar no storage local para persistência
  chrome.storage.local.set({ summaries });
  // Notificar todos os listeners
  chrome.runtime.sendMessage({ 
    action: 'summaryUpdated', 
    url,
    status,
    markdown,
    erro
  });
}

// Carregar resumos salvos ao iniciar
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('summaries', (data) => {
    if (data.summaries) {
      Object.assign(summaries, data.summaries);
    }
  });
});

// Recebe mensagens do popup para gerar resumo e consultar status
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateSummary') {
    const { url, customizacao } = request;
    if (!url) {
      sendResponse({ erro: 'URL não informada.' });
      return;
    }
    
    // Se já está processando ou pronto, retorna status atual
    if (summaries[url]) {
      sendResponse(summaries[url]);
      return;
    }

    // Inicia processamento
    updateSummaryStatus(url, 'processing');
    
    // Buscar a URL da API
    chrome.storage.sync.get('apiUrl', function(data) {
      const API_URL = data.apiUrl || 'http://212.85.23.16:5050';
      
      fetch(`${API_URL}/converter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ url, customizacao })
      })
      .then(resp => resp.json())
      .then(data => {
        if (data.erro) {
          updateSummaryStatus(url, 'error', null, data.erro);
        } else {
          updateSummaryStatus(url, 'done', data.markdown);
        }
      })
      .catch(err => {
        updateSummaryStatus(url, 'error', null, err.message);
      });
    });
    
    sendResponse({ status: 'processing' });
    return true; // resposta assíncrona
  }
  
  if (request.action === 'getSummaryStatus') {
    const { url } = request;
    if (summaries[url]) {
      sendResponse(summaries[url]);
    } else {
      sendResponse({ status: 'none' });
    }
    return true;
  }
  
  if (request.action === 'clearSummary') {
    const { url } = request;
    if (url) {
      delete summaries[url];
      chrome.storage.local.set({ summaries });
      sendResponse({ success: true });
    }
    return true;
  }
}); 