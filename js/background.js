// Evento de instalação da extensão
chrome.runtime.onInstalled.addListener(function() {
  console.log('YouTube Summarizer instalado');
});

// Habilitar a extensão apenas em páginas do YouTube
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'checkYouTube') {
    // Verifica se a URL é do YouTube
    const isYouTube = sender.tab.url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/);
    sendResponse({isYouTube: isYouTube});
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
function updateSummaryStatus(url, status, markdown = null, erro = null, transcript = null) {
  summaries[url] = { status, markdown, erro, transcript };
  // Salvar no storage local para persistência
  chrome.storage.local.set({ summaries });
  // Notificar todos os listeners
  chrome.runtime.sendMessage({ 
    action: 'summaryUpdated', 
    url,
    status,
    markdown,
    erro,
    transcript
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
    
    // Gerar resumo usando OpenAI diretamente
    generateSummaryWithOpenAI(url, customizacao);
    
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

// Função para gerar resumo usando OpenAI diretamente
async function generateSummaryWithOpenAI(url, customizacao) {
  try {
    // Buscar configurações
    const settings = await new Promise(resolve => {
      chrome.storage.sync.get(['openaiApiKey', 'openaiModel', 'maxTokens', 'summaryLanguage', 'summaryStyle', 'includeTimestamps'], resolve);
    });

    if (!settings.openaiApiKey) {
      updateSummaryStatus(url, 'error', null, 'Chave da API OpenAI não configurada. Acesse as configurações da extensão.');
      return;
    }

    // Primeiro tentar obter informações básicas do vídeo (sempre funciona)
    let videoInfo = null;
    try {
      videoInfo = await getVideoInfoForSummary(url);
      console.log('Informações básicas do vídeo obtidas:', videoInfo.title);
    } catch (error) {
      console.error('Erro ao obter informações básicas:', error);
      updateSummaryStatus(url, 'error', null, 'Não foi possível acessar as informações do vídeo.');
      return;
    }

    // Tentar obter transcrição (opcional, com timeout)
    let transcript = null;
    try {
      console.log('Tentando obter transcrição...');
      
      // Timeout de 10 segundos para não travar
      const transcriptPromise = getVideoTranscript(url);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout na extração de transcrição')), 10000)
      );
      
      transcript = await Promise.race([transcriptPromise, timeoutPromise]);
      console.log('Transcrição obtida com sucesso:', transcript.length, 'caracteres');
    } catch (transcriptError) {
      console.log('Transcrição não disponível:', transcriptError.message);
      // Continuar sem transcrição
    }

    // Gerar resumo (com ou sem transcrição)
    let summary = null;
    try {
      if (transcript && transcript.length > 100) {
        console.log('Gerando resumo COM transcrição');
        summary = await generateSummaryWithAI(transcript, settings, customizacao);
        updateSummaryStatus(url, 'done', summary, null, transcript);
      } else {
        console.log('Gerando resumo SEM transcrição (baseado em metadados)');
        summary = await generateSummaryWithoutTranscript(videoInfo, settings, customizacao);
        updateSummaryStatus(url, 'done', summary, null, null);
      }
    } catch (summaryError) {
      console.error('Erro ao gerar resumo:', summaryError.message);
      updateSummaryStatus(url, 'error', null, 'Erro ao gerar resumo: ' + summaryError.message);
    }

  } catch (error) {
    console.error('Erro ao gerar resumo:', error);
    updateSummaryStatus(url, 'error', null, error.message);
  }
}

// Função para obter transcrição do vídeo
async function getVideoTranscript(url) {
  try {
    const videoId = extractVideoIdFromUrl(url);
    if (!videoId) {
      throw new Error('ID do vídeo não encontrado');
    }

    // Tentar várias abordagens para obter a transcrição
    console.log('Tentando obter transcrição para vídeo:', videoId);
    
    // Primeira tentativa: extrair via content script
    try {
      const transcript = await extractTranscriptViaContentScript(videoId);
      if (transcript) {
        return transcript;
      }
    } catch (error) {
      console.log('Falha na extração via content script:', error.message);
    }

    // Segunda tentativa: extrair diretamente do YouTube
    try {
      const transcript = await extractYouTubeTranscript(videoId);
      if (transcript) {
        return transcript;
      }
    } catch (error) {
      console.log('Falha na extração direta:', error.message);
    }

    // Terceira tentativa: usar API alternativa
    try {
      const transcript = await extractTranscriptAlternative(videoId);
      if (transcript) {
        return transcript;
      }
    } catch (error) {
      console.log('Falha na API alternativa:', error.message);
    }

    throw new Error('Não foi possível obter a transcrição do vídeo. Verifique se o vídeo possui legendas disponíveis.');

  } catch (error) {
    console.error('Erro ao obter transcrição:', error);
    throw error;
  }
}

// Função para extrair transcrição via content script
async function extractTranscriptViaContentScript(videoId) {
  return new Promise((resolve, reject) => {
    // Buscar a aba ativa do YouTube
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs[0] || !tabs[0].url.includes('youtube.com')) {
        reject(new Error('Não está em uma página do YouTube'));
        return;
      }

      // Executar script na página para extrair transcrição
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: function(videoId) {
            return new Promise((resolve, reject) => {
              try {
                // Tentar acessar o player do YouTube
                const player = document.querySelector('#movie_player');
                if (!player) {
                  reject(new Error('Player do YouTube não encontrado'));
                  return;
                }

                // Verificar se já existe transcrição na página
                let transcriptText = '';
                
                // Buscar por transcrição já carregada
                const transcriptElements = document.querySelectorAll('ytd-transcript-segment-renderer');
                if (transcriptElements.length > 0) {
                  transcriptText = Array.from(transcriptElements)
                    .map(el => el.querySelector('.segment-text')?.textContent?.trim())
                    .filter(text => text && text.length > 0)
                    .join(' ');
                }

                if (transcriptText.length > 100) {
                  resolve(transcriptText);
                  return;
                }

                // Se não há transcrição visível, tentar abrir o painel de transcrição
                const moreActionsButton = document.querySelector('[aria-label="Mais ações"], [aria-label="More actions"]');
                if (moreActionsButton) {
                  moreActionsButton.click();
                  
                  setTimeout(() => {
                    const showTranscriptButton = document.querySelector('[aria-label="Mostrar transcrição"], [aria-label="Show transcript"]');
                    if (showTranscriptButton) {
                      showTranscriptButton.click();
                      
                      setTimeout(() => {
                        const transcriptElements = document.querySelectorAll('ytd-transcript-segment-renderer');
                        if (transcriptElements.length > 0) {
                          const finalTranscript = Array.from(transcriptElements)
                            .map(el => el.querySelector('.segment-text')?.textContent?.trim())
                            .filter(text => text && text.length > 0)
                            .join(' ');
                          
                          if (finalTranscript.length > 100) {
                            resolve(finalTranscript);
                          } else {
                            reject(new Error('Transcrição vazia ou não disponível'));
                          }
                        } else {
                          reject(new Error('Elementos de transcrição não encontrados'));
                        }
                      }, 2000);
                    } else {
                      reject(new Error('Botão de transcrição não encontrado'));
                    }
                  }, 1000);
                } else {
                  reject(new Error('Botão de mais ações não encontrado'));
                }

              } catch (error) {
                reject(new Error('Erro ao extrair transcrição: ' + error.message));
              }
            });
          },
          args: [videoId]
        }
      ).then(results => {
        if (results && results[0] && results[0].result) {
          results[0].result.then(resolve).catch(reject);
        } else {
          reject(new Error('Falha na execução do script'));
        }
      }).catch(reject);
    });
  });
}

