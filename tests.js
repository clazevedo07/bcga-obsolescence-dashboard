const assert = require('assert');
const app = require('./app.js');

const appRows = [
  {
    'Name of application': 'Sistema A',
    'Component name (Standardized)': 'SQL Server 2012',
    Subtype: 'System Software (BD)',
    'Obsolete?': 'Yes',
    'Obsolescence Risk?': 'n/a',
    Environment: 'PRD',
    'Application Obsolete?': 'Yes',
    Vendor: 'Microsoft',
  },
  {
    'Name of application': 'Sistema B',
    'Component name (Standardized)': 'SQL Server 2012',
    Subtype: 'System Software (BD)',
    'Obsolete?': 'No',
    'Obsolescence Risk?': 'n/a',
    Environment: 'PRD',
    'Application Obsolete?': 'No',
    Vendor: 'Microsoft',
  },
  {
    'Name of application': 'Sistema C',
    'Component name (Standardized)': 'Windows Server 2016',
    Subtype: 'System Software (SO)',
    'Obsolete?': 'No',
    'Obsolescence Risk?': 'Yes',
    Environment: 'DEV',
    'Application Obsolete?': 'At Risk',
    Vendor: 'Microsoft',
  },
  {
    'Name of application': 'Sistema D',
    'Component name (Standardized)': '',
    Subtype: 'Application Software',
    'Obsolete?': 'n/a',
    'Obsolescence Risk?': 'n/a',
    Environment: 'PRD',
    'Application Obsolete?': 'n.a. (application with no components)',
    Vendor: 'BCGA',
  },
  {
    'Name of application': 'Sistema E',
    'Component name (Standardized)': '',
    Subtype: 'Application Software',
    'Obsolete?': 'No',
    'Obsolescence Risk?': 'n/a',
    Environment: 'PRD',
    'Application Obsolete?': 'No',
    Vendor: 'BCGA',
  },
  {
    'Name of application': 'Sistema F',
    'Component name (Standardized)': 'VM app host',
    Subtype: 'Hardware (Virtual)',
    'Obsolete?': 'No',
    'Obsolescence Risk?': 'n/a',
    Environment: 'PRD',
    'Application Obsolete?': 'No',
    Vendor: 'VMware',
  },
];

const compRows = [
  {
    SOURCE: 'Lansweeper',
    'Component name': 'Oracle 12c',
    Environment: 'PRD',
    Subtype: 'System Software (BD)',
    Vendor: 'Oracle',
    'Obsolete?': 'No',
    'Obsolescence Risk?': 'n/a',
  },
  {
    SOURCE: 'Lansweeper',
    'Component name': 'Apache Tomcat',
    Environment: 'QLY',
    Subtype: 'Application Software',
    Vendor: 'Apache',
    'Obsolete?': 'No',
    'Obsolescence Risk?': 'n/a',
  },
  {
    SOURCE: 'Lansweeper',
    'Component name': 'Virtual host',
    Environment: 'PRD',
    Subtype: 'Hardware (Virtual)',
    Vendor: 'VMware',
    'Obsolete?': 'No',
    'Obsolescence Risk?': 'n/a',
  },
];
compRows.push({ ...compRows[0] });

const appDataset = app.buildApplicationDataset(appRows);
assert.strictEqual(appDataset.uniqueComponentCount, 5, 'A deduplicação da folha de aplicações falhou');
assert.strictEqual(appDataset.assets[0].state, 'Yes', 'O estado conservador não foi aplicado correctamente');
assert.strictEqual(appDataset.assets.filter((asset) => asset.state === 'At Risk').length, 0, 'Obsolescence Risk? não deve substituir a classificação Obsolete?');
assert.strictEqual(appDataset.qualityIssues.filter((issue) => issue.type === 'Component name (Standardized) vazio').length, 1, 'A qualidade dos dados não reportou ausência de Component name (Standardized)');
assert.strictEqual(appDataset.applications.filter((application) => !application.hasComponents).length, 1, 'A aplicação sem componentes deve ser detetada a partir dos marcadores do inventário');

