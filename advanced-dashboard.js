(function (global) {
  const RESOURCE_KEYS = {
    vendor: ['vendor', 'fornecedor'],
    environment: ['environment', 'ambiente'],
    businessDomain: ['business domain', 'dominio de negocio', 'business_domain', 'businessdomain'],
    functionalArea: ['functional area', 'area funcional', 'functional_area', 'functionalarea'],
    hostingType: ['hosting type', 'tipo de hosting', 'hosting_type'],
    hostingProvider: ['hosting provider', 'fornecedor hosting', 'hosting_provider'],
    tiOwner: ['ti owner', 'responsavel ti', 'ti_owner'],
    businessOwner: ['business owner', 'responsavel negocio', 'business_owner'],
    appName: ['name of application', 'application name', 'aplicacao'],
    componentName: ['component name', 'name of component', 'componente'],
    itemName: ['component name standardized', 'component name', 'component name (standardized)', 'name of application', 'name of component'],
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function normalizeText(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
  }

  function normalizeKey(value) {
    return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  }

  function pickValue(object, candidates) {
    if (!object || typeof object !== 'object') return '';
    for (const candidate of candidates) {
      const direct = Object.keys(object).find((key) => normalizeKey(key) === normalizeKey(candidate));
      if (direct !== undefined) return object[direct];
    }
    const fallback = Object.keys(object).find((key) => candidates.some((candidate) => normalizeKey(key).includes(normalizeKey(candidate))));
    return fallback ? object[fallback] : '';
  }

  function parseDateValue(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
      const d = new Date(Math.round((value - 25569) * 86400 * 1000));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const text = normalizeText(value).replace(/\s+/g, ' ');
    if (!text) return null;
    const ptMatch = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})/);
    if (ptMatch) {
      const date = new Date(Number(ptMatch[3]), Number(ptMatch[2]) - 1, Number(ptMatch[1]));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const d = parseDateValue(value);
    if (!d) return 'Sem data';
    return d.toLocaleDateString('pt-PT');
  }

  function addMonths(date, months) {
    const next = new Date(date.getFullYear(), date.getMonth(), 1);
    next.setMonth(next.getMonth() + months);
    const lastDayOfTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(date.getDate(), lastDayOfTargetMonth));
    return next;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function assetRows(asset) {
    if (!asset) return [];
    if (Array.isArray(asset.rows)) return asset.rows;
    if (Array.isArray(asset.sourceRows)) return asset.sourceRows;
    if (asset.origin === 'application' && Array.isArray(asset.sourceRows)) return asset.sourceRows;
    return [asset];
  }

  function readField(asset, keys) {
    const rows = assetRows(asset);
    for (const row of rows) {
      const value = pickValue(row, keys);
      if (value !== '' && value !== null && value !== undefined) return value;
    }
    return '';
  }

  function getLifecycleDates(asset) {
    const rows = assetRows(asset);
    const dates = [];
    rows.forEach((row) => {
      Object.entries(row || {}).forEach(([key, value]) => {
        const normalized = normalizeKey(key);
        if (!normalized.includes('lifecycle') && !normalized.includes('end of life') && !normalized.includes('eol') && !normalized.includes('eos') && !normalized.includes('eoes') && !normalized.includes('esu') && !normalized.includes('support')) {
          return;
        }
        const date = parseDateValue(value);
        if (date) dates.push(date);
      });
    });
    return dates;
  }

  function latestLifecycleDate(asset) {
    const dates = getLifecycleDates(asset);
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map((date) => date.getTime())));
  }

  function getStateRank(state) {
    const rank = { Yes: 1, 'At Risk': 2, No: 3, 'n.d. - No official lifecycle information available': 4, 'n.a. (internal application)': 5, 'n.a. (application with no components)': 6, 'n.a. (virtual machine)': 7 };
    return rank[state] || 99;
  }

  function getAppRowsFromDataset(dataset) {
    const apps = (dataset && dataset.summary && dataset.summary.applications) ? dataset.summary.applications : [];
    return apps.map((app) => ({
      name: app.name || 'Aplicação sem nome',
      state: app.state || 'Não classificado',
      rows: Array.isArray(app.rows) ? app.rows : [],
      rowCount: Array.isArray(app.rows) ? app.rows.length : 0,
    }));
  }

  function getApplicationRowState(row) {
    const processedState = normalizeText(row && row._state);
    if (processedState) return processedState;

    const rawState = normalizeKey(pickValue(row, ['obsolete?', 'Obsolete?']));
    if (rawState === 'yes') return 'Yes';
    if (rawState === 'at risk') return 'At Risk';
    if (rawState === 'no') return 'No';
    return '';
  }

  function buildAppSummary(dataset) {
    const apps = getAppRowsFromDataset(dataset);
    return apps.map((app) => {
      const rows = app.rows.filter((row) => !isNoComponentsRow(row));
      return {
        name: app.name,
        state: app.state,
        totalComponents: rows.length,
        obsoleteCount: rows.filter((row) => getApplicationRowState(row) === 'Yes').length,
        atRiskCount: rows.filter((row) => getApplicationRowState(row) === 'At Risk').length,
        supportedCount: rows.filter((row) => getApplicationRowState(row) === 'No').length,
        lifecycle: latestLifecycleDate({ rows }),
        businessDomain: readField({ rows }, RESOURCE_KEYS.businessDomain) || 'Sem domínio',
        functionalArea: readField({ rows }, RESOURCE_KEYS.functionalArea) || 'Sem área',
        rows,
      };
    });
  }

  function isNoComponentsRow(row) {
    const subtype = normalizeKey(pickValue(row, ['subtype', 'Subtype']) || '');
    const appState = normalizeKey(String(pickValue(row, ['application obsolete?', 'Application Obsolete?', 'obsolete?', 'Obsolete?']) || ''));
    return subtype === 'n a' || subtype === 'na' || appState.includes('application with no components');
  }

  function formatPercent(value, total) {
    if (!total) return 0;
    return Number(((value / total) * 100)).toFixed(1);
  }

  function percentTone(value) {
    const percent = Number(value);
    if (percent < 30) return 'tone-green';
    if (percent <= 60) return 'tone-amber';
    return 'tone-red';
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('pt-PT');
  }

  function getStateClass(state) {
    if (!state) return 'state-default';
    const normalized = normalizeKey(state);
    if (normalized.includes('yes')) return 'state-yes';
    if (normalized.includes('at risk')) return 'state-risk';
    if (normalized.includes('no')) return 'state-no';
    if (normalized.includes('nd') || normalized.includes('official lifecycle')) return 'state-nd';
    return 'state-default';
  }

  function getDialog() {
    return document.getElementById('analytics-detail-dialog');
  }

  function openDialog(title, html) {
    const dialog = getDialog();
    if (!dialog) return;
    const titleNode = document.getElementById('analytics-detail-title');
    const content = document.getElementById('analytics-detail-content');
    if (titleNode) titleNode.textContent = title;
    if (content) content.innerHTML = html;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', 'open');
  }

  function closeDialog() {
    const dialog = getDialog();
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function openApplicationDetail(application) {
    const dataset = this.state.dataset;
    const detailRows = Array.isArray(application.rows) ? application.rows : [];
    const lifecycleDates = detailRows.flatMap((row) => getLifecycleDates({ rows: [row] }));
    const dateList = lifecycleDates.length ? lifecycleDates.map((date) => formatDate(date)).join('<br>') : 'Sem data de lifecycle';
    const componentNames = [...new Set(detailRows.map((row) => readField({ rows: [row] }, RESOURCE_KEYS.componentName) || readField({ rows: [row] }, RESOURCE_KEYS.itemName) || 'Sem nome').filter(Boolean))];

    const html = `
      <div class="detail-grid">
        <div><strong>Estado global</strong><p>${escapeHtml(application.state || 'Sem estado')}</p></div>
        <div><strong>Business Domain</strong><p>${escapeHtml(readField({ rows: detailRows }, RESOURCE_KEYS.businessDomain) || 'Sem domínio')}</p></div>
        <div><strong>Functional Area</strong><p>${escapeHtml(readField({ rows: detailRows }, RESOURCE_KEYS.functionalArea) || 'Sem área')}</p></div>
        <div><strong>Hosting Type</strong><p>${escapeHtml(readField({ rows: detailRows }, RESOURCE_KEYS.hostingType) || 'Sem informação')}</p></div>
        <div><strong>Hosting Provider</strong><p>${escapeHtml(readField({ rows: detailRows }, RESOURCE_KEYS.hostingProvider) || 'Sem informação')}</p></div>
        <div><strong>TI Owner</strong><p>${escapeHtml(readField({ rows: detailRows }, RESOURCE_KEYS.tiOwner) || 'Sem informação')}</p></div>
        <div><strong>Business Owner</strong><p>${escapeHtml(readField({ rows: detailRows }, RESOURCE_KEYS.businessOwner) || 'Sem informação')}</p></div>
        <div><strong>Componentes associados</strong><p>${escapeHtml(componentNames.length ? componentNames.join(', ') : 'Sem componentes')}</p></div>
        <div class="detail-span"><strong>Datas de lifecycle relevantes</strong><p>${dateList}</p></div>
      </div>
      <div class="detail-table-wrap">
        <table>
          <thead><tr><th>Componente</th><th>Categoria</th><th>Ambiente</th><th>Estado</th></tr></thead>
          <tbody>
            ${detailRows.map((row) => {
              const componentName = readField({ rows: [row] }, RESOURCE_KEYS.componentName) || readField({ rows: [row] }, RESOURCE_KEYS.itemName) || 'Sem nome';
              const category = readField({ rows: [row] }, ['category', 'Categoria']) || 'Sem categoria';
              const environment = readField({ rows: [row] }, RESOURCE_KEYS.environment) || 'Sem ambiente';
              const state = readField({ rows: [row] }, ['obsolete?', 'Obsolete?']) || 'Sem estado';
              return `<tr><td><span class="clamp-two">${escapeHtml(componentName)}</span></td><td>${escapeHtml(category)}</td><td><span class="environment-badge environment-${normalizeKey(environment).replace(/\s+/g, '-')}">${escapeHtml(environment)}</span></td><td><span class="state-badge ${getStateClass(state)}">${escapeHtml(state)}</span></td></tr>`;
            }).slice(0, 20).join('')}
          </tbody>
        </table>
      </div>
    `;
    openDialog(application.name, html);
  }

  function openComponentDetail(asset) {
    const rows = assetRows(asset);
    const lifecycleDates = getLifecycleDates(asset);
    const appNames = [...new Set((asset.applications || []).concat(rows.flatMap((row) => (pickValue(row, ['applications', 'Aplicações']) || []).filter(Boolean))))];
    const html = `
      <div class="detail-grid">
        <div><strong>Nome</strong><p>${escapeHtml(readField(asset, RESOURCE_KEYS.componentName) || readField(asset, RESOURCE_KEYS.itemName) || 'Sem nome')}</p></div>
        <div><strong>Categoria</strong><p>${escapeHtml(readField(asset, ['category', 'Categoria']) || 'Sem categoria')}</p></div>
        <div><strong>Subcategoria</strong><p>${escapeHtml(readField(asset, ['subtype', 'Subtype']) || 'Sem subtype')}</p></div>
        <div><strong>Versão / Modelo</strong><p>${escapeHtml(readField(asset, ['name and version / model (if hardware)', 'Name and version / Model (if Hardware)']) || 'Sem versão')}</p></div>
        <div><strong>Fornecedor</strong><p>${escapeHtml(readField(asset, RESOURCE_KEYS.vendor) || 'Sem fornecedor')}</p></div>
        <div><strong>Ambiente</strong><p><span class="environment-badge environment-${normalizeKey(readField(asset, RESOURCE_KEYS.environment)).replace(/\s+/g, '-')}">${escapeHtml(readField(asset, RESOURCE_KEYS.environment) || 'Sem ambiente')}</span></p></div>
        <div><strong>Estado</strong><p><span class="state-badge ${getStateClass(asset.state || 'Sem estado')}">${escapeHtml(asset.state || 'Sem estado')}</span></p></div>
        <div class="detail-span"><strong>Datas de lifecycle</strong><p>${lifecycleDates.length ? lifecycleDates.map((date) => formatDate(date)).join('<br>') : 'Sem data de lifecycle'}</p></div>
        <div class="detail-span"><strong>Aplicações dependentes</strong><p>${escapeHtml(appNames.length ? appNames.join(', ') : 'Sem aplicações dependentes')}</p></div>
      </div>
    `;
    openDialog(readField(asset, RESOURCE_KEYS.componentName) || readField(asset, RESOURCE_KEYS.itemName) || 'Detalhe do componente', html);
  }

  function renderApplicationsPage() {
    const dataset = this.state.dataset;
    const contentDiv = document.getElementById('dashboard-analytics-content');
    if (!contentDiv || !dataset) return;

    const appRows = buildAppSummary(dataset);
    const existingSearch = document.getElementById('advanced-app-search');
    const existingState = document.getElementById('advanced-app-state');
    if (existingSearch) this.state.applicationSearch = existingSearch.value;
    if (existingState) this.state.applicationState = existingState.value;

    const searchValue = this.state.applicationSearch || '';
    const stateValue = this.state.applicationState || 'all';
    const filtered = appRows.filter((app) => {
      const matchesText = !searchValue || app.name.toLowerCase().includes(searchValue.toLowerCase());
      const matchesState = stateValue === 'all' || app.state === stateValue;
      return matchesText && matchesState;
    });

    const cards = [
      { label: 'Total de aplicações únicas', value: appRows.length },
      { label: 'Aplicações obsoletas', value: appRows.filter((app) => app.state === 'Yes').length },
      { label: 'Aplicações em risco', value: appRows.filter((app) => app.state === 'At Risk').length },
      { label: 'Aplicações suportadas', value: appRows.filter((app) => app.state === 'No').length },
    ];

    contentDiv.innerHTML = `
      <section class="card-panel">
        <div class="panel-heading">
          <div>
            <h2>Aplicações impactadas</h2>
            <p>Estado de obsolescência e componentes associados a cada aplicação.</p>
          </div>
        </div>
        <div class="advanced-kpis">
          ${cards.map((card) => `
            <div class="advanced-kpi-card">
              <span>${card.label}</span>
              <strong>${formatNumber(card.value)}</strong>
            </div>
          `).join('')}
        </div>
        <div class="advanced-toolbar">
          <input id="advanced-app-search" type="search" placeholder="Pesquisar aplicação..." value="${escapeHtml(searchValue)}" />
          <select id="advanced-app-state">
            <option value="all" ${stateValue === 'all' ? 'selected' : ''}>Todos os estados</option>
            <option value="Yes" ${stateValue === 'Yes' ? 'selected' : ''}>Aplicações Obsoletas</option>
            <option value="At Risk" ${stateValue === 'At Risk' ? 'selected' : ''}>Aplicações em Risco</option>
            <option value="No" ${stateValue === 'No' ? 'selected' : ''}>Aplicações Suportadas</option>
            <option value="n.a. (application with no components)" ${stateValue === 'n.a. (application with no components)' ? 'selected' : ''}>Aplicações sem componentes</option>
          </select>
        </div>
        <div class="table-wrap">
          <table class="table-applications">
            <thead>
              <tr>
                <th>Nome da aplicação</th>
                <th>Nº total de componentes</th>
                <th>Nº de componentes obsoletos</th>
                <th>Nº de componentes em risco</th>
                <th>Obsoleto?</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((app) => `
                <tr class="clickable-row" data-kind="application" data-name="${escapeHtml(app.name)}">
                  <td class="cell-long"><span class="clamp-two">${escapeHtml(app.name)}</span></td>
                  <td>${formatNumber(app.totalComponents)}</td>
                  <td>${formatNumber(app.obsoleteCount)}</td>
                  <td>${formatNumber(app.atRiskCount)}</td>
                  <td><span class="state-badge ${getStateClass(app.state)}">${escapeHtml(app.state)}</span></td>
                </tr>
              `).join('') || '<tr><td colspan="5">Sem resultados para os filtros aplicados.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    `;

    contentDiv.querySelectorAll('[data-kind="application"]').forEach((row) => {
      row.addEventListener('click', () => {
        const appName = row.dataset.name;
        const app = appRows.find((item) => item.name === appName);
        if (app) this.openDetailForApplication(app);
      });
    });

    const searchInput = document.getElementById('advanced-app-search');
    const stateSelect = document.getElementById('advanced-app-state');
    if (searchInput) searchInput.addEventListener('input', (event) => {
      this.state.applicationSearch = event.currentTarget.value;
      const selectionStart = event.currentTarget.selectionStart;
      const selectionEnd = event.currentTarget.selectionEnd;
      this.renderApplicationsPage();
      const updatedSearchInput = document.getElementById('advanced-app-search');
      if (updatedSearchInput) {
        updatedSearchInput.focus();
        updatedSearchInput.setSelectionRange(selectionStart, selectionEnd);
      }
    });
    if (stateSelect) stateSelect.addEventListener('change', (event) => {
      this.state.applicationState = event.currentTarget.value;
      this.renderApplicationsPage();
    });
  }

  function getAssetMilestone(asset, today, sixMonthLimit, twelveMonthLimit, twentyFourMonthLimit) {
    const date = latestLifecycleDate(asset);
    if (!date) return null;
    const lifecycleDate = startOfDay(date);
    if (lifecycleDate <= today) return 'obsoletos';
    if (lifecycleDate <= sixMonthLimit) return '0-6m';
    if (lifecycleDate <= twelveMonthLimit) return '6-12m';
    if (lifecycleDate <= twentyFourMonthLimit) return '12-24m';
    return '24m+';
  }

  function getTimelineSummary(dataset) {
    const assets = (dataset && dataset.allAssets) ? dataset.allAssets : [];
    const today = startOfDay(new Date());
    const sixMonthLimit = addMonths(today, 6);
    const twelveMonthLimit = addMonths(today, 12);
    const twentyFourMonthLimit = addMonths(today, 24);
    const getMilestone = (asset) => getAssetMilestone(asset, today, sixMonthLimit, twelveMonthLimit, twentyFourMonthLimit);
    return {
      today,
      sixMonthLimit,
      twelveMonthLimit,
      twentyFourMonthLimit,
      obsoletos: assets.filter((asset) => getMilestone(asset) === 'obsoletos').length,
      sixMonths: assets.filter((asset) => getMilestone(asset) === '0-6m').length,
      twelveMonths: assets.filter((asset) => getMilestone(asset) === '6-12m').length,
      twentyFourMonths: assets.filter((asset) => getMilestone(asset) === '12-24m').length,
      after24: assets.filter((asset) => getMilestone(asset) === '24m+').length,
    };
  }

  function getTimelineBucketAssets(dataset, bucketKey) {
    const summary = getTimelineSummary(dataset);
    const milestones = {
      obsoletos: 'obsoletos',
      sixMonths: '0-6m',
      twelveMonths: '6-12m',
      twentyFourMonths: '12-24m',
      after24: '24m+',
    };
    const targetMilestone = milestones[bucketKey];
    if (!targetMilestone) return [];
    return (dataset.allAssets || []).filter((asset) => (
      getAssetMilestone(asset, summary.today, summary.sixMonthLimit, summary.twelveMonthLimit, summary.twentyFourMonthLimit) === targetMilestone
    ));
  }

  function getTimelineExportValue(asset, header) {
    const key = normalizeKey(header);
    if (!key) return '';
    if (key === 'component name') {
      return asset.componentNameOriginal || asset.componentNameStandardized || pickValue(assetRows(asset)[0], [header]) || '';
    }
    if (key === 'environment') return asset.environment || '';
    if (key === 'subtype') return asset.subtype || '';
    if (key === 'vendor') return asset.vendor || '';
    if (key === 'obsolete') return asset.state || '';

    const rows = assetRows(asset);
    if (key.startsWith('lifecycle')) {
      const datedValues = rows
        .map((row) => pickValue(row, [header]))
        .map((value) => ({ value, date: parseDateValue(value) }))
        .filter((item) => item.date)
        .sort((a, b) => b.date.getTime() - a.date.getTime());
      if (datedValues.length) return datedValues[0].value;
    }
    for (const row of rows) {
      const value = pickValue(row, [header]);
      if (value !== '' && value !== null && value !== undefined) return value;
    }
    return '';
  }

  function createTimelineExportWorkbook(dataset, assets) {
    const templateWorkbook = dataset.sourceWorkbook;
    const sourceSheetName = dataset.componentSheetName;
    const sourceSheet = templateWorkbook && templateWorkbook.Sheets && templateWorkbook.Sheets[sourceSheetName];
    if (!sourceSheet || !sourceSheet['!ref']) {
      throw new Error('O modelo formatado da folha Inventário de Componentes não está disponível. Carregue novamente o inventário.');
    }

    const sourceRange = XLSX.utils.decode_range(sourceSheet['!ref']);
    const headerCellAddress = Object.keys(sourceSheet).find((address) => (
      !address.startsWith('!')
      && normalizeKey(sourceSheet[address] && sourceSheet[address].v) === 'component name'
    ));
    const headerRow = headerCellAddress
      ? XLSX.utils.decode_cell(headerCellAddress).r
      : undefined;
    if (headerRow === undefined) {
      throw new Error('Não foi possível identificar os cabeçalhos da folha Inventário de Componentes.');
    }

    const tableHeaderRow = headerRow - 1;
    const firstDataRow = headerRow + 1;
    const outputSheetName = 'Inventário Componentes';
    const worksheet = {};
    const thinBorder = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } },
    };
    const groupHeadingStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: '0071CE' } },
      font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: thinBorder,
    };
    const standardHeaderStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: '95DAF7' } },
      font: { name: 'Arial', sz: 9, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: thinBorder,
    };
    const tableCellStyle = {
      font: { name: 'Arial', sz: 9, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: thinBorder,
    };

    Object.entries(sourceSheet).forEach(([key, value]) => {
      if (key.startsWith('!')) {
        if (key === '!ref' || key === '!merges' || key === '!cols' || key === '!rows' || key === '!autofilter') return;
        worksheet[key] = value;
        return;
      }

      const position = XLSX.utils.decode_cell(key);
      if (position.r > headerRow || (position.r >= headerRow && position.c === 1)) return;
      const outputColumn = position.r >= tableHeaderRow && position.c > 1 ? position.c - 1 : position.c;
      worksheet[XLSX.utils.encode_cell({ r: position.r, c: outputColumn })] = { ...value };
    });

    const templateDataRow = sourceSheet['!rows'] && sourceSheet['!rows'][firstDataRow];
    const sourceColumnIndexes = Array.from(
      { length: sourceRange.e.c - sourceRange.s.c + 1 },
      (_, offset) => sourceRange.s.c + offset,
    ).filter((column) => column !== 1);
    const outputHeaders = sourceColumnIndexes.map((column) => dataset.compHeaders[column] || '');

    assets.forEach((asset, assetIndex) => {
      const outputRow = firstDataRow + assetIndex;
      sourceColumnIndexes.forEach((sourceColumn, outputColumnIndex) => {
        const header = outputHeaders[outputColumnIndex];
        const value = getTimelineExportValue(asset, header);
        const templateCell = sourceSheet[XLSX.utils.encode_cell({ r: firstDataRow, c: sourceColumn })];
        const cell = templateCell ? { ...templateCell } : {};
        delete cell.v;
        delete cell.w;
        if (value !== '' && value !== null && value !== undefined) {
          cell.v = value;
          cell.t = typeof value === 'number' ? 'n' : 's';
        } else {
          cell.t = 'z';
        }
        const outputColumn = sourceColumn > 1 ? sourceColumn - 1 : sourceColumn;
        worksheet[XLSX.utils.encode_cell({ r: outputRow, c: outputColumn })] = cell;
      });
      if (templateDataRow) {
        if (!worksheet['!rows']) worksheet['!rows'] = [];
        worksheet['!rows'][outputRow] = { ...templateDataRow };
      }
    });

    const applyCellStyle = (row, column, style) => {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      if (!worksheet[address]) worksheet[address] = { t: 'z' };
      worksheet[address].s = style;
    };
    if (worksheet.B2) worksheet.B2.s = {
      font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '0071CE' } },
    };
    if (worksheet.B3) worksheet.B3.s = {
      font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '16314A' } },
    };
    worksheet.B5.v = 'IT Component';
    worksheet.L5.v = 'Conclusion';
    for (let column = 1; column <= 10; column += 1) {
      applyCellStyle(tableHeaderRow, column, groupHeadingStyle);
      applyCellStyle(headerRow, column, standardHeaderStyle);
    }
    for (let column = 11; column <= 12; column += 1) {
      applyCellStyle(tableHeaderRow, column, groupHeadingStyle);
      applyCellStyle(headerRow, column, groupHeadingStyle);
    }
    for (let row = firstDataRow; row < firstDataRow + assets.length; row += 1) {
      for (let column = 1; column <= 12; column += 1) applyCellStyle(row, column, tableCellStyle);
    }

    const lastDataRow = assets.length ? firstDataRow + assets.length - 1 : headerRow;
    worksheet['!ref'] = XLSX.utils.encode_range({
      s: { r: sourceRange.s.r, c: sourceRange.s.c },
      e: { r: lastDataRow, c: sourceRange.e.c - 1 },
    });
    worksheet['!cols'] = (sourceSheet['!cols'] || [])
      .slice(sourceRange.s.c, sourceRange.e.c + 1)
      .filter((_, offset) => sourceRange.s.c + offset !== 1)
      .map((column) => column ? { ...column } : column);
    worksheet['!rows'] = (sourceSheet['!rows'] || []).slice(0, firstDataRow).map((row) => row ? { ...row } : row);
    if (assets.length && templateDataRow) {
      assets.forEach((_, index) => {
        worksheet['!rows'][firstDataRow + index] = { ...templateDataRow };
      });
    }
    worksheet['!merges'] = (sourceSheet['!merges'] || []).reduce((merges, originalMerge) => {
      const merge = {
        s: { ...originalMerge.s },
        e: { ...originalMerge.e },
      };
      if (merge.s.r >= tableHeaderRow) {
        if (merge.s.c === 1 && merge.e.c === 1) return merges;
        if (merge.s.c > 1) merge.s.c -= 1;
        if (merge.e.c > 1) merge.e.c -= 1;
      }
      if (merge.s.c <= merge.e.c && merge.s.r <= merge.e.r) merges.push(merge);
      return merges;
    }, []);
    worksheet.B5 = { t: 's', v: 'IT Component', s: groupHeadingStyle };
    worksheet.L5 = { t: 's', v: 'Conclusion', s: groupHeadingStyle };

    const workbook = {
      ...templateWorkbook,
      SheetNames: [outputSheetName],
      Sheets: { [outputSheetName]: worksheet },
    };
    if (templateWorkbook.Workbook && Array.isArray(templateWorkbook.Workbook.Sheets)) {
      const templateMetadata = templateWorkbook.Workbook.Sheets.find((sheet) => sheet.name === sourceSheetName);
      workbook.Workbook = {
        ...templateWorkbook.Workbook,
        Sheets: [{ ...(templateMetadata || {}), name: outputSheetName }],
      };
    }
    return workbook;
  }

  function exportTimelineBucket(bucketKey) {
    const dataset = this.state.dataset;
    if (!dataset || !Array.isArray(dataset.compHeaders)) {
      throw new Error('Não foi possível obter as colunas da folha Inventário de Componentes.');
    }
    if (typeof XLSX === 'undefined' || !XLSX.utils || !XLSX.write) {
      throw new Error('A biblioteca de Excel não está disponível.');
    }

    const bucketLabels = {
      obsoletos: 'fim-suporte-ultrapassado',
      sixMonths: 'fim-suporte-proximos-6-meses',
      twelveMonths: 'fim-suporte-6-a-12-meses',
      twentyFourMonths: 'fim-suporte-12-a-24-meses',
      after24: 'fim-suporte-apos-24-meses',
    };
    const headers = dataset.compHeaders;
    const assets = getTimelineBucketAssets(dataset, bucketKey);
    const workbook = createTimelineExportWorkbook(dataset, assets);
    const filename = `ativos-${bucketLabels[bucketKey] || 'timeline'}.xlsx`;
    const fileData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([fileData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { filename, count: assets.length };
  }

  function setTimelineExportStatus(message, isError) {
    const status = document.querySelector('.timeline-export-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
  }

  function renderTimelinePage() {
    const dataset = this.state.dataset;
    const contentDiv = document.getElementById('dashboard-analytics-content');
    if (!contentDiv || !dataset) return;

    const summary = getTimelineSummary(dataset);
    const nextDay = addDays(summary.today, 1);
    const windows = [
      { key: 'obsoletos', label: 'Fim de suporte: já ultrapassado', tone: 'timeline-card--obsolete' },
      { key: 'sixMonths', label: 'Fim de suporte: nos próximos 6 meses', tone: 'timeline-card--risk' },
      { key: 'twelveMonths', label: 'Fim de suporte: entre 6 e 12 meses', tone: 'timeline-card--amber' },
      { key: 'twentyFourMonths', label: 'Fim de suporte: entre 12 e 24 meses', tone: 'timeline-card--future' },
      { key: 'after24', label: 'Fim de suporte: após 24 meses', tone: 'timeline-card--supported' },
    ];
    contentDiv.innerHTML = `
      <section class="card-panel">
        <div class="panel-heading">
          <h2>Timeline de obsolescência</h2>
          <p>Ativos agrupados pelo tempo restante até ao fim de suporte considerado.</p>
        </div>
        <div class="timeline-grid">
          ${windows.map((windowDef) => {
            const count = summary[windowDef.key] || 0;
            return `
              <div class="timeline-card ${windowDef.tone}">
                <span>${windowDef.label}</span>
                <strong>${formatNumber(count)}</strong>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderExpiringPage() {
    const dataset = this.state.dataset;
    const contentDiv = document.getElementById('dashboard-analytics-content');
    if (!contentDiv || !dataset) return;

    const rows = (dataset.allAssets || []).filter((asset) => asset.state === 'Yes').map((asset) => {
      const lifecycleDate = latestLifecycleDate(asset);
      return {
        name: readField(asset, RESOURCE_KEYS.componentName) || readField(asset, RESOURCE_KEYS.itemName) || 'Sem nome',
        version: readField(asset, ['name and version / model (if hardware)', 'Name and version / Model (if Hardware)', 'version', 'Version']) || 'Sem versão',
        category: readField(asset, ['category', 'Categoria']) || 'Sem categoria',
        environment: readField(asset, RESOURCE_KEYS.environment) || 'Sem ambiente',
        vendor: readField(asset, RESOURCE_KEYS.vendor) || 'Sem fornecedor',
        applications: asset.applications || [],
        date: lifecycleDate,
      };
    }).filter((item) => item.date).sort((a, b) => a.date - b.date);

    const filterKeys = ['version', 'category', 'environment', 'vendor'];
    const filters = this.state.expiringFilters || (this.state.expiringFilters = {});
    const filterLabels = {
      version: 'Versão / Modelo',
      category: 'Categoria',
      environment: 'Ambiente',
      vendor: 'Fornecedor',
    };
    const normalizeFilterValue = (value) => String(value ?? '').trim().toLocaleLowerCase('pt-PT');
    const filterOptions = Object.fromEntries(filterKeys.map((key) => [
      key,
      [...new Map(rows.map((row) => [normalizeFilterValue(row[key]), String(row[key])])).values()]
        .sort((a, b) => a.localeCompare(b, 'pt-PT', { sensitivity: 'base' })),
    ]));

    contentDiv.innerHTML = `
      <section class="card-panel">
        <div class="panel-heading">
          <div>
            <h2>Ativos obsoletos</h2>
            <p>Componentes com “Obsolete? = Yes” e uma data de fim de suporte disponível.</p>
          </div>
        </div>
        <div class="advanced-kpis obsolete-kpis">
          <article class="advanced-kpi-card kpi-tone-yes">
            <span>Ativos obsoletos apresentados</span>
            <strong data-obsolete-count>${formatNumber(rows.length)}</strong>
          </article>
        </div>
        <div class="table-wrap">
          <table class="table-obsolete">
            <thead>
              <tr>
                <th>Componente</th>
                ${filterKeys.map((key) => `
                  <th>
                    <label class="obsolete-filter">
                      <span>${filterLabels[key]}</span>
                      ${key === 'version' ? `
                        <input type="search" list="obsolete-version-options" data-obsolete-filter="${key}" value="${escapeHtml(filters[key] || '')}" placeholder="Todos ou pesquisar..." aria-label="Pesquisar ou filtrar por ${filterLabels[key]}" />
                        <datalist id="obsolete-version-options">
                          ${filterOptions[key].map((option) => `<option value="${escapeHtml(option)}"></option>`).join('')}
                        </datalist>
                      ` : `
                        <select data-obsolete-filter="${key}" aria-label="Filtrar por ${filterLabels[key]}">
                          <option value="">Todos</option>
                          ${filterOptions[key].map((option) => `<option value="${escapeHtml(option)}" ${normalizeFilterValue(filters[key]) === normalizeFilterValue(option) ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
                        </select>
                      `}
                    </label>
                  </th>
                `).join('')}
                <th>Aplicações afetadas</th>
                <th>Data fim de suporte</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((item) => {
                const now = Date.now();
                const diff = (new Date(item.date).getTime() - now) / (1000 * 60 * 60 * 24);
                let badge = 'normal';
                if (diff <= 0) badge = 'expired';
                else if (diff <= 90) badge = 'soon';
                else if (diff <= 180) badge = 'warning';
                return `
                  <tr class="clickable-row ${badge}" data-kind="component" data-name="${escapeHtml(item.name)}" data-filter-version="${escapeHtml(item.version)}" data-filter-category="${escapeHtml(item.category)}" data-filter-environment="${escapeHtml(item.environment)}" data-filter-vendor="${escapeHtml(item.vendor)}">
                    <td class="cell-long"><span class="clamp-two">${escapeHtml(item.name)}</span></td>
                    <td class="cell-long"><span class="clamp-two">${escapeHtml(item.version)}</span></td>
                    <td>${escapeHtml(item.category)}</td>
                    <td><span class="environment-badge environment-${normalizeKey(item.environment).replace(/\s+/g, '-')}">${escapeHtml(item.environment)}</span></td>
                    <td>${escapeHtml(item.vendor)}</td>
                    <td class="cell-secondary cell-long"><span class="clamp-two">${escapeHtml((item.applications || []).join(', ') || 'Sem aplicações')}</span></td>
                    <td class="numeric-cell">${escapeHtml(formatDate(item.date))}</td>
                  </tr>
                `;
              }).join('')}
              <tr data-obsolete-empty hidden><td colspan="7" class="obsolete-empty">Sem ativos para os filtros selecionados.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    `;

    const applyObsoleteFilters = () => {
      let visibleCount = 0;
      contentDiv.querySelectorAll('[data-kind="component"]').forEach((row) => {
        const matches = filterKeys.every((key) => {
          const filterValue = normalizeFilterValue(filters[key]);
          const rowValue = normalizeFilterValue(row.dataset[`filter${key[0].toUpperCase()}${key.slice(1)}`]);
          return !filterValue || (key === 'version' ? rowValue.includes(filterValue) : rowValue === filterValue);
        });
        row.hidden = !matches;
        if (matches) visibleCount += 1;
      });
      const count = contentDiv.querySelector('[data-obsolete-count]');
      const emptyState = contentDiv.querySelector('[data-obsolete-empty]');
      if (count) count.textContent = formatNumber(visibleCount);
      if (emptyState) emptyState.hidden = visibleCount > 0;
    };

    contentDiv.querySelectorAll('[data-obsolete-filter]').forEach((filter) => {
      const eventName = filter.tagName === 'INPUT' ? 'input' : 'change';
      filter.addEventListener(eventName, (event) => {
        const { obsoleteFilter } = event.currentTarget.dataset;
        this.state.expiringFilters[obsoleteFilter] = event.currentTarget.value;
        applyObsoleteFilters();
      });
    });

    applyObsoleteFilters();

    contentDiv.querySelectorAll('[data-kind="component"]').forEach((row) => {
      row.addEventListener('click', () => {
        const asset = (dataset.allAssets || []).find((item) => (readField(item, RESOURCE_KEYS.componentName) || readField(item, RESOURCE_KEYS.itemName) || '').toLowerCase() === row.dataset.name.toLowerCase());
        if (asset) openComponentDetail(asset);
      });
    });
  }

  function renderVendorsPage() {
    const dataset = this.state.dataset;
    const contentDiv = document.getElementById('dashboard-analytics-content');
    if (!contentDiv || !dataset) return;

    const vendorMap = new Map();
    (dataset.allAssets || []).forEach((asset) => {
      const vendor = readField(asset, RESOURCE_KEYS.vendor) || 'Sem fornecedor';
      const current = vendorMap.get(vendor) || { obsolete: 0, atRisk: 0, total: 0, applications: new Set() };
      current.total += 1;
      if ((asset.state || '').includes('Yes')) current.obsolete += 1;
      if ((asset.state || '').includes('At Risk')) current.atRisk += 1;
      (asset.applications || []).forEach((app) => current.applications.add(app));
      vendorMap.set(vendor, current);
    });

    const rows = [...vendorMap.entries()].map(([name, values]) => ({
      name,
      obsolete: values.obsolete,
      atRisk: values.atRisk,
      percent: values.total ? Number(((values.obsolete + values.atRisk) / values.total) * 100).toFixed(1) : '0.0',
      applications: [...values.applications],
    })).sort((a, b) => (b.obsolete + b.atRisk) - (a.obsolete + a.atRisk));

    contentDiv.innerHTML = `
      <section class="card-panel">
        <div class="panel-heading">
          <div>
            <h2>Análise por fornecedor</h2>
            <p>Fornecedores ordenados pelo número de ativos obsoletos ou em risco.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table-vendors">
            <thead><tr><th>Fornecedor</th><th>Ativos obsoletos</th><th>Ativos em risco</th><th>% de obsolescência</th><th>Aplicações impactadas</th></tr></thead>
            <tbody>
              ${rows.slice(0, 15).map((row) => `
                <tr>
                  <td>${escapeHtml(row.name)}</td>
                  <td>${formatNumber(row.obsolete)}</td>
                  <td>${formatNumber(row.atRisk)}</td>
                  <td>
                    <div class="percent-cell ${percentTone(row.percent)}">
                      <span class="percent-pill">${row.percent}%</span>
                      <span class="percent-track" aria-hidden="true"><i style="width:${Math.min(Number(row.percent), 100)}%"></i></span>
                    </div>
                  </td>
                  <td class="cell-secondary cell-long"><span class="clamp-two">${escapeHtml(row.applications.join(', ') || 'Sem aplicações')}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderDomainsPage() {
    const dataset = this.state.dataset;
    const contentDiv = document.getElementById('dashboard-analytics-content');
    if (!contentDiv || !dataset) return;

    const domainGroups = ['businessDomain', 'functionalArea'];
    const applicationAssets = (dataset.allAssets || []).filter((asset) => asset.origin === 'application');
    const renders = domainGroups.map((groupKey) => {
      const keyMap = {
        businessDomain: ['business domain', 'dominio de negocio'],
        functionalArea: ['functional area', 'area funcional'],
      };
      const map = new Map();
      applicationAssets.forEach((asset) => {
        const value = readField(asset, keyMap[groupKey]) || 'Sem registo';
        const current = map.get(value) || { count: 0, applications: new Set(), obsolete: 0, atRisk: 0 };
        current.count += 1;
        if ((asset.state || '').includes('Yes')) current.obsolete += 1;
        if ((asset.state || '').includes('At Risk')) current.atRisk += 1;
        (asset.applications || []).forEach((app) => current.applications.add(app));
        map.set(value, current);
      });
      const rows = [...map.entries()].map(([name, stats]) => ({
        name,
        impact: stats.applications.size,
        count: stats.count,
        obsolete: stats.obsolete,
        atRisk: stats.atRisk,
        percent: stats.count ? Number(((stats.obsolete + stats.atRisk) / stats.count) * 100).toFixed(1) : '0.0',
      })).sort((a, b) => Number(b.percent) - Number(a.percent));

      return `
        <div class="card-panel compact-panel">
          <div class="panel-heading">
            <div><h2>${groupKey === 'businessDomain' ? 'Business Domain' : 'Functional Area'}</h2></div>
          </div>
          <div class="table-wrap domain-table-wrap">
            <table class="table-domains">
              <thead><tr><th>Nome</th><th>Aplicações impactadas</th><th>Componentes impactados</th><th>% obsolescência</th></tr></thead>
              <tbody>
                ${rows.slice(0, 10).map((row) => `
                  <tr class="${row.name === 'Sem registo' ? 'domain-row-missing' : ''}">
                    <td class="domain-name">${escapeHtml(row.name)}${row.name === 'Sem registo' ? '<span class="quality-badge">Qualidade de dados</span>' : ''}</td>
                    <td class="numeric-cell">${formatNumber(row.impact)}</td>
                    <td class="numeric-cell">${formatNumber(row.count)}</td>
                    <td>
                      <div class="percent-cell ${percentTone(row.percent)}">
                        <span class="percent-pill">${row.percent}%</span>
                        <span class="percent-track" aria-hidden="true"><i style="width:${Math.min(Number(row.percent), 100)}%"></i></span>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    contentDiv.innerHTML = `<section class="card-panel">    <div class="panel-heading"><div><h2>Análise por domínio de negócio</h2><p>Componentes associadas a aplicações na folha “Inventário de Aplicações”, agrupadas por domínio e área funcional.</p></div></div><div class="two-column-grid">${renders}</div></section>`;
  }

  function renderRemediationPage() {
    const dataset = this.state.dataset;
    const contentDiv = document.getElementById('dashboard-analytics-content');
    if (!contentDiv || !dataset) return;

    const priorities = {
      'Prioridade 1': [],
      'Prioridade 2': [],
      'Prioridade 3': [],
      'Prioridade 4': [],
    };

    (dataset.allAssets || []).forEach((asset) => {
      if (asset.state !== 'Yes' && asset.state !== 'At Risk') return;
      const date = latestLifecycleDate(asset);
      const hasApplication = asset.origin === 'application' && (asset.applications || []).length > 0;
      let bucket;
      if (asset.state === 'Yes' && hasApplication) bucket = 'Prioridade 1';
      else if (asset.state === 'Yes') bucket = 'Prioridade 2';
      else if (hasApplication) bucket = 'Prioridade 3';
      else bucket = 'Prioridade 4';
      priorities[bucket].push({ asset, date });
    });

    Object.values(priorities).forEach((assets) => {
      assets.sort((a, b) => {
        if (!a.date) return b.date ? 1 : 0;
        if (!b.date) return -1;
        return a.date - b.date;
      });
    });

    const cards = Object.entries(priorities).map(([label, assets]) => `
      <div class="priority-box priority-box-${label.slice(-1)}">
        <h3>${label}</h3>
        <strong>${formatNumber(assets.length)}</strong>
        <span>ativos</span>
      </div>
    `).join('');

    contentDiv.innerHTML = `
      <section class="card-panel">
        <div class="panel-heading">
          <div>
            <h2>Plano de remediação</h2>
            <p>São apresentados todos os componentes obsoletos ou em risco. Prioridade 1: obsoletos associados a aplicações; Prioridade 2: restantes obsoletos; Prioridade 3: componentes em risco associados a aplicações; Prioridade 4: restantes componentes em risco. A data de fim de suporte ordena os ativos dentro de cada prioridade; os sem data aparecem no final.</p>
          </div>
        </div>
        <div class="priority-grid">${cards}</div>
        <div class="table-wrap">
          <table class="table-remediation">
            <thead><tr><th>Prioridade</th><th>Componente</th><th>Aplicações associadas</th><th>Suporta aplicação?</th><th>Categoria</th><th>Ambiente</th><th>Data fim de suporte</th></tr></thead>
            <tbody>
              ${Object.entries(priorities).flatMap(([label, entries]) => entries.map(({ asset, date }) => `
                <tr>
                  <td><span class="priority-badge priority-badge-${label.slice(-1)}">${label}</span></td>
                  <td class="cell-long"><span class="clamp-two">${escapeHtml(readField(asset, RESOURCE_KEYS.componentName) || readField(asset, RESOURCE_KEYS.itemName) || 'Sem nome')}</span></td>
                  <td class="cell-secondary cell-long"><span class="clamp-two">${escapeHtml((asset.applications || []).join(', ') || 'Sem aplicação associada')}</span></td>
                  <td><span class="support-badge ${asset.origin === 'application' && (asset.applications || []).length > 0 ? 'support-badge-yes' : 'support-badge-no'}">${asset.origin === 'application' && (asset.applications || []).length > 0 ? 'Sim' : 'Não'}</span></td>
                  <td>${escapeHtml(readField(asset, ['category', 'Categoria']) || 'Sem categoria')}</td>
                  <td><span class="environment-badge environment-${normalizeKey(readField(asset, RESOURCE_KEYS.environment)).replace(/\s+/g, '-')}">${escapeHtml(readField(asset, RESOURCE_KEYS.environment) || 'Sem ambiente')}</span></td>
                  <td class="numeric-cell">${escapeHtml(formatDate(date))}</td>
                </tr>
              `)).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderPage(pageName) {
    if (!this.state.dataset) return;
    const summaryPage = document.getElementById('dashboard-summary-page');
    const analyticsPage = document.getElementById('dashboard-analytics-page');
    if (summaryPage) summaryPage.hidden = pageName !== 'summary';
    if (analyticsPage) analyticsPage.hidden = pageName === 'summary';
    document.querySelectorAll('[data-dashboard-page-link]').forEach((button) => {
      const isActive = button.dataset.dashboardPageLink === pageName;
      button.classList.toggle('is-active', isActive);
      if (isActive) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    if (pageName === 'applications') return this.renderApplicationsPage();
    if (pageName === 'timeline') return this.renderTimelinePage();
    if (pageName === 'expiring') return this.renderExpiringPage();
    if (pageName === 'vendors') return this.renderVendorsPage();
    if (pageName === 'domains') return this.renderDomainsPage();
    if (pageName === 'remediation') return this.renderRemediationPage();
    return undefined;
  }

  const DashboardAdvanced = {
    state: {
      dataset: null,
      currentPage: 'summary',
      applicationSearch: '',
      applicationState: 'all',
    },

    init(dataset) {
      this.state.dataset = dataset;
      this.setupNavigation();
      this.renderPage('summary');
    },

    setupNavigation() {
      const navButtons = document.querySelectorAll('[data-dashboard-page-link]');
      navButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
          const page = event.currentTarget.dataset.dashboardPageLink;
          this.state.currentPage = page;
          this.renderPage(page);
        });
      });

      const closeButton = document.querySelector('[data-close-detail]');
      if (closeButton) {
        closeButton.addEventListener('click', closeDialog);
      }
    },

    renderApplicationsPage() {
      renderApplicationsPage.call(this);
    },

    renderTimelinePage() {
      renderTimelinePage.call(this);
    },

    renderExpiringPage() {
      renderExpiringPage.call(this);
    },

    renderVendorsPage() {
      renderVendorsPage.call(this);
    },

    renderDomainsPage() {
      renderDomainsPage.call(this);
    },

    renderRemediationPage() {
      renderRemediationPage.call(this);
    },

    openDetailForApplication(app) {
      openApplicationDetail.call(this, app);
    },

    renderPage(pageName) {
      renderPage.call(this, pageName);
    },

    render(dataset) {
      this.init(dataset);
    },
  };

  global.DashboardAdvanced = DashboardAdvanced;
})(typeof window !== 'undefined' ? window : global);