// Função para extrair transcrição do YouTube (método original melhorado)
async function extractYouTubeTranscript(videoId) {
  try {
    // Buscar informações de legendas do vídeo
    const playerResponse = await getPlayerResponse(videoId);
    
    if (!playerResponse || !playerResponse.captions) {
      throw new Error('Vídeo não possui legendas disponíveis');
    }

    const captionTracks = playerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error('Nenhuma legenda encontrada para este vídeo');
    }

    // Priorizar legendas em português, depois inglês, depois qualquer idioma
    let selectedTrack = captionTracks.find(track => 
      track.languageCode === 'pt' || track.languageCode === 'pt-BR'
    );
    
    if (!selectedTrack) {
      selectedTrack = captionTracks.find(track => track.languageCode === 'en');
    }
    
    if (!selectedTrack) {
      selectedTrack = captionTracks[0];
    }

    // Baixar o arquivo de legendas
    let transcriptUrl = selectedTrack.baseUrl;
    if (!transcriptUrl.includes('fmt=')) {
      transcriptUrl += '&fmt=json3';
    }
    
    const transcriptResponse = await fetch(transcriptUrl);
    
    if (!transcriptResponse.ok) {
      throw new Error('Erro ao baixar arquivo de legendas');
    }

    const transcriptData = await transcriptResponse.json();
    
    // Extrair texto das legendas
    let transcript = '';
    
    if (transcriptData.events) {
      transcript = transcriptData.events
        .filter(event => event.segs)
        .map(event => {
          const text = event.segs.map(seg => seg.utf8).join('');
          return text.trim();
        })
        .filter(text => text.length > 0)
        .join(' ');
    } else if (transcriptData.actions) {
      // Formato alternativo
      transcript = transcriptData.actions
        .filter(action => action.updateEngagementPanelAction)
        .map(action => action.updateEngagementPanelAction.content?.transcriptRenderer?.body?.transcriptBodyRenderer?.cueGroups)
        .filter(cueGroups => cueGroups)
        .flat()
        .map(cueGroup => cueGroup.transcriptCueGroupRenderer?.cues)
        .filter(cues => cues)
        .flat()
        .map(cue => cue.transcriptCueRenderer?.cue?.simpleText)
        .filter(text => text)
        .join(' ');
    }

    if (!transcript || transcript.length < 50) {
      throw new Error('Transcrição vazia ou muito curta');
    }

    return transcript;

  } catch (error) {
    console.error('Erro ao extrair transcrição do YouTube:', error);
    throw error;
  }
}

