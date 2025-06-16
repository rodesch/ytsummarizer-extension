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

    // Extrair transcript do vídeo
    const transcript = await getVideoTranscript(url);
    if (!transcript) {
      updateSummaryStatus(url, 'error', null, 'Não foi possível obter a transcrição do vídeo.');
      return;
    }

    // Gerar resumo com OpenAI
    const summary = await generateSummaryWithAI(transcript, settings, customizacao);
    updateSummaryStatus(url, 'done', summary, null, transcript);

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

    // Tentar extrair transcrição diretamente do YouTube
    return await extractYouTubeTranscript(videoId);

  } catch (error) {
    console.error('Erro ao obter transcrição:', error);
    throw new Error('Não foi possível obter a transcrição do vídeo. Verifique se o vídeo possui legendas disponíveis.');
  }
}

// Função para extrair transcrição do YouTube
async function extractYouTubeTranscript(videoId) {
  try {
    // Buscar informações de legendas do vídeo
    const playerResponse = await getPlayerResponse(videoId);
    
    if (!playerResponse.captions) {
      throw new Error('Vídeo não possui legendas disponíveis');
    }

    const captionTracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    
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
    const transcriptResponse = await fetch(selectedTrack.baseUrl + '&fmt=json3');
    
    if (!transcriptResponse.ok) {
      throw new Error('Erro ao baixar arquivo de legendas');
    }

    const transcriptData = await transcriptResponse.json();
    
    // Extrair texto das legendas
    const transcript = transcriptData.events
      .filter(event => event.segs)
      .map(event => {
        const text = event.segs.map(seg => seg.utf8).join('');
        return text.trim();
      })
      .filter(text => text.length > 0)
      .join(' ');

    if (!transcript) {
      throw new Error('Transcrição vazia ou inválida');
    }

    return transcript;

  } catch (error) {
    console.error('Erro ao extrair transcrição:', error);
    throw error;
  }
}

// Função para obter dados do player do YouTube
async function getPlayerResponse(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();
    
    // Extrair dados do player da página
    const regex = /var ytInitialPlayerResponse = ({.+?});/;
    const match = html.match(regex);
    
    if (!match) {
      throw new Error('Não foi possível extrair dados do player');
    }

    return JSON.parse(match[1]);

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

// Função auxiliar para extrair ID do vídeo da URL
function extractVideoIdFromUrl(url) {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
} 