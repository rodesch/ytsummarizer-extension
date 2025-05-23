document.addEventListener('DOMContentLoaded', function() {
  // Elementos da interface
  const openaiApiKeyInput = document.getElementById('openaiApiKey');
  const openaiModelSelect = document.getElementById('openaiModel');
  const maxTokensInput = document.getElementById('maxTokens');
  const summaryLanguageSelect = document.getElementById('summaryLanguage');
  const summaryStyleSelect = document.getElementById('summaryStyle');
  const includeTimestampsCheck = document.getElementById('includeTimestamps');
  const autoSummarizeCheck = document.getElementById('autoSummarize');
  
  const testApiKeyBtn = document.getElementById('testApiKey');
  const saveApiSettingsBtn = document.getElementById('saveApiSettings');
  const saveGeneralSettingsBtn = document.getElementById('saveGeneralSettings');
  const clearDataBtn = document.getElementById('clearData');
  const exportSettingsBtn = document.getElementById('exportSettings');
  
  const apiKeyStatus = document.getElementById('apiKeyStatus');
  const connectionStatus = document.getElementById('connectionStatus');
  const summaryCount = document.getElementById('summaryCount');
  const lastUpdate = document.getElementById('lastUpdate');
  const alertContainer = document.getElementById('alertContainer');

  // Configurações padrão
  const defaultSettings = {
    openaiApiKey: '',
    openaiModel: 'gpt-4o-mini',
    maxTokens: 1000,
    summaryLanguage: 'pt-BR',
    summaryStyle: 'detailed',
    includeTimestamps: false,
    autoSummarize: false
  };

  // Inicializar página
  init();

  // Event listeners
  testApiKeyBtn.addEventListener('click', testApiConnection);
  saveApiSettingsBtn.addEventListener('click', saveApiSettings);
  saveGeneralSettingsBtn.addEventListener('click', saveGeneralSettings);
  clearDataBtn.addEventListener('click', clearAllData);
  exportSettingsBtn.addEventListener('click', exportSettings);
  
  // Auto-salvar chave da API quando o usuário digitar
  openaiApiKeyInput.addEventListener('input', debounce(autoSaveApiKey, 1000));

  function init() {
    loadSettings();
    updateStatus();
    
    // Se a chave foi fornecida, preenchê-la automaticamente
    const providedApiKey = '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';
    
    chrome.storage.sync.get('openaiApiKey', function(data) {
      if (!data.openaiApiKey && providedApiKey) {
        openaiApiKeyInput.value = providedApiKey;
        // Salvar automaticamente a chave fornecida
        chrome.storage.sync.set({ 'openaiApiKey': providedApiKey }, function() {
          showAlert('Chave da API OpenAI configurada automaticamente!', 'success');
          updateApiKeyStatus('success', 'Chave configurada');
        });
      }
    });
  }

  function loadSettings() {
    chrome.storage.sync.get(defaultSettings, function(data) {
      openaiApiKeyInput.value = data.openaiApiKey || '';
      openaiModelSelect.value = data.openaiModel || defaultSettings.openaiModel;
      maxTokensInput.value = data.maxTokens || defaultSettings.maxTokens;
      summaryLanguageSelect.value = data.summaryLanguage || defaultSettings.summaryLanguage;
      summaryStyleSelect.value = data.summaryStyle || defaultSettings.summaryStyle;
      includeTimestampsCheck.checked = data.includeTimestamps || false;
      autoSummarizeCheck.checked = data.autoSummarize || false;
      
      // Atualizar status da API se houver chave
      if (data.openaiApiKey) {
        updateApiKeyStatus('success', 'Chave configurada');
      }
    });
  }

  function saveApiSettings() {
    const apiKey = openaiApiKeyInput.value.trim();
    const model = openaiModelSelect.value;
    const maxTokens = parseInt(maxTokensInput.value);

    if (!apiKey) {
      showAlert('Por favor, insira uma chave da API OpenAI válida.', 'error');
      return;
    }

    if (!apiKey.startsWith('sk-')) {
      showAlert('Formato de chave da API inválido. Deve começar com "sk-"', 'error');
      return;
    }

    if (maxTokens < 100 || maxTokens > 4000) {
      showAlert('O número de tokens deve estar entre 100 e 4000.', 'error');
      return;
    }

    const settings = {
      openaiApiKey: apiKey,
      openaiModel: model,
      maxTokens: maxTokens
    };

    chrome.storage.sync.set(settings, function() {
      if (chrome.runtime.lastError) {
        showAlert('Erro ao salvar configurações: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      
      showAlert('Configurações da API salvas com sucesso!', 'success');
      updateApiKeyStatus('success', 'Chave configurada');
      updateLastUpdate();
    });
  }

  function saveGeneralSettings() {
    const settings = {
      summaryLanguage: summaryLanguageSelect.value,
      summaryStyle: summaryStyleSelect.value,
      includeTimestamps: includeTimestampsCheck.checked,
      autoSummarize: autoSummarizeCheck.checked
    };

    chrome.storage.sync.set(settings, function() {
      if (chrome.runtime.lastError) {
        showAlert('Erro ao salvar configurações: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      
      showAlert('Configurações gerais salvas com sucesso!', 'success');
      updateLastUpdate();
    });
  }

  function autoSaveApiKey() {
    const apiKey = openaiApiKeyInput.value.trim();
    if (apiKey && apiKey.startsWith('sk-')) {
      chrome.storage.sync.set({ 'openaiApiKey': apiKey }, function() {
        if (!chrome.runtime.lastError) {
          updateApiKeyStatus('success', 'Chave salva automaticamente');
        }
      });
    }
  }

  async function testApiConnection() {
    const apiKey = openaiApiKeyInput.value.trim();
    
    if (!apiKey) {
      showAlert('Por favor, insira uma chave da API OpenAI primeiro.', 'error');
      return;
    }

    testApiKeyBtn.disabled = true;
    testApiKeyBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Testando...';
    updateApiKeyStatus('warning', 'Testando conexão...');

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        updateApiKeyStatus('success', 'Conexão bem-sucedida');
        connectionStatus.textContent = 'Conectado';
        connectionStatus.className = 'text-success';
        showAlert('Conexão com a API OpenAI estabelecida com sucesso!', 'success');
      } else {
        const errorData = await response.json();
        updateApiKeyStatus('error', 'Falha na conexão');
        connectionStatus.textContent = 'Erro de conexão';
        connectionStatus.className = 'text-danger';
        showAlert(`Erro na API: ${errorData.error?.message || 'Chave inválida'}`, 'error');
      }
    } catch (error) {
      updateApiKeyStatus('error', 'Erro de rede');
      connectionStatus.textContent = 'Erro de rede';
      connectionStatus.className = 'text-danger';
      showAlert('Erro de rede ao testar a conexão.', 'error');
    } finally {
      testApiKeyBtn.disabled = false;
      testApiKeyBtn.innerHTML = '<i class="fas fa-flask me-1"></i>Testar Conexão';
    }
  }

  function clearAllData() {
    if (!confirm('Tem certeza que deseja limpar todos os dados salvos? Esta ação não pode ser desfeita.')) {
      return;
    }

    chrome.storage.sync.clear(function() {
      chrome.storage.local.clear(function() {
        loadSettings();
        updateStatus();
        showAlert('Todos os dados foram removidos com sucesso.', 'success');
        updateApiKeyStatus('', '');
        apiKeyStatus.style.display = 'none';
      });
    });
  }

  function exportSettings() {
    chrome.storage.sync.get(null, function(data) {
      // Remover chave da API por segurança
      const exportData = { ...data };
      delete exportData.openaiApiKey;
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'youtube-summarizer-settings.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showAlert('Configurações exportadas com sucesso (exceto chave da API).', 'success');
    });
  }

  function updateStatus() {
    chrome.storage.local.get(['summaries'], function(data) {
      const summaries = data.summaries || {};
      const count = Object.keys(summaries).length;
      summaryCount.textContent = count;
    });
  }

  function updateLastUpdate() {
    const now = new Date().toLocaleString('pt-BR');
    lastUpdate.textContent = now;
  }

  function updateApiKeyStatus(type, message) {
    if (!type || !message) {
      apiKeyStatus.style.display = 'none';
      return;
    }

    const indicator = apiKeyStatus.querySelector('.status-indicator');
    const text = apiKeyStatus.querySelector('.status-text');
    
    indicator.className = `status-indicator status-${type}`;
    text.textContent = message;
    apiKeyStatus.style.display = 'block';
  }

  function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'} me-2"></i>
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    alertContainer.appendChild(alertDiv);
    
    // Auto-remover após 5 segundos
    setTimeout(() => {
      if (alertDiv.parentNode) {
        alertDiv.remove();
      }
    }, 5000);
    
    // Scroll para o alerta
    alertDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}); 