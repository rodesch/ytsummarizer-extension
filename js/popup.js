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
  const btnCopyTranscript = document.getElementById('btn-copy-transcript');
  const btnToggleTranscriptView = document.getElementById('btn-toggle-transcript-view');
  const btnGenerateFromTranscript = document.getElementById('btn-generate-from-transcript');
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
  const transcriptOutput = document.getElementById('transcript-output');
  const transcriptPreview = document.getElementById('transcript-preview');
  const resultContainer = document.getElementById('result-container');
  const errorContainer = document.getElementById('error-container');
  const loadingContainer = document.getElementById('loading-container');
  const comentarioInput = document.getElementById('comentario');
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = themeToggle.querySelector('i');
  const linkOptions = document.getElementById('link-options');

  // Configurações
  let currentVideoId = null;
  let currentVideoUrl = null;
  let currentMarkdown = null;
  let currentTranscript = null; // Armazenar transcrição completa
  let currentVideoInfo = null; // Armazenar informações completas do vídeo
  let lastVideoId = null; // Para detectar mudanças de vídeo

  // Inicializa o tema
  inicializarTema();
  
  // Verificar plataforma (para NotePlan)
  checkPlatform();
  
  // Limpar resumos antigos (executa em background)
  limparResumosAntigos();
  
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
  btnCopyTranscript.addEventListener('click', copiarTranscricao);
  btnToggleTranscriptView.addEventListener('click', alternarVisualizacaoTranscricao);
  btnGenerateFromTranscript.addEventListener('click', gerarResumo);

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
    }
  });

  function handleSummaryUpdate(update) {
    if (update.status === 'done') {
      clearInterval(pollInterval);
      currentMarkdown = update.markdown;
      markdownOutput.value = update.markdown;
      
      // Atualizar transcrição se disponível
      if (update.transcript) {
        currentTranscript = update.transcript;
        transcriptOutput.value = update.transcript;
        transcriptPreview.innerHTML = `<pre>${update.transcript}</pre>`;
      }
      
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
      btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Gerar Resumo';
      checkPlatform();
      
      // Salvar resumo e transcrição localmente para persistência
      salvarResumoLocal(currentVideoUrl, update.markdown, currentVideoInfo, update.transcript);
    } else if (update.status === 'error') {
      clearInterval(pollInterval);
      mostrarErro('Erro ao gerar resumo: ' + update.erro);
      loadingContainer.style.display = 'none';
      btnSummarize.disabled = false;
      btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Gerar Resumo';
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

  // Função para salvar resumo localmente
  function salvarResumoLocal(videoUrl, markdown, videoInfo, transcript = null) {
    if (!videoUrl || !markdown) return;
    
    const resumoData = {
      markdown: markdown,
      transcript: transcript,
      videoInfo: videoInfo,
      timestamp: Date.now(),
      url: videoUrl
    };
    
    // Usar videoId como chave para facilitar limpeza
    const videoId = extractVideoId(videoUrl);
    const storageKey = `resumo_${videoId}`;
    
    chrome.storage.local.set({ [storageKey]: resumoData }, () => {
      console.log('Resumo salvo localmente para:', videoId);
    });
  }

  // Função para recuperar resumo local
  function recuperarResumoLocal(videoUrl) {
    return new Promise((resolve) => {
      if (!videoUrl) {
        resolve(null);
        return;
      }
      
      const videoId = extractVideoId(videoUrl);
      const storageKey = `resumo_${videoId}`;
      
      chrome.storage.local.get([storageKey], (result) => {
        if (result[storageKey]) {
          console.log('Resumo recuperado localmente para:', videoId);
          resolve(result[storageKey]);
        } else {
          resolve(null);
        }
      });
    });
  }

  // Função para limpar resumos antigos (opcional - para manter storage limpo)
  function limparResumosAntigos() {
    chrome.storage.local.get(null, (items) => {
      const agora = Date.now();
      const umDiaEmMs = 24 * 60 * 60 * 1000; // 1 dia
      
      for (const key in items) {
        if (key.startsWith('resumo_') && items[key].timestamp) {
          // Remover resumos com mais de 1 dia
          if (agora - items[key].timestamp > umDiaEmMs) {
            chrome.storage.local.remove([key]);
            console.log('Resumo antigo removido:', key);
          }
        }
      }
    });
  }

  // Função para limpar estado quando mudar de vídeo
  function limparEstadoAnterior() {
    // Resetar variáveis
    currentMarkdown = null;
    currentTranscript = null;
    currentVideoInfo = null;
    
    // Limpar interface
    markdownOutput.value = '';
    markdownPreview.innerHTML = '';
    transcriptOutput.value = '';
    transcriptPreview.innerHTML = '';
    resultContainer.style.display = 'none';
    errorContainer.style.display = 'none';
    loadingContainer.style.display = 'none';
    
    // Resetar botão
    btnSummarize.disabled = false;
    btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Gerar Resumo';
    
    // Parar polling se estiver ativo
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // Função para restaurar estado do resumo quando o popup abrir
  function restaurarEstado() {
    if (!currentVideoUrl) return;
    
    // Primeiro tentar recuperar do storage local
    recuperarResumoLocal(currentVideoUrl).then(resumoLocal => {
      if (resumoLocal && resumoLocal.markdown) {
        console.log('Restaurando resumo do storage local');
        currentMarkdown = resumoLocal.markdown;
        
        // Restaurar transcrição se disponível
        if (resumoLocal.transcript) {
          currentTranscript = resumoLocal.transcript;
          transcriptOutput.value = resumoLocal.transcript;
          transcriptPreview.innerHTML = `<pre>${resumoLocal.transcript}</pre>`;
        }
        
        // Restaurar informações do vídeo se disponíveis
        if (resumoLocal.videoInfo) {
          currentVideoInfo = resumoLocal.videoInfo;
        }
        
        // Atualizar interface
        markdownOutput.value = resumoLocal.markdown;
        if (typeof window.marked === 'function') {
          markdownPreview.innerHTML = window.marked(resumoLocal.markdown);
        } else if (window.marked && window.marked.parse) {
          markdownPreview.innerHTML = window.marked.parse(resumoLocal.markdown);
        } else {
          markdownPreview.innerHTML = `<pre>${resumoLocal.markdown}</pre>`;
        }
        loadingContainer.style.display = 'none';
        resultContainer.style.display = 'block';
        btnSummarize.disabled = false;
        btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Gerar Resumo';
        checkPlatform();
      } else {
        // Se não houver resumo local, verificar status do background
        chrome.runtime.sendMessage({ action: 'getSummaryStatus', url: currentVideoUrl }, (response) => {
          if (response && response.status !== 'none') {
            if (response.status === 'done' && response.markdown) {
              currentMarkdown = response.markdown;
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
              btnSummarize.disabled = false;
              btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Gerar Resumo';
              
              // Salvar no storage local para próximas aberturas
              salvarResumoLocal(currentVideoUrl, response.markdown, currentVideoInfo);
            } else if (response.status === 'processing') {
              loadingContainer.style.display = 'block';
              resultContainer.style.display = 'none';
              btnSummarize.disabled = true;
              btnSummarize.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Processando...';
              pollSummaryStatus();
            } else if (response.status === 'error') {
              mostrarErro('Erro ao gerar resumo: ' + response.erro);
              loadingContainer.style.display = 'none';
              btnSummarize.disabled = false;
              btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Gerar Resumo';
            }
          }
        });
      }
    });
  }

  // Função para obter a aba atual do Chrome
  function getCurrentTab() {
    console.log('Iniciando getCurrentTab...');
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      console.log('Aba atual:', currentTab?.url);
      
      if (currentTab && isYouTubeUrl(currentTab.url)) {
        currentVideoUrl = currentTab.url;
        currentVideoId = extractVideoId(currentTab.url);
        
        if (currentVideoId) {
          console.log('Vídeo do YouTube detectado:', currentVideoId);
          
          // Verificar se mudou de vídeo
          if (lastVideoId && lastVideoId !== currentVideoId) {
            console.log('Mudança de vídeo detectada. Limpando estado anterior.');
            limparEstadoAnterior();
          }
          lastVideoId = currentVideoId;
          
          obterInfoVideo(currentVideoId);
          // Restaurar estado após obter informações do vídeo
          setTimeout(restaurarEstado, 100);
        } else {
          console.error('Não foi possível extrair o ID do vídeo da URL:', currentTab.url);
          mostrarErro('Não foi possível extrair o ID do vídeo.');
          ocultarPlaceholder();
        }
      } else {
        // Tentar executar script na página para obter URL de elementos do YouTube
        chrome.scripting.executeScript(
          {
            target: { tabId: tabs[0].id },
            func: function() {
              // Tentar encontrar URL do vídeo na página
              let videoUrl = '';
              
              // Verificar se há um player de vídeo do YouTube na página
              const ytPlayer = document.querySelector('video');
              if (ytPlayer) {
                // Tentar obter URL das meta tags
                const ogUrlMeta = document.querySelector('meta[property="og:url"]');
                if (ogUrlMeta) {
                  videoUrl = ogUrlMeta.getAttribute('content');
                }
                
                // Ou do URL da página se estiver em uma página de vídeo
                if (!videoUrl && window.location.href.includes('/watch?v=')) {
                  videoUrl = window.location.href;
                }
              }
              
              return videoUrl;
            }
          }
        ).then(results => {
          if (results && results[0] && results[0].result && isYouTubeUrl(results[0].result)) {
            currentVideoUrl = results[0].result;
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
        }).catch(error => {
          console.error('Erro ao executar script:', error);
          mostrarErro('Esta extensão só funciona em páginas do YouTube.');
          ocultarPlaceholder();
        });
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
    console.log('Obtendo informações do vídeo:', videoId);
    
    // Definir timeout para evitar carregamento infinito
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout ao obter informações')), 10000);
    });
    
    // Obter informações do vídeo usando extração da página
    Promise.race([obterInfoVideoYouTube(videoId), timeout])
      .then(data => {
        console.log('Informações obtidas:', data);
        atualizarInfoVideo(data);
        ocultarPlaceholder();
      })
      .catch(error => {
        console.error('Erro ao obter informações do vídeo:', error);
        
        // Usar fallback sempre que algo falhar
        console.log('Usando fallback para videoId:', videoId);
        obterInfoVideoFallback(videoId)
          .then(data => {
            console.log('Fallback aplicado:', data);
            atualizarInfoVideo(data);
            ocultarPlaceholder();
          })
          .catch(fallbackError => {
            console.error('Erro no fallback:', fallbackError);
            mostrarErro('Não foi possível obter informações do vídeo. Tente recarregar a página.');
            ocultarPlaceholder();
          });
      });
  }

  // Função para obter informações do vídeo diretamente do YouTube
  function obterInfoVideoYouTube(videoId) {
    return new Promise((resolve, reject) => {
      // Tentar extrair informações da página atual se estivermos no YouTube
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTab = tabs[0];
        
        if (currentTab && isYouTubeUrl(currentTab.url)) {
          // Usar chrome.scripting.executeScript para Manifest V3
          chrome.scripting.executeScript(
            {
              target: { tabId: currentTab.id },
              func: function(videoId) {
                try {
                  // Tentar obter título
                  let title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent ||
                             document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')?.textContent ||
                             document.querySelector('h1[class*="title"]')?.textContent ||
                             document.querySelector('meta[property="og:title"]')?.content ||
                             document.title.replace(' - YouTube', '');
                  
                  // Tentar obter canal com seletores mais robustos
                  let channel = document.querySelector('ytd-channel-name #container #text-container yt-formatted-string a')?.textContent ||
                               document.querySelector('ytd-channel-name a')?.textContent ||
                               document.querySelector('#owner-text a')?.textContent ||
                               document.querySelector('#channel-name a')?.textContent ||
                               document.querySelector('a.yt-simple-endpoint.style-scope.yt-formatted-string')?.textContent ||
                               document.querySelector('[id="owner-text"] a')?.textContent ||
                               document.querySelector('.ytd-video-owner-renderer a')?.textContent ||
                               document.querySelector('a[class*="channel"]')?.textContent ||
                               document.querySelector('meta[name="author"]')?.content ||
                               'Canal não disponível';
                  
                  // Thumbnail
                  let thumbnail = document.querySelector('meta[property="og:image"]')?.content ||
                                 `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
                  
                  // Tentar obter views
                  let views = 'N/A';
                  const viewsElements = [
                    document.querySelector('#info .view-count'),
                    document.querySelector('.view-count'),
                    document.querySelector('[class*="view"]'),
                    ...document.querySelectorAll('span')
                  ];
                  
                  for (const element of viewsElements) {
                    if (element && element.textContent && element.textContent.includes('visualizaç')) {
                      views = element.textContent.trim();
                      break;
                    }
                  }
                  
                  // Tentar obter duração
                  let duration = 'N/A';
                  const durationElement = document.querySelector('.ytp-time-duration') ||
                                         document.querySelector('meta[property="video:duration"]');
                  if (durationElement) {
                    duration = durationElement.textContent || durationElement.content;
                  }
                  
                  return {
                    title: title?.trim() || 'Vídeo do YouTube',
                    channel: channel?.trim() || 'Canal não disponível',
                    thumbnail: thumbnail,
                    views: views,
                    publishedAt: 'N/A',
                    duration: duration,
                    videoId: videoId
                  };
                } catch (e) {
                  console.error('Erro ao extrair dados:', e);
                  return {
                    title: 'Vídeo do YouTube',
                    channel: 'Canal não disponível',
                    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                    views: 'N/A',
                    publishedAt: 'N/A',
                    duration: 'N/A',
                    videoId: videoId
                  };
                }
              },
              args: [videoId]
            }
          ).then(results => {
            if (results && results[0] && results[0].result) {
              resolve(results[0].result);
            } else {
              reject(new Error('Não foi possível extrair informações da página'));
            }
          }).catch(error => {
            console.error('Erro no chrome.scripting.executeScript:', error);
            reject(error);
          });
        } else {
          reject(new Error('Não está em uma página do YouTube'));
        }
      });
    });
  }

  // Função fallback para obter informações básicas
  function obterInfoVideoFallback(videoId) {
    return Promise.resolve({
      title: 'Vídeo do YouTube',
      channel: 'Canal não disponível',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      views: 'N/A',
      publishedAt: 'N/A',
      duration: 'N/A',
      videoId: videoId
    });
  }

  // Atualizar informações do vídeo na interface
  function atualizarInfoVideo(info) {
    // Armazenar informações globalmente para uso no NotePlan
    currentVideoInfo = info;
    
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
    if (!currentVideoUrl) {
      mostrarErro('URL do vídeo não encontrada.');
      return;
    }
    
    // Limpar resumo anterior se existir
    if (currentMarkdown) {
      const videoId = extractVideoId(currentVideoUrl);
      if (videoId) {
        chrome.storage.local.remove([`resumo_${videoId}`]);
        chrome.runtime.sendMessage({ action: 'clearSummary', url: currentVideoUrl });
        console.log('Resumo anterior limpo para novo resumo');
      }
    }
    
    // Mostrar indicador de carregamento
    resultContainer.style.display = 'none';
    errorContainer.style.display = 'none';
    loadingContainer.style.display = 'block';
    btnSummarize.disabled = true;
    btnSummarize.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Processando...';
    // Preparar dados de customização
    const customizacao = {
      comentario: comentarioInput.value.trim()
    };
    // Solicitar geração ao background
    chrome.runtime.sendMessage({
      action: 'generateSummary',
      url: currentVideoUrl,
      customizacao
    }, function(response) {
      if (response && response.erro) {
        mostrarErro('Erro ao iniciar geração: ' + response.erro);
        loadingContainer.style.display = 'none';
        btnSummarize.disabled = false;
        btnSummarize.innerHTML = '<i class="fas fa-magic me-1"></i> Gerar Resumo';
        return;
      }
      // Iniciar polling para status
      pollSummaryStatus();
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
    
    // Criar versão completa com informações do vídeo
    let markdownCompleto = '';
    
    if (currentVideoInfo) {
      const titulo = currentVideoInfo.title || 'Vídeo do YouTube';
      const canal = currentVideoInfo.channel || 'Canal não disponível';
      const thumbnail = currentVideoInfo.thumbnail || `https://img.youtube.com/vi/${currentVideoId}/maxresdefault.jpg`;
      const videoLink = currentVideoUrl || `https://youtu.be/${currentVideoId}`;
      
      markdownCompleto += `# ${titulo}\n\n`;
      markdownCompleto += `**Canal:** ${canal}\n\n`;
      markdownCompleto += `**Link:** ${videoLink}\n\n`;
      markdownCompleto += `**Thumbnail:** ![Thumbnail](${thumbnail})\n\n`;
      markdownCompleto += `**Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n`;
      markdownCompleto += `---\n\n`;
      markdownCompleto += currentMarkdown;
    } else {
      markdownCompleto = currentMarkdown;
    }
    
    navigator.clipboard.writeText(markdownCompleto)
      .then(() => {
        btnCopyMarkdown.classList.add('copied');
        setTimeout(() => btnCopyMarkdown.classList.remove('copied'), 1000);
      })
      .catch(err => {
        console.error('Erro ao copiar markdown:', err);
      });
  }

  // Abrir no app (função desabilitada - sem servidor externo)
  function abrirNoApp() {
    mostrarMensagem('Funcionalidade não disponível - extensão funciona offline', 'error');
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
    // Criar cabeçalho com informações do vídeo
    let notaCompleta = '';
    
    if (currentVideoInfo) {
      const titulo = currentVideoInfo.title || 'Vídeo do YouTube';
      const canal = currentVideoInfo.channel || 'Canal não disponível';
      const thumbnail = currentVideoInfo.thumbnail || `https://img.youtube.com/vi/${currentVideoId}/maxresdefault.jpg`;
      const videoLink = currentVideoUrl || `https://youtu.be/${currentVideoId}`;
      
      notaCompleta += `# ${titulo}\n\n`;
      notaCompleta += `**Canal:** ${canal}\n\n`;
      notaCompleta += `**Link:** ${videoLink}\n\n`;
      notaCompleta += `**Thumbnail:** ![Thumbnail](${thumbnail})\n\n`;
      notaCompleta += `**Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n`;
      notaCompleta += `---\n\n`;
      notaCompleta += markdown;
    } else {
      // Fallback caso não tenha informações do vídeo
      notaCompleta = `# Resumo do YouTube\n\n`;
      if (currentVideoUrl) {
        notaCompleta += `**Link:** ${currentVideoUrl}\n\n`;
      }
      notaCompleta += `**Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n`;
      notaCompleta += `---\n\n`;
      notaCompleta += markdown;
    }
    
    // Codificar o texto completo para URL
    const encodedText = encodeURIComponent(notaCompleta);
    
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

  // Copiar transcrição para a área de transferência
  function copiarTranscricao() {
    if (!currentTranscript) {
      mostrarMensagem('Nenhuma transcrição disponível. Gere um resumo primeiro.', 'error');
      return;
    }
    
    navigator.clipboard.writeText(currentTranscript)
      .then(() => {
        btnCopyTranscript.classList.add('copied');
        setTimeout(() => btnCopyTranscript.classList.remove('copied'), 1000);
        mostrarMensagem('Transcrição copiada!', 'success');
      })
      .catch(err => {
        console.error('Erro ao copiar transcrição:', err);
        mostrarMensagem('Erro ao copiar transcrição', 'error');
      });
  }

  // Alternar entre visualização de transcrição raw e formatada
  function alternarVisualizacaoTranscricao() {
    const isRawVisible = transcriptOutput.style.display !== 'none';
    
    if (isRawVisible) {
      transcriptOutput.style.display = 'none';
      transcriptPreview.style.display = 'block';
      btnToggleTranscriptView.innerHTML = '<i class="fas fa-code"></i>';
    } else {
      transcriptOutput.style.display = 'block';
      transcriptPreview.style.display = 'none';
      btnToggleTranscriptView.innerHTML = '<i class="fas fa-eye"></i>';
    }
  }
}); 