const compDataset = app.buildComponentDataset(compRows);
assert.strictEqual(compDataset.assets.length, 4, 'Cada linha da folha de componentes representa um ativo');
assert.strictEqual(compDataset.duplicates.length, 0, 'Não se deduplicam registos na folha de componentes');
assert.strictEqual(compDataset.duplicateRowsRemoved, 0, 'A folha de componentes não contribui duplicados removidos');

const summary = app.buildSummary(appDataset, compDataset);
assert.strictEqual(summary.counts.assetsAssociated, 4, 'Os ativos associados a aplicações não estão a ser contabilizados correctamente');
assert.strictEqual(summary.counts.assetsNonAssociated, 3, 'Os ativos não associados a aplicações não foram somados');
assert.strictEqual(summary.counts.totalAssets, 7, 'O total final de ativos não corresponde à soma das duas folhas');
assert.strictEqual(summary.counts.excludedVirtualAssets, 2, 'O Hardware (Virtual) deve ser excluído do total apresentado');
assert.strictEqual(summary.counts.totalLoadedAssets, 9, 'O total carregado deve contar os registos de ativos antes da deduplicação e exclusão de virtuais');
assert.strictEqual(summary.counts.duplicatesRemoved, 0, 'A folha de componentes não tem duplicados a remover e os estados diferentes da aplicação são distintos');
assert.strictEqual(summary.counts.totalLoadedAssets - summary.counts.duplicatesRemoved - summary.counts.excludedVirtualAssets, summary.counts.totalAssets, 'Os totais carregados, removidos e considerados devem reconciliar');
assert.strictEqual(summary.counts.totalAssets, summary.includedAssets.length, 'O total considerado deve coincidir com os ativos únicos retidos');
assert.strictEqual(summary.counts.totalApplications, 6, 'O total de aplicações únicas não corresponde ao esperado');
assert.strictEqual(summary.counts.applicationsWithoutComponents, 1, 'A contagem de aplicações sem componentes não corresponde ao esperado');
assert.strictEqual(summary.byCategory['Bases de dados (SGBD)'].total, 4, 'A categoria de bases de dados não foi consolidada');
assert.strictEqual(summary.byCategory['Software aplicacional'].total, 2, 'A categoria de software aplicacional não foi consolidada');

const filtered = app.applyFilters({ allAssets: [...appDataset.assets, ...compDataset.assets] }, { origin: 'Todos', state: 'Todos', category: 'Todos', search: '' });
assert.strictEqual(filtered.length, 9, 'Os filtros não devem remover registos sem filtros ativos');
const filterOptions = app.buildFilterOptions({ allAssets: [...appDataset.assets, ...compDataset.assets] });
assert.deepStrictEqual(filterOptions.application.slice(1), ['Sistema A', 'Sistema B', 'Sistema C', 'Sistema E', 'Sistema F'], 'As opções do filtro de aplicação devem ser construídas sem erros');
assert.strictEqual(app.parseDateValue('31/12/2026').getFullYear(), 2026, 'Datas portuguesas em texto devem ser interpretadas corretamente');
assert.strictEqual(app.parseDateValue('31/02/2026'), null, 'Datas inválidas devem ser identificadas');

assert.strictEqual(app.classifySupportState('Yes', 'n/a'), 'Yes', 'Yes deve ser preservado como resultado da avaliação');
assert.strictEqual(app.classifySupportState('At Risk', 'n/a'), 'At Risk', 'At Risk deve ser preservado como resultado da avaliação');
assert.strictEqual(app.classifySupportState('No', 'n/a'), 'No', 'No deve ser preservado como resultado da avaliação');
assert.strictEqual(app.classifySupportState('No', 'Yes'), 'No', 'A classificação deve ser lida da coluna Obsolete?');
assert.strictEqual(
  app.classifySupportState('n.d. - No official lifecycle information available', 'n/a'),
  'n.d. - No official lifecycle information available',
  'n.d. deve permanecer separado dos resultados avaliados',
);
assert.strictEqual(app.classifySupportState('n.a. (internal application)', 'n/a'), 'n.a. (internal application)');
assert.strictEqual(app.classifySupportState('n.a. (application with no components)', 'n/a'), 'n.a. (application with no components)');
assert.strictEqual(app.classifySupportState('n.a. (virtual machine)', 'n/a'), 'n.a. (virtual machine)');
assert.strictEqual(app.classifySupportState('n.a.', 'n/a'), 'n.a. (não especificado)', 'n.a. genérico não deve ser agrupado com um caso específico');

