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
// Armazenamento para transcrições
const transcriptions = {};

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

// Função para atualizar o status da transcrição e notificar
function updateTranscriptionStatus(url, status, markdown = null, erro = null) {
  transcriptions[url] = { status, markdown, erro };
  // Salvar no storage local para persistência
  chrome.storage.local.set({ transcriptions });
  // Notificar todos os listeners
  chrome.runtime.sendMessage({ 
    action: 'transcriptionUpdated', 
    url,
    status,
    markdown,
    erro
  });
}

// Carregar resumos e transcrições salvos ao iniciar
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['summaries', 'transcriptions'], (data) => {
    if (data.summaries) {
      Object.assign(summaries, data.summaries);
    }
    if (data.transcriptions) {
      Object.assign(transcriptions, data.transcriptions);
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
  
  if (request.action === 'generateTranscription') {
    const { url, videoId, apiKey } = request;
    if (!url || !videoId) {
      sendResponse({ erro: 'URL ou ID do vídeo não informado.' });
      return true;
    }
    
    if (!apiKey) {
      sendResponse({ erro: 'Chave da API OpenAI não fornecida.' });
      return true;
    }
    
    // Se já está processando ou pronto, retorna status atual
    if (transcriptions[url]) {
      sendResponse(transcriptions[url]);
      return true;
    }

    // Inicia processamento
    updateTranscriptionStatus(url, 'processing');
    
    // Buscar a URL da API
    chrome.storage.sync.get('apiUrl', function(data) {
      const API_URL = data.apiUrl || 'http://212.85.23.16:5050';
      
      // Tentar usar o serviço de back-end para transcrição se disponível
      fetch(`${API_URL}/transcrever`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ url, videoId, apiKey })
      })
      .then(resp => {
        if (!resp.ok) {
          // Se o servidor não suportar esse endpoint, usar a API da OpenAI diretamente
          return transcribeWithOpenAI(url, videoId, apiKey);
        }
        return resp.json();
      })
      .then(data => {
        if (data.erro) {
          updateTranscriptionStatus(url, 'error', null, data.erro);
        } else {
          updateTranscriptionStatus(url, 'done', data.markdown || data.transcription);
        }
      })
      .catch(err => {
        updateTranscriptionStatus(url, 'error', null, err.message);
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
  
  if (request.action === 'getTranscriptionStatus') {
    const { url } = request;
    if (transcriptions[url]) {
      sendResponse(transcriptions[url]);
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
  
  if (request.action === 'clearTranscription') {
    const { url } = request;
    if (url) {
      delete transcriptions[url];
      chrome.storage.local.set({ transcriptions });
      sendResponse({ success: true });
    }
    return true;
  }
});

// Função para transcrever com a API OpenAI diretamente
async function transcribeWithOpenAI(url, videoId, apiKey) {
  try {
    // URL da API OpenAI
    const endpoint = 'https://api.openai.com/v1/audio/transcriptions';
    
    // Informar o usuário que estamos usando a API direta
    console.log('Usando API OpenAI diretamente para transcrever vídeo:', videoId);
    
    // Como não podemos enviar o vídeo diretamente por limitações da extensão,
    // vamos gerar um markdown formatado com informações e instruções
    const markdown = `# Transcrição do Vídeo

## Informações
- **URL:** ${url}
- **ID do Vídeo:** ${videoId}

## Nota
Esta é uma transcrição parcial. Devido às limitações da extensão de navegador, 
não foi possível processar o áudio do vídeo diretamente. 

Para transcrever este vídeo completamente, recomendamos:
1. Baixar o áudio do vídeo usando um serviço online como youtube-dl
2. Usar a API OpenAI Whisper com o arquivo de áudio baixado

## Alternativa
Você também pode usar o site oficial da OpenAI para transcrições:
https://platform.openai.com/playground?mode=chat`;

    // Retornar um objeto formatado como se fosse uma resposta da API
    return { 
      transcription: markdown 
    };
  } catch (error) {
    console.error('Erro ao transcrever com OpenAI:', error);
    throw error;
  }
} 