// Função alternativa para extrair transcrição
async function extractTranscriptAlternative(videoId) {
  try {
    // Tentar uma abordagem alternativa usando diferentes endpoints
    const endpoints = [
      `https://www.youtube.com/youtubei/v1/get_transcript?videoId=${videoId}`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=pt&fmt=json3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          if (data && data.events) {
            const transcript = data.events
              .filter(event => event.segs)
              .map(event => event.segs.map(seg => seg.utf8).join(''))
              .filter(text => text.trim().length > 0)
              .join(' ');
            
            if (transcript.length > 50) {
              return transcript;
            }
          }
        }
      } catch (error) {
        console.log(`Endpoint ${endpoint} falhou:`, error.message);
      }
    }

    throw new Error('Todos os endpoints alternativos falharam');

  } catch (error) {
    console.error('Erro na extração alternativa:', error);
    throw error;
  }
}

// Função para obter dados do player do YouTube
async function getPlayerResponse(videoId) {
  try {
    console.log('Tentando obter dados do player para:', videoId);
    
    // Tentar múltiplos métodos para obter dados do player
    const methods = [
      // Método 1: Página principal do vídeo
      async () => {
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        const html = await response.text();
        
        // Tentar diferentes padrões de regex
        const patterns = [
          /var ytInitialPlayerResponse = ({.+?});/,
          /window\["ytInitialPlayerResponse"\] = ({.+?});/,
          /"ytInitialPlayerResponse":({.+?}),"ytInitialData"/
        ];
        
        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match) {
            return JSON.parse(match[1]);
          }
        }
        
        throw new Error('Dados do player não encontrados no HTML');
      },
      
      // Método 2: API interna do YouTube
      async () => {
        const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20220801.00.00'
              }
            },
            videoId: videoId
          })
        });
        
        if (response.ok) {
          return await response.json();
        }
        
        throw new Error('API interna falhou');
      }
    ];

    // Tentar cada método
    for (let i = 0; i < methods.length; i++) {
      try {
        console.log(`Tentando método ${i + 1} para obter dados do player`);
        const playerResponse = await methods[i]();
        
        if (playerResponse && (playerResponse.captions || playerResponse.videoDetails)) {
          console.log('Dados do player obtidos com sucesso');
          return playerResponse;
        }
      } catch (error) {
        console.log(`Método ${i + 1} falhou:`, error.message);
      }
    }

    throw new Error('Todos os métodos para obter dados do player falharam');

  } catch (error) {
    console.error('Erro ao obter player response:', error);
    throw error;
  }
}