const scopeDataset = app.buildComponentDataset([
  { 'Component name': 'Interno', Subtype: 'Application Software', 'Obsolete?': 'n.a. (internal application)', 'Obsolescence Risk?': 'n/a' },
  { 'Component name': 'Interno', Subtype: 'Application Software', 'Obsolete?': 'n.a. (internal application)', 'Obsolescence Risk?': 'n/a' },
  { 'Component name': 'Sem lifecycle', Subtype: 'Application Software', 'Obsolete?': 'n.d. - No official lifecycle information available', 'Obsolescence Risk?': 'n/a' },
  { 'Component name': 'VM', Subtype: 'Hardware (Virtual)', 'Obsolete?': 'n.a. (virtual machine)', 'Obsolescence Risk?': 'n/a' },
  { 'Component name': 'VM marcada', Subtype: 'Application Software', 'Obsolete?': 'n.a. (virtual machine)', 'Obsolescence Risk?': 'n/a' },
  { 'Component name': 'Yes asset', Subtype: 'Application Software', 'Obsolete?': 'Yes', 'Obsolescence Risk?': 'n/a' },
  { 'Component name': 'Risk asset', Subtype: 'Application Software', 'Obsolete?': 'At Risk', 'Obsolescence Risk?': 'n/a' },
  { 'Component name': 'No asset', Subtype: 'Application Software', 'Obsolete?': 'No', 'Obsolescence Risk?': 'n/a' },
]);
const scopeSummary = app.buildSummary({ assets: [], applications: [], qualityIssues: [], duplicatesRemoved: [] }, scopeDataset);
assert.strictEqual(scopeSummary.counts.totalLoadedAssets, 8, 'O total carregado deve incluir os registos duplicados antes da remoção e Hardware (Virtual)');
assert.strictEqual(scopeSummary.counts.duplicatesRemoved, 0, 'A folha de componentes não tem deduplicação por regra');
assert.strictEqual(scopeSummary.counts.assessmentUniverse, 6, 'O universo deve considerar ativos, incluindo n.d. e n.a. internal, menos Hardware (Virtual)');
assert.strictEqual(scopeSummary.counts.unkn, 1, 'n.d. deve ser contado à parte do denominador');
assert.strictEqual(scopeSummary.counts.internalApplications, 2, 'n.a. internal representa ativos e deve permanecer no universo');
assert.strictEqual(scopeSummary.counts.excludedVirtualAssets, 2, 'Todos os ativos marcados como Hardware (Virtual) devem ser excluídos do total');
assert.strictEqual(scopeSummary.counts.totalAssets, 6, 'O total de ativos deve excluir máquinas virtuais');
assert.strictEqual(scopeSummary.counts.assessmentUniverse, scopeSummary.counts.totalLoadedAssets - scopeSummary.counts.duplicatesRemoved - scopeSummary.counts.excludedVirtualAssets, 'Ativos considerados devem corresponder ao total carregado menos duplicados e Hardware (Virtual)');
assert.strictEqual(scopeSummary.counts.totalAssets, scopeSummary.includedAssets.length, 'A reconciliação deve corresponder aos ativos únicos retidos');

const identityRows = [
  { 'Name of application': 'App 1', 'Component name (Standardized)': 'Shared product', Subtype: 'Application Software', 'Obsolete?': 'Yes', Environment: 'PRD' },
  { 'Name of application': 'App 2', 'Component name (Standardized)': 'Shared product', Subtype: 'Application Software', 'Obsolete?': 'Yes', Environment: 'PRD' },
  { 'Name of application': 'App 3', 'Component name (Standardized)': 'Shared product', Subtype: 'Application Software', 'Obsolete?': 'No', Environment: 'DEV' },
  { 'Name of application': 'App 4', 'Component name (Standardized)': 'Shared product', Subtype: 'Application Software', 'Obsolete?': 'At Risk', Environment: '' },
  { 'Name of application': 'App 5', 'Component name (Standardized)': '', Subtype: 'n/a', 'Obsolete?': 'n.a. (application with no components)' },
];
const identityDataset = app.buildApplicationDataset(identityRows);
assert.strictEqual(identityDataset.assets.length, 3, 'Ativos com a mesma chave devem deduplicar, mas estados diferentes permanecem distintos');
assert.strictEqual(identityDataset.duplicatesRemoved.length, 1, 'A cópia com a mesma classificação deve ser removida');
assert.deepStrictEqual(identityDataset.assets.map((asset) => asset.state), ['Yes', 'No', 'At Risk']);
assert.strictEqual(identityDataset.assetRowsLoaded, 4, 'Linhas subtype n/a não são ativos carregados');

