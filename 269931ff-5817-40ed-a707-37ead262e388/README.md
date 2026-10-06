# Dashboard de Obsolescência de Ativos TIC

Aplicação web em HTML, CSS e JavaScript puro para carregar um ficheiro Excel do inventário de ativos TIC, processar os dados localmente no browser e apresentar um dashboard executivo de obsolescência.

## Funcionalidades principais

- Carregamento de ficheiros Excel (.xlsx e .xls)
- Leitura dinâmica das folhas e colunas por nome
- Limpeza e normalização dos dados
- Deduplicação da folha de aplicações por "Component name (Standardized)" + "Subtype" + "Obsolete?"
- Contagem da folha de componentes por "Component name", sem deduplicação entre registos
- Resumo executivo com destaque para os ativos obsoletos ou em risco, distribuição proporcional dos resultados e reconciliação do universo analisado
- Quatro cartões de classificação em grelha 2 × 2, apresentados separadamente do indicador executivo principal
- Comparação visual em quatro painéis por tipo de ativo, com percentagens por resultado e ambiente produtivo / não produtivo
- Nota dinâmica apenas para ativos `Application Software (Package Version)` sem ambiente próprio
- Tabela compacta de resultados por Hardware, Operating Systems, Databases e Application Software
- Na tabela por categoria, `n.a. (internal application)` é agregado a `n.d. - No official lifecycle information available`
- Identificação de aplicações sem componentes através do subtype e dos marcadores `n.a. (application with no components)` em `Obsolete?` / `Application Obsolete?`
- Universo da análise com todos os ativos únicos, exceto `Hardware (Virtual)`; n.d. e os estados n.a. não são automaticamente removidos
- Separação dos resultados `Yes`, `At Risk`, `No` e `n.d.`; `n.a. (internal application)` continua a ser contado como ativo, enquanto `Subtype = n/a` representa uma aplicação sem componentes
- Apresentação dos ativos carregados, duplicados removidos, `Hardware (Virtual)` excluído e ativos considerados; aplicações sem componentes são contabilizadas separadamente como aplicações
- Casos fora do âmbito apresentados separadamente e sem destaque visual excessivo
- Ecrã inicial dedicado ao carregamento do ficheiro; dashboard executivo apresentado apenas após uma leitura válida
- Identidade visual inspirada na paleta azul e branca apresentada para o Banco Caixa Geral Angola
- Logótipo oficial apresentado pelo utilizador, utilizado como imagem local em `assets/caixa-angola-logo.png`
- Processamento local no navegador, sem envio para servidor

## Execução local

1. Abra uma pasta do projeto e inicie um servidor local:

   ```bash
   python -m http.server 8000
   ```

2. Aceda ao endereço:

   ```text
   http://localhost:8000
   ```

3. Carregue um ficheiro Excel válido com as folhas:
   - `01. Inventário Aplicações`
   - `02. Inventário Componentes`

## Bibliotecas necessárias

A aplicação usa as bibliotecas via CDN por defeito:

- SheetJS / xlsx

Para ambiente sem acesso à Internet, descarregue os ficheiros e guarde-os localmente na mesma pasta do projeto:

- `xlsx.full.min.js`

Depois ajuste os caminhos em `index.html` para apontar para os ficheiros locais.

## Configuração centralizada

Os nomes das folhas, colunas e regras de negócio ficam centralizados em `app.js` dentro do objeto `CONFIG`.

- Nomes das folhas: `CONFIG.sheetNames`
- Colunas obrigatórias: `CONFIG.requiredColumns`
- Mapeamento de categorias: `CONFIG.subtypeGroups`
- Mapeamento de estados: `classifySupportState()` e `applicationStateFromText()`
- Deduplicação de ativos associados e de registos de componentes: `buildApplicationDataset()` e `buildComponentDataset()`
- Regra de não sobreposição entre folhas: `processWorkbook()` e `buildSummary()`
- Deteção de aplicações sem componentes: `isNoComponentsRow()` e `buildApplicationProfiles()`
- Exclusão de `Subtype = Hardware (Virtual)` da avaliação: `isVirtualAsset()` e `buildSummary()`
- Classificação metodológica de lifecycle e universo de cálculo: `classifySupportState()` e `buildSummary()`
- Fluxo entre ecrã inicial e dashboard: `landing-view`, `dashboard-view` e `loadFile()` em `app.js`
- Logótipo do cabeçalho: `assets/caixa-angola-logo.png`

## Testes

Pode validar a lógica com Node:

```bash
node tests.js
```

Os testes cobrem:

- deduplicação da folha de aplicações por `Component name (Standardized)`, `Subtype` e `Obsolete?`
- contagem de cada linha da folha de componentes como um ativo
- deteção de aplicações sem componentes
- exclusão de Hardware (Virtual) dos totais, sem remover esses registos da fonte
- somar ativos das duas fontes de dados sem cruzamento entre folhas
- classificação por categoria e estado
- separação entre `Yes`, `At Risk`, `No`, `n.d.` e cada tipo de `n.a.`, incluindo reconciliação do total carregado com duplicados, hardware virtual e ativos únicos considerados
- separação do estado produtivo vs. não produtivo

## Observações técnicas

- Todo o processamento ocorre no cliente.
- A folha de aplicações deduplica ativos pela combinação fornecida de nome uniformizado, subtype e classificação de obsolescência.
- A folha de componentes não é deduplicada: cada linha representa um ativo não associado a aplicações.
- Não há comparação ou deduplicação entre as duas folhas do inventário.
- Os ativos das duas folhas são adicionados no total final, exceto os registos cujo `Subtype` é `Hardware (Virtual)`.
- As linhas com `Subtype = n/a` / sem componentes não são ativos e ficam fora dos totais de ativos. `Hardware (Virtual)` é contado e apresentado como excluído da avaliação.
- O ficheiro Excel nunca sai do navegador.