// Função para gerar resumo com OpenAI
async function generateSummaryWithAI(transcript, settings, customizacao) {
  const apiKey = settings.openaiApiKey;
  const model = settings.openaiModel || 'gpt-4o-mini';
  const maxTokens = settings.maxTokens || 2000; // Aumentando para permitir resumos mais detalhados
  const language = settings.summaryLanguage || 'pt-BR';
  const style = settings.summaryStyle || 'detailed';
  const ultraDetailed = settings.ultraDetailed || false;

  // Construir prompt muito mais detalhado baseado nas configurações
  let systemPrompt = `Você é um especialista em análise de conteúdo de vídeos do YouTube. Sua função é criar resumos extremamente detalhados e bem estruturados em markdown. `;
  
  if (language === 'pt-BR') {
    systemPrompt += `Sempre responda em português brasileiro com formatação markdown impecável.`;
  } else {
    systemPrompt += `Always respond in ${language} with impeccable markdown formatting.`;
  }

  let prompt;
  
  if (ultraDetailed) {
    prompt = `Analise profundamente a seguinte transcrição de vídeo do YouTube e crie um resumo ULTRA DETALHADO em ${language}:

TRANSCRIÇÃO:
${transcript}

Crie um resumo seguindo esta estrutura OBRIGATÓRIA em markdown:

# 📝 Resumo Completo do Vídeo

## 🎯 Resumo Executivo
[Um parágrafo conciso com os pontos mais importantes]

## 📋 Pontos Principais
[Lista detalhada dos principais tópicos abordados]

## 🔍 Análise Detalhada
### Introdução
[Análise da introdução do vídeo]

### Desenvolvimento
[Análise detalhada do conteúdo principal, dividida em seções lógicas]

### Conclusão
[Análise das conclusões apresentadas]

## 💡 Insights e Takeaways
[Principais aprendizados e insights extraídos]

## 🎯 Aplicações Práticas
[Como aplicar o conhecimento apresentado]

## 📊 Dados e Estatísticas Mencionados
[Qualquer dado, número ou estatística citados no vídeo]

## 🔗 Referências e Recursos Mencionados
[Links, livros, ferramentas ou recursos citados]

## 📝 Notas e Observações
[Observações adicionais importantes]

---
*Resumo gerado por IA a partir da transcrição completa do vídeo*`;
  } else {
    switch (style) {
      case 'concise':
        prompt = `Analise a seguinte transcrição de vídeo do YouTube e crie um resumo CONCISO em ${language}:

TRANSCRIÇÃO:
${transcript}

Crie um resumo seguindo esta estrutura em markdown:

# 📝 Resumo Conciso

## 🎯 Pontos Principais
[3-5 pontos principais em tópicos]

## 💡 Conclusão
[Conclusão resumida em 1-2 parágrafos]

---
*Resumo conciso gerado por IA*`;
        break;
        
      case 'bullet':
        prompt = `Analise a seguinte transcrição de vídeo do YouTube e crie um resumo EM TÓPICOS em ${language}:

TRANSCRIÇÃO:
${transcript}

Crie um resumo seguindo esta estrutura em markdown:

# 📝 Resumo em Tópicos

## 🎯 Tópicos Principais
• **Tópico 1**: [Descrição detalhada]
  - Subtópico importante
  - Outro subtópico
  
• **Tópico 2**: [Descrição detalhada]
  - Subtópico importante
  - Outro subtópico

## 💡 Pontos de Destaque
• [Ponto importante 1]
• [Ponto importante 2]
• [Ponto importante 3]

## 🎯 Conclusões
• [Conclusão principal]
• [Conclusão secundária]

---
*Resumo em tópicos gerado por IA*`;
        break;
        
      case 'academic':
        prompt = `Analise a seguinte transcrição de vídeo do YouTube e crie um resumo ACADÊMICO FORMAL em ${language}:

TRANSCRIÇÃO:
${transcript}

Crie um resumo seguindo esta estrutura acadêmica em markdown:

# 📚 Análise Acadêmica do Conteúdo

## 📋 Abstract
[Resumo executivo de 100-150 palavras]

## 🎯 Introdução
[Contextualização do tema abordado]

## 📖 Metodologia Apresentada
[Métodos, técnicas ou abordagens discutidas]

## 🔍 Análise Crítica do Conteúdo
### Argumentos Principais
[Análise dos argumentos apresentados]

### Evidências e Suporte
[Análise das evidências fornecidas]

### Limitações Identificadas
[Possíveis limitações ou pontos não abordados]

## 💡 Contribuições e Relevância
[Contribuições do conteúdo para o campo de conhecimento]

## 🎯 Conclusões
[Conclusões fundamentadas baseadas na análise]

## 📚 Referências Mencionadas
[Bibliografia ou recursos citados no vídeo]

---
*Análise acadêmica gerada por IA*`;
        break;
        
      default: // detailed
        prompt = `Analise a seguinte transcrição de vídeo do YouTube e crie um resumo DETALHADO E ESTRUTURADO em ${language}:

TRANSCRIÇÃO:
${transcript}

Crie um resumo seguindo esta estrutura em markdown:

# 📝 Resumo Detalhado

## 🎯 Visão Geral
[Parágrafo introdutório sobre o conteúdo do vídeo]

## 📋 Principais Tópicos Abordados
[Lista detalhada dos temas principais]

## 🔍 Desenvolvimento do Conteúdo
[Análise detalhada do conteúdo, dividida em seções lógicas]

## 💡 Insights Importantes
[Principais insights e aprendizados]

## 🎯 Conclusões
[Síntese das conclusões apresentadas]

## 📊 Informações Complementares
[Dados, estatísticas ou informações adicionais mencionadas]

---
*Resumo detalhado gerado por IA*`;
    }
  }

  if (settings.includeTimestamps) {
    prompt += `\n\nIMPORTANTE: Inclua timestamps relevantes (formato [MM:SS] ou [HH:MM:SS]) quando mencionar tópicos específicos.`;
  }

  if (customizacao && customizacao.comentario) {
    prompt += `\n\nCONSIDERAÇÕES ADICIONAIS DO USUÁRIO: ${customizacao.comentario}`;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Erro na API OpenAI');
    }

    const data = await response.json();
    return data.choices[0].message.content;

  } catch (error) {
    console.error('Erro na API OpenAI:', error);
    throw error;
  }
}