const mixedEnvironment = app.buildApplicationDataset([
  { 'Name of application': 'PRD app', 'Component name (Standardized)': 'Shared host', Subtype: 'System Software (SO)', 'Obsolete?': 'Yes', Environment: 'PRD' },
  { 'Name of application': 'DEV app', 'Component name (Standardized)': 'Shared host', Subtype: 'System Software (SO)', 'Obsolete?': 'Yes', Environment: 'DEV' },
]);
assert.strictEqual(mixedEnvironment.assets.length, 1, 'O mesmo ativo/classificação em vários ambientes deve continuar único');
assert.strictEqual(mixedEnvironment.assets[0].environment, 'PRD', 'Em caso de ambientes diferentes, o ativo é associado uma vez ao ambiente produtivo');

const environmentSummary = app.buildSummary(
  identityDataset,
  app.buildComponentDataset([
    { 'Component name': 'Productive', Subtype: 'Application Software', 'Obsolete?': 'Yes', Environment: 'PRD' },
    { 'Component name': 'Nonproductive', Subtype: 'Application Software', 'Obsolete?': 'No', Environment: 'DEV' },
    { 'Component name': 'No environment', Subtype: 'Application Software', 'Obsolete?': 'At Risk', Environment: '' },
    { 'Component name': 'Package without environment', Subtype: 'Application Software (Package Version)', 'Obsolete?': 'No', Environment: 'n.a.(package version)' },
    { 'Component name': 'Package with environment', Subtype: 'Application Software (Package Version)', 'Obsolete?': 'No', Environment: 'PRD' },
  ]),
);
const environmentData = app.buildEnvironmentCategoryData({ summary: environmentSummary });
const appProductive = environmentData.groups.find((group) => group.label === 'Application Software · Produtivo');
const appNonproductive = environmentData.groups.find((group) => group.label === 'Application Software · Não produtivo');
assert.strictEqual(environmentData.groups.length, 8, 'A comparação deve apresentar os dois ambientes para cada um dos quatro tipos de ativo');
assert.strictEqual(appProductive.counts[0], 2, 'A análise de ambiente deve incluir Yes da sheet de aplicações e de componentes');
assert.strictEqual(appNonproductive.counts[2], 2, 'A análise de ambiente deve incluir No da sheet de aplicações e de componentes');
assert.strictEqual(appNonproductive.classifiedTotal, 2, 'Linhas sem ambiente próprio não entram na distribuição por ambiente');
assert.ok(Math.abs(appProductive.percentages.reduce((sum, value) => sum + value, 0) - 100) < 1e-9, 'A composição percentual deve totalizar 100% por ambiente');
assert.strictEqual(environmentData.packageVersionsWithoutEnvironment, 1, 'A nota do gráfico deve contar apenas Package Version sem ambiente próprio');
assert.strictEqual(environmentSummary.byEnvironment['Não produtivo'].total, 2, 'Ativos sem ambiente próprio não devem ser classificados como não produtivos');
const mixedEnvironmentSummary = app.buildSummary(mixedEnvironment, app.buildComponentDataset([]));
const mixedEnvironmentData = app.buildEnvironmentCategoryData({ summary: mixedEnvironmentSummary });
const mixedOperatingSystems = mixedEnvironmentData.groups.filter((group) => group.label.startsWith('Operating Systems'));
assert.strictEqual(mixedOperatingSystems.reduce((sum, group) => sum + group.classifiedTotal, 0), 1, 'Um ativo associado a vários ambientes conta uma só vez na comparação de ambientes');

console.log('Todos os testes passaram.');
