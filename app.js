(function (global) {
  const CONFIG = {
    sheetNames: {
      applications: '01. Inventário Aplicações',
      components: '02. Inventário Componentes',
    },
    requiredColumns: {
      applications: [
        'name of application',
        'component name standardized',
        'subtype',
        'application obsolete?',
        'environment',
        'obsolete?',
      ],
      components: [
        'source',
        'component name',
        'environment',
        'subtype',
        'vendor',
        'obsolete?',
      ],
    },
    subtypeGroups: {
      'Hardware físico': ['Hardware (Físico)', 'Hardware (Physical)'],
      'Sistemas operativos': ['System Software (SO)'],
      'Bases de dados (SGBD)': ['System Software (BD)'],
      'Software aplicacional': ['Application Software', 'Application Software (Package Version)'],
    },
    stateColors: {
      Yes: '#b34b3d',
      'At Risk': '#d79e2e',
      No: '#315d32',
      'n.d. - No official lifecycle information available': '#c9cec6',
      'n.a. (internal application)': '#62758a',
      'n.a. (application with no components)': '#a1adba',
      'n.a. (virtual machine)': '#c2cbd4',
      'n.a. (não especificado)': '#8c8c8c',
      'Não classificado': '#d0d0d0',
    },
    envMap: {
      PRD: 'Produtivo',
      QLY: 'Não produtivo',
      DEV: 'Não produtivo',
      PRE: 'Não produtivo',
      UAT: 'Não produtivo',
    },
    stateOrder: [
      'Yes',
      'At Risk',
      'No',
      'n.d. - No official lifecycle information available',
      'n.a. (internal application)',
      'n.a. (application with no components)',
      'n.a. (virtual machine)',
      'n.a. (não especificado)',
      'Não classificado',
    ],
    chartPalette: ['#b34b3d', '#d79e2e', '#315d32', '#c9cec6'],
  };

  function normalizeText(value) {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeHeader(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toNull(value) {
    const text = normalizeText(value);
    if (!text) return null;
    const lower = text.toLowerCase();
    if (['n/a', 'n.a', 'n.a.', 'n.d.', 'n.d', 'na', 'none', 'null', 'undefined'].includes(lower)) return null;
    return value;
  }

  function parseDateValue(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
      const date = new Date(Math.round((value - 25569) * 86400 * 1000));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const cleaned = normalizeText(value);
    if (!cleaned) return null;
    const portugueseDate = cleaned.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})(?:\s.*)?$/);
    if (portugueseDate) {
      const day = Number(portugueseDate[1]);
      const month = Number(portugueseDate[2]);
      const year = Number(portugueseDate[3]);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
      return null;
    }
    const date = new Date(cleaned);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = parseDateValue(value);
    if (!date) return 'Sem data';
    return date.toLocaleDateString('pt-PT');
  }

  function titleCase(text) {
    return normalizeText(text).replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function parseCSVValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function classifySupportState(obsoleteValue) {
    const obsolete = normalizeHeader(obsoleteValue);
    if (obsolete.includes('n a internal application')) return 'n.a. (internal application)';
    if (obsolete.includes('n a application with no components')) return 'n.a. (application with no components)';
    if (obsolete.includes('n a virtual machine')) return 'n.a. (virtual machine)';
    if (obsolete.startsWith('n d')) return 'n.d. - No official lifecycle information available';
    if (obsolete === 'yes') return 'Yes';
    if (obsolete === 'at risk') return 'At Risk';
    if (obsolete === 'no') return 'No';
    if (obsolete === 'n a' || obsolete === 'na') return 'n.a. (não especificado)';
    return 'Não classificado';
  }

  function normalizeSubtype(subtype) {
    const value = normalizeText(subtype);
    if (!value) return 'Sem subtype';
    const result = value
      .replace(/\s+$/g, '')
      .replace(/\s+/g, ' ');
    return result;
  }

  function categoryForSubtype(subtype) {
    const normalized = normalizeSubtype(subtype);
    const map = CONFIG.subtypeGroups;
    for (const [category, values] of Object.entries(map)) {
      if (values.some((value) => normalizeHeader(value) === normalizeHeader(normalized))) return category;
    }
    if (normalizeHeader(normalized) === normalizeHeader('Hardware (Virtual)')) return 'Hardware virtual';
    return 'Sem categoria';
  }

  function applicationStateFromText(value) {
    const normalized = normalizeHeader(value);
    if (normalized.includes('n a internal application')) return 'n.a. (internal application)';
    if (normalized.includes('n a application with no components')) return 'n.a. (application with no components)';
    if (normalized.includes('n a virtual machine')) return 'n.a. (virtual machine)';
    if (normalized.startsWith('n d')) return 'n.d. - No official lifecycle information available';
    if (normalized === 'yes') return 'Yes';
    if (normalized === 'at risk') return 'At Risk';
    if (normalized === 'no') return 'No';
    if (normalized === 'n a' || normalized === 'na') return 'n.a. (não especificado)';
    return 'Não classificado';
  }

  function isNoComponentsRow(row) {
    const subtype = normalizeHeader(pickValue(row, ['subtype', 'Subtype']));
    const noComponentState = (value) => normalizeHeader(value).includes('application with no components');
    return ['n a', 'na'].includes(subtype)
      || noComponentState(pickValue(row, ['application obsolete?', 'Application Obsolete?']))
      || noComponentState(pickValue(row, ['obsolete?', 'Obsolete?']));
  }

  function isVirtualAsset(asset) {
    return normalizeHeader(asset.subtype) === normalizeHeader('Hardware (Virtual)')
      || asset.state === 'n.a. (virtual machine)';
  }

  function uniqueNonEmpty(values) {
    return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
  }

  function isMissingValue(value) {
    const normalized = normalizeHeader(value);
    return !normalized || ['n a', 'na', 'n d', 'nd', 'n d no official lifecycle information available'].includes(normalized);
  }

  function qualityFlagsForRow(row, origin, noComponents) {
    if (noComponents) return [];
    const flags = [];
    const subtype = pickValue(row, ['subtype', 'Subtype']);
    const vendor = pickValue(row, ['vendor', 'Vendor']);
    const environment = pickValue(row, ['environment', 'Environment']);
    const stdName = pickValue(row, ['component name standardized', 'Component name (Standardized)']);
    const componentName = pickValue(row, ['component name', 'Component name']);
    const lifecycleValues = [
      pickValue(row, ['lifecycle end of life eol date end of support eos date']),
      pickValue(row, ['lifecycle end of extended support eoes date if applicable']),
      pickValue(row, ['lifecycle end of extended security updates esu date if applicable']),
    ];

    if (!normalizeText(subtype)) flags.push('Subtype vazio');
    else if (categoryForSubtype(subtype) === 'Sem categoria') flags.push('Subtype não reconhecido');
    if (origin === 'application' && !normalizeText(stdName)) flags.push('Component name (Standardized) vazio');
    if (origin === 'component' && !normalizeText(componentName)) flags.push('Component name vazio');
    if (isMissingValue(vendor)) flags.push('Vendor vazio');
    if (isMissingValue(environment)) flags.push('Environment vazio');

    const hasOfficialLifecycleInfo = lifecycleValues.some((value) => !isMissingValue(value) && !normalizeText(value).toLowerCase().startsWith('n.a.'));
    if (!hasOfficialLifecycleInfo) flags.push('Informação de lifecycle em falta');
    lifecycleValues.forEach((value) => {
      if (isMissingValue(value)) return;
      const text = normalizeHeader(value);
      if (text.startsWith('n a') || text.startsWith('n d')) return;
      if (!parseDateValue(value)) flags.push('Data de lifecycle inválida');
    });
    return [...new Set(flags)];
  }

  function buildApplicationProfiles(rows) {
    const grouped = new Map();
    rows.forEach((row) => {
      const name = normalizeText(pickValue(row, ['name of application', 'Name of application']));
      if (!name) return;
      const key = name.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, { name, rows: [] });
      grouped.get(key).rows.push(row);
    });

    const rank = { Yes: 1, 'At Risk': 2, No: 3, 'n.d. - No official lifecycle information available': 4, 'n.a. (internal application)': 5, 'n.a. (application with no components)': 6, 'n.a. (virtual machine)': 7 };
    return [...grouped.values()].map(({ name, rows: applicationRows }) => {
      const hasComponents = applicationRows.some((row) => !isNoComponentsRow(row));
      const states = applicationRows
        .map((row) => isNoComponentsRow(row)
          ? 'n.a. (application with no components)'
          : applicationStateFromText(pickValue(row, ['application obsolete?', 'Application Obsolete?'])))
        .filter((state) => state !== 'Não classificado');
      const distinctStates = uniqueNonEmpty(states);
      const state = hasComponents
        ? (states.filter((item) => item !== 'n.a. (application with no components)').sort((a, b) => rank[a] - rank[b])[0] || 'Não classificado')
        : 'n.a. (application with no components)';
      return {
        name,
        state,
        hasComponents,
        conflicts: distinctStates.length > 1,
        rows: applicationRows,
      };
    });
  }

  function isProductiveEnvironment(environment) {
    const env = normalizeText(environment).toUpperCase();
    return env === 'PRD';
  }

  function hasEnvironment(environment) {
    const value = normalizeHeader(environment);
    return Boolean(value) && value !== normalizeHeader('n.a.(package version)');
  }

  function updateConflictStatus(conflicts, message) {
    if (!message) return;
    conflicts.push(message);
  }

  function getApplicableDate(value) {
    const date = parseDateValue(value);
    if (!date) return null;
    return date;
  }

  function pickValue(obj, keys) {
    for (const key of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    }
    const normalizedKeys = keys.map((key) => normalizeHeader(key));
    for (const [entryKey, value] of Object.entries(obj || {})) {
      if (normalizedKeys.includes(normalizeHeader(entryKey))) return value;
    }
    return null;
  }

  function excelHeaderMap(headers) {
    return headers.reduce((acc, header, index) => {
      acc[normalizeHeader(header)] = index;
      return acc;
    }, {});
  }

  function getCell(row, idx) {
    return row && idx >= 0 && idx < row.length ? row[idx] : null;
  }

  function toSheetRows(sheet) {
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
    return rows.map((row) => row.map((cell) => (cell === undefined ? null : cell)));
  }

  function extractDataRows(sheet) {
    const rows = toSheetRows(sheet);
    if (!rows.length) return { headers: [], rows: [] };
    const discoveredHeaderRow = rows.findIndex((row) => {
      const joined = row.map((cell) => normalizeHeader(cell)).join(' ');
      return joined.toLowerCase().includes('name of application') || joined.toLowerCase().includes('source') || joined.toLowerCase().includes('component name');
    });
    if (discoveredHeaderRow === -1) {
      return { headers: [], rows: [] };
    }
    const headers = rows[discoveredHeaderRow].map((value) => normalizeText(value) || '');
    const dataRows = rows.slice(discoveredHeaderRow + 1).filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''));
    return { headers, rows: dataRows };
  }

  function safeLookup(headers, row, target) {
    const map = excelHeaderMap(headers);
    const index = map[normalizeHeader(target)];
    return index === undefined ? null : getCell(row, index);
  }

  function normalizeRowObject(raw, headers) {
    const obj = {};
    headers.forEach((header, idx) => {
      const key = normalizeHeader(header) || `col_${idx}`;
      obj[key] = raw[idx] ?? null;
    });
    return obj;
  }

  function validateRequiredColumns(sheetName, headers, requiredColumns) {
    const missing = requiredColumns.filter((required) => !headers.some((header) => normalizeHeader(header) === normalizeHeader(required)));
    if (missing.length) {
      throw new Error(`Falta a coluna ${missing.join(', ')} na folha "${sheetName}". A coluna deveria existir nesta folha.`);
    }
  }

  function findWorkbookSheet(workbook, regexPattern) {
    const match = workbook.SheetNames.find((name) => new RegExp(regexPattern, 'i').test(normalizeText(name)));
    return match || null;
  }

  function buildApplicationDataset(appRows) {
    const validRows = appRows
      .map((row, index) => {
        const subtype = pickValue(row, ['subtype', 'Subtype']);
        const noComponents = isNoComponentsRow(row);
        return {
          ...row,
          _source: 'application',
          _sourceRowNumber: row._sourceRowNumber || index + 7,
          _state: classifySupportState(pickValue(row, ['obsolete?', 'Obsolete?'])),
          _appState: applicationStateFromText(pickValue(row, ['application obsolete?', 'Application Obsolete?'])),
          _subcategory: normalizeSubtype(subtype),
          _category: categoryForSubtype(subtype),
          _environment: normalizeText(pickValue(row, ['environment', 'Environment'])),
          _appName: normalizeText(pickValue(row, ['name of application', 'Name of application'])),
          _componentNameStd: normalizeText(pickValue(row, ['component name standardized', 'Component name (Standardized)'])),
          _componentName: normalizeText(pickValue(row, ['component name', 'Component name'])),
          _vendor: normalizeText(pickValue(row, ['vendor', 'Vendor'])),
          _noComponents: noComponents,
          _qualityFlags: qualityFlagsForRow(row, 'application', noComponents),
        };
      })
      .filter((record) => record._appName || record._componentName || record._componentNameStd || record._category);
    const applications = buildApplicationProfiles(validRows);
    const uniqueByComponent = new Map();
    validRows.forEach((record) => {
      if (record._noComponents) return;
      if (!record._componentNameStd) {
        record._qualityIssue = 'Component name (Standardized) vazio';
      }
      const key = record._componentNameStd
        ? `${record._componentNameStd.toLowerCase()}|${normalizeHeader(record._subcategory)}|${normalizeHeader(pickValue(record, ['obsolete?', 'Obsolete?']))}`
        : `unidentified|${record._sourceRowNumber}`;
      if (!uniqueByComponent.has(key)) {
        uniqueByComponent.set(key, {
          key,
          rows: [],
          componentNameStd: record._componentNameStd || record._componentName || `Registo sem nome (${record._sourceRowNumber})`,
          subtype: normalizeSubtype(record._subcategory),
          category: record._category,
        });
      }
      uniqueByComponent.get(key).rows.push(record);
    });

    const assets = [];
    const qualityIssues = [];
    const duplicatesRemoved = [];

    validRows.forEach((row) => {
      if (row._qualityFlags.length) {
        row._qualityFlags.forEach((type) => qualityIssues.push({ type, rows: [row] }));
      }
    });

    uniqueByComponent.forEach((bucket) => {
      const componentNameStd = bucket.componentNameStd;
      const rows = bucket.rows;
      if (rows.length > 1) duplicatesRemoved.push(...rows.slice(1));

      const consolidatedState = rows[0]._state;
      const applicationNames = [...new Set(rows.map((row) => row._appName).filter(Boolean))];
      const environments = [...new Set(rows.map((row) => row._environment).filter(hasEnvironment))];
      const vendors = [...new Set(rows.map((row) => normalizeText(row._vendor)).filter(Boolean))];
      const versions = [...new Set(rows.map((row) => normalizeText(pickValue(row, ['name and version / model (if hardware)', 'Name and version / Model (if Hardware)'])).replace(/\s+/g, ' ')).filter(Boolean))];
      const conflicts = [];
      if (new Set(environments).size > 1) conflicts.push('Ambientes contraditórios');
      if (new Set(vendors).size > 1) conflicts.push('Fabricantes contraditórios');
      if (new Set(versions).size > 1) conflicts.push('Versões/modelos contraditórios');
      if (conflicts.length) rows.forEach((row) => qualityIssues.push({ type: 'Valores contraditórios em componente associado', rows: [row] }));

      const asset = {
        origin: 'application',
        category: bucket.category,
        subtype: bucket.subtype,
        componentNameStandardized: componentNameStd,
        componentNameOriginal: pickValue(rows[0], ['component name', 'Component name']) || pickValue(rows[0], ['component name standardized', 'Component name (Standardized)']) || '',
        environment: environments.includes('PRD') ? 'PRD' : environments[0] || '',
        environments,
        vendor: vendors[0] || '',
        applications: applicationNames,
        applicationCount: applicationNames.length,
        state: consolidatedState,
        sourceRows: rows,
        recordCount: rows.length,
        conflicts,
        hasQualityIssue: false,
      };

      assets.push(asset);
    });

    return {
      assets,
      applications,
      qualityIssues,
      duplicatesRemoved,
      totalRawRows: validRows.length,
      noComponentRowCount: validRows.filter((row) => row._noComponents).length,
      assetRowsLoaded: validRows.filter((row) => !row._noComponents).length,
      uniqueComponentCount: assets.length,
      virtualAssetCount: assets.filter(isVirtualAsset).length,
    };
  }

  function buildComponentDataset(componentRows) {
    const rows = componentRows.map((row, index) => {
      const subtype = pickValue(row, ['subtype', 'Subtype']);
      const obsolete = pickValue(row, ['obsolete?', 'Obsolete?']);
      const environment = pickValue(row, ['environment', 'Environment']);
      const componentName = pickValue(row, ['component name', 'Component name']);
      const vendor = pickValue(row, ['vendor', 'Vendor']);
      const sourceRowNumber = row._sourceRowNumber || index + 7;
      return {
        ...row,
        origin: 'component',
        sourceRowNumber,
        _sourceRowNumber: sourceRowNumber,
        _qualityFlags: qualityFlagsForRow(row, 'component', false),
        category: categoryForSubtype(subtype),
        subtype: normalizeSubtype(subtype),
        state: classifySupportState(obsolete),
        environment: hasEnvironment(environment) ? normalizeText(environment) : '',
        componentNameStandardized: normalizeText(componentName),
        componentNameOriginal: normalizeText(componentName),
        vendor: normalizeText(vendor),
        applications: [],
        recordCount: 1,
        conflicts: [],
      };
    });

    const qualityIssues = [];
    rows.forEach((row) => row._qualityFlags.forEach((type) => qualityIssues.push({ type, rows: [row] })));

    return {
      assets: rows,
      duplicates: [],
      duplicateRowsRemoved: 0,
      qualityIssues,
      totalRawRows: rows.length,
    };
  }

  function buildSummary(app, comp) {
    const assets = [...app.assets, ...comp.assets];
    const includedAssets = assets.filter((asset) => !isVirtualAsset(asset));
    const applications = app.applications || [];

    const counts = {
      totalApplications: applications.length,
      applicationsWithComponents: applications.filter((application) => application.hasComponents).length,
      applicationsWithoutComponents: applications.filter((application) => !application.hasComponents).length,
      applicationsObsolete: applications.filter((application) => application.state === 'Yes').length,
      applicationsAtRisk: applications.filter((application) => application.state === 'At Risk').length,
      applicationsSupported: applications.filter((application) => application.state === 'No').length,
      assetsAssociated: app.assets.filter((asset) => !isVirtualAsset(asset)).length,
      assetsNonAssociated: comp.assets.filter((asset) => !isVirtualAsset(asset)).length,
      excludedVirtualAssets: assets.filter(isVirtualAsset).length,
      totalLoadedAssets: (app.assetRowsLoaded ?? app.assets.length) + (comp.totalRawRows ?? comp.assets.length),
      totalAssets: includedAssets.length,
      assessmentUniverse: includedAssets.length,
      obsolete: includedAssets.filter((asset) => asset.state === 'Yes').length,
      atRisk: includedAssets.filter((asset) => asset.state === 'At Risk').length,
      supported: includedAssets.filter((asset) => asset.state === 'No').length,
      unkn: includedAssets.filter((asset) => asset.state === 'n.d. - No official lifecycle information available').length,
      internalApplications: includedAssets.filter((asset) => asset.state === 'n.a. (internal application)').length,
      virtualMachines: assets.filter((asset) => asset.state === 'n.a. (virtual machine)' || isVirtualAsset(asset)).length,
      unclassified: includedAssets.filter((asset) => asset.state === 'Não classificado' || asset.state === 'n.a. (não especificado)').length,
      duplicatesRemoved: (app.duplicatesRemoved || []).length,
      omittedFromApplicationCount: app.duplicatesRemoved.length,
      qualityIssueCount: new Set([
        ...app.qualityIssues.flatMap((issue) => issue.rows.map((row) => `application-${row._sourceRowNumber}`)),
        ...comp.qualityIssues.flatMap((issue) => issue.rows.map((row) => `component-${row._sourceRowNumber}`)),
      ]).size,
    };

    const byCategory = {};
    const categories = Object.keys(CONFIG.subtypeGroups);
    categories.forEach((name) => {
      const categoryAssets = includedAssets.filter((asset) => asset.category === name);
      byCategory[name] = {
        total: categoryAssets.length,
        obsolete: categoryAssets.filter((item) => item.state === 'Yes').length,
        atRisk: categoryAssets.filter((item) => item.state === 'At Risk').length,
        supported: categoryAssets.filter((item) => item.state === 'No').length,
        unknown: categoryAssets.filter((item) => item.state === 'n.d. - No official lifecycle information available').length,
        internal: categoryAssets.filter((item) => item.state === 'n.a. (internal application)').length,
      };
    });

    const byEnvironment = {};
    ['Produtivo', 'Não produtivo'].forEach((label) => {
      byEnvironment[label] = { total: 0, obsolete: 0, atRisk: 0, supported: 0, unknown: 0 };
    });
    includedAssets.forEach((item) => {
      if (!hasEnvironment(item.environment)) return;
      const label = isProductiveEnvironment(item.environment) ? 'Produtivo' : 'Não produtivo';
      if (!byEnvironment[label]) byEnvironment[label] = { total: 0, obsolete: 0, atRisk: 0, supported: 0, unknown: 0 };
      byEnvironment[label].total += 1;
      if (item.state === 'Yes') byEnvironment[label].obsolete += 1;
      if (item.state === 'At Risk') byEnvironment[label].atRisk += 1;
      if (item.state === 'No') byEnvironment[label].supported += 1;
      if (item.state === 'n.d. - No official lifecycle information available') byEnvironment[label].unknown += 1;
    });

    counts.totalAssets = counts.totalLoadedAssets - counts.duplicatesRemoved - counts.excludedVirtualAssets;
    counts.assessmentUniverse = counts.totalAssets;
    return { counts, byCategory, byEnvironment, assets, includedAssets, assessmentAssets: includedAssets, applications };
  }

  function processWorkbook(workbook) {
    if (!workbook || !workbook.SheetNames || !workbook.SheetNames.length) {
      throw new Error('O ficheiro Excel está vazio ou não é válido.');
    }

    const appSheetName = findWorkbookSheet(workbook, 'inventario aplicacoes');
    const componentSheetName = findWorkbookSheet(workbook, 'inventario componentes');
    if (!appSheetName) throw new Error('Falta a folha "01. Inventário Aplicações".');
    if (!componentSheetName) throw new Error('Falta a folha "02. Inventário Componentes".');

    const appSheet = workbook.Sheets[appSheetName];
    const componentSheet = workbook.Sheets[componentSheetName];

    const { headers: appHeaders, rows: appDataRows } = extractDataRows(appSheet);
    const { headers: compHeaders, rows: compDataRows } = extractDataRows(componentSheet);

    if (!appHeaders.length) throw new Error('A folha "01. Inventário Aplicações" não contém cabeçalhos válidos na linha esperada.');
    if (!compHeaders.length) throw new Error('A folha "02. Inventário Componentes" não contém cabeçalhos válidos na linha esperada.');

    validateRequiredColumns(appSheetName, appHeaders, CONFIG.requiredColumns.applications);
    validateRequiredColumns(componentSheetName, compHeaders, CONFIG.requiredColumns.components);

    const appNormalized = appDataRows.map((row, index) => ({ ...normalizeRowObject(row, appHeaders), _sourceRowNumber: index + 7 }));
    const compNormalized = compDataRows.map((row, index) => ({ ...normalizeRowObject(row, compHeaders), _sourceRowNumber: index + 7 }));

    const appDataset = buildApplicationDataset(appNormalized);
    const compDataset = buildComponentDataset(compNormalized);
    const summary = buildSummary(appDataset, compDataset);

    const applicationRows = summary.assets.filter((asset) => asset.origin === 'application');
    const componentRows = summary.assets.filter((asset) => asset.origin === 'component');

    return {
      appSheetName,
      componentSheetName,
      appHeaders,
      compHeaders,
      appRowsCount: appDataRows.length,
      compRowsCount: compDataRows.length,
      appDataset,
      compDataset,
      summary,
      applicationRows,
      componentRows,
      allAssets: summary.assets,
      generatedAt: new Date(),
    };
  }

  function buildFilterOptions(dataset) {
    const assets = dataset.allAssets;
    const options = {
      origin: ['Todos', 'application', 'component'],
      category: ['Todos', ...new Set(assets.map((asset) => asset.category).filter(Boolean))],
      subtype: ['Todos', ...new Set(assets.map((asset) => asset.subtype).filter(Boolean))],
      state: ['Todos', ...CONFIG.stateOrder],
      environment: ['Todos', ...new Set(assets.map((asset) => asset.environment).filter(Boolean))],
      productiveness: ['Todos', 'Produtivo', 'Não produtivo'],
      vendor: ['Todos', ...new Set(assets.map((asset) => asset.vendor).filter(Boolean))],
      application: ['Todos', ...new Set(assets.flatMap((asset) => asset.applications || []).filter(Boolean))],
      businessDomain: ['Todos'],
      functionalArea: ['Todos'],
    };
    return options;
  }

  function populateFilterOptions(dataset) {
    const options = buildFilterOptions(dataset);
    Object.entries(options).forEach(([key, values]) => {
      const select = document.getElementById(`filter-${key}`);
      if (!select) return;
      select.innerHTML = values.map((value) => `<option value="${value}">${value === 'Todos' ? 'Todos' : value}</option>`).join('');
      select.value = 'Todos';
    });
  }

  function applyFilters(dataset, filters) {
    let filtered = dataset.allAssets.slice();
    Object.entries(filters).forEach(([key, value]) => {
      if (!value || value === 'Todos' || value === 'all') return;
      filtered = filtered.filter((asset) => {
        if (key === 'origin') return asset.origin === value;
        if (key === 'category') return asset.category === value;
        if (key === 'subtype') return asset.subtype === value;
        if (key === 'state') return asset.state === value;
        if (key === 'environment') return asset.environment === value;
        if (key === 'productiveness') return hasEnvironment(asset.environment)
          && (isProductiveEnvironment(asset.environment) ? 'Produtivo' : 'Não produtivo') === value;
        if (key === 'vendor') return asset.vendor === value;
        if (key === 'application') return asset.applications.includes(value);
        if (key === 'search') {
          const haystack = [asset.componentNameStandardized, asset.componentNameOriginal, asset.category, asset.subtype, asset.vendor, asset.environment, asset.origin, ...(asset.applications || [])].join(' ').toLowerCase();
          return haystack.includes(value.toLowerCase());
        }
        return true;
      });
    });

    return filtered;
  }

  function renderKpis(dataset) {
    const counts = dataset.summary.counts;
    const considered = counts.assessmentUniverse;
    const cards = [
      { label: 'Yes', value: counts.obsolete, color: 'yes' },
      { label: 'At Risk', value: counts.atRisk, color: 'at-risk' },
      { label: 'No', value: counts.supported, color: 'no' },
      { label: 'n.d. - No official lifecycle information available', value: counts.unkn, color: 'no-data' },
    ];
    const riskCount = counts.obsolete + counts.atRisk;
    const riskShare = percent(riskCount, considered);
    document.getElementById('assessment-risk-total').textContent = numberFormat(riskCount);
    document.getElementById('assessment-risk-share').textContent =
      `${riskShare.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}% dos ${numberFormat(considered)} ativos considerados`;

    document.getElementById('scope-total-loaded').textContent = numberFormat(counts.totalLoadedAssets);
    document.getElementById('scope-duplicates-removed').textContent = numberFormat(counts.duplicatesRemoved);
    document.getElementById('scope-out-of-scope').textContent = numberFormat(counts.excludedVirtualAssets);
    document.getElementById('scope-considered').textContent = numberFormat(counts.totalAssets);

    const legend = cards.map((card) => {
      const share = percent(card.value, considered).toLocaleString('pt-PT', { maximumFractionDigits: 1 });
      return `
        <span class="assessment-legend-item ${card.color}">
          <i aria-hidden="true"></i>
          <span>${card.label === 'n.d. - No official lifecycle information available' ? 'n.d.' : card.label} ${share}%</span>
        </span>
      `;
    }).join('');
    const bar = document.getElementById('assessment-bar');
    bar.innerHTML = cards.map((card) => {
      const share = percent(card.value, considered);
      return `<span class="assessment-bar-segment ${card.color}" style="width:${share}%"></span>`;
    }).join('');
    bar.setAttribute(
      'aria-label',
      `Distribuição dos resultados: ${cards.map((card) => `${card.label}, ${numberFormat(card.value)}`).join('; ')}`,
    );
    document.getElementById('assessment-legend').innerHTML = legend;

    const results = document.getElementById('assessment-outcomes');
    results.innerHTML = cards.map((card) => {
      const share = percent(card.value, considered).toLocaleString('pt-PT', { maximumFractionDigits: 1 });
      return `
        <article class="assessment-card ${card.color}">
          <span class="assessment-label">${card.label}</span>
          <strong>${numberFormat(card.value)}</strong>
          <small>${share}% dos ativos únicos considerados</small>
        </article>
      `;
    }).join('');
  }

  function renderAssessmentScope(dataset) {
    const counts = dataset.summary.counts;
    const exclusions = [
      { label: 'Hardware (Virtual) excluído', value: counts.excludedVirtualAssets, unit: 'ativos' },
      { label: 'Aplicações sem componentes (n/a)', value: counts.applicationsWithoutComponents, unit: 'aplicações' },
    ];
    document.getElementById('out-of-scope-list').innerHTML = exclusions.map((item) => `
      <div class="out-of-scope-item">
        <span>${item.label}</span>
        <strong>${numberFormat(item.value)} ${item.unit}</strong>
      </div>
    `).join('');
  }

  function renderCategoryDistribution(dataset) {
    const categories = [
      { label: 'Hardware', sources: ['Hardware físico'] },
      { label: 'Operating Systems', sources: ['Sistemas operativos'] },
      { label: 'Databases', sources: ['Bases de dados (SGBD)'] },
      { label: 'Application Software', sources: ['Software aplicacional'] },
    ];
    const body = document.getElementById('category-distribution-body');
    body.innerHTML = categories.map((category) => {
      const metrics = category.sources.reduce((result, source) => {
        const current = dataset.summary.byCategory[source] || {};
        result.yes += current.obsolete || 0;
        result.atRisk += current.atRisk || 0;
        result.no += current.supported || 0;
        result.unknown += (current.unknown || 0) + (current.internal || 0);
        result.scope += current.total || 0;
        return result;
      }, { scope: 0, yes: 0, atRisk: 0, no: 0, unknown: 0 });
      const formatCategoryMetric = (value, showPercentage = true) => {
        const valueMarkup = `<span class="category-cell-value">${numberFormat(value)}</span>`;
        if (!showPercentage || value === 0) return valueMarkup;
        const share = percent(value, metrics.scope).toLocaleString('pt-PT', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
        return `${valueMarkup}<span class="category-cell-percent">(${share}%)</span>`;
      };
      return `
        <tr>
          <th scope="row">${category.label}</th>
          <td>${formatCategoryMetric(metrics.scope, false)}</td>
          <td class="result-yes">${formatCategoryMetric(metrics.yes)}</td>
          <td class="result-at-risk">${formatCategoryMetric(metrics.atRisk)}</td>
          <td class="result-no">${formatCategoryMetric(metrics.no)}</td>
          <td class="result-no-data">${formatCategoryMetric(metrics.unknown)}</td>
        </tr>
      `;
    }).join('');
  }

  function getFilteredSummary(filteredAssets) {
    const summary = {
      total: filteredAssets.length,
      obsolete: filteredAssets.filter((item) => item.state === 'Yes').length,
      atRisk: filteredAssets.filter((item) => item.state === 'At Risk').length,
      supported: filteredAssets.filter((item) => item.state === 'No').length,
      unknown: filteredAssets.filter((item) => item.state === 'n.d. - No official lifecycle information available').length,
      categories: {},
      environment: {
        Produtivo: { total: 0, obsolete: 0, atRisk: 0, supported: 0, unknown: 0 },
        'Não produtivo': { total: 0, obsolete: 0, atRisk: 0, supported: 0, unknown: 0 },
      },
    };

    Object.keys(CONFIG.subtypeGroups).forEach((category) => {
      const items = filteredAssets.filter((asset) => asset.category === category);
      summary.categories[category] = {
        total: items.length,
        obsolete: items.filter((asset) => asset.state === 'Yes').length,
        atRisk: items.filter((asset) => asset.state === 'At Risk').length,
        supported: items.filter((asset) => asset.state === 'No').length,
        unknown: items.filter((asset) => asset.state === 'n.d. - No official lifecycle information available').length,
      };
    });

    filteredAssets.forEach((item) => {
      if (!hasEnvironment(item.environment)) return;
      const bucket = isProductiveEnvironment(item.environment) ? 'Produtivo' : 'Não produtivo';
      const env = summary.environment[bucket];
      env.total += 1;
      if (item.state === 'Yes') env.obsolete += 1;
      if (item.state === 'At Risk') env.atRisk += 1;
      if (item.state === 'No') env.supported += 1;
      if (item.state === 'n.d. - No official lifecycle information available') env.unknown += 1;
    });
    return summary;
  }

  function numberFormat(value) {
    const num = Number(value);
    if (Number.isNaN(num)) return '0';
    return num.toLocaleString('pt-PT');
  }

  function percent(value, total) {
    if (!total) return 0;
    return (value / total) * 100;
  }

  function buildEnvironmentCategoryData(dataset) {
    const categories = [
      { label: 'Hardware', sources: ['Hardware físico'] },
      { label: 'Operating Systems', sources: ['Sistemas operativos'] },
      { label: 'Databases', sources: ['Bases de dados (SGBD)'] },
      { label: 'Application Software', sources: ['Software aplicacional'] },
    ];
    const outcomes = ['Yes', 'At Risk', 'No', 'n.d. - No official lifecycle information available'];
    const packageVersionsWithoutEnvironment = dataset.summary.includedAssets.filter((asset) =>
      normalizeHeader(asset.subtype) === normalizeHeader('Application Software (Package Version)')
      && !normalizeText(asset.environment)).length;
    const groups = [];
    categories.forEach((category) => {
      const categoryAssets = dataset.summary.includedAssets.filter((asset) =>
        category.sources.includes(asset.category));
      ['Produtivo', 'Não produtivo'].forEach((environment) => {
        const assets = categoryAssets.filter((asset) => {
          if (!hasEnvironment(asset.environment)) return false;
          return (isProductiveEnvironment(asset.environment) ? 'Produtivo' : 'Não produtivo') === environment;
        });
        const counts = outcomes.map((outcome) => assets.filter((asset) => asset.state === outcome).length);
        const classifiedTotal = counts.reduce((sum, count) => sum + count, 0);
        groups.push({
          label: `${category.label} · ${environment}`,
          counts,
          classifiedTotal,
          percentages: counts.map((count) => percent(count, classifiedTotal)),
        });
      });
    });
    return { groups, outcomes, packageVersionsWithoutEnvironment };
  }

  function renderCharts(dataset) {
    const distribution = buildEnvironmentCategoryData(dataset);
    const chartFootnote = document.getElementById('chart-footnote');
    if (distribution.packageVersionsWithoutEnvironment > 0) {
      const count = distribution.packageVersionsWithoutEnvironment;
      const unit = count === 1 ? 'ativo' : 'ativos';
      chartFootnote.textContent =
        `Não se encontra${count === 1 ? '' : 'm'} refletido${count === 1 ? '' : 's'} no gráfico ${numberFormat(count)} ${unit} de software aplicacional (Package Version), por corresponder${count === 1 ? '' : 'em'} a ${count === 1 ? 'uma versão aplicacional' : 'versões aplicacionais'} sem ambiente próprio.`;
      chartFootnote.hidden = false;
    } else {
      chartFootnote.textContent = '';
      chartFootnote.hidden = true;
    }
    const categoryNames = ['Hardware', 'Operating Systems', 'Databases', 'Application Software'];
    const displayNames = {
      Yes: 'Yes',
      'At Risk': 'At Risk',
      No: 'No',
      'n.d. - No official lifecycle information available': 'n.d.',
    };
    const legend = distribution.outcomes.map((outcome, index) => `
      <span class="environment-category-legend-item">
        <i style="--result-color:${CONFIG.chartPalette[index]}" aria-hidden="true"></i>
        ${displayNames[outcome]}
      </span>
    `).join('');
    document.getElementById('environment-category-legend').innerHTML = legend;

    document.getElementById('state-chart').innerHTML = categoryNames.map((category) => {
      const groups = distribution.groups.filter((group) => group.label.startsWith(`${category} · `));
      const categoryTotal = groups.reduce((sum, group) => sum + group.classifiedTotal, 0);
      const categoryAssetLabel = categoryTotal === 1 ? 'ativo no gráfico' : 'ativos no gráfico';
      const environmentRows = groups.map((group) => {
        const environment = group.label.slice(category.length + 3);
        const assetLabel = group.classifiedTotal === 1 ? 'ativo' : 'ativos';
        let cumulativePercentage = 0;
        const percentages = group.percentages.map((value, index) => {
          if (group.counts[index] === 0) return '';
          const centerPosition = cumulativePercentage + value / 2;
          cumulativePercentage += value;
          return `
            <span class="environment-category-percentage" style="--result-color:${CONFIG.chartPalette[index]};left:${centerPosition}%">
              ${value.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%
            </span>
          `;
        }).join('');
        const segments = group.percentages.map((value, index) => `
          <span class="environment-category-segment" style="width:${value}%;--result-color:${CONFIG.chartPalette[index]}"
            title="${displayNames[distribution.outcomes[index]]}: ${numberFormat(group.counts[index])} (${value.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%)"></span>
        `).join('');
        return `
          <div class="environment-category-row">
            <div class="environment-category-row-heading">
              <span>${environment}</span>
              <strong>${numberFormat(group.classifiedTotal)} ${assetLabel}</strong>
            </div>
            ${group.classifiedTotal
                ? `<div class="environment-category-percentages" aria-label="Percentagens: ${group.percentages.map((value, index) => group.counts[index] > 0 ? `${displayNames[distribution.outcomes[index]]} ${value.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%` : '').filter(Boolean).join(', ')}">${percentages}</div>
                <div class="environment-category-bar" role="img" aria-label="${group.label}: ${group.classifiedTotal} ativos">${segments}</div>`
              : '<p class="environment-category-empty">Sem ativos neste ambiente</p>'}
          </div>
        `;
      }).join('');

      return `
        <article class="environment-category-card">
          <header class="environment-category-card-heading">
            <h3>${category}</h3>
            <span>${numberFormat(categoryTotal)} ${categoryAssetLabel}</span>
          </header>
          ${environmentRows}
        </article>
      `;
    }).join('');
  }

  function renderTable(filteredAssets) {
    const tbody = document.getElementById('detail-body');
    if (!tbody) return;

    tbody.innerHTML = filteredAssets.map((asset) => `
      <tr>
        <td>${asset.origin === 'application' ? 'Aplicação' : 'Componente'}</td>
        <td>${asset.category || 'Sem categoria'}</td>
        <td>${asset.subtype || 'Sem subtype'}</td>
        <td>${asset.componentNameStandardized || '-'}</td>
        <td>${asset.componentNameOriginal || '-'}</td>
        <td>${asset.environment || '-'}</td>
        <td>${asset.vendor || '-'}</td>
        <td>${asset.state || '-'}</td>
        <td>${asset.recordCount || 1}</td>
        <td>${asset.applicationCount || asset.applications.length || 0}</td>
        <td>${(asset.conflicts && asset.conflicts.length) ? asset.conflicts.join('; ') : '-'}</td>
      </tr>
    `).join('');
  }

  function issueRowCount(issues, label) {
    return new Set(
      issues
        .filter((issue) => issue.type === label)
        .flatMap((issue) => issue.rows.map((row) => `${row._source || row.origin || 'record'}-${row._sourceRowNumber}`)),
    ).size;
  }

  function renderQualityPanel(dataset) {
    const allIssues = [...dataset.appDataset.qualityIssues, ...dataset.compDataset.qualityIssues];
    const qualityList = [
      { label: 'Component name (Standardized) vazio', value: issueRowCount(allIssues, 'Component name (Standardized) vazio') },
      { label: 'Component name vazio', value: issueRowCount(allIssues, 'Component name vazio') },
      { label: 'Subtype vazio ou não reconhecido', value: issueRowCount(allIssues, 'Subtype vazio') + issueRowCount(allIssues, 'Subtype não reconhecido') },
      { label: 'Vendor vazio', value: issueRowCount(allIssues, 'Vendor vazio') },
      { label: 'Environment vazio', value: issueRowCount(allIssues, 'Environment vazio') },
      { label: 'Lifecycle em falta', value: issueRowCount(allIssues, 'Informação de lifecycle em falta') },
      { label: 'Datas de lifecycle inválidas', value: issueRowCount(allIssues, 'Data de lifecycle inválida') },
      { label: 'Registos com valores contraditórios', value: issueRowCount(allIssues, 'Valores contraditórios em componente associado') },
      { label: 'Linhas em possíveis duplicados', value: issueRowCount(allIssues, 'Possível duplicado na folha de componentes') },
    ];
    const content = document.getElementById('quality-panel');
    if (content) {
      content.innerHTML = qualityList.map((item) => `
        <div class="quality-item">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </div>
      `).join('');
    }
  }

  function renderMethodology(dataset) {
    const methodology = document.getElementById('methodology');
    if (!methodology) return;

    methodology.innerHTML = `
      <p>Os ativos associados a aplicações e os ativos não associados a aplicações correspondem a universos distintos, não existindo sobreposição de ativos entre as duas fontes do inventário. Na folha de inventário de aplicações, os componentes associados a múltiplas aplicações são contabilizados apenas uma vez por combinação de 'Component name (Standardized)' e 'Subtype'. Na folha de inventário de componentes, cada registo válido é contabilizado diretamente como um ativo. Os resultados finais correspondem à soma dos ativos apurados nas duas folhas.</p>
      <p>As aplicações sem componentes são identificadas na folha de aplicações pelo Subtype "n/a" ou pelo marcador "n.a. (application with no components)" nas colunas "Obsolete?" / "Application Obsolete?". O estado da aplicação é apurado separadamente através de "Application Obsolete?".</p>
      <ul>
        <li>Linhas lidas na folha de aplicações: <strong>${numberFormat(dataset.appRowsCount)}</strong></li>
        <li>Linhas lidas na folha de componentes: <strong>${numberFormat(dataset.compRowsCount)}</strong></li>
        <li>Componentes únicos na folha de aplicações, antes da exclusão de Hardware (Virtual): <strong>${numberFormat(dataset.appDataset.uniqueComponentCount)}</strong></li>
        <li>Ativos contabilizados na folha de componentes: <strong>${numberFormat(dataset.compDataset.totalRawRows)}</strong></li>
        <li>Total de ativos carregados após consolidação: <strong>${numberFormat(dataset.summary.counts.totalLoadedAssets)}</strong></li>
        <li>Ativos fora do âmbito (Hardware / Virtual): <strong>${numberFormat(dataset.summary.counts.excludedVirtualAssets)}</strong></li>
        <li>Ativos considerados na análise: <strong>${numberFormat(dataset.summary.counts.assessmentUniverse)}</strong></li>
        <li>Duplicados excluídos da contagem na folha de aplicações: <strong>${numberFormat(dataset.appDataset.duplicatesRemoved.length)}</strong></li>
        <li>Registos excluídos por ausência de Component name (Standardized): <strong>${numberFormat(issueRowCount(dataset.appDataset.qualityIssues, 'Component name (Standardized) vazio'))}</strong></li>
        <li>Total final de ativos: <strong>${numberFormat(dataset.summary.counts.totalAssets)}</strong></li>
      </ul>
      <p>O âmbito da análise inclui todos os ativos consolidados, independentemente do estado, exceto os classificados como "n.a. (virtual machine)" / Hardware (Virtual). Os estados n.d. e n.a. mantêm-se identificados; aplicações sem componentes são contadas separadamente como aplicações, não como ativos.</p>
      <p>Um registo com problema de qualidade é uma linha com pelo menos uma validação sinalizada (por exemplo, nome obrigatório em falta, subtype vazio/não reconhecido, lifecycle indisponível ou data inválida, valores contraditórios ou possível duplicado). Cada linha é contada uma só vez no KPI, mesmo que tenha vários alertas; os registos não são eliminados por esse motivo.</p>
      <p>Os registos originais permanecem disponíveis para consulta, assegurando a rastreabilidade entre os indicadores apresentados e o inventário de origem.</p>
    `;
  }

  function renderDashboard(dataset) {
    renderKpis(dataset);
    renderAssessmentScope(dataset);
    renderCategoryDistribution(dataset);
    renderCharts(dataset);
    renderMetadata(dataset);
    if (window.DashboardAdvanced) window.DashboardAdvanced.render(dataset);
  }

  function renderMetadata(dataset) {
    const meta = document.getElementById('metadata');
    if (!meta) return;
    meta.innerHTML = `
      <div><strong>Ficheiro:</strong> ${dataset.fileName || 'Sem ficheiro'}</div>
      <div><strong>Data:</strong> ${new Date(dataset.generatedAt).toLocaleDateString('pt-PT')}</div>
    `;
  }

  function buildTableFromData(dataset) {
    return dataset.allAssets.map((asset) => ({
      origem: asset.origin === 'application' ? 'Aplicação' : 'Componente',
      categoria: asset.category,
      subtype: asset.subtype,
      component: asset.componentNameStandardized || asset.componentNameOriginal || '-',
      ambiente: asset.environment || '-',
      fornecedor: asset.vendor || '-',
      estado: asset.state,
      ocorrencias: asset.recordCount,
      appCount: asset.applications ? asset.applications.length : 0,
      conflitos: asset.conflicts.join('; ') || '-',
    }));
  }

  function downloadCsv(rows) {
    if (!rows.length) return;
    const headers = ['origem', 'categoria', 'subtype', 'component', 'ambiente', 'fornecedor', 'estado', 'ocorrencias', 'appCount', 'conflitos'];
    const csv = [headers.join(',')]
      .concat(rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(',')))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ativos-filtrados.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function bindUi() {
    const fileInput = document.getElementById('file-input');
    const fileLabel = document.getElementById('file-label');
    const dropZone = document.getElementById('drop-zone');
    const status = document.getElementById('upload-status');
    const removeButton = document.getElementById('remove-file');
    const newFileButton = document.getElementById('new-file');
    const selectedFile = document.getElementById('selected-file');
    const landingView = document.getElementById('landing-view');
    const dashboardView = document.getElementById('dashboard-view');
    const state = {
      dataset: null,
    };

    function resetToLanding() {
      state.dataset = null;
      state.fileName = '';
      fileInput.value = '';
      fileLabel.textContent = '';
      selectedFile.hidden = true;
      status.hidden = true;
      status.classList.remove('error', 'success');
      status.textContent = '';
      dashboardView.hidden = true;
      landingView.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    removeButton.addEventListener('click', resetToLanding);
    newFileButton.addEventListener('click', resetToLanding);
    dropZone.addEventListener('click', (event) => {
      if (event.target !== fileInput) fileInput.click();
    });
    dropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove('is-dragover');
      });
    });

    dropZone.addEventListener('drop', (event) => {
      const file = event.dataTransfer.files[0];
      if (file) loadFile(file);
    });

    fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) loadFile(file);
    });

    function loadFile(file) {
      if (!file) return;
      if (!/\.(xlsx|xls)$/i.test(file.name)) {
        status.textContent = 'Formato não suportado. Selecione um ficheiro .xlsx ou .xls.';
        status.classList.add('error');
        status.hidden = false;
        return;
      }

      fileLabel.textContent = file.name;
      selectedFile.hidden = false;
      const reader = new FileReader();
      status.classList.remove('error', 'success');
      status.hidden = false;
      status.textContent = 'A processar ficheiro localmente...';
      status.setAttribute('aria-busy', 'true');
      reader.onload = (e) => {
        try {
          if (typeof XLSX === 'undefined') {
            throw new Error('Não foi possível carregar as bibliotecas necessárias. Verifique a ligação à Internet e atualize a página.');
          }
          const data = e.target.result;
          const workbook = XLSX.read(data, { type: 'array', cellStyles: true });
          const processed = processWorkbook(workbook);
          processed.fileName = file.name;
          processed.sourceWorkbook = workbook;
          state.dataset = processed;
          state.fileName = file.name;
          landingView.hidden = true;
          dashboardView.hidden = false;
          renderDashboard(processed);
          status.hidden = true;
          status.removeAttribute('aria-busy');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
          dashboardView.hidden = true;
          landingView.hidden = false;
          state.dataset = null;
          status.textContent = error.message;
          status.classList.add('error');
          status.hidden = false;
          status.removeAttribute('aria-busy');
          console.error(error);
        }
      };
      reader.onerror = () => {
        status.textContent = 'Não foi possível ler o ficheiro selecionado. Tente carregá-lo novamente.';
        status.classList.add('error');
        status.removeAttribute('aria-busy');
      };
      reader.readAsArrayBuffer(file);
    }
  }

  function initDashboard() {
    if (typeof document === 'undefined') return;
    bindUi();
    document.getElementById('landing-view').hidden = false;
    document.getElementById('dashboard-view').hidden = true;
  }

  if (typeof document !== 'undefined') {
    window.addEventListener('DOMContentLoaded', initDashboard);
  }

  const api = {
    CONFIG,
    normalizeText,
    normalizeHeader,
    parseDateValue,
    classifySupportState,
    categoryForSubtype,
    processWorkbook,
    buildApplicationDataset,
    buildComponentDataset,
    buildSummary,
    buildEnvironmentCategoryData,
    buildFilterOptions,
    applyFilters,
  };

  if (typeof window !== 'undefined') {
    global.DashboardApp = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