// Função para obter informações do vídeo para resumo sem transcrição
async function getVideoInfoForSummary(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs[0] || !tabs[0].url.includes('youtube.com')) {
        reject(new Error('Não está em uma página do YouTube'));
        return;
      }

      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: function() {
            try {
              const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent ||
                           document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')?.textContent ||
                           document.title.replace(' - YouTube', '');
              
              const channel = document.querySelector('ytd-channel-name #container #text-container yt-formatted-string a')?.textContent ||
                             document.querySelector('ytd-channel-name a')?.textContent ||
                             'Canal não identificado';
              
              // Tentar extrair descrição de várias formas
              let description = '';
              const descElements = [
                '#description-text',
                '#description .content',
                '#meta-contents #description',
                'meta[name="description"]',
                '#watch-description-text',
                '.watch-description'
              ];
              
              for (const selector of descElements) {
                const element = document.querySelector(selector);
                if (element) {
                  description = selector.includes('meta') ? 
                    element.getAttribute('content') : 
                    element.textContent;
                  if (description && description.trim().length > 0) {
                    break;
                  }
                }
              }
              
              const views = document.querySelector('#info .view-count')?.textContent ||
                           document.querySelector('.view-count')?.textContent ||
                           '';
              
              const duration = document.querySelector('.ytp-time-duration')?.textContent || '';
              
              return {
                title: title?.trim() || 'Título não disponível',
                channel: channel?.trim() || 'Canal não disponível', 
                description: description?.trim() || '',
                views: views?.trim() || '',
                duration: duration?.trim() || '',
                url: window.location.href
              };
            } catch (error) {
              return {
                title: 'Título não disponível',
                channel: 'Canal não disponível',
                description: '',
                views: '',
                duration: '',
                url: window.location.href
              };
            }
          }
        }
      ).then(results => {
        if (results && results[0] && results[0].result) {
          resolve(results[0].result);
        } else {
          reject(new Error('Falha ao obter informações do vídeo'));
        }
      }).catch(reject);
    });
  });
}

