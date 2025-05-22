document.addEventListener('DOMContentLoaded', function() {
  // Teste se o marked está disponível
  if (typeof window.marked !== 'function' && !(window.marked && window.marked.parse)) {
    const errorContainer = document.getElementById('error-container');
    if (errorContainer) {
      errorContainer.textContent = 'Erro crítico: biblioteca de Markdown (marked) não carregada. Verifique sua conexão ou recarregue a extensão.';
      errorContainer.style.display = 'block';
    }
    return;
  }

  // Elementos da interface
  const btnSummarize = document.getElementById('btn-summarize');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const btnCopyMarkdown = document.getElementById('btn-copy-markdown');
  const btnOpenApp = document.getElementById('btn-open-app');
  const btnToggleView = document.getElementById('btn-toggle-view');
  const btnOpenYoutube = document.getElementById('btn-open-youtube');
  const btnShare = document.getElementById('btn-share');
  const btnOpenNotePlan = document.getElementById('btn-open-noteplan');
  const videoTitle = document.getElementById('video-title');
  const videoChannel = document.getElementById('video-channel');
  const videoDate = document.getElementById('video-date');
  const videoViews = document.getElementById('video-views');
  const videoDuration = document.getElementById('video-duration');
  const videoDetails = document.getElementById('video-details');
  const videoThumbnail = document.getElementById('video-thumbnail');
  const loadingPlaceholder = document.getElementById('loading-placeholder');
  const markdownOutput = document.getElementById('markdown-output');
  const markdownPreview = document.getElementById('markdown-preview');
  const resultContainer = document.getElementById('result-container');
  const errorContainer = document.getElementById('error-container');
  const loadingContainer = document.getElementById('loading-container');
  const comentarioInput = document.getElementById('comentario');
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = themeToggle.querySelector('i');
  const linkOptions = document.getElementById('link-options');
  const resultIcon = document.getElementById('result-icon');
  const resultTitle = document.getElementById('result-title');
  const loadingMessage = document.getElementById('loading-message');
  const incluirTranscricaoCheck = document.getElementById('incluir-transcricao');

  // Configurações
  let API_URL = 'http://212.85.23.16:5050'; // URL do servidor remoto na VPS
  let currentVideoId = null;
  let currentVideoUrl = null;
  let currentMarkdown = null;
  let currentTranscription = null;
  let currentContentType = null;
  
  // Obter URL da API das configurações
  chrome.storage.sync.get('apiUrl', function(data) {
    if (data.apiUrl) {
      API_URL = data.apiUrl;
      console.log('API URL carregada das configurações:', API_URL);
    }
  });

  // Inicializa o tema
  inicializarTema();
  
  // Verificar plataforma (para NotePlan)
  checkPlatform();
  
  // Carrega informações do vídeo atual
  getCurrentTab();

  // Event listeners
  btnSummarize.addEventListener('click', gerarResumo);
  btnCopyUrl.addEventListener('click', copiarUrl);
  btnCopyMarkdown.addEventListener('click', copiarMarkdown);
  btnOpenApp.addEventListener('click', abrirNoApp);
  btnToggleView.addEventListener('click', alternarVisualizacao);
  themeToggle.addEventListener('click', alternarTema);
  linkOptions.addEventListener('click', abrirConfiguracoes);
  btnOpenYoutube.addEventListener('click', abrirNoYoutube);
  btnShare.addEventListener('click', compartilharVideo);
  btnOpenNotePlan.addEventListener('click', abrirNotePlan);
  incluirTranscricaoCheck.addEventListener('change', gerarTranscricao);

  // Polling para status do resumo
  let pollInterval = null;
  
  // Limpar polling quando o popup for fechado
  window.addEventListener('unload', () => {
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  });

  // Listener para atualizações do background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'summaryUpdated' && message.url === currentVideoUrl) {
      handleSummaryUpdate(message);
    } else if (message.action === 'transcriptionUpdated' && message.url === currentVideoUrl) {
      handleTranscriptionUpdate(message);
    }
  });

  function handleSummaryUpdate(update) {
    if (update.status === 'done') {
      clearInterval(pollInterval);
      currentMarkdown = update.markdown;
      markdownOutput.value = update.markdown;
      if (typeof window.marked === 'function') {
        markdownPreview.innerHTML = window.marked(update.markdown);
      } else if (window.marked && window.marked.parse) {
        markdownPreview.innerHTML = window.marked.parse(update.markdown);
      } else {
        markdownPreview.innerHTML = `<pre>${update.markdown}</pre>`;
      }
      loadingContainer.style.display = 'none';
      resultContainer.style.display = 'block';
      btnSummarize.disabled = false;
      btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Resumo';
      
      // Atualizar ícone e título
      resultIcon.className = 'fab fa-markdown me-2';
      resultTitle.textContent = 'Resumo';
      currentContentType = 'summary';
      
      checkPlatform();
    } else if (update.status === 'error') {
      clearInterval(pollInterval);
      mostrarErro('Erro ao gerar resumo: ' + update.erro);
      loadingContainer.style.display = 'none';
      btnSummarize.disabled = false;
      btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Resumo';
    }
  }
  
  function handleTranscriptionUpdate(update) {
    if (update.status === 'done') {
      clearInterval(pollInterval);
      currentTranscription = update.markdown;
      markdownOutput.value = update.markdown;
      if (typeof window.marked === 'function') {
        markdownPreview.innerHTML = window.marked(update.markdown);
      } else if (window.marked && window.marked.parse) {
        markdownPreview.innerHTML = window.marked.parse(update.markdown);
      } else {
        markdownPreview.innerHTML = `<pre>${update.markdown}</pre>`;
      }
      loadingContainer.style.display = 'none';
      resultContainer.style.display = 'block';
      btnTranscribe.disabled = false;
      btnTranscribe.innerHTML = '<i class="fas fa-microphone-alt me-1"></i> Transcrição';
      
      // Atualizar ícone e título
      resultIcon.className = 'fas fa-microphone-alt me-2';
      resultTitle.textContent = 'Transcrição';
      currentContentType = 'transcription';
      
      checkPlatform();
    } else if (update.status === 'error') {
      clearInterval(pollInterval);
      mostrarErro('Erro ao gerar transcrição: ' + update.erro);
      loadingContainer.style.display = 'none';
      btnTranscribe.disabled = false;
      btnTranscribe.innerHTML = '<i class="fas fa-microphone-alt me-1"></i> Transcrição';
    }
  }

  function pollSummaryStatus() {
    if (pollInterval) clearInterval(pollInterval);
    
    // Verificar status imediatamente
    chrome.runtime.sendMessage({ action: 'getSummaryStatus', url: currentVideoUrl }, handleSummaryUpdate);
    
    // Iniciar polling
    pollInterval = setInterval(() => {
      chrome.runtime.sendMessage({ action: 'getSummaryStatus', url: currentVideoUrl }, handleSummaryUpdate);
    }, 1500);
  }
  
  function pollTranscriptionStatus() {
    if (pollInterval) clearInterval(pollInterval);
    
    // Verificar status imediatamente
    chrome.runtime.sendMessage({ action: 'getTranscriptionStatus', url: currentVideoUrl }, handleTranscriptionUpdate);
    
    // Iniciar polling
    pollInterval = setInterval(() => {
      chrome.runtime.sendMessage({ action: 'getTranscriptionStatus', url: currentVideoUrl }, handleTranscriptionUpdate);
    }, 1500);
  }

  // Função para restaurar estado do resumo quando o popup abrir
  function restaurarEstado() {
    if (!currentVideoUrl) return;
    
    // Verificar estado do resumo
    chrome.runtime.sendMessage({ action: 'getSummaryStatus', url: currentVideoUrl }, (response) => {
      if (response && response.status !== 'none') {
        if (response.status === 'done' && response.markdown) {
          currentMarkdown = response.markdown;
          // Mostrar apenas se não estivermos exibindo outra coisa
          if (!currentContentType || currentContentType === 'summary') {
            markdownOutput.value = response.markdown;
            if (typeof window.marked === 'function') {
              markdownPreview.innerHTML = window.marked(response.markdown);
            } else if (window.marked && window.marked.parse) {
              markdownPreview.innerHTML = window.marked.parse(response.markdown);
            } else {
              markdownPreview.innerHTML = `<pre>${response.markdown}</pre>`;
            }
            loadingContainer.style.display = 'none';
            resultContainer.style.display = 'block';
            resultIcon.className = 'fab fa-markdown me-2';
            resultTitle.textContent = 'Resumo';
            currentContentType = 'summary';
          }
          btnSummarize.disabled = false;
          btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Resumo';
        } else if (response.status === 'processing' && (!currentContentType || currentContentType === 'summary')) {
          loadingContainer.style.display = 'block';
          loadingMessage.textContent = 'Gerando resumo com IA...';
          resultContainer.style.display = 'none';
          btnSummarize.disabled = true;
          btnSummarize.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Processando...';
          pollSummaryStatus();
        } else if (response.status === 'error') {
          mostrarErro('Erro ao gerar resumo: ' + response.erro);
          loadingContainer.style.display = 'none';
          btnSummarize.disabled = false;
          btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Resumo';
        }
      }
    });
    
    // Verificar estado da transcrição
    chrome.runtime.sendMessage({ action: 'getTranscriptionStatus', url: currentVideoUrl }, (response) => {
      if (response && response.status !== 'none') {
        if (response.status === 'done' && response.markdown) {
          currentTranscription = response.markdown;
          // Mostrar apenas se estivermos no modo transcrição
          if (currentContentType === 'transcription') {
            markdownOutput.value = response.markdown;
            if (typeof window.marked === 'function') {
              markdownPreview.innerHTML = window.marked(response.markdown);
            } else if (window.marked && window.marked.parse) {
              markdownPreview.innerHTML = window.marked.parse(response.markdown);
            } else {
              markdownPreview.innerHTML = `<pre>${response.markdown}</pre>`;
            }
            loadingContainer.style.display = 'none';
            resultContainer.style.display = 'block';
            resultIcon.className = 'fas fa-microphone-alt me-2';
            resultTitle.textContent = 'Transcrição';
          }
          btnTranscribe.disabled = false;
          btnTranscribe.innerHTML = '<i class="fas fa-microphone-alt me-1"></i> Transcrição';
        } else if (response.status === 'processing' && currentContentType === 'transcription') {
          loadingContainer.style.display = 'block';
          loadingMessage.textContent = 'Gerando transcrição com IA...';
          resultContainer.style.display = 'none';
          btnTranscribe.disabled = true;
          btnTranscribe.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Processando...';
          pollTranscriptionStatus();
        } else if (response.status === 'error') {
          mostrarErro('Erro ao gerar transcrição: ' + response.erro);
          loadingContainer.style.display = 'none';
          btnTranscribe.disabled = false;
          btnTranscribe.innerHTML = '<i class="fas fa-microphone-alt me-1"></i> Transcrição';
        }
      }
    });
  }

  // Função para obter a aba atual do Chrome
  function getCurrentTab() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      
      if (currentTab && isYouTubeUrl(currentTab.url)) {
        currentVideoUrl = currentTab.url;
        currentVideoId = extractVideoId(currentTab.url);
        
        if (currentVideoId) {
          console.log('Vídeo do YouTube detectado:', currentVideoId);
          obterInfoVideo(currentVideoId);
          // Restaurar estado após obter informações do vídeo
          setTimeout(restaurarEstado, 100);
        } else {
          mostrarErro('Não foi possível extrair o ID do vídeo.');
          ocultarPlaceholder();
        }
      } else {
        // Tentar executar script na página para obter URL de elementos do YouTube
        chrome.tabs.executeScript(
          tabs[0].id,
          { 
            code: `
              // Tentar encontrar URL do vídeo na página
              var videoUrl = '';
              
              // Verificar se há um player de vídeo do YouTube na página
              var ytPlayer = document.querySelector('video');
              if (ytPlayer) {
                // Tentar obter URL das meta tags
                var ogUrlMeta = document.querySelector('meta[property="og:url"]');
                if (ogUrlMeta) {
                  videoUrl = ogUrlMeta.getAttribute('content');
                }
                
                // Ou do URL da página se estiver em uma página de vídeo
                if (!videoUrl && window.location.href.includes('/watch?v=')) {
                  videoUrl = window.location.href;
                }
              }
              
              videoUrl;
            `
          },
          function(results) {
            if (chrome.runtime.lastError) {
              console.error('Erro ao executar script:', chrome.runtime.lastError);
              mostrarErro('Esta extensão só funciona em páginas do YouTube.');
              ocultarPlaceholder();
              return;
            }
            
            if (results && results[0] && isYouTubeUrl(results[0])) {
              currentVideoUrl = results[0];
              currentVideoId = extractVideoId(currentVideoUrl);
              
              if (currentVideoId) {
                obterInfoVideo(currentVideoId);
              } else {
                mostrarErro('Não foi possível extrair o ID do vídeo.');
                ocultarPlaceholder();
              }
            } else {
              mostrarErro('Esta extensão só funciona em páginas do YouTube.');
              ocultarPlaceholder();
            }
          }
        );
      }
    });
  }

  // Verificar se é uma URL do YouTube
  function isYouTubeUrl(url) {
    return url && url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/);
  }

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

  // Obter informações do vídeo via API
  function obterInfoVideo(videoId) {
    // Mostrar indicativo visual de carregamento
    console.log('Obtendo informações do vídeo:', videoId, 'API:', API_URL);
    
    fetch(`${API_URL}/preview?video_id=${videoId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      mode: 'cors'
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.erro) {
          throw new Error(data.erro);
        }
        
        atualizarInfoVideo(data);
        ocultarPlaceholder();
      })
      .catch(error => {
        console.error('Erro ao obter informações do vídeo:', error);
        
        // Mensagem de erro mais detalhada
        let mensagemErro = `Erro ao obter informações do vídeo: ${error.message}`;
        
        // Verificar se é erro de conexão
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          mensagemErro = `Não foi possível conectar ao servidor (${API_URL}). Verifique se:
          1. O servidor está rodando
          2. A URL da API está correta nas configurações
          3. Não há bloqueio de CORS`;
        }
        
        mostrarErro(mensagemErro);
        ocultarPlaceholder();
        
        // Exibir link para configurações
        document.getElementById('link-options').style.color = 'red';
      });
  }

  // Atualizar informações do vídeo na interface
  function atualizarInfoVideo(info) {
    videoTitle.textContent = info.title || 'Título não disponível';
    videoChannel.textContent = info.channel || 'Canal não disponível';
    
    // Adicionar miniatura do vídeo
    const thumbEl = document.getElementById('video-thumbnail-img');
    if (info.thumbnail && thumbEl) {
      thumbEl.src = info.thumbnail;
      thumbEl.style.display = '';
    } else if (thumbEl) {
      thumbEl.style.display = 'none';
    }
    
    // Atualizar data de publicação formatada
    if (info.formattedDate) {
      videoDate.textContent = info.formattedDate;
    } else if (info.publishedAt) {
      const dataPublicacao = new Date(info.publishedAt);
      videoDate.textContent = dataPublicacao.toLocaleDateString('pt-BR');
    } else {
      videoDate.textContent = '-';
    }
    
    // Atualizar visualizações
    if (info.views && info.views !== 'N/A') {
      // Formatar número com separador de milhar
      const numeroVisualizacoes = parseInt(info.views);
      videoViews.textContent = numeroVisualizacoes.toLocaleString('pt-BR');
    } else {
      videoViews.textContent = '-';
    }
    
    // Atualizar duração
    if (info.duration) {
      videoDuration.textContent = info.duration;
    } else {
      videoDuration.textContent = '-';
    }
    
    videoDetails.style.display = 'block';
    
    // Habilitar os botões de URL
    btnCopyUrl.disabled = false;
    btnOpenYoutube.disabled = false;
    btnShare.disabled = false;
  }
  
  // Abrir o vídeo no YouTube
  function abrirNoYoutube() {
    if (!currentVideoUrl) return;
    
    chrome.tabs.create({ url: currentVideoUrl });
  }
  
  // Compartilhar o vídeo (criar um link de compartilhamento)
  function compartilharVideo() {
    if (!currentVideoId) return;
    
    const shareUrl = `https://youtu.be/${currentVideoId}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        mostrarMensagem('Link de compartilhamento copiado!', 'success');
      })
      .catch(err => {
        mostrarMensagem('Erro ao copiar link: ' + err.message, 'error');
      });
  }
  
  // Mostrar mensagem de sucesso/erro
  function mostrarMensagem(texto, tipo) {
    const mensagem = document.createElement('div');
    mensagem.className = `alert alert-${tipo === 'success' ? 'success' : 'danger'} message-popup`;
    mensagem.textContent = texto;
    document.body.appendChild(mensagem);
    
    setTimeout(() => {
      mensagem.remove();
    }, 3000);
  }

  // Ocultar placeholder de carregamento
  function ocultarPlaceholder() {
    loadingPlaceholder.style.display = 'none';
  }

  // Gerar resumo do vídeo (agora via background)
  function gerarResumo() {
    if (!currentVideoUrl || !currentVideoId) {
      mostrarErro('Não foi possível identificar o vídeo atual.');
      return;
    }
    
    // Limpar erro anterior
    errorContainer.style.display = 'none';
    
    // Desativar botão enquanto processa
    btnSummarize.disabled = true;
    btnSummarize.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Processando...';
    
    // Mostrar carregamento
    loadingContainer.style.display = 'block';
    loadingMessage.textContent = 'Gerando resumo com IA...';
    resultContainer.style.display = 'none';
    
    // Atualizar tipo de conteúdo
    currentContentType = 'summary';
    
    // Preparar dados para requisição
    const customizacao = {
      comentario: comentarioInput.value.trim(),
      incluirTranscricao: incluirTranscricaoCheck.checked
    };
    
    // Chamar background para gerar resumo
    chrome.runtime.sendMessage({
      action: 'generateSummary',
      url: currentVideoUrl,
      customizacao
    }, (response) => {
      if (response.status === 'processing') {
        // Iniciar polling de status
        pollSummaryStatus();
      } else if (response.status === 'error') {
        mostrarErro('Erro ao gerar resumo: ' + response.erro);
        loadingContainer.style.display = 'none';
        btnSummarize.disabled = false;
        btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Resumo';
      }
    });
  }

  // Gerar transcrição
  function gerarTranscricao() {
    if (!currentVideoUrl || !currentVideoId) {
      mostrarErro('Não foi possível identificar o vídeo atual.');
      return;
    }
    
    // Pedir chave API OpenAI
    chrome.storage.sync.get('openaiKey', function(data) {
      let apiKey = data.openaiKey || '';
      
      if (!apiKey) {
        apiKey = prompt('Para transcrever o vídeo, é necessária uma chave da API da OpenAI (começa com "sk-"). Por favor, insira sua chave:');
        
        if (!apiKey) {
          mostrarErro('Chave da API OpenAI não fornecida. A transcrição não pode ser realizada.');
          return;
        }
        
        // Salvar chave para uso futuro
        chrome.storage.sync.set({ openaiKey: apiKey });
      }
      
      // Limpar erro anterior
      errorContainer.style.display = 'none';
      
      // Desativar botão enquanto processa
      btnTranscribe.disabled = true;
      btnTranscribe.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Processando...';
      
      // Mostrar carregamento
      loadingContainer.style.display = 'block';
      loadingMessage.textContent = 'Gerando transcrição com IA...';
      resultContainer.style.display = 'none';
      
      // Atualizar tipo de conteúdo
      currentContentType = 'transcription';
      
      // Chamar background para gerar transcrição
      chrome.runtime.sendMessage({
        action: 'generateTranscription',
        url: currentVideoUrl,
        videoId: currentVideoId,
        apiKey: apiKey
      }, (response) => {
        if (response.status === 'processing') {
          // Iniciar polling de status
          pollTranscriptionStatus();
        } else if (response.status === 'error') {
          mostrarErro('Erro ao gerar transcrição: ' + response.erro);
          loadingContainer.style.display = 'none';
          btnTranscribe.disabled = false;
          btnTranscribe.innerHTML = '<i class="fas fa-microphone-alt me-1"></i> Transcrição';
        }
      });
    });
  }

  // Copiar URL para a área de transferência
  function copiarUrl() {
    if (!currentVideoUrl) return;
    
    navigator.clipboard.writeText(currentVideoUrl)
      .then(() => {
        btnCopyUrl.classList.add('copied');
        setTimeout(() => btnCopyUrl.classList.remove('copied'), 1000);
      })
      .catch(err => {
        console.error('Erro ao copiar URL:', err);
      });
  }

  // Copiar markdown para a área de transferência
  function copiarMarkdown() {
    if (!currentMarkdown) return;
    
    navigator.clipboard.writeText(currentMarkdown)
      .then(() => {
        btnCopyMarkdown.classList.add('copied');
        setTimeout(() => btnCopyMarkdown.classList.remove('copied'), 1000);
      })
      .catch(err => {
        console.error('Erro ao copiar markdown:', err);
      });
  }

  // Abrir no app
  function abrirNoApp() {
    if (!currentVideoUrl) return;
    
    const appUrl = `${API_URL}/?url=${encodeURIComponent(currentVideoUrl)}`;
    chrome.tabs.create({ url: appUrl });
  }
  
  // Abrir no NotePlan
  function abrirNotePlan() {
    if (!currentMarkdown) {
      mostrarMensagem('Gere um resumo primeiro!', 'error');
      return;
    }
    
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    if (!isMac) {
      mostrarMensagem('O NotePlan está disponível apenas para macOS', 'error');
      return;
    }
    
    const noteplanUrl = gerarLinkNotePlan(currentMarkdown);
    chrome.tabs.create({ url: noteplanUrl });
    mostrarMensagem('Abrindo no NotePlan...', 'success');
  }
  
  // Gerar link para o NotePlan
  function gerarLinkNotePlan(markdown) {
    // Codificar o markdown para URL
    const encodedText = encodeURIComponent(markdown);
    
    // Criar URL do protocolo do NotePlan
    return `noteplan://x-callback-url/addNote?text=${encodedText}&folder=YouTube`;
  }

  // Alternar entre visualização de markdown e preview
  function alternarVisualizacao() {
    const isMarkdownVisible = markdownOutput.style.display !== 'none';
    
    if (isMarkdownVisible) {
      markdownOutput.style.display = 'none';
      markdownPreview.style.display = 'block';
      btnToggleView.innerHTML = '<i class="fas fa-code"></i>';
    } else {
      markdownOutput.style.display = 'block';
      markdownPreview.style.display = 'none';
      btnToggleView.innerHTML = '<i class="fas fa-eye"></i>';
    }
  }

  // Mostrar mensagem de erro
  function mostrarErro(mensagem) {
    errorContainer.textContent = mensagem;
    errorContainer.style.display = 'block';
  }
  
  // Verificar se estamos no MacOS (para NotePlan)
  function checkPlatform() {
    // Verificar se estamos no Mac
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    console.log('Plataforma detectada:', navigator.platform, 'isMac:', isMac);
    
    // Se não for Mac, adicionar uma classe visual para indicar
    if (!isMac) {
      btnOpenNotePlan.title = "NotePlan só funciona no macOS";
      btnOpenNotePlan.classList.add('non-mac-platform');
    } else {
      btnOpenNotePlan.title = "Abrir resumo no NotePlan";
      btnOpenNotePlan.classList.remove('non-mac-platform');
    }
  }

  // Inicializar tema
  function inicializarTema() {
    // Verificar se há uma preferência salva
    const temaSalvo = localStorage.getItem('darkMode');
    
    // Se o usuário já escolheu o tema escuro, ou se o navegador está em modo escuro e o usuário não escolheu tema
    if (temaSalvo === 'true' || (window.matchMedia('(prefers-color-scheme: dark)').matches && !temaSalvo)) {
      document.body.classList.add('dark-mode');
      themeIcon.classList.remove('fa-moon');
      themeIcon.classList.add('fa-sun');
    }
  }
  
  // Alternar tema
  function alternarTema() {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    
    // Atualizar ícone
    if (isDarkMode) {
      themeIcon.classList.remove('fa-moon');
      themeIcon.classList.add('fa-sun');
    } else {
      themeIcon.classList.remove('fa-sun');
      themeIcon.classList.add('fa-moon');
    }
    
    // Salvar preferência do usuário
    localStorage.setItem('darkMode', isDarkMode);
  }

  // Abrir página de configurações
  function abrirConfiguracoes() {
    chrome.runtime.openOptionsPage();
    window.close(); // Fechar popup ao abrir as configurações
  }
}); 