// Função para gerar resumo sem transcrição (baseado em metadados)
async function generateSummaryWithoutTranscript(videoInfo, settings, customizacao) {
  const apiKey = settings.openaiApiKey;
  const model = settings.openaiModel || 'gpt-4o-mini';
  const maxTokens = Math.min(settings.maxTokens || 1000, 1000); // Limitar tokens para metadados
  const language = settings.summaryLanguage || 'pt-BR';

  let prompt = `Analise as seguintes informações de um vídeo do YouTube e crie um resumo útil e informativo em ${language}:

INFORMAÇÕES DO VÍDEO:
- Título: ${videoInfo.title}
- Canal: ${videoInfo.channel}
- Descrição: ${videoInfo.description || 'Não disponível'}
- Duração: ${videoInfo.duration || 'Não disponível'}
- Visualizações: ${videoInfo.views || 'Não disponível'}
- URL: ${videoInfo.url}

Baseado no título e descrição, forneça um resumo estruturado que seja útil para o usuário. Seja específico sobre o que pode ser inferido e faça sugestões inteligentes sobre o conteúdo.

Crie um resumo seguindo esta estrutura em markdown:

# 📝 ${videoInfo.title}

## 📺 Informações do Vídeo
- **Canal:** ${videoInfo.channel}
- **Duração:** ${videoInfo.duration || 'Não informada'}
- **Visualizações:** ${videoInfo.views || 'Não informado'}

## 🎯 Resumo Baseado no Título e Descrição

### Tema Principal
[Identifique o tema central baseado no título]

### Possíveis Tópicos Abordados
[Liste tópicos prováveis baseados no título e descrição]

### Público-Alvo
[Identifique para quem o vídeo parece ser direcionado]

### Categoria/Tipo de Conteúdo
[Classifique o tipo de vídeo: tutorial, review, discussão, etc.]

${videoInfo.description && videoInfo.description.length > 50 ? `
## 📄 Análise da Descrição
[Analise os pontos principais mencionados na descrição]

### Pontos-Chave da Descrição
[Extraia informações importantes da descrição]
` : ''}

## 💡 O Que Esperar Deste Vídeo
[Expectativas baseadas nas informações disponíveis]

## 🔍 Para Resumo Mais Detalhado
Para obter um resumo completo com análise do conteúdo falado, certifique-se de que o vídeo possui legendas habilitadas (CC) e tente gerar o resumo novamente.

## 🔗 Link do Vídeo
${videoInfo.url}

---
*Resumo baseado em metadados - gerado por IA*`;

  if (customizacao && customizacao.comentario) {
    prompt += `\n\nCONSIDERAÇÕES ADICIONAIS DO USUÁRIO: ${customizacao.comentario}`;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: `Você é um assistente especializado em analisar vídeos do YouTube. Quando não há transcrição disponível, crie resumos informativos baseados nos metadados disponíveis. Sempre responda em ${language} com formatação markdown.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Erro na API OpenAI');
    }

    const data = await response.json();
    return data.choices[0].message.content;

  } catch (error) {
    console.error('Erro ao gerar resumo sem transcrição:', error);
    throw error;
  }
}

// Função auxiliar para extrair ID do vídeo da URL
function extractVideoIdFromUrl(url) {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
} 